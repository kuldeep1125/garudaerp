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
    include: { employee: { select: { fullName: true, code: true, employmentType: true } } },
  });

  const rows = settlements.map((s) => ({
    id: s.id,
    employeeId: s.employeeId,
    employeeName: s.employee.fullName,
    employeeCode: s.employee.code,
    employmentType: s.employee.employmentType === "SALARIED" ? "Salaried" : "Per-shift",
    totalDays: s.totalDays,
    gross: round2(s.grossEarnings),
    additions: round2(s.additions),
    rentDeducted: round2(s.rentDeducted ?? 0), // [ADDED]
    advanceDeducted: round2(s.advanceDeducted),
    otherDeductions: round2(s.otherDeductions),
    contractorCut: round2(s.contractorCut),
    net: round2(s.netPayable),
    status: s.status,
  }));

  const totals = {
    totalDays: rows.reduce((s, r) => s + r.totalDays, 0),
    gross: round2(rows.reduce((s, r) => s + r.gross, 0)),
    additions: round2(rows.reduce((s, r) => s + r.additions, 0)),
    rentDeducted: round2(rows.reduce((s, r) => s + r.rentDeducted, 0)), // [ADDED]
    advanceDeducted: round2(rows.reduce((s, r) => s + r.advanceDeducted, 0)),
    otherDeductions: round2(rows.reduce((s, r) => s + r.otherDeductions, 0)),
    contractorCut: round2(rows.reduce((s, r) => s + r.contractorCut, 0)),
    net: round2(rows.reduce((s, r) => s + r.net, 0)),
    count: rows.length,
  };

  return {
    columns: [
      { key: "employeeName", label: "Employee", type: "string" },
      { key: "employeeCode", label: "Code", type: "string" },
      { key: "employmentType", label: "Type", type: "string" },
      { key: "totalDays", label: "Days", type: "number" },
      { key: "gross", label: "Gross", type: "currency" },
      { key: "additions", label: "Additions", type: "currency" },
      { key: "rentDeducted", label: "Rent Deducted", type: "currency" }, // [ADDED]
      { key: "advanceDeducted", label: "Advance Deducted", type: "currency" },
      { key: "otherDeductions", label: "Other Deductions", type: "currency" },
      { key: "contractorCut", label: "Contractor Cut", type: "currency" },
      { key: "net", label: "Net Payable", type: "currency" },
      { key: "status", label: "Status", type: "string" },
    ],
    rows,
    totals,
    meta: { month, from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) },
    note: "Net payable = gross + additions − rent deducted − other deductions − contractor cut − advance deducted. Salaried gross = monthly salary + overtime (deployments beyond the threshold × rate).", // [FIXED]
  };
});
