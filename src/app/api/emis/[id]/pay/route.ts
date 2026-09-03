import { db } from "@/lib/db";
import { handleRoute, readBody, parseDate, HttpError } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { ensureCategory, dayKey } from "@/app/api/_lib/engine";

/**
 * Marks an EMI installment PAID and auto-creates the matching TRANSPORT expense
 * (category EMI) inside a transaction. Idempotent: the expense is only created
 * if none exists with reference `EMI-<emiId>`.
 */
export const PUT = handleRoute(async ({ owner, params, req }) => {
  const { id } = params;
  const body = await readBody<{ paidDate?: string; method?: string }>(req).catch(() => ({}) as { paidDate?: string; method?: string });
  const emi = await db.vehicleEmiPayment.findUnique({ where: { id }, include: { vehicle: { select: { name: true } } } });
  if (!emi) throw new HttpError(404, "EMI installment not found");
  if (emi.status === "PAID") {
    return { ...emi, expenseCreated: false, message: "EMI already paid" };
  }
  const paidDate = body.paidDate ? parseDate(body.paidDate) : new Date();
  const method = body.method ? String(body.method) : "BANK";

  const { emi: updated, expenseCreated } = await db.$transaction(async (tx) => {
    const row = await tx.vehicleEmiPayment.update({
      where: { id },
      data: { status: "PAID", paidDate, notes: method !== "BANK" ? `Paid via ${method}` : emi.notes },
    });
    const existingExpense = await tx.expense.findFirst({ where: { reference: `EMI-${id}` }, select: { id: true } });
    let created = false;
    if (!existingExpense) {
      const cat = await ensureCategory("EMI", "TRANSPORT");
      await tx.expense.create({
        data: {
          date: paidDate,
          business: "TRANSPORT",
          categoryId: cat.id,
          categoryName: cat.name,
          amount: emi.amount,
          method,
          description: `EMI ${emi.month} — ${emi.vehicle.name}`,
          vehicleId: emi.vehicleId,
          vehicleName: emi.vehicle.name,
          spentByName: owner.name,
          createdById: owner.id,
          createdByName: owner.name,
          reference: `EMI-${id}`,
        },
      });
      created = true;
    }
    return { emi: row, expenseCreated: created };
  });

  await logAudit({
    owner,
    action: "PAYMENT",
    module: "EMI",
    recordId: id,
    recordLabel: `EMI ${emi.month} — ${emi.vehicle.name} ₹${emi.amount.toLocaleString("en-IN")}`,
    previousValue: { status: emi.status },
    newValue: { status: "PAID", paidDate: dayKey(paidDate), expenseCreated },
  });
  return { ...updated, expenseCreated };
});
