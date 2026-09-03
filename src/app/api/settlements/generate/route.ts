import { db } from "@/lib/db";
import { handleRoute, readBody, requireFields, monthBounds } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { round2 } from "@/lib/money";
import { startOfDay } from "@/app/api/_lib/engine";

/**
 * Settlement engine:
 * - Deletes previous DRAFT settlements of the month (releasing their linked advances).
 * - FINALIZED/PAID settlements are untouched; those employees are skipped.
 * - Generates DRAFTs for ACTIVE employees (plus non-active employees who worked in
 *   the month) that have billable deployments and/or adjustments.
 * - Advances are deducted FIFO by advance date; partially-consumed advances are linked.
 */
export const POST = handleRoute(async ({ owner, req }) => {
  const body = await readBody<Record<string, unknown>>(req);
  requireFields(body, ["month"]);
  const month = String(body.month);
  const { from, to } = monthBounds(month);

  // Candidate employees: ACTIVE, plus anyone non-ACTIVE with billable work in the month.
  const [activeEmployees, nonActiveWorked] = await Promise.all([
    db.employee.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, fullName: true, code: true, designation: true },
    }),
    db.deployment.findMany({
      where: { date: { gte: from, lte: to }, employee: { status: { not: "ACTIVE" } } },
      select: { employeeId: true },
      distinct: ["employeeId"],
    }),
  ]);
  const candidates = [...activeEmployees];
  const activeIds = new Set(activeEmployees.map((e) => e.id));
  const extraIds = nonActiveWorked.map((w) => w.employeeId).filter((id) => !activeIds.has(id));
  if (extraIds.length) {
    const extra = await db.employee.findMany({
      where: { id: { in: extraIds } },
      select: { id: true, fullName: true, code: true, designation: true },
    });
    candidates.push(...extra);
  }

  // Bulk-fetch month data once (no N+1).
  const [deps, adjs, existingSettlements] = await Promise.all([
    db.deployment.findMany({
      where: { date: { gte: from, lte: to } },
      select: { employeeId: true, date: true, propertyId: true, shift: true, payoutRate: true, payoutAmount: true, property: { select: { name: true } } },
      orderBy: { date: "asc" },
    }),
    db.adjustment.findMany({
      where: { date: { gte: from, lte: to } },
      select: { employeeId: true, amount: true },
    }),
    db.settlement.findMany({ where: { month }, select: { id: true, employeeId: true, status: true } }),
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

  // Heavier transaction: regenerating a full month touches settlements, lines
  // and advances for every employee — allow more than the 5s default.
  const created = await db.$transaction(async (tx) => {
    // Idempotent regenerate: remove old drafts and release their advances.
    if (draftIds.length) {
      await tx.advance.updateMany({ where: { settlementId: { in: draftIds } }, data: { settlementId: null } });
      await tx.settlement.deleteMany({ where: { id: { in: draftIds } } }); // lines cascade
    }

    const out: {
      id: string; employeeId: string; employeeName: string; employeeCode: string; month: string;
      totalDays: number; dayShifts: number; nightShifts: number; grossEarnings: number;
      additions: number; advanceDeducted: number; otherDeductions: number; netPayable: number;
      advanceCarryForward: number; status: string;
    }[] = [];

    for (const emp of candidates) {
      if (lockedEmployeeIds.has(emp.id)) continue;
      const empDeps = depsByEmp.get(emp.id) ?? [];
      const additions = adjByEmp.get(emp.id) ?? 0;
      if (!empDeps.length && Math.abs(additions) < 0.005) continue;

      const lines = empDeps.map((d) => ({
        date: d.date,
        propertyName: d.property.name,
        shift: d.shift,
        rate: d.payoutRate,
        amount: d.payoutAmount,
      }));
      const grossEarnings = round2(empDeps.reduce((s, d) => s + d.payoutAmount, 0));
      // FULL shift = day + night → counts in both buckets (2 shift units of work).
      const dayShifts = empDeps.filter((d) => { const s = d.shift.toUpperCase(); return s === "DAY" || s === "FULL"; }).length;
      const nightShifts = empDeps.filter((d) => { const s = d.shift.toUpperCase(); return s === "NIGHT" || s === "FULL"; }).length;
      const totalDays = new Set(empDeps.map((d) => startOfDay(d.date).getTime())).size;
      const otherDeductions = 0;

      // Advance balance before this settlement: Σ advances − Σ settled deductions (drafts already removed).
      const [advAgg, setAgg] = await Promise.all([
        tx.advance.aggregate({ where: { employeeId: emp.id }, _sum: { amount: true } }),
        tx.settlement.aggregate({
          where: { employeeId: emp.id, status: { not: "CANCELLED" } },
          _sum: { advanceDeducted: true },
        }),
      ]);
      const balanceBefore = round2((advAgg._sum.amount ?? 0) - (setAgg._sum.advanceDeducted ?? 0));

      // FIFO deduction over unconsumed advances, capped by net earnings available.
      const available = Math.max(0, round2(grossEarnings + additions - otherDeductions));
      const openAdvances = await tx.advance.findMany({
        where: { employeeId: emp.id, settlementId: null },
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

      const netPayable = round2(grossEarnings + additions - otherDeductions - advanceDeducted);
      const advanceCarryForward = round2(Math.max(0, balanceBefore - advanceDeducted));

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
          netPayable,
          advanceCarryForward,
          status: "DRAFT",
        },
      });
      if (lines.length) {
        await tx.settlementLine.createMany({
          data: lines.map((l) => ({ settlementId: settlement.id, date: l.date, propertyName: l.propertyName, shift: l.shift, rate: l.rate, amount: l.amount })),
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
        netPayable,
        advanceCarryForward,
        status: "DRAFT",
      });
    }
    return out;
  }, { timeout: 20000, maxWait: 10000 });

  await logAudit({
    owner,
    action: "GENERATE",
    module: "SETTLEMENT",
    recordId: null,
    recordLabel: `Settlements generated for ${month}`,
    previousValue: { draftsDeleted: draftIds.length },
    newValue: { generated: created.length, month },
  });
  return { generated: created.length, drafts: created };
});
