import { db } from "@/lib/db";
import { handleRoute } from "@/lib/api-helpers";
import { round2 } from "@/lib/money";
import { dayKey, reportRange } from "@/app/api/_lib/engine";

// GET /api/reports/employee-earnings?from=&to=[&employeeId=]
// Per-employee payout summary for deployments + advances in the range.
// When employeeId is given, the response additionally carries:
//   employee  — profile header (name, code, designation, status)
//   days      — day-by-day sheet: date → property → shift → earnings
//   propertySummary — shifts & earnings per property for that employee
export const GET = handleRoute(async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const { from, to } = reportRange(sp);
  const employeeId = sp.get("employeeId");

  const [deps, advAgg] = await Promise.all([
    db.deployment.findMany({
      where: {
        date: { gte: from, lte: to },
        ...(employeeId ? { employeeId } : {}),
      },
      select: {
        employeeId: true,
        employee: { select: { fullName: true, code: true, designation: true, status: true } },
        propertyId: true,
        property: { select: { name: true } },
        date: true,
        shift: true,
        payoutRate: true,
        payoutAmount: true,
      },
      orderBy: [{ employeeId: "asc" }, { date: "asc" }, { shift: "asc" }],
    }),
    db.advance.groupBy({
      by: ["employeeId"],
      _sum: { amount: true },
      where: { date: { gte: from, lte: to }, ...(employeeId ? { employeeId } : {}) },
    }),
  ]);

  const byEmp = new Map<
    string,
    {
      employeeName: string; employeeCode: string; designation: string | null;
      shifts: number; dayShifts: number; nightShifts: number; props: Set<string>; earnings: number;
    }
  >();
  for (const d of deps) {
    const row = byEmp.get(d.employeeId) ?? {
      employeeName: d.employee.fullName,
      employeeCode: d.employee.code,
      designation: d.employee.designation,
      shifts: 0, dayShifts: 0, nightShifts: 0, props: new Set<string>(), earnings: 0,
    };
    row.shifts++;
    const s = d.shift.toUpperCase();
    if (s === "DAY" || s === "FULL") row.dayShifts++;
    if (s === "NIGHT" || s === "FULL") row.nightShifts++;
    row.props.add(d.propertyId);
    row.earnings = round2(row.earnings + d.payoutAmount);
    byEmp.set(d.employeeId, row);
  }
  const advBy = new Map(advAgg.map((a) => [a.employeeId, round2(a._sum.amount ?? 0)]));

  const rows = [...byEmp.entries()]
    .map(([employeeId2, r]) => {
      const advances = advBy.get(employeeId2) ?? 0;
      return {
        employeeId: employeeId2,
        employeeName: r.employeeName,
        employeeCode: r.employeeCode,
        shifts: r.shifts,
        dayShifts: r.dayShifts,
        nightShifts: r.nightShifts,
        properties: r.props.size,
        earnings: r.earnings,
        advances,
        netPayable: round2(r.earnings - advances),
      };
    })
    .sort((a, b) => b.earnings - a.earnings);

  const totals = {
    shifts: rows.reduce((s, r) => s + r.shifts, 0),
    earnings: round2(rows.reduce((s, r) => s + r.earnings, 0)),
    advances: round2(rows.reduce((s, r) => s + r.advances, 0)),
    netPayable: round2(rows.reduce((s, r) => s + r.netPayable, 0)),
  };

  const payload: Record<string, unknown> = {
    columns: [
      { key: "employeeName", label: "Employee", type: "string" },
      { key: "employeeCode", label: "Code", type: "string" },
      { key: "shifts", label: "Shifts", type: "number" },
      { key: "dayShifts", label: "Day", type: "number" },
      { key: "nightShifts", label: "Night", type: "number" },
      { key: "properties", label: "Properties", type: "number" },
      { key: "earnings", label: "Earnings", type: "currency" },
      { key: "advances", label: "Advances", type: "currency" },
      { key: "netPayable", label: "Net Payable", type: "currency" },
    ],
    rows,
    totals,
    meta: { from: dayKey(from), to: dayKey(to) },
  };

  // ---- Drill-down: single employee day-by-day movement sheet ----
  if (employeeId) {
    const empDeps = deps.filter((d) => d.employeeId === employeeId);
    const days = empDeps.map((d) => ({
      date: dayKey(d.date),
      propertyName: d.property.name,
      shift: d.shift,
      payoutRate: round2(d.payoutRate),
      earnings: round2(d.payoutAmount),
    }));

    const propMap = new Map<string, { propertyName: string; shifts: number; dayShifts: number; nightShifts: number; earnings: number }>();
    for (const d of empDeps) {
      const r = propMap.get(d.propertyId) ?? {
        propertyName: d.property.name, shifts: 0, dayShifts: 0, nightShifts: 0, earnings: 0,
      };
      r.shifts++;
      const s = d.shift.toUpperCase();
      if (s === "DAY" || s === "FULL") r.dayShifts++;
      if (s === "NIGHT" || s === "FULL") r.nightShifts++;
      r.earnings = round2(r.earnings + d.payoutAmount);
      propMap.set(d.propertyId, r);
    }

    const profile = empDeps[0]?.employee ?? null;
    payload.employee = profile
      ? {
          id: employeeId,
          fullName: profile.fullName,
          code: profile.code,
          designation: profile.designation,
          status: profile.status,
        }
      : null;
    payload.days = days;
    payload.propertySummary = [...propMap.values()].sort((a, b) => b.earnings - a.earnings);
    payload.dayTotals = {
      daysWorked: new Set(days.map((d) => d.date)).size,
      shifts: days.length,
      earnings: round2(days.reduce((s, d) => s + d.earnings, 0)),
    };
  }

  return payload;
});
