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
  const type = sp.get("type"); // OPERATING | DRAWING | DEPOSIT | REFUND | OUT_OF_POCKET
  const search = sp.get("search")?.trim();
  const from = sp.get("from");
  const to = sp.get("to");

  if (business) where.business = business.toUpperCase();
  if (categoryId) where.categoryId = categoryId;
  if (vehicleId) where.vehicleId = vehicleId;

  // Precise Owner attribution filter: Common vs individual personal spend
  if (ownerId === "COMMON") {
    where.isCommon = true;
  } else if (ownerId === "NONE") {
    where.spentById = null;
    where.isCommon = false;
  } else if (ownerId) {
    where.spentById = ownerId;
    where.isCommon = false;
  }

  // Type & Kind filters
  if (type === "OPERATING") {
    where.kind = "OPERATING";
  } else if (type === "REFUND") {
    where.kind = "REFUND";
  } else if (type === "DRAWING") {
    where.kind = "CAPITAL";
    where.categoryName = { contains: "Withdrawal", mode: "insensitive" };
  } else if (type === "DEPOSIT") {
    where.kind = "CAPITAL";
    where.categoryName = { contains: "Contribution", mode: "insensitive" };
  } else if (type === "OUT_OF_POCKET") {
    where.kind = "OPERATING";
    where.isCommon = false;
    where.spentById = { not: null };
  } else if (kind === "OPERATING" || kind === "CAPITAL" || kind === "REFUND") {
    where.kind = kind;
  }

  if (search) where.description = { contains: search, mode: "insensitive" };
  if (from && to) where.date = { gte: startOfDay(parseDate(from)), lte: endOfDay(parseDate(to)) };
  else if (from) where.date = { gte: startOfDay(parseDate(from)) };
  else if (to) where.date = { lte: endOfDay(parseDate(to)) };

  const [rows, total, allMatchingExpenses] = await Promise.all([
    db.expense.findMany({
      where,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      skip,
      take: pageSize,
    }),
    db.expense.count({ where }),
    // Aggregate over the full filtered set for exact reconciliation
    db.expense.findMany({
      where,
      select: { amount: true, kind: true, categoryName: true, isCommon: true },
    }),
  ]);

  let totalAmount = 0;
  let operating = 0;
  let refunds = 0;
  let deposits = 0;
  let withdrawals = 0;
  let common = 0;

  for (const e of allMatchingExpenses) {
    const amt = round2(e.amount);
    totalAmount = round2(totalAmount + amt);
    if (e.isCommon) common = round2(common + amt);

    if (e.kind === "REFUND") {
      refunds = round2(refunds + amt);
    } else if (e.kind === "CAPITAL") {
      const cat = (e.categoryName ?? "").trim().toUpperCase();
      if (cat.includes("CONTRIBUTION") || cat.includes("DEPOSIT") || cat.includes("INVEST")) {
        deposits = round2(deposits + amt);
      } else {
        withdrawals = round2(withdrawals + amt);
      }
    } else {
      operating = round2(operating + amt);
    }
  }

  const netOperating = round2(operating - refunds);
  const netCapital = round2(deposits - withdrawals);

  return {
    items: rows,
    total,
    page,
    pageSize,
    totals: {
      amount: totalAmount,
      operating,
      refunds,
      netOperating,
      capital: round2(deposits + withdrawals),
      deposits,
      withdrawals,
      netCapital,
      common,
    },
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

  const type = body.type ? String(body.type) : null;

  // Auto-bind canonical categories for structured types if not explicitly set
  if (type === "DRAWING" && !categoryName) {
    categoryName = "Owner Withdrawal";
    const cat = await db.expenseCategory.findFirst({ where: { name: "Owner Withdrawal" } });
    if (cat) categoryId = cat.id;
  } else if (type === "DEPOSIT" && !categoryName) {
    categoryName = "Owner Contribution";
    const cat = await db.expenseCategory.findFirst({ where: { name: "Owner Contribution" } });
    if (cat) categoryId = cat.id;
  } else if (type === "REFUND" && !categoryName) {
    categoryName = "Expense Refund";
    const cat = await db.expenseCategory.findFirst({ where: { name: "Expense Refund" } });
    if (cat) categoryId = cat.id;
  }

  // Who is the money attributed to (owner picker) + capital/refund stamp
  let attribution = await resolveExpenseAttribution(body, owner);
  if (type === "DRAWING" || type === "DEPOSIT" || type === "OUT_OF_POCKET") {
    attribution = { ...attribution, isCommon: false };
  }

  let explicitKind: string | null = null;
  if (type === "REFUND") explicitKind = "REFUND";
  else if (type === "DRAWING" || type === "DEPOSIT") explicitKind = "CAPITAL";
  else if (type === "OPERATING" || type === "OUT_OF_POCKET") explicitKind = "OPERATING";
  else if (body.kind) explicitKind = String(body.kind);

  const kind = expenseKindForCategory(categoryName, explicitKind);

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
