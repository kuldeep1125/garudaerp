import { db } from "@/lib/db";
import { handleRoute, readBody, requireFields, parseDate, parsePage, endOfDay, HttpError } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { round2 } from "@/lib/money";
import {
  BUSINESSES, requireEnum, requirePositiveAmount, startOfDay, ensureCategory,
  resolveExpenseAttribution, expenseKindForCategory,
} from "@/app/api/_lib/engine";

export const GET = handleRoute(async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const { page, pageSize, skip } = parsePage(sp);
  const where: Record<string, unknown> = {};
  const business = sp.get("business");
  const categoryId = sp.get("categoryId");
  const vehicleId = sp.get("vehicleId");
  const ownerId = sp.get("ownerId"); // spentBy filter — owner id | COMMON | NONE
  const kind = sp.get("kind");
  const search = sp.get("search")?.trim();
  const from = sp.get("from");
  const to = sp.get("to");
  if (business) where.business = business.toUpperCase();
  if (categoryId) where.categoryId = categoryId;
  if (vehicleId) where.vehicleId = vehicleId;
  if (ownerId === "COMMON") where.isCommon = true;
  else if (ownerId === "NONE") where.spentById = null;
  else if (ownerId) where.spentById = ownerId;
  if (kind === "OPERATING" || kind === "CAPITAL") where.kind = kind;
  if (search) where.description = { contains: search };
  if (from && to) where.date = { gte: startOfDay(parseDate(from)), lte: endOfDay(parseDate(to)) };
  else if (from) where.date = { gte: startOfDay(parseDate(from)) };
  else if (to) where.date = { lte: endOfDay(parseDate(to)) };

  const [rows, total, agg, byKind] = await Promise.all([
    db.expense.findMany({
      where,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      skip,
      take: pageSize,
    }),
    db.expense.count({ where }),
    db.expense.aggregate({ where, _sum: { amount: true } }),
    db.expense.groupBy({ by: ["kind", "isCommon"], where: business ? { business: business.toUpperCase() } : {}, _sum: { amount: true } }),
  ]);

  // Range-wide split so every surface can reconcile: operating + capital = grand.
  let operating = 0;
  let capital = 0;
  let common = 0;
  for (const g of byKind) {
    const amt = round2(g._sum.amount ?? 0);
    if (g.isCommon) common = round2(common + amt);
    if (g.kind === "OPERATING") operating = round2(operating + amt);
    else capital = round2(capital + amt);
  }
  return {
    items: rows,
    total,
    page,
    pageSize,
    totals: { amount: round2(agg._sum.amount ?? 0), operating, capital, common },
  };
});

export const POST = handleRoute(async ({ owner, req }) => {
  const body = await readBody<Record<string, unknown>>(req);
  requireFields(body, ["date", "business", "amount"]);
  const business = requireEnum(body.business, BUSINESSES, "business");
  const amount = requirePositiveAmount(body.amount, "Expense amount");
  const date = parseDate(String(body.date));

  let categoryName: string | null = null;
  let categoryId: string | null = null;
  if (body.categoryId) {
    const cat = await db.expenseCategory.findUnique({ where: { id: String(body.categoryId) } });
    if (!cat) throw new HttpError(404, "Expense category not found");
    if (cat.business !== business && cat.business !== "COMMON") {
      throw new HttpError(400, `Category "${cat.name}" belongs to ${cat.business}, not ${business}`);
    }
    categoryId = cat.id;
    categoryName = cat.name;
  }

  let vehicleId: string | null = null;
  let vehicleName: string | null = null;
  if (body.vehicleId) {
    if (business !== "TRANSPORT") throw new HttpError(400, "vehicleId is only allowed for TRANSPORT expenses");
    const vehicle = await db.vehicle.findUnique({ where: { id: String(body.vehicleId) } });
    if (!vehicle) throw new HttpError(404, "Vehicle not found");
    vehicleId = vehicle.id;
    vehicleName = vehicle.name;
  }

  // Who is the money attributed to (owner picker) + capital stamp from category.
  const attribution = await resolveExpenseAttribution(body, owner);
  const kind = expenseKindForCategory(categoryName);

  const expense = await db.expense.create({
    data: {
      date,
      business,
      categoryId,
      categoryName,
      amount,
      method: body.method ? String(body.method) : null,
      description: body.description ? String(body.description) : null,
      notes: body.notes ? String(body.notes) : null,
      reason: body.reason ? String(body.reason) : null,
      vehicleId,
      vehicleName,
      isCommon: attribution.isCommon,
      spentById: attribution.spentById,
      spentByName: attribution.spentByName,
      kind,
      createdById: owner.id,
      createdByName: owner.name,
    },
  });
  await logAudit({
    owner,
    action: "CREATE",
    module: "EXPENSE",
    recordId: expense.id,
    recordLabel: `${business} ₹${amount.toLocaleString("en-IN")} — ${categoryName ?? "Uncategorized"}`,
    newValue: { amount, business, categoryName, date, isCommon: attribution.isCommon, spentByName: attribution.spentByName, kind },
  });
  void ensureCategory;
  return expense;
});
