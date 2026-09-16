import { db } from "@/lib/db";
import { handleRoute, readBody, parseDate, HttpError } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { round2 } from "@/lib/money";
import { advanceBalanceMap, serializeDeployment, EMPLOYEE_STATUSES, requireEnum, EMPLOYMENT_TYPES, RENT_MODES, payValuesOf } from "@/app/api/_lib/engine";

export const GET = handleRoute(async ({ params }) => {
  const { id } = params;
  const employee = await db.employee.findUnique({ where: { id } });
  if (!employee) throw new HttpError(404, "Employee not found");
  const [deployments, advances, adjustments, settlements, balances, payHistory] = await Promise.all([
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
    db.employeePayHistory.findMany({
      where: { employeeId: id },
      orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
    }),
  ]);
  return {
    employee: { ...employee, advanceBalance: balances.get(id)?.balance ?? 0 },
    deployments: deployments.map(serializeDeployment),
    advances,
    adjustments,
    settlements,
    payHistory,
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
  if (body.joiningDate !== undefined && body.joiningDate) {
    const joiningDate = parseDate(body.joiningDate as string);
    if (joiningDate.getTime() !== existing.joiningDate.getTime()) {
      // Historical integrity: joiningDate is a financial-impacting historical
      // fact (it anchors salary/rent proration). Once any record exists for the
      // employee it can no longer be changed — edits must never rewrite history.
      const [depC, advC, setC, adjC] = await Promise.all([
        db.deployment.count({ where: { employeeId: id } }),
        db.advance.count({ where: { employeeId: id } }),
        db.settlement.count({ where: { employeeId: id } }),
        db.adjustment.count({ where: { employeeId: id } }),
      ]);
      if (depC + advC + setC + adjC > 0) {
        throw new HttpError(409, "Joining date is locked — this employee already has deployments/advances/settlements, so changing it would rewrite historical payroll.");
      }
      data.joiningDate = joiningDate;
    }
  }
  if (body.status !== undefined) data.status = requireEnum(body.status, EMPLOYEE_STATUSES, "status");

  // --- employment / salary / rent / contractor fields ---
  if (body.employmentType !== undefined) {
    const employmentType = requireEnum(body.employmentType, EMPLOYMENT_TYPES, "employment type");
    data.employmentType = employmentType;
    if (employmentType === "SALARIED") {
      const monthlySalary = body.monthlySalary !== undefined ? round2(Number(body.monthlySalary) || 0) : (existing.monthlySalary || 0);
      if (monthlySalary <= 0) throw new HttpError(400, "Monthly salary must be greater than 0 for salaried employees");
      data.monthlySalary = monthlySalary;
      data.standardRate = 0;
      if (body.overtimeThreshold !== undefined) {
        const t = Number(body.overtimeThreshold);
        if (!Number.isFinite(t) || t < 0 || !Number.isInteger(t)) throw new HttpError(400, "Overtime threshold must be a whole number ≥ 0");
        data.overtimeThreshold = Math.floor(t);
      }
      if (body.overtimeRate !== undefined) data.overtimeRate = round2(Math.max(0, Number(body.overtimeRate) || 0));
    } else {
      // switching back to per-shift: a payout rate is mandatory (existing salaried rows have 0)
      const rate = body.standardRate !== undefined ? round2(Number(body.standardRate) || 0) : existing.standardRate;
      if (rate <= 0) throw new HttpError(400, "Set the payout rate (₹ per shift) — it is used to pay the employee for every deployment automatically.");
      data.standardRate = rate;
      data.monthlySalary = 0;
      data.overtimeRate = 0;
    }
  } else {
    if (body.monthlySalary !== undefined) {
      const monthlySalary = round2(Number(body.monthlySalary) || 0);
      if (existing.employmentType === "SALARIED" && monthlySalary <= 0) throw new HttpError(400, "Monthly salary must be greater than 0 for salaried employees");
      data.monthlySalary = monthlySalary;
    }
    if (body.overtimeThreshold !== undefined) {
      const t = Number(body.overtimeThreshold);
      if (!Number.isFinite(t) || t < 0 || !Number.isInteger(t)) throw new HttpError(400, "Overtime threshold must be a whole number ≥ 0");
      data.overtimeThreshold = Math.floor(t);
    }
    if (body.overtimeRate !== undefined) data.overtimeRate = round2(Math.max(0, Number(body.overtimeRate) || 0));
  }

  if (body.onBusinessRent !== undefined) {
    const onRent = Boolean(body.onBusinessRent);
    data.onBusinessRent = onRent;
    if (onRent) {
      const rentAmount = body.rentAmount !== undefined ? round2(Number(body.rentAmount) || 0) : existing.rentAmount;
      if (rentAmount <= 0) throw new HttpError(400, "Set the rent amount (₹) for business accommodation");
      data.rentAmount = rentAmount;
      if (body.rentMode !== undefined) data.rentMode = requireEnum(body.rentMode, RENT_MODES, "rent mode");
    } else {
      data.rentAmount = 0;
    }
  } else {
    if (body.rentAmount !== undefined) {
      const rentAmount = round2(Math.max(0, Number(body.rentAmount) || 0));
      data.rentAmount = rentAmount;
      if (rentAmount > 0 && !existing.onBusinessRent) data.onBusinessRent = true;
    }
    if (body.rentMode !== undefined) data.rentMode = requireEnum(body.rentMode, RENT_MODES, "rent mode");
  }

  if (body.hasContractor !== undefined) {
    const hasC = Boolean(body.hasContractor);
    data.hasContractor = hasC;
    if (hasC) {
      const contractorName = body.contractorName !== undefined ? String(body.contractorName).trim() : existing.contractorName;
      if (!contractorName) throw new HttpError(400, "Enter the contractor's name");
      data.contractorName = contractorName;
      data.contractorRateCut = body.contractorRateCut !== undefined ? round2(Math.max(0, Number(body.contractorRateCut) || 0)) : existing.contractorRateCut;
    } else {
      data.contractorName = null;
      data.contractorRateCut = 0;
    }
  } else {
    if (body.contractorName !== undefined) {
      const name = body.contractorName === "" || body.contractorName === null ? null : String(body.contractorName).trim();
      data.contractorName = name;
      if (name && !existing.hasContractor) data.hasContractor = true;
      if (!name) {
        data.hasContractor = false;
        data.contractorRateCut = 0;
      }
    }
    if (body.contractorRateCut !== undefined) data.contractorRateCut = round2(Math.max(0, Number(body.contractorRateCut) || 0));
  }

  for (const key of Object.keys(data)) {
    previous[key] = (existing as unknown as Record<string, unknown>)[key];
    changes[key] = data[key];
  }
  if (!Object.keys(data).length) throw new HttpError(400, "No editable fields provided");

  // --- historical integrity: snapshot pay-term changes into the effective-dated history ---
  const PAY_FIELDS = [
    "employmentType", "standardRate", "monthlySalary", "overtimeThreshold", "overtimeRate",
    "onBusinessRent", "rentAmount", "rentMode", "hasContractor", "contractorName", "contractorRateCut",
  ] as const;
  const payChanged = PAY_FIELDS.some((k) => k in data && data[k] !== (existing as unknown as Record<string, unknown>)[k]);

  const employee = await db.employee.update({ where: { id }, data });
  if (payChanged) {
    // Backfill the initial-terms row first if this employee predates pay history,
    // then append the new terms effective from NOW — past periods keep the terms
    // that were in force at their time, so no report can change retroactively.
    const histCount = await db.employeePayHistory.count({ where: { employeeId: id } });
    if (histCount === 0) {
      await db.employeePayHistory.create({
        data: {
          employeeId: id,
          effectiveFrom: existing.joiningDate,
          ...payValuesOf(existing),
          changedByName: owner?.name ?? null,
          reason: "Initial terms",
        },
      });
    }
    await db.employeePayHistory.create({
      data: {
        employeeId: id,
        effectiveFrom: new Date(),
        ...payValuesOf(employee),
        changedByName: owner?.name ?? null,
        reason: "Terms updated",
      },
    });
  }
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
