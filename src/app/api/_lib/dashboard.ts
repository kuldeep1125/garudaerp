// Shared dashboard block computations (used by dashboard/summary, /manpower, /transport).
// Keeps the three dashboard endpoints consistent without duplicating aggregation logic.
import { db } from "@/lib/db";
import { round2 } from "@/lib/money";
import { endOfDay } from "@/lib/api-helpers";
import {
  EPS,
  dayKey,
  tripTarget,
  vehicleStatsMap,
  loadAllLedgers,
  computeNotifications,
  manpowerCostBreakdown,
  type AppNotification,
} from "./engine";

export interface ManpowerBlock {
  employeesDeployed: number;
  propertiesServed: number;
  expectedBilling: number;
  grossPayout: number; // [ADDED] gross employee cost before rent deduction
  payout: number; // [FIXED] NET employee payout after accommodation rent deduction
  shiftPayout: number;
  salary: number;
  overtime: number;
  rentIncome: number;
  contractorCut: number;
  grossMargin: number;
  received: number;
  pending: number;
  advancesGiven: number;
  expenses: number;
  dayShifts: number;
  nightShifts: number;
  deployments: number;
}

export interface TransportBlock {
  availableVehicles: number;
  onTripVehicles: number;
  revenue: number;
  expenses: number;
  received: number;
  pending: number;
  monthRevenue: number;
  monthExpense: number;
  monthEmi: number;
  monthNet: number;
  revenuePerVehicle: { vehicleId: string; vehicleName: string; revenue: number }[];
}

export interface CollectionsBlock {
  totalBilled: number;
  totalReceived: number;
  totalOutstanding: number;
  byProperty: { propertyId: string; propertyName: string; outstanding: number }[];
}

/** Manpower KPI block for [from, to]. Pending = all-time FIFO outstanding. */
export async function manpowerBlock(from: Date, to: Date): Promise<ManpowerBlock> {
  const [deps, payAgg, advAgg, expAgg, ledgers, cost] = await Promise.all([
    db.deployment.findMany({
      where: { date: { gte: from, lte: to } },
      select: { employeeId: true, propertyId: true, shift: true, billingAmount: true, payoutAmount: true },
    }),
    db.propertyPayment.aggregate({ where: { date: { gte: from, lte: to } }, _sum: { amount: true } }),
    db.advance.aggregate({ where: { date: { gte: from, lte: to } }, _sum: { amount: true } }),
    db.expense.aggregate({ where: { business: "MANPOWER", kind: "OPERATING", date: { gte: from, lte: to } }, _sum: { amount: true } }),
    loadAllLedgers(),
    // CANONICAL source for billing/payout/rent — the same function the Reports
    // page and monthly summary use, so the numbers can never disagree.
    manpowerCostBreakdown(from, to),
  ]);
  const employeeIds = new Set<string>();
  const propertyIds = new Set<string>();
  let dayShifts = 0;
  let nightShifts = 0;
  for (const d of deps) {
    employeeIds.add(d.employeeId);
    propertyIds.add(d.propertyId);
    // FULL covers both halves of the day → counts in day AND night coverage.
    const s = d.shift.toUpperCase();
    if (s === "DAY" || s === "FULL") dayShifts++;
    if (s === "NIGHT" || s === "FULL") nightShifts++;
  }
  let pending = 0;
  for (const led of ledgers.map.values()) pending += led.outstanding;
  return {
    employeesDeployed: employeeIds.size,
    propertiesServed: propertyIds.size,
    expectedBilling: cost.billing,
    grossPayout: cost.grossPayout, // [ADDED]
    payout: cost.payout, // [FIXED] net employee payout
    shiftPayout: cost.shiftPayout,
    salary: cost.salary,
    overtime: cost.overtime,
    rentIncome: cost.rentIncome,
    contractorCut: cost.contractorCut,
    grossMargin: round2(cost.billing - cost.payout),
    received: round2(payAgg._sum.amount ?? 0),
    pending: round2(Math.max(0, pending)),
    advancesGiven: round2(advAgg._sum.amount ?? 0),
    expenses: round2(expAgg._sum.amount ?? 0),
    dayShifts,
    nightShifts,
    deployments: deps.length,
  };
}

