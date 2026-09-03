import { db } from "@/lib/db";
import { handleRoute, readBody, HttpError } from "@/lib/api-helpers";
import { recomputeDeploymentPaid } from "@/app/api/_lib/engine";
import { Prisma } from "@prisma/client";

// POST /api/undo — reverse a wrong entry with ZERO mismatch.
// Body: { auditLogId } OR { module, recordId }
//
// Supported reversals (all inside one transaction + derived recompute):
//   CREATE  → deletes the created record (guards against linked data)
//   PAYMENT → property payment delete + FIFO re-allocation; or EMI payment revert
//   STATUS / UPDATE → restores previousValue fields onto the record
//   DELETE  → recreates the deleted record from its previousValue snapshot
//
// Every reversal marks the original audit entry `undoneAt` and writes an
// UNDO audit entry, so the audit trail stays complete.

const UNDOABLE_ACTIONS = ["CREATE", "PAYMENT", "STATUS", "UPDATE", "DELETE"];

/** module → prisma delegate */
const MODEL: Record<string, string> = {
  PAYMENT: "propertyPayment",
  ADVANCE: "advance",
  ADJUSTMENT: "adjustment",
  EXPENSE: "expense",
  DEPLOYMENT: "deployment",
  TRIP: "trip",
  MAINTENANCE: "maintenance",
  EMI: "vehicleEmiPayment",
  EMPLOYEE: "employee",
  PROPERTY: "property",
  CLIENT: "client",
  VEHICLE: "vehicle",
  CONTRACT: "contract",
};

/** module → Prisma dmmf model name (for column validation on DELETE-restore) */
const DMMF_MODEL: Record<string, string> = {
  PAYMENT: "PropertyPayment",
  ADVANCE: "Advance",
  ADJUSTMENT: "Adjustment",
  EXPENSE: "Expense",
  DEPLOYMENT: "Deployment",
  TRIP: "Trip",
  MAINTENANCE: "Maintenance",
  EMI: "VehicleEmiPayment",
  EMPLOYEE: "Employee",
  PROPERTY: "Property",
  CLIENT: "Client",
  VEHICLE: "Vehicle",
  CONTRACT: "Contract",
};

/**
 * Keep only real scalar columns from a snapshot and validate required ones exist.
 * Returns null when the module is not safe to restore; throws when snapshot lacks
 * required fields (prevents half-restored records — the zero-mismatch guarantee).
 */
function pickColumns(module: string, snapshot: Record<string, unknown>): Record<string, unknown> | null {
  const modelName = DMMF_MODEL[module];
  if (!modelName) return null;
  const dmmfModel = (Prisma as unknown as {
    dmmf: { datamodel: { models: { name: string; fields: { name: string; kind: string; isRequired: boolean; hasDefaultValue: boolean; isList: boolean }[] }[] } };
  }).dmmf.datamodel.models.find((m) => m.name === modelName);
  if (!dmmfModel) return null;
  const scalarFields = dmmfModel.fields.filter((f) => f.kind === "scalar" && !f.isList);
  const allowed = new Set(scalarFields.map((f) => f.name));
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(snapshot)) {
    if (allowed.has(k) && v !== undefined) data[k] = v;
  }
  const missing = scalarFields
    .filter((f) => f.isRequired && !f.hasDefaultValue)
    .filter((f) => data[f.name] === undefined || data[f.name] === null)
    .map((f) => f.name);
  if (missing.length > 0) {
    throw new HttpError(409, `Saved snapshot is incomplete (missing: ${missing.join(", ")}) — restore skipped to keep data consistent.`);
  }
  return data;
}

