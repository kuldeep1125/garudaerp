import { db } from "@/lib/db";
import { handleRoute } from "@/lib/api-helpers";
import { round2 } from "@/lib/money";
import { dayKey, reportRange } from "@/app/api/_lib/engine";

// GET /api/reports/property-revenue?from=&to=
// Per-property billing vs collections in the range (received = payments dated in range).
export const GET = handleRoute(async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const { from, to } = reportRange(sp);

  const [deps, payAgg] = await Promise.all([
    db.deployment.findMany({
      where: { date: { gte: from, lte: to } },
      select: {
        propertyId: true,
        property: { select: { name: true } },
        employeeId: true,
        billingAmount: true,
      },
    }),
    db.propertyPayment.groupBy({ by: ["propertyId"], _sum: { amount: true }, where: { date: { gte: from, lte: to } } }),
  ]);

  const byProp = new Map<
    string,
    { propertyName: string; employees: Set<string>; shifts: number; billing: number; received: number }
  >();
  for (const d of deps) {
    const row = byProp.get(d.propertyId) ?? {
      propertyName: d.property.name,
      employees: new Set<string>(),
      shifts: 0,
      billing: 0,
      received: 0,
    };
    row.employees.add(d.employeeId);
    row.shifts++;
    row.billing = round2(row.billing + d.billingAmount);
    byProp.set(d.propertyId, row);
  }
  for (const p of payAgg) {
    const row = byProp.get(p.propertyId);
    if (row) row.received = round2(p._sum.amount ?? 0);
  }

  const rows = [...byProp.entries()]
    .map(([propertyId, r]) => ({
      propertyId,
      propertyName: r.propertyName,
      employees: r.employees.size,
      shifts: r.shifts,
      billing: r.billing,
      received: r.received,
      // Payments dated in the window may settle billings from before it — clamp
      // so an over-collected property shows ₹0 due instead of a negative number.
      outstanding: Math.max(0, round2(r.billing - r.received)),
      collectionPct: r.billing > 0 ? Math.min(100, Math.round((r.received / r.billing) * 100)) : 0,
    }))
    .sort((a, b) => b.billing - a.billing);

  const totals = {
    shifts: rows.reduce((s, r) => s + r.shifts, 0),
    billing: round2(rows.reduce((s, r) => s + r.billing, 0)),
    received: round2(rows.reduce((s, r) => s + r.received, 0)),
    outstanding: round2(rows.reduce((s, r) => s + r.outstanding, 0)),
  };

  const focusId = sp.get("propertyId")?.trim();
  const focusName = sp.get("propertyName")?.trim();
  const matchedProp = focusId
    ? rows.find((r) => r.propertyId === focusId)
    : focusName
    ? rows.find((r) => r.propertyName.toLowerCase() === focusName.toLowerCase())
    : null;

  const payload: Record<string, unknown> = {
    columns: [
      { key: "propertyName", label: "Property", type: "string" },
      { key: "employees", label: "Employees", type: "number" },
      { key: "shifts", label: "Shifts", type: "number" },
      { key: "billing", label: "Billed", type: "currency" },
      { key: "received", label: "Received", type: "currency" },
      { key: "outstanding", label: "Outstanding", type: "currency" },
      { key: "collectionPct", label: "Collection %", type: "number" },
    ],
    rows,
    totals,
    properties: rows.map((r) => ({ id: r.propertyId, name: r.propertyName })),
    note: "Received is payments dated in the period and may include collections against earlier billings; Outstanding is clamped at ₹0 when a property is over-collected.",
    meta: { from: dayKey(from), to: dayKey(to) },
  };

  // Drill-down: one property's detailed billing statement (deployments + payments)
  if (matchedProp) {
    const propId = matchedProp.propertyId;
    const [property, itemizedDeps, itemizedPays] = await Promise.all([
      db.property.findUnique({
        where: { id: propId },
        select: { id: true, name: true, contactPerson: true, contactNumber: true, address: true, billingRate: true },
      }),
      db.deployment.findMany({
        where: { propertyId: propId, date: { gte: from, lte: to } },
        select: {
          date: true,
          shift: true,
          billingRate: true,
          billingAmount: true,
          employee: { select: { code: true, fullName: true, designation: true } },
        },
        orderBy: [{ date: "asc" }, { shift: "asc" }],
      }),
      db.propertyPayment.findMany({
        where: { propertyId: propId, date: { gte: from, lte: to } },
        select: { id: true, date: true, amount: true, method: true, reference: true },
        orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      }),
    ]);

    payload.property = property ? {
      ...property,
      phone: property.contactNumber,
      defaultBillingRate: property.billingRate,
    } : null;
    payload.deployments = itemizedDeps.map((d) => ({
      date: dayKey(d.date),
      shift: d.shift,
      employeeCode: d.employee.code,
      employeeName: d.employee.fullName,
      designation: d.employee.designation,
      billingRate: round2(d.billingRate),
      billingAmount: round2(d.billingAmount),
    }));
    payload.payments = itemizedPays.map((p) => ({
      id: p.id,
      date: dayKey(p.date),
      amount: round2(p.amount),
      paymentMode: p.method,
      referenceNote: p.reference,
    }));
    payload.propertySummary = {
      propertyId: propId,
      propertyName: matchedProp.propertyName,
      shifts: matchedProp.shifts,
      employees: matchedProp.employees,
      billing: matchedProp.billing,
      received: matchedProp.received,
      outstanding: matchedProp.outstanding,
      collectionPct: matchedProp.collectionPct,
    };
  }

  return payload;
});
