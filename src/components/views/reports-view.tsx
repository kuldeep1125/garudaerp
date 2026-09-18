"use client";

import { useEffect, useMemo, useState } from "react";
import { api, downloadCSV, qs, toCSV } from "@/lib/api-client";
import { formatINR } from "@/lib/money";
import { buildPayslipHtml } from "@/lib/payslip";
import {
  buildContractorStatementHtml,
  buildPropertyStatementHtml,
  buildVehicleStatementHtml,
  buildBankLedgerHtml,
  buildExecutivePnlHtml,
  buildManpowerMasterHtml,
  buildTransportMasterHtml,
} from "@/lib/report-statements";
import type { ViewProps } from "@/components/view-types";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { RangeSelector, type RangeKey } from "@/components/shared/filters";
import { MonthPicker, toMonth } from "@/components/shared/month-picker";
import { EmptyState } from "@/components/shared/empty-state";
import { PrintLetterhead } from "@/components/shared/print-letterhead";
import { PeriodClosingDialog } from "@/components/shared/period-closing-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Archive, ArrowLeft, BarChart3, Briefcase, Building2, CalendarCheck, CarFront, CheckCircle2, ChevronRight, Crown, Download,
  FileText, HardHat, Info, Landmark, MapPin, Play, Printer, Receipt, ReceiptText, RefreshCw, Route, Sparkles, TrendingUp,
  Truck, Users, Wallet, X, type LucideIcon,
} from "lucide-react";
import {
  BarsCompare, CHART_COLORS, ErrorState, Field, Option, SelectInput, todayStr, useAsync,
} from "./_shared";

// ---------------------------------------------------------------------------
// Report catalog — Complete Enterprise ERP Suite
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
  { type: "profitability", title: "Executive P&L Statement", subtitle: "Multi-tier profit & loss with gross & net breakdown", icon: TrendingUp, config: "range-business" },
  { type: "bank-ledger", title: "Cash & Bank Book", subtitle: "Complete ledger of all liquid money in vs money out", icon: Landmark, config: "range-business" },
  { type: "manpower-statement", title: "Manpower Master Statement", subtitle: "Consolidated manpower operations & financials", icon: Briefcase, config: "range" },
  { type: "transport-statement", title: "Transport Master Statement", subtitle: "Consolidated fleet trip ledger, revenue & costs", icon: Truck, config: "range" },
  { type: "employee-earnings", title: "Employee Earnings", subtitle: "Shifts, salary, advances & net pay by employee", icon: Users, config: "range" },
  { type: "property-revenue", title: "Property Revenue", subtitle: "Billing vs collections by property", icon: Building2, config: "range" },
  { type: "collections", title: "Collections Ledger", subtitle: "Daily billed & received with outstanding", icon: Wallet, config: "range" },
  { type: "expenses", title: "Expenses Analysis", subtitle: "Expense entries by category & business", icon: Receipt, config: "range-business" },
  { type: "contractor-commissions", title: "Contractor Commissions", subtitle: "Commission per contractor & month", icon: HardHat, config: "range" },
  { type: "vehicle-profitability", title: "Vehicle Profitability", subtitle: "Revenue, opex, EMI & net by vehicle", icon: CarFront, config: "range" },
  { type: "trip-profit", title: "Trip Profitability", subtitle: "Per-trip revenue, estimated cost & margin", icon: Route, config: "range" },
  { type: "daily-operations", title: "Daily Operations Register", subtitle: "All deployments for a single day", icon: CalendarCheck, config: "date" },
  { type: "owner-expenses", title: "Owner Capital & Drawing", subtitle: "Spending by owner with withdrawals & deposits", icon: Crown, config: "range" },
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
  days?: {
    date: string;
    propertyName: string;
    shift: string;
    payoutRate?: number;
    earnings?: number;
    employeeCode?: string;
    employeeName?: string;
    units?: number;
    rate?: number;
    commission?: number;
  }[];
  dayTotals?: {
    daysWorked?: number;
    shifts?: number;
    earnings?: number;
    deployments?: number;
    units?: number;
    commission?: number;
    employees?: number;
  };
  propertySummary?: {
    propertyName: string;
    shifts?: number;
    employees?: number;
    dayShifts: number;
    nightShifts: number;
    earnings?: number;
    billing?: number;
    payout?: number;
  }[];

  // Treasury & Cash Book (bank-ledger)
  streams?: { category: string; inflow: number; outflow: number; count: number }[];

  // Executive P&L (profitability)
  incomeStatement?: {
    revenue: { manpowerBilling: number; transportBilling: number; rentIncome: number; totalRevenue: number };
    directCosts: { perShiftWages: number; salariedPayroll: number; overtime: number; contractorCommissions: number; totalLaborCost: number };
    grossProfit: number;
    grossMarginPct: number;
    operatingExpenses: { categories: Array<{ category: string; amount: number; entriesCount: number }>; totalOpex: number };
    netProfit: number;
    netMarginPct: number;
  };
  expenseBreakdown?: { category: string; amount: number; entriesCount: number }[];

  // Manpower & Transport Master statements
  summary?: Record<string, unknown>;
  contractors?: Array<{ contractor: string; shifts: number; headcount: number; commission: number }>;
  topEmployees?: Array<{ employeeId: string; employeeName: string; code: string; shifts: number; payout: number; properties: string }>;
  clients?: Array<{ clientId: string; clientName: string; tripsCount: number; totalBilled: number; totalPaid: number; outstanding: number }>;

  // Contractor drill-down & list
  contractor?: string;
  contractorNames?: string[];

  // Property drill-down & list
  property?: {
    id: string;
    name: string;
    code?: string | null;
    contactPerson?: string | null;
    phone?: string | null;
    address?: string | null;
    defaultBillingRate?: number | null;
  } | null;
  properties?: { id: string; name: string }[];
  deployments?: {
    date: string;
    shift: string;
    employeeCode?: string;
    employeeName: string;
    designation?: string | null;
    billingRate: number;
    billingAmount: number;
  }[];
  payments?: {
    id: string;
    date: string;
    amount: number;
    paymentMode?: string | null;
    referenceNote?: string | null;
  }[];
  propertySummaryData?: {
    propertyId: string;
    propertyName: string;
    shifts: number;
    employees: number;
    billing: number;
    received: number;
    outstanding: number;
    collectionPct: number;
  };

  // Vehicle drill-down & list
  vehicle?: {
    id: string;
    name: string;
    registrationNumber: string;
    make?: string | null;
    model?: string | null;
    year?: number | null;
    capacity?: number | null;
  } | null;
  vehicles?: { id: string; name: string; registrationNumber: string }[];
  trips?: {
    id: string;
    date: string;
    client: string;
    route: string;
    rentalType: string;
    fare: number;
    paidAmount: number;
    status: string;
  }[];
  expenses?: {
    id: string;
    date: string;
    categoryName: string;
    description: string;
    amount: number;
    kind: string;
  }[];
  emis?: {
    id: string;
    month: string;
    dueDate: string;
    paidAt?: string | null;
    amount: number;
    isPaid: boolean;
  }[];
  vehicleSummary?: {
    vehicleId: string;
    name: string;
    registrationNumber: string;
    revenue: number;
    operatingExpenses: number;
    emi: number;
    net: number;
    tripsCount: number;
    expensesCount: number;
  };
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
    case "till-date":
    case "all":
      return { from: "2020-01-01", to: t };
    case "custom": {
      let from = customFrom || t;
      let to = customTo || customFrom || t;
      if (from > to) [from, to] = [to, from];
      return { from, to };
    }
    default:
      return { from: `${t.slice(0, 7)}-01`, to: t };
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

