import { db } from "@/lib/db";
import { handleRoute, parseDate, parsePage } from "@/lib/api-helpers";
import { startOfDay } from "@/app/api/_lib/engine";

// GET /api/audit?ownerId=&module=&action=&from=&to=&page=&pageSize=
export const GET = handleRoute(async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const { page, pageSize, skip } = parsePage(sp);
  const where: Record<string, unknown> = {};
  const ownerId = sp.get("ownerId");
  const moduleFilter = sp.get("module");
  const action = sp.get("action");
  const from = sp.get("from");
  const to = sp.get("to");
  if (ownerId) where.ownerId = ownerId;
  if (moduleFilter) where.module = moduleFilter.toUpperCase();
  if (action) where.action = action.toUpperCase();
  if (from && to) where.createdAt = { gte: startOfDay(parseDate(from)), lte: endOfDayInclusive(to) };
  else if (from) where.createdAt = { gte: startOfDay(parseDate(from)) };
  else if (to) where.createdAt = { lte: endOfDayInclusive(to) };

  const [items, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    db.auditLog.count({ where }),
  ]);
  return { items, total, page, pageSize };
});

function endOfDayInclusive(to: string): Date {
  const d = parseDate(to);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}
