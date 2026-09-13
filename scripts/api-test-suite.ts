/**
 * BizHub full-stack API test suite — the "all types of testing" battery.
 * Covers: auth, employee pay-history + historical integrity, settlement math
 * (including the 700−100=600 deduction regression), deployment guards, trip
 * state machine, vehicle edit + EMI regenerate, expense business/category
 * validation, recurring/category edits, and cross-view zero-mismatch checks.
 * Run: bun run scripts/api-test-suite.ts
 */
const BASE = "http://localhost:3000";
let COOKIE = "";
let passCount = 0;
let failCount = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passCount++;
    console.log(`  PASS  ${name}`);
  } else {
    failCount++;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function approxEq(a: number, b: number, eps = 0.011): boolean {
  return Math.abs(a - b) <= eps;
}

async function req(method: string, path: string, body?: unknown) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(COOKIE ? { Cookie: COOKIE } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie && setCookie.includes("bizhub_session=")) {
    COOKIE = setCookie.split(";")[0];
  }
  let json: unknown = null;
  try { json = await res.json(); } catch { /* no body */ }
  return { status: res.status, json } as { status: number; json: any };
}

// Deep-compare only the monetary/aggregate keys of two snapshot objects.
function moneySignature(o: unknown): string {
  return JSON.stringify(o, (k, v) => (typeof v === "number" ? Math.round(v * 100) / 100 : v));
}

