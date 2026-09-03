import { db } from "@/lib/db";
import { handleRoute, readBody, HttpError } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { serializeDeployment, loadPropertyLedger } from "@/app/api/_lib/engine";

export const GET = handleRoute(async ({ params }) => {
  const { id } = params;
  const property = await db.property.findUnique({ where: { id } });
  if (!property) throw new HttpError(404, "Property not found");
  const [contracts, ledger, deployments, payments] = await Promise.all([
    db.contract.findMany({ where: { propertyId: id }, orderBy: { startDate: "desc" } }),
    loadPropertyLedger(id),
    db.deployment.findMany({
      where: { propertyId: id },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 100,
      include: { employee: { select: { fullName: true, code: true } }, property: { select: { name: true } } },
    }),
    db.propertyPayment.findMany({ where: { propertyId: id }, orderBy: { date: "desc" }, take: 100 }),
  ]);
  return {
    property,
    contracts,
    ledger: { billed: ledger.billed, received: ledger.received, outstanding: ledger.outstanding },
    deployments: deployments.map(serializeDeployment),
    payments,
    monthly: ledger.monthly,
  };
});

const EDITABLE_STRINGS = [
  "name", "brandName", "type", "address", "contactPerson", "contactNumber",
  "whatsapp", "email", "notes",
] as const;

export const PUT = handleRoute(async ({ owner, params, req }) => {
  const { id } = params;
  const body = await readBody<Record<string, unknown>>(req);
  const existing = await db.property.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Property not found");

  const data: Record<string, unknown> = {};
  const previous: Record<string, unknown> = {};
  const changes: Record<string, unknown> = {};
  for (const key of EDITABLE_STRINGS) {
    if (body[key] !== undefined) {
      data[key] = body[key] === null || body[key] === "" ? null : String(body[key]);
    }
  }
  if (body.status !== undefined) data.status = String(body.status).toUpperCase();
  if (body.startDate !== undefined) data.startDate = body.startDate ? new Date(String(body.startDate)) : null;

  for (const key of Object.keys(data)) {
    previous[key] = (existing as unknown as Record<string, unknown>)[key];
    changes[key] = data[key];
  }
  if (!Object.keys(data).length) throw new HttpError(400, "No editable fields provided");

  const property = await db.property.update({ where: { id }, data });
  await logAudit({
    owner,
    action: "UPDATE",
    module: "PROPERTY",
    recordId: property.id,
    recordLabel: property.name,
    previousValue: previous,
    newValue: changes,
  });
  return property;
});
