import { db } from "@/lib/db";
import { handleRoute, readBody, HttpError } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { round2 } from "@/lib/money";

export const PUT = handleRoute(async ({ owner, params, req }) => {
  const { id } = params;
  const body = await readBody<{ additions?: number; otherDeductions?: number; notes?: string }>(req);
  const existing = await db.settlement.findUnique({
    where: { id },
    include: { employee: { select: { fullName: true, code: true } } },
  });
  if (!existing) throw new HttpError(404, "Settlement not found");
  if (existing.status !== "DRAFT") throw new HttpError(409, "Finalized settlements are locked");

  const additions = body.additions !== undefined ? round2(Number(body.additions) || 0) : existing.additions;
  const otherDeductions =
    body.otherDeductions !== undefined ? round2(Math.max(0, Number(body.otherDeductions) || 0)) : existing.otherDeductions;
  // CANONICAL settlement math (never editable): net = gross + additions
  // − other deductions − contractor commission − advance deduction.
  const netPayable = round2(
    existing.grossEarnings + additions - otherDeductions - (existing.contractorCut ?? 0) - existing.advanceDeducted,
  );
  const notes = body.notes !== undefined ? (body.notes === null || body.notes === "" ? null : String(body.notes)) : existing.notes;

  const settlement = await db.settlement.update({
    where: { id },
    data: { additions, otherDeductions, netPayable, notes },
    include: { lines: { orderBy: { date: "asc" } } },
  });

  await logAudit({
    owner,
    action: "UPDATE",
    module: "SETTLEMENT",
    recordId: id,
    recordLabel: `${existing.employee.code} — ${existing.employee.fullName} (${existing.month})`,
    previousValue: { additions: existing.additions, otherDeductions: existing.otherDeductions, netPayable: existing.netPayable },
    newValue: { additions, otherDeductions, netPayable },
  });
  return { ...settlement, employeeName: existing.employee.fullName, employeeCode: existing.employee.code };
});
