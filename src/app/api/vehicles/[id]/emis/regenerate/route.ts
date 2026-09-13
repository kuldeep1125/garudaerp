import { db } from "@/lib/db";
import { handleRoute, HttpError } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { fillMissingEmiSchedule } from "@/app/api/_lib/engine";

/**
 * POST /api/vehicles/:id/emis/regenerate — rebuild the PENDING part of the EMI
 * schedule from the vehicle's CURRENT loan config (monthlyEmi / emiStartDate /
 * emiCount). Historical integrity: only status "PENDING" rows are deleted —
 * PAID installments and their auto-expenses are never touched. The delete +
 * refill runs in one transaction; the refill only fills months that have no row
 * left, so PAID months are not duplicated.
 */
export const POST = handleRoute(async ({ owner, params }) => {
  const { id } = params;
  const vehicle = await db.vehicle.findUnique({ where: { id } });
  if (!vehicle) throw new HttpError(404, "Vehicle not found");
  if (!vehicle.monthlyEmi || !vehicle.emiStartDate || !vehicle.emiCount || vehicle.emiCount <= 0) {
    throw new HttpError(400, "Vehicle loan is not configured (needs loanAmount, monthlyEmi, emiStartDate and emiCount)");
  }
  const { monthlyEmi, emiStartDate, emiCount } = vehicle;

  const { pendingDeleted, created } = await db.$transaction(async (tx) => {
    const removed = await tx.vehicleEmiPayment.deleteMany({ where: { vehicleId: id, status: "PENDING" } });
    const created = await fillMissingEmiSchedule(tx, id, { monthlyEmi, emiStartDate, emiCount });
    return { pendingDeleted: removed.count, created };
  }, { timeout: 15000, maxWait: 10000 });

  const items = await db.vehicleEmiPayment.findMany({ where: { vehicleId: id }, orderBy: { dueDate: "asc" } });

  await logAudit({
    owner,
    action: "UPDATE",
    module: "EMI",
    recordId: id,
    recordLabel: `EMI schedule regenerated — ${vehicle.name} (${pendingDeleted} pending removed, ${created} rebuilt)`,
    previousValue: { pendingDeleted },
    newValue: { created, totalSchedule: items.length },
  });
  return { pendingDeleted, created, items };
});
