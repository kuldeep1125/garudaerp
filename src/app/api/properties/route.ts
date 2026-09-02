import { db } from "@/lib/db";
import { handleRoute, readBody, requireFields, parsePage, HttpError } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { loadAllLedgers } from "@/app/api/_lib/engine";
import { startOfDay } from "@/app/api/_lib/engine";

export const GET = handleRoute(async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const { page, pageSize, skip } = parsePage(sp);
  const where: Record<string, unknown> = {};
  const search = sp.get("search")?.trim();
  const status = sp.get("status");
  if (search) {
    where.OR = [{ name: { contains: search } }, { contactPerson: { contains: search } }];
  }
  if (status) where.status = status.toUpperCase();

  const [rows, total, ledgers, activeContracts] = await Promise.all([
    db.property.findMany({ where, orderBy: { name: "asc" }, skip, take: pageSize }),
    db.property.count({ where }),
    loadAllLedgers(),
    db.contract.findMany({
      where: { status: "ACTIVE" },
      orderBy: { startDate: "desc" },
      select: { propertyId: true, name: true },
    }),
  ]);
  const activeByProp = new Map<string, string>();
  for (const c of activeContracts) {
    if (!activeByProp.has(c.propertyId)) activeByProp.set(c.propertyId, c.name);
  }
  const items = rows.map((p) => {
    const led = ledgers.map.get(p.id);
    return {
      ...p,
      activeContractName: activeByProp.get(p.id) ?? null,
      totalBilled: led?.billed ?? 0,
      totalReceived: led?.received ?? 0,
      totalOutstanding: led?.outstanding ?? 0,
    };
  });
  return { items, total, page, pageSize };
});

export const POST = handleRoute(async ({ owner, req }) => {
  const body = await readBody<Record<string, unknown>>(req);
  requireFields(body, ["name"]);
  const name = String(body.name).trim();
  if (!name) throw new HttpError(400, "name cannot be empty");
  const property = await db.property.create({
    data: {
      name,
      brandName: body.brandName ? String(body.brandName) : null,
      type: body.type ? String(body.type) : null,
      address: body.address ? String(body.address) : null,
      contactPerson: body.contactPerson ? String(body.contactPerson) : null,
      contactNumber: body.contactNumber ? String(body.contactNumber) : null,
      whatsapp: body.whatsapp ? String(body.whatsapp) : null,
      email: body.email ? String(body.email) : null,
      startDate: body.startDate ? new Date(String(body.startDate)) : startOfDay(new Date()),
      status: body.status ? String(body.status).toUpperCase() : "ACTIVE",
      notes: body.notes ? String(body.notes) : null,
    },
  });
  await logAudit({
    owner,
    action: "CREATE",
    module: "PROPERTY",
    recordId: property.id,
    recordLabel: property.name,
    newValue: { name: property.name, status: property.status },
  });
  return { ...property, activeContractName: null, totalBilled: 0, totalReceived: 0, totalOutstanding: 0 };
});
