import { db } from "@/lib/db";
import { handleRoute, readBody, requireFields, parseDate, parsePage, HttpError } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { round2 } from "@/lib/money";
import { BUSINESSES, requireEnum, requirePositiveAmount, startOfDay, ensureCategory } from "@/app/api/_lib/engine";

function endOfDayInclusive(to: string): Date {
  const d = parseDate(to);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

export const GET = handleRoute(async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const { page, pageSize, skip } = parsePage(sp);
  const where: Record<string, unknown> = {};
  const business = sp.get("business");
  const categoryId = sp.get("categoryId");
  const vehicleId = sp.get("vehicleId");
  const ownerId = sp.get("ownerId"); // spentBy filter
  const search = sp.get("search")?.trim();
  const from = sp.get("from");
  const to = sp.get("to");
  if (business) where.business = business.toUpperCase();
  if (categoryId) where.categoryId = categoryId;
  if (vehicleId) where.vehicleId = vehicleId;
  if (ownerId) where.spentById = ownerId;
  if (search) where.description = { contains: search };
  if (from && to) where.date = { gte: startOfDay(parseDate(from)), lte: endOfDayInclusive(to) };
  else if (from) where.date = { gte: startOfDay(parseDate(from)) };
  else if (to) where.date = { lte: endOfDayInclusive(to) };

  const [rows, total, agg] = await Promise.all([
    db.expense.findMany({
      where,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      skip,
      take: pageSize,
    }),
    db.expense.count({ where }),
    db.expense.aggregate({ where, _sum: { amount: true } }),
  ]);
  return { items: rows, total, page, pageSize, totals: { amount: round2(agg._sum.amount ?? 0) } };
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
      vehicleId,
      vehicleName,
      spentById: owner.id,
      spentByName: owner.name,
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
    newValue: { amount, business, categoryName, date },
  });
  void ensureCategory;
  return expense;
});
