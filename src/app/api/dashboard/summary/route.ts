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
  // monthly-metrics: revenue − employee payout − operating expenses. Employee
  // payout is a real cost and MUST be deducted here too, otherwise this card
  // disagrees with the Reports page (the exact mismatch class that is
  // non-negotiable for this app).
  const net = round2(revenue - manpower.payout - expenses);
  return {
    range: { from: dayKey(from), to: dayKey(to) },
    manpower,
    transport,
    combined: {
      revenue,
      employeePayout: manpower.payout,
      expenses,
      net,
      manpowerMargin: manpower.grossMargin,
      transportNet: round2(transport.revenue - transport.expenses),
    },
    collections,
    attention,
  };
});
