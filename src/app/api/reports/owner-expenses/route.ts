import { db } from "@/lib/db";
import { handleRoute } from "@/lib/api-helpers";
import { round2 } from "@/lib/money";
import { dayKey, reportRange } from "@/app/api/_lib/engine";

const WITHDRAWAL = "OWNER WITHDRAWAL";
const CONTRIBUTION = "OWNER CONTRIBUTION";

// GET /api/reports/owner-expenses?from=&to=
// Expense totals grouped by the owner who spent, incl. owner withdrawals/contributions.
export const GET = handleRoute(async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const { from, to } = reportRange(sp);

  const expenses = await db.expense.findMany({
    where: { date: { gte: from, lte: to } },
    select: { spentByName: true, business: true, amount: true, categoryName: true },
  });

  const byOwner = new Map<string, { total: number; manpower: number; transport: number; withdrawals: number; contributions: number }>();
  for (const e of expenses) {
    const name = e.spentByName?.trim() || "Unattributed";
    const row = byOwner.get(name) ?? { total: 0, manpower: 0, transport: 0, withdrawals: 0, contributions: 0 };
    const amount = round2(e.amount);
    row.total = round2(row.total + amount);
    if (e.business === "MANPOWER") row.manpower = round2(row.manpower + amount);
    else if (e.business === "TRANSPORT") row.transport = round2(row.transport + amount);
    const cat = (e.categoryName ?? "").toUpperCase();
    if (cat === WITHDRAWAL) row.withdrawals = round2(row.withdrawals + amount);
    if (cat === CONTRIBUTION) row.contributions = round2(row.contributions + amount);
    byOwner.set(name, row);
  }

  const rows = [...byOwner.entries()]
    .map(([ownerName, r]) => ({ ownerName, ...r }))
    .sort((a, b) => b.total - a.total);

  const totals = {
    total: round2(rows.reduce((s, r) => s + r.total, 0)),
    manpower: round2(rows.reduce((s, r) => s + r.manpower, 0)),
    transport: round2(rows.reduce((s, r) => s + r.transport, 0)),
    withdrawals: round2(rows.reduce((s, r) => s + r.withdrawals, 0)),
    contributions: round2(rows.reduce((s, r) => s + r.contributions, 0)),
  };

  return {
    columns: [
      { key: "ownerName", label: "Owner", type: "string" },
      { key: "total", label: "Total Spent", type: "currency" },
      { key: "manpower", label: "Manpower", type: "currency" },
      { key: "transport", label: "Transport", type: "currency" },
      { key: "withdrawals", label: "Withdrawals", type: "currency" },
      { key: "contributions", label: "Contributions", type: "currency" },
    ],
    rows,
    totals,
    meta: { from: dayKey(from), to: dayKey(to) },
  };
});
