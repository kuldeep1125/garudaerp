import { db } from "@/lib/db";
import { handleRoute, readBody, requireFields, HttpError } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { DEPLOYMENT_STATUSES, requireEnum, recomputeDeploymentPaid, serializeDeployment } from "@/app/api/_lib/engine";

export const PUT = handleRoute(async ({ owner, params, req }) => {
  const { id } = params;
  const body = await readBody<Record<string, unknown>>(req);
  requireFields(body, ["status"]);
  const status = requireEnum(body.status, DEPLOYMENT_STATUSES, "status");
  const existing = await db.deployment.findUnique({
    where: { id },
    include: { employee: { select: { fullName: true, code: true } }, property: { select: { name: true } } },
  });
  if (!existing) throw new HttpError(404, "Deployment not found");

  const updated = await db.$transaction(async (tx) => {
    const row = await tx.deployment.update({ where: { id }, data: { status } });
    await recomputeDeploymentPaid(tx, existing.propertyId);
    return row;
  });
  const full = await db.deployment.findUnique({
    where: { id },
    include: { employee: { select: { fullName: true, code: true } }, property: { select: { name: true } } },
  });

  await logAudit({
    owner,
    action: "STATUS",
    module: "DEPLOYMENT",
    recordId: id,
    recordLabel: `${existing.employee.code} — ${existing.employee.fullName} @ ${existing.property.name}`,
    previousValue: { status: existing.status },
    newValue: { status },
  });
  return serializeDeployment(full ?? updated as never);
});
