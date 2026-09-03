import { db } from "@/lib/db";
import { handleRoute, readBody, requireFields, HttpError } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { DEPLOYMENT_STATUSES, requireEnum, recomputeDeploymentPaid } from "@/app/api/_lib/engine";

export const POST = handleRoute(async ({ owner, req }) => {
  const body = await readBody<{ ids?: string[]; status?: string }>(req);
  requireFields(body as Record<string, unknown>, ["status"]);
  const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean).map(String) : [];
  if (!ids.length) throw new HttpError(400, "ids must contain at least one deployment id");
  const status = requireEnum(body.status, DEPLOYMENT_STATUSES, "status");

  const result = await db.$transaction(async (tx) => {
    const rows = await tx.deployment.findMany({
      where: { id: { in: ids } },
      select: { id: true, propertyId: true, status: true },
    });
    const foundIds = rows.map((r) => r.id);
    if (!foundIds.length) return { updated: 0, propertyIds: [] as string[] };
    const res = await tx.deployment.updateMany({ where: { id: { in: foundIds } }, data: { status } });
    const propertyIds = [...new Set(rows.map((r) => r.propertyId))];
    for (const pid of propertyIds) {
      await recomputeDeploymentPaid(tx, pid);
    }
    return { updated: res.count, propertyIds };
  }, { timeout: 15000, maxWait: 10000 });

  await logAudit({
    owner,
    action: "STATUS",
    module: "DEPLOYMENT",
    recordId: null,
    recordLabel: `Bulk status → ${status} (${result.updated} deployment(s))`,
    newValue: { ids, status, updated: result.updated },
  });
  return { updated: result.updated };
});
