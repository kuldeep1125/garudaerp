"use client";

import { useEffect, useMemo, useState } from "react";
import { api, downloadCSV, qs, toCSV } from "@/lib/api-client";
import { formatINR } from "@/lib/money";
import { buildPayslipHtml } from "@/lib/payslip";
import type { ViewProps } from "@/components/view-types";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { RangeSelector, type RangeKey } from "@/components/shared/filters";
import { MonthPicker, toMonth } from "@/components/shared/month-picker";
import { EmptyState } from "@/components/shared/empty-state";
import { PrintLetterhead } from "@/components/shared/print-letterhead";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  BarChart3, Building2, CalendarCheck, CarFront, Crown, Download, HardHat, Info, MapPin, Play, Printer,
  Receipt, ReceiptText, Route, TrendingUp, Users, Wallet, type LucideIcon,
} from "lucide-react";
import {
  BarsCompare, CHART_COLORS, ErrorState, Field, Option, SelectInput, todayStr, useAsync,
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
  { type: "employee-earnings", title: "Employee Earnings", subtitle: "Shifts, salary, advances & net pay by employee", icon: Users, config: "range" },
  { type: "property-revenue", title: "Property Revenue", subtitle: "Billing vs collections by property", icon: Building2, config: "range" },
  { type: "collections", title: "Collections", subtitle: "Daily billed & received with outstanding", icon: Wallet, config: "range" },
  { type: "expenses", title: "Expenses", subtitle: "Expense entries by category & business", icon: Receipt, config: "range-business" },
  { type: "profitability", title: "Profitability", subtitle: "Billing, employee cost, rent & net margin", icon: TrendingUp, config: "range-business" },
  { type: "contractor-commissions", title: "Contractor Commissions", subtitle: "Commission per contractor & month", icon: HardHat, config: "range" },
  { type: "vehicle-profitability", title: "Vehicle Profitability", subtitle: "Revenue, opex, EMI & net by vehicle", icon: CarFront, config: "range" },
  { type: "trip-profit", title: "Trip Profitability", subtitle: "Per-trip revenue, estimated cost & margin", icon: Route, config: "range" },
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
  note?: string;
  chart?: { label: string; revenue: number; cost: number; profit: number; marginPct: number }[] | null;
  // Drill-down extras (employee-earnings with employeeId)
  employee?: { id: string; fullName: string; code: string; designation: string | null; status: string } | null;
  days?: { date: string; propertyName: string; shift: string; payoutRate: number; earnings: number }[];
  dayTotals?: { daysWorked: number; shifts: number; earnings: number };
  propertySummary?: { propertyName: string; shifts?: number; employees?: number; dayShifts: number; nightShifts: number; earnings?: number; billing?: number; payout?: number }[];
}

interface PickerItem { id: string; name?: string; fullName?: string; code?: string }

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
  if (type === "money" || type === "currency") return formatINR(Number(v));
  if (type === "date") return fmtDayText(String(v));
  return String(v);
}

