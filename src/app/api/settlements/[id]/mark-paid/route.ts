import { db } from "@/lib/db";
import { handleRoute, readBody, parseDate, HttpError } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

export const PUT = handleRoute(async ({ owner, params, req }) => {
  const { id } = params;
  const body = await readBody<{ paymentDate?: string; method?: string }>(req);
  const existing = await db.settlement.findUnique({
    where: { id },
    include: { employee: { select: { fullName: true, code: true } } },
  });
  if (!existing) throw new HttpError(404, "Settlement not found");
  if (existing.status === "DRAFT") throw new HttpError(409, "Finalize the settlement before marking it paid");
  if (existing.status === "PAID") {
    throw new HttpError(409, "This settlement is already marked paid — payment records are immutable (audit trail keeps the original date/method).");
  }

  const settlement = await db.settlement.update({
    where: { id },
    data: {
      status: "PAID",
      paymentDate: body.paymentDate ? parseDate(body.paymentDate) : new Date(),
      paymentMethod: body.method ? String(body.method) : existing.paymentMethod ?? "CASH",
    },
  });

  await logAudit({
    owner,
    action: "PAYMENT",
    module: "SETTLEMENT",
    recordId: id,
    recordLabel: `${existing.employee.code} — ${existing.employee.fullName} (${existing.month}) net ₹${settlement.netPayable.toLocaleString("en-IN")}`,
    previousValue: { status: existing.status },
    newValue: { status: "PAID", paymentDate: settlement.paymentDate, method: settlement.paymentMethod },
  });
  return settlement;
});
