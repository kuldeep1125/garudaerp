import { db } from "@/lib/db";
import { handleRoute, HttpError, readBody, requireFields } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { formatINR } from "@/lib/money";
import {
  MONTH_RE, MONTH_METRICS_NOTE, MonthMetrics, buildInsights, currentMonth, metricsFor, pctChange, shiftMonth,
} from "../../_lib/monthly-metrics";

// Owner monthly summary email — MOCK delivery (email/WhatsApp delivery is Phase 2 per SRS).
//   GET  /api/owners/monthly-email?ownerId=…&month=YYYY-MM
//        → composed email preview (subject + bodyText + structured rows)
//   POST /api/owners/monthly-email { ownerId, month }
//        → marks the mock email as sent and writes an audit trail entry.
// The numbers come from the SAME shared monthly-metrics engine as the
// dashboard's "Monthly business summary" card, so both always agree.

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

export const GET = handleRoute(async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const rawMonth = sp.get("month") ?? "";
  const month = MONTH_RE.test(rawMonth) ? rawMonth : currentMonth();
  const prevMonth = shiftMonth(month, -1);

  const ownerId = sp.get("ownerId") ?? "";
  if (!ownerId) throw new HttpError(400, "ownerId is required");
  const owner = await db.owner.findUnique({
    where: { id: ownerId },
    select: { id: true, name: true, username: true, mobile: true, isActive: true },
  });
  if (!owner) throw new HttpError(404, "Owner not found");

  const [cur, prev] = await Promise.all([metricsFor(month), metricsFor(prevMonth)]);
  const insights = buildInsights(cur, prev, monthLabel(prevMonth));

  const rows = ([
    { key: "manpowerBilling", label: "Manpower billing", goodUp: true },
    { key: "collections", label: "Collections received", goodUp: true },
    { key: "transportRevenue", label: "Transport revenue", goodUp: true },
    { key: "expenses", label: "Total expenses", goodUp: false },
    { key: "net", label: "Net result", goodUp: true },
  ] as const).map((r) => {
    const value = r.key === "expenses"
      ? cur.manpowerOtherExpenses + cur.transportOpex + cur.transportEmi
      : cur[r.key as keyof MonthMetrics] as number;
    const previous = r.key === "expenses"
      ? prev.manpowerOtherExpenses + prev.transportOpex + prev.transportEmi
      : prev[r.key as keyof MonthMetrics] as number;
    return {
      key: r.key,
      label: r.label,
      value: Math.round(value),
      previous: Math.round(previous),
      pct: pctChange(value, previous),
      goodUp: r.goodUp,
    };
  });

  const deltaText = (r: (typeof rows)[number]): string => {
    if (r.pct === null) return "new this month";
    if (r.pct === 0) return "unchanged";
    const dir = r.pct >= 0 ? "up" : "down";
    const good = r.pct >= 0 === r.goodUp;
    return `${dir} ${Math.abs(r.pct)}% ${good ? "✓" : "⚠"}`;
  };

  const subject = `BizHub monthly summary — ${monthLabel(month)}`;
  const bodyText = [
    `Hi ${owner.name},`,
    ``,
    `Here is your BizHub business summary for ${monthLabel(month)} (compared with ${monthLabel(prevMonth)}).`,
    ``,
    `KEY NUMBERS`,
    ...rows.map((r) => `• ${r.label}: ${formatINR(r.value)} (was ${formatINR(r.previous)} — ${deltaText(r)})`),
    ``,
    `ACTIVITY`,
    `• ${cur.deployments} deployment${cur.deployments === 1 ? "" : "s"} · ${cur.trips} trip${cur.trips === 1 ? "" : "s"} · advances ${formatINR(cur.advances)} · EMI ${formatINR(cur.transportEmi)}`,
    ``,
    ...(insights.length ? [`INSIGHTS`, ...insights.map((i) => `• ${i}`), ``] : []),
    `${MONTH_METRICS_NOTE}`,
    ``,
    `— BizHub · automated preview (email delivery ships in Phase 2)`,
  ].join("\n");

  return {
    owner,
    month,
    prevMonth,
    monthLabel: monthLabel(month),
    prevMonthLabel: monthLabel(prevMonth),
    subject,
    rows,
    activity: {
      deployments: cur.deployments,
      trips: cur.trips,
      advances: Math.round(cur.advances),
      emi: Math.round(cur.transportEmi),
    },
    insights,
    note: MONTH_METRICS_NOTE,
    bodyText,
    disclaimer: "Mock preview — actual email dispatch is planned for Phase 2. Sending records an audit entry only.",
  };
});

export const POST = handleRoute(async ({ owner: actor, req }) => {
  const body = await readBody<{ ownerId?: string; month?: string }>(req);
  requireFields(body as Record<string, unknown>, ["ownerId", "month"]);
  if (!MONTH_RE.test(body.month!)) throw new HttpError(400, "Invalid month format, expected YYYY-MM");

  const target = await db.owner.findUnique({
    where: { id: body.ownerId! },
    select: { id: true, name: true, username: true },
  });
  if (!target) throw new HttpError(404, "Owner not found");

  await logAudit({
    owner: actor,
    action: "GENERATE",
    module: "Owners",
    recordId: target.id,
    recordLabel: `Monthly summary email → ${target.name} (${body.month}) — mock send`,
  });

  return {
    ok: true,
    message: `Monthly summary for ${target.name} logged as sent (mock).`,
    deliveredTo: target.name,
  };
});
