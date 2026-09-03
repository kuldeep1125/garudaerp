import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { handleRoute, readBody, requireFields, HttpError } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

export const POST = handleRoute(async ({ owner, req }) => {
  const body = await readBody<{ currentPassword?: string; newPassword?: string }>(req);
  requireFields(body as Record<string, unknown>, ["currentPassword", "newPassword"]);
  if (String(body.newPassword).length < 6) {
    throw new HttpError(400, "New password must be at least 6 characters");
  }
  const rec = await db.owner.findUnique({ where: { id: owner.id } });
  if (!rec || !verifyPassword(String(body.currentPassword), rec.passwordHash)) {
    throw new HttpError(400, "Current password is incorrect");
  }
  await db.owner.update({ where: { id: owner.id }, data: { passwordHash: hashPassword(String(body.newPassword)) } });
  await logAudit({ owner, action: "UPDATE", module: "AUTH", recordLabel: "Password changed" });
  return { ok: true };
});
