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

  const focusId = sp.get("vehicleId")?.trim();
  const matchedVehicle = focusId ? rows.find((r) => r.vehicleId === focusId) : null;

  const payload: Record<string, unknown> = {
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
    vehicles: vehicles.map((v) => ({ id: v.id, name: v.name, registrationNumber: v.registrationNumber })),
    meta: { from: dayKey(from), to: dayKey(to) },
  };

  if (matchedVehicle) {
    const vId = matchedVehicle.vehicleId;
    const [vRec, itemizedTrips, itemizedExp, itemizedEmis] = await Promise.all([
      db.vehicle.findUnique({
        where: { id: vId },
        select: { id: true, name: true, registrationNumber: true, make: true, model: true, year: true },
      }),
      db.trip.findMany({
        where: { vehicleId: vId, startAt: { gte: from, lte: to }, status: { not: "CANCELLED" } },
        select: {
          id: true,
          startAt: true,
          client: { select: { name: true, company: true } },
          pickup: true,
          destination: true,
          rentalType: true,
          agreedAmount: true,
          extraCharges: true,
          finalAmount: true,
          paidAmount: true,
          status: true,
        },
        orderBy: [{ startAt: "asc" }],
      }),
      db.expense.findMany({
        where: { vehicleId: vId, business: "TRANSPORT", date: { gte: from, lte: to } },
        select: { id: true, date: true, categoryName: true, description: true, amount: true, kind: true },
        orderBy: [{ date: "asc" }],
      }),
      db.vehicleEmiPayment.findMany({
        where: { vehicleId: vId, dueDate: { gte: from, lte: to } },
        select: { id: true, month: true, dueDate: true, paidDate: true, amount: true, status: true },
        orderBy: [{ dueDate: "asc" }],
      }),
    ]);

    payload.vehicle = vRec;
    payload.trips = itemizedTrips.map((t) => {
      const fare = t.finalAmount ?? (t.agreedAmount + (t.extraCharges ?? 0));
      return {
        id: t.id,
        date: dayKey(t.startAt),
        client: t.client ? (t.client.company ? `${t.client.name} (${t.client.company})` : t.client.name) : "—",
        route: `${t.pickup ?? "—"} → ${t.destination ?? "—"}`,
        rentalType: t.rentalType,
        fare: round2(fare),
        paidAmount: round2(t.paidAmount),
        status: t.status,
      };
    });
    payload.expenses = itemizedExp.map((e) => ({
      id: e.id,
      date: dayKey(e.date),
      categoryName: e.categoryName ?? "General",
      description: e.description ?? "—",
      amount: round2(e.amount),
      kind: e.kind,
    }));
    payload.emis = itemizedEmis.map((m) => ({
      id: m.id,
      month: m.month,
      dueDate: dayKey(m.dueDate),
      paidAt: m.paidDate ? dayKey(m.paidDate) : null,
      amount: round2(m.amount),
      isPaid: m.status === "PAID",
    }));
    payload.vehicleSummary = {
      vehicleId: vId,
      name: matchedVehicle.vehicle,
      registrationNumber: matchedVehicle.registrationNumber,
      revenue: matchedVehicle.revenue,
      operatingExpenses: matchedVehicle.operatingExpenses,
      emi: matchedVehicle.emi,
      net: matchedVehicle.net,
      tripsCount: itemizedTrips.length,
      expensesCount: itemizedExp.length,
    };
  }

  return payload;
});
