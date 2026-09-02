import { db } from "@/lib/db";
import { handleRoute, parseDate, endOfDay } from "@/lib/api-helpers";
import { round2 } from "@/lib/money";
import { dayKey } from "@/app/api/_lib/engine";

// GET /api/reports/daily-operations?date=YYYY-MM-DD (default today)
// Every deployment of the day (all statuses) for the operations sheet.
export const GET = handleRoute(async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const date = sp.get("date") ? parseDate(sp.get("date")) : new Date();
  const from = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const to = endOfDay(date);

  const deps = await db.deployment.findMany({
    where: { date: { gte: from, lte: to } },
    orderBy: [{ property: { name: "asc" } }, { shift: "asc" }, { employee: { fullName: "asc" } }],
    include: {
      employee: { select: { fullName: true, code: true } },
      property: { select: { name: true } },
    },
  });

  const rows = deps.map((d) => ({
    id: d.id,
    propertyName: d.property.name,
    employeeName: d.employee.fullName,
    employeeCode: d.employee.code,
    shift: d.shift,
    status: d.status,
    billingRate: round2(d.billingRate),
    payoutRate: round2(d.payoutRate),
    billing: round2(d.billingAmount),
    payout: round2(d.payoutAmount),
  }));

  const active = rows.filter((r) => r.status !== "CANCELLED");
  const totals = {
    deployments: rows.length,
    billing: round2(active.reduce((s, r) => s + r.billing, 0)),
    payout: round2(active.reduce((s, r) => s + r.payout, 0)),
  };

  return {
    columns: [
      { key: "propertyName", label: "Property", type: "string" },
      { key: "employeeName", label: "Employee", type: "string" },
      { key: "shift", label: "Shift", type: "string" },
      { key: "status", label: "Status", type: "string" },
      { key: "billingRate", label: "Billing Rate", type: "currency" },
      { key: "payoutRate", label: "Payout Rate", type: "currency" },
      { key: "billing", label: "Billing", type: "currency" },
      { key: "payout", label: "Payout", type: "currency" },
    ],
    rows,
    totals,
    meta: { date: dayKey(date) },
  };
});
