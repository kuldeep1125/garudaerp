import { db } from "@/lib/db";
import { handleRoute, readBody, HttpError } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

const EDITABLE_STRINGS = ["name", "company", "phone", "whatsapp", "email", "address", "billingDetails", "notes"] as const;

export const PUT = handleRoute(async ({ owner, params, req }) => {
  const { id } = params;
  const body = await readBody<Record<string, unknown>>(req);
  const existing = await db.client.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Client not found");

  const data: Record<string, unknown> = {};
  const previous: Record<string, unknown> = {};
  const changes: Record<string, unknown> = {};
  for (const key of EDITABLE_STRINGS) {
    if (body[key] !== undefined) {
      data[key] = body[key] === null || body[key] === "" ? null : String(body[key]);
    }
  }
  for (const key of Object.keys(data)) {
    previous[key] = (existing as unknown as Record<string, unknown>)[key];
    changes[key] = data[key];
  }
  if (!Object.keys(data).length) throw new HttpError(400, "No editable fields provided");

  const client = await db.client.update({ where: { id }, data });
  await logAudit({
    owner,
    action: "UPDATE",
    module: "CLIENT",
    recordId: id,
    recordLabel: client.name,
    previousValue: previous,
    newValue: changes,
  });
  return client;
});
