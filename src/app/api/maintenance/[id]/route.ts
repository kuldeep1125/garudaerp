import { db } from "@/lib/db";
import { handleRoute, readBody, parseDate, HttpError } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { round2 } from "@/lib/money";
import { dayKey, ensureCategory, optionalAmount, EPS } from "@/app/api/_lib/engine";

const STATUSES = ["SCHEDULED", "DONE"] as const;
const MAINTENANCE_TYPES = ["SERVICE", "REPAIR", "TYRES", "OTHER"] as const;

// PUT /api/maintenance/:id — update date/type/status/cost/description/nextDueDate.
// Marking DONE auto-creates the TRANSPORT expense (category Maintenance, ref MNT-<id>) once.
// Historical integrity: when an ALREADY-DONE record's cost changes, the linked
// auto-expense is synced to the new cost (same date) — the two records are the
// same money event, so they must never disagree.
export const PUT = handleRoute(async ({ owner, params, req }) => {
  const { id } = params;
  const body = await readBody<{
    status?: string;
    date?: string | null;
    type?: string;
    cost?: number | string;
    nextDueDate?: string | null;
    description?: string;
  }>(req);

  const record = await db.maintenance.findUnique({
    where: { id },
    include: { vehicle: { select: { id: true, name: true, registrationNumber: true } } },
  });
  if (!record) throw new HttpError(404, "Maintenance record not found");

  const data: {
    status?: string;
    date?: Date;
    type?: string;
    cost?: number;
    nextDueDate?: Date | null;
    description?: string | null;
  } = {};
  if (body.status !== undefined) {
    const status = String(body.status).toUpperCase();
    if (!STATUSES.includes(status as (typeof STATUSES)[number])) {
      throw new HttpError(400, `Invalid status: must be one of ${STATUSES.join(", ")}`);
    }
    data.status = status;
  }
  if (body.date !== undefined) {
    if (!body.date) throw new HttpError(400, "Date is required");
    data.date = parseDate(String(body.date));
  }
  if (body.type !== undefined) {
    const type = String(body.type).trim().toUpperCase();
    if (!MAINTENANCE_TYPES.includes(type as (typeof MAINTENANCE_TYPES)[number])) {
      throw new HttpError(400, `Invalid type: must be one of ${MAINTENANCE_TYPES.join(", ")}`);
    }
    data.type = type;
  }
  if (body.cost !== undefined) {
    data.cost = optionalAmount(body.cost, 0);
    if (data.cost < 0) throw new HttpError(400, "Cost cannot be negative");
  }
  if (body.nextDueDate !== undefined) {
    data.nextDueDate = body.nextDueDate ? parseDate(body.nextDueDate) : null;
  }
  if (body.description !== undefined) {
    data.description = body.description ? String(body.description) : null;
  }

  const willBeDone = data.status === "DONE" || (data.status === undefined && record.status === "DONE");

  const { updated, expenseCreated, expenseSynced } = await db.$transaction(async (tx) => {
    const row = await tx.maintenance.update({
      where: { id: record.id },
      data,
      include: { vehicle: { select: { id: true, name: true, registrationNumber: true } } },
    });
    let created = false;
    const finalCost = data.cost !== undefined ? data.cost : record.cost;
    if (willBeDone && record.status !== "DONE" && finalCost > 0) {
      const existing = await tx.expense.findFirst({ where: { reference: `MNT-${record.id}` }, select: { id: true } });
      if (!existing) {
        const cat = await ensureCategory("Maintenance", "TRANSPORT");
        await tx.expense.create({
          data: {
            date: row.date,
            business: "TRANSPORT",
            categoryId: cat.id,
            categoryName: cat.name,
            amount: round2(finalCost),
            description: `${row.type}${row.description ? ` — ${row.description}` : ""} (${row.vehicle.registrationNumber})`,
            vehicleId: row.vehicleId,
            vehicleName: row.vehicle.name,
            spentByName: owner.name,
            createdById: owner.id,
            createdByName: owner.name,
            reference: `MNT-${record.id}`,
          },
        });
        created = true;
      }
    }
    // Already-DONE record whose cost was edited → keep the linked auto-expense
    // in sync (amount only; expense.date stays exactly as originally recorded).
    let synced = false;
    if (record.status === "DONE" && data.cost !== undefined && Math.abs(data.cost - record.cost) > EPS) {
      const linked = await tx.expense.findFirst({ where: { reference: `MNT-${record.id}` }, select: { id: true } });
      if (linked) {
        await tx.expense.update({ where: { id: linked.id }, data: { amount: round2(data.cost) } });
        synced = true;
      }
    }
    return { updated: row, expenseCreated: created, expenseSynced: synced };
  }, { timeout: 15000, maxWait: 10000 });

  await logAudit({
    owner,
    action: "UPDATE",
    module: "MAINTENANCE",
    recordId: record.id,
    recordLabel: `${record.type} — ${record.vehicle.name} (${dayKey(record.date)})`,
    previousValue: { date: record.date, type: record.type, status: record.status, cost: record.cost, description: record.description, nextDueDate: record.nextDueDate },
    newValue: { date: updated.date, type: updated.type, status: updated.status, cost: updated.cost, description: updated.description, nextDueDate: updated.nextDueDate, expenseCreated, expenseSynced },
  });
  return { ...updated, expenseCreated, expenseSynced };
});
