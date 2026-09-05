import { db } from "@/lib/db";
import { handleRoute } from "@/lib/api-helpers";
import { round2 } from "@/lib/money";
import { dayKey, reportRange } from "@/app/api/_lib/engine";

// GET /api/reports/owner-expenses?from=&to=
// Owner money statement — same canonical predicates as /api/expenses/owner-breakdown
// (kind OPERATING|CAPITAL + isCommon) so this report ALWAYS reconciles with the
// Owner Breakdown tab, the Expenses list and every dashboard:
//   - "Operating Spend"   = business expenses the owner paid on behalf of the business
//   - "Deposits (In)"     = OWNER CONTRIBUTION capital rows (money the owner put in)
//   - "Withdrawals (Out)" = OWNER WITHDRAWAL capital rows (money the owner took out)
// Owner capital never inflates "Operating Spend" — that was the old mismatch class.
export const GET = handleRoute(async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const { from, to } = reportRange(sp);

  const [expenses, owners] = await Promise.all([
    db.expense.findMany({
      where: { date: { gte: from, lte: to } },
      select: {
        business: true, amount: true, kind: true, isCommon: true,
        categoryName: true, spentById: true,
      },
    }),
    db.owner.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  interface OwnerAcc {
    operating: number;
    manpower: number;
    transport: number;
    deposits: number;
    withdrawals: number;
  }
  const empty = (): OwnerAcc => ({ operating: 0, manpower: 0, transport: 0, deposits: 0, withdrawals: 0 });

  const byOwner = new Map<string, OwnerAcc>();
  for (const o of owners) byOwner.set(o.id, empty());
  const common = empty();
  const unattributed = empty();

  const addBusinessSplit = (acc: OwnerAcc, business: string, amount: number) => {
    if (business === "MANPOWER") acc.manpower = round2(acc.manpower + amount);
    else if (business === "TRANSPORT") acc.transport = round2(acc.transport + amount);
  };

  for (const e of expenses) {
    const amount = round2(e.amount);
    const acc = e.isCommon ? common : (e.spentById ? byOwner.get(e.spentById) : undefined) ?? unattributed;

    if (e.kind === "OPERATING") {
      acc.operating = round2(acc.operating + amount);
      addBusinessSplit(acc, e.business, amount);
    } else {
      // CAPITAL — classified by the category snapshot stamped at write time.
      // Business split intentionally NOT updated: the Manpower/Transport columns
      // must reconcile with the Operating Spend column (capital is not spend).
      const cat = (e.categoryName ?? "").trim().toUpperCase();
      if (cat === "OWNER CONTRIBUTION") acc.deposits = round2(acc.deposits + amount);
      else acc.withdrawals = round2(acc.withdrawals + amount);
    }
  }

  const rows = [
    ...[...byOwner.entries()].map(([id, r]) => ({
      ownerName: owners.find((o) => o.id === id)?.name ?? "Owner",
      ...r,
      net: round2(r.deposits - r.withdrawals),
    })),
    ...(common.operating > 0 || common.deposits > 0 || common.withdrawals > 0
      ? [{
          ownerName: "Common — all owners",
          ...common,
          net: round2(common.deposits - common.withdrawals),
        }]
      : []),
    ...(unattributed.operating > 0 || unattributed.deposits > 0 || unattributed.withdrawals > 0
      ? [{
          ownerName: "Unattributed (legacy)",
          ...unattributed,
          net: round2(unattributed.deposits - unattributed.withdrawals),
        }]
      : []),
  ].sort((a, b) => b.operating - a.operating || b.deposits - a.deposits);

  const totals = {
    operating: round2(rows.reduce((s, r) => s + r.operating, 0)),
    manpower: round2(rows.reduce((s, r) => s + r.manpower, 0)),
    transport: round2(rows.reduce((s, r) => s + r.transport, 0)),
    deposits: round2(rows.reduce((s, r) => s + r.deposits, 0)),
    withdrawals: round2(rows.reduce((s, r) => s + r.withdrawals, 0)),
    net: round2(rows.reduce((s, r) => s + r.net, 0)),
  };

  return {
    columns: [
      { key: "ownerName", label: "Owner", type: "string" },
      { key: "operating", label: "Operating Spend", type: "currency" },
      { key: "manpower", label: "Manpower", type: "currency" },
      { key: "transport", label: "Transport", type: "currency" },
      { key: "deposits", label: "Deposits (In)", type: "currency" },
      { key: "withdrawals", label: "Withdrawals (Out)", type: "currency" },
      { key: "net", label: "Net Position", type: "currency" },
    ],
    rows,
    totals,
    meta: { from: dayKey(from), to: dayKey(to) },
    note:
      "Operating spend feeds profit. Owner deposits & withdrawals are capital, not expenses — " +
      "Net Position = deposits − withdrawals (negative means the owner needs to deposit again). " +
      "These numbers always match the Expenses → Owner Breakdown tab.",
  };
});
