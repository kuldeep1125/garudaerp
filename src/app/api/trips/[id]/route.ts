import { db } from "@/lib/db";
import { handleRoute, readBody, parseDate, HttpError } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { round2 } from "@/lib/money";
import {
  TRIP_STATUSES,
  dayKey,
  findOverlappingTrip,
  requireEnum,
  requirePositiveAmount,
  tripPaymentStatusFor,
  tripTarget,
} from "@/app/api/_lib/engine";
import { serializeTrip } from "../../_lib/trips";

const LOCK_MESSAGE = "Completed/cancelled trips are locked — history cannot be rewritten";

// Status state machine — terminal states accept no transitions, ever.
const TRIP_TRANSITIONS: Record<string, readonly string[]> = {
  CONFIRMED: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

// A vehicle "engaged by a trip" — RENTAL-type trips engage as RENTED, TRIP-type as TRIP
// (mirrors POST /api/trips). Only engaged vehicles are released back to AVAILABLE.
const ENGAGED_STATUSES = ["TRIP", "RENTED"] as const;

function engagedStatusFor(tripType: string): string {
  return tripType === "RENTAL" ? "RENTED" : "TRIP";
}

// PUT /api/trips/:id — guarded partial update.
// - Status follows a strict state machine; terminal trips are locked (409).
// - Client-sent paymentStatus is IGNORED — always recomputed from paidAmount vs target.
// - Booking fields (startAt/vehicle/client/agreedAmount) only while CONFIRMED.
// - endAt/finalAmount/extraCharges only while CONFIRMED/ACTIVE.
// - Vehicle engagement mirrors POST: engage on ACTIVE, release on COMPLETED/CANCELLED
//   (only when the vehicle is still engaged and no other CONFIRMED/ACTIVE trip remains).
export const PUT = handleRoute(async ({ owner, params, req }) => {
  const { id } = params;
  const body = await readBody<{
    startAt?: string;
    endAt?: string | null;
    finalAmount?: number | string | null;
    extraCharges?: number | string;
    agreedAmount?: number | string;
    paymentStatus?: string; // ignored — always recomputed
    status?: string;
    vehicleId?: string;
    clientId?: string;
    pickup?: string;
    destination?: string;
    driver?: string;
    fuelResponsibility?: string;
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

  const isTerminal = trip.status === "COMPLETED" || trip.status === "CANCELLED";

  const data: {
    status?: string;
    startAt?: Date;
    endAt?: Date | null;
    finalAmount?: number | null;
    extraCharges?: number;
    agreedAmount?: number;
    paymentStatus?: string;
    vehicleId?: string;
    clientId?: string;
    pickup?: string | null;
    destination?: string | null;
    driver?: string | null;
    fuelResponsibility?: string | null;
    notes?: string | null;
  } = {};

  let statusChangedTo: string | null = null;

  // --- status state machine (same-status requests are silent no-ops) ---
  if (body.status !== undefined) {
    const status = requireEnum(body.status, TRIP_STATUSES, "status");
    if (status !== trip.status) {
      if (isTerminal) throw new HttpError(409, LOCK_MESSAGE);
      const allowed = TRIP_TRANSITIONS[trip.status] ?? [];
      if (!allowed.includes(status)) {
        throw new HttpError(
          409,
          `Invalid transition: a ${trip.status.toLowerCase()} trip cannot become ${status.toLowerCase()}` +
            (allowed.length ? ` — allowed: ${allowed.map((s) => s.toLowerCase()).join(", ")}` : " — no transitions are allowed")
        );
      }
      statusChangedTo = status;
      data.status = status;
    }
  }

  // --- terminal lock: any other field is a rewrite attempt ---
  const hasFieldEdits = [
    "startAt", "endAt", "finalAmount", "extraCharges", "agreedAmount", "vehicleId", "clientId",
    "pickup", "destination", "driver", "fuelResponsibility", "notes",
  ].some((f) => body[f as keyof typeof body] !== undefined);
  if (isTerminal && hasFieldEdits) throw new HttpError(409, LOCK_MESSAGE);

  // --- startAt (booking correction: CONFIRMED only) ---
  if (body.startAt !== undefined) {
    const startAt = parseDate(body.startAt);
    if (startAt.getTime() !== trip.startAt.getTime()) {
      if (trip.status !== "CONFIRMED") {
        throw new HttpError(409, "Start date/time can only be changed while the trip is CONFIRMED");
      }
      data.startAt = startAt;
    }
  }
  const effStartAt = data.startAt ?? trip.startAt;

  // --- endAt (CONFIRMED/ACTIVE only; terminal already rejected above) ---
  if (body.endAt !== undefined) {
    if (body.endAt === null || body.endAt === "") {
      data.endAt = null;
    } else {
      const endAt = parseDate(body.endAt);
      if (endAt.getTime() <= effStartAt.getTime()) {
        throw new HttpError(400, "End date/time must be after the trip start");
      }
      data.endAt = endAt;
    }
  }
  const effEndAt = data.endAt !== undefined ? data.endAt : trip.endAt;
  if (data.startAt !== undefined && effEndAt && effEndAt.getTime() <= effStartAt.getTime()) {
    throw new HttpError(400, "End date/time must be after the trip start");
  }

  // --- money ---
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
  if (body.agreedAmount !== undefined) {
    const agreedAmount = requirePositiveAmount(body.agreedAmount, "Agreed amount");
    if (agreedAmount !== trip.agreedAmount) {
      if (trip.status !== "CONFIRMED") {
        throw new HttpError(409, "Agreed amount can only be corrected while the trip is CONFIRMED — once active, use final amount / extra charges");
      }
      data.agreedAmount = agreedAmount;
    }
  }

  // --- descriptive booking fields (CONFIRMED/ACTIVE) ---
  if (body.pickup !== undefined) data.pickup = body.pickup ? String(body.pickup) : null;
  if (body.destination !== undefined) data.destination = body.destination ? String(body.destination) : null;
  if (body.driver !== undefined) data.driver = body.driver ? String(body.driver) : null;
  if (body.fuelResponsibility !== undefined) data.fuelResponsibility = body.fuelResponsibility ? String(body.fuelResponsibility) : null;
  if (body.notes !== undefined) data.notes = body.notes ? String(body.notes) : null;

  // --- vehicle / client swap (booking correction: CONFIRMED only) ---
  let newVehicle: { id: string; name: string; status: string } | null = null;
  if (body.vehicleId !== undefined && body.vehicleId !== trip.vehicleId) {
    if (trip.status !== "CONFIRMED") {
      throw new HttpError(409, "Vehicle can only be changed while the trip is CONFIRMED");
    }
    const vehicle = await db.vehicle.findUnique({
      where: { id: String(body.vehicleId) },
      select: { id: true, name: true, status: true },
    });
    if (!vehicle) throw new HttpError(404, "Vehicle not found");
    if (ENGAGED_STATUSES.includes(vehicle.status as (typeof ENGAGED_STATUSES)[number])) {
      throw new HttpError(409, `Vehicle ${vehicle.name} is already on another trip — pick an available vehicle`);
    }
    newVehicle = vehicle;
    data.vehicleId = vehicle.id;
  }
  if (body.clientId !== undefined && body.clientId !== trip.clientId) {
    if (trip.status !== "CONFIRMED") {
      throw new HttpError(409, "Client can only be changed while the trip is CONFIRMED");
    }
    const client = await db.client.findUnique({ where: { id: String(body.clientId) }, select: { id: true } });
    if (!client) throw new HttpError(404, "Client not found");
    data.clientId = client.id;
  }

  // --- overlap guard whenever dates/vehicle change (mirrors POST) ---
  const vehicleChanged = data.vehicleId !== undefined;
  if (data.startAt !== undefined || data.endAt !== undefined || vehicleChanged) {
    const overlap = await findOverlappingTrip(data.vehicleId ?? trip.vehicleId, effStartAt, effEndAt, trip.id);
    if (overlap) {
      const vName = vehicleChanged ? newVehicle?.name ?? "the vehicle" : trip.vehicle.name;
      throw new HttpError(
        409,
        `Vehicle ${vName} already has a confirmed/active trip from ${dayKey(overlap.startAt)}` +
          `${overlap.endAt ? ` to ${dayKey(overlap.endAt)}` : " (open-ended)"} that overlaps this period`
      );
    }
  }

  // --- paymentStatus is ALWAYS derived — client-sent values never win ---
  if (data.finalAmount !== undefined || data.extraCharges !== undefined || data.agreedAmount !== undefined) {
    const target = tripTarget({
      finalAmount: data.finalAmount !== undefined ? data.finalAmount : trip.finalAmount,
      agreedAmount: data.agreedAmount !== undefined ? data.agreedAmount : trip.agreedAmount,
      extraCharges: data.extraCharges !== undefined ? data.extraCharges : trip.extraCharges,
    });
    data.paymentStatus = tripPaymentStatusFor(trip.paidAmount, target);
  }

  // Nothing actually changed (no-op request) — return the trip untouched, no audit noise.
  if (Object.keys(data).length === 0) return serializeTrip(trip);

  const updated = await db.$transaction(async (tx) => {
    const row = await tx.trip.update({
      where: { id: trip.id },
      data,
      include: { vehicle: { select: { name: true, registrationNumber: true } }, client: { select: { name: true } } },
    });

    const releaseVehicle = async (vehicleId: string) => {
      const others = await tx.trip.count({
        where: { vehicleId, id: { not: trip.id }, status: { in: ["CONFIRMED", "ACTIVE"] } },
      });
      if (others > 0) return;
      const vehicle = await tx.vehicle.findUnique({ where: { id: vehicleId }, select: { status: true } });
      if (vehicle && ENGAGED_STATUSES.includes(vehicle.status as (typeof ENGAGED_STATUSES)[number])) {
        await tx.vehicle.update({ where: { id: vehicleId }, data: { status: "AVAILABLE" } });
      }
    };

    if (vehicleChanged) {
      // Booking moved to another vehicle while CONFIRMED: engage the new vehicle
      // (mirrors POST) unless the same request already ended the trip, and
      // release the old one if nothing else holds it.
      if (!statusChangedTo) {
        const engaged = engagedStatusFor(row.tripType);
        const v = await tx.vehicle.findUnique({ where: { id: data.vehicleId! }, select: { status: true } });
        if (v && v.status !== engaged) {
          await tx.vehicle.update({ where: { id: data.vehicleId! }, data: { status: engaged } });
        }
      }
      await releaseVehicle(trip.vehicleId);
    } else if (statusChangedTo === "ACTIVE") {
      // Trip went live — engage the vehicle exactly like POST engages on CONFIRMED.
      const engaged = engagedStatusFor(row.tripType);
      const v = await tx.vehicle.findUnique({ where: { id: row.vehicleId }, select: { status: true } });
      if (v && v.status !== engaged) {
        await tx.vehicle.update({ where: { id: row.vehicleId }, data: { status: engaged } });
      }
    } else if (statusChangedTo === "COMPLETED" || statusChangedTo === "CANCELLED") {
      await releaseVehicle(trip.vehicleId);
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
      startAt: trip.startAt,
      endAt: trip.endAt,
      agreedAmount: trip.agreedAmount,
      finalAmount: trip.finalAmount,
      extraCharges: trip.extraCharges,
      vehicleId: trip.vehicleId,
      clientId: trip.clientId,
      pickup: trip.pickup,
      destination: trip.destination,
      driver: trip.driver,
      fuelResponsibility: trip.fuelResponsibility,
      notes: trip.notes,
    },
    newValue: {
      status: updated.status,
      paymentStatus: updated.paymentStatus,
      startAt: updated.startAt,
      endAt: updated.endAt,
      agreedAmount: updated.agreedAmount,
      finalAmount: updated.finalAmount,
      extraCharges: updated.extraCharges,
      vehicleId: updated.vehicleId,
      clientId: updated.clientId,
      pickup: updated.pickup,
      destination: updated.destination,
      driver: updated.driver,
      fuelResponsibility: updated.fuelResponsibility,
      notes: updated.notes,
      vehicleFrom: vehicleChanged ? trip.vehicleId : undefined,
      vehicleTo: vehicleChanged ? updated.vehicleId : undefined,
      vehicleEngaged: statusChangedTo === "ACTIVE" || vehicleChanged ? true : undefined,
      vehicleFreed: statusChangedTo === "COMPLETED" || statusChangedTo === "CANCELLED" ? true : undefined,
    },
  });
  return serializeTrip(updated);
});
