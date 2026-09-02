import { handleRoute } from "@/lib/api-helpers";
import { round2 } from "@/lib/money";
import { dayKey, loadAllLedgers, parseYmd, reportRange } from "@/app/api/_lib/engine";

// GET /api/reports/collections?from=&to=
// Per property-day FIFO ledger rows limited to the requested range.
export const GET = handleRoute(async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const { from, to } = reportRange(sp);
  const fromMs = from.getTime();
  const toMs = to.getTime();

  const { properties, map } = await loadAllLedgers();
  const rows: {
    date: string;
    propertyName: string;
    propertyId: string;
    billed: number;
    received: number;
    outstanding: number;
    pct: number;
  }[] = [];
  for (const p of properties) {
    const led = map.get(p.id);
    if (!led) continue;
    for (const day of led.days) {
      const t = parseYmd(day.date).getTime();
      if (t < fromMs || t > toMs) continue;
      rows.push({
        date: day.date,
        propertyName: p.name,
        propertyId: p.id,
        billed: day.billed,
        received: day.paid,
        outstanding: day.outstanding,
        pct: day.billed > 0 ? Math.round((day.paid / day.billed) * 100) : 0,
      });
    }
  }
  rows.sort((a, b) => b.date.localeCompare(a.date) || a.propertyName.localeCompare(b.propertyName));

  const totals = {
    billed: round2(rows.reduce((s, r) => s + r.billed, 0)),
    received: round2(rows.reduce((s, r) => s + r.received, 0)),
    outstanding: round2(rows.reduce((s, r) => s + (r.billed - r.received), 0)),
  };

  return {
    columns: [
      { key: "date", label: "Date", type: "date" },
      { key: "propertyName", label: "Property", type: "string" },
      { key: "billed", label: "Billed", type: "currency" },
      { key: "received", label: "Received", type: "currency" },
      { key: "outstanding", label: "Outstanding", type: "currency" },
      { key: "pct", label: "Collection %", type: "number" },
    ],
    rows,
    totals,
    meta: { from: dayKey(from), to: dayKey(to) },
  };
});
