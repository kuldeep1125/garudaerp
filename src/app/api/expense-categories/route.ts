import { db } from "@/lib/db";
import { handleRoute, readBody, requireFields } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

export const GET = handleRoute(async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const business = sp.get("business");
  const where = business ? { OR: [{ business: business.toUpperCase() }, { business: "COMMON" }] } : {};
  const items = await db.expenseCategory.findMany({
    where,
    orderBy: [{ business: "asc" }, { name: "asc" }],
  });
  return { items };
});

export const POST = handleRoute(async ({ owner, req }) => {
  const body = await readBody<Record<string, unknown>>(req);
  requireFields(body, ["name", "business"]);
  const category = await db.expenseCategory.create({
    data: {
      name: String(body.name).trim(),
      business: String(body.business).toUpperCase(),
      kind: body.kind ? String(body.kind).toUpperCase() : "EXPENSE",
    },
  });
  await logAudit({
    owner,
    action: "CREATE",
    module: "EXPENSE",
    recordId: category.id,
    recordLabel: `Category: ${category.name} (${category.business})`,
    newValue: { name: category.name, business: category.business, kind: category.kind },
  });
  return category;
});
