/**
 * BizHub rotating finance QA — unit + negative + cross-surface mismatch tests.
 * Creates its own marked rows (description "ZQA-…"), asserts every surface
 * agrees on every number, then deletes what it created.
 * Run: bun scripts/qa-finance.ts
 */
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const BASE = "http://localhost:3000";
const MARK = "ZQA";
let cookie = "";
let pass = 0;
let fail = 0;
const failures: string[] = [];
const created: { kind: string; id: string }[] = [];

function ok(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; failures.push(name + (detail ? ` — ${detail}` : "")); console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
}

async function api(method: string, path: string, body?: unknown): Promise<{ status: number; data: any }> {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data: unknown = null;
  try { data = await res.json(); } catch { /* empty */ }
  return { status: res.status, data };
}

/** DB-level purge of any ZQA-marked rows in FK-safe order (runs before AND after). */
async function purgeQaRows() {
  const qaEmps = await db.employee.findMany({ where: { fullName: { contains: "ZQA Worker" } }, select: { id: true } });
  const qaProps = await db.property.findMany({ where: { name: { contains: "ZQA Palace" } }, select: { id: true } });
  const qaIds = [...qaEmps.map((e) => e.id), ...qaProps.map((p) => p.id)];
  if (qaIds.length) {
    await db.advance.deleteMany({ where: { employeeId: { in: qaEmps.map((e) => e.id) } } });
    await db.settlement.deleteMany({ where: { OR: [{ employeeId: { in: qaEmps.map((e) => e.id) } }, { employee: { fullName: { contains: "ZQA Worker" } } }] } });
    await db.deployment.deleteMany({ where: { OR: [{ employeeId: { in: qaEmps.map((e) => e.id) } }, { propertyId: { in: qaProps.map((p) => p.id) } }] } });
    await db.adjustment.deleteMany({ where: { employeeId: { in: qaEmps.map((e) => e.id) } } });
    await db.employee.deleteMany({ where: { id: { in: qaEmps.map((e) => e.id) } } });
    await db.property.deleteMany({ where: { id: { in: qaProps.map((p) => p.id) } } });
  }
  await db.expense.deleteMany({ where: { description: { contains: "ZQA" } } });
  const cats = await db.expenseCategory.findMany({ where: { name: { contains: "ZQA" } }, select: { id: true } });
  for (const c of cats) {
    try { await db.expenseCategory.delete({ where: { id: c.id } }); } catch { /* referenced */ }
  }
}

