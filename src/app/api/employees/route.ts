import { db } from "@/lib/db";
import { handleRoute, readBody, requireFields, parseDate, parsePage, HttpError } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { round2 } from "@/lib/money";
import { advanceBalanceMap, nextCode, EMPLOYEE_STATUSES, EMPLOYMENT_TYPES, RENT_MODES, requireEnum } from "@/app/api/_lib/engine";

export const GET = handleRoute(async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const { page, pageSize, skip } = parsePage(sp);
  const where: Record<string, unknown> = {};
  const search = sp.get("search")?.trim();
  const status = sp.get("status");
  const employmentType = sp.get("employmentType")?.toUpperCase();
  const hasContractor = sp.get("hasContractor");
  if (search) {
    where.OR = [
      { fullName: { contains: search } },
      { code: { contains: search } },
      { mobile: { contains: search } },
      { contractorName: { contains: search } },
    ];
  }
  if (status) where.status = status.toUpperCase();
  if (employmentType && (EMPLOYMENT_TYPES as readonly string[]).includes(employmentType)) where.employmentType = employmentType;
  if (hasContractor === "1" || hasContractor === "true") where.hasContractor = true;

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

/** Shared salary/rent/contractor validation + normalization for POST and PUT. */
function employmentFields(body: Record<string, unknown>, existing?: {
  employmentType: string; standardRate: number;
}) {
  const out: Record<string, unknown> = {};
  const employmentType = body.employmentType !== undefined
    ? requireEnum(body.employmentType, EMPLOYMENT_TYPES, "employment type")
    : (existing?.employmentType ?? "NON_SALARIED");
  out.employmentType = employmentType;

  if (employmentType === "SALARIED") {
    // Monthly salary is the pay model; per-shift rate becomes irrelevant.
    if (body.monthlySalary === undefined && !existing) throw new HttpError(400, "Set the monthly salary for a salaried employee");
    const monthlySalary = body.monthlySalary !== undefined ? round2(Number(body.monthlySalary) || 0) : 0;
    if (monthlySalary <= 0) throw new HttpError(400, "Monthly salary must be greater than 0 for salaried employees");
    out.monthlySalary = monthlySalary;
    out.standardRate = 0; // salaried employees are never paid per shift
    const threshold = body.overtimeThreshold !== undefined ? Number(body.overtimeThreshold) : 30;
    if (!Number.isFinite(threshold) || threshold < 0 || !Number.isInteger(threshold)) throw new HttpError(400, "Overtime threshold must be a whole number ≥ 0");
    out.overtimeThreshold = Math.floor(threshold);
    out.overtimeRate = body.overtimeRate !== undefined ? round2(Math.max(0, Number(body.overtimeRate) || 0)) : 0;
  } else {
    // Per-shift model — keep/require the existing rate semantics.
    if (body.standardRate !== undefined) {
      const standardRate = round2(Number(body.standardRate) || 0);
      if (standardRate <= 0) throw new HttpError(400, "Set the payout rate (₹ per shift) — it is used to pay the employee for every deployment automatically.");
      out.standardRate = standardRate;
    } else if (!existing || existing.standardRate <= 0) {
      // New non-salaried employee, or a salaried→non-salaried switch with no rate yet.
      throw new HttpError(400, "Set the payout rate (₹ per shift) — it is used to pay the employee for every deployment automatically.");
    }
    out.monthlySalary = 0;
    out.overtimeRate = 0;
    if (body.overtimeThreshold !== undefined) out.overtimeThreshold = Math.max(0, Math.floor(Number(body.overtimeThreshold) || 30));
  }

  if (body.onBusinessRent !== undefined) out.onBusinessRent = Boolean(body.onBusinessRent);
  const onRent = out.onBusinessRent !== undefined ? Boolean(out.onBusinessRent) : undefined;
  if (onRent === true) {
    const rentAmount = body.rentAmount !== undefined ? round2(Number(body.rentAmount) || 0) : 0;
    if (rentAmount <= 0) throw new HttpError(400, "Set the rent amount (₹) for business accommodation");
    out.rentAmount = rentAmount;
    out.rentMode = body.rentMode !== undefined ? requireEnum(body.rentMode, RENT_MODES, "rent mode") : "MONTH";
  } else if (onRent === false) {
    out.rentAmount = 0;
  } else if (body.rentAmount !== undefined) {
    out.rentAmount = round2(Math.max(0, Number(body.rentAmount) || 0));
    if (body.rentMode !== undefined) out.rentMode = requireEnum(body.rentMode, RENT_MODES, "rent mode");
  }

  if (body.hasContractor !== undefined) out.hasContractor = Boolean(body.hasContractor);
  const hasC = out.hasContractor !== undefined ? Boolean(out.hasContractor) : undefined;
  if (hasC === true) {
    const contractorName = body.contractorName !== undefined ? String(body.contractorName).trim() : "";
    if (!contractorName) throw new HttpError(400, "Enter the contractor's name");
    out.contractorName = contractorName;
    out.contractorRateCut = body.contractorRateCut !== undefined ? round2(Math.max(0, Number(body.contractorRateCut) || 0)) : 0;
  } else if (hasC === false) {
    out.contractorName = null;
    out.contractorRateCut = 0;
  } else if (body.contractorName !== undefined || body.contractorRateCut !== undefined) {
    if (body.contractorName !== undefined) out.contractorName = body.contractorName === "" ? null : String(body.contractorName).trim();
    if (body.contractorRateCut !== undefined) out.contractorRateCut = round2(Math.max(0, Number(body.contractorRateCut) || 0));
  }
  return out;
}

export const POST = handleRoute(async ({ owner, req }) => {
  const body = await readBody<Record<string, unknown>>(req);
  requireFields(body, ["fullName"]);
  const fullName = String(body.fullName).trim();
  if (!fullName) throw new HttpError(400, "fullName cannot be empty");
  const status = body.status ? requireEnum(body.status, EMPLOYEE_STATUSES, "status") : "ACTIVE";
  const pay = employmentFields(body);
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
      standardRate: pay.standardRate !== undefined ? (pay.standardRate as number) : 0,
      rateType: body.rateType ? String(body.rateType) : "PER_SHIFT",
      status,
      employmentType: pay.employmentType as string,
      monthlySalary: (pay.monthlySalary as number) ?? 0,
      overtimeThreshold: (pay.overtimeThreshold as number) ?? 30,
      overtimeRate: (pay.overtimeRate as number) ?? 0,
      onBusinessRent: Boolean(pay.onBusinessRent ?? false),
      rentAmount: (pay.rentAmount as number) ?? 0,
      rentMode: (pay.rentMode as string) ?? "MONTH",
      hasContractor: Boolean(pay.hasContractor ?? false),
      contractorName: (pay.contractorName as string | null) ?? null,
      contractorRateCut: (pay.contractorRateCut as number) ?? 0,
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
    newValue: {
      fullName, status,
      employmentType: employee.employmentType,
      standardRate: employee.standardRate,
      monthlySalary: employee.monthlySalary,
      overtime: `${employee.overtimeThreshold}+ @ ${employee.overtimeRate}`,
      rent: employee.onBusinessRent ? `${employee.rentAmount}/${employee.rentMode}` : "none",
      contractor: employee.hasContractor ? `${employee.contractorName} @ ${employee.contractorRateCut}/shift` : "none",
    },
  });
  // Historical-integrity: seed the effective-dated pay history with the initial
  // terms. Every later pay change appends a new row (effectiveFrom = change
  // time); accruals resolve the row in force at each historical moment, so
  // edits can never rewrite past months.
  await db.employeePayHistory.create({
    data: {
      employeeId: employee.id,
      effectiveFrom: employee.joiningDate,
      employmentType: employee.employmentType,
      standardRate: employee.standardRate,
      monthlySalary: employee.monthlySalary,
      overtimeThreshold: employee.overtimeThreshold,
      overtimeRate: employee.overtimeRate,
      onBusinessRent: employee.onBusinessRent,
      rentAmount: employee.rentAmount,
      rentMode: employee.rentMode,
      hasContractor: employee.hasContractor,
      contractorName: employee.contractorName,
      contractorRateCut: employee.contractorRateCut,
      changedByName: owner?.name ?? null,
      reason: "Initial terms",
    },
  });
  return { ...employee, advanceBalance: 0 };
});
