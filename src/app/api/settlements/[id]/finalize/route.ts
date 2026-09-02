import { db } from "@/lib/db";
import { handleRoute, HttpError } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

export const PUT = handleRoute(async ({ owner, params }) => {
  const { id } = params;
  const existing = await db.settlement.findUnique({
    where: { id },
    include: { employee: { select: { fullName: true, code: true } } },
  });
  if (!existing) throw new HttpError(404, "Settlement not found");
  if (existing.status !== "DRAFT") {
    throw new HttpError(409, existing.status === "PAID" ? "Settlement is already paid" : "Settlement is already finalized");
  }

  const settlement = await db.settlement.update({
    where: { id },
    data: { status: "FINALIZED", finalizedAt: new Date(), finalizedByName: owner.name },
  });

  await logAudit({
    owner,
    action: "FINALIZE",
    module: "SETTLEMENT",
    recordId: id,
    recordLabel: `${existing.employee.code} — ${existing.employee.fullName} (${existing.month})`,
    previousValue: { status: existing.status },
    newValue: { status: "FINALIZED", finalizedBy: owner.name },
  });
  return settlement;
});
