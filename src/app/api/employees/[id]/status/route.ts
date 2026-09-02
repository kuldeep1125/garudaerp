import { db } from "@/lib/db";
import { handleRoute, readBody, requireFields, HttpError } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { advanceBalanceMap, EMPLOYEE_STATUSES, requireEnum } from "@/app/api/_lib/engine";

export const POST = handleRoute(async ({ owner, params, req }) => {
  const { id } = params;
  const body = await readBody<Record<string, unknown>>(req);
  requireFields(body, ["status"]);
  const status = requireEnum(body.status, EMPLOYEE_STATUSES, "status");
  const existing = await db.employee.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Employee not found");
  const employee = await db.employee.update({ where: { id }, data: { status } });
  await logAudit({
    owner,
    action: "STATUS",
    module: "EMPLOYEE",
    recordId: employee.id,
    recordLabel: `${employee.code} — ${employee.fullName}`,
    previousValue: { status: existing.status },
    newValue: { status },
  });
  const balances = await advanceBalanceMap([id]);
  return { ...employee, advanceBalance: balances.get(id)?.balance ?? 0 };
});