export default function ReportsView({ navigate }: ViewProps) {
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
  const [contractor, setContractor] = useState("");
  const [vehicleId, setVehicleId] = useState("");

  // Business name for the print letterhead / statement header.
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
    () => (def?.type === "daily-operations" || def?.type === "property-revenue" ? api.get("/api/properties?pageSize=200") : Promise.resolve({ items: [] })),
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
    if (def.type === "contractor-commissions" && contractor) p.contractor = contractor;
    if (def.type === "property-revenue" && propertyId) p.propertyId = propertyId;
    if (def.type === "manpower-statement") {
      if (propertyId) p.propertyId = propertyId;
      if (contractor) p.contractor = contractor;
    }
    if (def.type === "transport-statement") {
      if (vehicleId) p.vehicleId = vehicleId;
    }
    return p;
  }, [def, range, custom, customFrom, customTo, business, date, month, employeeId, propertyId, contractor, vehicleId]);

  const resetFilters = () => {
    setRange("month");
    setCustom(false);
    setCustomFrom(todayStr(-29));
    setCustomTo(todayStr());
    setBusiness("");
    setDate(todayStr());
    setMonth(toMonth());
    setEmployeeId("");
    setPropertyId("");
    setContractor("");
    setVehicleId("");
    toast.info("Filters reset to default");
  };

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

  // Contractor breakdown columns
  const contractorDayColumns = useMemo<Column<Record<string, unknown>>[]>(
    () => [
      { key: "date", label: "Date", primary: true, render: (r) => fmtDayText(String(r.date)), value: (r) => String(r.date) },
      { key: "employeeName", label: "Employee", render: (r) => <span><strong>{String(r.employeeName)}</strong> {r.employeeCode ? <span className="text-muted-foreground text-xs">({String(r.employeeCode)})</span> : null}</span>, value: (r) => String(r.employeeName) },
      { key: "propertyName", label: "Property", render: (r) => <span className="flex items-center gap-1"><MapPin className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />{String(r.propertyName)}</span>, value: (r) => String(r.propertyName) },
      { key: "shift", label: "Shift", render: (r) => <ShiftPill shift={String(r.shift)} />, value: (r) => String(r.shift) },
      { key: "units", label: "Units", hideOnMobile: true, className: "text-right", render: (r) => String(r.units ?? 1), value: (r) => String(r.units) },
      { key: "rate", label: "Rate Cut", hideOnMobile: true, className: "text-right", render: (r) => formatINR(Number(r.rate)), value: (r) => String(r.rate) },
      { key: "commission", label: "Commission", className: "text-right", render: (r) => <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{formatINR(Number(r.commission))}</span>, value: (r) => String(r.commission) },
    ],
    []
  );

  // Property deployments columns
  const propertyDepColumns = useMemo<Column<Record<string, unknown>>[]>(
    () => [
      { key: "date", label: "Date", primary: true, render: (r) => fmtDayText(String(r.date)), value: (r) => String(r.date) },
      { key: "employeeName", label: "Employee", render: (r) => <span><strong>{String(r.employeeName)}</strong> {r.employeeCode ? <span className="text-muted-foreground text-xs">({String(r.employeeCode)})</span> : null}</span>, value: (r) => String(r.employeeName) },
      { key: "designation", label: "Role", hideOnMobile: true, render: (r) => String(r.designation ?? "Staff"), value: (r) => String(r.designation ?? "") },
      { key: "shift", label: "Shift", render: (r) => <ShiftPill shift={String(r.shift)} />, value: (r) => String(r.shift) },
      { key: "billingRate", label: "Rate", hideOnMobile: true, className: "text-right", render: (r) => formatINR(Number(r.billingRate)), value: (r) => String(r.billingRate) },
      { key: "billingAmount", label: "Billed", className: "text-right", render: (r) => <span className="font-semibold tabular-nums">{formatINR(Number(r.billingAmount))}</span>, value: (r) => String(r.billingAmount) },
    ],
    []
  );

  // Property payments columns
  const propertyPayColumns = useMemo<Column<Record<string, unknown>>[]>(
    () => [
      { key: "date", label: "Date", primary: true, render: (r) => fmtDayText(String(r.date)), value: (r) => String(r.date) },
      { key: "paymentMode", label: "Mode", render: (r) => <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium">{String(r.paymentMode ?? "Bank")}</span>, value: (r) => String(r.paymentMode ?? "") },
      { key: "referenceNote", label: "Reference / Notes", render: (r) => String(r.referenceNote || "Payment Received"), value: (r) => String(r.referenceNote ?? "") },
      { key: "amount", label: "Received", className: "text-right", render: (r) => <span className="font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{formatINR(Number(r.amount))}</span>, value: (r) => String(r.amount) },
    ],
    []
  );

  // Vehicle trips columns
  const vehicleTripColumns = useMemo<Column<Record<string, unknown>>[]>(
    () => [
      { key: "date", label: "Date", primary: true, render: (r) => fmtDayText(String(r.date)), value: (r) => String(r.date) },
      { key: "client", label: "Client", render: (r) => <strong>{String(r.client)}</strong>, value: (r) => String(r.client) },
      { key: "route", label: "Route", render: (r) => <span className="text-xs">{String(r.route)}</span>, value: (r) => String(r.route) },
      { key: "rentalType", label: "Type", hideOnMobile: true, render: (r) => <span className="rounded bg-muted px-2 py-0.5 text-xs">{String(r.rentalType)}</span>, value: (r) => String(r.rentalType) },
      { key: "fare", label: "Trip Fare", className: "text-right", render: (r) => <span className="tabular-nums">{formatINR(Number(r.fare))}</span>, value: (r) => String(r.fare) },
      { key: "paidAmount", label: "Collected", className: "text-right", render: (r) => <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{formatINR(Number(r.paidAmount))}</span>, value: (r) => String(r.paidAmount) },
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

  const exportContractorCSV = () => {
    if (!data?.days || data.days.length === 0) return;
    const csv = toCSV(data.days, [
      { key: "date", label: "Date" },
      { key: "employeeName", label: "Employee" },
      { key: "propertyName", label: "Property" },
      { key: "shift", label: "Shift" },
      { key: "units", label: "Units" },
      { key: "rate", label: "Rate Cut" },
      { key: "commission", label: "Commission" },
    ]);
    downloadCSV(`contractor-statement-${(data.contractor ?? "all").replace(/\s+/g, "_")}-${todayStr()}.csv`, csv);
    toast.success("Contractor statement exported as CSV");
  };

  const exportPropertyCSV = () => {
    if (!data?.deployments || data.deployments.length === 0) return;
    const csv = toCSV(data.deployments, [
      { key: "date", label: "Date" },
      { key: "employeeName", label: "Employee" },
      { key: "designation", label: "Role" },
      { key: "shift", label: "Shift" },
      { key: "billingRate", label: "Billing Rate" },
      { key: "billingAmount", label: "Billing Amount" },
    ]);
    downloadCSV(`client-statement-${(data.property?.name ?? "all").replace(/\s+/g, "_")}-${todayStr()}.csv`, csv);
    toast.success("Client statement exported as CSV");
  };

  const exportVehicleCSV = () => {
    if (!data?.trips || data.trips.length === 0) return;
    const csv = toCSV(data.trips, [
      { key: "date", label: "Date" },
      { key: "client", label: "Client" },
      { key: "route", label: "Route" },
      { key: "rentalType", label: "Type" },
      { key: "fare", label: "Trip Fare" },
      { key: "paidAmount", label: "Paid Amount" },
      { key: "status", label: "Status" },
    ]);
    downloadCSV(`vehicle-statement-${(data.vehicle?.name ?? "all").replace(/\s+/g, "_")}-${todayStr()}.csv`, csv);
    toast.success("Vehicle statement exported as CSV");
  };

  // Human-readable period for the print header.
  const periodLabel = useMemo(() => {
    if (!def) return "";
    if (def.config === "date") return date;
    if (def.config === "month") return month;
    const { from, to } = computeRange(custom ? "custom" : range, customFrom, customTo);
    return from === to ? from : `${from} → ${to}`;
  }, [def, date, month, custom, range, customFrom, customTo]);

  // Standalone A4 payslip
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
      days: data.days.map((d) => ({
        date: d.date,
        propertyName: d.propertyName,
        shift: d.shift,
        payoutRate: d.payoutRate ?? 0,
        earnings: d.earnings ?? 0,
      })),
      dayTotals: {
        daysWorked: data.dayTotals?.daysWorked ?? new Set(data.days.map((d) => d.date)).size,
        shifts: data.dayTotals?.shifts ?? data.days.length,
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

  // Standalone A4 Contractor Statement
  const downloadContractorStatement = () => {
    if (!data?.contractor || !data.days) return;
    const totals = data.dayTotals ?? {
      deployments: data.days.length,
      units: data.days.reduce((s, d) => s + (d.units ?? 1), 0),
      employees: new Set(data.days.map((d) => d.employeeName)).size,
      commission: data.days.reduce((s, d) => s + (d.commission ?? 0), 0),
    };
    const html = buildContractorStatementHtml({
      businessName,
      contractorName: data.contractor,
      periodLabel,
      totals: {
        deployments: totals.deployments ?? data.days.length,
        units: totals.units ?? data.days.length,
        employees: totals.employees ?? 1,
        commission: totals.commission ?? 0,
      },
      days: data.days.map((d) => ({
        date: d.date,
        employeeCode: d.employeeCode,
        employeeName: d.employeeName ?? "Staff",
        propertyName: d.propertyName,
        shift: d.shift,
        units: d.units ?? 1,
        rate: d.rate ?? 0,
        commission: d.commission ?? 0,
      })),
    });
    const w = window.open("", "_blank", "width=940,height=800");
    if (!w) {
      toast.error("Popup blocked — allow popups for this site to download the statement.");
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  // Standalone A4 Property Billing Statement
  const downloadPropertyStatement = () => {
    if (!data?.property || !data.deployments) return;
    const propRow = data.rows.find((r) => String(r.propertyId) === propertyId) as
      | { shifts?: number; employees?: number; billing?: number; received?: number; outstanding?: number; collectionPct?: number }
      | undefined;
    const billing = propRow?.billing ?? data.deployments.reduce((s, d) => s + d.billingAmount, 0);
    const received = propRow?.received ?? (data.payments ?? []).reduce((s, p) => s + p.amount, 0);
    const outstanding = propRow?.outstanding ?? Math.max(0, billing - received);
    const collectionPct = propRow?.collectionPct ?? (billing > 0 ? Math.round((received / billing) * 100) : 0);

    const html = buildPropertyStatementHtml({
      businessName,
      property: data.property,
      periodLabel,
      summary: {
        shifts: propRow?.shifts ?? data.deployments.length,
        employees: propRow?.employees ?? new Set(data.deployments.map((d) => d.employeeName)).size,
        billing,
        received,
        outstanding,
        collectionPct,
      },
      deployments: data.deployments,
      payments: data.payments ?? [],
    });
    const w = window.open("", "_blank", "width=940,height=800");
    if (!w) {
      toast.error("Popup blocked — allow popups for this site to download the statement.");
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  // Standalone A4 Vehicle Statement
  const downloadVehicleStatement = () => {
    if (!data?.vehicle || !data.trips) return;
    const vRow = data.rows.find((r) => String(r.vehicleId) === vehicleId) as
      | { revenue?: number; operatingExpenses?: number; emi?: number; net?: number }
      | undefined;
    const revenue = vRow?.revenue ?? data.trips.reduce((s, t) => s + (t.fare ?? 0), 0);
    const operatingExpenses = vRow?.operatingExpenses ?? (data.expenses ?? []).reduce((s, e) => s + e.amount, 0);
    const emi = vRow?.emi ?? (data.emis ?? []).reduce((s, m) => s + m.amount, 0);
    const net = vRow?.net ?? (revenue - operatingExpenses - emi);

    const html = buildVehicleStatementHtml({
      businessName,
      vehicle: data.vehicle,
      periodLabel,
      summary: {
        revenue,
        operatingExpenses,
        emi,
        net,
        tripsCount: data.trips.length,
        expensesCount: (data.expenses ?? []).length,
      },
      trips: data.trips,
      expenses: data.expenses ?? [],
      emis: data.emis ?? [],
    });
    const w = window.open("", "_blank", "width=940,height=800");
    if (!w) {
      toast.error("Popup blocked — allow popups for this site to download the statement.");
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  // Standalone A4 Bank & Cash Book Statement
  const downloadBankLedger = () => {
    if (!data) return;
    const html = buildBankLedgerHtml({
      businessName: businessName ?? "Garuda ERP Control Center",
      periodLabel,
      totals: {
        inflow: Number(data.totals?.inflow ?? 0),
        outflow: Number(data.totals?.outflow ?? 0),
        net: Number(data.totals?.net ?? 0),
        count: Number(data.totals?.count ?? data.rows.length),
      },
      rows: (data.rows as Record<string, unknown>[]).map((r) => ({
        date: String(r.date ?? ""),
        category: String(r.category ?? ""),
        entity: String(r.entity ?? ""),
        description: String(r.description ?? ""),
        mode: String(r.mode ?? ""),
        inflow: Number(r.inflow ?? 0),
        outflow: Number(r.outflow ?? 0),
        balance: Number(r.balance ?? 0),
      })),
      streams: data.streams,
    });
    const w = window.open("", "_blank", "width=940,height=800");
    if (!w) {
      toast.error("Popup blocked — allow popups for this site to download the statement.");
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  // Standalone A4 Executive Income Statement (P&L)
  const downloadExecutivePnl = () => {
    if (!data?.incomeStatement) return;
    const html = buildExecutivePnlHtml({
      businessName: businessName ?? "Garuda ERP",
      periodLabel,
      incomeStatement: data.incomeStatement,
    });
    const w = window.open("", "_blank", "width=940,height=800");
    if (!w) {
      toast.error("Popup blocked — allow popups for this site to download the statement.");
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  // Standalone A4 Manpower Master Statement
  const downloadManpowerMaster = () => {
    if (!data) return;
    const html = buildManpowerMasterHtml({
      businessName: businessName ?? "Garuda ERP",
      periodLabel,
      totals: {
        shifts: Number(data.totals?.shifts ?? 0),
        headcount: Number(data.totals?.headcount ?? 0),
        billing: Number(data.totals?.billing ?? 0),
        payout: Number(data.totals?.payout ?? 0),
        contractorCut: Number(data.totals?.contractorCut ?? 0),
        margin: Number(data.totals?.margin ?? 0),
        marginPct: Number(data.totals?.marginPct ?? 0),
      },
      rows: (data.rows as Record<string, unknown>[]).map((r) => ({
        propertyName: String(r.propertyName ?? ""),
        shifts: Number(r.shifts ?? 0),
        headcount: Number(r.headcount ?? 0),
        billing: Number(r.billing ?? 0),
        payout: Number(r.payout ?? 0),
        contractorCut: Number(r.contractorCut ?? 0),
        margin: Number(r.margin ?? 0),
        marginPct: Number(r.marginPct ?? 0),
      })),
      contractors: data.contractors,
    });
    const w = window.open("", "_blank", "width=940,height=800");
    if (!w) {
      toast.error("Popup blocked — allow popups for this site to download the statement.");
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  // Standalone A4 Transport Master Statement
  const downloadTransportMaster = () => {
    if (!data) return;
    const html = buildTransportMasterHtml({
      businessName: businessName ?? "Garuda ERP",
      periodLabel,
      totals: {
        tripsCount: Number(data.totals?.tripsCount ?? 0),
        revenue: Number(data.totals?.revenue ?? 0),
        collected: Number(data.totals?.collected ?? 0),
        pending: Number(data.totals?.pending ?? 0),
        opex: Number(data.totals?.opex ?? 0),
        emi: Number(data.totals?.emi ?? 0),
        net: Number(data.totals?.net ?? 0),
        marginPct: Number(data.totals?.marginPct ?? 0),
      },
      rows: (data.rows as Record<string, unknown>[]).map((r) => ({
        vehicleName: String(r.vehicleName ?? ""),
        registration: String(r.registration ?? ""),
        tripsCount: Number(r.tripsCount ?? 0),
        revenue: Number(r.revenue ?? 0),
        opex: Number(r.opex ?? 0),
        emi: Number(r.emi ?? 0),
        net: Number(r.net ?? 0),
        marginPct: Number(r.marginPct ?? 0),
      })),
    });
    const w = window.open("", "_blank", "width=940,height=800");
    if (!w) {
      toast.error("Popup blocked — allow popups for this site to download the statement.");
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader title="Reports" subtitle="Enterprise reporting, audit statements & period closure" icon={BarChart3} />
        <PeriodClosingDialog businessName={businessName} onPeriodClosed={() => void reload()} />
      </div>

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
                    Select an employee to view their detailed earnings statement & shift breakdown.
                  </p>
                </Field>
              )}

              {def.type === "contractor-commissions" && (
                <Field label="Contractor detail (optional)">
                  <SelectInput
                    value={contractor}
                    onChange={setContractor}
                    options={[
                      { label: "All contractors", value: "" },
                      ...((data?.contractorNames ?? []).map((c) => ({ label: c, value: c }))),
                    ]}
                    placeholder="All contractors"
                  />
                  <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
                    Select a contractor to view their official commission statement & itemized shifts.
                  </p>
                </Field>
              )}

              {def.type === "property-revenue" && (
                <Field label="Property detail (optional)">
                  <SelectInput
                    value={propertyId}
                    onChange={setPropertyId}
                    options={[
                      { label: "All properties", value: "" },
                      ...((data?.properties ?? properties.data?.items ?? []).map((p) => ({ label: p.name ?? p.id, value: p.id }))),
                    ]}
                    placeholder="All properties"
                  />
                  <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
                    Select a client property to view their full billing ledger statement & collections.
                  </p>
                </Field>
              )}

              {def.type === "vehicle-profitability" && (
                <Field label="Vehicle detail (optional)">
                  <SelectInput
                    value={vehicleId}
                    onChange={setVehicleId}
                    options={[
                      { label: "All vehicles", value: "" },
                      ...((data?.vehicles ?? []).map((v) => ({ label: `${v.name} (${v.registrationNumber})`, value: v.id }))),
                    ]}
                    placeholder="All vehicles"
                  />
                  <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
                    Select a vehicle to inspect trip earnings, fuel/service opex, EMI and net margin.
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
                <Button
                  variant="ghost"
                  className="col-span-2 min-h-9 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                  onClick={resetFilters}
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                  Reset / Clear Filters
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
                  <Card className="overflow-hidden border-primary/40 shadow-sm print:break-inside-avoid">
                    <div className="h-1 w-full bg-gradient-to-r from-emerald-500/70 via-amber-500/70 to-emerald-500/70" aria-hidden />
                    <CardHeader className="pb-2">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <CardTitle className="flex flex-wrap items-center gap-2 text-base font-bold">
                            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                              <Users className="h-4 w-4" aria-hidden />
                            </span>
                            <span>{data.employee.fullName}</span>
                            {data.employee.code && (
                              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] tracking-tight text-muted-foreground">{data.employee.code}</span>
                            )}
                            {data.employee.designation && (
                              <span className="text-xs font-normal text-muted-foreground">· {data.employee.designation}</span>
                            )}
                            <span className="rounded-full bg-emerald-100 dark:bg-emerald-950/80 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                              Employee Payslip
                            </span>
                          </CardTitle>
                          <CardDescription className="mt-1 text-xs text-muted-foreground">
                            Day-by-day movement — where worked, shift type and earnings · Period: {periodLabel}
                          </CardDescription>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="no-print h-8 gap-1.5 border-primary/30 hover:bg-primary/5"
                            onClick={downloadPayslip}
                            aria-label="Download payslip (printable A4)"
                          >
                            <Printer className="h-3.5 w-3.5 text-primary" aria-hidden />
                            Download Payslip
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="no-print h-8 gap-1 text-muted-foreground hover:text-foreground"
                            onClick={() => setEmployeeId("")}
                            aria-label="Close statement and view all employees"
                          >
                            <X className="h-3.5 w-3.5" aria-hidden />
                            Show All
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-1">
                      {data.dayTotals && (
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { label: "Days worked", value: String(data.dayTotals.daysWorked) },
                            { label: "Shifts", value: String(data.dayTotals.shifts) },
                            { label: "Earnings", value: formatINR(data.dayTotals.earnings), highlight: true },
                          ].map((s) => (
                            <div key={s.label} className={cn("rounded-xl border px-3 py-2 text-center", s.highlight ? "border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20" : "bg-muted/40")}>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{s.label}</p>
                              <p className={cn("mt-0.5 text-base font-extrabold tabular-nums", s.highlight ? "text-emerald-600 dark:text-emerald-400" : "text-foreground")}>{s.value}</p>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="rounded-xl border overflow-hidden">
                        <DataTable
                          columns={dayColumns}
                          rows={(data.days ?? []).map((d, i) => ({ __idx: i, ...d }))}
                          rowKey={(r) => String(r.__idx)}
                          emptyIcon={CalendarCheck}
                          emptyTitle="No shifts in this period"
                          emptyDescription="This employee has no confirmed deployments in the selected range."
                          className="max-h-72 overflow-y-auto"
                        />
                      </div>
                      {data.propertySummary && data.propertySummary.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1" aria-label="Per-property summary">
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

                {/* Contractor Commission statement drill-down */}
                {def.type === "contractor-commissions" && data?.contractor && data.days && (
                  <Card className="overflow-hidden border-primary/40 shadow-sm print:break-inside-avoid">
                    <div className="h-1 w-full bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600" aria-hidden />
                    <CardHeader className="pb-2">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <CardTitle className="flex flex-wrap items-center gap-2 text-base font-bold">
                            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                              <HardHat className="h-4 w-4" aria-hidden />
                            </span>
                            <span>{data.contractor}</span>
                            <span className="rounded-full bg-amber-100 dark:bg-amber-950/80 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
                              Contractor Statement
                            </span>
                          </CardTitle>
                          <CardDescription className="mt-1 text-xs text-muted-foreground">
                            Official commission breakdown across deployments · Period: {periodLabel}
                          </CardDescription>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="no-print h-8 gap-1.5 border-primary/30 hover:bg-primary/5"
                            onClick={downloadContractorStatement}
                            aria-label="Download or print contractor statement"
                          >
                            <Printer className="h-3.5 w-3.5 text-primary" aria-hidden />
                            Print Statement
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="no-print h-8 gap-1.5"
                            onClick={exportContractorCSV}
                            aria-label="Export contractor breakdown as CSV"
                          >
                            <Download className="h-3.5 w-3.5" aria-hidden />
                            Export CSV
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="no-print h-8 gap-1 text-muted-foreground hover:text-foreground"
                            onClick={() => setContractor("")}
                            aria-label="Close statement and view all contractors"
                          >
                            <X className="h-3.5 w-3.5" aria-hidden />
                            Show All
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-1">
                      {data.dayTotals && (
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {[
                            { label: "Deployments", value: String(data.dayTotals.deployments ?? data.days.length) },
                            { label: "Shift Units", value: String(data.dayTotals.units ?? data.days.length) },
                            { label: "Active Staff", value: String(data.dayTotals.employees ?? new Set(data.days.map((d) => d.employeeName)).size) },
                            { label: "Total Commission", value: formatINR(Number(data.dayTotals.commission ?? 0)), highlight: true },
                          ].map((s) => (
                            <div
                              key={s.label}
                              className={cn(
                                "rounded-xl border px-3 py-2 text-center",
                                s.highlight ? "border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20" : "bg-muted/40"
                              )}
                            >
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{s.label}</p>
                              <p className={cn("mt-0.5 text-base font-extrabold tabular-nums", s.highlight ? "text-emerald-600 dark:text-emerald-400" : "text-foreground")}>
                                {s.value}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="rounded-xl border overflow-hidden">
                        <DataTable
                          columns={contractorDayColumns}
                          rows={data.days.map((d, i) => ({ __idx: i, ...d }))}
                          rowKey={(r) => String(r.__idx)}
                          emptyIcon={HardHat}
                          emptyTitle="No deployments in this period"
                          emptyDescription="No deployments under this contractor in the selected date range."
                          className="max-h-80 overflow-y-auto"
                        />
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Property Billing Statement drill-down */}
                {def.type === "property-revenue" && data?.property && data.deployments && (
                  <Card className="overflow-hidden border-primary/40 shadow-sm print:break-inside-avoid">
                    <div className="h-1 w-full bg-gradient-to-r from-teal-500 via-emerald-500 to-emerald-600" aria-hidden />
                    <CardHeader className="pb-2">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <CardTitle className="flex flex-wrap items-center gap-2 text-base font-bold">
                            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                              <Building2 className="h-4 w-4" aria-hidden />
                            </span>
                            <span>{data.property.name}</span>
                            {data.property.code && (
                              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] tracking-tight text-muted-foreground">
                                {data.property.code}
                              </span>
                            )}
                            <span className="rounded-full bg-emerald-100 dark:bg-emerald-950/80 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                              Client Billing Statement
                            </span>
                          </CardTitle>
                          <CardDescription className="mt-1 text-xs text-muted-foreground">
                            {data.property.contactPerson ? `Contact: ${data.property.contactPerson} · ` : ""}
                            {data.property.phone ? `Phone: ${data.property.phone} · ` : ""}
                            Period: {periodLabel}
                          </CardDescription>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="no-print h-8 gap-1.5 border-primary/30 hover:bg-primary/5"
                            onClick={downloadPropertyStatement}
                            aria-label="Download or print property statement"
                          >
                            <Printer className="h-3.5 w-3.5 text-primary" aria-hidden />
                            Print Statement
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="no-print h-8 gap-1.5"
                            onClick={exportPropertyCSV}
                            aria-label="Export property deployments as CSV"
                          >
                            <Download className="h-3.5 w-3.5" aria-hidden />
                            Export CSV
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="no-print h-8 gap-1 text-muted-foreground hover:text-foreground"
                            onClick={() => setPropertyId("")}
                            aria-label="Close statement and view all properties"
                          >
                            <X className="h-3.5 w-3.5" aria-hidden />
                            Show All
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4 pt-1">
                      {(() => {
                        const propRow = data.rows.find((r) => String(r.propertyId) === propertyId) as
                          | { shifts?: number; employees?: number; billing?: number; received?: number; outstanding?: number; collectionPct?: number }
                          | undefined;
                        const billing = propRow?.billing ?? data.deployments.reduce((s, d) => s + d.billingAmount, 0);
                        const received = propRow?.received ?? (data.payments ?? []).reduce((s, p) => s + p.amount, 0);
                        const outstanding = propRow?.outstanding ?? Math.max(0, billing - received);

                        return (
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            {[
                              { label: "Shifts Delivered", value: String(propRow?.shifts ?? data.deployments.length) },
                              { label: "Total Billed", value: formatINR(billing) },
                              { label: "Total Received", value: formatINR(received), highlight: true },
                              { label: "Net Outstanding", value: formatINR(outstanding), warning: outstanding > 0 },
                            ].map((s) => (
                              <div
                                key={s.label}
                                className={cn(
                                  "rounded-xl border px-3 py-2 text-center",
                                  s.highlight && "border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20",
                                  s.warning && "border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20",
                                  !s.highlight && !s.warning && "bg-muted/40"
                                )}
                              >
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{s.label}</p>
                                <p
                                  className={cn(
                                    "mt-0.5 text-base font-extrabold tabular-nums",
                                    s.highlight && "text-emerald-600 dark:text-emerald-400",
                                    s.warning && "text-amber-600 dark:text-amber-400"
                                  )}
                                >
                                  {s.value}
                                </p>
                              </div>
                            ))}
                          </div>
                        );
                      })()}

                      <div>
                        <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-foreground">
                          Shift Deployments ({data.deployments.length} records)
                        </h4>
                        <div className="rounded-xl border overflow-hidden">
                          <DataTable
                            columns={propertyDepColumns}
                            rows={data.deployments.map((d, i) => ({ __idx: i, ...d }))}
                            rowKey={(r) => String(r.__idx)}
                            emptyIcon={Building2}
                            emptyTitle="No deployments in this period"
                            emptyDescription="No employee deployments recorded for this property in the range."
                            className="max-h-72 overflow-y-auto"
                          />
                        </div>
                      </div>

                      {data.payments && data.payments.length > 0 && (
                        <div>
                          <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-foreground">
                            Collections & Payments Received ({data.payments.length} records)
                          </h4>
                          <div className="rounded-xl border overflow-hidden">
                            <DataTable
                              columns={propertyPayColumns}
                              rows={data.payments.map((p, i) => ({ __idx: i, ...p }))}
                              rowKey={(r) => String(r.__idx)}
                              emptyIcon={Wallet}
                              emptyTitle="No payments recorded"
                              emptyDescription="No collections logged for this property in the selected range."
                              className="max-h-60 overflow-y-auto"
                            />
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Vehicle Fleet Statement drill-down */}
                {def.type === "vehicle-profitability" && data?.vehicle && data.trips && (
                  <Card className="overflow-hidden border-primary/40 shadow-sm print:break-inside-avoid">
                    <div className="h-1 w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-indigo-600" aria-hidden />
                    <CardHeader className="pb-2">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <CardTitle className="flex flex-wrap items-center gap-2 text-base font-bold">
                            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                              <CarFront className="h-4 w-4" aria-hidden />
                            </span>
                            <span>{data.vehicle.name}</span>
                            <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs font-semibold">
                              {data.vehicle.registrationNumber}
                            </span>
                            <span className="rounded-full bg-blue-100 dark:bg-blue-950/80 px-2.5 py-0.5 text-xs font-semibold text-blue-800 dark:text-blue-300">
                              Fleet Statement
                            </span>
                          </CardTitle>
                          <CardDescription className="mt-1 text-xs text-muted-foreground">
                            {data.vehicle.make ? `${data.vehicle.make} ${data.vehicle.model ?? ""} · ` : ""}
                            {data.vehicle.capacity ? `${data.vehicle.capacity} Seater · ` : ""}
                            Period: {periodLabel}
                          </CardDescription>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="no-print h-8 gap-1.5 border-primary/30 hover:bg-primary/5"
                            onClick={downloadVehicleStatement}
                            aria-label="Download or print vehicle statement"
                          >
                            <Printer className="h-3.5 w-3.5 text-primary" aria-hidden />
                            Print Statement
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="no-print h-8 gap-1.5"
                            onClick={exportVehicleCSV}
                            aria-label="Export vehicle trips as CSV"
                          >
                            <Download className="h-3.5 w-3.5" aria-hidden />
                            Export CSV
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="no-print h-8 gap-1 text-muted-foreground hover:text-foreground"
                            onClick={() => setVehicleId("")}
                            aria-label="Close statement and view all vehicles"
                          >
                            <X className="h-3.5 w-3.5" aria-hidden />
                            Show All
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4 pt-1">
                      {(() => {
                        const vRow = data.rows.find((r) => String(r.vehicleId) === vehicleId) as
                          | { revenue?: number; operatingExpenses?: number; emi?: number; net?: number }
                          | undefined;
                        const revenue = vRow?.revenue ?? data.trips.reduce((s, t) => s + (t.fare ?? 0), 0);
                        const operatingExpenses = vRow?.operatingExpenses ?? (data.expenses ?? []).reduce((s, e) => s + e.amount, 0);
                        const emi = vRow?.emi ?? (data.emis ?? []).reduce((s, m) => s + m.amount, 0);
                        const net = vRow?.net ?? (revenue - operatingExpenses - emi);

                        return (
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            {[
                              { label: "Trip Revenue", value: formatINR(revenue), highlight: true },
                              { label: "Operating Expenses", value: formatINR(operatingExpenses) },
                              { label: "EMI Deductions", value: formatINR(emi) },
                              { label: "Net Profit / Loss", value: formatINR(net), highlight: net >= 0, warning: net < 0 },
                            ].map((s) => (
                              <div
                                key={s.label}
                                className={cn(
                                  "rounded-xl border px-3 py-2 text-center",
                                  s.highlight && "border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20",
                                  s.warning && "border-red-500/30 bg-red-50/50 dark:bg-red-950/20",
                                  !s.highlight && !s.warning && "bg-muted/40"
                                )}
                              >
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{s.label}</p>
                                <p
                                  className={cn(
                                    "mt-0.5 text-base font-extrabold tabular-nums",
                                    s.highlight && "text-emerald-600 dark:text-emerald-400",
                                    s.warning && "text-red-600 dark:text-red-400"
                                  )}
                                >
                                  {s.value}
                                </p>
                              </div>
                            ))}
                          </div>
                        );
                      })()}

                      <div>
                        <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-foreground">
                          Completed Trips ({data.trips.length} trips)
                        </h4>
                        <div className="rounded-xl border overflow-hidden">
                          <DataTable
                            columns={vehicleTripColumns}
                            rows={data.trips.map((t, i) => ({ __idx: i, ...t }))}
                            rowKey={(r) => String(r.__idx)}
                            emptyIcon={CarFront}
                            emptyTitle="No trips recorded in this period"
                            emptyDescription="No trips logged for this vehicle in the selected date range."
                            className="max-h-64 overflow-y-auto"
                          />
                        </div>
                      </div>

                      {data.expenses && data.expenses.length > 0 && (
                        <div>
                          <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-foreground">
                            Operating Expenses (Fuel / Service) ({data.expenses.length} entries)
                          </h4>
                          <div className="rounded-xl border bg-muted/20 p-2.5 space-y-1.5 max-h-48 overflow-y-auto">
                            {data.expenses.map((e) => (
                              <div key={e.id} className="flex items-center justify-between text-xs py-1 border-b border-border/40 last:border-0">
                                <div>
                                  <span className="font-semibold">{e.categoryName}</span>
                                  <span className="text-muted-foreground ml-2">{e.description}</span>
                                  <span className="text-muted-foreground text-[10px] ml-2">({e.date})</span>
                                </div>
                                <span className="font-bold tabular-nums">{formatINR(e.amount)}</span>
                              </div>
                            ))}
                          </div>
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

                {/* Executive Income Statement (P&L) card */}
                {def.type === "profitability" && data?.incomeStatement && (
                  <Card className="overflow-hidden border-primary/40 shadow-sm print:break-inside-avoid">
                    <div className="h-1 w-full bg-gradient-to-r from-emerald-500 via-teal-500 to-indigo-500" aria-hidden />
                    <CardHeader className="pb-2">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <CardTitle className="flex flex-wrap items-center gap-2 text-base font-bold">
                            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                              <TrendingUp className="h-4 w-4" aria-hidden />
                            </span>
                            <span>Executive Income Statement (P&L)</span>
                            <span className="rounded-full bg-emerald-100 dark:bg-emerald-950/80 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                              Audited
                            </span>
                          </CardTitle>
                          <CardDescription className="mt-1 text-xs text-muted-foreground">
                            Multi-tier operating ledger: Gross Billings, Cost of Labor, Gross Margin, Itemized OPEX and Net Operating Profit · Period: {periodLabel}
                          </CardDescription>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="no-print h-8 gap-1.5 border-primary/30 hover:bg-primary/5"
                            onClick={downloadExecutivePnl}
                            aria-label="Download or print Executive P&L statement"
                          >
                            <Printer className="h-3.5 w-3.5 text-primary" aria-hidden />
                            Print Formal Statement
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4 pt-1">
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                        <div className="rounded-xl border bg-muted/40 px-3 py-2 text-center">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total Revenue</p>
                          <p className="mt-0.5 text-base font-extrabold tabular-nums text-foreground">{formatINR(data.incomeStatement.revenue.totalRevenue)}</p>
                        </div>
                        <div className="rounded-xl border bg-muted/40 px-3 py-2 text-center">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Cost of Labor</p>
                          <p className="mt-0.5 text-base font-extrabold tabular-nums text-foreground">{formatINR(data.incomeStatement.directCosts.totalLaborCost)}</p>
                        </div>
                        <div className="rounded-xl border border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20 px-3 py-2 text-center">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Gross Profit</p>
                          <p className="mt-0.5 text-base font-extrabold tabular-nums text-emerald-600 dark:text-emerald-400">
                            {formatINR(data.incomeStatement.grossProfit)} <span className="text-xs font-normal">({data.incomeStatement.grossMarginPct}%)</span>
                          </p>
                        </div>
                        <div className="rounded-xl border bg-muted/40 px-3 py-2 text-center">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Operating OPEX</p>
                          <p className="mt-0.5 text-base font-extrabold tabular-nums text-foreground">{formatINR(data.incomeStatement.operatingExpenses.totalOpex)}</p>
                        </div>
                        <div className={cn(
                          "rounded-xl border px-3 py-2 text-center",
                          data.incomeStatement.netProfit >= 0
                            ? "border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20"
                            : "border-red-500/30 bg-red-50/50 dark:bg-red-950/20"
                        )}>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Net Profit</p>
                          <p className={cn(
                            "mt-0.5 text-base font-extrabold tabular-nums",
                            data.incomeStatement.netProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                          )}>
                            {formatINR(data.incomeStatement.netProfit)} <span className="text-xs font-normal">({data.incomeStatement.netMarginPct}%)</span>
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Bank & Cash Book statement card */}
                {def.type === "bank-ledger" && (
                  <Card className="overflow-hidden border-primary/40 shadow-sm print:break-inside-avoid">
                    <div className="h-1 w-full bg-gradient-to-r from-teal-500 via-blue-500 to-indigo-600" aria-hidden />
                    <CardHeader className="pb-2">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <CardTitle className="flex flex-wrap items-center gap-2 text-base font-bold">
                            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                              <Landmark className="h-4 w-4" aria-hidden />
                            </span>
                            <span>Cash & Bank Book Statement</span>
                            <span className="rounded-full bg-blue-100 dark:bg-blue-950/80 px-2.5 py-0.5 text-xs font-semibold text-blue-800 dark:text-blue-300">
                              Real-Time Ledger
                            </span>
                          </CardTitle>
                          <CardDescription className="mt-1 text-xs text-muted-foreground">
                            Complete chronological audit ledger of all bank and liquid cash movements · Period: {periodLabel}
                          </CardDescription>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="no-print h-8 gap-1.5 border-primary/30 hover:bg-primary/5"
                            onClick={downloadBankLedger}
                            aria-label="Download or print Bank Ledger statement"
                          >
                            <Printer className="h-3.5 w-3.5 text-primary" aria-hidden />
                            Print Bank Statement
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4 pt-1">
                      {data?.totals && (
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <div className="rounded-xl border border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20 px-3 py-2 text-center">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total Liquid Inflow</p>
                            <p className="mt-0.5 text-base font-extrabold tabular-nums text-emerald-600 dark:text-emerald-400">
                              {formatINR(Number(data.totals.inflow ?? 0))}
                            </p>
                          </div>
                          <div className="rounded-xl border border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20 px-3 py-2 text-center">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total Liquid Outflow</p>
                            <p className="mt-0.5 text-base font-extrabold tabular-nums text-amber-600 dark:text-amber-400">
                              {formatINR(Number(data.totals.outflow ?? 0))}
                            </p>
                          </div>
                          <div className={cn(
                            "rounded-xl border px-3 py-2 text-center",
                            Number(data.totals.net ?? 0) >= 0
                              ? "border-teal-500/30 bg-teal-50/50 dark:bg-teal-950/20"
                              : "border-red-500/30 bg-red-50/50 dark:bg-red-950/20"
                          )}>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Net Cash Flow</p>
                            <p className={cn(
                              "mt-0.5 text-base font-extrabold tabular-nums",
                              Number(data.totals.net ?? 0) >= 0 ? "text-teal-600 dark:text-teal-400" : "text-red-600 dark:text-red-400"
                            )}>
                              {formatINR(Number(data.totals.net ?? 0))}
                            </p>
                          </div>
                          <div className="rounded-xl border bg-muted/40 px-3 py-2 text-center">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Transactions Logged</p>
                            <p className="mt-0.5 text-base font-extrabold tabular-nums text-foreground">
                              {String(data.totals.count ?? data.rows.length)}
                            </p>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Manpower Master Statement card */}
                {def.type === "manpower-statement" && (
                  <Card className="overflow-hidden border-primary/40 shadow-sm print:break-inside-avoid">
                    <div className="h-1 w-full bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600" aria-hidden />
                    <CardHeader className="pb-2">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <CardTitle className="flex flex-wrap items-center gap-2 text-base font-bold">
                            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                              <Briefcase className="h-4 w-4" aria-hidden />
                            </span>
                            <span>Manpower Master Statement</span>
                            <span className="rounded-full bg-amber-100 dark:bg-amber-950/80 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
                              Consolidated
                            </span>
                          </CardTitle>
                          <CardDescription className="mt-1 text-xs text-muted-foreground">
                            Aggregated manpower delivery, client billings, employee payroll, contractor cuts & gross margin · Period: {periodLabel}
                          </CardDescription>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="no-print h-8 gap-1.5 border-primary/30 hover:bg-primary/5"
                            onClick={downloadManpowerMaster}
                            aria-label="Download or print Manpower statement"
                          >
                            <Printer className="h-3.5 w-3.5 text-primary" aria-hidden />
                            Print Master Statement
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4 pt-1">
                      {data?.totals && (
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                          <div className="rounded-xl border bg-muted/40 px-3 py-2 text-center">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Shifts Delivered</p>
                            <p className="mt-0.5 text-base font-extrabold tabular-nums text-foreground">{String(data.totals.shifts ?? 0)}</p>
                          </div>
                          <div className="rounded-xl border bg-muted/40 px-3 py-2 text-center">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Client Billing</p>
                            <p className="mt-0.5 text-base font-extrabold tabular-nums text-foreground">{formatINR(Number(data.totals.billing ?? 0))}</p>
                          </div>
                          <div className="rounded-xl border bg-muted/40 px-3 py-2 text-center">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Staff Payout</p>
                            <p className="mt-0.5 text-base font-extrabold tabular-nums text-foreground">{formatINR(Number(data.totals.payout ?? 0))}</p>
                          </div>
                          <div className="rounded-xl border bg-muted/40 px-3 py-2 text-center">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Contractor Cut</p>
                            <p className="mt-0.5 text-base font-extrabold tabular-nums text-foreground">{formatINR(Number(data.totals.contractorCut ?? 0))}</p>
                          </div>
                          <div className="rounded-xl border border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20 px-3 py-2 text-center">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Gross Agency Margin</p>
                            <p className="mt-0.5 text-base font-extrabold tabular-nums text-emerald-600 dark:text-emerald-400">
                              {formatINR(Number(data.totals.margin ?? 0))} <span className="text-xs font-normal">({String(data.totals.marginPct ?? 0)}%)</span>
                            </p>
                          </div>
                        </div>
                      )}
                      {data?.contractors && data.contractors.length > 0 && (
                        <div>
                          <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-foreground">
                            Contractor Commissions Rollup ({data.contractors.length} contractors)
                          </h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                            {data.contractors.map((c) => (
                              <div
                                key={c.contractor}
                                onClick={() => {
                                  setType("contractor-commissions");
                                  setContractor(c.contractor);
                                }}
                                className="cursor-pointer rounded-xl border p-2.5 transition-all hover:border-primary/40 hover:bg-muted/30"
                              >
                                <div className="flex items-center justify-between text-xs font-semibold">
                                  <span className="truncate">{c.contractor}</span>
                                  <span className="text-primary tabular-nums font-bold">{formatINR(c.commission)}</span>
                                </div>
                                <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                                  <span>{c.headcount} workers · {c.shifts} shifts</span>
                                  <span className="text-[10px] text-primary underline">View Statement →</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Transport Master Statement card */}
                {def.type === "transport-statement" && (
                  <Card className="overflow-hidden border-primary/40 shadow-sm print:break-inside-avoid">
                    <div className="h-1 w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600" aria-hidden />
                    <CardHeader className="pb-2">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <CardTitle className="flex flex-wrap items-center gap-2 text-base font-bold">
                            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                              <Truck className="h-4 w-4" aria-hidden />
                            </span>
                            <span>Transport Master Statement</span>
                            <span className="rounded-full bg-indigo-100 dark:bg-indigo-950/80 px-2.5 py-0.5 text-xs font-semibold text-indigo-800 dark:text-indigo-300">
                              Fleet Rollup
                            </span>
                          </CardTitle>
                          <CardDescription className="mt-1 text-xs text-muted-foreground">
                            Consolidated fleet billing, trip earnings, fuel/maintenance opex, vehicle loans & net vehicle yield · Period: {periodLabel}
                          </CardDescription>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="no-print h-8 gap-1.5 border-primary/30 hover:bg-primary/5"
                            onClick={downloadTransportMaster}
                            aria-label="Download or print Transport statement"
                          >
                            <Printer className="h-3.5 w-3.5 text-primary" aria-hidden />
                            Print Transport Statement
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4 pt-1">
                      {data?.totals && (
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                          <div className="rounded-xl border bg-muted/40 px-3 py-2 text-center">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Trips Completed</p>
                            <p className="mt-0.5 text-base font-extrabold tabular-nums text-foreground">{String(data.totals.tripsCount ?? 0)}</p>
                          </div>
                          <div className="rounded-xl border bg-muted/40 px-3 py-2 text-center">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total Billed</p>
                            <p className="mt-0.5 text-base font-extrabold tabular-nums text-foreground">{formatINR(Number(data.totals.revenue ?? 0))}</p>
                          </div>
                          <div className="rounded-xl border bg-muted/40 px-3 py-2 text-center">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Fleet OPEX</p>
                            <p className="mt-0.5 text-base font-extrabold tabular-nums text-foreground">{formatINR(Number(data.totals.opex ?? 0))}</p>
                          </div>
                          <div className="rounded-xl border bg-muted/40 px-3 py-2 text-center">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Vehicle EMIs</p>
                            <p className="mt-0.5 text-base font-extrabold tabular-nums text-foreground">{formatINR(Number(data.totals.emi ?? 0))}</p>
                          </div>
                          <div className={cn(
                            "rounded-xl border px-3 py-2 text-center",
                            Number(data.totals.net ?? 0) >= 0
                              ? "border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20"
                              : "border-red-500/30 bg-red-50/50 dark:bg-red-950/20"
                          )}>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Net Fleet Margin</p>
                            <p className={cn(
                              "mt-0.5 text-base font-extrabold tabular-nums",
                              Number(data.totals.net ?? 0) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                            )}>
                              {formatINR(Number(data.totals.net ?? 0))} <span className="text-xs font-normal">({String(data.totals.marginPct ?? 0)}%)</span>
                            </p>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardContent className="p-3 sm:p-4 space-y-2">
                    <div className="flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs text-primary">
                      <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span>Click any row in the table below to open its official itemized statement and printable slip</span>
                    </div>

                    <DataTable
                      columns={columns}
                      rows={rows}
                      rowKey={(r) => String(r.__idx)}
                      onRowClick={(r) => {
                        const rec = r as Record<string, unknown>;
                        if (def.type === "contractor-commissions" && rec.contractor) {
                          setContractor(String(rec.contractor));
                        } else if (def.type === "property-revenue" && rec.propertyId) {
                          setPropertyId(String(rec.propertyId));
                        } else if (def.type === "vehicle-profitability" && rec.vehicleId) {
                          setVehicleId(String(rec.vehicleId));
                        } else if (def.type === "employee-earnings" && rec.employeeId) {
                          setEmployeeId(String(rec.employeeId));
                        } else if (def.type === "settlement-summary" && rec.id) {
                          navigate("statement", { settlementId: String(rec.id) });
                        } else if (def.type === "collections" && rec.propertyId) {
                          setType("property-revenue");
                          setPropertyId(String(rec.propertyId));
                        } else if (def.type === "daily-operations" && rec.propertyId) {
                          setPropertyId(String(rec.propertyId));
                        } else if (def.type === "manpower-statement" && rec.propertyId) {
                          setType("property-revenue");
                          setPropertyId(String(rec.propertyId));
                        } else if (def.type === "transport-statement" && rec.vehicleId) {
                          setType("vehicle-profitability");
                          setVehicleId(String(rec.vehicleId));
                        } else if (rec.tripId) {
                          navigate("trips", { id: String(rec.tripId) });
                        } else if (def.type === "expenses") {
                          navigate("expenses");
                        }
                      }}
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
