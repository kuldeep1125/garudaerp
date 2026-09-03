import { db } from "@/lib/db";
import { handleRoute, parseRange } from "@/lib/api-helpers";
import { round2 } from "@/lib/money";
import { dayKey } from "@/app/api/_lib/engine";
import { transportBlock, transportTrend } from "../../_lib/dashboard";

interface PerVehicleRow {
  vehicleId: string;
  name: string;
  revenue: number;
  expense: number;
  emi: number;
  net: number;
}

// GET /api/dashboard/transport?range=... — transport KPIs + 14-day revenue trend + per-vehicle breakdown.
export const GET = handleRoute(async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const { from, to } = parseRange(sp);

  const [block, trend, vehicles, trips, expenses] = await Promise.all([
    transportBlock(from, to),
    transportTrend(),
    db.vehicle.findMany({ select: { id: true, name: true, registrationNumber: true }, orderBy: { name: "asc" } }),
    db.trip.findMany({
      where: { startAt: { gte: from, lte: to }, status: { not: "CANCELLED" } },
      select: { vehicleId: true, paidAmount: true },
    }),
    db.expense.findMany({
      where: { business: "TRANSPORT", vehicleId: { not: null }, date: { gte: from, lte: to } },
      select: { vehicleId: true, amount: true, categoryName: true },
    }),
  ]);

  const byMap = new Map<string, PerVehicleRow>();
  for (const v of vehicles) {
    byMap.set(v.id, { vehicleId: v.id, name: v.name, revenue: 0, expense: 0, emi: 0, net: 0 });
  }
  for (const t of trips) {
    const row = byMap.get(t.vehicleId);
    if (row) row.revenue = round2(row.revenue + t.paidAmount);
  }
  for (const e of expenses) {
    if (!e.vehicleId) continue;
    const row = byMap.get(e.vehicleId);
    if (!row) continue;
    if ((e.categoryName ?? "").toUpperCase() === "EMI") row.emi = round2(row.emi + e.amount);
    else row.expense = round2(row.expense + e.amount);
  }
  const perVehicle = [...byMap.values()].map((r) => ({ ...r, net: round2(r.revenue - r.expense - r.emi) }));

  return {
    range: { from: dayKey(from), to: dayKey(to) },
    transport: block,
    trend: trend.trend,
    perVehicle,
  };
});
