import { destroySession, getSessionOwner } from "@/lib/auth";
import { handleRoute } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

export const POST = handleRoute(async () => {
  const owner = await getSessionOwner();
  if (owner) {
    await logAudit({ owner, action: "LOGOUT", module: "AUTH", recordLabel: owner.name });
  }
  await destroySession();
  return { ok: true };
});
