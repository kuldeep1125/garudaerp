import { db } from "@/lib/db";
import { handleRoute, readBody, HttpError } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { Prisma } from "@prisma/client";

// POST /api/settings/restore — merge-import a backup produced by
// GET /api/settings/backup ({ format:"bizhub-backup", version, data:{…} }).
//
// Safety model (merge-only):
//   • rows whose id already exists are NEVER touched (no deletes, no updates)
//   • rows colliding on any other unique field (employee code, vehicle reg,
//     category name+business, …) are skipped as well
//   • everything runs in ONE transaction — any failure leaves the DB untouched
//
// Response: { ok, created, skipped, found, perCollection: { [name]: { created, skipped } } }

/** Collection key in the backup file → prisma delegate + DMMF model. */
const COLLECTIONS: Record<string, { model: string; dmmf: string }> = {
  owners: { model: "owner", dmmf: "Owner" },
  shifts: { model: "shift", dmmf: "Shift" },
  expenseCategories: { model: "expenseCategory", dmmf: "ExpenseCategory" },
  appSettings: { model: "appSetting", dmmf: "AppSetting" },
  employees: { model: "employee", dmmf: "Employee" },
  properties: { model: "property", dmmf: "Property" },
  vehicles: { model: "vehicle", dmmf: "Vehicle" },
  clients: { model: "client", dmmf: "Client" },
  deployments: { model: "deployment", dmmf: "Deployment" },
  propertyPayments: { model: "propertyPayment", dmmf: "PropertyPayment" },
  advances: { model: "advance", dmmf: "Advance" },
  adjustments: { model: "adjustment", dmmf: "Adjustment" },
  settlements: { model: "settlement", dmmf: "Settlement" },
  settlementLines: { model: "settlementLine", dmmf: "SettlementLine" },
  recurringExpenses: { model: "recurringExpense", dmmf: "RecurringExpense" },
  expenses: { model: "expense", dmmf: "Expense" },
  trips: { model: "trip", dmmf: "Trip" },
  vehicleEmiPayments: { model: "vehicleEmiPayment", dmmf: "VehicleEmiPayment" },
  maintenance: { model: "maintenance", dmmf: "Maintenance" },
  notificationDismisses: { model: "notificationDismiss", dmmf: "NotificationDismiss" },
  auditLogs: { model: "auditLog", dmmf: "AuditLog" },
};

/** Insert order so foreign-key targets exist before rows that reference them. */
const INSERT_ORDER = [
  "owners", "appSettings", "shifts", "expenseCategories",
  "employees", "properties", "vehicles", "clients",
  "deployments", "propertyPayments", "settlements", "settlementLines",
  "advances", "adjustments", "recurringExpenses", "expenses",
  "trips", "vehicleEmiPayments", "maintenance", "notificationDismisses", "auditLogs",
];

interface DmmfField {
  name: string;
  kind: string;
  type: string;
  isList: boolean;
  isId: boolean;
  isUnique: boolean;
  isRequired: boolean;
  hasDefaultValue: boolean;
}

type TxDelegate = {
  findMany: (a: { select: Record<string, true> }) => Promise<Record<string, unknown>[]>;
  createMany: (a: { data: Record<string, unknown>[] }) => Promise<{ count: number }>;
};

function dmmfModel(name: string): { fields: DmmfField[] } | null {
  const models = (Prisma as unknown as {
    dmmf: { datamodel: { models: { name: string; fields: DmmfField[] }[] } };
  }).dmmf.datamodel.models;
  return models.find((m) => m.name === name) ?? null;
}

/** Keep only real scalar columns, coercing JSON date strings back to Dates.
 *  Returns null when the row is unusable (bad date or missing required field). */
function coerceRow(fields: DmmfField[], raw: Record<string, unknown>): Record<string, unknown> | null {
  const row: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.kind !== "scalar" || f.isList) continue;
    const v = raw[f.name];
    if (v === undefined) {
      if (f.isRequired && !f.hasDefaultValue) return null; // incomplete row — skip
      continue;
    }
    if (v === null) {
      if (f.isRequired && !f.hasDefaultValue) return null;
      row[f.name] = null;
      continue;
    }
    if (f.type === "DateTime") {
      const d = new Date(String(v));
      if (Number.isNaN(d.getTime())) return null; // unparseable date → skip row
      row[f.name] = d;
      continue;
    }
    row[f.name] = v;
  }
  return row;
}

