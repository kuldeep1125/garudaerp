import { db } from "@/lib/db";
import { handleRoute, parseRange } from "@/lib/api-helpers";
import { round2 } from "@/lib/money";
import { EPS, dayKey, loadAllLedgers } from "@/app/api/_lib/engine";
import { manpowerBlock, manpowerTrend, type TrendPoint } from "../../_lib/dashboard";

interface ByPropertyRow {
  propertyId: string;
  propertyName: string;
  billing: number;
  payout: number;
  margin: number;
  received: number;
  outstanding: number;
}

// GET /api/dashboard/manpower?range=... — manpower KPIs + 14-day trend + per-property breakdown.
export const GET = handleRoute(async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const { from, to } = parseRange(sp);

  const [block, trend, deps, pays, ledgers] = await Promise.all([
    manpowerBlock(from, to),
    manpowerTrend(),
    db.deployment.findMany({
      where: { date: { gte: from, lte: to }, status: { in: ["CONFIRMED", "COMPLETED", "PARTIAL"] } },
      select: { propertyId: true, property: { select: { name: true } }, billingAmount: true, payoutAmount: true },
    }),
    db.propertyPayment.groupBy({
      by: ["propertyId"],
      _sum: { amount: true },
      where: { date: { gte: from, lte: to } },
    }),
    loadAllLedgers(),
  ]);

  const byMap = new Map<string, ByPropertyRow>();
  for (const d of deps) {
    const row = byMap.get(d.propertyId) ?? {
      propertyId: d.propertyId,
      propertyName: d.property.name,
      billing: 0,
      payout: 0,
      margin: 0,
      received: 0,
      outstanding: 0,
    };
    row.billing = round2(row.billing + d.billingAmount);
    row.payout = round2(row.payout + d.payoutAmount);
    byMap.set(d.propertyId, row);
  }
  for (const p of pays) {
    const row = byMap.get(p.propertyId);
    if (row) row.received = round2(p._sum.amount ?? 0);
  }
  for (const row of byMap.values()) {
    row.margin = round2(row.billing - row.payout);
    row.outstanding = round2(Math.max(0, ledgers.map.get(row.propertyId)?.outstanding ?? 0));
  }
  const byProperty = [...byMap.values()].sort((a, b) => b.billing - a.billing);

  // Top owed property via the FIFO ledger (same walk as /api/payments/property/:id).
  let topOwedProperty: {
    propertyId: string;
    propertyName: string;
    outstanding: number;
    oldestUnpaidDate: string | null;
    unpaidCount: number;
  } | null = null;
  for (const p of ledgers.properties) {
    const led = ledgers.map.get(p.id);
    if (!led || led.outstanding <= EPS) continue;
    if (!topOwedProperty || led.outstanding > topOwedProperty.outstanding) {
      topOwedProperty = {
        propertyId: p.id,
        propertyName: p.name,
        outstanding: led.outstanding,
        oldestUnpaidDate: led.oldestUnpaidDate,
        unpaidCount: led.unpaidCount,
      };
    }
  }

  return {
    range: { from: dayKey(from), to: dayKey(to) },
    manpower: block,
    trend: trend.trend satisfies TrendPoint[],
    byProperty,
    topOwedProperty,
  };
});
