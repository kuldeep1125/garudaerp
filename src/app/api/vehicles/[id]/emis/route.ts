import { db } from "@/lib/db";
import { handleRoute, HttpError } from "@/lib/api-helpers";

export const GET = handleRoute(async ({ params }) => {
  const { id } = params;
  const vehicle = await db.vehicle.findUnique({ where: { id }, select: { id: true } });
  if (!vehicle) throw new HttpError(404, "Vehicle not found");
  const items = await db.vehicleEmiPayment.findMany({
    where: { vehicleId: id },
    orderBy: { dueDate: "asc" },
  });
  return { items };
});
