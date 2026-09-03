import { db } from "@/lib/db";
import { handleRoute, monthBounds } from "@/lib/api-helpers";
import { round2 } from "@/lib/money";
import { currentMonth } from "@/app/api/_lib/engine";

// GET /api/reports/settlement-summary?month=YYYY-MM (default current month)
// Reads persisted Settlement rows for the month (run /api/settlements/generate to populate).
export const GET = handleRoute(async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const month = sp.get("month") ?? currentMonth();
  const { from, to } = monthBounds(month);

  const settlements = await db.settlement.findMany({
    where: { month },
    orderBy: { netPayable: "desc" },
    include: { employee: { select: { fullName: true, code: true } } },
  });

  const rows = settlements.map((s) => ({
    id: s.id,
    employeeName: s.employee.fullName,
    employeeCode: s.employee.code,
    totalDays: s.totalDays,
    gross: round2(s.grossEarnings),
    additions: round2(s.additions),
    advanceDeducted: round2(s.advanceDeducted),
    net: round2(s.netPayable),
    status: s.status,
  }));

  const totals = {
    totalDays: rows.reduce((s, r) => s + r.totalDays, 0),
    gross: round2(rows.reduce((s, r) => s + r.gross, 0)),
    additions: round2(rows.reduce((s, r) => s + r.additions, 0)),
    advanceDeducted: round2(rows.reduce((s, r) => s + r.advanceDeducted, 0)),
    net: round2(rows.reduce((s, r) => s + r.net, 0)),
    count: rows.length,
  };

  return {
    columns: [
      { key: "employeeName", label: "Employee", type: "string" },
      { key: "employeeCode", label: "Code", type: "string" },
      { key: "totalDays", label: "Days", type: "number" },
      { key: "gross", label: "Gross", type: "currency" },
      { key: "additions", label: "Additions", type: "currency" },
      { key: "advanceDeducted", label: "Advance Deducted", type: "currency" },
      { key: "net", label: "Net Payable", type: "currency" },
      { key: "status", label: "Status", type: "string" },
    ],
    rows,
    totals,
    meta: { month, from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) },
  };
});
