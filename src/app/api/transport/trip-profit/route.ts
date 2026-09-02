import { handleRoute } from "@/lib/api-helpers";
import { round2 } from "@/lib/money";
import { reportRange } from "@/app/api/_lib/engine";
import { computeTripProfit, TRIP_PROFIT_NOTE } from "../../_lib/trip-profit";

// GET /api/transport/trip-profit?from=&to=&limit=8
// Top trips by ESTIMATED profit — see _lib/trip-profit.ts for the allocation model.
export const GET = handleRoute(async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const { from, to } = reportRange(sp);
  const limit = Math.min(20, Math.max(3, Number(sp.get("limit") ?? 8) || 8));

  const rows = await computeTripProfit(from, to);

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    totalTrips: rows.length,
    totals: {
      revenue: round2(rows.reduce((s, r) => s + r.revenue, 0)),
      allocatedCost: round2(rows.reduce((s, r) => s + r.allocatedCost, 0)),
      profit: round2(rows.reduce((s, r) => s + r.profit, 0)),
    },
    note: TRIP_PROFIT_NOTE,
    trips: rows.slice(0, limit),
  };
});
