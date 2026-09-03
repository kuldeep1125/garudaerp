import { db } from "@/lib/db";
import { handleRoute, readBody, requireFields, HttpError } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { hashPassword } from "@/lib/password";

const DEFAULT_PASSWORD = "owner123";

// GET /api/owners — all owners + count of records each created (AuditLog CREATE actions).
export const GET = handleRoute(async () => {
  const [owners, createdAgg] = await Promise.all([
    db.owner.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, username: true, mobile: true, isActive: true, createdAt: true },
    }),
    db.auditLog.groupBy({ by: ["ownerId"], _count: true, where: { action: "CREATE", ownerId: { not: null } } }),
  ]);
  const createdMap = new Map(createdAgg.map((r) => [r.ownerId, r._count]));
  return {
    items: owners.map((o) => ({ ...o, createdRecords: createdMap.get(o.id) ?? 0 })),
  };
});

// POST /api/owners { name, username, mobile?, password? } — username lowercased & unique.
export const POST = handleRoute(async ({ owner, req }) => {
  const body = await readBody<{ name?: string; username?: string; mobile?: string; password?: string }>(req);
  requireFields(body as Record<string, unknown>, ["name", "username"]);
  const username = String(body.username).trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,}$/.test(username)) {
    throw new HttpError(400, "Username must be at least 3 characters (letters, numbers, dot, dash, underscore)");
  }
  const password = body.password ? String(body.password) : DEFAULT_PASSWORD;
  if (password.length < 6) throw new HttpError(400, "Password must be at least 6 characters");

  const created = await db.owner.create({
    data: {
      name: String(body.name).trim(),
      username,
      mobile: body.mobile ? String(body.mobile).trim() : null,
      passwordHash: hashPassword(password),
    },
    select: { id: true, name: true, username: true, mobile: true, isActive: true, createdAt: true },
  });

  await logAudit({
    owner,
    action: "CREATE",
    module: "OWNER",
    recordId: created.id,
    recordLabel: `Owner @${created.username} (${created.name})`,
    newValue: { name: created.name, username: created.username, mobile: created.mobile, defaultPassword: !body.password },
  });
  return created;
});
