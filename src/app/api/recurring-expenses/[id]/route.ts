import { db } from "@/lib/db";
import { handleRoute, readBody, parseDate, HttpError } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { BUSINESSES, requireEnum, requirePositiveAmount } from "@/app/api/_lib/engine";

/**
 * Edit a recurring expense — field parity with POST (name, business, category,
 * amount, frequency, startDate, endDate, method, notes, isActive). Validation
 * mirrors POST: business enum, amount > 0, category must exist and belong to
 * the (possibly new) business or be COMMON — the monthly generator copies these
 * fields into real Expense rows, so a mismatched pair would poison later runs.
 */
export const PUT = handleRoute(async ({ owner, params, req }) => {
  const { id } = params;
  const body = await readBody<Record<string, unknown>>(req);
  const existing = await db.recurringExpense.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Recurring expense not found");

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) throw new HttpError(400, "Name cannot be empty");
    data.name = name;
  }
  if (body.business !== undefined) data.business = requireEnum(body.business, BUSINESSES, "business");
  if (body.amount !== undefined) data.amount = requirePositiveAmount(body.amount, "Amount");
  if (body.frequency !== undefined) data.frequency = String(body.frequency).toUpperCase() || "MONTHLY";
  if (body.startDate !== undefined) data.startDate = parseDate(String(body.startDate));
  if (body.endDate !== undefined) data.endDate = body.endDate ? parseDate(String(body.endDate)) : null;
  if (body.method !== undefined) data.method = body.method === null || body.method === "" ? null : String(body.method);
  if (body.notes !== undefined) data.notes = body.notes === null || body.notes === "" ? null : String(body.notes);
  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);

  const business = (data.business as string) ?? existing.business;

  if (body.categoryId !== undefined) {
    if (body.categoryId === null || body.categoryId === "") {
      data.categoryId = null;
      data.categoryName = null;
    } else {
      const cat = await db.expenseCategory.findUnique({ where: { id: String(body.categoryId) } });
      if (!cat) throw new HttpError(404, "Expense category not found");
      if (cat.business !== business && cat.business !== "COMMON") {
        throw new HttpError(400, `Category "${cat.name}" belongs to ${cat.business}, not ${business}`);
      }
      data.categoryId = cat.id;
      data.categoryName = cat.name;
    }
  } else if (data.business !== undefined && business !== existing.business && existing.categoryId) {
    // Business switched without an explicit category: the kept category must
    // still be valid for the new business (never silently keep a mismatched one).
    const cat = await db.expenseCategory.findUnique({ where: { id: existing.categoryId } });
    if (cat && cat.business !== business && cat.business !== "COMMON") {
      throw new HttpError(400, `Category "${cat.name}" belongs to ${cat.business}, not ${business} — pick a category for the new business`);
    }
  }

  if (!Object.keys(data).length) throw new HttpError(400, "No editable fields provided");

  const recurring = await db.recurringExpense.update({ where: { id }, data });
  await logAudit({
    owner,
    action: "UPDATE",
    module: "EXPENSE",
    recordId: id,
    recordLabel: `Recurring: ${recurring.name} ₹${recurring.amount.toLocaleString("en-IN")}/mo`,
    previousValue: {
      name: existing.name, business: existing.business, categoryName: existing.categoryName,
      amount: existing.amount, frequency: existing.frequency, startDate: existing.startDate,
      endDate: existing.endDate, method: existing.method, notes: existing.notes, isActive: existing.isActive,
    },
    newValue: {
      name: recurring.name, business: recurring.business, categoryName: recurring.categoryName,
      amount: recurring.amount, frequency: recurring.frequency, startDate: recurring.startDate,
      endDate: recurring.endDate, method: recurring.method, notes: recurring.notes, isActive: recurring.isActive,
    },
  });
  return recurring;
});
