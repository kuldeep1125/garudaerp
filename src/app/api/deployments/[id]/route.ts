import { db } from "@/lib/db";
import { handleRoute, readBody, HttpError } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { round2 } from "@/lib/money";
import { recomputeDeploymentPaid, serializeDeployment, optionalAmount } from "@/app/api/_lib/engine";

export const PUT = handleRoute(async ({ owner, params, req }) => {
  const { id } = params;
  const body = await readBody<Record<string, unknown>>(req);
  const existing = await db.deployment.findUnique({
    where: { id },
    include: { employee: { select: { fullName: true, code: true } }, property: { select: { name: true } } },
  });
  if (!existing) throw new HttpError(404, "Deployment not found");
  if (existing.status === "CANCELLED") throw new HttpError(409, "Cancelled deployments cannot be edited");

  const billingRate = body.billingRate !== undefined ? optionalAmount(body.billingRate, existing.billingRate) : existing.billingRate;
  const payoutRate = body.payoutRate !== undefined ? optionalAmount(body.payoutRate, existing.payoutRate) : existing.payoutRate;
  const adjustmentAmount =
    body.adjustmentAmount !== undefined ? optionalAmount(body.adjustmentAmount, existing.adjustmentAmount) : existing.adjustmentAmount;
  const billingAmount = round2(billingRate + adjustmentAmount);
  const payoutAmount = round2(payoutRate);

  const updated = await db.$transaction(async (tx) => {
    const row = await tx.deployment.update({
      where: { id },
      data: {
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
    previousValue: { billingRate: existing.billingRate, payoutRate: existing.payoutRate, adjustmentAmount: existing.adjustmentAmount },
    newValue: { billingRate, payoutRate, adjustmentAmount, billingAmount, payoutAmount },
  });
  return serializeDeployment(updated);
});
