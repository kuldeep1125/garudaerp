import { db } from "@/lib/db";
import { handleRoute } from "@/lib/api-helpers";
import { round2 } from "@/lib/money";
import { dayKey, reportRange } from "@/app/api/_lib/engine";

// GET /api/reports/contractor-commissions?from=&to=
// Contractor commission earned from deployments in the range (the cut is
// snapshotted per deployment — the report can never drift from the ledger).
// Rows: per contractor × month. Drill-down `contractor=<name>` adds the
// deployment-level detail sheet (date, employee, property, units, cut).
export const GET = handleRoute(async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const { from, to } = reportRange(sp);
  const focus = sp.get("contractor")?.trim();

  const deps = await db.deployment.findMany({
    where: { contractorName: { not: null }, date: { gte: from, lte: to } },
    select: {
      contractorName: true,
      date: true,
      shift: true,
      contractorRateCut: true,
      contractorCut: true,
      employee: { select: { fullName: true, code: true } },
      property: { select: { name: true } },
    },
    orderBy: [{ contractorName: "asc" }, { date: "asc" }],
  });

  const SHIFT_UNITS: Record<string, number> = { DAY: 1, NIGHT: 1, FULL: 2 };
  const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

  interface Row {
    contractor: string;
    month: string;
    deployments: number;
    units: number;
    employees: number;
    commission: number;
  }
  const byKey = new Map<string, Row>();
  const employeeSets = new Map<string, Set<string>>();
  for (const d of deps) {
    const name = d.contractorName as string;
    if (focus && name !== focus) continue;
    const mk = monthKey(d.date);
    const key = `${name}||${mk}`;
    const row = byKey.get(key) ?? { contractor: name, month: mk, deployments: 0, units: 0, employees: 0, commission: 0 };
    row.deployments += 1;
    row.units += SHIFT_UNITS[d.shift.toUpperCase()] ?? 1;
    row.commission = round2(row.commission + d.contractorCut);
    byKey.set(key, row);
    const empKey = `${name}||${mk}`;
    const set = employeeSets.get(empKey) ?? new Set<string>();
    set.add(`${d.employee.code} — ${d.employee.fullName}`);
    employeeSets.set(empKey, set);
  }
  const rows = [...byKey.values()]
    .map((r) => ({ ...r, employees: employeeSets.get(`${r.contractor}||${r.month}`)?.size ?? 0 }))
    .sort((a, b) => a.contractor.localeCompare(b.contractor) || a.month.localeCompare(b.month));

  const totals = {
    deployments: rows.reduce((s, r) => s + r.deployments, 0),
    units: rows.reduce((s, r) => s + r.units, 0),
    commission: round2(rows.reduce((s, r) => s + r.commission, 0)),
  };

  const payload: Record<string, unknown> = {
    columns: [
      { key: "contractor", label: "Contractor", type: "string" },
      { key: "month", label: "Month", type: "string" },
      { key: "deployments", label: "Deployments", type: "number" },
      { key: "units", label: "Shift Units", type: "number" },
      { key: "employees", label: "Employees", type: "number" },
      { key: "commission", label: "Commission", type: "currency" },
    ],
    rows,
    totals,
    contractorNames: Array.from(new Set(deps.map((d) => d.contractorName as string).filter(Boolean))).sort(),
    meta: { from: dayKey(from), to: dayKey(to) },
    note:
      "Commission = the contractor's per-shift cut × shift units, snapshotted on every deployment. The cut is paid out of the employee's payout, so the business total employee cost does not change — this report shows how that cost splits between employees and contractors.",
  };

  // Drill-down: one contractor's deployment-level sheet.
  if (focus) {
    const focusDeps = deps.filter((d) => d.contractorName === focus);
    payload.contractor = focus;
    payload.days = focusDeps.map((d) => ({
      date: dayKey(d.date),
      employeeCode: d.employee.code,
      employeeName: d.employee.fullName,
      propertyName: d.property.name,
      shift: d.shift,
      units: SHIFT_UNITS[d.shift.toUpperCase()] ?? 1,
      rate: round2(d.contractorRateCut),
      commission: round2(d.contractorCut),
    }));
    payload.dayTotals = {
      deployments: focusDeps.length,
      units: focusDeps.reduce((s, d) => s + (SHIFT_UNITS[d.shift.toUpperCase()] ?? 1), 0),
      commission: round2(focusDeps.reduce((s, d) => s + d.contractorCut, 0)),
      employees: new Set(focusDeps.map((d) => d.employee.code)).size,
    };
  }

  return payload;
});
