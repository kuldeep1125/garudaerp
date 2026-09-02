import { db } from "@/lib/db";
import { createSession, verifyPassword } from "@/lib/auth";
import { handleRoute, readBody, requireFields, HttpError } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

export const POST = handleRoute(async ({ req }) => {
  const body = await readBody<{ username?: string; password?: string }>(req);
  requireFields(body as Record<string, unknown>, ["username", "password"]);
  const owner = await db.owner.findUnique({ where: { username: String(body.username).toLowerCase().trim() } });
  if (!owner || !verifyPassword(String(body.password), owner.passwordHash)) {
    throw new HttpError(401, "Invalid username or password");
  }
  if (!owner.isActive) {
    throw new HttpError(403, "This account has been deactivated. Contact another owner.");
  }
  await createSession(owner.id);
  await logAudit({ owner: { id: owner.id, name: owner.name }, action: "LOGIN", module: "AUTH", recordLabel: owner.name });
  return {
    id: owner.id,
    name: owner.name,
    username: owner.username,
    mobile: owner.mobile,
    isActive: owner.isActive,
  };
}, { public: true });
