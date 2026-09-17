import { db } from "@/lib/db";
import { handleRoute, parseDate, startOfDay, endOfDay, HttpError } from "@/lib/api-helpers";
import { round2 } from "@/lib/money";
import { dayKey } from "@/app/api/_lib/engine";

// GET /api/reports/daily-operations?date=YYYY-MM-DD[&propertyId=]
// Every deployment of the day for the operations sheet. With propertyId:
// filtered to one property + property header + per-property summary rows
// (who came, which shift, rates, billing vs payout).
export const GET = handleRoute(async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const date = sp.get("date") ? parseDate(sp.get("date")) : new Date();
  const from = startOfDay(date);
  const to = endOfDay(date);
  const propertyId = sp.get("propertyId");

  let propertyName: string | null = null;
  if (propertyId) {
    const prop = await db.property.findUnique({ where: { id: propertyId }, select: { name: true } });
    if (!prop) throw new HttpError(404, "Property not found");
    propertyName = prop.name;
  }

  const deps = await db.deployment.findMany({
    where: { date: { gte: from, lte: to }, ...(propertyId ? { propertyId } : {}) },
    orderBy: [{ property: { name: "asc" } }, { shift: "asc" }, { employee: { fullName: "asc" } }],
    include: {
      employee: { select: { fullName: true, code: true, designation: true } },
      property: { select: { name: true } },
    },
  });

  const rows = deps.map((d) => ({
    id: d.id,
    employeeId: d.employeeId,
    propertyId: d.propertyId,
    propertyName: d.property.name,
    employeeName: d.employee.fullName,
    employeeCode: d.employee.code,
    designation: d.employee.designation,
    shift: d.shift,
    billingRate: round2(d.billingRate),
    payoutRate: round2(d.payoutRate),
    billing: round2(d.billingAmount),
    payout: round2(d.payoutAmount),
  }));

  const totals = {
    deployments: rows.length,
    employees: new Set(rows.map((r) => r.employeeCode)).size,
    billing: round2(rows.reduce((s, r) => s + r.billing, 0)),
    payout: round2(rows.reduce((s, r) => s + r.payout, 0)),
  };

  // Per-property rollup — how many employees & shifts per property that day
  const propMap = new Map<string, { propertyName: string; employees: number; dayShifts: number; nightShifts: number; billing: number; payout: number }>();
  const empSeen = new Map<string, Set<string>>();
  for (const r of rows) {
    const p = propMap.get(r.propertyName) ?? {
      propertyName: r.propertyName, employees: 0, dayShifts: 0, nightShifts: 0, billing: 0, payout: 0,
    };
    const seen = empSeen.get(r.propertyName) ?? new Set<string>();
    if (!seen.has(r.employeeCode)) {
      seen.add(r.employeeCode);
      p.employees++;
      empSeen.set(r.propertyName, seen);
    }
    const s = r.shift.toUpperCase();
    if (s === "DAY" || s === "FULL") p.dayShifts++;
    if (s === "NIGHT" || s === "FULL") p.nightShifts++;
    p.billing = round2(p.billing + r.billing);
    p.payout = round2(p.payout + r.payout);
    propMap.set(r.propertyName, p);
  }

  const columns = [
    { key: "propertyName", label: "Property", type: "string" },
    { key: "employeeName", label: "Employee", type: "string" },
    { key: "employeeCode", label: "Code", type: "string" },
    { key: "shift", label: "Shift", type: "string" },
    { key: "billingRate", label: "Billing Rate", type: "currency" },
    { key: "payoutRate", label: "Payout Rate", type: "currency" },
    { key: "billing", label: "Billing", type: "currency" },
    { key: "payout", label: "Payout", type: "currency" },
  ];

  const payload: Record<string, unknown> = {
    columns: propertyId
      ? columns.filter((c) => c.key !== "propertyName")
      : columns,
    rows,
    totals,
    meta: { date: dayKey(date), ...(propertyId && propertyName ? { property: propertyName } : {}) },
    propertySummary: [...propMap.values()].sort((a, b) => b.billing - a.billing),
  };
  return payload;
});
