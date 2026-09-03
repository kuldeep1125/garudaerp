import { db } from "@/lib/db";
import { handleRoute, readBody, HttpError, monthBounds, endOfDay } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { round2 } from "@/lib/money";
import { currentMonth, monthKey, addMonths, startOfDay } from "@/app/api/_lib/engine";

/**
 * Generates missing monthly Expense records for this recurring expense, from its
 * start month (or the month after lastGeneratedMonth) through `upToMonth`
 * (defaults to the current month; never generates for future months).
 * Idempotent: skips a month when an expense with reference `REC-<id>-<month>`
 * or matching description+month already exists.
 */
export const POST = handleRoute(async ({ owner, params, req }) => {
  const { id } = params;
  const body = await readBody<{ upToMonth?: string }>(req).catch(() => ({}) as { upToMonth?: string });
  const recurring = await db.recurringExpense.findUnique({ where: { id } });
  if (!recurring) throw new HttpError(404, "Recurring expense not found");
  if (!recurring.isActive) throw new HttpError(409, "This recurring expense is inactive — toggle it on first");

  const now = new Date();
  const currentM = currentMonth();
  const upToMonth = body.upToMonth ? String(body.upToMonth) : currentM;
  monthBounds(upToMonth); // validate
  if (upToMonth > currentM) throw new HttpError(400, `upToMonth cannot be in the future (max ${currentM})`);

  const startM = monthKey(recurring.startDate);
  const lastM = recurring.lastGeneratedMonth;
  // First month to generate: after lastGeneratedMonth, but not before startDate month.
  let cursor = lastM && lastM > startM ? addMonths(monthBounds(lastM).from, 1) : monthBounds(startM).from;
  const ceiling = monthBounds(upToMonth).from;
  const endDate = recurring.endDate;

  const created: string[] = [];
  while (cursor.getTime() <= ceiling.getTime()) {
    const mk = monthKey(cursor);
    if (endDate && startOfDay(cursor) > endOfDay(endDate)) break;
    const { from, to } = monthBounds(mk);
    const existing = await db.expense.findFirst({
      where: {
        business: recurring.business,
        date: { gte: from, lte: to },
        OR: [{ reference: `REC-${recurring.id}-${mk}` }, { description: recurring.name }],
      },
      select: { id: true },
    });
    if (!existing) {
      await db.expense.create({
        data: {
          date: from,
          business: recurring.business,
          categoryId: recurring.categoryId,
          categoryName: recurring.categoryName,
          amount: round2(recurring.amount),
          method: recurring.method,
          description: recurring.name,
          notes: recurring.notes,
          spentByName: "System",
          createdById: owner.id,
          createdByName: owner.name,
          reference: `REC-${recurring.id}-${mk}`,
        },
      });
      created.push(mk);
    }
    if (mk > upToMonth) break;
    cursor = addMonths(cursor, 1);
  }

  const newLast = created.length ? created[created.length - 1] : recurring.lastGeneratedMonth;
  await db.recurringExpense.update({ where: { id }, data: { lastGeneratedMonth: newLast } });

  await logAudit({
    owner,
    action: "GENERATE",
    module: "EXPENSE",
    recordId: recurring.id,
    recordLabel: `Recurring run: ${recurring.name} → ${created.length} expense(s)`,
    newValue: { createdMonths: created, upToMonth },
  });
  return { created: created.length, months: created };
});