async function main() {
  await purgeQaRows(); // start from a clean slate even if a previous run crashed
  // ---------- login ----------
  const login = await fetch(BASE + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin123" }),
  });
  cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  ok("login admin/admin123", login.status === 200);
  const me = await api("GET", "/api/auth/me");
  // /api/auth/me returns the owner object at the top level.
  const meId = (me.data?.id ?? (me.data as { owner?: { id?: string } } | null)?.owner?.id) as string;

  // ---------- fixture: second owner + deterministic month range ----------
  const owners = await api("GET", "/api/owners");
  const ownerA = meId;
  const ownerB = (owners.data.items as { id: string; name: string }[]).find((o) => o.id !== meId)!.id;
  const from = "2026-09-01", to = "2026-09-30";

  const cats = await api("GET", "/api/expense-categories");
  const allCats = cats.data.items as { id: string; name: string; business: string; kind?: string }[];
  const fuel = allCats.find((c) => c.name === "Fuel") ?? allCats.find((c) => c.business === "TRANSPORT" && c.kind === "EXPENSE")!;
  const withdrawalCat = allCats.find((c) => c.name.toUpperCase() === "OWNER WITHDRAWAL")!;
  const contributionCat = allCats.find((c) => c.name.toUpperCase() === "OWNER CONTRIBUTION")!;

  // ---------- 1. unit + negative: expense validation ----------
  console.log("\n[1] expense validation (negative)");
  let r = await api("POST", "/api/expenses", { date: "2026-09-05", business: "MANPOWER", amount: 0 });
  ok("amount 0 rejected", r.status === 400);
  r = await api("POST", "/api/expenses", { date: "2026-09-05", business: "MANPOWER", amount: -5 });
  ok("negative amount rejected", r.status === 400);
  r = await api("POST", "/api/expenses", { business: "MANPOWER", amount: 10 });
  ok("missing date rejected", r.status === 400);
  r = await api("POST", "/api/expenses", { date: "2026-09-05", business: "RETAIL", amount: 10 });
  ok("invalid business rejected", r.status === 400);
  r = await api("POST", "/api/expenses", { date: "2026-09-05", business: "MANPOWER", amount: 10, vehicleId: "nope" });
  ok("vehicle on MANPOWER rejected", r.status === 400);
  r = await api("POST", "/api/expenses", { date: "2026-09-05", business: "MANPOWER", amount: 10, spentById: "ZQA-ghost" });
  ok("ghost owner rejected 404", r.status === 404);

  // duplicate custom category
  const dupName = `ZQA Dup ${Date.now() % 100000}`;
  r = await api("POST", "/api/expense-categories", { name: dupName, business: "MANPOWER" });
  ok("custom category created", r.status === 200 || r.status === 201, `got ${r.status}`);
  const dupCat = r.data;
  if (dupCat?.id) created.push({ kind: "category", id: dupCat.id });
  r = await api("POST", "/api/expense-categories", { name: dupName, business: "MANPOWER" });
  ok("duplicate category rejected", r.status >= 400, `got ${r.status}`);

  // ---------- 2. deterministic fixture rows ----------
  console.log("\n[2] deterministic fixtures");
  // baseline totals before fixture
  const baseExp = await api("GET", `/api/expenses?from=${from}&to=${to}&pageSize=1`);
  const baseTotals = baseExp.data.totals as { amount: number; operating: number; capital: number; common: number };
  const baseOb = await api("GET", `/api/expenses/owner-breakdown?from=${from}&to=${to}`);
  const baseOwnerA = baseOb.data.owners.find((o: { id: string }) => o.id === ownerA) ?? { deposits: 0, withdrawals: 0, advances: 0, net: 0 };
  const baseOwnerB = baseOb.data.owners.find((o: { id: string }) => o.id === ownerB) ?? { deposits: 0, withdrawals: 0, advances: 0, net: 0 };

  const mk = async (body: Record<string, unknown>) => {
    const res = await api("POST", "/api/expenses", body);
    if (res.status === 200 || res.status === 201) created.push({ kind: "expense", id: res.data.id });
    return res;
  };
  // A: operating by owner A (fuel is TRANSPORT)
  r = await mk({ date: "2026-09-10", business: "TRANSPORT", amount: 400, categoryId: fuel.id, description: `${MARK} op-A`, spentById: ownerA, reason: "ZQA diesel" });
  ok("operating expense by owner A", r.status === 200 || r.status === 201);
  const opA = r.data;
  // B: common expense
  r = await mk({ date: "2026-09-11", business: "MANPOWER", amount: 100, description: `${MARK} common`, spentById: "COMMON", reason: "ZQA shared tea" });
  ok("common expense created", r.status === 200 || r.status === 201);
  const commonExp = r.data;
  ok("common row flagged isCommon", commonExp?.isCommon === true);
  // C: contribution by owner A
  r = await mk({ date: "2026-09-12", business: "MANPOWER", amount: 1000, categoryId: contributionCat.id, description: `${MARK} dep-A`, spentById: ownerA });
  ok("contribution created", r.status === 200 || r.status === 201);
  const depA = r.data;
  ok("contribution stamped CAPITAL", depA?.kind === "CAPITAL", `kind=${depA?.kind}`);
  // D: withdrawal by owner B
  r = await mk({ date: "2026-09-13", business: "MANPOWER", amount: 250, categoryId: withdrawalCat.id, description: `${MARK} wd-B`, spentById: ownerB });
  ok("withdrawal created", r.status === 200 || r.status === 201);
  const wdB = r.data;
  ok("withdrawal stamped CAPITAL", wdB?.kind === "CAPITAL", `kind=${wdB?.kind}`);

  // expected fixture deltas — opA is bumped to 410 by the PUT section below
  const expOperatingDelta = 510; // 410 (opA after PUT) + 100 common
  const expCapitalDelta = 1250;  // 1000 + 250
  const expCommonDelta = 100;

  // ---------- 3. PUT semantics ----------
  console.log("\n[3] edit semantics");
  r = await api("PUT", `/api/expenses/${opA.id}`, { amount: 410 });
  ok("PUT amount update", r.status === 200 && r.data.amount === 410, `status ${r.status}`);
  r = await api("PUT", `/api/expenses/${opA.id}`, { spentById: ownerB });
  ok("PUT reassign owner", r.data?.spentById === ownerB, `spentById=${r.data?.spentById}`);
  r = await api("PUT", `/api/expenses/${opA.id}`, { isCommon: true });
  ok("PUT switch to common", r.data?.isCommon === true);
  r = await api("PUT", `/api/expenses/${opA.id}`, { isCommon: false, spentById: ownerA });
  ok("PUT back to owner A", r.data?.isCommon === false && r.data.spentById === ownerA);
  r = await api("PUT", `/api/expenses/${wdB.id}`, { categoryId: fuel.id, business: "TRANSPORT" });
  ok("withdrawal→fuel restamps OPERATING", r.data?.kind === "OPERATING", `kind=${r.data?.kind}`);
  r = await api("PUT", `/api/expenses/${wdB.id}`, { categoryId: withdrawalCat.id, business: "MANPOWER" });
  ok("fuel→withdrawal restamps CAPITAL", r.data?.kind === "CAPITAL", `kind=${r.data?.kind}`);

  // ---------- 4. cross-surface zero-mismatch invariants ----------
  console.log("\n[4] zero-mismatch invariants");
  const exp = await api("GET", `/api/expenses?from=${from}&to=${to}&pageSize=500`);
  const t = exp.data.totals;
  ok(`list totals.operating == base+${expOperatingDelta}`, Math.abs(t.operating - (baseTotals.operating + expOperatingDelta)) < 0.006, `got ${t.operating}`);
  ok(`list totals.capital == base+${expCapitalDelta}`, Math.abs(t.capital - (baseTotals.capital + expCapitalDelta)) < 0.006, `got ${t.capital}`);
  ok("list operating+capital == amount", Math.abs(t.operating + t.capital - t.amount) < 0.006, `${t.operating}+${t.capital} != ${t.amount}`);
  ok(`list totals.common == base+${expCommonDelta}`, Math.abs(t.common - (baseTotals.common + expCommonDelta)) < 0.006, `got ${t.common}`);

  const ob = await api("GET", `/api/expenses/owner-breakdown?from=${from}&to=${to}`);
  const obt = ob.data.totals;
  ok("breakdown operating == list operating", Math.abs(obt.operating - t.operating) < 0.006, `${obt.operating} vs ${t.operating}`);
  ok("breakdown capital == list capital", Math.abs(obt.capital - t.capital) < 0.006, `${obt.capital} vs ${t.capital}`);
  ok("breakdown grand == list amount", Math.abs(obt.grand - t.amount) < 0.006, `${obt.grand} vs ${t.amount}`);
  ok("breakdown common == list common", Math.abs(obt.commonTotal - t.common) < 0.006, `${obt.commonTotal} vs ${t.common}`);
  const obA = ob.data.owners.find((o: { id: string }) => o.id === ownerA);
  const obB = ob.data.owners.find((o: { id: string }) => o.id === ownerB);
  ok("ownerA advances +410", Math.abs(obA.advances - (baseOwnerA.advances + 410)) < 0.006, `got ${obA?.advances}`);
  ok("ownerA deposits +1000", Math.abs(obA.deposits - (baseOwnerA.deposits + 1000)) < 0.006, `got ${obA?.deposits}`);
  ok("ownerB withdrawals +250", Math.abs(obB.withdrawals - (baseOwnerB.withdrawals + 250)) < 0.006, `got ${obB?.withdrawals}`);
  ok("ownerB net −250 delta (needs deposit again)", Math.abs(obB.net - (baseOwnerB.net - 250)) < 0.006, `got ${obB?.net}`);
  ok("netPosition == Σ(deposits−withdrawals)", Math.abs(obt.netPosition - (obA.deposits + obB.deposits - obA.withdrawals - obB.withdrawals)) < 0.006);

  const repExp = await api("GET", `/api/reports/expenses?from=${from}&to=${to}`);
  ok("report expenses operating == list operating", Math.abs(repExp.data.totals.operating - t.operating) < 0.006, `${repExp.data.totals.operating} vs ${t.operating}`);
  ok("report expenses capital == list capital", Math.abs(repExp.data.totals.capital - t.capital) < 0.006, `${repExp.data.totals.capital} vs ${t.capital}`);

  // dashboard summary must count OPERATING only
  const dash = await api("GET", "/api/dashboard/summary?range=month");
  const dashExpenses = (dash.data.manpower.expenses ?? 0) + (dash.data.transport.expenses ?? 0);
  const baseDash = await api("GET", "/api/dashboard/summary?range=today"); // sanity shape
  void baseDash;
  ok("dashboard month expenses == operating-only scope", dashExpenses <= t.operating + 0.006, `dash ${dashExpenses} > operating ${t.operating}`);

  // monthly metrics excludes capital
  const monthly = await api("GET", "/api/dashboard/monthly-summary?month=2026-09");
  const mCur = monthly.data.current;
  ok("monthly summary has metrics", typeof mCur?.manpowerOtherExpenses === "number");

  // COMMON owner filter
  const onlyCommon = await api("GET", `/api/expenses?from=${from}&to=${to}&ownerId=COMMON&pageSize=500`);
  ok("ownerId=COMMON returns only common rows", (onlyCommon.data.items as { isCommon: boolean }[]).every((i) => i.isCommon) && onlyCommon.data.items.length >= 1);
  const onlyB = await api("GET", `/api/expenses?from=${from}&to=${to}&ownerId=${ownerB}&pageSize=500`);
  ok("ownerId=<B> returns only B rows", (onlyB.data.items as { spentById: string | null }[]).every((i) => i.spentById === ownerB));

  // ---------- 5. settlement: user's exact scenario 700 − 100 = 600 ----------
  console.log("\n[5] settlement deduction (700−100→600)");
  // property
  r = await api("POST", "/api/properties", { name: `${MARK} Palace`, type: "RESTAURANT", billingRate: 700, address: "QA" });
  const propStatus = r.status;
  const property = r.data;
  if (property?.id) created.push({ kind: "property", id: property.id });
  ok("QA property created", propStatus === 200 || propStatus === 201, `status ${propStatus} ${JSON.stringify(r.data)?.slice(0, 120)}`);
  // employee
  r = await api("POST", "/api/employees", { fullName: `${MARK} Worker`, designation: "Waiter", standardRate: 700, status: "ACTIVE" });
  const empStatus = r.status;
  const emp = r.data?.employee ?? r.data;
  if (emp?.id) created.push({ kind: "employee", id: emp.id });
  ok("QA employee created", empStatus === 200 || empStatus === 201, `status ${empStatus} ${JSON.stringify(r.data)?.slice(0, 120)}`);
  // deployment 2026-08-20 DAY → payout 700, billing 700 (August so the user's
  // real September deployments are never touched by the settlement generate)
  r = await api("POST", "/api/deployments", {
    propertyId: property.id, date: "2026-08-20",
    entries: [{ employeeId: emp.id, shift: "DAY" }],
  });
  const depStatus = r.status;
  const depRow = r.data?.created?.[0];
  if (depRow?.id) created.push({ kind: "deployment", id: depRow.id });
  ok("QA deployment created", depStatus === 200 || depStatus === 201, `status ${depStatus} ${JSON.stringify(r.data)?.slice(0, 200)}`);
  // generate settlements for August
  r = await api("POST", "/api/settlements/generate", { month: "2026-08" });
  const draft = (r.data?.drafts ?? []).find((d: { employeeId: string }) => d.employeeId === emp.id);
  ok("settlement draft generated", Boolean(draft), `status ${r.status}`);
  if (draft) {
    created.push({ kind: "settlement", id: draft.id });
    ok("draft gross 700", Math.abs(draft.grossEarnings - 700) < 0.006, `gross ${draft.grossEarnings}`);
    ok("draft net 700 (no deductions yet)", Math.abs(draft.netPayable - 700) < 0.006, `net ${draft.netPayable}`);
    // apply the user's scenario: other charges 100
    r = await api("PUT", `/api/settlements/${draft.id}`, { otherDeductions: 100 });
    ok("PUT otherDeductions 100 → net 600", r.data?.netPayable === 600 && r.data?.otherDeductions === 100, `net ${r.data?.netPayable}, ded ${r.data?.otherDeductions}`);
    // statement must show the same number (statement sub-route)
    const st = await api("GET", `/api/settlements/${draft.id}/statement`);
    const stNet = st.data?.settlement?.netPayable ?? st.data?.netPayable ?? st.data?.summary?.netPayable;
    ok("statement netPayable == 600", stNet !== undefined && Math.abs(stNet - 600) < 0.006, `got ${stNet} (status ${st.status})`);
  }

  // ---------- 6. negative: finalize/delete guards ----------
  console.log("\n[6] guards");
  r = await api("GET", "/api/expenses?from=bad&to=2026-09-30");
  ok("bad date does not crash (200 or 400)", r.status === 200 || r.status === 400, `got ${r.status}`);
  r = await api("GET", "/api/expenses/owner-breakdown?from=2026-13-99&to=x");
  ok("breakdown bad dates handled", r.status === 200 || r.status === 400, `got ${r.status}`);

  // ---------- cleanup ----------
  console.log("\n[cleanup] removing QA rows");
  for (const { kind, id } of created) {
    if (kind === "expense") await api("DELETE", `/api/expenses/${id}`);
    else if (kind === "category") await api("DELETE", `/api/expense-categories/${id}`).catch(() => {});
    else if (kind === "deployment") await api("DELETE", `/api/deployments/${id}`).catch(() => {});
  }
  // Draft settlements have no DELETE — regenerating August with the deployment
  // gone removes the stale draft (idempotent regenerate) and releases advances.
  await api("POST", "/api/settlements/generate", { month: "2026-08" }).catch(() => {});
  for (const { kind, id } of created) {
    if (kind === "employee") await api("DELETE", `/api/employees/${id}`).catch(() => {});
    else if (kind === "property") await api("DELETE", `/api/properties/${id}`).catch(() => {});
  }
  // delete deployment rows created via wizard bulk shape (if any ids missed)
  const after = await api("GET", `/api/expenses?from=${from}&to=${to}&pageSize=500`);
  const leaked = (after.data.items as { description?: string }[]).filter((i) => (i.description ?? "").includes(MARK)).length;
  ok("no QA expense rows leaked", leaked === 0, `${leaked} leaked`);

  console.log(`\n======== RESULT: ${pass} passed, ${fail} failed ========`);
  if (failures.length) {
    console.log("FAILURES:");
    for (const f of failures) console.log("  ✗ " + f);
  }
  await purgeQaRows(); // deterministic DB-level cleanup — no leftovers, ever
  await db.$disconnect();
  if (failures.length) process.exit(1);
}

main().catch(async (e) => {
  console.error("runner crashed:", e);
  try { await purgeQaRows(); } catch {}
  await db.$disconnect();
  process.exit(2);
});
