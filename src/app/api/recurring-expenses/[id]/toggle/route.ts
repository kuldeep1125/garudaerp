import { db } from "@/lib/db";
import { handleRoute, readBody, HttpError } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

export const PUT = handleRoute(async ({ owner, params, req }) => {
  const { id } = params;
  const body = await readBody<{ isActive?: boolean }>(req).catch(() => ({}) as { isActive?: boolean });
  const existing = await db.recurringExpense.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Recurring expense not found");
  const isActive = typeof body.isActive === "boolean" ? body.isActive : !existing.isActive;
  const recurring = await db.recurringExpense.update({ where: { id }, data: { isActive } });
  await logAudit({
    owner,
    action: "UPDATE",
    module: "EXPENSE",
    recordId: id,
    recordLabel: `Recurring: ${existing.name}`,
    previousValue: { isActive: existing.isActive },
    newValue: { isActive },
  });
  return recurring;
});