export const POST = handleRoute(async ({ owner, req }) => {
  const body = await readBody<{ format?: string; version?: number; data?: Record<string, unknown> }>(req);

  if (!body || body.format !== "bizhub-backup") {
    throw new HttpError(400, "This file is not a BizHub backup — expected format \"bizhub-backup\". Nothing was imported.");
  }
  if (!body.data || typeof body.data !== "object" || Array.isArray(body.data)) {
    throw new HttpError(400, "Backup payload is missing its \"data\" section. Nothing was imported.");
  }

  const perCollection: Record<string, { created: number; skipped: number }> = {};
  let created = 0;
  let skipped = 0;
  let found = 0;

  await db.$transaction(async (tx) => {
    for (const key of INSERT_ORDER) {
      const cfg = COLLECTIONS[key];
      if (!cfg) continue;
      const rawRows = body.data?.[key];
      if (!Array.isArray(rawRows)) continue;
      found += rawRows.length;
      if (rawRows.length === 0) { perCollection[key] = { created: 0, skipped: 0 }; continue; }

      const model = dmmfModel(cfg.dmmf);
      if (!model) { perCollection[key] = { created: 0, skipped: rawRows.length }; skipped += rawRows.length; continue; }

      const txDelegate = (tx as unknown as Record<string, TxDelegate>)[cfg.model];
      if (!txDelegate) { perCollection[key] = { created: 0, skipped: rawRows.length }; skipped += rawRows.length; continue; }

      // 1) Coerce payload rows to real columns (drops junk + bad dates).
      const rows: Record<string, unknown>[] = [];
      let rowSkips = 0;
      for (const raw of rawRows) {
        if (!raw || typeof raw !== "object") { rowSkips++; continue; }
        const row = coerceRow(model.fields, raw as Record<string, unknown>);
        if (!row || typeof row.id !== "string") { rowSkips++; continue; }
        rows.push(row);
      }

      // 2) Merge-only filter: drop rows whose id (or any other unique scalar
      //    value) already exists. Existing rows are never modified.
      const uniqueFields = model.fields.filter((f) => f.kind === "scalar" && !f.isList && (f.isId || f.isUnique));
      const existingSets = new Map<string, Set<string>>();
      for (const uf of uniqueFields) {
        const present = rows.some((r) => uf.name in r && r[uf.name] !== null);
        if (!present) continue;
        const vals = await txDelegate.findMany({ select: { [uf.name]: true } });
        existingSets.set(uf.name, new Set(vals.map((v) => String(v[uf.name]))));
      }
      const insertable = rows.filter((r) => {
        for (const [uf, set] of existingSets) {
          const v = r[uf];
          if (v !== undefined && v !== null && set.has(String(v))) return false;
        }
        return true;
      });
      rowSkips += rows.length - insertable.length;

      // 3) Insert the remainder.
      let rowCreated = 0;
      if (insertable.length > 0) {
        try {
          const res = await txDelegate.createMany({ data: insertable });
          rowCreated = res.count;
        } catch (e) {
          // Most likely a dangling foreign key (hand-edited backup) — abort with
          // a clear message; the transaction rollback keeps the DB untouched.
          console.error("[restore] createMany failed for", key, e);
          throw new HttpError(400, `Backup data for "${key}" references records that do not exist — restore aborted, nothing was changed.`);
        }
      }

      perCollection[key] = { created: rowCreated, skipped: rowSkips };
      created += rowCreated;
      skipped += rowSkips;
    }
  }, { timeout: 30000, maxWait: 10000 });

  const collectionCount = Object.values(perCollection).filter((c) => c.created > 0 || c.skipped > 0).length;
  await logAudit({
    owner,
    action: "UPDATE",
    module: "SETTINGS",
    recordLabel: `Backup restore (merge) — created ${created}, skipped ${skipped} across ${collectionCount} collection(s)`,
    newValue: { created, skipped, perCollection },
  });

  return { ok: true, created, skipped, found, perCollection };
});
