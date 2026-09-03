import { db } from "@/lib/db";
import { handleRoute } from "@/lib/api-helpers";
import { round2 } from "@/lib/money";
import { BILLABLE, dayKey, reportRange } from "@/app/api/_lib/engine";

// GET /api/reports/property-revenue?from=&to=
// Per-property billing vs collections in the range (received = payments dated in range).
export const GET = handleRoute(async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const { from, to } = reportRange(sp);

  const [deps, payAgg] = await Promise.all([
    db.deployment.findMany({
      where: { date: { gte: from, lte: to }, status: { in: [...BILLABLE] } },
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

  const rows = [...byProp.values()]
    .map((r) => ({
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

  return {
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
    note: "Received is payments dated in the period and may include collections against earlier billings; Outstanding is clamped at ₹0 when a property is over-collected.",
    meta: { from: dayKey(from), to: dayKey(to) },
  };
});
