import { db } from "@/lib/db";
import { handleRoute, readBody, requireFields, parseDate, HttpError, monthBounds, endOfDay } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { round2 } from "@/lib/money";
import { ADJUSTMENT_TYPES, requireEnum, startOfDay } from "@/app/api/_lib/engine";

export const GET = handleRoute(async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const where: Record<string, unknown> = {};
  const employeeId = sp.get("employeeId");
  if (employeeId) where.employeeId = employeeId;
  const month = sp.get("month");
  if (month) {
    const { from, to } = monthBounds(month);
    where.date = { gte: from, lte: to };
  } else {
    const from = sp.get("from");
    const to = sp.get("to");
    if (from && to) where.date = { gte: startOfDay(parseDate(from)), lte: endOfDay(parseDate(to)) };
  }
  const rows = await db.adjustment.findMany({
    where,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: { employee: { select: { fullName: true, code: true } } },
  });
  const items = rows.map(({ employee, ...a }) => ({
    ...a,
    employeeName: employee.fullName,
    employeeCode: employee.code,
  }));
  return { items };
});

export const POST = handleRoute(async ({ owner, req }) => {
  const body = await readBody<Record<string, unknown>>(req);
  requireFields(body, ["employeeId", "date", "type", "amount"]);
  const employee = await db.employee.findUnique({ where: { id: String(body.employeeId) } });
  if (!employee) throw new HttpError(404, "Employee not found");
  const type = requireEnum(body.type, ADJUSTMENT_TYPES, "type");
  const amount = round2(Number(body.amount));
  if (!Number.isFinite(amount) || amount === 0) throw new HttpError(400, "amount must be a non-zero number (signed)");
  const adjustment = await db.adjustment.create({
    data: {
      employeeId: employee.id,
      date: parseDate(String(body.date)),
      type,
      amount,
      reason: body.reason ? String(body.reason) : null,
      createdById: owner.id,
      createdByName: owner.name,
    },
  });
  await logAudit({
    owner,
    action: "CREATE",
    module: "ADJUSTMENT",
    recordId: adjustment.id,
    recordLabel: `${employee.code} — ${employee.fullName}: ${type} ₹${amount.toLocaleString("en-IN")}`,
    newValue: { type, amount, date: adjustment.date, reason: adjustment.reason },
  });
  return { ...adjustment, employeeName: employee.fullName, employeeCode: employee.code };
});
