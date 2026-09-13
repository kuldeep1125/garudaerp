import { db } from "@/lib/db";
import { handleRoute, readBody, HttpError } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { isCapitalCategoryName } from "@/app/api/_lib/engine";

/**
 * Edit an expense category: rename and/or activate/deactivate.
 * - Rename must stay unique per business (schema @@unique([name, business])) → clean 409.
 * - Deactivate only hides the category from new-expense pickers; past expenses
 *   keep their own stored categoryName, so history display never changes.
 * - Deleting is intentionally NOT implemented: categories referenced by
 *   expenses must never disappear.
 * - Owner capital categories ("Owner Contribution" / "Owner Withdrawal") cannot
 *   be renamed: Expense.kind is stamped from the category NAME, so renaming
 *   would silently flip capital money into operating expenses (or vice versa).
 */
export const PUT = handleRoute(async ({ owner, params, req }) => {
  const { id } = params;
  const body = await readBody<Record<string, unknown>>(req);
  const existing = await db.expenseCategory.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Expense category not found");

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) throw new HttpError(400, "Category name cannot be empty");
    data.name = name;
  }
  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);
  if (!Object.keys(data).length) throw new HttpError(400, "No editable fields provided");

  const renaming = data.name !== undefined && data.name !== existing.name;
  if (renaming && (isCapitalCategoryName(existing.name) || isCapitalCategoryName(data.name as string))) {
    throw new HttpError(
      409,
      `"${existing.name}" is an owner capital category — its name decides capital vs operating treatment, so it cannot be renamed`,
    );
  }
  if (renaming) {
    const clash = await db.expenseCategory.findFirst({
      where: { business: existing.business, name: data.name as string, id: { not: id } },
      select: { id: true },
    });
    if (clash) throw new HttpError(409, `Category "${String(data.name)}" already exists for ${existing.business}`);
  }
  if (data.isActive === false && isCapitalCategoryName(existing.name)) {
    throw new HttpError(409, `"${existing.name}" is an owner capital category and must stay active — owner deposits & withdrawals depend on it`);
  }

  const category = await db.expenseCategory.update({ where: { id }, data });
  await logAudit({
    owner,
    action: "UPDATE",
    module: "EXPENSE",
    recordId: id,
    recordLabel: `Category: ${category.name} (${category.business})`,
    previousValue: { name: existing.name, isActive: existing.isActive },
    newValue: { name: category.name, isActive: category.isActive },
  });
  return category;
});