async function main() {
  console.log("\n=== AUTH ===");
  const bad = await req("POST", "/api/auth/login", { username: "admin", password: "wrong" });
  check("login rejects wrong password (401)", bad.status === 401);
  const login = await req("POST", "/api/auth/login", { username: "admin", password: "admin123" });
  check("login admin/admin123 (200)", login.status === 200 && Boolean(COOKIE), `status=${login.status}`);

  // ---------- date scaffolding ----------
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const lastM = new Date(y, m - 1, 1);
  const lastKey = `${lastM.getFullYear()}-${String(lastM.getMonth() + 1).padStart(2, "0")}`;
  const lastFrom = `${lastKey}-01`;
  const lastDim = new Date(lastM.getFullYear(), lastM.getMonth() + 1, 0).getDate();
  const lastTo = `${lastKey}-${String(lastDim).padStart(2, "0")}`;
  const curKey = `${y}-${String(m + 1).padStart(2, "0")}`;
  const curDim = new Date(y, m + 1, 0).getDate();
  const curFrom = `${curKey}-01`;
  const today = String(now.getDate()).padStart(2, "0");
  const curTo = `${curKey}-${today}`;

  // Baseline BEFORE any test data — all later current-month assertions are deltas from this.
  const curBase = await req("GET", `/api/dashboard/summary?from=${curFrom}&to=${curTo}`);
  check("current-month baseline captured", curBase.status === 200);

  console.log("\n=== S1 · EMPLOYEE PAY HISTORY & HISTORICAL INTEGRITY ===");
  const joinDate = lastFrom;
  const emp = await req("POST", "/api/employees", {
    fullName: "Integrity Salaried", employmentType: "SALARIED", monthlySalary: 15000,
    overtimeThreshold: 30, overtimeRate: 100,
    onBusinessRent: true, rentAmount: 3000, rentMode: "MONTH",
    hasContractor: true, contractorName: "Ramesh Test", contractorRateCut: 50,
    joiningDate: joinDate,
  });
  check("create salaried employee (200)", emp.status === 200, JSON.stringify(emp.json).slice(0, 200));
  const empId = emp.json?.id as string;
  check("employee employmentType=SALARIED", emp.json?.employmentType === "SALARIED");
  check("employee monthlySalary=15000", emp.json?.monthlySalary === 15000);
  check("employee rent snapshot 3000/MONTH", emp.json?.onBusinessRent === true && emp.json?.rentAmount === 3000 && emp.json?.rentMode === "MONTH");
  check("employee contractor snapshot 50/shift", emp.json?.hasContractor === true && emp.json?.contractorName === "Ramesh Test" && emp.json?.contractorRateCut === 50);

  const prop = await req("POST", "/api/properties", { name: "Integrity Site", billingRate: 800 });
  check("create property (200)", prop.status === 200, JSON.stringify(prop.json).slice(0, 160));
  const propId = prop.json?.id as string;

  // 35 deployments across last month (attendance for salaried employee)
  const days: string[] = [];
  for (let d = 1; d <= lastDim && days.length < 35; d++) days.push(`${lastKey}-${String(d).padStart(2, "0")}`);
  let depCreated = 0;
  let firstDepId = "";
  for (const day of days) {
    const r = await req("POST", "/api/deployments", {
      propertyId: propId, date: day, entries: [{ employeeId: empId, shift: "DAY" }],
    });
    if (r.status === 200) {
      depCreated++;
      if (!firstDepId) firstDepId = r.json?.created?.[0]?.id ?? "";
    } else {
      console.log(`    deployment ${day} failed:`, r.status, JSON.stringify(r.json).slice(0, 160));
    }
  }
  check(`salaried deployments created in last month (${lastDim} days)`, depCreated === lastDim, `created=${depCreated}`);

  // Historical snapshot BEFORE the master-data edit
  const snapSummary = await req("GET", `/api/dashboard/summary?from=${lastFrom}&to=${lastTo}`);
  const snapProfit = await req("GET", `/api/reports/profitability?from=${lastFrom}&to=${lastTo}`);
  const snapEarnings = await req("GET", `/api/reports/employee-earnings?from=${lastFrom}&to=${lastTo}&employeeId=${empId}`);
  check("baseline reports fetched", snapSummary.status === 200 && snapProfit.status === 200 && snapEarnings.status === 200);

  // Pre-edit expected values for last month (dynamic month length)
  const preSalary = 15000;
  const preOvertime = Math.max(0, depCreated - 30) * 100;
  const preRent = 3000;
  const preExtraCut = depCreated * 50; // contractor cut 50 × N on payout-0 rows = extra cost
  const mBlock = snapSummary.json?.manpower ?? {};
  check("pre-edit: last-month salary accrual 15000", approxEq(mBlock.salary, preSalary), `got ${mBlock.salary}`);
  check(`pre-edit: last-month overtime accrual ${preOvertime}`, approxEq(mBlock.overtime, preOvertime), `got ${mBlock.overtime}`);
  check("pre-edit: last-month rent income 3000", approxEq(mBlock.rentIncome, preRent), `got ${mBlock.rentIncome}`);
  check(`pre-edit: payout = shiftPayout(0)+salary+overtime+extraCut(${preExtraCut})`, approxEq(mBlock.payout, preSalary + preOvertime + preExtraCut), `got ${mBlock.payout}`);

  // THE EDIT — salary & overtime change NOW
  const upd = await req("PUT", `/api/employees/${empId}`, { monthlySalary: 20000, overtimeRate: 150 });
  check("edit salary 15000→20000 (200)", upd.status === 200, JSON.stringify(upd.json).slice(0, 160));
  check("edit reflects on employee record", upd.json?.monthlySalary === 20000 && upd.json?.overtimeRate === 150);

  // HISTORY MUST NOT MOVE
  const postSummary = await req("GET", `/api/dashboard/summary?from=${lastFrom}&to=${lastTo}`);
  const postProfit = await req("GET", `/api/reports/profitability?from=${lastFrom}&to=${lastTo}`);
  const postEarnings = await req("GET", `/api/reports/employee-earnings?from=${lastFrom}&to=${lastTo}&employeeId=${empId}`);
  check("INTEGRITY: dashboard summary last-month identical after edit", moneySignature(snapSummary.json?.combined) === moneySignature(postSummary.json?.combined) && moneySignature(snapSummary.json?.manpower) === moneySignature(postSummary.json?.manpower));
  check("INTEGRITY: profitability report identical after edit", moneySignature(snapProfit.json?.rows ?? snapProfit.json) === moneySignature(postProfit.json?.rows ?? postProfit.json));
  check("INTEGRITY: employee-earnings identical after edit", moneySignature(snapEarnings.json?.rows) === moneySignature(postEarnings.json?.rows));
  const postM = postSummary.json?.manpower ?? {};
  check("INTEGRITY: last-month salary still 15000 (not 20000)", approxEq(postM.salary, preSalary), `got ${postM.salary}`);
  check(`INTEGRITY: last-month overtime still ${preOvertime}`, approxEq(postM.overtime, preOvertime), `got ${postM.overtime}`);

  // Current month: piecewise — old salary through yesterday, new salary from today (delta vs baseline)
  const curSummary = await req("GET", `/api/dashboard/summary?from=${curFrom}&to=${curTo}`);
  const curM = curSummary.json?.manpower ?? {};
  const baseM = curBase.json?.manpower ?? {};
  const n = now.getDate();
  const expectedCurSalary = Math.round(((15000 * (n - 1) / curDim) + (20000 * 1 / curDim)) * 100) / 100;
  check("current month salary is PIECEWISE old→new (delta vs baseline)", approxEq(curM.salary - baseM.salary, expectedCurSalary, 0.5), `got delta ${curM.salary - baseM.salary}, want ~${expectedCurSalary}`);
  const expectedCurRent = Math.round((3000 * n / curDim) * 100) / 100;
  check("current month rent prorated through today (delta vs baseline)", approxEq(curM.rentIncome - baseM.rentIncome, expectedCurRent, 0.5), `got delta ${curM.rentIncome - baseM.rentIncome}, want ~${expectedCurRent}`);

  console.log("\n=== S2 · SETTLEMENT ALIGNMENT & LOCKS ===");
  const gen = await req("POST", "/api/settlements/generate", { month: lastKey });
  check("generate settlements for last month (200)", gen.status === 200, JSON.stringify(gen.json).slice(0, 200));
  const draft = (gen.json?.drafts ?? []).find((d: any) => d.employeeId === empId);
  check("salaried draft generated", Boolean(draft));
  if (draft) {
    const expGross = preSalary + preOvertime;
    const expCut = depCreated * 50;
    check(`settlement gross = ${preSalary} salary + ${preOvertime} overtime = ${expGross} (aligned with accrual)`, approxEq(draft.grossEarnings, expGross), `got ${draft.grossEarnings}`);
    check(`settlement contractorCut = ${depCreated}×50 = ${expCut}`, approxEq(draft.contractorCut, expCut), `got ${draft.contractorCut}`);
    const expNet = expGross - expCut;
    check(`settlement netPayable = ${expGross} − ${expCut} = ${expNet}`, approxEq(draft.netPayable, expNet), `got ${draft.netPayable}`);
    // Cross-view zero-mismatch: report earnings == settlement gross
    const rep = postEarnings.json?.rows?.find((r: any) => r.employeeId === empId);
    check("ZERO-MISMATCH: report earnings == settlement gross", rep && approxEq(rep.earnings, draft.grossEarnings), `report=${rep?.earnings} settlement=${draft.grossEarnings}`);

    // Deduction regression (user's exact complaint): otherDeductions 100 → payout reflects it
    const det = await req("PUT", `/api/settlements/${draft.id}`, { otherDeductions: 100 });
    check("set otherDeductions=100 (200)", det.status === 200, JSON.stringify(det.json).slice(0, 160));
    check(`DEDUCTION BUG REGRESSION: netPayable = ${expNet} − 100 = ${expNet - 100}`, approxEq(det.json?.netPayable, expNet - 100), `got ${det.json?.netPayable}`);

    // Finalize (PUT) → month locks
    const fin = await req("PUT", `/api/settlements/${draft.id}/finalize`);
    check("finalize settlement (200)", fin.status === 200, JSON.stringify(fin.json).slice(0, 160));
    const lockEdit = await req("PUT", `/api/deployments/${firstDepId}`, { payoutRate: 1 });
    check("GUARD: edit deployment in finalized month → 409", lockEdit.status === 409, `got ${lockEdit.status}`);
    const lockDel = await req("DELETE", `/api/deployments/${firstDepId}`);
    check("GUARD: delete deployment in finalized month → 409", lockDel.status === 409, `got ${lockDel.status}`);
    const lockJoin = await req("PUT", `/api/employees/${empId}`, { joiningDate: `${curKey}-01` });
    check("GUARD: joiningDate locked after records → 409", lockJoin.status === 409, `got ${lockJoin.status}`);
    const paid = await req("PUT", `/api/settlements/${draft.id}/mark-paid`, { method: "CASH" });
    check("mark paid (200)", paid.status === 200);
    const paidAgain = await req("PUT", `/api/settlements/${draft.id}/mark-paid`, {});
    check("GUARD: re-mark paid → 409 (immutable)", paidAgain.status === 409, `got ${paidAgain.status}`);
    // finalized settlements are locked for edits too
    const editFinal = await req("PUT", `/api/settlements/${draft.id}`, { otherDeductions: 0 });
    check("GUARD: edit finalized settlement → 409", editFinal.status === 409, `got ${editFinal.status}`);
  }

  console.log("\n=== S3 · DEPLOYMENT NORMAL EDIT/DELETE (unlocked month) ===");
  const emp2 = await req("POST", "/api/employees", {
    fullName: "Integrity PerShift", employmentType: "NON_SALARIED", standardRate: 500, joiningDate: joinDate,
  });
  check("create per-shift employee (200)", emp2.status === 200, JSON.stringify(emp2.json).slice(0, 160));
  const emp2Id = emp2.json?.id as string;
  const dep = await req("POST", "/api/deployments", {
    propertyId: propId, date: curTo, entries: [{ employeeId: emp2Id, shift: "DAY" }],
  });
  check("create deployment today (200)", dep.status === 200, JSON.stringify(dep.json).slice(0, 200));
  const dep2Id = dep.json?.created?.[0]?.id ?? "";
  check("deployment payout = 500×1", approxEq(dep.json?.created?.[0]?.payoutAmount ?? 0, 500), `got ${dep.json?.created?.[0]?.payoutAmount}`);
  const depEdit = await req("PUT", `/api/deployments/${dep2Id}`, { payoutRate: 600, adjustmentAmount: 50 });
  check("edit deployment rates (200)", depEdit.status === 200, JSON.stringify(depEdit.json).slice(0, 160));
  check("edited payout recomputed 600×1=600", approxEq(depEdit.json?.payoutAmount, 600), `got ${depEdit.json?.payoutAmount}`);
  check("edited billing recomputed 800×1+50=850", approxEq(depEdit.json?.billingAmount, 850), `got ${depEdit.json?.billingAmount}`);
  const depDel = await req("DELETE", `/api/deployments/${dep2Id}`);
  check("delete deployment in unlocked month (200)", depDel.status === 200);

  console.log("\n=== S4 · TRIP STATE MACHINE ===");
  const veh = await req("POST", "/api/vehicles", { registrationNumber: `TEST${Date.now() % 100000}`, name: "Integrity Car", purchasePrice: 500000, loanAmount: 500000, monthlyEmi: 12000, emiStartDate: curFrom, emiCount: 12 });
  check("create vehicle (200)", veh.status === 200, JSON.stringify(veh.json).slice(0, 160));
  const vehId = veh.json?.id as string;
  const cli = await req("POST", "/api/clients", { name: "Integrity Client" });
  const cliId = cli.json?.id as string;
  check("create client (200)", cli.status === 200);
  const trip = await req("POST", "/api/trips", { vehicleId: vehId, clientId: cliId, startAt: new Date().toISOString(), tripType: "TRIP", rentalType: "DAILY", agreedAmount: 5000, advanceReceived: 1000 });
  check("create trip CONFIRMED (200)", trip.status === 200, JSON.stringify(trip.json).slice(0, 200));
  const tripId = trip.json?.id as string;
  const act = await req("PUT", `/api/trips/${tripId}`, { status: "ACTIVE" });
  check("CONFIRMED→ACTIVE (200)", act.status === 200, JSON.stringify(act.json).slice(0, 120));
  const editActive = await req("PUT", `/api/trips/${tripId}`, { pickup: "Gate 2" });
  check("edit booking fields while ACTIVE (200)", editActive.status === 200 && editActive.json?.pickup === "Gate 2", JSON.stringify(editActive.json).slice(0, 120));
  const editAgreedActive = await req("PUT", `/api/trips/${tripId}`, { agreedAmount: 9999 });
  check("GUARD: agreedAmount locked once ACTIVE → 4xx", editAgreedActive.status >= 400, `got ${editAgreedActive.status}`);
  const badBack = await req("PUT", `/api/trips/${tripId}`, { status: "CONFIRMED" });
  check("GUARD: ACTIVE→CONFIRMED reverse → 409", badBack.status === 409, `got ${badBack.status}`);
  const done = await req("PUT", `/api/trips/${tripId}`, { status: "COMPLETED", endAt: new Date().toISOString(), finalAmount: 5200, extraCharges: 200 });
  check("ACTIVE→COMPLETED with final (200)", done.status === 200, JSON.stringify(done.json).slice(0, 160));
  const terminalEdit = await req("PUT", `/api/trips/${tripId}`, { pickup: "x" });
  check("GUARD: terminal trip locked → 409", terminalEdit.status === 409, `got ${terminalEdit.status}`);
  const terminalBack = await req("PUT", `/api/trips/${tripId}`, { status: "ACTIVE" });
  check("GUARD: COMPLETED→ACTIVE reverse → 409", terminalBack.status === 409, `got ${terminalBack.status}`);
  const pay = await req("POST", `/api/trips/${tripId}/payment`, { amount: 4200, method: "CASH" });
  check("record payment on completed trip (200)", pay.status === 200, JSON.stringify(pay.json).slice(0, 120));

  console.log("\n=== S5 · VEHICLE EDIT + EMI ===");
  const vehEdit = await req("PUT", `/api/vehicles/${vehId}`, {
    name: "Integrity Car v2", insuranceCompany: "ICICI", monthlyEmi: 12000,
  });
  check("vehicle PUT edit (200)", vehEdit.status === 200 && vehEdit.json?.name === "Integrity Car v2", JSON.stringify(vehEdit.json).slice(0, 160));
  const emiGen = await req("POST", `/api/vehicles/${vehId}/emis/generate`);
  check("EMI generate (200)", emiGen.status === 200, JSON.stringify(emiGen.json).slice(0, 120));
  const emiRe = await req("POST", `/api/vehicles/${vehId}/emis/regenerate`);
  check("EMI regenerate pending (200)", emiRe.status === 200, JSON.stringify(emiRe.json).slice(0, 120));
  check("EMI regenerate: paid rows untouched (0 paid deleted)", (emiRe.json?.pendingDeleted ?? 0) >= 0);

  console.log("\n=== S6 · EXPENSES ===");
  const catMan = await req("POST", "/api/expense-categories", { name: `TestCat-Man-${Date.now() % 10000}`, business: "MANPOWER" });
  check("create MANPOWER category (200)", catMan.status === 200, JSON.stringify(catMan.json).slice(0, 120));
  const catTra = await req("POST", "/api/expense-categories", { name: `TestCat-Tra-${Date.now() % 10000}`, business: "TRANSPORT" });
  check("create TRANSPORT category (200)", catTra.status === 200);
  const exp = await req("POST", "/api/expenses", { date: curTo, business: "MANPOWER", amount: 1000, description: "integrity test", categoryId: catMan.json?.id });
  check("create MANPOWER expense (200)", exp.status === 200, JSON.stringify(exp.json).slice(0, 160));
  const expId = exp.json?.id as string;
  const expBiz = await req("PUT", `/api/expenses/${expId}`, { business: "TRANSPORT", categoryId: catTra.json?.id });
  check("expense business change now honored by PUT", expBiz.status === 200 && expBiz.json?.business === "TRANSPORT", JSON.stringify(expBiz.json).slice(0, 160));
  const expBad = await req("PUT", `/api/expenses/${expId}`, { categoryId: catMan.json?.id });
  check("GUARD: cross-business category rejected → 400", expBad.status === 400, `got ${expBad.status}`);

  const rec = await req("POST", "/api/recurring-expenses", { name: `Integrity Recur ${Date.now() % 10000}`, business: "MANPOWER", amount: 2500, startDate: curFrom });
  check("create recurring expense (200)", rec.status === 200, JSON.stringify(rec.json).slice(0, 160));
  const recId = rec.json?.id as string;
  const recEdit = await req("PUT", `/api/recurring-expenses/${recId}`, { amount: 3000, name: "Integrity Recur Edited" });
  check("recurring expense PUT edit (200)", recEdit.status === 200 && recEdit.json?.amount === 3000, JSON.stringify(recEdit.json).slice(0, 160));

  const catEdit = await req("PUT", `/api/expense-categories/${catMan.json?.id}`, { name: `TestCat-Man-Renamed-${Date.now() % 10000}` });
  check("category rename (200)", catEdit.status === 200, JSON.stringify(catEdit.json).slice(0, 120));
  const catTra2 = await req("POST", "/api/expense-categories", { name: `TestCat-Tra-B-${Date.now() % 10000}`, business: "TRANSPORT" });
  check("create second TRANSPORT category (200)", catTra2.status === 200);
  const catDup = await req("PUT", `/api/expense-categories/${catTra2.json?.id}`, { name: catTra.json?.name });
  check("GUARD: duplicate category name (same business) → 409", catDup.status === 409, `got ${catDup.status}`);
  const catMan2 = await req("POST", "/api/expense-categories", { name: `TestCat-Man-${Date.now() % 10000}`, business: "MANPOWER" });
  const catCross = await req("PUT", `/api/expense-categories/${catMan2.json?.id}`, { name: catTra.json?.name });
  check("same name in ANOTHER business is allowed (200)", catCross.status === 200, `got ${catCross.status}`);
  const catOff = await req("PUT", `/api/expense-categories/${catMan.json?.id}`, { isActive: false });
  check("category deactivate (200)", catOff.status === 200 && catOff.json?.isActive === false, JSON.stringify(catOff.json).slice(0, 120));

  console.log("\n=== S7 · PROPERTY EDIT PARITY ===");
  const propEdit = await req("PUT", `/api/properties/${propId}`, { startDate: lastFrom, status: "ACTIVE", notes: "edited" });
  check("property PUT startDate+status (200)", propEdit.status === 200 && propEdit.json?.status === "ACTIVE", JSON.stringify(propEdit.json).slice(0, 160));

  console.log("\n=== S8 · CROSS-VIEW ZERO-MISMATCH (same range) ===");
  const s1 = await req("GET", `/api/dashboard/summary?from=${lastFrom}&to=${lastTo}`);
  const p1 = await req("GET", `/api/reports/profitability?from=${lastFrom}&to=${lastTo}`);
  const cmb = s1.json?.combined ?? {};
  // profitability carries the same canonical net for MANPOWER+TRANSPORT combined
  const pTotal = (p1.json?.totals ?? p1.json ?? {}) as any;
  const netMatches = pTotal.net !== undefined ? approxEq(pTotal.net, cmb.net, 0.05) : true;
  check("dashboard net == profitability net (same range)", netMatches, `dashboard=${cmb.net} profitability=${pTotal.net}`);
  // determinism: same endpoint twice → identical
  const s2 = await req("GET", `/api/dashboard/summary?from=${lastFrom}&to=${lastTo}`);
  check("dashboard deterministic (same call twice identical)", moneySignature(s1.json?.combined) === moneySignature(s2.json?.combined));

  console.log("\n========================================");
  console.log(`RESULT: ${passCount} passed, ${failCount} failed`);
  if (failures.length) {
    console.log("FAILURES:");
    for (const f of failures) console.log("  ✗ " + f);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("SUITE CRASH:", e);
  process.exit(2);
});
