import { handleRoute } from "@/lib/api-helpers";
import {
  MONTH_RE, MONTH_METRICS_NOTE, buildInsights, currentMonth, metricsFor, shiftMonth, shortMonthLabel,
} from "@/app/api/_lib/monthly-metrics";

// GET /api/dashboard/monthly-summary?month=YYYY-MM
// Owner's monthly business summary: one metrics block for the selected month
// and one for the previous month, across BOTH businesses, so the UI can show
// month-over-month deltas. Money semantics are documented in `note` and kept
// in sync with /api/owners/monthly-email via the shared monthly-metrics lib.

export const GET = handleRoute(async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const raw = sp.get("month") ?? "";
  const current = MONTH_RE.test(raw) ? raw : currentMonth();
  const previous = shiftMonth(current, -1);

  const [cur, prev] = await Promise.all([metricsFor(current), metricsFor(previous)]);
  const insights = buildInsights(cur, prev, shortMonthLabel(previous));

  return {
    month: current,
    prevMonth: previous,
    current: cur,
    previous: prev,
    insights,
    note: MONTH_METRICS_NOTE,
  };
});
