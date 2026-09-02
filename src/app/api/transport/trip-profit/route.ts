import { db } from "@/lib/db";
import { handleRoute } from "@/lib/api-helpers";
import { round2 } from "@/lib/money";
import { reportRange } from "@/app/api/_lib/engine";

// GET /api/transport/trip-profit?from=&to=&limit=8
// Top trips by ESTIMATED profit. Trips carry no direct cost records, so each
// trip is charged a pro-rata share of its vehicle's TRANSPORT expenses
// (operating + EMI) in the window, weighted by the trip's share of that
// vehicle's revenue. Per-trip profits therefore sum to the vehicle net.
export const GET = handleRoute(async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const { from, to } = reportRange(sp);
  const limit = Math.min(20, Math.max(3, Number(sp.get("limit") ?? 8) || 8));

  const [trips, expenses] = await Promise.all([
    db.trip.findMany({
      where: { startAt: { gte: from, lte: to }, status: { not: "CANCELLED" } },
      select: {
        id: true, vehicleId: true, clientId: true, destination: true, pickup: true,
        tripType: true, rentalType: true, startAt: true, status: true,
        agreedAmount: true, extraCharges: true, finalAmount: true, paidAmount: true,
        vehicle: { select: { name: true, registrationNumber: true } },
        client: { select: { name: true, company: true } },
      },
    }),
    db.expense.findMany({
      where: { business: "TRANSPORT", vehicleId: { not: null }, date: { gte: from, lte: to } },
      select: { vehicleId: true, amount: true },
    }),
  ]);

  const costBy = new Map<string, number>();
  for (const e of expenses) {
    if (!e.vehicleId) continue;
    costBy.set(e.vehicleId, round2((costBy.get(e.vehicleId) ?? 0) + e.amount));
  }

  const revBy = new Map<string, number>();
  const enriched = trips.map((t) => {
    const revenue = round2(t.finalAmount ?? t.agreedAmount + t.extraCharges);
    revBy.set(t.vehicleId, round2((revBy.get(t.vehicleId) ?? 0) + revenue));
    return { ...t, revenue };
  });

  const rows = enriched.map((t) => {
    const vehicleCost = costBy.get(t.vehicleId) ?? 0;
    const vehicleRev = revBy.get(t.vehicleId) ?? 0;
    // Pro-rata allocation; trips on a cost-free or zero-revenue vehicle keep full revenue.
    const allocatedCost = vehicleRev > 0 && vehicleCost > 0 ? round2((t.revenue / vehicleRev) * vehicleCost) : 0;
    const profit = round2(t.revenue - allocatedCost);
    return {
      tripId: t.id,
      label: [t.client?.company || t.client?.name, t.destination || t.pickup].filter(Boolean).join(" · ") || "Trip",
      client: t.client?.company || t.client?.name || "—",
      destination: t.destination || t.pickup || "—",
      vehicle: t.vehicle.name,
      registrationNumber: t.vehicle.registrationNumber,
      rentalType: t.rentalType,
      status: t.status,
      startAt: t.startAt.toISOString(),
      revenue: t.revenue,
      allocatedCost,
      profit,
      marginPct: t.revenue > 0 ? Math.round((profit / t.revenue) * 100) : 0,
      collectedPct: t.revenue > 0 ? Math.min(100, Math.round((t.paidAmount / t.revenue) * 100)) : 0,
    };
  });

  rows.sort((a, b) => b.profit - a.profit || b.revenue - a.revenue);

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    totalTrips: rows.length,
    totals: {
      revenue: round2(rows.reduce((s, r) => s + r.revenue, 0)),
      allocatedCost: round2(rows.reduce((s, r) => s + r.allocatedCost, 0)),
      profit: round2(rows.reduce((s, r) => s + r.profit, 0)),
    },
    note: "Costs are estimated: each trip is charged its share of the vehicle's operating expenses + EMI, weighted by trip revenue.",
    trips: rows.slice(0, limit),
  };
});
