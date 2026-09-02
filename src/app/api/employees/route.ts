import { db } from "@/lib/db";
import { handleRoute, readBody, requireFields, parseDate, parsePage, HttpError } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { round2 } from "@/lib/money";
import { advanceBalanceMap, nextCode, EMPLOYEE_STATUSES, requireEnum } from "@/app/api/_lib/engine";

export const GET = handleRoute(async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const { page, pageSize, skip } = parsePage(sp);
  const where: Record<string, unknown> = {};
  const search = sp.get("search")?.trim();
  const status = sp.get("status");
  if (search) {
    where.OR = [
      { fullName: { contains: search } },
      { code: { contains: search } },
      { mobile: { contains: search } },
    ];
  }
  if (status) where.status = status.toUpperCase();

  const [rows, total] = await Promise.all([
    db.employee.findMany({
      where,
      orderBy: { fullName: "asc" },
      skip,
      take: pageSize,
    }),
    db.employee.count({ where }),
  ]);
  const balances = await advanceBalanceMap(rows.map((r) => r.id));
  const items = rows.map((r) => ({
    ...r,
    advanceBalance: balances.get(r.id)?.balance ?? 0,
  }));
  return { items, total, page, pageSize };
});

export const POST = handleRoute(async ({ owner, req }) => {
  const body = await readBody<Record<string, unknown>>(req);
  requireFields(body, ["fullName"]);
  const fullName = String(body.fullName).trim();
  if (!fullName) throw new HttpError(400, "fullName cannot be empty");
  const status = body.status ? requireEnum(body.status, EMPLOYEE_STATUSES, "status") : "ACTIVE";
  const code = await nextCode("EMP", "employee");
  const employee = await db.employee.create({
    data: {
      code,
      fullName,
      photoUrl: body.photoUrl ? String(body.photoUrl) : null,
      dob: body.dob ? parseDate(body.dob as string) : null,
      gender: body.gender ? String(body.gender).toUpperCase() : null,
      mobile: body.mobile ? String(body.mobile) : null,
      whatsapp: body.whatsapp ? String(body.whatsapp) : null,
      address: body.address ? String(body.address) : null,
      city: body.city ? String(body.city) : null,
      emergencyContact: body.emergencyContact ? String(body.emergencyContact) : null,
      joiningDate: body.joiningDate ? parseDate(body.joiningDate as string) : new Date(),
      designation: body.designation ? String(body.designation) : null,
      skills: body.skills ? String(body.skills) : null,
      standardRate: round2(Number(body.standardRate ?? 0) || 0),
      rateType: body.rateType ? String(body.rateType) : "PER_DAY",
      status,
      bankDetails: body.bankDetails ? String(body.bankDetails) : null,
      upiId: body.upiId ? String(body.upiId) : null,
      preferredPaymentMethod: body.preferredPaymentMethod ? String(body.preferredPaymentMethod) : null,
      notes: body.notes ? String(body.notes) : null,
    },
  });
  await logAudit({
    owner,
    action: "CREATE",
    module: "EMPLOYEE",
    recordId: employee.id,
    recordLabel: `${employee.code} — ${employee.fullName}`,
    newValue: { fullName, status, standardRate: employee.standardRate },
  });
  return { ...employee, advanceBalance: 0 };
});
