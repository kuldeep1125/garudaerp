import { db } from "@/lib/db";
import { handleRoute } from "@/lib/api-helpers";
import { round2 } from "@/lib/money";
import { BILLABLE, dayKey, reportRange } from "@/app/api/_lib/engine";

// GET /api/reports/employee-earnings?from=&to=
// Per-employee payout summary for billable deployments + advances taken in the range.
export const GET = handleRoute(async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const { from, to } = reportRange(sp);

  const [deps, advAgg] = await Promise.all([
    db.deployment.findMany({
      where: { date: { gte: from, lte: to }, status: { in: [...BILLABLE] } },
      select: {
        employeeId: true,
        employee: { select: { fullName: true, code: true } },
        propertyId: true,
        shift: true,
        payoutAmount: true,
      },
    }),
    db.advance.groupBy({ by: ["employeeId"], _sum: { amount: true }, where: { date: { gte: from, lte: to } } }),
  ]);

  const byEmp = new Map<
    string,
    { employeeName: string; employeeCode: string; shifts: number; dayShifts: number; nightShifts: number; props: Set<string>; earnings: number }
  >();
  for (const d of deps) {
    const row = byEmp.get(d.employeeId) ?? {
      employeeName: d.employee.fullName,
      employeeCode: d.employee.code,
      shifts: 0,
      dayShifts: 0,
      nightShifts: 0,
      props: new Set<string>(),
      earnings: 0,
    };
    row.shifts++;
    if (d.shift.toUpperCase().includes("DAY")) row.dayShifts++;
    if (d.shift.toUpperCase().includes("NIGHT")) row.nightShifts++;
    row.props.add(d.propertyId);
    row.earnings = round2(row.earnings + d.payoutAmount);
    byEmp.set(d.employeeId, row);
  }
  const advBy = new Map(advAgg.map((a) => [a.employeeId, round2(a._sum.amount ?? 0)]));

  const rows = [...byEmp.entries()]
    .map(([employeeId, r]) => {
      const advances = advBy.get(employeeId) ?? 0;
      return {
        employeeId,
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

  return {
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
});
