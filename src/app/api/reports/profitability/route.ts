import { db } from "@/lib/db";
import { handleRoute } from "@/lib/api-helpers";
import { round2 } from "@/lib/money";
import { BUSINESSES, dayKey, reportRange, tripTarget } from "@/app/api/_lib/engine";

// GET /api/reports/profitability?from=&to=&business=
// MANPOWER: billing = deployments billing, payout = deployment payouts, other = MANPOWER expenses.
// TRANSPORT: billing = agreed trip revenue (finalAmount ?? agreedAmount + extraCharges), payout = 0, other = TRANSPORT expenses.
export const GET = handleRoute(async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const { from, to } = reportRange(sp);
  const businessFilter = sp.get("business")?.toUpperCase();
  const businesses = (
    businessFilter && BUSINESSES.includes(businessFilter as (typeof BUSINESSES)[number]) ? [businessFilter] : [...BUSINESSES]
  ) as ("MANPOWER" | "TRANSPORT")[];

  const needManpower = businesses.includes("MANPOWER");
  const needTransport = businesses.includes("TRANSPORT");

  const [depAgg, mpExpAgg, trips, trExpAgg] = await Promise.all([
    needManpower
      ? db.deployment.aggregate({
          where: { date: { gte: from, lte: to } },
          _sum: { billingAmount: true, payoutAmount: true },
        })
      : Promise.resolve(null),
    needManpower
      ? db.expense.aggregate({ where: { business: "MANPOWER", date: { gte: from, lte: to } }, _sum: { amount: true } })
      : Promise.resolve(null),
    needTransport
      ? db.trip.findMany({
          where: { startAt: { gte: from, lte: to }, status: { not: "CANCELLED" } },
          select: { finalAmount: true, agreedAmount: true, extraCharges: true },
        })
      : Promise.resolve([]),
    needTransport
      ? db.expense.aggregate({ where: { business: "TRANSPORT", date: { gte: from, lte: to } }, _sum: { amount: true } })
      : Promise.resolve(null),
  ]);

  const rows: {
    business: string;
    billing: number;
    employeePayout: number;
    otherExpenses: number;
    grossMargin: number;
    net: number;
  }[] = [];

  if (needManpower && depAgg && mpExpAgg) {
    const billing = round2(depAgg._sum.billingAmount ?? 0);
    const payout = round2(depAgg._sum.payoutAmount ?? 0);
    const otherExpenses = round2(mpExpAgg._sum.amount ?? 0);
    rows.push({
      business: "MANPOWER",
      billing,
      employeePayout: payout,
      otherExpenses,
      grossMargin: round2(billing - payout),
      net: round2(billing - payout - otherExpenses),
    });
  }
  if (needTransport && trips && trExpAgg) {
    const billing = round2(trips.reduce((s, t) => s + tripTarget(t), 0));
    const payout = 0;
    const otherExpenses = round2(trExpAgg._sum.amount ?? 0);
    rows.push({
      business: "TRANSPORT",
      billing,
      employeePayout: payout,
      otherExpenses,
      grossMargin: round2(billing - payout),
      net: round2(billing - payout - otherExpenses),
    });
  }

  const totals = {
    billing: round2(rows.reduce((s, r) => s + r.billing, 0)),
    employeePayout: round2(rows.reduce((s, r) => s + r.employeePayout, 0)),
    otherExpenses: round2(rows.reduce((s, r) => s + r.otherExpenses, 0)),
    net: round2(rows.reduce((s, r) => s + r.net, 0)),
  };

  return {
    columns: [
      { key: "business", label: "Business", type: "string" },
      { key: "billing", label: "Billing", type: "currency" },
      { key: "employeePayout", label: "Employee Payout", type: "currency" },
      { key: "otherExpenses", label: "Other Expenses", type: "currency" },
      { key: "grossMargin", label: "Gross Margin", type: "currency" },
      { key: "net", label: "Net", type: "currency" },
    ],
    rows,
    totals,
    meta: { from: dayKey(from), to: dayKey(to) },
  };
});
