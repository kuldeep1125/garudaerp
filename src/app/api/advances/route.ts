import { db } from "@/lib/db";
import { handleRoute, readBody, requireFields, parseDate, parsePage, endOfDay, HttpError } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { requirePositiveAmount, startOfDay } from "@/app/api/_lib/engine";

export const GET = handleRoute(async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const { page, pageSize, skip } = parsePage(sp);
  const where: Record<string, unknown> = {};
  const employeeId = sp.get("employeeId");
  const from = sp.get("from");
  const to = sp.get("to");
  if (employeeId) where.employeeId = employeeId;
  if (from && to) where.date = { gte: startOfDay(parseDate(from)), lte: endOfDay(parseDate(to)) };
  else if (from) where.date = { gte: startOfDay(parseDate(from)) };
  else if (to) where.date = { lte: endOfDay(parseDate(to)) };

  const [rows, total, agg] = await Promise.all([
    db.advance.findMany({
      where,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      skip,
      take: pageSize,
      include: { employee: { select: { fullName: true, code: true } } },
    }),
    db.advance.count({ where }),
    db.advance.aggregate({ where, _sum: { amount: true } }),
  ]);
  const items = rows.map(({ employee, ...a }) => ({
    ...a,
    employeeName: employee.fullName,
    employeeCode: employee.code,
  }));
  return { items, total, page, pageSize, totals: { given: agg._sum.amount ?? 0 } };
});

export const POST = handleRoute(async ({ owner, req }) => {
  const body = await readBody<Record<string, unknown>>(req);
  requireFields(body, ["employeeId", "date", "amount"]);
  const employee = await db.employee.findUnique({ where: { id: String(body.employeeId) } });
  if (!employee) throw new HttpError(404, "Employee not found");
  const amount = requirePositiveAmount(body.amount, "Advance amount");
  const advance = await db.advance.create({
    data: {
      employeeId: employee.id,
      date: parseDate(String(body.date)),
      amount,
      reason: body.reason ? String(body.reason) : null,
      method: body.method ? String(body.method) : null,
      reference: body.reference ? String(body.reference) : null,
      notes: body.notes ? String(body.notes) : null,
      givenById: owner.id,
      givenByName: owner.name,
    },
  });
  await logAudit({
    owner,
    action: "CREATE",
    module: "ADVANCE",
    recordId: advance.id,
    recordLabel: `${employee.code} — ${employee.fullName}: ₹${amount.toLocaleString("en-IN")}`,
    newValue: { amount, date: advance.date, reason: advance.reason },
  });
  return { ...advance, employeeName: employee.fullName, employeeCode: employee.code };
});