function fmtDayText(v: string): string {
  const d = new Date(v.length === 10 ? `${v}T00:00:00` : v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function fmtCellText(v: unknown, type?: string): string {
  if (v === null || v === undefined || v === "") return "";
  if (type === "money" || type === "currency") return formatINR(Number(v));
  if (type === "date") return fmtDayText(String(v));
  return String(v);
}

function labelFor(key: string, cols: ReportColumn[]): string {
  const found = cols.find((c) => c.key === key);
  if (found) return found.label;
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
}

function fmtTotal(v: unknown, cols: ReportColumn[], key: string): string {
  const t = cols.find((c) => c.key === key)?.type;
  if (t === "money" || t === "currency") return formatINR(Number(v));
  if (typeof v === "number") return v.toLocaleString("en-IN");
  return String(v ?? "—");
}

/** Small shift badge — sun for DAY, moon for NIGHT, dual for FULL. */
function ShiftPill({ shift }: { shift: string }) {
  const s = shift.toUpperCase();
  const isNight = s === "NIGHT";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
        s === "FULL" ? "bg-primary text-primary-foreground" : isNight ? "bg-secondary text-secondary-foreground" : "bg-accent text-accent-foreground"
      )}
    >
      {s === "DAY" ? "DAY" : s === "NIGHT" ? "NIGHT" : "FULL (D+N)"}
    </span>
  );
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
  const [employeeId, setEmployeeId] = useState("");
  const [propertyId, setPropertyId] = useState("");

  // Business name for the print letterhead / payslip header (silent — cosmetic).
  const [businessName, setBusinessName] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    api.get<{ business: { name?: string | null } }>("/api/settings")
      .then((s) => { if (!cancelled) setBusinessName(s.business?.name ?? null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const def = REPORTS.find((r) => r.type === type) ?? null;

  // Picker options — loaded only for the report that needs them
  const employees = useAsync<{ items: PickerItem[] }>(
    () => (def?.type === "employee-earnings" ? api.get("/api/employees?pageSize=200") : Promise.resolve({ items: [] })),
    [def?.type]
  );
  const properties = useAsync<{ items: PickerItem[] }>(
    () => (def?.type === "daily-operations" ? api.get("/api/properties?pageSize=200") : Promise.resolve({ items: [] })),
    [def?.type]
  );

  const params = useMemo<Record<string, string>>(() => {
    if (!def) return {};
    if (def.config === "date") return { date, ...(propertyId ? { propertyId } : {}) };
    if (def.config === "month") return { month };
    const { from, to } = computeRange(custom ? "custom" : range, customFrom, customTo);
    const p: Record<string, string> = { from, to };
    if (def.config === "range-business" && business) p.business = business;
    if (def.type === "employee-earnings" && employeeId) p.employeeId = employeeId;
    return p;
  }, [def, range, custom, customFrom, customTo, business, date, month, employeeId, propertyId]);

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
        className: c.type === "money" || c.type === "currency" || c.type === "number" ? "text-right" : undefined,
        render: (row: Record<string, unknown>) => fmtCell(row[c.key], c.type),
        value: (row: Record<string, unknown>) => fmtCellText(row[c.key], c.type),
      })),
    [data]
  );

  // Day-by-day sheet columns for the employee drill-down card
  const dayColumns = useMemo<Column<Record<string, unknown>>[]>(
    () => [
      { key: "date", label: "Date", primary: true, render: (r) => fmtDayText(String(r.date)), value: (r) => String(r.date) },
      { key: "propertyName", label: "Property", render: (r) => <span className="flex items-center gap-1"><MapPin className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />{String(r.propertyName)}</span>, value: (r) => String(r.propertyName) },
      { key: "shift", label: "Shift", render: (r) => <ShiftPill shift={String(r.shift)} />, value: (r) => String(r.shift) },
      { key: "payoutRate", label: "Rate", hideOnMobile: true, className: "text-right", render: (r) => formatINR(Number(r.payoutRate)), value: (r) => String(r.payoutRate) },
      { key: "earnings", label: "Earned", className: "text-right", render: (r) => <span className="font-semibold tabular-nums">{formatINR(Number(r.earnings))}</span>, value: (r) => String(r.earnings) },
    ],
    []
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

  // Human-readable period for the print header.
  const periodLabel = useMemo(() => {
    if (!def) return "";
    if (def.config === "date") return date;
    if (def.config === "month") return month;
    const { from, to } = computeRange(custom ? "custom" : range, customFrom, customTo);
    return from === to ? from : `${from} → ${to}`;
  }, [def, date, month, custom, range, customFrom, customTo]);

  // Standalone A4 payslip — opens a new window with the day-by-day sheet and
  // prints it (Chromium: document.write + window.print on load).
  const downloadPayslip = () => {
    if (!data?.employee || !data.days) return;
    const empRow = data.rows.find((r) => String(r.employeeId) === employeeId) as
      | { advances?: number; netPayable?: number }
      | undefined;
    const earnings = data.dayTotals?.earnings
      ?? data.days.reduce((s, d) => s + Number(d.earnings ?? 0), 0);
    const html = buildPayslipHtml({
      businessName,
      employee: {
        fullName: data.employee.fullName,
        code: data.employee.code,
        designation: data.employee.designation,
      },
      periodLabel,
      days: data.days,
      dayTotals: data.dayTotals ?? {
        daysWorked: new Set(data.days.map((d) => d.date)).size,
        shifts: data.days.length,
        earnings,
      },
      advances: Number(empRow?.advances ?? 0),
      netPayable: Number(empRow?.netPayable ?? earnings),
    });
    const w = window.open("", "_blank", "width=920,height=780");
    if (!w) {
      toast.error("Popup blocked — allow popups for this site to download the payslip.");
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
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
              onClick={() => {
                setType(r.type);
                setEmployeeId("");
                setPropertyId("");
              }}
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

              {def.type === "employee-earnings" && (
                <Field label="Employee detail (optional)">
                  <SelectInput
                    value={employeeId}
                    onChange={setEmployeeId}
                    options={[
                      { label: "All employees", value: "" },
                      ...employees.data?.items.map((e) => ({
                        label: `${e.fullName}${e.code ? ` (${e.code})` : ""}`,
                        value: e.id,
                      })) ?? [],
                    ]}
                    placeholder="All employees"
                  />
                  <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
                    Pick one employee to see every day: which property, which shift, how much earned.
                  </p>
                </Field>
              )}

              {def.type === "daily-operations" && (
                <Field label="Property detail (optional)">
                  <SelectInput
                    value={propertyId}
                    onChange={setPropertyId}
                    options={[
                      { label: "All properties", value: "" },
                      ...properties.data?.items.map((p) => ({ label: p.name ?? p.id, value: p.id })) ?? [],
                    ]}
                    placeholder="All properties"
                  />
                  <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
                    Pick one property to focus the day sheet on it.
                  </p>
                </Field>
              )}

              <div className="grid grid-cols-2 gap-2 pt-1">
                <Button className="min-h-10 gap-1.5" onClick={() => void reload()} disabled={loading}>
                  <Play className="h-4 w-4" aria-hidden />
                  {loading ? "Running…" : "Run"}
                </Button>
                <Button
                  variant="outline"
                  className="min-h-10 gap-1.5"
                  onClick={exportCSV}
                  disabled={loading || !data || data.rows.length === 0}
                >
                  <Download className="h-4 w-4" aria-hidden />
                  CSV
                </Button>
                <Button
                  variant="outline"
                  className="col-span-2 min-h-10 gap-1.5"
                  onClick={() => window.print()}
                  disabled={loading || !data || data.rows.length === 0}
                >
                  <Printer className="h-4 w-4" aria-hidden />
                  Print / Save PDF
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Results — printed via the .print-area block (header + table only) */}
          <div className="print-area min-w-0 flex-1 space-y-3">
            {/* Print-only letterhead + report header (hidden on screen) */}
            <PrintLetterhead
              businessName={businessName}
              title={`${def.title} — BizHub`}
              meta={`Period: ${periodLabel}`}
              className="mb-2"
            />
            {error ? (
              <ErrorState message={error} onRetry={reload} />
            ) : (
              <>
                {caption && (
                  <p className="text-[11px] text-muted-foreground" aria-live="polite">
                    {caption}
                  </p>
                )}
                {data?.note && (
                  <div
                    className="flex items-start gap-2 rounded-lg border border-border/70 bg-muted/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground print:bg-transparent"
                    role="note"
                  >
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span>{data.note}</span>
                  </div>
                )}
                {/* Employee day-by-day drill-down — Employee Earnings report */}
                {def.type === "employee-earnings" && data?.employee && (
                  <Card className="overflow-hidden print:break-inside-avoid">
                    <div className="h-0.5 w-full bg-gradient-to-r from-emerald-500/70 via-amber-500/70 to-emerald-500/70" aria-hidden />
                    <CardHeader className="pb-0">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                          <Users className="h-4 w-4 text-primary" aria-hidden />
                          <span>{data.employee.fullName}</span>
                          {data.employee.code && (
                            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] tracking-tight text-muted-foreground">{data.employee.code}</span>
                          )}
                          {data.employee.designation && (
                            <span className="text-xs font-normal text-muted-foreground">· {data.employee.designation}</span>
                          )}
                        </CardTitle>
                        <Button
                          variant="outline"
                          size="sm"
                          className="no-print h-8 shrink-0 gap-1.5"
                          onClick={downloadPayslip}
                          aria-label="Download payslip (printable A4)"
                        >
                          <Printer className="h-3.5 w-3.5" aria-hidden />
                          Download payslip
                        </Button>
                      </div>
                      <CardDescription className="text-xs">
                        Day-by-day movement — where the employee worked, which shift, what they earned
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-2">
                      {data.dayTotals && (
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { label: "Days worked", value: String(data.dayTotals.daysWorked) },
                            { label: "Shifts", value: String(data.dayTotals.shifts) },
                            { label: "Earnings", value: formatINR(data.dayTotals.earnings) },
                          ].map((s) => (
                            <div key={s.label} className="rounded-lg border bg-muted/40 px-2.5 py-2 text-center">
                              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{s.label}</p>
                              <p className="mt-0.5 text-sm font-bold tabular-nums">{s.value}</p>
                            </div>
                          ))}
                        </div>
                      )}
                      <DataTable
                        columns={dayColumns}
                        rows={(data.days ?? []).map((d, i) => ({ __idx: i, ...d }))}
                        rowKey={(r) => String(r.__idx)}
                        emptyIcon={CalendarCheck}
                        emptyTitle="No shifts in this period"
                        emptyDescription="This employee has no confirmed deployments in the selected range."
                        className="max-h-72 overflow-y-auto"
                      />
                      {data.propertySummary && data.propertySummary.length > 0 && (
                        <div className="flex flex-wrap gap-1.5" aria-label="Per-property summary">
                          {data.propertySummary.map((p) => (
                            <span
                              key={p.propertyName}
                              className="inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2.5 py-1 text-[11px]"
                            >
                              <MapPin className="h-3 w-3 text-primary" aria-hidden />
                              <span className="font-medium">{p.propertyName}</span>
                              <span className="text-muted-foreground">
                                {p.shifts} shift{p.shifts === 1 ? "" : "s"} · {formatINR(p.earnings ?? 0)}
                              </span>
                            </span>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Property focus summary — Daily Operations report */}
                {def.type === "daily-operations" && propertyId && data?.totals && (
                  <Card className="overflow-hidden print:break-inside-avoid">
                    <div className="h-0.5 w-full bg-gradient-to-r from-teal-500/70 via-emerald-500/70 to-amber-500/70" aria-hidden />
                    <CardHeader className="pb-0">
                      <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                        <Building2 className="h-4 w-4 text-primary" aria-hidden />
                        Day sheet — {String((data.meta as Record<string, unknown>)?.property ?? "property")}
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Every employee who attended, their shift and the day's money at a glance
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-2">
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {[
                          { label: "Deployments", value: String(data.totals.deployments ?? 0) },
                          { label: "Employees", value: String(data.totals.employees ?? 0) },
                          { label: "Billing", value: formatINR(Number(data.totals.billing ?? 0)) },
                          { label: "Payout", value: formatINR(Number(data.totals.payout ?? 0)) },
                        ].map((s) => (
                          <div key={s.label} className="rounded-lg border bg-muted/40 px-2.5 py-2 text-center">
                            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{s.label}</p>
                            <p className="mt-0.5 text-sm font-bold tabular-nums">{s.value}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Trip-profit chart — only for the Trip Profitability report */}
                {def.type === "trip-profit" && data?.chart && data.chart.length > 0 && (
                  <Card className="overflow-hidden print:break-inside-avoid">
                    <div className="h-0.5 w-full bg-gradient-to-r from-emerald-500/70 via-teal-500/70 to-red-500/70" aria-hidden />
                    <CardHeader className="pb-0">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Route className="h-4 w-4 text-primary" aria-hidden />
                        Trip-wise profit — revenue vs estimated cost
                      </CardTitle>
                      <CardDescription className="text-xs">
                        The most profitable trips plus the biggest loss-makers in the period
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-2">
                      <BarsCompare
                        data={data.chart}
                        xKey="label"
                        height={260}
                        showValues
                        series={[
                          { key: "revenue", label: "Revenue", color: CHART_COLORS.emerald },
                          { key: "cost", label: "Est. cost", color: CHART_COLORS.red },
                          { key: "profit", label: "Profit", color: CHART_COLORS.teal },
                        ]}
                      />
                    </CardContent>
                  </Card>
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
