import { db } from "@/lib/db";
import { round2 } from "@/lib/money";
import {} from "./engine";

// Shared month-metrics engine — used by:
//   - GET /api/dashboard/monthly-summary   (dashboard card)
//   - GET/POST /api/owners/monthly-email   (owner monthly summary email mock)
// Money semantics (kept consistent across both consumers):
//   - manpowerBilling / payout: deployments dated in the month
//   - collections: property payments received in the month (may settle earlier billing)
//   - transportRevenue: trips STARTING in the month, billing basis (finalAmount ?? agreed+extra)
//   - transportCollected: paidAmount of those same trips (cumulative field — approximation)
//   - transportOpex: TRANSPORT expenses excluding the EMI category
//   - transportEmi:  TRANSPORT expenses in the EMI category
//   - net = manpowerMargin − manpowerOtherExpenses + transportRevenue − transportOpex − transportEmi

export interface MonthMetrics {
  deployments: number;
  manpowerBilling: number;
  manpowerPayout: number;
  manpowerMargin: number;
  manpowerOtherExpenses: number;
  collections: number;
  advances: number;
  trips: number;
  transportRevenue: number;
  transportCollected: number;
  transportOpex: number;
  transportEmi: number;
  net: number;
}

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function boundsOf(month: string): { from: Date; to: Date } {
  const [y, m] = month.split("-").map(Number);
  return { from: new Date(y, m - 1, 1), to: new Date(y, m, 0, 23, 59, 59, 999) };
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** "2026-09" → "Sep 2026" — friendly label for insight lines. */
export function shortMonthLabel(month: string): string {
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const [y, m] = month.split("-").map(Number);
  return `${names[m - 1]} ${y}`;
}

export async function metricsFor(month: string): Promise<MonthMetrics> {
  const { from, to } = boundsOf(month);
  const [deps, payAgg, advAgg, trips, expenses] = await Promise.all([
    db.deployment.aggregate({
      where: { date: { gte: from, lte: to } },
      _sum: { billingAmount: true, payoutAmount: true },
      _count: true,
    }),
    db.propertyPayment.aggregate({ where: { date: { gte: from, lte: to } }, _sum: { amount: true } }),
    db.advance.aggregate({ where: { date: { gte: from, lte: to } }, _sum: { amount: true } }),
    db.trip.findMany({
      where: { startAt: { gte: from, lte: to }, status: { not: "CANCELLED" } },
      select: { agreedAmount: true, extraCharges: true, finalAmount: true, paidAmount: true },
    }),
    db.expense.findMany({
      where: { date: { gte: from, lte: to } },
      select: { business: true, categoryName: true, amount: true },
    }),
  ]);

  let manpowerOther = 0;
  let transportOpex = 0;
  let transportEmi = 0;
  for (const e of expenses) {
    const isEmi = (e.categoryName ?? "").toUpperCase() === "EMI";
    if (e.business === "MANPOWER") manpowerOther += e.amount;
    else if (e.business === "TRANSPORT") {
      if (isEmi) transportEmi += e.amount;
      else transportOpex += e.amount;
    }
  }

  let transportRevenue = 0;
  let transportCollected = 0;
  for (const t of trips) {
    transportRevenue += t.finalAmount ?? t.agreedAmount + t.extraCharges;
    transportCollected += t.paidAmount;
  }

  const manpowerBilling = round2(deps._sum.billingAmount ?? 0);
  const manpowerPayout = round2(deps._sum.payoutAmount ?? 0);
  const margin = round2(manpowerBilling - manpowerPayout);

  return {
    deployments: deps._count,
    manpowerBilling,
    manpowerPayout,
    manpowerMargin: margin,
    manpowerOtherExpenses: round2(manpowerOther),
    collections: round2(payAgg._sum.amount ?? 0),
    advances: round2(advAgg._sum.amount ?? 0),
    trips: trips.length,
    transportRevenue: round2(transportRevenue),
    transportCollected: round2(transportCollected),
    transportOpex: round2(transportOpex),
    transportEmi: round2(transportEmi),
    net: round2(margin - manpowerOther + transportRevenue - transportOpex - transportEmi),
  };
}

/** null = "no baseline" (previous month was zero but current is not) */
export function pctChange(cur: number, prev: number): number | null {
  if (prev === 0) return cur === 0 ? 0 : null;
  return Math.round(((cur - prev) / Math.abs(prev)) * 100);
}

export const MONTH_METRICS_NOTE =
  "Money semantics: manpower billing counts deployments dated in the month; transport revenue counts trips starting in the month (billing basis); collections are payments received in the month and may settle earlier billing.";

export function buildInsights(cur: MonthMetrics, prev: MonthMetrics, prevMonth: string): string[] {
  const insights: string[] = [];
  if (prev.deployments === 0 && cur.deployments === 0 && prev.trips === 0 && cur.trips === 0) {
    insights.push("No business activity recorded for this month yet.");
    return insights;
  }
  const movers = [
    { label: "Manpower billing", cur: cur.manpowerBilling, prev: prev.manpowerBilling, goodUp: true },
    { label: "Collections", cur: cur.collections, prev: prev.collections, goodUp: true },
    { label: "Transport revenue", cur: cur.transportRevenue, prev: prev.transportRevenue, goodUp: true },
    { label: "Net result", cur: cur.net, prev: prev.net, goodUp: true },
    {
      label: "Expenses",
      cur: cur.transportOpex + cur.transportEmi + cur.manpowerOtherExpenses,
      prev: prev.transportOpex + prev.transportEmi + prev.manpowerOtherExpenses,
      goodUp: false,
    },
  ]
    .map((m) => ({ ...m, pct: pctChange(m.cur, m.prev) }))
    .filter((m) => m.pct !== null && Math.abs(m.pct) >= 5)
    .sort((a, b) => Math.abs(b.pct!) - Math.abs(a.pct!));
  const top = movers[0];
  if (top) {
    const dir = top.pct! >= 0 ? "up" : "down";
    insights.push(
      top.goodUp
        ? `${top.label} is ${dir} ${Math.abs(top.pct!)}% vs ${prevMonth}`
        : `${top.label} are ${dir} ${Math.abs(top.pct!)}% vs ${prevMonth} — keep an eye on costs`
    );
  }
  if (cur.manpowerBilling > 0 && cur.collections < cur.manpowerBilling * 0.5) {
    insights.push("Collections are behind half of this month's billing — review pending properties.");
  }
  if (cur.net < 0) {
    insights.push("Net result is negative for this month — check expenses and EMI load.");
  } else if (prev.net <= 0 && cur.net > 0) {
    insights.push("Net result turned positive compared to last month.");
  }
  return insights;
}
