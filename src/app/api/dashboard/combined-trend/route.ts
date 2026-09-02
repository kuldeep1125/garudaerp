import { db } from "@/lib/db";
import { handleRoute } from "@/lib/api-helpers";
import { round2 } from "@/lib/money";
import { BILLABLE, dayKey } from "@/app/api/_lib/engine";
import { lastNDays } from "../../_lib/dashboard";

// GET /api/dashboard/combined-trend?days=14
// Combined daily series for the main dashboard: manpower billing, collections
// received, transport revenue and total expenses — all aligned on the same day axis.
export const GET = handleRoute(async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const days = Math.min(60, Math.max(7, Number(sp.get("days") ?? 14) || 14));
  const { from, to, keys } = lastNDays(days);

  const [deps, pays, trips, exps] = await Promise.all([
    db.deployment.findMany({
      where: { date: { gte: from, lte: to }, status: { in: [...BILLABLE] } },
      select: { date: true, billingAmount: true },
    }),
    db.propertyPayment.findMany({
      where: { date: { gte: from, lte: to } },
      select: { date: true, amount: true },
    }),
    db.trip.findMany({
      where: { startAt: { gte: from, lte: to }, status: { not: "CANCELLED" } },
      select: { startAt: true, paidAmount: true },
    }),
    db.expense.findMany({
      where: { date: { gte: from, lte: to } },
      select: { date: true, amount: true, business: true },
    }),
  ]);

  interface Row { billing: number; collections: number; transport: number; expenses: number }
  const rows = new Map<string, Row>();
  for (const k of keys) rows.set(k, { billing: 0, collections: 0, transport: 0, expenses: 0 });

  for (const d of deps) {
    const r = rows.get(dayKey(d.date));
    if (r) r.billing = round2(r.billing + d.billingAmount);
  }
  for (const p of pays) {
    const r = rows.get(dayKey(p.date));
    if (r) r.collections = round2(r.collections + p.amount);
  }
  for (const t of trips) {
    const r = rows.get(dayKey(t.startAt));
    if (r) r.transport = round2(r.transport + t.paidAmount);
  }
  for (const e of exps) {
    const r = rows.get(dayKey(e.date));
    if (r) r.expenses = round2(r.expenses + e.amount);
  }

  return {
    days,
    trend: keys.map((date) => ({ date, ...(rows.get(date) as Row) })),
  };
});
