import { db } from "@/lib/db";
import { handleRoute, readBody, requireFields, HttpError } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { round2 } from "@/lib/money";
import { requirePositiveAmount, tripPaymentStatusFor, tripTarget } from "@/app/api/_lib/engine";
import { serializeTrip } from "../../../_lib/trips";

// POST /api/trips/:id/payment — records a collection against the trip and
// recomputes paymentStatus against (finalAmount ?? agreedAmount + extraCharges).
export const POST = handleRoute(async ({ owner, params, req }) => {
  const { id } = params;
  const body = await readBody<{ amount?: unknown; method?: string }>(req);
  requireFields(body as Record<string, unknown>, ["amount"]);
  const amount = requirePositiveAmount(body.amount, "Payment amount");

  const trip = await db.trip.findUnique({
    where: { id },
    include: { vehicle: { select: { name: true, registrationNumber: true } }, client: { select: { name: true } } },
  });
  if (!trip) throw new HttpError(404, "Trip not found");
  if (trip.status === "CANCELLED") throw new HttpError(400, "Cannot record a payment on a cancelled trip");

  const paidAmount = round2(trip.paidAmount + amount);
  const target = tripTarget(trip);
  const paymentStatus = tripPaymentStatusFor(paidAmount, target);

  const updated = await db.trip.update({
    where: { id: trip.id },
    data: { paidAmount, paymentStatus },
    include: { vehicle: { select: { name: true, registrationNumber: true } }, client: { select: { name: true } } },
  });

  await logAudit({
    owner,
    action: "PAYMENT",
    module: "TRIP",
    recordId: trip.id,
    recordLabel: `${trip.vehicle.name} — ${trip.client.name}: ₹${amount.toLocaleString("en-IN")}${body.method ? ` via ${body.method}` : ""}`,
    previousValue: { paidAmount: trip.paidAmount, paymentStatus: trip.paymentStatus },
    newValue: {
      paidAmount,
      paymentStatus,
      target,
      method: body.method ? String(body.method) : null,
      overpayment: paidAmount > target,
    },
  });
  return serializeTrip(updated);
});
