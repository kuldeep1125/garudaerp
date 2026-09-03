import { db } from "@/lib/db";
import { handleRoute, readBody, requireFields, parseDate, parsePage, HttpError } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { round2 } from "@/lib/money";
import {
  dayKey,
  findOverlappingTrip,
  requireEnum,
  requirePositiveAmount,
  optionalAmount,
  tripPaymentStatusFor,
  tripTarget,
} from "@/app/api/_lib/engine";
import { serializeTrip } from "../_lib/trips";

const TRIP_TYPES = ["RENTAL", "TRIP"] as const;
const RENTAL_TYPES = ["DAILY", "WEEKLY", "MONTHLY", "OUTSTATION", "LOCAL"] as const;

// GET /api/trips?vehicleId=&clientId=&status=&paymentStatus=&from=&to=&page=&pageSize=
export const GET = handleRoute(async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const { page, pageSize, skip } = parsePage(sp);
  const where: Record<string, unknown> = {};
  const vehicleId = sp.get("vehicleId");
  const clientId = sp.get("clientId");
  const status = sp.get("status");
  const paymentStatus = sp.get("paymentStatus");
  const from = sp.get("from");
  const to = sp.get("to");
  if (vehicleId) where.vehicleId = vehicleId;
  if (clientId) where.clientId = clientId;
  if (status) where.status = { in: status.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean) };
  if (paymentStatus) where.paymentStatus = { in: paymentStatus.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean) };
  if (from && to) where.startAt = { gte: parseDate(from), lte: endOfDayInclusive(to) };
  else if (from) where.startAt = { gte: parseDate(from) };
  else if (to) where.startAt = { lte: endOfDayInclusive(to) };

  const [rows, total, all] = await Promise.all([
    db.trip.findMany({
      where,
      orderBy: { startAt: "desc" },
      skip,
      take: pageSize,
      include: { vehicle: { select: { name: true, registrationNumber: true } }, client: { select: { name: true } } },
    }),
    db.trip.count({ where }),
    db.trip.findMany({
      where,
      select: { status: true, finalAmount: true, agreedAmount: true, extraCharges: true, paidAmount: true },
    }),
  ]);

  let revenue = 0;
  let pending = 0;
  for (const t of all) {
    if (t.status === "CANCELLED") continue;
    const target = tripTarget(t);
    revenue += target;
    pending += Math.max(0, target - t.paidAmount);
  }
  return {
    items: rows.map(serializeTrip),
    total,
    page,
    pageSize,
    totals: { revenue: round2(revenue), pending: round2(pending) },
  };
});

function endOfDayInclusive(to: string): Date {
  const d = parseDate(to);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

// POST /api/trips — create trip/rental with vehicle-overlap validation + vehicle status flip.
export const POST = handleRoute(async ({ owner, req }) => {
  const body = await readBody<Record<string, unknown>>(req);
  requireFields(body, ["vehicleId", "clientId", "startAt", "tripType", "rentalType", "agreedAmount"]);

  const [vehicle, client] = await Promise.all([
    db.vehicle.findUnique({ where: { id: String(body.vehicleId) } }),
    db.client.findUnique({ where: { id: String(body.clientId) } }),
  ]);
  if (!vehicle) throw new HttpError(404, "Vehicle not found");
  if (!client) throw new HttpError(404, "Client not found");

  const tripType = requireEnum(body.tripType, TRIP_TYPES, "tripType");
  const rentalType = requireEnum(body.rentalType, RENTAL_TYPES, "rentalType");
  const agreedAmount = requirePositiveAmount(body.agreedAmount, "Agreed amount");
  const advanceReceived = optionalAmount(body.advanceReceived, 0);
  if (advanceReceived < 0) throw new HttpError(400, "Advance received cannot be negative");
  const startAt = parseDate(body.startAt);
  const endAt = body.endAt ? parseDate(body.endAt) : null;
  if (endAt && endAt.getTime() <= startAt.getTime()) {
    throw new HttpError(400, "End date/time must be after the start date/time");
  }

  const overlap = await findOverlappingTrip(vehicle.id, startAt, endAt);
  if (overlap) {
    throw new HttpError(
      409,
      `Vehicle ${vehicle.name} already has a confirmed/active trip from ${dayKey(overlap.startAt)}` +
        `${overlap.endAt ? ` to ${dayKey(overlap.endAt)}` : " (open-ended)"} that overlaps this period`
    );
  }

  const extraCharges = 0;
  const target = round2(agreedAmount + extraCharges);
  const paidAmount = round2(advanceReceived);

  const trip = await db.$transaction(async (tx) => {
    const row = await tx.trip.create({
      data: {
        vehicleId: vehicle.id,
        clientId: client.id,
        startAt,
        endAt,
        tripType,
        rentalType,
        pickup: body.pickup ? String(body.pickup) : null,
        destination: body.destination ? String(body.destination) : null,
        driver: body.driver ? String(body.driver) : null,
        agreedAmount,
        advanceReceived,
        extraCharges,
        paidAmount,
        paymentStatus: tripPaymentStatusFor(paidAmount, target),
        status: "CONFIRMED",
        fuelResponsibility: body.fuelResponsibility ? String(body.fuelResponsibility) : null,
        notes: body.notes ? String(body.notes) : null,
        createdById: owner.id,
        createdByName: owner.name,
      },
      include: { vehicle: { select: { name: true, registrationNumber: true } }, client: { select: { name: true } } },
    });
    await tx.vehicle.update({
      where: { id: vehicle.id },
      data: { status: tripType === "RENTAL" ? "RENTED" : "TRIP" },
    });
    return row;
  });

  await logAudit({
    owner,
    action: "CREATE",
    module: "TRIP",
    recordId: trip.id,
    recordLabel: `${tripType} — ${vehicle.name} for ${client.name} from ${dayKey(startAt)}`,
    newValue: { agreedAmount, advanceReceived, startAt, endAt, tripType, rentalType, vehicleStatus: tripType === "RENTAL" ? "RENTED" : "TRIP" },
  });
  return serializeTrip(trip);
});
