import { db } from "@/lib/db";
import { handleRoute } from "@/lib/api-helpers";
import { round2 } from "@/lib/money";
import { dayKey, reportRange, salaryRentOvertimeForRange } from "@/app/api/_lib/engine";

// GET /api/reports/employee-earnings?from=&to=[&employeeId=]
// Per-employee earnings for the range: shift payouts + salaried salary/overtime
// accrual (the SAME formula the cost metrics use), advances deducted, and the
// contractor commission shown separately (paid out of the payout).
// When employeeId is given, the response additionally carries:
//   employee  — profile header (name, code, designation, status)
//   days      — day-by-day sheet: date → property → shift → earnings
//   propertySummary — shifts & earnings per property for that employee
export const GET = handleRoute(async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const { from, to } = reportRange(sp);
  const employeeId = sp.get("employeeId");

  const [deps, advAgg, cutAgg, salaried] = await Promise.all([
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
        contractorCut: true,
      },
      orderBy: [{ employeeId: "asc" }, { date: "asc" }, { shift: "asc" }],
    }),
    db.advance.groupBy({
      by: ["employeeId"],
      _sum: { amount: true },
      where: { date: { gte: from, lte: to }, ...(employeeId ? { employeeId } : {}) },
    }),
    db.deployment.groupBy({
      by: ["employeeId"],
      _sum: { contractorCut: true },
      where: { date: { gte: from, lte: to }, contractorCut: { gt: 0 }, ...(employeeId ? { employeeId } : {}) },
    }),
    // Salaried employees earn salary even with zero deployments — include them all
    // (current salaried + anyone whose pay history has salaried terms, so a past
    // period report still shows salary for an employee since switched to per-shift).
    db.employee.findMany({
      where: { OR: [{ employmentType: "SALARIED" }, { payHistory: { some: { employmentType: "SALARIED" } } }], ...(employeeId ? { id: employeeId } : {}) },
      select: { id: true, fullName: true, code: true, designation: true, status: true, joiningDate: true, employmentType: true, monthlySalary: true, overtimeThreshold: true, overtimeRate: true, standardRate: true, onBusinessRent: true, rentAmount: true, rentMode: true, hasContractor: true, contractorName: true, contractorRateCut: true },
    }),
  ]);

  interface EmpRow {
    employeeName: string; employeeCode: string; designation: string | null;
    shifts: number; dayShifts: number; nightShifts: number; props: Set<string>; earnings: number;
    salary: number; overtime: number;
  }
  const byEmp = new Map<string, EmpRow>();
  for (const d of deps) {
    const row = byEmp.get(d.employeeId) ?? {
      employeeName: d.employee.fullName,
      employeeCode: d.employee.code,
      designation: d.employee.designation,
      shifts: 0, dayShifts: 0, nightShifts: 0, props: new Set<string>(), earnings: 0,
      salary: 0, overtime: 0,
    };
    row.shifts++;
    const s = d.shift.toUpperCase();
    if (s === "DAY" || s === "FULL") row.dayShifts++;
    if (s === "NIGHT" || s === "FULL") row.nightShifts++;
    row.props.add(d.propertyId);
    row.earnings = round2(row.earnings + d.payoutAmount);
    byEmp.set(d.employeeId, row);
  }
  // Salaried accrual merged in — zero-deployment salaried employees get their own row.
  for (const emp of salaried) {
    const so = await salaryRentOvertimeForRange(emp, from, to);
    const row = byEmp.get(emp.id) ?? {
      employeeName: emp.fullName,
      employeeCode: emp.code,
      designation: emp.designation,
      shifts: 0, dayShifts: 0, nightShifts: 0, props: new Set<string>(), earnings: 0,
      salary: 0, overtime: 0,
    };
    row.salary = so.salary;
    row.overtime = so.overtime;
    row.earnings = round2(row.earnings + so.salary + so.overtime);
    byEmp.set(emp.id, row);
  }
  const advBy = new Map(advAgg.map((a) => [a.employeeId, round2(a._sum.amount ?? 0)]));
  const cutBy = new Map(cutAgg.map((a) => [a.employeeId, round2(a._sum.contractorCut ?? 0)]));

  const rows = [...byEmp.entries()]
    .map(([employeeId2, r]) => {
      const advances = advBy.get(employeeId2) ?? 0;
      const contractorCut = cutBy.get(employeeId2) ?? 0;
      return {
        employeeId: employeeId2,
        employeeName: r.employeeName,
        employeeCode: r.employeeCode,
        shifts: r.shifts,
        dayShifts: r.dayShifts,
        nightShifts: r.nightShifts,
        properties: r.props.size,
        earnings: r.earnings,
        salaryPart: r.salary,
        overtimePart: r.overtime,
        advances,
        contractorCut,
        netPayable: round2(r.earnings - advances - contractorCut),
      };
    })
    .sort((a, b) => b.earnings - a.earnings);

  const totals = {
    shifts: rows.reduce((s, r) => s + r.shifts, 0),
    earnings: round2(rows.reduce((s, r) => s + r.earnings, 0)),
    advances: round2(rows.reduce((s, r) => s + r.advances, 0)),
    contractorCut: round2(rows.reduce((s, r) => s + r.contractorCut, 0)),
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
      { key: "salaryPart", label: "· Salary", type: "currency" },
      { key: "overtimePart", label: "· Overtime", type: "currency" },
      { key: "advances", label: "Advances", type: "currency" },
      { key: "contractorCut", label: "Contractor Cut", type: "currency" },
      { key: "netPayable", label: "Net Payable", type: "currency" },
    ],
    rows,
    totals,
    meta: { from: dayKey(from), to: dayKey(to) },
    note: "Earnings = shift payouts + salaried salary + overtime accrual. Net payable = earnings − advances − contractor commission (the contractor's cut is paid out of the employee's payout).",
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
