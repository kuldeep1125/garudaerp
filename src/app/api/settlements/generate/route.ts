import { db } from "@/lib/db";
import { handleRoute, readBody, requireFields, monthBounds, endOfDay, parseDate } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { round2 } from "@/lib/money";
import { startOfDay, salariedMonthPay, monthRentForEmployee, payValuesOf, dayKey } from "@/app/api/_lib/engine";

/**
 * Settlement engine:
 * - Deletes previous DRAFT settlements of the month (or for the target employee) releasing linked advances.
 * - FINALIZED/PAID settlements are untouched; those employees are skipped.
 * - Options supported:
 *   - Target: All employees OR a specific employee (employeeId).
 *   - Cut-off: Till Month EOD (full month), Till Date (Today), or Custom Date (customDate).
 * - SALARIED gross = salary (prorated per active day up to cut-off) + overtime ((deployments − threshold) × rate).
 * - Accommodation rent is auto-deducted directly from the salary/earnings (prorated up to cut-off).
 * - Contractor commission (Σ snapshotted cuts on the deployments) is deducted from the employee's net.
 * - Advances are deducted FIFO by advance date up to the cut-off date.
 */
export const POST = handleRoute(async ({ owner, req }) => {
  const body = await readBody<Record<string, unknown>>(req);
  requireFields(body, ["month"]);
  const month = String(body.month);
  const { from, to } = monthBounds(month);

  // [ADDED] Cut-off period calculation (Month EOD / Today / Custom Date)
  const rawType = body.settleType ? String(body.settleType).toUpperCase() : "MONTH_END";
  const settleType = (rawType === "TODAY" || rawType === "CUSTOM") ? rawType : "MONTH_END";
  const now = new Date();
  let effectiveTo = to;
  if (settleType === "TODAY") {
    const todayEnd = endOfDay(now);
    effectiveTo = todayEnd.getTime() < from.getTime() ? from : todayEnd.getTime() > to.getTime() ? to : todayEnd;
  } else if (settleType === "CUSTOM" && body.customDate) {
    const cd = endOfDay(parseDate(String(body.customDate)));
    effectiveTo = cd.getTime() < from.getTime() ? from : cd.getTime() > to.getTime() ? to : cd;
  }
  const isPartial = effectiveTo.getTime() < to.getTime();
  const cutOffLabel = isPartial ? ` (till ${dayKey(effectiveTo)})` : "";

  // [ADDED] Target employee filter
  const targetEmployeeId = body.employeeId ? String(body.employeeId).trim() : null;

  // Candidate employees: ACTIVE, plus anyone non-ACTIVE with billable work in the period.
  const EMP_SELECT = {
    id: true, fullName: true, code: true, designation: true, joiningDate: true, status: true,
    employmentType: true, standardRate: true, monthlySalary: true, overtimeThreshold: true,
    overtimeRate: true, onBusinessRent: true, rentAmount: true, rentMode: true,
    hasContractor: true, contractorName: true, contractorRateCut: true,
  } as const;

  const [activeEmployees, nonActiveWorked] = await Promise.all([
    db.employee.findMany({
      where: {
        status: "ACTIVE",
        ...(targetEmployeeId ? { id: targetEmployeeId } : {}),
      },
      select: EMP_SELECT,
    }),
    db.deployment.findMany({
      where: {
        date: { gte: from, lte: effectiveTo },
        employee: { status: { not: "ACTIVE" } },
        ...(targetEmployeeId ? { employeeId: targetEmployeeId } : {}),
      },
      select: { employeeId: true },
      distinct: ["employeeId"],
    }),
  ]);

  let candidates = [...activeEmployees];
  const activeIds = new Set(activeEmployees.map((e) => e.id));
  const extraIds = nonActiveWorked.map((w) => w.employeeId).filter((id) => !activeIds.has(id));
  if (extraIds.length) {
    const extra = await db.employee.findMany({
      where: { id: { in: extraIds } },
      select: EMP_SELECT,
    });
    candidates.push(...extra);
  }
  if (targetEmployeeId) {
    candidates = candidates.filter((c) => c.id === targetEmployeeId);
  }

  // Last-ever work date per non-ACTIVE candidate — caps salary accrual at the
  // day the employee actually left (same rule the dashboards use).
  const nonActiveIds = candidates.filter((e) => e.status !== "ACTIVE").map((e) => e.id);
  const lastWorks = nonActiveIds.length
    ? await db.deployment.groupBy({ by: ["employeeId"], _max: { date: true }, where: { employeeId: { in: nonActiveIds } } })
    : [];
  const lastWorkBy = new Map(lastWorks.map((r) => [r.employeeId, r._max.date as Date | null]));

  // Bulk-fetch period data
  const [deps, adjs, existingSettlements] = await Promise.all([
    db.deployment.findMany({
      where: {
        date: { gte: from, lte: effectiveTo },
        ...(targetEmployeeId ? { employeeId: targetEmployeeId } : {}),
      },
      select: {
        employeeId: true, date: true, propertyId: true, shift: true, payoutRate: true,
        payoutAmount: true, contractorCut: true, property: { select: { name: true } },
      },
      orderBy: { date: "asc" },
    }),
    db.adjustment.findMany({
      where: {
        date: { gte: from, lte: effectiveTo },
        ...(targetEmployeeId ? { employeeId: targetEmployeeId } : {}),
      },
      select: { employeeId: true, amount: true },
    }),
    db.settlement.findMany({
      where: {
        month,
        ...(targetEmployeeId ? { employeeId: targetEmployeeId } : {}),
      },
      select: { id: true, employeeId: true, status: true },
    }),
  ]);

  const depsByEmp = new Map<string, typeof deps>();
  for (const d of deps) {
    const arr = depsByEmp.get(d.employeeId) ?? [];
    arr.push(d);
    depsByEmp.set(d.employeeId, arr);
  }
  const adjByEmp = new Map<string, number>();
  for (const a of adjs) {
    adjByEmp.set(a.employeeId, round2((adjByEmp.get(a.employeeId) ?? 0) + a.amount));
  }
  const lockedEmployeeIds = new Set(existingSettlements.filter((s) => s.status !== "DRAFT").map((s) => s.employeeId));
  const draftIds = existingSettlements.filter((s) => s.status === "DRAFT").map((s) => s.id);

  // Heavier transaction: regenerating touches settlements, lines, and advances.
  const created = await db.$transaction(async (tx) => {
    // Idempotent regenerate: remove old drafts and release their advances.
    if (draftIds.length) {
      await tx.advance.updateMany({ where: { settlementId: { in: draftIds } }, data: { settlementId: null } });
      await tx.settlement.deleteMany({ where: { id: { in: draftIds } } }); // lines cascade
    }

    const out: {
      id: string; employeeId: string; employeeName: string; employeeCode: string; month: string;
      totalDays: number; dayShifts: number; nightShifts: number; grossEarnings: number;
      additions: number; advanceDeducted: number; otherDeductions: number; rentDeducted: number; contractorCut: number;
      netPayable: number; advanceCarryForward: number; status: string;
    }[] = [];

    for (const emp of candidates) {
      if (lockedEmployeeIds.has(emp.id)) continue;
      const empDeps = depsByEmp.get(emp.id) ?? [];
      const additions = adjByEmp.get(emp.id) ?? 0;

      // Salaried pay via the effective-dated history — prorated up to effectiveTo
      const pay = await salariedMonthPay({
        employeeId: emp.id,
        month,
        joiningDate: emp.joiningDate,
        status: emp.status,
        lastWork: lastWorkBy.get(emp.id) ?? null,
        deploymentsInMonth: empDeps.length,
        current: payValuesOf(emp),
        cutOffDate: effectiveTo, // [ADDED]
      });
      const isSalaried = pay.wasSalaried;
      const rentAmount = isSalaried
        ? pay.rent
        : await monthRentForEmployee({
            employeeId: emp.id,
            month,
            joiningDate: emp.joiningDate,
            status: emp.status,
            lastWork: lastWorkBy.get(emp.id) ?? null,
            current: payValuesOf(emp),
            cutOffDate: effectiveTo, // [ADDED]
          });

      if (!empDeps.length && Math.abs(additions) < 0.005 && !isSalaried && rentAmount <= 0) continue;

      // Contractor commission for the period — snapshot Σ of the deployment cuts.
      const contractorCut = round2(empDeps.reduce((s, d) => s + (d.contractorCut ?? 0), 0));

      let grossEarnings = round2(empDeps.reduce((s, d) => s + d.payoutAmount, 0));
      const lines = empDeps.map((d) => ({
        date: d.date,
        propertyName: d.property.name,
        shift: d.shift,
        rate: d.payoutRate,
        amount: d.payoutAmount,
      }));

      if (isSalaried) {
        // Salaried pay model — deployments are attendance; salary + overtime are the gross.
        grossEarnings = pay.total;
        lines.push({
          date: effectiveTo,
          propertyName: `Monthly salary${cutOffLabel}`,
          shift: "SALARY",
          rate: pay.salary,
          amount: pay.salary,
        });
        if (pay.overtime > 0) {
          lines.push({
            date: effectiveTo,
            propertyName: `Overtime — ${pay.extraDeployments} deployment(s) beyond ${pay.threshold}${cutOffLabel}`,
            shift: "OVERTIME",
            rate: pay.extraDeployments > 0 ? pay.overtime / pay.extraDeployments : 0,
            amount: pay.overtime,
          });
        }
      }

      // [ADDED] Deduct business accommodation rent directly from employee salary
      const rentDeducted = round2(rentAmount);
      if (rentDeducted > 0) {
        lines.push({
          date: effectiveTo,
          propertyName: `Business accommodation rent${cutOffLabel}`,
          shift: "RENT",
          rate: rentDeducted,
          amount: -rentDeducted,
        });
      }

      // FULL shift = day + night → counts in both buckets (2 shift units of work).
      const dayShifts = empDeps.filter((d) => { const s = d.shift.toUpperCase(); return s === "DAY" || s === "FULL"; }).length;
      const nightShifts = empDeps.filter((d) => { const s = d.shift.toUpperCase(); return s === "NIGHT" || s === "FULL"; }).length;
      const totalDays = new Set(empDeps.map((d) => startOfDay(d.date).getTime())).size;
      const otherDeductions = 0;

      // Advance balance before this settlement: Σ advances − Σ settled deductions (drafts already removed).
      const [advAgg, setAgg] = await Promise.all([
        tx.advance.aggregate({ where: { employeeId: emp.id, date: { lte: effectiveTo } }, _sum: { amount: true } }),
        tx.settlement.aggregate({
          where: { employeeId: emp.id, status: { not: "CANCELLED" } },
          _sum: { advanceDeducted: true },
        }),
      ]);
      const balanceBefore = round2((advAgg._sum.amount ?? 0) - (setAgg._sum.advanceDeducted ?? 0));

      // FIFO deduction over unconsumed advances up to cut-off date, capped by net earnings available
      // (after contractor commission and accommodation rent deduction).
      const available = Math.max(0, round2(grossEarnings + additions - otherDeductions - contractorCut - rentDeducted));
      const openAdvances = await tx.advance.findMany({
        where: { employeeId: emp.id, settlementId: null, date: { lte: effectiveTo } },
        orderBy: [{ date: "asc" }, { createdAt: "asc" }],
        select: { id: true, amount: true },
      });
      let pool = available;
      let advanceDeducted = 0;
      const linkedIds: string[] = [];
      for (const adv of openAdvances) {
        if (pool < 0.005) break;
        const take = round2(Math.min(adv.amount, pool));
        if (take <= 0) continue;
        advanceDeducted = round2(advanceDeducted + take);
        pool = round2(pool - take);
        linkedIds.push(adv.id);
      }

      const netPayable = round2(grossEarnings + additions - otherDeductions - contractorCut - rentDeducted - advanceDeducted);
      const advanceCarryForward = round2(Math.max(0, balanceBefore - advanceDeducted));

      const notes = isPartial
        ? `Settlement generated ${settleType === "TODAY" ? "till date" : "for custom cut-off"} (${dayKey(effectiveTo)})`
        : `Full month settlement (${month})`;

      const settlement = await tx.settlement.create({
        data: {
          employeeId: emp.id,
          month,
          totalDays,
          dayShifts,
          nightShifts,
          grossEarnings,
          additions,
          advanceDeducted,
          otherDeductions,
          rentDeducted, // [ADDED] persist rentDeducted
          contractorCut,
          netPayable,
          advanceCarryForward,
          notes, // [ADDED] record cut-off notes
          status: "DRAFT",
        },
      });
      if (lines.length) {
        await tx.settlementLine.createMany({
          data: lines.map((l) => ({
            settlementId: settlement.id,
            date: l.date,
            propertyName: l.propertyName,
            shift: l.shift,
            rate: l.rate,
            amount: l.amount,
          })),
        });
      }
      if (linkedIds.length) {
        await tx.advance.updateMany({ where: { id: { in: linkedIds } }, data: { settlementId: settlement.id } });
      }
      out.push({
        id: settlement.id,
        employeeId: emp.id,
        employeeName: emp.fullName,
        employeeCode: emp.code,
        month,
        totalDays,
        dayShifts,
        nightShifts,
        grossEarnings,
        additions,
        advanceDeducted,
        otherDeductions,
        rentDeducted,
        contractorCut,
        netPayable,
        advanceCarryForward,
        status: "DRAFT",
      });
    }
    return out;
  }, { timeout: 30000, maxWait: 15000 });

  await logAudit({
    owner,
    action: "GENERATE",
    module: "SETTLEMENT",
    recordId: null,
    recordLabel: `Settlements generated for ${month}${targetEmployeeId ? ` (employee: ${candidates[0]?.fullName ?? targetEmployeeId})` : ""}${isPartial ? ` till ${dayKey(effectiveTo)}` : ""}`,
    previousValue: { draftsDeleted: draftIds.length },
    newValue: {
      generated: created.length,
      month,
      targetEmployeeId: targetEmployeeId || "ALL",
      settleType,
      cutOffDate: dayKey(effectiveTo),
    },
  });

  return { generated: created.length, drafts: created, cutOffDate: dayKey(effectiveTo) };
});
