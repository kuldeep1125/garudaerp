import { db } from "@/lib/db";
import { handleRoute, readBody, requireFields, parseDate, parsePage, optionalAmount } from "@/app/api/_lib/engine";
import { logAudit } from "@/lib/audit";
import { HttpError } from "@/lib/api-helpers";
import { round2 } from "@/lib/money";
import { requirePositiveAmount } from "@/app/api/_lib/engine";

export const GET = handleRoute(async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const { page, pageSize, skip } = parsePage(sp);
  const where: Record<string, unknown> = {};
  const propertyId = sp.get("propertyId");
  const status = sp.get("status");
  if (propertyId) where.propertyId = propertyId;
  if (status) where.status = status.toUpperCase();

  const [rows, total] = await Promise.all([
    db.contract.findMany({
      where,
      orderBy: { startDate: "desc" },
      skip,
      take: pageSize,
      include: { property: { select: { name: true } } },
    }),
    db.contract.count({ where }),
  ]);
  const items = rows.map(({ property, ...c }) => ({ ...c, propertyName: property.name }));
  return { items, total, page, pageSize };
});

export const POST = handleRoute(async ({ owner, req }) => {
  const body = await readBody<Record<string, unknown>>(req);
  requireFields(body, ["propertyId", "name", "startDate", "billingRate", "payoutRate"]);
  const property = await db.property.findUnique({ where: { id: String(body.propertyId) } });
  if (!property) throw new HttpError(404, "Property not found");
  const startDate = parseDate(body.startDate as string);
  const status = body.status ? String(body.status).toUpperCase() : "ACTIVE";

  const contract = await db.$transaction(async (tx) => {
    if (status === "ACTIVE") {
      // Supersede other ACTIVE contracts of this property: end them the day before the new one starts.
      const others = await tx.contract.findMany({
        where: { propertyId: property.id, status: "ACTIVE" },
        select: { id: true, name: true },
      });
      for (const o of others) {
        const endDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() - 1, 23, 59, 59);
        await tx.contract.update({ where: { id: o.id }, data: { status: "ENDED", endDate } });
      }
    }
    return tx.contract.create({
      data: {
        propertyId: property.id,
        name: String(body.name).trim(),
        startDate,
        endDate: body.endDate ? parseDate(body.endDate as string) : null,
        billingRate: requirePositiveAmount(body.billingRate, "billingRate"),
        payoutRate: requirePositiveAmount(body.payoutRate, "payoutRate"),
        shift: body.shift ? String(body.shift).toUpperCase() : null,
        category: body.category ? String(body.category) : null,
        maxEmployees: body.maxEmployees != null && body.maxEmployees !== "" ? parseInt(String(body.maxEmployees), 10) || null : null,
        paymentTerms: body.paymentTerms ? String(body.paymentTerms) : null,
        notes: body.notes ? String(body.notes) : null,
        status,
      },
    });
  });

  await logAudit({
    owner,
    action: "CREATE",
    module: "CONTRACT",
    recordId: contract.id,
    recordLabel: `${property.name} — ${contract.name}`,
    newValue: { billingRate: contract.billingRate, payoutRate: contract.payoutRate, startDate: contract.startDate, status: contract.status },
  });
  return { ...contract, propertyName: property.name };
});