/** Transport KPI block for [from, to]. Revenue/pending scoped to trips starting in range. */
export async function transportBlock(from: Date, to: Date): Promise<TransportBlock> {
  const [vehicles, trips, expAgg, stats] = await Promise.all([
    db.vehicle.findMany({ select: { id: true, name: true, status: true } }),
    db.trip.findMany({
      where: { startAt: { gte: from, lte: to }, status: { not: "CANCELLED" } },
      select: { vehicleId: true, finalAmount: true, agreedAmount: true, extraCharges: true, paidAmount: true },
    }),
    db.expense.aggregate({ where: { business: "TRANSPORT", kind: "OPERATING", date: { gte: from, lte: to } }, _sum: { amount: true } }),
    vehicleStatsMap((await db.vehicle.findMany({ select: { id: true } })).map((v) => v.id)),
  ]);

  const revByVehicle = new Map<string, number>();
  let revenue = 0;
  let pending = 0;
  for (const t of trips) {
    const target = tripTarget(t);
    revenue += t.paidAmount;
    pending += Math.max(0, target - t.paidAmount);
    revByVehicle.set(t.vehicleId, round2((revByVehicle.get(t.vehicleId) ?? 0) + t.paidAmount));
  }
  const monthTotals = { revenue: 0, expense: 0, emi: 0 };
  for (const s of stats.values()) {
    monthTotals.revenue += s.monthRevenue;
    monthTotals.expense += s.monthExpense;
    monthTotals.emi += s.monthEmi;
  }
  const nameById = new Map(vehicles.map((v) => [v.id, v.name]));
  const revenuePerVehicle = [...revByVehicle.entries()]
    .map(([vehicleId, r]) => ({ vehicleId, vehicleName: nameById.get(vehicleId) ?? "Unknown", revenue: r }))
    .sort((a, b) => b.revenue - a.revenue);

  return {
    availableVehicles: vehicles.filter((v) => v.status === "AVAILABLE").length,
    onTripVehicles: vehicles.filter((v) => v.status === "RENTED" || v.status === "TRIP").length,
    revenue: round2(revenue),
    expenses: round2(expAgg._sum.amount ?? 0),
    received: round2(revenue),
    pending: round2(pending),
    monthRevenue: round2(monthTotals.revenue),
    monthExpense: round2(monthTotals.expense),
    monthEmi: round2(monthTotals.emi),
    monthNet: round2(monthTotals.revenue - monthTotals.expense - monthTotals.emi),
    revenuePerVehicle,
  };
}

/** All-time collections overview via the FIFO property ledger. */
export async function collectionsBlock(): Promise<CollectionsBlock> {
  const { properties, map } = await loadAllLedgers();
  let totalBilled = 0;
  let totalReceived = 0;
  let totalOutstanding = 0;
  const byProperty: CollectionsBlock["byProperty"] = [];
  for (const p of properties) {
    const led = map.get(p.id);
    if (!led) continue;
    totalBilled += led.billed;
    totalReceived += led.received;
    totalOutstanding += led.outstanding;
    if (led.outstanding > EPS) byProperty.push({ propertyId: p.id, propertyName: p.name, outstanding: led.outstanding });
  }
  byProperty.sort((a, b) => b.outstanding - a.outstanding);
  return {
    totalBilled: round2(totalBilled),
    totalReceived: round2(totalReceived),
    totalOutstanding: round2(Math.max(0, totalOutstanding)),
    byProperty,
  };
}

/** Last `days` days ending today (local midnight boundaries). */
export function lastNDays(days: number): { from: Date; to: Date; keys: string[] } {
  const now = new Date();
  const to = endOfDay(now);
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));
  const keys: string[] = [];
  for (let i = 0; i < days; i++) {
    keys.push(dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1 - i))));
  }
  return { from, to, keys };
}

export type TrendPoint = { date: string; billing: number; payout: number; margin: number };

/** 14-day manpower trend: billing/payout/margin grouped by deployment date. */
export async function manpowerTrend(): Promise<{ trend: TrendPoint[] }> {
  const { from, to, keys } = lastNDays(14);
  const deps = await db.deployment.findMany({
    where: { date: { gte: from, lte: to } },
    select: { date: true, billingAmount: true, payoutAmount: true },
  });
  const byDay = new Map<string, { billing: number; payout: number }>();
  for (const k of keys) byDay.set(k, { billing: 0, payout: 0 });
  for (const d of deps) {
    const row = byDay.get(dayKey(d.date));
    if (!row) continue;
    row.billing = round2(row.billing + d.billingAmount);
    row.payout = round2(row.payout + d.payoutAmount);
  }
  return {
    trend: keys.map((date) => {
      const row = byDay.get(date) ?? { billing: 0, payout: 0 };
      return { date, billing: row.billing, payout: row.payout, margin: round2(row.billing - row.payout) };
    }),
  };
}

/** 14-day transport trend: trip paidAmount grouped by startAt date. */
export async function transportTrend(): Promise<{ trend: { date: string; revenue: number }[] }> {
  const { from, to, keys } = lastNDays(14);
  const trips = await db.trip.findMany({
    where: { startAt: { gte: from, lte: to }, status: { not: "CANCELLED" } },
    select: { startAt: true, paidAmount: true },
  });
  const byDay = new Map<string, number>();
  for (const k of keys) byDay.set(k, 0);
  for (const t of trips) {
    const k = dayKey(t.startAt);
    if (!byDay.has(k)) continue;
    byDay.set(k, round2((byDay.get(k) ?? 0) + t.paidAmount));
  }
  return { trend: keys.map((date) => ({ date, revenue: byDay.get(date) ?? 0 })) };
}

export async function attentionList(limit: number): Promise<AppNotification[]> {
  const list = await computeNotifications();
  return list.slice(0, limit);
}
