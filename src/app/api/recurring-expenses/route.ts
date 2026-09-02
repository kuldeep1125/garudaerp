import { db } from "@/lib/db";
import { handleRoute, readBody, requireFields, parseDate, HttpError } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { round2 } from "@/lib/money";
import { BUSINESSES, requireEnum, requirePositiveAmount } from "@/app/api/_lib/engine";

export const GET = handleRoute(async () => {
  const items = await db.recurringExpense.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }] });
  return { items };
});

export const POST = handleRoute(async ({ owner, req }) => {
  const body = await readBody<Record<string, unknown>>(req);
  requireFields(body, ["name", "business", "amount", "startDate"]);
  const business = requireEnum(body.business, BUSINESSES, "business");
  let categoryName: string | null = null;
  let categoryId: string | null = null;
  if (body.categoryId) {
    const cat = await db.expenseCategory.findUnique({ where: { id: String(body.categoryId) } });
    if (!cat) throw new HttpError(404, "Expense category not found");
    categoryId = cat.id;
    categoryName = cat.name;
  }
  const recurring = await db.recurringExpense.create({
    data: {
      name: String(body.name).trim(),
      business,
      categoryId,
      categoryName,
      amount: requirePositiveAmount(body.amount, "Amount"),
      frequency: body.frequency ? String(body.frequency).toUpperCase() : "MONTHLY",
      startDate: parseDate(String(body.startDate)),
      endDate: body.endDate ? parseDate(String(body.endDate)) : null,
      method: body.method ? String(body.method) : null,
      notes: body.notes ? String(body.notes) : null,
    },
  });
  await logAudit({
    owner,
    action: "CREATE",
    module: "EXPENSE",
    recordId: recurring.id,
    recordLabel: `Recurring: ${recurring.name} ₹${recurring.amount.toLocaleString("en-IN")}/mo`,
    newValue: { name: recurring.name, business, amount: recurring.amount, startDate: recurring.startDate },
  });
  return recurring;
});
