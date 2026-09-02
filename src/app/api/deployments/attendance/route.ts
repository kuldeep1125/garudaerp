import { db } from "@/lib/db";
import { handleRoute } from "@/lib/api-helpers";
import { BILLABLE } from "@/app/api/_lib/engine";

// GET /api/deployments/attendance?month=YYYY-MM
// Attendance-style month grid: per-employee BILLABLE shift counts for every
// day of the month. Rows are all active employees (worked days still visible),
// cells carry the number of shifts worked that day (0..n, day+night combine).
export const GET = handleRoute(async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const now = new Date();
  const monthParam = sp.get("month");
  let year = now.getFullYear();
  let month = now.getMonth(); // 0-based
  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [y, m] = monthParam.split("-").map(Number);
    if (m >= 1 && m <= 12) {
      year = y;
      month = m - 1;
    }
  }

  const from = new Date(year, month, 1);
  const to = new Date(year, month + 1, 0, 23, 59, 59, 999);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const dates: string[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(year, month, d);
    dates.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }

  const [employees, deps] = await Promise.all([
    db.employee.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, fullName: true, code: true, designation: true },
      orderBy: { fullName: "asc" },
    }),
    db.deployment.findMany({
      where: { date: { gte: from, lte: to }, status: { in: [...BILLABLE] } },
      select: { employeeId: true, date: true },
    }),
  ]);

  const cell = new Map<string, number>();
  const totalBy = new Map<string, number>();
  for (const d of deps) {
    const dk = d.date;
    const dateStr = `${dk.getFullYear()}-${String(dk.getMonth() + 1).padStart(2, "0")}-${String(dk.getDate()).padStart(2, "0")}`;
    cell.set(`${d.employeeId}|${dateStr}`, (cell.get(`${d.employeeId}|${dateStr}`) ?? 0) + 1);
    totalBy.set(d.employeeId, (totalBy.get(d.employeeId) ?? 0) + 1);
  }

  const rows = employees.map((e) => ({
    employeeId: e.id,
    name: e.fullName,
    code: e.code,
    role: e.designation,
    total: totalBy.get(e.id) ?? 0,
    workedDays: dates.filter((date) => (cell.get(`${e.id}|${date}`) ?? 0) > 0).length,
    cells: dates.map((date) => ({ date, shifts: cell.get(`${e.id}|${date}`) ?? 0 })),
  }));

  rows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  return {
    month: `${year}-${String(month + 1).padStart(2, "0")}`,
    dates,
    rows,
    totalShifts: deps.length,
  };
});
