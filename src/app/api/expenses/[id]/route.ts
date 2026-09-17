import { db } from "@/lib/db";
import { handleRoute, readBody, parseDate, HttpError } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { round2 } from "@/lib/money";
import {
  BUSINESSES, requireEnum, requirePositiveAmount, resolveExpenseAttribution, expenseKindForCategory,
} from "@/app/api/_lib/engine";

export const PUT = handleRoute(async ({ owner, params, req }) => {
  const { id } = params;
  const body = await readBody<Record<string, unknown>>(req);
  const existing = await db.expense.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Expense not found");

  const data: Record<string, unknown> = {};
  if (body.date !== undefined) data.date = parseDate(String(body.date));
  if (body.amount !== undefined) data.amount = requirePositiveAmount(body.amount, "Expense amount");
  if (body.method !== undefined) data.method = body.method === null || body.method === "" ? null : String(body.method);
  if (body.description !== undefined) data.description = body.description === null || body.description === "" ? null : String(body.description);
  if (body.notes !== undefined) data.notes = body.notes === null || body.notes === "" ? null : String(body.notes);
  if (body.reason !== undefined) data.reason = body.reason === null || body.reason === "" ? null : String(body.reason);

  // Business is editable on PUT (mirrors POST) — the edit dialog sends it.
  const business = body.business !== undefined
    ? requireEnum(body.business, BUSINESSES, "business")
    : existing.business;
  if (body.business !== undefined) data.business = business;

  if (body.categoryId !== undefined) {
    if (body.categoryId === null || body.categoryId === "") {
      data.categoryId = null;
      data.categoryName = null;
    } else {
      const cat = await db.expenseCategory.findUnique({ where: { id: String(body.categoryId) } });
      if (!cat) throw new HttpError(404, "Expense category not found");
      // Same category↔business rule as POST: the category must belong to the
      // (possibly new) business or be COMMON.
      if (cat.business !== business && cat.business !== "COMMON") {
        throw new HttpError(400, `Category "${cat.name}" belongs to ${cat.business}, not ${business}`);
      }
      data.categoryId = cat.id;
      data.categoryName = cat.name;
    }
  } else if (body.business !== undefined && business !== existing.business && existing.categoryId) {
    // Business switched without an explicit category: the kept category must
    // still be valid for the new business (never silently keep a mismatched one).
    const cat = await db.expenseCategory.findUnique({ where: { id: existing.categoryId } });
    if (cat && cat.business !== business && cat.business !== "COMMON") {
      throw new HttpError(400, `Category "${cat.name}" belongs to ${cat.business}, not ${business} — pick a category for the new business`);
    }
  }

  // Re-stamp capital/operating/refund in the same pass that resolves business+category
  if (data.categoryName !== undefined || body.kind !== undefined || body.type !== undefined) {
    const finalCat = (data.categoryName !== undefined ? data.categoryName : existing.categoryName) as string | null;
    let explicitKind: string | null = null;
    if (body.type === "REFUND") explicitKind = "REFUND";
    else if (body.type === "DRAWING" || body.type === "DEPOSIT") explicitKind = "CAPITAL";
    else if (body.type === "OPERATING" || body.type === "OUT_OF_POCKET") explicitKind = "OPERATING";
    else if (body.kind !== undefined) explicitKind = String(body.kind);
    data.kind = expenseKindForCategory(finalCat, explicitKind);
  }

  if (body.vehicleId !== undefined) {
    if (body.vehicleId === null || body.vehicleId === "") {
      data.vehicleId = null;
      data.vehicleName = null;
    } else {
      const vehicle = await db.vehicle.findUnique({ where: { id: String(body.vehicleId) } });
      if (!vehicle) throw new HttpError(404, "Vehicle not found");
      data.vehicleId = vehicle.id;
      data.vehicleName = vehicle.name;
    }
  } else if (body.business !== undefined && business !== "TRANSPORT" && existing.vehicleId) {
    // Mirror POST's invariant (vehicleId only for TRANSPORT): moving the expense
    // to MANPOWER detaches the vehicle — matches what the edit form shows.
    data.vehicleId = null;
    data.vehicleName = null;
  }

  // Owner attribution: explicit isCommon flag wins; otherwise the selected owner.
  if (body.isCommon !== undefined || body.spentById !== undefined) {
    const attribution = await resolveExpenseAttribution(
      { isCommon: body.isCommon, spentById: body.spentById },
      owner,
    );
    data.isCommon = attribution.isCommon;
    data.spentById = attribution.spentById;
    data.spentByName = attribution.spentByName;
  }

  if (!Object.keys(data).length) throw new HttpError(400, "No editable fields provided");

  const expense = await db.expense.update({ where: { id }, data });
  await logAudit({
    owner,
    action: "UPDATE",
    module: "EXPENSE",
    recordId: id,
    recordLabel: `${expense.business} ₹${expense.amount.toLocaleString("en-IN")} — ${expense.categoryName ?? "Uncategorized"}`,
    previousValue: { amount: existing.amount, business: existing.business, description: existing.description, categoryName: existing.categoryName, kind: existing.kind, date: existing.date, isCommon: existing.isCommon, spentByName: existing.spentByName, reason: existing.reason, vehicleName: existing.vehicleName },
    newValue: { amount: expense.amount, business: expense.business, description: expense.description, categoryName: expense.categoryName, kind: expense.kind, date: expense.date, isCommon: expense.isCommon, spentByName: expense.spentByName, reason: expense.reason, vehicleName: expense.vehicleName },
  });
  return expense;
});

export const DELETE = handleRoute(async ({ owner, params }) => {
  const { id } = params;
  const existing = await db.expense.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Expense not found");
  await db.expense.delete({ where: { id } });
  await logAudit({
    owner,
    action: "DELETE",
    module: "EXPENSE",
    recordId: id,
    recordLabel: `${existing.business} ₹${existing.amount.toLocaleString("en-IN")} — ${existing.categoryName ?? "Uncategorized"}`,
    previousValue: { amount: existing.amount, business: existing.business, categoryName: existing.categoryName, date: existing.date, description: existing.description },
    newValue: null,
  });
  return { ok: true };
});
