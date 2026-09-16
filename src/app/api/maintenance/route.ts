import { db } from "@/lib/db";
import { handleRoute, readBody, requireFields, parseDate, parsePage, startOfDay, endOfDay, HttpError } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { dayKey, optionalAmount } from "@/app/api/_lib/engine";

const MAINTENANCE_TYPES = ["SERVICE", "REPAIR", "TYRES", "OTHER"] as const;

// GET /api/maintenance?vehicleId=&status=&from=&to=&page=&pageSize=
export const GET = handleRoute(async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const { page, pageSize, skip } = parsePage(sp);
  const where: Record<string, unknown> = {};
  const vehicleId = sp.get("vehicleId");
  const status = sp.get("status");
  const from = sp.get("from");
  const to = sp.get("to");
  if (vehicleId) where.vehicleId = vehicleId;
  if (status) where.status = status.toUpperCase();
  if (from && to) where.date = { gte: startOfDay(parseDate(from)), lte: endOfDay(parseDate(to)) };
  else if (from) where.date = { gte: startOfDay(parseDate(from)) };
  else if (to) where.date = { lte: endOfDay(parseDate(to)) };

  const [rows, total] = await Promise.all([
    db.maintenance.findMany({
      where,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      skip,
      take: pageSize,
      include: { vehicle: { select: { name: true, registrationNumber: true } } },
    }),
    db.maintenance.count({ where }),
  ]);
  const items = rows.map(({ vehicle, ...m }) => ({ ...m, vehicleName: vehicle.name, vehicleReg: vehicle.registrationNumber }));
  return { items, total, page, pageSize };
});

// POST /api/maintenance — schedule a maintenance record (status SCHEDULED).
export const POST = handleRoute(async ({ owner, req }) => {
  const body = await readBody<Record<string, unknown>>(req);
  requireFields(body, ["vehicleId", "date", "type"]);
  const vehicle = await db.vehicle.findUnique({ where: { id: String(body.vehicleId) } });
  if (!vehicle) throw new HttpError(404, "Vehicle not found");
  const type = String(body.type).toUpperCase();
  if (!MAINTENANCE_TYPES.includes(type as (typeof MAINTENANCE_TYPES)[number])) {
    throw new HttpError(400, `Invalid type: must be one of ${MAINTENANCE_TYPES.join(", ")}`);
  }
  const date = parseDate(String(body.date));
  const cost = optionalAmount(body.cost, 0);
  if (cost < 0) throw new HttpError(400, "Cost cannot be negative");
  const nextDueDate = body.nextDueDate ? parseDate(String(body.nextDueDate)) : null;

  const record = await db.maintenance.create({
    data: {
      vehicleId: vehicle.id,
      date,
      type,
      description: body.description ? String(body.description) : null,
      cost,
      nextDueDate,
      status: "SCHEDULED",
      createdById: owner.id,
      createdByName: owner.name,
    },
  });
  await logAudit({
    owner,
    action: "CREATE",
    module: "MAINTENANCE",
    recordId: record.id,
    recordLabel: `${type} — ${vehicle.name} on ${dayKey(date)}`,
    newValue: { type, cost, date, nextDueDate, status: "SCHEDULED" },
  });
  return { ...record, vehicleName: vehicle.name, vehicleReg: vehicle.registrationNumber };
});
