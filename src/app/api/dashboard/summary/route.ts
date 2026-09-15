import { db } from "@/lib/db";
import { handleRoute, parseRange } from "@/lib/api-helpers";
import { round2 } from "@/lib/money";
import { dayKey } from "@/app/api/_lib/engine";
import { manpowerBlock, transportBlock, collectionsBlock, attentionList } from "../../_lib/dashboard";

// GET /api/dashboard/summary?range=today|yesterday|week|lastweek|month|lastmonth|custom&from=&to=
export const GET = handleRoute(async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const { from, to } = parseRange(sp);

  const [manpower, transport, collections, attention, ownerCount] = await Promise.all([
    manpowerBlock(from, to),
    transportBlock(from, to),
    collectionsBlock(),
    attentionList(6),
    db.owner.count(),
  ]);

  const revenue = round2(manpower.expectedBilling + transport.revenue);
  const expenses = round2(manpower.expenses + transport.expenses);
  // CANONICAL NET RESULT — identical definition to reports/profitability and
  // monthly-metrics: revenue + excess employee rent − net employee payout − operating
  // expenses. Because manpower.payout is net of accommodation rent (gross payout − rentIncome),
  // revenue + rentIncome − grossPayout − expenses === revenue + excessRent − netPayout − expenses.
  const excessRent = Math.max(0, round2(manpower.rentIncome - manpower.grossPayout)); // [FIXED]
  const net = round2(revenue + excessRent - manpower.payout - expenses); // [FIXED]
  return {
    range: { from: dayKey(from), to: dayKey(to) },
    manpower,
    transport,
    combined: {
      revenue,
      employeePayout: manpower.payout,
      rentIncome: manpower.rentIncome,
      expenses,
      net,
      manpowerMargin: manpower.grossMargin,
      transportNet: round2(transport.revenue - transport.expenses),
    },
    collections,
    attention,
  };
});
