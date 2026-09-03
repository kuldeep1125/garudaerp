import { db } from "@/lib/db";
import { handleRoute, readBody, parseDate, HttpError } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { round2 } from "@/lib/money";
import { requirePositiveAmount } from "@/app/api/_lib/engine";

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

  if (body.categoryId !== undefined) {
    if (body.categoryId === null || body.categoryId === "") {
      data.categoryId = null;
      data.categoryName = null;
    } else {
      const cat = await db.expenseCategory.findUnique({ where: { id: String(body.categoryId) } });
      if (!cat) throw new HttpError(404, "Expense category not found");
      data.categoryId = cat.id;
      data.categoryName = cat.name;
    }
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
  }
  if (!Object.keys(data).length) throw new HttpError(400, "No editable fields provided");

  const expense = await db.expense.update({ where: { id }, data });
  await logAudit({
    owner,
    action: "UPDATE",
    module: "EXPENSE",
    recordId: id,
    recordLabel: `${existing.business} ₹${expense.amount.toLocaleString("en-IN")} — ${expense.categoryName ?? "Uncategorized"}`,
    previousValue: { amount: existing.amount, description: existing.description, categoryName: existing.categoryName, date: existing.date },
    newValue: { amount: expense.amount, description: expense.description, categoryName: expense.categoryName, date: expense.date },
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
