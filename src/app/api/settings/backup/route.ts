import { db } from "@/lib/db";
import { handleRoute } from "@/lib/api-helpers";

// GET /api/settings/backup
// Full data export (JSON) for owner-level backup / migration. Sessions are
// deliberately excluded — they are auth artifacts, not business data. Audit
// history is capped to the latest 1,000 entries to keep the file reasonable.
export const GET = handleRoute(async () => {
  const [
    owners, employees, properties, deployments, propertyPayments,
    advances, adjustments, settlements, settlementLines, expenses, expenseCategories,
    recurringExpenses, vehicles, clients, trips, vehicleEmiPayments, maintenance,
    notificationDismisses, appSettings, shifts, auditLogs,
  ] = await Promise.all([
    db.owner.findMany(),
    db.employee.findMany(),
    db.property.findMany(),
    db.deployment.findMany({ orderBy: { date: "asc" } }),
    db.propertyPayment.findMany({ orderBy: { date: "asc" } }),
    db.advance.findMany({ orderBy: { date: "asc" } }),
    db.adjustment.findMany({ orderBy: { date: "asc" } }),
    db.settlement.findMany({ orderBy: { month: "asc" } }),
    db.settlementLine.findMany(),
    db.expense.findMany({ orderBy: { date: "asc" } }),
    db.expenseCategory.findMany(),
    db.recurringExpense.findMany(),
    db.vehicle.findMany(),
    db.client.findMany(),
    db.trip.findMany({ orderBy: { startAt: "asc" } }),
    db.vehicleEmiPayment.findMany({ orderBy: { month: "asc" } }),
    db.maintenance.findMany({ orderBy: { date: "asc" } }),
    db.notificationDismiss.findMany(),
    db.appSetting.findMany(),
    db.shift.findMany(),
    db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 1000 }),
  ]);

  const data = {
    owners, employees, properties, deployments, propertyPayments,
    advances, adjustments, settlements, settlementLines, expenses, expenseCategories,
    recurringExpenses, vehicles, clients, trips, vehicleEmiPayments, maintenance,
    notificationDismisses, appSettings, shifts, auditLogs,
  };

  const counts = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length]));

  return {
    format: "bizhub-backup",
    version: 1,
    generatedAt: new Date().toISOString(),
    counts,
    data,
  };
});
