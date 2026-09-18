import { db } from "@/lib/db";
import { handleRoute } from "@/lib/api-helpers";
import { round2 } from "@/lib/money";
import { BUSINESSES, dayKey, reportRange, tripTarget, manpowerCostBreakdown } from "@/app/api/_lib/engine";

// GET /api/reports/profitability?from=&to=&business=
// MANPOWER: billing = deployments billing, employee cost = shift payouts +
//           salaried salary + overtime + extra contractor cuts (the canonical
//           `payout` metric — same source as the dashboard, so no mismatch),
//           rent income = employee business-accommodation rent accrual.
// TRANSPORT: billing = agreed trip revenue (finalAmount ?? agreedAmount + extraCharges),
//            employee cost = 0, other = TRANSPORT expenses.
// CANONICAL: net = billing + rent − employee cost − other expenses.
export const GET = handleRoute(async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const { from, to } = reportRange(sp);
  const businessFilter = sp.get("business")?.toUpperCase();
  const businesses = (
    businessFilter && BUSINESSES.includes(businessFilter as (typeof BUSINESSES)[number]) ? [businessFilter] : [...BUSINESSES]
  ) as ("MANPOWER" | "TRANSPORT")[];

  const needManpower = businesses.includes("MANPOWER");
  const needTransport = businesses.includes("TRANSPORT");

  const [cost, mpExpAgg, mpRefAgg, trips, trExpAgg, trRefAgg] = await Promise.all([
    needManpower
      ? manpowerCostBreakdown(from, to)
      : Promise.resolve(null),
    needManpower
      ? db.expense.aggregate({ where: { business: "MANPOWER", kind: "OPERATING", date: { gte: from, lte: to } }, _sum: { amount: true } })
      : Promise.resolve(null),
    needManpower
      ? db.expense.aggregate({ where: { business: "MANPOWER", kind: "REFUND", date: { gte: from, lte: to } }, _sum: { amount: true } })
      : Promise.resolve(null),
    needTransport
      ? db.trip.findMany({
          where: { startAt: { gte: from, lte: to }, status: { not: "CANCELLED" } },
          select: { finalAmount: true, agreedAmount: true, extraCharges: true },
        })
      : Promise.resolve([]),
    needTransport
      ? db.expense.aggregate({ where: { business: "TRANSPORT", kind: "OPERATING", date: { gte: from, lte: to } }, _sum: { amount: true } })
      : Promise.resolve(null),
    needTransport
      ? db.expense.aggregate({ where: { business: "TRANSPORT", kind: "REFUND", date: { gte: from, lte: to } }, _sum: { amount: true } })
      : Promise.resolve(null),
  ]);

  const rows: {
    business: string;
    billing: number;
    employeeCost: number;
    rentIncome: number;
    otherExpenses: number;
    grossMargin: number;
    net: number;
    salaryComponent: number;
    overtimeComponent: number;
    contractorCommission: number;
  }[] = [];

  if (needManpower && cost && mpExpAgg) {
    const billing = cost.billing;
    const employeeCost = cost.grossPayout; // [FIXED] gross employee cost (shift payouts + salary + overtime + extra contractor cuts)
    const rentIncome = cost.rentIncome;
    const otherExpenses = round2(Math.max(0, (mpExpAgg._sum.amount ?? 0) - (mpRefAgg?._sum.amount ?? 0)));
    rows.push({
      business: "MANPOWER",
      billing,
      employeeCost,
      rentIncome,
      otherExpenses,
      grossMargin: round2(billing - employeeCost),
      net: round2(billing + rentIncome - employeeCost - otherExpenses),
      salaryComponent: cost.salary,
      overtimeComponent: cost.overtime,
      contractorCommission: cost.contractorCut,
    });
  }
  if (needTransport && trips && trExpAgg) {
    const billing = round2(trips.reduce((s, t) => s + tripTarget(t), 0));
    const employeeCost = 0;
    const otherExpenses = round2(Math.max(0, (trExpAgg._sum.amount ?? 0) - (trRefAgg?._sum.amount ?? 0)));
    rows.push({
      business: "TRANSPORT",
      billing,
      employeeCost,
      rentIncome: 0,
      otherExpenses,
      grossMargin: round2(billing - employeeCost),
      net: round2(billing + 0 - employeeCost - otherExpenses),
      salaryComponent: 0,
      overtimeComponent: 0,
      contractorCommission: 0,
    });
  }

  const totals = {
    billing: round2(rows.reduce((s, r) => s + r.billing, 0)),
    employeeCost: round2(rows.reduce((s, r) => s + r.employeeCost, 0)),
    rentIncome: round2(rows.reduce((s, r) => s + r.rentIncome, 0)),
    otherExpenses: round2(rows.reduce((s, r) => s + r.otherExpenses, 0)),
    net: round2(rows.reduce((s, r) => s + r.net, 0)),
  };

  // Fetch itemized operating expense breakdown by category for the period
  const categoryExpenses = await db.expense.groupBy({
    by: ["categoryName"],
    where: {
      date: { gte: from, lte: to },
      kind: "OPERATING",
      ...(businessFilter ? { business: businessFilter } : {}),
    },
    _sum: { amount: true },
    _count: { id: true },
  });

  const expenseBreakdown = categoryExpenses.map((c) => ({
    category: c.categoryName || "General Expenses",
    amount: round2(c._sum.amount ?? 0),
    entriesCount: c._count.id,
  })).sort((a, b) => b.amount - a.amount);

  const totalRevenue = round2(totals.billing + totals.rentIncome);
  const totalDirectCost = round2(totals.employeeCost);
  const grossProfit = round2(totalRevenue - totalDirectCost);
  const grossMarginPct = totalRevenue > 0 ? Math.round((grossProfit / totalRevenue) * 100) : 0;
  const netMarginPct = totalRevenue > 0 ? Math.round((totals.net / totalRevenue) * 100) : 0;

  const incomeStatement = {
    revenue: {
      manpowerBilling: round2(rows.find((r) => r.business === "MANPOWER")?.billing ?? 0),
      transportBilling: round2(rows.find((r) => r.business === "TRANSPORT")?.billing ?? 0),
      rentIncome: round2(totals.rentIncome),
      totalRevenue,
    },
    directCosts: {
      perShiftWages: round2(Math.max(0, (cost?.shiftPayout ?? 0) - (cost?.contractorCut ?? 0))),
      salariedPayroll: round2(cost?.salary ?? 0),
      overtime: round2(cost?.overtime ?? 0),
      contractorCommissions: round2(cost?.contractorCut ?? 0),
      totalLaborCost: totalDirectCost,
    },
    grossProfit,
    grossMarginPct,
    operatingExpenses: {
      categories: expenseBreakdown,
      totalOpex: round2(totals.otherExpenses),
    },
    netProfit: totals.net,
    netMarginPct,
  };

  return {
    columns: [
      { key: "business", label: "Business", type: "string" },
      { key: "billing", label: "Billing", type: "currency" },
      { key: "rentIncome", label: "Rent Income", type: "currency" },
      { key: "employeeCost", label: "Employee Cost", type: "currency" },
      { key: "otherExpenses", label: "Other Expenses", type: "currency" },
      { key: "grossMargin", label: "Gross Margin", type: "currency" },
      { key: "net", label: "Net", type: "currency" },
      { key: "salaryComponent", label: "· Salary (in cost)", type: "currency" },
      { key: "overtimeComponent", label: "· Overtime (in cost)", type: "currency" },
      { key: "contractorCommission", label: "· Contractor (in cost)", type: "currency" },
    ],
    rows,
    totals: {
      ...totals,
      grossProfit,
      grossMarginPct,
      netMarginPct,
    },
    expenseBreakdown,
    incomeStatement,
    meta: {
      from: dayKey(from),
      to: dayKey(to),
      totalRevenue,
      grossProfit,
      netProfit: totals.net,
    },
    note:
      "Net = Billing + Rent income − Employee cost − Other expenses. Employee cost = per-shift payouts + salaried salary + overtime + contractor cuts beyond payout. Contractor commission is paid out of employee payouts (shown for reference, not double-counted); salary/overtime accrue daily for salaried employees.",
  };
});
