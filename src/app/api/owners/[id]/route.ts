import { db } from "@/lib/db";
import { handleRoute, readBody, HttpError } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { hashPassword } from "@/lib/password";

// PUT /api/owners/:id { name?, mobile?, isActive?, password? } — self-deactivation blocked.
export const PUT = handleRoute(async ({ owner, params, req }) => {
  const { id } = params;
  const body = await readBody<{ name?: string; mobile?: string; isActive?: boolean; password?: string }>(req);

  const target = await db.owner.findUnique({ where: { id } });
  if (!target) throw new HttpError(404, "Owner not found");

  if (body.isActive === false && id === owner.id) {
    throw new HttpError(400, "You cannot deactivate your own account");
  }

  const data: { name?: string; mobile?: string | null; isActive?: boolean; passwordHash?: string } = {};
  if (body.name !== undefined) data.name = String(body.name).trim();
  if (body.mobile !== undefined) data.mobile = body.mobile ? String(body.mobile).trim() : null;
  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);
  let passwordChanged = false;
  if (body.password) {
    if (String(body.password).length < 6) throw new HttpError(400, "Password must be at least 6 characters");
    data.passwordHash = hashPassword(String(body.password));
    passwordChanged = true;
  }
  if (!Object.keys(data).length) throw new HttpError(400, "Nothing to update");

  const updated = await db.owner.update({
    where: { id },
    data,
    select: { id: true, name: true, username: true, mobile: true, isActive: true, createdAt: true },
  });

  // Deactivating an owner kills their live sessions immediately.
  if (data.isActive === false) {
    await db.session.deleteMany({ where: { ownerId: id } });
  }

  await logAudit({
    owner,
    action: "UPDATE",
    module: "OWNER",
    recordId: id,
    recordLabel: `Owner @${target.username} (${target.name})`,
    previousValue: { name: target.name, mobile: target.mobile, isActive: target.isActive },
    newValue: { name: updated.name, mobile: updated.mobile, isActive: updated.isActive, passwordChanged },
  });
  return updated;
});
