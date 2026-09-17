import { handleRoute } from "@/lib/api-helpers";
import { round2 } from "@/lib/money";
import { reportRange } from "@/app/api/_lib/engine";
import { computeTripProfit, TRIP_PROFIT_NOTE } from "../../_lib/trip-profit";

// GET /api/reports/trip-profit?from=&to=
// Trip-wise estimated profitability report: one row per trip with revenue,
// allocated vehicle cost, profit and margin. `chart` carries a compact slice
// for the reports-view bar chart — the most profitable trips plus up to two
// loss-makers so the chart shows both ends of the range.
export const GET = handleRoute(async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const { from, to } = reportRange(sp);

  const all = await computeTripProfit(from, to);
  const rows = all;

  // Chart slice: top 8 winners + up to 2 worst losers (deduped, profit order).
  const losers = [...all].reverse().filter((r) => r.profit < 0).slice(0, 2);
  const chartPool = [...all.slice(0, 8), ...losers];
  const seen = new Set<string>();
  const chart = chartPool
    .filter((r) => (seen.has(r.tripId) ? false : (seen.add(r.tripId), true)))
    .sort((a, b) => b.profit - a.profit)
    .map((r) => ({
      label: r.label.length > 22 ? `${r.label.slice(0, 21)}…` : r.label,
      revenue: r.revenue,
      cost: r.allocatedCost,
      profit: r.profit,
      marginPct: r.marginPct,
    }));

  return {
    columns: [
      { key: "label", label: "Trip" },
      { key: "startAt", label: "Start", type: "date" },
      { key: "vehicle", label: "Vehicle" },
      { key: "rentalType", label: "Type" },
      { key: "status", label: "Status" },
      { key: "revenue", label: "Revenue", type: "money" },
      { key: "allocatedCost", label: "Est. cost", type: "money" },
      { key: "profit", label: "Profit", type: "money" },
      { key: "marginPct", label: "Margin %", type: "number" },
      { key: "collectedPct", label: "Collected %", type: "number" },
    ],
    rows: rows.map((r) => ({
      tripId: r.tripId,
      label: r.label,
      startAt: r.startAt,
      vehicle: r.vehicle,
      rentalType: r.rentalType,
      status: r.status,
      revenue: r.revenue,
      allocatedCost: r.allocatedCost,
      profit: r.profit,
      marginPct: r.marginPct,
      collectedPct: r.collectedPct,
    })),
    totals: all.length
      ? {
          revenue: round2(all.reduce((s, r) => s + r.revenue, 0)),
          allocatedCost: round2(all.reduce((s, r) => s + r.allocatedCost, 0)),
          profit: round2(all.reduce((s, r) => s + r.profit, 0)),
        }
      : null,
    meta: { trips: all.length, window: `${from.toISOString().slice(0, 10)} → ${to.toISOString().slice(0, 10)}` },
    note: TRIP_PROFIT_NOTE,
    chart,
  };
});
