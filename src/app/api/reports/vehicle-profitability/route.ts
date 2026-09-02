import { db } from "@/lib/db";
import { handleRoute } from "@/lib/api-helpers";
import { round2 } from "@/lib/money";
import { dayKey, reportRange } from "@/app/api/_lib/engine";

// GET /api/reports/vehicle-profitability?from=&to=
// Per-vehicle cash revenue (trip paidAmount by startAt) vs linked TRANSPORT expenses (EMI shown separately).
export const GET = handleRoute(async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const { from, to } = reportRange(sp);

  const [vehicles, trips, expenses] = await Promise.all([
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

  const revBy = new Map<string, number>();
  for (const t of trips) revBy.set(t.vehicleId, round2((revBy.get(t.vehicleId) ?? 0) + t.paidAmount));
  const opexBy = new Map<string, number>();
  const emiBy = new Map<string, number>();
  for (const e of expenses) {
    if (!e.vehicleId) continue;
    if ((e.categoryName ?? "").toUpperCase() === "EMI") {
      emiBy.set(e.vehicleId, round2((emiBy.get(e.vehicleId) ?? 0) + e.amount));
    } else {
      opexBy.set(e.vehicleId, round2((opexBy.get(e.vehicleId) ?? 0) + e.amount));
    }
  }

  const rows = vehicles.map((v) => {
    const revenue = revBy.get(v.id) ?? 0;
    const operatingExpenses = opexBy.get(v.id) ?? 0;
    const emi = emiBy.get(v.id) ?? 0;
    return {
      vehicleId: v.id,
      vehicle: v.name,
      registrationNumber: v.registrationNumber,
      revenue,
      operatingExpenses,
      emi,
      net: round2(revenue - operatingExpenses - emi),
    };
  });
  rows.sort((a, b) => b.revenue - a.revenue || a.vehicle.localeCompare(b.vehicle));

  const totals = {
    revenue: round2(rows.reduce((s, r) => s + r.revenue, 0)),
    operatingExpenses: round2(rows.reduce((s, r) => s + r.operatingExpenses, 0)),
    emi: round2(rows.reduce((s, r) => s + r.emi, 0)),
    net: round2(rows.reduce((s, r) => s + r.net, 0)),
  };

  return {
    columns: [
      { key: "vehicle", label: "Vehicle", type: "string" },
      { key: "registrationNumber", label: "Registration", type: "string" },
      { key: "revenue", label: "Revenue", type: "currency" },
      { key: "operatingExpenses", label: "Operating Expenses", type: "currency" },
      { key: "emi", label: "EMI", type: "currency" },
      { key: "net", label: "Net", type: "currency" },
    ],
    rows,
    totals,
    meta: { from: dayKey(from), to: dayKey(to) },
  };
});
