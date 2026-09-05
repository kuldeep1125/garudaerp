import { db } from "@/lib/db";
import { handleRoute, readBody } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

// POST /api/settings/reset — wipe ALL business data for a clean manual-testing
// start. Keeps: the logged-in owner (and other owner accounts), master data
// (shifts, expense categories, app settings). Body: { confirm: "RESET" }
export const POST = handleRoute(async ({ owner, req }) => {
  const body = await readBody<{ confirm?: string }>(req);
  if (body.confirm !== "RESET") {
    return { ok: false, error: "Confirmation word does not match. Send confirm: \"RESET\"." };
  }

  const tables = [
    "settlementLine", "settlement", "adjustment", "advance", "deployment", "propertyPayment",
    "expense", "recurringExpense", "vehicleEmiPayment", "maintenance", "trip",
    "client", "vehicle", "notificationDismiss", "auditLog", "employee", "property",
  ] as const;
  const removed: Record<string, number> = {};
  for (const t of tables) {
    removed[t] = await (db as unknown as Record<string, { deleteMany: () => Promise<{ count: number }> }>)[t]
      .deleteMany()
      .then((r) => r.count);
  }

  await logAudit({
    owner,
    action: "DELETE",
    module: "SETTINGS",
    recordLabel: `Business data reset — ${Object.values(removed).reduce((s, n) => s + n, 0)} records wiped`,
  });

  return { ok: true, removed };
});
