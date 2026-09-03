import { db } from "@/lib/db";
import { handleRoute, readBody, requireFields } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

// POST /api/notifications/dismiss { key } — persists a dismissal so the alert stops resurfacing.
export const POST = handleRoute(async ({ owner, req }) => {
  const body = await readBody<{ key?: string }>(req);
  requireFields(body as Record<string, unknown>, ["key"]);
  const key = String(body.key);

  const dismissed = await db.notificationDismiss.upsert({
    where: { key },
    update: {},
    create: { key },
  });

  await logAudit({
    owner,
    action: "UPDATE",
    module: "NOTIFICATION",
    recordId: dismissed.id,
    recordLabel: `Dismissed alert: ${key}`,
    newValue: { key },
  });
  return dismissed;
});
