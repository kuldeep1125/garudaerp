import { db } from "@/lib/db";
import { handleRoute, HttpError } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { fillMissingEmiSchedule } from "@/app/api/_lib/engine";

/**
 * Builds the EMI schedule from the vehicle loan config:
 * emiCount monthly installments of monthlyEmi starting at emiStartDate.
 * Skips months that already exist (idempotent).
 */
export const POST = handleRoute(async ({ owner, params }) => {
  const { id } = params;
  const vehicle = await db.vehicle.findUnique({ where: { id } });
  if (!vehicle) throw new HttpError(404, "Vehicle not found");
  if (!vehicle.monthlyEmi || !vehicle.emiStartDate || !vehicle.emiCount || vehicle.emiCount <= 0) {
    throw new HttpError(400, "Vehicle loan is not configured (needs loanAmount, monthlyEmi, emiStartDate and emiCount)");
  }
  const { monthlyEmi, emiStartDate, emiCount } = vehicle;

  const created = await db.$transaction((tx) =>
    fillMissingEmiSchedule(tx, id, { monthlyEmi, emiStartDate, emiCount }),
  );
  const items = await db.vehicleEmiPayment.findMany({ where: { vehicleId: id }, orderBy: { dueDate: "asc" } });

  await logAudit({
    owner,
    action: "GENERATE",
    module: "EMI",
    recordId: id,
    recordLabel: `EMI schedule — ${vehicle.name} (${created} new)`,
    newValue: { created, totalSchedule: items.length },
  });
  return { created, items };
});
