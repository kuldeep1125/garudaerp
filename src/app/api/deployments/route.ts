import { db } from "@/lib/db";
import { handleRoute, readBody, requireFields, parseDate, parsePage, HttpError, endOfDay } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { round2 } from "@/lib/money";
import {
  startOfDay,
  SHIFT_UNITS,
  SHIFTS,
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
  if (propertyId) where.propertyId = propertyId;
  if (employeeId) where.employeeId = employeeId;
  if (shift) where.shift = shift.toUpperCase();

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

interface EntryInput {
  employeeId?: string;
  shift?: string;
  billingRate?: number | string;
  payoutRate?: number | string;
}

/**
 * Shift-overlap rule — a person physically cannot be in two places for the same
 * working time, across ANY two properties:
 *   FULL covers both halves → conflicts with EVERYTHING (DAY, NIGHT, FULL).
 *   DAY + DAY and NIGHT + NIGHT → same half twice → conflict.
 *   DAY + NIGHT → different halves → ALLOWED (morning venue + evening venue).
 */
function shiftsOverlap(a: string, b: string): boolean {
  if (a === "FULL" || b === "FULL") return true;
  return a === b;
}

interface ExistingWork { shift: string; propertyName: string; propertyId: string }

// POST /api/deployments — create work records for one property + date.
// Rates resolve automatically: override > property.billingRate (billing) /
// employee.standardRate (payout). Amounts = rate × shift units (FULL = 2).
// Every amount is snapshotted — later master-rate changes never rewrite history.
export const POST = handleRoute(async ({ owner, req }) => {
  const body = await readBody<{
    propertyId?: string;
    date?: string;
    notes?: string;
    entries?: EntryInput[];
    // Legacy single-shift bulk shape (kept for compatibility): one shift for all employees.
    shift?: string;
    employeeIds?: string[];
    overrides?: Record<string, { billingRate?: number | string; payoutRate?: number | string }>;
  }>(req);
  requireFields(body as Record<string, unknown>, ["propertyId", "date"]);

  const property = await db.property.findUnique({ where: { id: String(body.propertyId) } });
  if (!property) throw new HttpError(404, "Property not found");
  const date = parseDate(String(body.date));
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);

  // Normalize input into per-employee entries with explicit shifts.
  const rawEntries: EntryInput[] = Array.isArray(body.entries) && body.entries.length
    ? body.entries
    : (Array.isArray(body.employeeIds) ? body.employeeIds.filter(Boolean).map(String) : []).map((employeeId) => ({
        employeeId,
        shift: body.shift,
        ...(body.overrides?.[employeeId] ?? {}),
      }));
  if (!rawEntries.length) throw new HttpError(400, "entries must contain at least one employee");

  const planned: {
    employeeId: string;
    employeeName: string;
    shift: string;
    units: number;
    billingRate: number;
    payoutRate: number;
    billingAmount: number;
    payoutAmount: number;
  }[] = [];
  const skipped: { employeeName: string; reason: string }[] = [];

  // Fetch employees + EVERY same-day row for these employees ACROSS ALL
  // properties — an employee booked elsewhere today cannot be double-booked
  // into an overlapping shift here.
  const empIds = [...new Set(rawEntries.map((e) => String(e.employeeId ?? "")))].filter(Boolean);
  const [employees, existingSameDay] = await Promise.all([
    db.employee.findMany({ where: { id: { in: empIds } } }),
    db.deployment.findMany({
      where: { employeeId: { in: empIds }, date: { gte: dayStart, lte: dayEnd } },
      select: { employeeId: true, shift: true, propertyId: true, property: { select: { name: true } } },
    }),
  ]);
  const empById = new Map(employees.map((e) => [e.id, e]));
  const bookedByEmployee = new Map<string, ExistingWork[]>();
  for (const d of existingSameDay) {
    const list = bookedByEmployee.get(d.employeeId) ?? [];
    list.push({ shift: d.shift, propertyName: d.property.name, propertyId: d.propertyId });
    bookedByEmployee.set(d.employeeId, list);
  }
  // Rows being created in THIS same request also block each other (e.g. the
  // same employee entered twice with DAY and FULL).
  const plannedByEmployee = new Map<string, ExistingWork[]>();

  if (property.billingRate <= 0) {
    throw new HttpError(400, `Set a billing rate for ${property.name} first (edit the property).`);
  }

  for (const entry of rawEntries) {
    const empId = String(entry.employeeId ?? "");
    const emp = empById.get(empId);
    if (!emp) {
      skipped.push({ employeeName: empId || "Unknown", reason: "Employee not found" });
      continue;
    }
    const employeeLabel = `${emp.code} — ${emp.fullName}`;
    const shift = String(entry.shift ?? body.shift ?? "DAY").toUpperCase();
    if (!SHIFTS.includes(shift as (typeof SHIFTS)[number])) {
      skipped.push({ employeeName: employeeLabel, reason: `Invalid shift "${shift}"` });
      continue;
    }
    const clashes = [
      ...(bookedByEmployee.get(empId) ?? []),
      ...(plannedByEmployee.get(empId) ?? []),
    ].filter((w) => shiftsOverlap(w.shift, shift));
    if (clashes.length > 0) {
      const sameProperty = clashes.some((w) => w.propertyId === property.id);
      const detail = clashes
        .map((w) => `${w.shift} @ ${w.propertyName}`)
        .slice(0, 2)
        .join(", ");
      skipped.push({
        employeeName: employeeLabel,
        reason: sameProperty
          ? `Already deployed on this date for ${clashes[0].shift} shift at ${property.name}`
          : `Already works ${detail} on this date — overlapping shift`,
      });
      continue;
    }
    const plannedList = plannedByEmployee.get(empId) ?? [];
    plannedList.push({ shift, propertyName: property.name, propertyId: property.id });
    plannedByEmployee.set(empId, plannedList);
    const units = SHIFT_UNITS[shift] ?? 1;
    const billingRate = entry.billingRate !== undefined && entry.billingRate !== null && entry.billingRate !== ""
      ? round2(Number(entry.billingRate))
      : round2(property.billingRate);
    const payoutRate = entry.payoutRate !== undefined && entry.payoutRate !== null && entry.payoutRate !== ""
      ? round2(Number(entry.payoutRate))
      : round2(emp.standardRate);
    if (!Number.isFinite(billingRate) || !Number.isFinite(payoutRate) || billingRate < 0 || payoutRate < 0) {
      skipped.push({ employeeName: employeeLabel, reason: "Invalid rate value" });
      continue;
    }
    planned.push({
      employeeId: emp.id,
      employeeName: employeeLabel,
      shift,
      units,
      billingRate,
      payoutRate,
      billingAmount: round2(billingRate * units),
      payoutAmount: round2(payoutRate * units),
    });
  }

  if (!planned.length) {
    if (skipped.some((s) => s.reason.includes("Already"))) {
      throw new HttpError(409, "No deployments created — selected employees are already booked for overlapping shifts on this date", {
        duplicates: skipped.map((s) => s.employeeName),
        conflicts: skipped.map((s) => `${s.employeeName}: ${s.reason}`),
      });
    }
    throw new HttpError(400, skipped[0]?.reason ?? "No deployments created");
  }

  const created = await db.$transaction(async (tx) => {
    // Race-safe re-check inside the write transaction: another request could
    // have booked the same employee between validation and commit.
    for (const p of planned) {
      const nowBooked = await tx.deployment.findMany({
        where: { employeeId: p.employeeId, date: { gte: dayStart, lte: dayEnd } },
        select: { shift: true, propertyId: true },
      });
      const clash = nowBooked.find((w) => shiftsOverlap(w.shift, p.shift));
      if (clash) {
        const emp = empById.get(p.employeeId);
        throw new HttpError(409, `${emp ? `${emp.code} — ${emp.fullName}` : "Employee"} is already booked for an overlapping shift on this date`);
      }
    }
    const rows: ReturnType<typeof serializeDeployment>[] = [];
    for (const p of planned) {
      const row = await tx.deployment.create({
        data: {
          date,
          employeeId: p.employeeId,
          propertyId: property.id,
          shift: p.shift,
          billingRate: p.billingRate,
          payoutRate: p.payoutRate,
          billingAmount: p.billingAmount,
          payoutAmount: p.payoutAmount,
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
    // comma-joined ids — /api/undo splits them (bulk reverse)
    recordId: created.map((c) => String(c.id)).join(","),
    recordLabel: `${created.length} deployment(s) — ${property.name} ${String(body.date)}`,
    newValue: {
      count: created.length,
      rows: planned.map((p) => ({ employee: p.employeeName, shift: p.shift, units: p.units, billingRate: p.billingRate, payoutRate: p.payoutRate })),
    },
  });

  return { created, skipped };
});
