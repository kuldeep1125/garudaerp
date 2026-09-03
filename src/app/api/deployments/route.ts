import { db } from "@/lib/db";
import { handleRoute, readBody, requireFields, parseDate, parsePage, HttpError, endOfDay } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { round2 } from "@/lib/money";
import {
  startOfDay,
  resolveContract,
  recomputeDeploymentPaid,
  serializeDeployment,
} from "@/app/api/_lib/engine";

export const GET = handleRoute(async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const { page, pageSize, skip } = parsePage(sp);
  const where: Record<string, unknown> = {};
  const date = sp.get("date");
  const from = sp.get("from");
  const to = sp.get("to");
  if (date) {
    const d = parseDate(date);
    where.date = { gte: startOfDay(d), lte: endOfDay(d) };
  } else if (from && to) {
    where.date = { gte: startOfDay(parseDate(from)), lte: endOfDay(parseDate(to)) };
  } else if (from) {
    where.date = { gte: startOfDay(parseDate(from)) };
  } else if (to) {
    where.date = { lte: endOfDay(parseDate(to)) };
  }
  const propertyId = sp.get("propertyId");
  const employeeId = sp.get("employeeId");
  const shift = sp.get("shift");
  const status = sp.get("status");
  if (propertyId) where.propertyId = propertyId;
  if (employeeId) where.employeeId = employeeId;
  if (shift) where.shift = shift.toUpperCase();
  if (status) where.status = { in: status.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean) };

  const [rows, total, agg] = await Promise.all([
    db.deployment.findMany({
      where,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      skip,
      take: pageSize,
      include: { employee: { select: { fullName: true, code: true } }, property: { select: { name: true } } },
    }),
    db.deployment.count({ where }),
    db.deployment.aggregate({
      where,
      _sum: { billingAmount: true, payoutAmount: true },
      _count: true,
    }),
  ]);
  const billing = round2(agg._sum.billingAmount ?? 0);
  const payout = round2(agg._sum.payoutAmount ?? 0);
  return {
    items: rows.map(serializeDeployment),
    total,
    page,
    pageSize,
    totals: { billing, payout, margin: round2(billing - payout), count: agg._count },
  };
});

export const POST = handleRoute(async ({ owner, req }) => {
  const body = await readBody<{
    propertyId?: string;
    date?: string;
    shift?: string;
    workCategory?: string;
    notes?: string;
    overrides?: Record<string, { billingRate?: number | string; payoutRate?: number | string }>;
    employeeIds?: string[];
  }>(req);
  requireFields(body as Record<string, unknown>, ["propertyId", "date", "shift"]);
  const employeeIds = Array.isArray(body.employeeIds) ? body.employeeIds.filter(Boolean).map(String) : [];
  if (!employeeIds.length) throw new HttpError(400, "employeeIds must contain at least one employee");

  const property = await db.property.findUnique({ where: { id: String(body.propertyId) } });
  if (!property) throw new HttpError(404, "Property not found");
  const date = parseDate(String(body.date));
  const shift = String(body.shift).toUpperCase();
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);

  const [employees, contract, existingSameDay] = await Promise.all([
    db.employee.findMany({ where: { id: { in: employeeIds } } }),
    resolveContract(property.id, date),
    db.deployment.findMany({
      where: {
        propertyId: property.id,
        shift,
        date: { gte: dayStart, lte: dayEnd },
        status: { not: "CANCELLED" },
        employeeId: { in: employeeIds },
      },
      select: { employeeId: true },
    }),
  ]);
  const empById = new Map(employees.map((e) => [e.id, e]));
  const duplicateIds = new Set(existingSameDay.map((d) => d.employeeId));

  // Rate resolution per employee: override > contract > employee.standardRate (payout only).
  const planned: {
    employeeId: string;
    employeeName: string;
    billingRate: number;
    payoutRate: number;
  }[] = [];
  const skipped: { employeeName: string; reason: string }[] = [];
  const missingBilling: string[] = [];

  for (const empId of employeeIds) {
    const emp = empById.get(empId);
    const override = body.overrides?.[empId];
    if (!emp) {
      skipped.push({ employeeName: String(empId), reason: "Employee not found" });
      continue;
    }
    const employeeLabel = `${emp.code} — ${emp.fullName}`;
    if (duplicateIds.has(empId)) {
      skipped.push({
        employeeName: employeeLabel,
        reason: "Duplicate: already deployed to this property on this date & shift",
      });
      continue;
    }
    const overrideBilling =
      override?.billingRate !== undefined && override?.billingRate !== null && override?.billingRate !== ""
        ? Number(override.billingRate)
        : null;
    const overridePayout =
      override?.payoutRate !== undefined && override?.payoutRate !== null && override?.payoutRate !== ""
        ? Number(override.payoutRate)
        : null;
    const billingRate = overrideBilling ?? contract?.billingRate ?? null;
    const payoutRate = overridePayout ?? contract?.payoutRate ?? emp.standardRate;
    if (billingRate == null || !Number.isFinite(billingRate)) {
      missingBilling.push(employeeLabel);
      continue;
    }
    planned.push({
      employeeId: emp.id,
      employeeName: employeeLabel,
      billingRate: round2(billingRate),
      payoutRate: round2(payoutRate),
    });
  }

  if (!planned.length) {
    if (missingBilling.length) {
      throw new HttpError(
        400,
        `No active contract for ${property.name} on ${String(body.date)} and no billing override for: ${missingBilling.join(", ")}`
      );
    }
    throw new HttpError(409, "No deployments created — all selected employees are duplicates for this property/date/shift", {
      duplicates: skipped.map((s) => s.employeeName),
    });
  }

  const created = await db.$transaction(async (tx) => {
    const rows: ReturnType<typeof serializeDeployment>[] = [];
    for (const p of planned) {
      const row = await tx.deployment.create({
        data: {
          date,
          employeeId: p.employeeId,
          propertyId: property.id,
          shift,
          workCategory: body.workCategory ? String(body.workCategory) : null,
          billingRate: p.billingRate,
          payoutRate: p.payoutRate,
          billingAmount: p.billingRate,
          payoutAmount: p.payoutRate,
          status: "SCHEDULED",
          notes: body.notes ? String(body.notes) : null,
          createdById: owner.id,
          createdByName: owner.name,
        },
        include: { employee: { select: { fullName: true, code: true } }, property: { select: { name: true } } },
      });
      rows.push(serializeDeployment(row));
    }
    await recomputeDeploymentPaid(tx, property.id);
    return rows;
  }, { timeout: 15000, maxWait: 10000 });

  await logAudit({
    owner,
    action: "CREATE",
    module: "DEPLOYMENT",
    recordId: created.map((c) => String(c.id)).join(","),
    recordLabel: `${created.length} deployment(s) — ${property.name} ${String(body.date)} ${shift}`,
    newValue: { count: created.length, employees: planned.map((p) => p.employeeName) },
  });

  return { created, skipped };
});
