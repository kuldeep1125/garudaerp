import { db } from "@/lib/db";
import { handleRoute, readBody, parseDate, HttpError } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { round2 } from "@/lib/money";

const EDITABLE_STRINGS = ["name", "shift", "category", "paymentTerms", "notes"] as const;

export const PUT = handleRoute(async ({ owner, params, req }) => {
  const { id } = params;
  const body = await readBody<Record<string, unknown>>(req);
  const existing = await db.contract.findUnique({ where: { id }, include: { property: { select: { name: true } } } });
  if (!existing) throw new HttpError(404, "Contract not found");

  const data: Record<string, unknown> = {};
  const previous: Record<string, unknown> = {};
  const changes: Record<string, unknown> = {};
  for (const key of EDITABLE_STRINGS) {
    if (body[key] !== undefined) {
      data[key] = body[key] === null || body[key] === "" ? null : String(body[key]);
    }
  }
  if (body.billingRate !== undefined) data.billingRate = round2(Number(body.billingRate) || 0);
  if (body.payoutRate !== undefined) data.payoutRate = round2(Number(body.payoutRate) || 0);
  if (body.maxEmployees !== undefined) {
    data.maxEmployees = body.maxEmployees === null || body.maxEmployees === "" ? null : parseInt(String(body.maxEmployees), 10) || null;
  }
  if (body.startDate !== undefined) data.startDate = body.startDate ? parseDate(body.startDate as string) : existing.startDate;
  if (body.endDate !== undefined) data.endDate = body.endDate ? parseDate(body.endDate as string) : null;
  if (body.status !== undefined) data.status = String(body.status).toUpperCase();

  for (const key of Object.keys(data)) {
    previous[key] = (existing as unknown as Record<string, unknown>)[key];
    changes[key] = data[key];
  }
  if (!Object.keys(data).length) throw new HttpError(400, "No editable fields provided");

  const contract = await db.$transaction(async (tx) => {
    if (data.status === "ACTIVE" && existing.status !== "ACTIVE") {
      // Reactivating: end other ACTIVE contracts of this property (keep this one).
      const others = await tx.contract.findMany({
        where: { propertyId: existing.propertyId, status: "ACTIVE", id: { not: id } },
        select: { id: true },
      });
      for (const o of others) {
        await tx.contract.update({ where: { id: o.id }, data: { status: "ENDED" } });
      }
    }
    return tx.contract.update({ where: { id }, data });
  });

  await logAudit({
    owner,
    action: "UPDATE",
    module: "CONTRACT",
    recordId: contract.id,
    recordLabel: `${existing.property.name} — ${contract.name}`,
    previousValue: previous,
    newValue: changes,
  });
  return { ...contract, propertyName: existing.property.name };
});
