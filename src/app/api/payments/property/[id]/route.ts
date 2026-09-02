import { db } from "@/lib/db";
import { handleRoute, HttpError } from "@/lib/api-helpers";
import { loadPropertyLedger } from "@/app/api/_lib/engine";

export const GET = handleRoute(async ({ params }) => {
  const { id } = params;
  const property = await db.property.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!property) throw new HttpError(404, "Property not found");
  const ledger = await loadPropertyLedger(id);
  return {
    property: { id: property.id, name: property.name },
    ledger: { billed: ledger.billed, received: ledger.received, outstanding: ledger.outstanding },
    days: ledger.days,
  };
});
