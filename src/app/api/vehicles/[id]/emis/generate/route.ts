import { db } from "@/lib/db";
import { handleRoute, HttpError } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { addMonths, monthKey } from "@/app/api/_lib/engine";

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

  const existing = await db.vehicleEmiPayment.findMany({
    where: { vehicleId: id },
    select: { month: true },
  });
  const existingMonths = new Set(existing.map((e) => e.month));

  const toCreate: { vehicleId: string; month: string; dueDate: Date; amount: number }[] = [];
  for (let i = 0; i < vehicle.emiCount; i++) {
    const due = addMonths(vehicle.emiStartDate, i);
    const mk = monthKey(due);
    if (existingMonths.has(mk)) continue;
    toCreate.push({ vehicleId: id, month: mk, dueDate: due, amount: vehicle.monthlyEmi });
  }
  if (toCreate.length) {
    await db.vehicleEmiPayment.createMany({ data: toCreate });
  }
  const items = await db.vehicleEmiPayment.findMany({ where: { vehicleId: id }, orderBy: { dueDate: "asc" } });

  await logAudit({
    owner,
    action: "GENERATE",
    module: "EMI",
    recordId: id,
    recordLabel: `EMI schedule — ${vehicle.name} (${toCreate.length} new)`,
    newValue: { created: toCreate.length, totalSchedule: items.length },
  });
  return { created: toCreate.length, items };
});