export const POST = handleRoute(async ({ owner, req }) => {
  const body = await readBody<Record<string, unknown>>(req);
  const auditLogId = body.auditLogId ? String(body.auditLogId) : null;
  const moduleFilter = body.module ? String(body.module).toUpperCase() : null;
  const recordId = body.recordId ? String(body.recordId) : null;

  // ---- Resolve the audit entry to reverse ----
  let log: Awaited<ReturnType<typeof db.auditLog.findFirst>> = null;
  if (auditLogId) {
    log = await db.auditLog.findUnique({ where: { id: auditLogId } });
  } else if (recordId) {
    log = await db.auditLog.findFirst({
      where: {
        recordId,
        ...(moduleFilter ? { module: moduleFilter } : {}),
        action: { in: UNDOABLE_ACTIONS },
        undoneAt: null,
      },
      orderBy: { createdAt: "desc" },
    });
  }
  if (!log) throw new HttpError(404, "No undoable entry found for this record.");
  if (log.undoneAt) throw new HttpError(409, "This entry has already been undone.");
  if (!UNDOABLE_ACTIONS.includes(log.action)) {
    throw new HttpError(409, `Entries of type "${log.action}" cannot be undone automatically.`);
  }
  const modelName = MODEL[log.module];
  if (!modelName) throw new HttpError(409, `Module "${log.module}" does not support undo yet.`);

  const result = await db.$transaction(async (tx) => {
    const txDelegate = (tx as unknown as Record<string, {
      findUnique: (a: { where: { id: string } }) => Promise<unknown>;
      delete: (a: { where: { id: string } }) => Promise<unknown>;
      deleteMany: (a: { where: { id: string } }) => Promise<unknown>;
      update: (a: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
      create: (a: { data: Record<string, unknown> }) => Promise<unknown>;
    }>)[modelName];

    // ---- Execute the reversal ----
    switch (`${log!.module}:${log!.action}`) {
      // Property payment created (action=PAYMENT or CREATE) → delete + re-allocate FIFO
      case "PAYMENT:PAYMENT":
      case "PAYMENT:CREATE": {
        const payment = await txDelegate.findUnique({ where: { id: log!.recordId! } });
        if (!payment) break; // already deleted — treat as undone
        await txDelegate.delete({ where: { id: log!.recordId! } });
        await recomputeDeploymentPaid(tx, (payment as { propertyId: string }).propertyId);
        break;
      }

      // EMI payment recorded → restore pre-payment status + remove auto-expense
      case "EMI:PAYMENT": {
        const prev = asObj(log!.previousValue);
        const emi = await txDelegate.findUnique({ where: { id: log!.recordId! } });
        if (!emi) break;
        await txDelegate.update({
          where: { id: log!.recordId! },
          data: { status: String(prev.status ?? "UNPAID"), paidDate: null },
        });
        await tx.expense.deleteMany({ where: { reference: `EMI-${log!.recordId}` } });
        break;
      }

      // Plain creates → guarded delete
      case "ADVANCE:CREATE": {
        const adv = await txDelegate.findUnique({ where: { id: log!.recordId! } });
        if (!adv) break;
        if ((adv as { settlementId: string | null }).settlementId) {
          throw new HttpError(409, "This advance is part of a settlement and cannot be undone. Remove it from the settlement instead.");
        }
        await txDelegate.delete({ where: { id: log!.recordId! } });
        break;
      }
      case "TRIP:CREATE": {
        const trip = await txDelegate.findUnique({ where: { id: log!.recordId! } });
        if (!trip) break;
        if ((trip as { paidAmount: number }).paidAmount > 0.005) {
          throw new HttpError(409, "This trip already has collections recorded. Cancel the trip from the Trips page instead.");
        }
        await txDelegate.delete({ where: { id: log!.recordId! } });
        break;
      }
      case "EXPENSE:CREATE":
      case "ADJUSTMENT:CREATE":
      case "MAINTENANCE:CREATE": {
        await txDelegate.deleteMany({ where: { id: log!.recordId! } });
        break;
      }
      case "DEPLOYMENT:CREATE": {
        const dep = await txDelegate.findUnique({ where: { id: log!.recordId! } });
        if (!dep) break;
        await txDelegate.delete({ where: { id: log!.recordId! } });
        await recomputeDeploymentPaid(tx, (dep as { propertyId: string }).propertyId);
        break;
      }
      case "EMPLOYEE:CREATE":
      case "PROPERTY:CREATE":
      case "CLIENT:CREATE":
      case "VEHICLE:CREATE":
      case "CONTRACT:CREATE": {
        const existing = await txDelegate.findUnique({ where: { id: log!.recordId! } });
        if (!existing) break;
        try {
          await txDelegate.delete({ where: { id: log!.recordId! } });
        } catch (e) {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
            throw new HttpError(409, "This record is linked to other entries. Remove the linked entries first, then undo.");
          }
          throw e;
        }
        break;
      }

      // STATUS / UPDATE → restore previousValue fields
      case "DEPLOYMENT:STATUS":
      case "DEPLOYMENT:UPDATE": {
        const prev = asObj(log!.previousValue);
        if (Object.keys(prev).length === 0) throw new HttpError(409, "No previous value recorded for this change.");
        const dep = await txDelegate.findUnique({ where: { id: log!.recordId! } });
        if (!dep) throw new HttpError(404, "The deployment no longer exists.");
        await txDelegate.update({ where: { id: log!.recordId! }, data: prev });
        await recomputeDeploymentPaid(tx, (dep as { propertyId: string }).propertyId);
        break;
      }
      default: {
        // TRIP:PAYMENT (collection on trip) + generic STATUS / UPDATE restore
        if (log!.action === "STATUS" || log!.action === "UPDATE" || log!.action === "PAYMENT") {
          const prev = asObj(log!.previousValue);
          if (Object.keys(prev).length === 0) throw new HttpError(409, "No previous value recorded for this change.");
          const exists = await txDelegate.findUnique({ where: { id: log!.recordId! } });
          if (!exists) throw new HttpError(404, "The record no longer exists.");
          const data: Record<string, unknown> = { ...prev };
          if (log!.module === "EMI" && typeof prev.status === "string" && prev.status !== "PAID") {
            data.paidDate = null;
          }
          await txDelegate.update({ where: { id: log!.recordId! }, data });
          // Maintenance "done" reversal also removes the auto-created expense
          if (log!.module === "MAINTENANCE" && typeof prev.status === "string" && prev.status !== "DONE") {
            await tx.expense.deleteMany({ where: { reference: `MNT-${log!.recordId}` } });
          }
        } else {
          throw new HttpError(409, `"${log!.module}" ${log!.action} entries cannot be undone automatically yet.`);
        }
      }
    }

    // ---- DELETE action → recreate the record from its snapshot ----
    if (log!.action === "DELETE") {
      const prev = asObj(log!.previousValue);
      if (Object.keys(prev).length === 0) {
        throw new HttpError(409, "The original record snapshot is not available for restore.");
      }
      const data = pickColumns(log!.module, prev);
      if (!data) throw new HttpError(409, `Restore is not supported for module "${log!.module}".`);
      try {
        await txDelegate.create({ data });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          throw new HttpError(409, "A record with the same identity already exists — restore skipped.");
        }
        throw e;
      }
      if ((log!.module === "DEPLOYMENT" || log!.module === "PAYMENT") && prev.propertyId) {
        await recomputeDeploymentPaid(tx, String(prev.propertyId));
      }
    }

    // ---- Mark original entry undone + write UNDO audit entry (atomic) ----
    await tx.auditLog.update({ where: { id: log!.id }, data: { undoneAt: new Date() } });
    await tx.auditLog.create({
      data: {
        ownerId: owner.id,
        ownerName: owner.name,
        action: "UNDO",
        module: log!.module,
        recordId: log!.recordId,
        recordLabel: `Undo: ${log!.recordLabel ?? `${log!.action} on ${log!.module.toLowerCase()}`}`,
        previousValue: log!.newValue ?? null,
        newValue: log!.previousValue ?? null,
      },
    });
    return { id: log!.id, label: log!.recordLabel, module: log!.module, action: log!.action };
  }, { timeout: 15000, maxWait: 10000 });

  return { ok: true, undone: result };
});

function asObj(json: string | null | undefined): Record<string, unknown> {
  if (!json) return {};
  try {
    const v = JSON.parse(json);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
