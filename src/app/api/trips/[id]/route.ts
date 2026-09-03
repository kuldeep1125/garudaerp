import { db } from "@/lib/db";
import { handleRoute, readBody, parseDate, HttpError } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { round2 } from "@/lib/money";
import { TRIP_STATUSES, findOverlappingTrip, requireEnum, tripPaymentStatusFor, tripTarget } from "@/app/api/_lib/engine";
import { serializeTrip } from "../../_lib/trips";

const PAYMENT_STATUSES = ["PENDING", "PARTIAL", "PAID"] as const;

// PUT /api/trips/:id — partial update; completing/cancelling frees the vehicle unless
// another CONFIRMED/ACTIVE trip exists; paymentStatus auto-recomputed when the target changes.
export const PUT = handleRoute(async ({ owner, params, req }) => {
  const { id } = params;
  const body = await readBody<{
    endAt?: string | null;
    finalAmount?: number | string | null;
    extraCharges?: number | string;
    paymentStatus?: string;
    status?: string;
    notes?: string;
  }>(req);

  const trip = await db.trip.findUnique({
    where: { id },
    include: {
      vehicle: { select: { id: true, name: true, registrationNumber: true, status: true } },
      client: { select: { name: true } },
    },
  });
  if (!trip) throw new HttpError(404, "Trip not found");

  const data: {
    endAt?: Date | null;
    finalAmount?: number | null;
    extraCharges?: number;
    paymentStatus?: string;
    status?: string;
    notes?: string | null;
  } = {};

  if (body.endAt !== undefined) {
    if (body.endAt === null || body.endAt === "") {
      data.endAt = null;
    } else {
      const endAt = parseDate(body.endAt);
      if (endAt.getTime() <= trip.startAt.getTime()) {
        throw new HttpError(400, "End date/time must be after the trip start");
      }
      data.endAt = endAt;
    }
  }
  if (body.finalAmount !== undefined) {
    data.finalAmount = body.finalAmount === null || body.finalAmount === "" ? null : round2(Number(body.finalAmount));
    if (data.finalAmount !== null && (!Number.isFinite(data.finalAmount) || data.finalAmount < 0)) {
      throw new HttpError(400, "Final amount must be a non-negative number");
    }
  }
  if (body.extraCharges !== undefined) {
    data.extraCharges = round2(Number(body.extraCharges));
    if (!Number.isFinite(data.extraCharges) || data.extraCharges < 0) {
      throw new HttpError(400, "Extra charges must be a non-negative number");
    }
  }
  if (body.notes !== undefined) data.notes = body.notes ? String(body.notes) : null;

  if (data.endAt !== undefined && data.endAt !== null) {
    const overlap = await findOverlappingTrip(trip.vehicleId, trip.startAt, data.endAt, trip.id);
    if (overlap) {
      throw new HttpError(
        409,
        `Extended period overlaps an existing confirmed/active trip of ${trip.vehicle.name} (from ${overlap.startAt.toISOString().slice(0, 10)})`
      );
    }
  }

  let statusChangedTo: string | null = null;
  if (body.status !== undefined) {
    const status = requireEnum(body.status, TRIP_STATUSES, "status");
    if (status !== trip.status) {
      data.status = status;
      if (status === "COMPLETED" || status === "CANCELLED") statusChangedTo = status;
    }
  }

  // Client-provided paymentStatus wins; otherwise recompute when the target amount changed.
  if (body.paymentStatus !== undefined) {
    data.paymentStatus = requireEnum(body.paymentStatus, PAYMENT_STATUSES, "paymentStatus");
  } else if (data.finalAmount !== undefined || data.extraCharges !== undefined) {
    const target = tripTarget({
      finalAmount: data.finalAmount !== undefined ? data.finalAmount : trip.finalAmount,
      agreedAmount: trip.agreedAmount,
      extraCharges: data.extraCharges !== undefined ? data.extraCharges : trip.extraCharges,
    });
    data.paymentStatus = tripPaymentStatusFor(trip.paidAmount, target);
  }

  const updated = await db.$transaction(async (tx) => {
    const row = await tx.trip.update({
      where: { id: trip.id },
      data,
      include: { vehicle: { select: { name: true, registrationNumber: true } }, client: { select: { name: true } } },
    });
    if (statusChangedTo) {
      const others = await tx.trip.count({
        where: { vehicleId: trip.vehicleId, id: { not: trip.id }, status: { in: ["CONFIRMED", "ACTIVE"] } },
      });
      if (others === 0 && trip.vehicle.status !== "AVAILABLE") {
        await tx.vehicle.update({ where: { id: trip.vehicleId }, data: { status: "AVAILABLE" } });
      }
    }
    return row;
  });

  await logAudit({
    owner,
    action: "UPDATE",
    module: "TRIP",
    recordId: trip.id,
    recordLabel: `${trip.vehicle.name} — ${trip.client.name} (from ${trip.startAt.toISOString().slice(0, 10)})`,
    previousValue: {
      status: trip.status,
      paymentStatus: trip.paymentStatus,
      endAt: trip.endAt,
      finalAmount: trip.finalAmount,
      extraCharges: trip.extraCharges,
    },
    newValue: {
      status: updated.status,
      paymentStatus: updated.paymentStatus,
      endAt: updated.endAt,
      finalAmount: updated.finalAmount,
      extraCharges: updated.extraCharges,
      vehicleFreed: statusChangedTo ? true : undefined,
    },
  });
  return serializeTrip(updated);
});
