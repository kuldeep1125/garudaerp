import { db } from "@/lib/db";
import { handleRoute, monthBounds } from "@/lib/api-helpers";
import { round2 } from "@/lib/money";
import { currentMonth } from "@/app/api/_lib/engine";

export const GET = handleRoute(async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const month = sp.get("month") ?? currentMonth();
  // validate format
  monthBounds(month);
  const status = sp.get("status");

  const where: Record<string, unknown> = { month };
  if (status) where.status = status.toUpperCase();

  const [items, all] = await Promise.all([
    db.settlement.findMany({
      where,
      include: {
        lines: { orderBy: { date: "asc" } },
        employee: { select: { fullName: true, code: true, designation: true } },
      },
    }),
    db.settlement.findMany({
      where: { month },
      select: { grossEarnings: true, rentDeducted: true, contractorCut: true, advanceDeducted: true, netPayable: true, status: true },
    }),
  ]);
  const withNames = items
    .map((s) => ({
      ...s,
      employeeName: s.employee.fullName,
      employeeCode: s.employee.code,
    }))
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  return {
    items: withNames,
    totals: {
      gross: round2(all.reduce((t, s) => t + s.grossEarnings, 0)),
      rent: round2(all.reduce((t, s) => t + s.rentDeducted, 0)), // [ADDED]
      contractorCut: round2(all.reduce((t, s) => t + s.contractorCut, 0)), // [ADDED]
      advance: round2(all.reduce((t, s) => t + s.advanceDeducted, 0)),
      net: round2(all.reduce((t, s) => t + s.netPayable, 0)),
      count: all.length,
      finalized: all.filter((s) => s.status !== "DRAFT").length,
    },
  };
});
