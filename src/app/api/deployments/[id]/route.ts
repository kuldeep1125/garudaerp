import { db } from "@/lib/db";
import { handleRoute, readBody, HttpError } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { round2 } from "@/lib/money";
import { recomputeDeploymentPaid, serializeDeployment, optionalAmount, SHIFT_UNITS, SHIFTS } from "@/app/api/_lib/engine";

export const PUT = handleRoute(async ({ owner, params, req }) => {
  const { id } = params;
  const body = await readBody<Record<string, unknown>>(req);
  const existing = await db.deployment.findUnique({
    where: { id },
    include: { employee: { select: { fullName: true, code: true } }, property: { select: { name: true } } },
  });
  if (!existing) throw new HttpError(404, "Deployment not found");

  // Shift may be corrected too — amounts always recompute as rate × units so the
  // stored math can never drift from rate + shift + adjustment.
  const shift = body.shift !== undefined ? String(body.shift).toUpperCase() : existing.shift;
  if (!SHIFTS.includes(shift as (typeof SHIFTS)[number])) throw new HttpError(400, "Invalid shift: DAY, NIGHT or FULL");
  const units = SHIFT_UNITS[shift] ?? 1;

  // Overlap guard — correcting the shift must not collide with the employee's
  // OTHER same-day rows at any property (FULL blocks everything; DAY+NIGHT is
  // the only same-day combination that can coexist).
  if (shift !== existing.shift) {
    const dayStart = new Date(existing.date); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(existing.date); dayEnd.setHours(23, 59, 59, 999);
    const others = await db.deployment.findMany({
      where: { employeeId: existing.employeeId, date: { gte: dayStart, lte: dayEnd }, id: { not: id } },
      select: { shift: true, property: { select: { name: true } } },
    });
    const clash = others.find((w) => shift === "FULL" || w.shift === "FULL" || w.shift === shift);
    if (clash) {
      throw new HttpError(
        409,
        `Cannot change to ${shift} — ${existing.employee.code} — ${existing.employee.fullName} already works ${clash.shift} at ${clash.property.name} on this date`,
      );
    }
  }

  const billingRate = body.billingRate !== undefined ? optionalAmount(body.billingRate, existing.billingRate) : existing.billingRate;
  const payoutRate = body.payoutRate !== undefined ? optionalAmount(body.payoutRate, existing.payoutRate) : existing.payoutRate;
  const adjustmentAmount =
    body.adjustmentAmount !== undefined ? optionalAmount(body.adjustmentAmount, existing.adjustmentAmount) : existing.adjustmentAmount;
  const billingAmount = round2(billingRate * units + adjustmentAmount);
  const payoutAmount = round2(payoutRate * units);

  const updated = await db.$transaction(async (tx) => {
    const row = await tx.deployment.update({
      where: { id },
      data: {
        shift,
        billingRate,
        payoutRate,
        adjustmentAmount,
        adjustmentNote: body.adjustmentNote !== undefined ? (body.adjustmentNote === null || body.adjustmentNote === "" ? null : String(body.adjustmentNote)) : existing.adjustmentNote,
        billingAmount,
        payoutAmount,
        notes: body.notes !== undefined ? (body.notes === null || body.notes === "" ? null : String(body.notes)) : existing.notes,
      },
      include: { employee: { select: { fullName: true, code: true } }, property: { select: { name: true } } },
    });
    await recomputeDeploymentPaid(tx, existing.propertyId);
    return row;
  });

  await logAudit({
    owner,
    action: "UPDATE",
    module: "DEPLOYMENT",
    recordId: id,
    recordLabel: `${existing.employee.code} — ${existing.employee.fullName} @ ${existing.property.name} (${existing.date.toISOString().slice(0, 10)})`,
    previousValue: {
      shift: existing.shift, billingRate: existing.billingRate, payoutRate: existing.payoutRate,
      adjustmentAmount: existing.adjustmentAmount, billingAmount: existing.billingAmount, payoutAmount: existing.payoutAmount,
    },
    newValue: { shift, billingRate, payoutRate, adjustmentAmount, billingAmount, payoutAmount },
  });
  return serializeDeployment(updated);
});

// DELETE /api/deployments/[id] — remove a wrong entry. The full row is snapshotted
// into the audit log so the delete itself can be undone (zero-mismatch restore).
export const DELETE = handleRoute(async ({ owner, params }) => {
  const { id } = params;
  const existing = await db.deployment.findUnique({
    where: { id },
    include: { employee: { select: { fullName: true, code: true } }, property: { select: { name: true } } },
  });
  if (!existing) throw new HttpError(404, "Deployment not found");
  const { employee, property, ...row } = existing;

  await db.$transaction(async (tx) => {
    await tx.deployment.delete({ where: { id } });
    await recomputeDeploymentPaid(tx, existing.propertyId);
  });

  await logAudit({
    owner,
    action: "DELETE",
    module: "DEPLOYMENT",
    recordId: id,
    recordLabel: `${employee.code} — ${employee.fullName} @ ${property.name} (${existing.date.toISOString().slice(0, 10)}) ${existing.shift}`,
    previousValue: row, // full scalar snapshot — restoreable
  });
  return { ok: true };
});
