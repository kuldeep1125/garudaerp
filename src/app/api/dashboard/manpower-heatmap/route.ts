import { db } from "@/lib/db";
import { handleRoute } from "@/lib/api-helpers";
import { BILLABLE, dayKey } from "@/app/api/_lib/engine";
import { lastNDays } from "../../_lib/dashboard";

// GET /api/dashboard/manpower-heatmap?days=14
// Day × property deployment intensity matrix for the manpower dashboard
// workforce heat-map. Only BILLABLE deployments count.
export const GET = handleRoute(async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const days = Math.min(30, Math.max(7, Number(sp.get("days") ?? 14) || 14));
  const { from, to, keys } = lastNDays(days);

  const deps = await db.deployment.findMany({
    where: { date: { gte: from, lte: to }, status: { in: [...BILLABLE] } },
    select: { date: true, propertyId: true, property: { select: { name: true } }, shift: true },
  });

  const totals = new Map<string, number>();
  const cell = new Map<string, number>();
  for (const d of deps) {
    const k = `${dayKey(d.date)}|${d.propertyId}`;
    cell.set(k, (cell.get(k) ?? 0) + 1);
    totals.set(d.propertyId, (totals.get(d.propertyId) ?? 0) + 1);
  }

  const propertyIds = [...totals.keys()];
  const props = propertyIds.length
    ? await db.property.findMany({ where: { id: { in: propertyIds } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(props.map((p) => [p.id, p.name]));

  // Rows sorted by total shifts desc, capped to the busiest 8 properties so the
  // grid stays readable; columns = every day in the window.
  const rows = propertyIds
    .map((id) => ({ propertyId: id, propertyName: nameById.get(id) ?? "Unknown", total: totals.get(id) ?? 0 }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  return {
    days,
    dates: keys,
    rows: rows.map((r) => ({
      propertyId: r.propertyId,
      propertyName: r.propertyName,
      total: r.total,
      cells: keys.map((date) => ({ date, shifts: cell.get(`${date}|${r.propertyId}`) ?? 0 })),
    })),
    unlistedShifts: deps.length - rows.reduce((s, r) => s + r.total, 0),
  };
});
