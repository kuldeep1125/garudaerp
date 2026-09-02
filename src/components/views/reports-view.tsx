"use client";

import { useMemo, useState } from "react";
import { api, downloadCSV, qs, toCSV } from "@/lib/api-client";
import { formatINR } from "@/lib/money";
import type { ViewProps } from "@/components/view-types";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { RangeSelector, type RangeKey } from "@/components/shared/filters";
import { MonthPicker, toMonth } from "@/components/shared/month-picker";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  BarChart3, Building2, CalendarCheck, CarFront, Crown, Download, Play, Receipt,
  ReceiptText, TrendingUp, Users, Wallet, type LucideIcon,
} from "lucide-react";
import {
  ErrorState, Field, Option, SelectInput, todayStr, useAsync,
} from "./_shared";

// ---------------------------------------------------------------------------
// Report catalog
// ---------------------------------------------------------------------------

type ReportConfig = "range" | "range-business" | "date" | "month";

interface ReportDef {
  type: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  config: ReportConfig;
}

const REPORTS: ReportDef[] = [
  { type: "employee-earnings", title: "Employee Earnings", subtitle: "Shifts, advances & net pay by employee", icon: Users, config: "range" },
  { type: "property-revenue", title: "Property Revenue", subtitle: "Billing vs collections by property", icon: Building2, config: "range" },
  { type: "collections", title: "Collections", subtitle: "Daily billed & received with outstanding", icon: Wallet, config: "range" },
  { type: "expenses", title: "Expenses", subtitle: "Expense entries by category & business", icon: Receipt, config: "range-business" },
  { type: "profitability", title: "Profitability", subtitle: "Billing, payout, expenses & net margin", icon: TrendingUp, config: "range-business" },
  { type: "vehicle-profitability", title: "Vehicle Profitability", subtitle: "Revenue, opex, EMI & net by vehicle", icon: CarFront, config: "range" },
  { type: "daily-operations", title: "Daily Operations", subtitle: "All deployments for a single day", icon: CalendarCheck, config: "date" },
  { type: "owner-expenses", title: "Owner Expenses", subtitle: "Spending by owner with withdrawals", icon: Crown, config: "range" },
  { type: "settlement-summary", title: "Settlement Summary", subtitle: "Month payroll summary per employee", icon: ReceiptText, config: "month" },
];

const BUSINESS_OPTIONS: Option[] = [
  { label: "All businesses", value: "" },
  { label: "Manpower", value: "MANPOWER" },
  { label: "Transport", value: "TRANSPORT" },
];

// ---------------------------------------------------------------------------
// Report response shape (per API contract)
// ---------------------------------------------------------------------------

interface ReportColumn {
  key: string;
  label: string;
  type?: string;
}

interface ReportResp {
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  totals?: Record<string, unknown> | null;
  meta?: unknown;
}

// ---------------------------------------------------------------------------
// Local helpers (not added to _shared.tsx by policy)
// ---------------------------------------------------------------------------

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function computeRange(range: RangeKey, customFrom: string, customTo: string): { from: string; to: string } {
  const now = new Date();
  const t = todayStr();
  switch (range) {
    case "today":
      return { from: t, to: t };
    case "yesterday":
      return { from: todayStr(-1), to: todayStr(-1) };
    case "week": {
      const dow = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
      return { from: ymd(monday), to: t };
    }
    case "lastweek": {
      const dow = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1) - 7);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return { from: ymd(monday), to: ymd(sunday) };
    }
    case "month":
      return { from: `${t.slice(0, 7)}-01`, to: t };
    case "lastmonth": {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: ymd(first), to: ymd(last) };
    }
    case "custom": {
      let from = customFrom || t;
      let to = customTo || customFrom || t;
      if (from > to) [from, to] = [to, from];
      return { from, to };
    }
  }
}

function fmtCell(v: unknown, type?: string): React.ReactNode {
  if (v === null || v === undefined || v === "") return <span className="text-muted-foreground">—</span>;
  if (type === "money") return formatINR(Number(v));
  return String(v);
}

