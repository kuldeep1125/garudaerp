import { db } from "@/lib/db";
import { handleRoute, readBody, parseDate, HttpError } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { round2 } from "@/lib/money";
import { advanceBalanceMap, serializeDeployment, EMPLOYEE_STATUSES, requireEnum } from "@/app/api/_lib/engine";

export const GET = handleRoute(async ({ params }) => {
  const { id } = params;
  const employee = await db.employee.findUnique({ where: { id } });
  if (!employee) throw new HttpError(404, "Employee not found");
  const [deployments, advances, adjustments, settlements, balances] = await Promise.all([
    db.deployment.findMany({
      where: { employeeId: id },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 100,
      include: { employee: { select: { fullName: true, code: true } }, property: { select: { name: true } } },
    }),
    db.advance.findMany({ where: { employeeId: id }, orderBy: { date: "desc" }, take: 100 }),
    db.adjustment.findMany({ where: { employeeId: id }, orderBy: { date: "desc" }, take: 100 }),
    db.settlement.findMany({
      where: { employeeId: id },
      orderBy: [{ month: "desc" }],
      take: 100,
      include: { lines: { orderBy: { date: "asc" } } },
    }),
    advanceBalanceMap([id]),
  ]);
  return {
    employee: { ...employee, advanceBalance: balances.get(id)?.balance ?? 0 },
    deployments: deployments.map(serializeDeployment),
    advances,
    adjustments,
    settlements,
  };
});

const EDITABLE_STRINGS = [
  "fullName", "photoUrl", "gender", "mobile", "whatsapp", "address", "city",
  "emergencyContact", "designation", "skills", "rateType", "bankDetails",
  "upiId", "preferredPaymentMethod", "notes",
] as const;

export const PUT = handleRoute(async ({ owner, params, req }) => {
  const { id } = params;
  const body = await readBody<Record<string, unknown>>(req);
  const existing = await db.employee.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Employee not found");

  const data: Record<string, unknown> = {};
  const previous: Record<string, unknown> = {};
  const changes: Record<string, unknown> = {};
  for (const key of EDITABLE_STRINGS) {
    if (body[key] !== undefined) {
      data[key] = body[key] === null || body[key] === "" ? null : String(body[key]);
    }
  }
  if (body.standardRate !== undefined) data.standardRate = round2(Number(body.standardRate) || 0);
  if (body.dob !== undefined) data.dob = body.dob ? parseDate(body.dob as string) : null;
  if (body.joiningDate !== undefined) data.joiningDate = body.joiningDate ? parseDate(body.joiningDate as string) : existing.joiningDate;
  if (body.status !== undefined) data.status = requireEnum(body.status, EMPLOYEE_STATUSES, "status");

  for (const key of Object.keys(data)) {
    previous[key] = (existing as unknown as Record<string, unknown>)[key];
    changes[key] = data[key];
  }
  if (!Object.keys(data).length) throw new HttpError(400, "No editable fields provided");

  const employee = await db.employee.update({ where: { id }, data });
  await logAudit({
    owner,
    action: "UPDATE",
    module: "EMPLOYEE",
    recordId: employee.id,
    recordLabel: `${employee.code} — ${employee.fullName}`,
    previousValue: previous,
    newValue: changes,
  });
  const balances = await advanceBalanceMap([id]);
  return { ...employee, advanceBalance: balances.get(id)?.balance ?? 0 };
});
