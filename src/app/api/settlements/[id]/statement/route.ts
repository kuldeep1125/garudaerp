import { db } from "@/lib/db";
import { handleRoute, HttpError } from "@/lib/api-helpers";
import { advanceBalanceMap } from "@/app/api/_lib/engine";

const SETTING_KEYS = ["businessName", "businessAddress", "businessContact"] as const;

export const GET = handleRoute(async ({ params }) => {
  const { id } = params;
  const settlement = await db.settlement.findUnique({
    where: { id },
    include: {
      lines: { orderBy: { date: "asc" } },
      employee: { select: { id: true, fullName: true, code: true, designation: true } },
    },
  });
  if (!settlement) throw new HttpError(404, "Settlement not found");

  const [settings, balances] = await Promise.all([
    db.appSetting.findMany({ where: { key: { in: [...SETTING_KEYS] } } }),
    advanceBalanceMap([settlement.employeeId]),
  ]);
  const settingMap = new Map(settings.map((s) => [s.key, s.value]));

  return {
    settlement,
    employee: {
      id: settlement.employee.id,
      fullName: settlement.employee.fullName,
      code: settlement.employee.code,
      designation: settlement.employee.designation,
      monthlyAdvanceBalance: balances.get(settlement.employeeId)?.balance ?? 0,
    },
    business: {
      name: settingMap.get("businessName") ?? "BizHub",
      address: settingMap.get("businessAddress") ?? "",
      contact: settingMap.get("businessContact") ?? "",
    },
    lines: settlement.lines,
  };
});
