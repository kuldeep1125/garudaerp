import { handleRoute, parseDate } from "@/lib/api-helpers";
import { HttpError } from "@/lib/api-helpers";
import { resolveContract } from "@/app/api/_lib/engine";

export const GET = handleRoute(async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const propertyId = sp.get("propertyId");
  if (!propertyId) throw new HttpError(400, "Missing required query param: propertyId");
  const date = parseDate(sp.get("date") ?? new Date().toISOString().slice(0, 10));
  const contract = await resolveContract(propertyId, date);
  return {
    contract,
    billingRate: contract ? contract.billingRate : null,
    payoutRate: contract ? contract.payoutRate : null,
  };
});
