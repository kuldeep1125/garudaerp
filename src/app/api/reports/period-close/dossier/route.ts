import { db } from "@/lib/db";
import { handleRoute, parseDate, endOfDay } from "@/lib/api-helpers";
import { round2 } from "@/lib/money";
import { dayKey, reportRange, manpowerCostBreakdown } from "@/app/api/_lib/engine";

// GET /api/reports/period-close/dossier?to=YYYY-MM-DD
// Generates the comprehensive historical Period Closing Dossier.
// This is the definitive audit pack generated BEFORE any period reset is performed.
export const GET = handleRoute(async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const { from, to } = reportRange(sp);

  const [
    cost,
    deployments,
    propertyPayments,
    advances,
    settlements,
    trips,
    expenses,
    emiPayments,
    properties,
    employees,
  ] = await Promise.all([
    manpowerCostBreakdown(from, to),
    db.deployment.findMany({
      where: { date: { gte: from, lte: to } },
      select: { billingAmount: true, payoutAmount: true, contractorRateCut: true, shift: true },
    }),
    db.propertyPayment.findMany({
      where: { date: { gte: from, lte: to } },
      include: { property: { select: { id: true, name: true } } },
    }),
    db.advance.findMany({
      where: { date: { lte: to } },
      include: { employee: { select: { id: true, fullName: true, code: true } } },
    }),
    db.settlement.findMany({
      where: { updatedAt: { gte: from, lte: to } },
    }),
    db.trip.findMany({
      where: { startAt: { gte: from, lte: to }, status: { not: "CANCELLED" } },
      select: { agreedAmount: true, extraCharges: true, finalAmount: true, paidAmount: true },
    }),
    db.expense.findMany({
      where: { date: { gte: from, lte: to } },
      select: { amount: true, kind: true, categoryName: true, business: true },
    }),
    db.vehicleEmiPayment.findMany({
      where: { paidDate: { gte: from, lte: to }, status: "PAID" },
      select: { amount: true },
    }),
    db.property.findMany({ select: { id: true, name: true } }),
    db.employee.findMany({ select: { id: true, fullName: true, code: true } }),
  ]);

  // Financial aggregates
  const manpowerBilling = round2(deployments.reduce((s, d) => s + d.billingAmount, 0));
  const transportBilling = round2(trips.reduce((s, t) => s + (t.finalAmount ?? (t.agreedAmount + t.extraCharges)), 0));
  const totalRevenue = round2(manpowerBilling + transportBilling + (cost?.rentIncome ?? 0));

  const shiftPayouts = round2(deployments.reduce((s, d) => s + d.payoutAmount, 0));
  const contractorCuts = round2(deployments.reduce((s, d) => s + (d.contractorRateCut ?? 0) * (d.shift === "FULL" ? 2 : 1), 0));
  const totalLaborCost = round2(cost?.grossPayout ?? shiftPayouts);

  const grossProfit = round2(totalRevenue - totalLaborCost);

  const operatingExpenses = round2(expenses.filter((e) => e.kind === "OPERATING").reduce((s, e) => s + e.amount, 0));
  const emiExpenses = round2(emiPayments.reduce((s, e) => s + e.amount, 0));
  const totalOpex = round2(operatingExpenses + emiExpenses);

  const netProfit = round2(grossProfit - totalOpex);

  // Cash Ledger summary
  const propertyCollections = round2(propertyPayments.reduce((s, p) => s + p.amount, 0));
  const tripCollections = round2(trips.reduce((s, t) => s + t.paidAmount, 0));
  const totalLiquidInflow = round2(propertyCollections + tripCollections);

  const advancesDisbursed = round2(advances.filter((a) => a.date >= from && a.date <= to).reduce((s, a) => s + a.amount, 0));
  const settlementsPaid = round2(settlements.filter((s) => s.status === "PAID").reduce((s, a) => s + a.netPayable, 0));
  const totalLiquidOutflow = round2(advancesDisbursed + settlementsPaid + operatingExpenses + emiExpenses);
  const netCashFlow = round2(totalLiquidInflow - totalLiquidOutflow);

  // Outstanding Employee Advances (Carried Forward Liability)
  const unrecoveredAdvances = advances.filter((a) => !a.settlementId).map((a) => ({
    id: a.id,
    employeeId: a.employeeId,
    employeeName: a.employee.fullName,
    code: a.employee.code,
    amount: a.amount,
    recovered: 0,
    outstanding: round2(a.amount),
    date: dayKey(a.date),
  }));

  const totalUnrecoveredAdvances = round2(unrecoveredAdvances.reduce((s, a) => s + a.outstanding, 0));

  // Outstanding Property Billings (Carried Forward Asset)
  const totalPropertyBilled = manpowerBilling;
  const propertyOutstanding = round2(Math.max(0, totalPropertyBilled - propertyCollections));

  return {
    closingCutoff: dayKey(to),
    period: `${dayKey(from)} → ${dayKey(to)}`,
    generatedAt: new Date().toISOString(),
    executiveSummary: {
      totalRevenue,
      manpowerBilling,
      transportBilling,
      rentIncome: round2(cost?.rentIncome ?? 0),
      totalLaborCost,
      grossProfit,
      totalOpex,
      netProfit,
      netMarginPct: totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 100) : 0,
    },
    cashLedger: {
      totalInflow: totalLiquidInflow,
      propertyCollections,
      tripCollections,
      totalOutflow: totalLiquidOutflow,
      advancesDisbursed,
      settlementsPaid,
      opexPaid: operatingExpenses,
      emiPaid: emiExpenses,
      netCashFlow,
    },
    carriedForwardBalances: {
      propertyReceivables: propertyOutstanding,
      unrecoveredAdvancesCount: unrecoveredAdvances.length,
      unrecoveredAdvancesTotal: totalUnrecoveredAdvances,
      unrecoveredAdvancesList: unrecoveredAdvances.slice(0, 50),
    },
    archivableRecordCounts: {
      deployments: deployments.length,
      trips: trips.length,
      propertyPayments: propertyPayments.length,
      expenses: expenses.length,
      settlements: settlements.length,
    },
    note: "Official Period Closure Dossier verifying all historical numbers before period archive and reset.",
  };
});