function fmtCellText(v: unknown, type?: string): string {
  if (v === null || v === undefined || v === "") return "";
  if (type === "money") return formatINR(Number(v));
  return String(v);
}

function labelFor(key: string, cols: ReportColumn[]): string {
  const found = cols.find((c) => c.key === key);
  if (found) return found.label;
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
}

function fmtTotal(v: unknown, cols: ReportColumn[], key: string): string {
  const t = cols.find((c) => c.key === key)?.type;
  if (t === "money") return formatINR(Number(v));
  if (typeof v === "number") return v.toLocaleString("en-IN");
  return String(v ?? "—");
}

function metaText(meta: unknown): string | null {
  if (meta === null || meta === undefined) return null;
  if (typeof meta === "string") return meta;
  if (typeof meta === "object") {
    try {
      const parts = Object.entries(meta as Record<string, unknown>).map(([k, v]) => `${k}: ${String(v)}`);
      return parts.length > 0 ? parts.join(" · ") : null;
    } catch {
      return null;
    }
  }
  return String(meta);
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

export default function ReportsView(_props: ViewProps) {
  const [type, setType] = useState<string | null>(null);
  const [range, setRange] = useState<RangeKey>("month");
  const [custom, setCustom] = useState(false);
  const [customFrom, setCustomFrom] = useState(todayStr(-29));
  const [customTo, setCustomTo] = useState(todayStr());
  const [business, setBusiness] = useState("");
  const [date, setDate] = useState(todayStr());
  const [month, setMonth] = useState(toMonth());

  const def = REPORTS.find((r) => r.type === type) ?? null;

  const params = useMemo<Record<string, string>>(() => {
    if (!def) return {};
    if (def.config === "date") return { date };
    if (def.config === "month") return { month };
    const { from, to } = computeRange(custom ? "custom" : range, customFrom, customTo);
    const p: Record<string, string> = { from, to };
    if (def.config === "range-business" && business) p.business = business;
    return p;
  }, [def, range, custom, customFrom, customTo, business, date, month]);

  const { data, loading, error, reload } = useAsync<ReportResp | null>(
    () => (def ? api.get<ReportResp>(`/api/reports/${def.type}${qs(params)}`) : Promise.resolve(null)),
    [def, params]
  );

  const rows = useMemo(
    () => (data?.rows ?? []).map((r, i) => ({ __idx: i, ...r })),
    [data]
  );

  const columns = useMemo<Column<Record<string, unknown>>[]>(
    () =>
      (data?.columns ?? []).map((c, idx) => ({
        key: c.key,
        label: c.label,
        primary: idx === 0,
        className: c.type === "money" || c.type === "number" ? "text-right" : undefined,
        render: (row: Record<string, unknown>) => fmtCell(row[c.key], c.type),
        value: (row: Record<string, unknown>) => fmtCellText(row[c.key], c.type),
      })),
    [data]
  );

  const caption = metaText(data?.meta);

  const totalsNode =
    data?.totals && Object.keys(data.totals).length > 0 ? (
      <div className="mt-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Total</span>
          {Object.entries(data.totals).map(([k, v]) => (
            <span key={k} className="text-xs text-muted-foreground">
              {labelFor(k, data.columns)}:{" "}
              <span className="font-semibold tabular-nums text-foreground">{fmtTotal(v, data.columns, k)}</span>
            </span>
          ))}
        </div>
      </div>
    ) : null;

  const exportCSV = () => {
    if (!data || !def || data.rows.length === 0) return;
    const csv = toCSV(data.rows, data.columns.map((c) => ({ key: c.key, label: c.label })));
    downloadCSV(`bizhub-${def.type}-${todayStr()}.csv`, csv);
    toast.success("Report exported as CSV");
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Reports" subtitle="Run, review and export business reports" icon={BarChart3} />

      {/* Report selector — 2 cols mobile, 3 cols tablet+ */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3" aria-label="Available reports">
        {REPORTS.map((r) => {
          const active = r.type === type;
          return (
            <button
              key={r.type}
              type="button"
              aria-pressed={active}
              onClick={() => setType(r.type)}
              className={cn(
                "flex min-h-10 flex-col items-start gap-1.5 rounded-xl border bg-card p-3 text-left transition-all",
                "hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active && "border-primary bg-primary/5 ring-1 ring-primary"
              )}
            >
              <span
                className={cn(
                  "rounded-lg p-1.5",
                  active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                )}
                aria-hidden
              >
                <r.icon className="h-4 w-4" />
              </span>
              <span className="text-[13px] font-semibold leading-tight">{r.title}</span>
              <span className="line-clamp-2 text-[10px] leading-snug text-muted-foreground">{r.subtitle}</span>
            </button>
          );
        })}
      </div>

      {!def && (
        <EmptyState
          icon={BarChart3}
          title="Select a report"
          description="Pick a report above, adjust the period or filters, then run it. Results can be exported to CSV."
        />
      )}

      {def && (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          {/* Config panel — sidebar on desktop, stacked on mobile */}
          <Card className="lg:w-72 lg:shrink-0">
            <CardContent className="space-y-3 p-4">
              <div>
                <p className="flex items-center gap-1.5 text-sm font-semibold">
                  <def.icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                  <span className="truncate">{def.title}</span>
                </p>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{def.subtitle}</p>
              </div>

              {def.config === "date" && (
                <Field label="Date">
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-10" />
                </Field>
              )}

              {def.config === "month" && (
                <Field label="Month">
                  <MonthPicker month={month} onChange={setMonth} />
                </Field>
              )}

              {(def.config === "range" || def.config === "range-business") && (
                <>
                  <Field label="Period">
                    <RangeSelector
                      value={custom ? ("" as RangeKey) : range}
                      onChange={(v) => {
                        setCustom(false);
                        setRange(v);
                      }}
                    />
                  </Field>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={custom ? "default" : "outline"}
                      className="h-8 rounded-full px-3 text-xs"
                      aria-pressed={custom}
                      onClick={() => setCustom(true)}
                    >
                      Custom
                    </Button>
                    {custom && (
                      <span className="text-[11px] text-muted-foreground">Pick exact dates below</span>
                    )}
                  </div>
                  {custom && (
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="From">
                        <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-10" />
                      </Field>
                      <Field label="To">
                        <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-10" />
                      </Field>
                    </div>
                  )}
                </>
              )}

              {def.config === "range-business" && (
                <Field label="Business">
                  <SelectInput value={business} onChange={setBusiness} options={BUSINESS_OPTIONS} placeholder="All businesses" />
                </Field>
              )}

              <div className="flex gap-2 pt-1">
                <Button className="min-h-10 flex-1 gap-1.5" onClick={() => void reload()} disabled={loading}>
                  <Play className="h-4 w-4" aria-hidden />
                  {loading ? "Running…" : "Run Report"}
                </Button>
                <Button
                  variant="outline"
                  className="min-h-10 flex-1 gap-1.5"
                  onClick={exportCSV}
                  disabled={loading || !data || data.rows.length === 0}
                >
                  <Download className="h-4 w-4" aria-hidden />
                  Export CSV
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Results */}
          <div className="min-w-0 flex-1 space-y-3">
            {error ? (
              <ErrorState message={error} onRetry={reload} />
            ) : (
              <>
                {caption && (
                  <p className="text-[11px] text-muted-foreground" aria-live="polite">
                    {caption}
                  </p>
                )}
                <Card>
                  <CardContent className="p-3 sm:p-4">
                    <DataTable
                      columns={columns}
                      rows={rows}
                      rowKey={(r) => String(r.__idx)}
                      loading={loading}
                      emptyIcon={BarChart3}
                      emptyTitle="No data for this period"
                      emptyDescription="Try widening the date range or changing filters, then run the report again."
                      footer={totalsNode}
                      className="max-h-[70vh] overflow-y-auto"
                    />
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
