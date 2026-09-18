import { db } from "@/lib/db";
import { handleRoute } from "@/lib/api-helpers";
import { round2 } from "@/lib/money";
import { dayKey, reportRange } from "@/app/api/_lib/engine";

// GET /api/reports/transport-statement?from=&to=&vehicleId=&clientId=
// Comprehensive Transport Fleet Operational & Financial Statement.
export const GET = handleRoute(async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const { from, to } = reportRange(sp);
  const vehicleId = sp.get("vehicleId") || undefined;
  const clientId = sp.get("clientId") || undefined;

  const [trips, expenses, emiPayments, vehicles, clients] = await Promise.all([
    db.trip.findMany({
      where: {
        startAt: { gte: from, lte: to },
        status: { not: "CANCELLED" },
        ...(vehicleId ? { vehicleId } : {}),
        ...(clientId ? { clientId } : {}),
      },
      include: {
        vehicle: { select: { id: true, name: true, registrationNumber: true } },
        client: { select: { id: true, name: true, company: true } },
      },
      orderBy: { startAt: "desc" },
    }),
    db.expense.findMany({
      where: {
        business: "TRANSPORT",
        date: { gte: from, lte: to },
        ...(vehicleId ? { vehicleId } : {}),
      },
      orderBy: { date: "desc" },
    }),
    db.vehicleEmiPayment.findMany({
      where: {
        paidDate: { gte: from, lte: to },
        status: "PAID",
        ...(vehicleId ? { vehicleId } : {}),
      },
      include: { vehicle: { select: { id: true, name: true, registrationNumber: true } } },
    }),
    db.vehicle.findMany({ select: { id: true, name: true, registrationNumber: true } }),
    db.client.findMany({ select: { id: true, name: true, company: true } }),
  ]);

  // Aggregate by Vehicle
  const vehicleMap = new Map<string, {
    vehicleId: string;
    vehicleName: string;
    registration: string;
    tripsCount: number;
    revenue: number;
    collected: number;
    pending: number;
    opex: number;
    emi: number;
  }>();

  // Aggregate by Client
  const clientMap = new Map<string, {
    clientId: string;
    clientName: string;
    tripsCount: number;
    totalBilled: number;
    totalPaid: number;
    outstanding: number;
  }>();

  let totalRevenue = 0;
  let totalCollected = 0;

  for (const t of trips) {
    const rev = round2(t.finalAmount ?? (t.agreedAmount + t.extraCharges));
    const paid = round2(t.paidAmount);
    const pending = round2(Math.max(0, rev - paid));

    totalRevenue = round2(totalRevenue + rev);
    totalCollected = round2(totalCollected + paid);

    // Vehicle
    const v = vehicleMap.get(t.vehicleId) ?? {
      vehicleId: t.vehicleId,
      vehicleName: t.vehicle.name,
      registration: t.vehicle.registrationNumber,
      tripsCount: 0,
      revenue: 0,
      collected: 0,
      pending: 0,
      opex: 0,
      emi: 0,
    };
    v.tripsCount += 1;
    v.revenue = round2(v.revenue + rev);
    v.collected = round2(v.collected + paid);
    v.pending = round2(v.pending + pending);
    vehicleMap.set(t.vehicleId, v);

    // Client
    const c = clientMap.get(t.clientId) ?? {
      clientId: t.clientId,
      clientName: t.client.name,
      tripsCount: 0,
      totalBilled: 0,
      totalPaid: 0,
      outstanding: 0,
    };
    c.tripsCount += 1;
    c.totalBilled = round2(c.totalBilled + rev);
    c.totalPaid = round2(c.totalPaid + paid);
    c.outstanding = round2(c.outstanding + pending);
    clientMap.set(t.clientId, c);
  }

  // Allocate Operating Expenses
  let totalOpex = 0;
  for (const e of expenses) {
    totalOpex = round2(totalOpex + e.amount);
    if (e.vehicleId && vehicleMap.has(e.vehicleId)) {
      const v = vehicleMap.get(e.vehicleId)!;
      v.opex = round2(v.opex + e.amount);
    }
  }

  // Allocate EMI
  let totalEmi = 0;
  for (const emi of emiPayments) {
    totalEmi = round2(totalEmi + emi.amount);
    if (vehicleMap.has(emi.vehicleId)) {
      const v = vehicleMap.get(emi.vehicleId)!;
      v.emi = round2(v.emi + emi.amount);
    }
  }

  const vehicleRows = Array.from(vehicleMap.values()).map((v) => {
    const net = round2(v.revenue - v.opex - v.emi);
    const marginPct = v.revenue > 0 ? Math.round((net / v.revenue) * 100) : 0;
    return {
      ...v,
      net,
      marginPct,
    };
  }).sort((a, b) => b.revenue - a.revenue);

  const clientRows = Array.from(clientMap.values()).sort((a, b) => b.totalBilled - a.totalBilled);

  const netTransportProfit = round2(totalRevenue - totalOpex - totalEmi);
  const overallMarginPct = totalRevenue > 0 ? Math.round((netTransportProfit / totalRevenue) * 100) : 0;

  return {
    columns: [
      { key: "vehicleName", label: "Vehicle", type: "string" },
      { key: "registration", label: "Reg. Number", type: "string" },
      { key: "tripsCount", label: "Completed Trips", type: "number" },
      { key: "revenue", label: "Revenue", type: "money" },
      { key: "opex", label: "Fuel & Repairs", type: "money" },
      { key: "emi", label: "Loan EMI", type: "money" },
      { key: "net", label: "Net Profit", type: "money" },
      { key: "marginPct", label: "Margin %", type: "number" },
    ],
    rows: vehicleRows,
    totals: {
      tripsCount: trips.length,
      revenue: totalRevenue,
      collected: totalCollected,
      pending: round2(totalRevenue - totalCollected),
      opex: totalOpex,
      emi: totalEmi,
      net: netTransportProfit,
      marginPct: overallMarginPct,
    },
    summary: {
      period: `${dayKey(from)} → ${dayKey(to)}`,
      totalTrips: trips.length,
      activeVehicles: vehicleRows.length,
      totalRevenue,
      totalCollected,
      pendingReceivables: round2(totalRevenue - totalCollected),
      operatingCosts: totalOpex,
      emiCost: totalEmi,
      netProfit: netTransportProfit,
      marginPct: overallMarginPct,
    },
    clients: clientRows,
    trips: trips.map((t) => ({
      id: t.id,
      date: dayKey(t.startAt),
      vehicle: t.vehicle.name,
      registration: t.vehicle.registrationNumber,
      client: t.client.name,
      pickup: t.pickup,
      destination: t.destination,
      rentalType: t.rentalType,
      status: t.status,
      fare: round2(t.finalAmount ?? (t.agreedAmount + t.extraCharges)),
      paid: round2(t.paidAmount),
      pending: round2(Math.max(0, (t.finalAmount ?? (t.agreedAmount + t.extraCharges)) - t.paidAmount)),
    })),
    note: "Consolidated Transport business statement combining fleet rental revenues, client receivables, fuel/maintenance operating expenses, and vehicle EMI schedules.",
  };
});
