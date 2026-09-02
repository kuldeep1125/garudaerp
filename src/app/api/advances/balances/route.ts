import { db } from "@/lib/db";
import { handleRoute } from "@/lib/api-helpers";
import { advanceBalanceMap } from "@/app/api/_lib/engine";

export const GET = handleRoute(async () => {
  const balances = await advanceBalanceMap();
  const ids = [...balances.keys()];
  if (!ids.length) return { items: [], total: 0 };
  const employees = await db.employee.findMany({
    where: { id: { in: ids } },
    select: { id: true, fullName: true, code: true },
  });
  const items = employees
    .map((e) => {
      const b = balances.get(e.id)!;
      return {
        employeeId: e.id,
        employeeName: e.fullName,
        employeeCode: e.code,
        totalTaken: b.totalTaken,
        totalDeducted: b.totalDeducted,
        balance: b.balance,
      };
    })
    .filter((i) => i.totalTaken > 0.005)
    .sort((a, b) => (b.balance > 0.005 ? 1 : 0) - (a.balance > 0.005 ? 1 : 0) || b.balance - a.balance);
  return { items, total: items.length };
});
