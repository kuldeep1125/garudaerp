"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api-client";
import { formatINR } from "@/lib/money";
import type { ViewProps } from "@/components/view-types";
import { useAuth } from "@/components/providers";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { OnboardingChecklist } from "@/components/shared/onboarding-checklist";
import { RangeSelector, type RangeKey } from "@/components/shared/filters";
import { MonthPicker, toMonth } from "@/components/shared/month-picker";
import { t as tr, useLang } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Users, Truck, Wallet, IndianRupee, Landmark, CalendarCheck, Receipt, HandCoins, ReceiptText,
  Route, AlertTriangle, AlertCircle, Info, ChevronRight, Building2, RefreshCw, Activity, PieChart as PieChartIcon, History,
  CalendarRange, TrendingUp, TrendingDown, Minus, Sparkles, CalendarDays, Printer, HardHat, Home,
  Search, X, UserRound, ArrowRight, Calculator, ShieldCheck, Layers, HelpCircle,
} from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { ErrorState, useAsync, AreaTrend, CHART_COLORS, useDebounced } from "./_shared";
import {
  FormulaInspectorDialog,
  type FormulaInspectorData,
} from "@/components/shared/formula-inspector-dialog";
import { ReconciliationCenterDialog } from "@/components/shared/reconciliation-center-dialog";

interface AttentionItem {
  key: string;
  severity: string;
  title: string;
  message: string;
  view?: string;
  params?: Record<string, string>;
}

interface SummaryResp {
  manpower: {
    employeesDeployed: number; propertiesServed: number; expectedBilling: number; payout: number;
    shiftPayout?: number; salary?: number; overtime?: number; rentIncome?: number; contractorCut?: number;
    grossMargin: number; received: number; pending: number; advancesGiven: number; expenses: number;
    dayShifts: number; nightShifts: number; deployments: number;
  };
  transport: {
    availableVehicles: number; onTripVehicles: number; revenue: number; expenses: number;
    received: number; pending: number; monthRevenue: number; monthExpense: number;
    monthEmi: number; monthNet: number;
  };
  combined: { revenue: number; expenses: number; employeePayout?: number; rentIncome?: number; net: number; manpowerMargin: number; transportNet: number };
  collections: {
    totalBilled: number; totalReceived: number; totalOutstanding: number;
    byProperty: { propertyId: string; propertyName: string; outstanding: number }[];
  };
  attention: AttentionItem[];
}

interface ContractorStat {
  name: string;
  todayDeployments: number;
  todayCommission: number;
  monthDeployments: number;
  monthCommission: number;
  employees: string[];
}

interface TrendRow { date: string; billing: number; collections: number; transport: number; expenses: number }

interface AuditItem {
  id: string; ownerName: string; action: string; module: string;
  recordLabel: string | null; createdAt: string;
}

interface MonthMetrics {
  deployments: number; manpowerBilling: number; manpowerPayout: number; manpowerMargin: number;
  manpowerOtherExpenses: number; collections: number; advances: number; trips: number;
  transportRevenue: number; transportCollected: number; transportOpex: number; transportEmi: number;
  rentIncome?: number; contractorCut?: number; manpowerSalary?: number; manpowerOvertime?: number;
  net: number;
}
interface MonthlySummaryResp {
  month: string; prevMonth: string;
  current: MonthMetrics; previous: MonthMetrics;
  insights: string[]; note: string;
}

const SEVERITY_STYLE: Record<string, { icon: typeof Info; cls: string }> = {
  CRITICAL: { icon: AlertCircle, cls: "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/50" },
  WARNING: { icon: AlertTriangle, cls: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50" },
  INFO: { icon: Info, cls: "text-zinc-600 dark:text-zinc-400 bg-muted" },
};

const QUICK_ACTIONS = [
  { label: "Deploy Employee", icon: CalendarCheck, view: "deployments" },
  { label: "Record Payment", icon: Wallet, view: "payments" },
  { label: "Add Expense", icon: Receipt, view: "expenses" },
  { label: "New Rental", icon: Route, view: "trips" },
  { label: "Add Advance", icon: HandCoins, view: "advances" },
  { label: "Settlements", icon: ReceiptText, view: "settlements" },
];

const ACTION_BADGE: Record<string, string> = {
  CREATE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  UPDATE: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  DELETE: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

const TOOLTIP_STYLE = {
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--card)",
  color: "var(--foreground)",
  fontSize: 12,
} as const;

function greetingForHour(): string {
  const h = new Date().getHours();
  if (h < 5) return "Burning the midnight oil";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function fmtRel(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function prettyDate(): string {
  return new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());
}

// Month-over-month delta chip: ▲/▼ with % — colored by whether the move is good.
function Delta({ pct, goodUp = true }: { pct: number | null; goodUp?: boolean }) {
  if (pct === null) {
    return <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">new</span>;
  }
  if (pct === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
        <Minus className="h-2.5 w-2.5" aria-hidden />0%
      </span>
    );
  }
  const up = pct > 0;
  const good = up === goodUp;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
        good
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
          : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
      )}
    >
      <Icon className="h-2.5 w-2.5" aria-hidden />
      {Math.abs(pct)}%
    </span>
  );
}

function pctOf(cur: number, prev: number): number | null {
  if (prev === 0) return cur === 0 ? 0 : null;
  return Math.round(((cur - prev) / Math.abs(prev)) * 100);
}

function monthShort(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "short" });
}

export default function DashboardView({ navigate }: ViewProps) {
  const { owner } = useAuth();
  const { lang } = useLang();
  const [range, setRange] = useState<RangeKey>("today");
  const { data, loading, error, reload } = useAsync<SummaryResp>(
    () => api.get<SummaryResp>("/api/dashboard/summary" + (range !== "custom" ? `?range=${range}` : `?range=month`)),
    [range]
  );
  const { data: trend, loading: trendLoading, reload: reloadTrend } = useAsync<{ trend: TrendRow[] }>(
    () => api.get<{ trend: TrendRow[] }>("/api/dashboard/combined-trend?days=14"),
    []
  );
  const { data: audit, loading: auditLoading, reload: reloadAudit } = useAsync<{ items: AuditItem[] }>(
    () => api.get<{ items: AuditItem[] }>("/api/audit?page=1&pageSize=6"),
    []
  );
  const [summaryMonth, setSummaryMonth] = useState<string>(() => toMonth());
  const { data: monthly, loading: monthlyLoading } = useAsync<MonthlySummaryResp>(
    () => api.get<MonthlySummaryResp>(`/api/dashboard/monthly-summary?month=${summaryMonth}`),
    [summaryMonth]
  );
  // Contractor commission cards — today + this month (independent of the range selector).
  const { data: contractorsData, reload: reloadContractors } = useAsync<{ contractors: ContractorStat[]; known: string[] }>(
    () => api.get<{ contractors: ContractorStat[]; known: string[] }>("/api/dashboard/contractors"),
    []
  );

  // 360° Passbook Quick-Jump Search
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounced(searchQuery, 250);
  const [searchResults, setSearchResults] = useState<{
    employees: Array<{ id: string; fullName: string; code: string; designation?: string | null; status: string }>;
    properties: Array<{ id: string; name: string; brandName?: string | null; type?: string | null; status: string }>;
    vehicles: Array<{ id: string; name: string; registrationNumber: string; make?: string | null }>;
  } | null>(null);
  const [searching, setSearching] = useState(false);
  const [inspectorData, setInspectorData] = useState<FormulaInspectorData | null>(null);
  const [reconciliationOpen, setReconciliationOpen] = useState(false);

  useEffect(() => {
    if (!debouncedSearch.trim() || debouncedSearch.trim().length < 2) {
      setSearchResults(null);
      return;
    }
    let active = true;
    setSearching(true);
    api.get<{
      employees: Array<{ id: string; fullName: string; code: string; designation?: string | null; status: string }>;
      properties: Array<{ id: string; name: string; brandName?: string | null; type?: string | null; status: string }>;
      vehicles: Array<{ id: string; name: string; registrationNumber: string; make?: string | null }>;
    }>(`/api/search?q=${encodeURIComponent(debouncedSearch.trim())}`)
      .then((res) => {
        if (active) setSearchResults(res);
      })
      .catch(() => {
        if (active) setSearchResults(null);
      })
      .finally(() => {
        if (active) setSearching(false);
      });
    return () => { active = false; };
  }, [debouncedSearch]);

  const openInspector = (metric: "billing" | "collections" | "outstanding" | "payout" | "transport" | "net") => {
    if (!data) return;
    const m = data.manpower;
    const t = data.transport;
    const c = data.collections;
    const rangeLabel = range.toUpperCase();

    switch (metric) {
      case "billing":
        setInspectorData({
          title: "Manpower Invoiced (Billing) Calculation",
          subtitle: `Accrual Revenue (${rangeLabel} range)`,
          resultLabel: "Manpower Billing",
          resultValue: formatINR(m.expectedBilling),
          formulaEquation: "Today Billing = ∑(Shift Deployments × Contract Billing Rate)",
          steps: [
            { label: "Total Shift Deployments", amount: m.deployments, operation: "info", detail: `${m.dayShifts || 0} Day · ${m.nightShifts || 0} Night shifts` },
            { label: "Gross Billing Revenue", amount: m.expectedBilling, operation: "result", detail: "Invoiced value of manpower services" },
          ],
          notes: [
            "This is ACCRUAL REVENUE: it counts all shifts serviced in this date window, regardless of whether the restaurant has paid yet.",
            "Rates are locked at the contract rate set in each property agreement at the moment of deployment.",
          ],
        });
        break;

      case "collections":
        setInspectorData({
          title: "Collections Received Calculation",
          subtitle: `Cash Flow Inflow (${rangeLabel} range)`,
          resultLabel: "Total Collections",
          resultValue: formatINR(m.received),
          formulaEquation: "Collections = ∑(Property Payments Received in Range)",
          steps: [
            { label: "Total Payments Cleared", amount: m.received, operation: "result", detail: "Bank / UPI / Cash receipts" },
          ],
          notes: [
            "This is a CASH FLOW metric: it reflects actual rupee inflows into your business accounts.",
            "Collections may be for shifts worked today, or for settling invoices from prior weeks/months.",
            "To reconcile which restaurant paid, check the Collections & Payments ledger.",
          ],
        });
        break;

      case "outstanding":
        setInspectorData({
          title: "Cumulative Outstanding Balance",
          subtitle: "All Active & Inactive Properties (Lifetime Balance)",
          resultLabel: "Outstanding Receivable",
          resultValue: formatINR(c.totalOutstanding),
          formulaEquation: "Total Outstanding = Total Billed (All Time) − Total Received (All Time)",
          steps: [
            { label: "Total Cumulative Invoiced", amount: c.totalBilled, operation: "add", detail: "All shifts ever billed" },
            { label: "Total Cumulative Received", amount: c.totalReceived, operation: "subtract", detail: "All payments ever collected" },
            { label: "Net Pending Collection", amount: c.totalOutstanding, operation: "result", detail: "Uncollected receivables" },
          ],
          sourceRows: (c.byProperty ?? []).slice(0, 8).map((p) => ({
            id: p.propertyId,
            title: p.propertyName,
            amount: formatINR(p.outstanding),
            badge: p.outstanding > 0 ? "Pending" : "Settled",
            badgeTone: p.outstanding > 0 ? "red" : "emerald",
            onClick: () => {
              setInspectorData(null);
              navigate("properties", { id: p.propertyId });
            },
          })),
          sourceRowsTitle: "Top Properties with Outstanding Balances",
          notes: [
            "Click on any property in the list above to open its 360° Passbook Ledger.",
            "Zero Mismatch Rule: The sum of individual property outstanding balances equals this total exactly.",
          ],
        });
        break;

      case "payout": {
        const salaryAccrual = m.salary ?? 0;
        const shiftAccrual = m.shiftPayout ?? m.payout;
        const overtimeAccrual = m.overtime ?? 0;
        const rentDeduction = m.rentIncome ?? 0;
        const netPayout = m.payout;

        setInspectorData({
          title: "Employee Payout & Wage Liability",
          subtitle: `Staff Compensation (${rangeLabel} range)`,
          resultLabel: "Net Employee Payout",
          resultValue: formatINR(netPayout),
          formulaEquation: "Net Payout = (Salaries + Shift Wages + Overtime) − Rent Deductions",
          steps: [
            ...(salaryAccrual > 0 ? [{ label: "Monthly Base Salaries", amount: salaryAccrual, operation: "add" as const, detail: "Fixed salaried staff" }] : []),
            { label: "Shift Payout Wages", amount: shiftAccrual, operation: "add", detail: `${m.deployments} shifts deployed` },
            ...(overtimeAccrual > 0 ? [{ label: "Overtime Accruals", amount: overtimeAccrual, operation: "add" as const, detail: "Additional hours" }] : []),
            ...(rentDeduction > 0 ? [{ label: "Accommodation Rent Deducted", amount: rentDeduction, operation: "subtract" as const, detail: "Company housing recovery" }] : []),
            { label: "Net Payout Liability", amount: netPayout, operation: "result", detail: "Net wages payable to employees" },
          ],
          notes: [
            "Represents the accrued labor cost of fulfilling manpower deployments in this period.",
            "If an employee stays in business accommodation, their rent is deducted before final disbursement.",
          ],
        });
        break;
      }

      case "transport":
        setInspectorData({
          title: "Transport Fleet Revenue",
          subtitle: `Logistics & Vehicle Rentals (${rangeLabel} range)`,
          resultLabel: "Transport Revenue",
          resultValue: formatINR(t.revenue),
          formulaEquation: "Transport Revenue = ∑(Vehicle Trip Invoices in Range)",
          steps: [
            { label: "Fleet Vehicles on Trip", amount: t.onTripVehicles, operation: "info", detail: `Out of ${t.availableVehicles + t.onTripVehicles} total vehicles` },
            { label: "Total Rental Invoiced", amount: t.revenue, operation: "result", detail: "Gross transport revenue" },
          ],
          notes: [
            "Generated by vehicle dispatch operations, car rentals, and trip bookings.",
            "Operating expenses (fuel, tolls, EMI) are tracked separately under fleet costs.",
          ],
        });
        break;

      case "net": {
        const manpowerRev = m.expectedBilling;
        const transportRev = t.revenue;
        const rentDeducted = m.rentIncome ?? 0;
        const laborCost = m.payout;
        const totalExpenses = (m.expenses ?? 0) + (t.expenses ?? 0);

        setInspectorData({
          title: "Net Operating Profit Breakdown",
          subtitle: `Operating Performance (${rangeLabel} range)`,
          resultLabel: "Net Result",
          resultValue: formatINR(net),
          formulaEquation: "Net Result = (Gross Inflows) − (Labor Liability + Operating Expenses)",
          steps: [
            { label: "Manpower Billing (Revenue)", amount: manpowerRev, operation: "add", detail: "Services billed to properties" },
            { label: "Transport Revenue", amount: transportRev, operation: "add", detail: "Fleet rentals invoiced" },
            ...(rentDeducted > 0 ? [{ label: "Accommodation Rent Recovered", amount: rentDeducted, operation: "add" as const, detail: "Deducted from staff wages" }] : []),
            { label: "Employee Labor Wages", amount: laborCost, operation: "subtract", detail: "Direct staff compensation" },
            { label: "Business Operating Expenses", amount: totalExpenses, operation: "subtract", detail: "Fuel, maintenance, office, overhead" },
            { label: "Net Operating Result", amount: net, operation: "result", detail: net >= 0 ? "Operating Profit" : "Operating Loss" },
          ],
          notes: [
            "This is Garuda's true ACCRUAL OPERATING PROFIT for the selected period.",
            "It matches the Financial Reports P&L Statement 100%.",
            "This calculation accounts for all work performed and costs incurred, even if cash collection is pending.",
          ],
        });
        break;
      }
    }
  };

  const m = data?.manpower;
  const t = data?.transport;
  const c = data?.collections;
  const net = data?.combined.net ?? 0;
  const busy = loading || trendLoading;

  const refreshAll = () => { reload(); reloadTrend(); reloadAudit(); reloadContractors(); };

  const firstName = (owner?.name ?? "Owner").split(" ")[0];
  const expenseSplit = [
    { name: "Manpower", value: m?.expenses ?? 0, color: CHART_COLORS.emerald },
    { name: "Transport", value: t?.expenses ?? 0, color: CHART_COLORS.amber },
  ].filter((d) => d.value > 0);
  const expenseTotal = expenseSplit.reduce((s, d) => s + d.value, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title={`${greetingForHour()}, ${firstName}`}
        subtitle={prettyDate()}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300 font-medium"
              onClick={() => setReconciliationOpen(true)}
            >
              <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span className="hidden sm:inline">Reconciliation Hub</span>
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-semibold">
                0 Drift
              </Badge>
            </Button>
            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={refreshAll} aria-label="Refresh dashboard">
              <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} aria-hidden />
              <span className="hidden sm:inline">{tr(lang, "common.refresh")}</span>
            </Button>
            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => navigate("reports")}>
              <Landmark className="h-3.5 w-3.5" aria-hidden />{tr(lang, "common.reports")}
            </Button>
          </div>
        }
      />

      {/* Universal 360° Passbook Quick-Jump Search & Hub */}
      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 via-card to-card shadow-sm">
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden />
              <Input
                placeholder="Centralized 360° Passbook: Search employee, restaurant, vehicle…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-8 h-10 bg-background/90 text-sm font-medium"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => { setSearchQuery(""); setSearchResults(null); }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {/* Quick 360 directory shortcuts */}
            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 text-xs font-medium"
                onClick={() => navigate("employees")}
              >
                <Users className="h-3.5 w-3.5 text-primary" />
                <span>Employees</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 text-xs font-medium"
                onClick={() => navigate("properties")}
              >
                <Building2 className="h-3.5 w-3.5 text-primary" />
                <span>Restaurants</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 text-xs font-medium"
                onClick={() => navigate("payments")}
              >
                <Wallet className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Collections</span>
              </Button>
            </div>
          </div>

          {/* Autocomplete Dropdown */}
          {searchQuery.trim().length >= 2 && (
            <div className="mt-3 pt-3 border-t grid gap-3 max-h-72 overflow-y-auto">
              {searching ? (
                <div className="py-4 text-center text-xs text-muted-foreground">Searching 360° database…</div>
              ) : (
                <>
                  {/* Matching Employees */}
                  {(searchResults?.employees?.length ?? 0) > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 text-primary" />
                        <span>Employee 360° Passbooks</span>
                      </p>
                      <div className="grid gap-1">
                        {searchResults?.employees.map((emp) => (
                          <div
                            key={emp.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              setSearchQuery("");
                              setSearchResults(null);
                              navigate("employees", { id: emp.id });
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                setSearchQuery("");
                                setSearchResults(null);
                                navigate("employees", { id: emp.id });
                              }
                            }}
                            className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/80 transition-colors cursor-pointer text-xs"
                          >
                            <div className="min-w-0">
                              <p className="font-semibold text-foreground truncate">{emp.fullName} <span className="font-normal text-muted-foreground">({emp.code})</span></p>
                              <p className="text-[11px] text-muted-foreground">{emp.designation || "Staff"} · {emp.status}</p>
                            </div>
                            <span className="text-[11px] text-primary font-medium shrink-0 flex items-center gap-1">
                              Open Passbook <ArrowRight className="h-3 w-3" />
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Matching Properties */}
                  {(searchResults?.properties?.length ?? 0) > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 text-primary" />
                        <span>Restaurant 360° Ledgers</span>
                      </p>
                      <div className="grid gap-1">
                        {searchResults?.properties.map((prop) => (
                          <div
                            key={prop.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              setSearchQuery("");
                              setSearchResults(null);
                              navigate("properties", { id: prop.id });
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                setSearchQuery("");
                                setSearchResults(null);
                                navigate("properties", { id: prop.id });
                              }
                            }}
                            className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/80 transition-colors cursor-pointer text-xs"
                          >
                            <div className="min-w-0">
                              <p className="font-semibold text-foreground truncate">{prop.name}</p>
                              <p className="text-[11px] text-muted-foreground">{prop.brandName || "Commercial Partner"} · {prop.type || "Property"}</p>
                            </div>
                            <span className="text-[11px] text-primary font-medium shrink-0 flex items-center gap-1">
                              Open Ledger <ArrowRight className="h-3 w-3" />
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Matching Vehicles */}
                  {(searchResults?.vehicles?.length ?? 0) > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                        <Truck className="h-3.5 w-3.5 text-amber-600" />
                        <span>Fleet Vehicles</span>
                      </p>
                      <div className="grid gap-1">
                        {searchResults?.vehicles.map((veh) => (
                          <div
                            key={veh.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              setSearchQuery("");
                              setSearchResults(null);
                              navigate("vehicles", { id: veh.id });
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                setSearchQuery("");
                                setSearchResults(null);
                                navigate("vehicles", { id: veh.id });
                              }
                            }}
                            className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/80 transition-colors cursor-pointer text-xs"
                          >
                            <div className="min-w-0">
                              <p className="font-semibold text-foreground truncate">{veh.name} <span className="font-normal text-muted-foreground">({veh.registrationNumber})</span></p>
                              <p className="text-[11px] text-muted-foreground">{veh.make || "Vehicle"}</p>
                            </div>
                            <span className="text-[11px] text-primary font-medium shrink-0 flex items-center gap-1">
                              Open Vehicle <ArrowRight className="h-3 w-3" />
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* No Results */}
                  {(!searchResults?.employees?.length && !searchResults?.properties?.length && !searchResults?.vehicles?.length) && (
                    <div className="py-3 text-center text-xs text-muted-foreground">
                      No entities matched &quot;{searchQuery}&quot;. Try searching by name, phone, or code.
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <RangeSelector value={range} onChange={setRange} />

      {error && <ErrorState message={error} onRetry={reload} />}

      {loading && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            <Skeleton className="h-64 rounded-xl lg:col-span-2" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
        </div>
      )}

      {!loading && data && !error && (
        <>
          {/* Row 1 — headline stats (with click-to-inspect math formulas) */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6" role="list" aria-label="Key numbers">
            <StatCard
              label="Today Billing"
              value={formatINR(m?.expectedBilling ?? 0, { compact: true })}
              icon={IndianRupee}
              onClick={() => openInspector("billing")}
              hint="Click to inspect formula"
            />
            <StatCard
              label="Collections"
              value={formatINR(m?.received ?? 0, { compact: true })}
              icon={Wallet}
              tone="positive"
              onClick={() => openInspector("collections")}
              hint="Click to inspect formula"
            />
            <StatCard
              label="Outstanding"
              value={formatINR(c?.totalOutstanding ?? 0, { compact: true })}
              icon={Building2}
              tone="negative"
              onClick={() => openInspector("outstanding")}
              hint="Click to inspect formula"
            />
            <StatCard
              label="Employee Payout"
              value={formatINR(m?.payout ?? 0, { compact: true })}
              icon={Users}
              onClick={() => openInspector("payout")}
              hint="Click to inspect formula"
            />
            <StatCard
              label="Transport Revenue"
              value={formatINR(t?.revenue ?? 0, { compact: true })}
              icon={Truck}
              tone="transport"
              onClick={() => openInspector("transport")}
              hint="Click to inspect formula"
            />
            <StatCard
              label="Net Result"
              value={formatINR(net, { compact: true })}
              icon={Landmark}
              tone={net >= 0 ? "positive" : "negative"}
              onClick={() => openInspector("net")}
              hint="Click to inspect formula"
            />
          </div>

          {/* Pillar 3: Visual Interactive Money Flow Pipeline */}
          <Card className="border border-border/80 bg-gradient-to-br from-card via-card to-muted/20 shadow-sm overflow-hidden">
            <CardHeader className="pb-3 border-b border-border/50 bg-muted/20">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                      <Layers className="h-4 w-4" />
                    </div>
                    <CardTitle className="text-sm sm:text-base font-semibold">
                      Garuda Interactive Money Flow Pipeline
                    </CardTitle>
                    <Badge variant="outline" className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 border-emerald-500/30 bg-emerald-500/10">
                      Live Flow
                    </Badge>
                  </div>
                  <CardDescription className="text-xs">
                    Visual journey from invoiced revenue to bank collections, operating expenses, and net surplus. Click any card to inspect the exact arithmetic.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setReconciliationOpen(true)}
                  >
                    <HelpCircle className="h-3.5 w-3.5 text-primary" />
                    <span>How calculations work</span>
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-5">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 relative">
                {/* Step 1: Gross Invoiced */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => openInspector("billing")}
                  onKeyDown={(e) => { if (e.key === "Enter") openInspector("billing"); }}
                  className="p-3.5 rounded-xl border border-blue-500/30 bg-blue-500/5 hover:bg-blue-500/10 transition-all cursor-pointer group flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-1.5">
                      <span className="text-[11px] font-bold tracking-wider uppercase text-blue-700 dark:text-blue-300">
                        1. Invoiced Revenue
                      </span>
                      <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-blue-400/30 text-blue-600 dark:text-blue-400">
                        Accrual
                      </Badge>
                    </div>
                    <p className="text-xl font-extrabold tracking-tight text-foreground tabular-nums">
                      {formatINR((m?.expectedBilling ?? 0) + (t?.revenue ?? 0))}
                    </p>
                    <div className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
                      <div className="flex justify-between">
                        <span>Manpower Billing:</span>
                        <span className="font-semibold text-foreground">{formatINR(m?.expectedBilling ?? 0)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Transport Rentals:</span>
                        <span className="font-semibold text-foreground">{formatINR(t?.revenue ?? 0)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 pt-2 border-t border-blue-500/20 flex items-center justify-between text-[11px] text-blue-600 dark:text-blue-400 font-medium group-hover:underline">
                    <span>Inspect rate math</span>
                    <ArrowRight className="h-3 w-3" />
                  </div>
                </div>

                {/* Step 2: Realization & Receivables */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => openInspector("collections")}
                  onKeyDown={(e) => { if (e.key === "Enter") openInspector("collections"); }}
                  className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10 transition-all cursor-pointer group flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-1.5">
                      <span className="text-[11px] font-bold tracking-wider uppercase text-emerald-700 dark:text-emerald-300">
                        2. Cash Realized
                      </span>
                      <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-emerald-400/30 text-emerald-600 dark:text-emerald-400">
                        Bank + Cash
                      </Badge>
                    </div>
                    <p className="text-xl font-extrabold tracking-tight text-emerald-700 dark:text-emerald-400 tabular-nums">
                      {formatINR((m?.received ?? 0) + (t?.received ?? 0))}
                    </p>
                    <div className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
                      <div className="flex justify-between">
                        <span>Collected Inflow:</span>
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">{formatINR(m?.received ?? 0)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Pending Collection:</span>
                        <span className="font-semibold text-amber-600 dark:text-amber-400">{formatINR(c?.totalOutstanding ?? 0)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 pt-2 border-t border-emerald-500/20 flex items-center justify-between text-[11px] text-emerald-700 dark:text-emerald-400 font-medium group-hover:underline">
                    <span>Inspect payment dates</span>
                    <ArrowRight className="h-3 w-3" />
                  </div>
                </div>

                {/* Step 3: Direct Operating Costs */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => openInspector("payout")}
                  onKeyDown={(e) => { if (e.key === "Enter") openInspector("payout"); }}
                  className="p-3.5 rounded-xl border border-rose-500/30 bg-rose-500/5 hover:bg-rose-500/10 transition-all cursor-pointer group flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-1.5">
                      <span className="text-[11px] font-bold tracking-wider uppercase text-rose-700 dark:text-rose-300">
                        3. Operations & Labor
                      </span>
                      <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-rose-400/30 text-rose-600 dark:text-rose-400">
                        Outflows
                      </Badge>
                    </div>
                    <p className="text-xl font-extrabold tracking-tight text-foreground tabular-nums">
                      {formatINR((m?.payout ?? 0) + (m?.expenses ?? 0) + (t?.expenses ?? 0))}
                    </p>
                    <div className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
                      <div className="flex justify-between">
                        <span>Employee Net Payout:</span>
                        <span className="font-semibold text-foreground">{formatINR(m?.payout ?? 0)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Fleet & Biz OpEx:</span>
                        <span className="font-semibold text-foreground">{formatINR((m?.expenses ?? 0) + (t?.expenses ?? 0))}</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 pt-2 border-t border-rose-500/20 flex items-center justify-between text-[11px] text-rose-600 dark:text-rose-400 font-medium group-hover:underline">
                    <span>Inspect wage breakdowns</span>
                    <ArrowRight className="h-3 w-3" />
                  </div>
                </div>

                {/* Step 4: Net Surplus */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => openInspector("net")}
                  onKeyDown={(e) => { if (e.key === "Enter") openInspector("net"); }}
                  className={cn(
                    "p-3.5 rounded-xl border transition-all cursor-pointer group flex flex-col justify-between",
                    net >= 0
                      ? "border-primary/40 bg-primary/5 hover:bg-primary/10"
                      : "border-red-500/40 bg-red-500/5 hover:bg-red-500/10"
                  )}
                >
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-1.5">
                      <span className={cn(
                        "text-[11px] font-bold tracking-wider uppercase",
                        net >= 0 ? "text-primary" : "text-red-700 dark:text-red-400"
                      )}>
                        4. Net Operating Surplus
                      </span>
                      <Badge variant="outline" className={cn(
                        "text-[9px] px-1 py-0 h-4",
                        net >= 0 ? "border-primary/30 text-primary" : "border-red-400/30 text-red-600"
                      )}>
                        {net >= 0 ? "Retained Surplus" : "Deficit"}
                      </Badge>
                    </div>
                    <p className={cn(
                      "text-xl font-extrabold tracking-tight tabular-nums",
                      net >= 0 ? "text-primary" : "text-red-600 dark:text-red-400"
                    )}>
                      {formatINR(net)}
                    </p>
                    <div className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
                      <div className="flex justify-between">
                        <span>Manpower Margin:</span>
                        <span className="font-semibold text-foreground">{formatINR(m?.grossMargin ?? 0)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Transport Net:</span>
                        <span className="font-semibold text-foreground">{formatINR(data?.combined.transportNet ?? 0)}</span>
                      </div>
                    </div>
                  </div>
                  <div className={cn(
                    "mt-3 pt-2 border-t flex items-center justify-between text-[11px] font-medium group-hover:underline",
                    net >= 0 ? "border-primary/20 text-primary" : "border-red-500/20 text-red-600 dark:text-red-400"
                  )}>
                    <span>Inspect complete P&L</span>
                    <ArrowRight className="h-3 w-3" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* First-run setup checklist — self-hides once the business is set up */}
          <OnboardingChecklist navigate={navigate} />

          {/* Row 2 — 14-day performance trend + expense split */}
          <section className="grid gap-3 lg:grid-cols-3" aria-label="Trends">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Activity className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                      {tr(lang, "dash.trend")}
                    </CardTitle>
                    <CardDescription className="text-xs">Manpower billing · collections · transport revenue</CardDescription>
                  </div>
                  <Button variant="ghost" size="sm" className="h-8 shrink-0 text-xs" onClick={() => navigate("reports")}>{tr(lang, "common.reports")}</Button>
                </div>
              </CardHeader>
              <CardContent>
                {trendLoading ? (
                  <Skeleton className="h-44 w-full rounded-lg sm:h-52 lg:h-60" />
                ) : (
                  <AreaTrend
                    data={(trend?.trend ?? []) as unknown as Record<string, unknown>[]}
                    xKey="date"
                    className="h-44 sm:h-52 lg:h-60"
                    series={[
                      { key: "billing", label: "Manpower billing", color: CHART_COLORS.emerald },
                      { key: "collections", label: "Collections", color: CHART_COLORS.teal },
                      { key: "transport", label: "Transport revenue", color: CHART_COLORS.amber },
                    ]}
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <PieChartIcon className="h-4 w-4 text-primary" aria-hidden />
                  {tr(lang, "dash.expenseSplit")}
                </CardTitle>
                <CardDescription className="text-xs">This range, by business</CardDescription>
              </CardHeader>
              <CardContent>
                {expenseTotal === 0 ? (
                  <p className="flex h-44 items-center justify-center text-center text-xs text-muted-foreground sm:h-52 lg:h-60">
                    No expenses recorded in this range
                  </p>
                ) : (
                  <div className="relative h-44 sm:h-52 lg:h-60">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={expenseSplit}
                          dataKey="value"
                          nameKey="name"
                          innerRadius="64%"
                          outerRadius="88%"
                          paddingAngle={3}
                          strokeWidth={0}
                        >
                          {expenseSplit.map((d) => (
                            <Cell key={d.name} fill={d.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v) => formatINR(Number(v))} contentStyle={TOOLTIP_STYLE} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total</p>
                      <p className="text-sm font-bold tabular-nums">{formatINR(expenseTotal, { compact: true })}</p>
                    </div>
                  </div>
                )}
                {expenseTotal > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {expenseSplit.map((d) => (
                      <div key={d.name} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <span className="h-2 w-2 rounded-full" style={{ background: d.color }} aria-hidden />
                          {d.name}
                        </span>
                        <span className="font-semibold tabular-nums">
                          {formatINR(d.value, { compact: true })}
                          <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">
                            {Math.round((d.value / expenseTotal) * 100)}%
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          {/* Contractor commission cards — today + this month, per contractor */}
          {(contractorsData?.contractors?.length ?? 0) > 0 && (
            <section aria-label="Contractor commissions">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-muted-foreground">Contractor commissions — today & this month</p>
                <Button variant="ghost" size="sm" className="h-8 shrink-0 text-xs" onClick={() => navigate("reports")}>Reports</Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {contractorsData!.contractors.map((ctr) => (
                  <Card key={ctr.name} className="border-amber-200/60 dark:border-amber-900">
                    <CardHeader className="pb-2">
                      <div className="flex items-center gap-3">
                        <div className="shrink-0 rounded-xl bg-amber-100 p-2 dark:bg-amber-950">
                          <HardHat className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden />
                        </div>
                        <div className="min-w-0">
                          <CardTitle className="truncate text-base">{ctr.name}</CardTitle>
                          <p className="truncate text-xs text-muted-foreground">{ctr.employees.length} employee{ctr.employees.length === 1 ? "" : "s"} · {ctr.monthDeployments} deployment{ctr.monthDeployments === 1 ? "" : "s"} this month</p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-xl bg-muted/60 p-2.5 text-center">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Today</p>
                          <p className="text-sm font-bold tabular-nums">{formatINR(ctr.todayCommission, { compact: true })}</p>
                          <p className="text-[10px] tabular-nums text-muted-foreground">{ctr.todayDeployments} deployment{ctr.todayDeployments === 1 ? "" : "s"}</p>
                        </div>
                        <div className="rounded-xl bg-amber-50 p-2.5 text-center dark:bg-amber-950/40">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">This month</p>
                          <p className="text-sm font-bold tabular-nums text-amber-700 dark:text-amber-300">{formatINR(ctr.monthCommission, { compact: true })}</p>
                          <p className="text-[10px] tabular-nums text-muted-foreground">commission</p>
                        </div>
                      </div>
                      <p className="mt-2 truncate text-[11px] text-muted-foreground" title={ctr.employees.join(", ")}>
                        Via: {ctr.employees.join(", ")}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {/* Business split */}
          <section aria-label="Business split" className="grid gap-3 md:grid-cols-2">
            <Card className="border-emerald-200/70 dark:border-emerald-900">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <div className="shrink-0 rounded-xl bg-emerald-100 p-2 dark:bg-emerald-950">
                    <Users className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="text-base">Manpower Business</CardTitle>
                    <p className="text-xs text-muted-foreground">Staffing · deployments · payroll</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-0.5">
                <div className="flex justify-between py-1 text-sm"><span className="text-muted-foreground">Expected billing</span><span className="font-semibold tabular-nums">{formatINR(m?.expectedBilling ?? 0)}</span></div>
                {(m?.rentIncome ?? 0) > 0 && (
                  <div className="flex justify-between py-1 text-sm"><span className="text-muted-foreground">Employee rent (income)</span><span className="font-semibold tabular-nums text-teal-600 dark:text-teal-400">+{formatINR(m?.rentIncome ?? 0)}</span></div>
                )}
                <div className="flex justify-between py-1 text-sm"><span className="text-muted-foreground">Employee cost</span><span className="font-semibold tabular-nums">{formatINR(m?.payout ?? 0)}</span></div>
                {(m?.salary ?? 0) > 0 && (
                  <p className="pb-0.5 text-[10px] tabular-nums text-muted-foreground">
                    incl. salary {formatINR(m?.salary ?? 0)}{(m?.overtime ?? 0) > 0 ? ` + overtime ${formatINR(m?.overtime ?? 0)}` : ""}{(m?.contractorCut ?? 0) > 0 ? ` · contractor cut ${formatINR(m?.contractorCut ?? 0)}` : ""}
                  </p>
                )}
                <div className="flex justify-between py-1 text-sm"><span className="text-muted-foreground">Gross margin</span><span className={cn("font-semibold tabular-nums", (m?.grossMargin ?? 0) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>{formatINR(m?.grossMargin ?? 0)}</span></div>
                <div className="flex justify-between py-1 text-sm"><span className="text-muted-foreground">Other expenses</span><span className="font-semibold tabular-nums">{formatINR(m?.expenses ?? 0)}</span></div>
                <div className="flex justify-between border-t pt-1.5 text-sm"><span className="text-muted-foreground">Net result</span><span className="font-bold tabular-nums">{formatINR((m?.grossMargin ?? 0) + (m?.rentIncome ?? 0) - (m?.expenses ?? 0))}</span></div>
                <Button variant="outline" size="sm" className="mt-3 h-9 w-full gap-1 sm:w-auto" onClick={() => navigate("manpower")}>
                  View details <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </CardContent>
            </Card>

            <Card className="border-amber-200/70 dark:border-amber-900">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <div className="shrink-0 rounded-xl bg-amber-100 p-2 dark:bg-amber-950">
                    <Truck className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="text-base">Transport Business</CardTitle>
                    <p className="text-xs text-muted-foreground">Vehicles · trips & rentals</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-0.5">
                <div className="flex justify-between py-1 text-sm"><span className="text-muted-foreground">Revenue</span><span className="font-semibold tabular-nums">{formatINR(t?.revenue ?? 0)}</span></div>
                <div className="flex justify-between py-1 text-sm"><span className="text-muted-foreground">Expenses</span><span className="font-semibold tabular-nums">{formatINR(t?.expenses ?? 0)}</span></div>
                <div className="flex justify-between py-1 text-sm"><span className="text-muted-foreground">EMI (this month)</span><span className="font-semibold tabular-nums">{formatINR(t?.monthEmi ?? 0)}</span></div>
                <div className="flex justify-between border-t pt-1.5 text-sm"><span className="text-muted-foreground">Net result</span><span className={cn("font-bold tabular-nums", (t?.monthNet ?? 0) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>{formatINR(t?.monthNet ?? 0)}</span></div>
                <div className="flex gap-2 pt-1.5">
                  <Button variant="outline" size="sm" className="mt-1 h-9 flex-1 gap-1 sm:flex-none" onClick={() => navigate("transport")}>
                    View details <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                  <Button variant="outline" size="sm" className="mt-1 h-9 flex-1 gap-1 sm:flex-none" onClick={() => navigate("trips")}>
                    <Route className="h-3.5 w-3.5" aria-hidden />Trips
                  </Button>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Monthly business summary — month-over-month, both businesses */}
          {monthlyLoading ? (
            <Card>
              <CardContent className="space-y-3 p-4 sm:p-6">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-9 w-40 rounded-full" />
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
                </div>
                <Skeleton className="h-9 w-full rounded-lg" />
              </CardContent>
            </Card>
          ) : monthly ? (
            <div className="print-area space-y-2">
              {/* Print-only header (hidden on screen) */}
              <div className="hidden print:block">
                <h1 className="text-lg font-bold">Monthly business summary — BizHub</h1>
                <p className="text-xs">Month: {monthShort(monthly.month)} (compared with {monthShort(monthly.prevMonth)})</p>
                <p className="text-xs">Generated {new Date().toLocaleString("en-IN")}</p>
                <hr className="my-2" />
              </div>
              <Card className="overflow-hidden border-primary/20">
                <div className="h-0.5 w-full bg-gradient-to-r from-emerald-500/70 via-teal-500/70 to-amber-500/70" aria-hidden />
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0 space-y-0.5">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <CalendarRange className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                        {tr(lang, "dash.monthlySummary")}
                      </CardTitle>
                      <CardDescription className="text-xs">
                        {monthShort(monthly.prevMonth)} → {monthShort(monthly.month)} · {tr(lang, "dash.bothBusinesses")}
                      </CardDescription>
                    </div>
                    <div className="no-print flex shrink-0 items-center gap-1.5">
                    <MonthPicker month={summaryMonth} onChange={setSummaryMonth} className="scale-95" />
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 transition-colors hover:border-primary/40 hover:text-primary"
                      onClick={() => window.print()}
                      aria-label="Print or save this summary as PDF"
                      title="Print / Save PDF"
                    >
                      <Printer className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                  </div>
                </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                  {([
                    { label: "Manpower billing", value: monthly.current.manpowerBilling, prev: monthly.previous.manpowerBilling, goodUp: true, icon: Users, cls: "text-emerald-600 dark:text-emerald-400" },
                    { label: "Collections", value: monthly.current.collections, prev: monthly.previous.collections, goodUp: true, icon: Wallet, cls: "text-teal-600 dark:text-teal-400" },
                    { label: "Transport revenue", value: monthly.current.transportRevenue, prev: monthly.previous.transportRevenue, goodUp: true, icon: Truck, cls: "text-amber-600 dark:text-amber-400" },
                    { label: "Total expenses", value: monthly.current.manpowerOtherExpenses + monthly.current.transportOpex + monthly.current.transportEmi, prev: monthly.previous.manpowerOtherExpenses + monthly.previous.transportOpex + monthly.previous.transportEmi, goodUp: false, icon: Receipt, cls: "text-red-600 dark:text-red-400" },
                    { label: "Net result", value: monthly.current.net, prev: monthly.previous.net, goodUp: true, icon: Landmark, cls: "" },
                  ] as const).map((row) => (
                    <div key={row.label} className="rounded-xl border bg-muted/30 p-3 transition-colors hover:bg-muted/50">
                      <div className="flex items-center justify-between gap-1">
                        <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                          <row.icon className={cn("h-3.5 w-3.5 shrink-0", row.cls)} aria-hidden />
                          <span className="truncate">{row.label}</span>
                        </span>
                        <Delta pct={pctOf(row.value, row.prev)} goodUp={row.goodUp} />
                      </div>
                      <p className="mt-1 text-base font-bold tabular-nums">{formatINR(row.value, { compact: true })}</p>
                      <p className="text-[10px] tabular-nums text-muted-foreground">was {formatINR(row.prev, { compact: true })}</p>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
                    <CalendarCheck className="h-3 w-3 text-emerald-600 dark:text-emerald-400" aria-hidden />
                    {monthly.current.deployments} deployment{monthly.current.deployments === 1 ? "" : "s"}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
                    <Route className="h-3 w-3 text-amber-600 dark:text-amber-400" aria-hidden />
                    {monthly.current.trips} trip{monthly.current.trips === 1 ? "" : "s"}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
                    <CalendarDays className="h-3 w-3" aria-hidden />
                    advances {formatINR(monthly.current.advances, { compact: true })}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
                    EMI {formatINR(monthly.current.transportEmi, { compact: true })}
                  </span>
                  {(monthly.current.rentIncome ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 tabular-nums text-teal-700 dark:bg-teal-950/60 dark:text-teal-300">
                      <Home className="h-3 w-3" aria-hidden />rent in {formatINR(monthly.current.rentIncome ?? 0, { compact: true })}
                    </span>
                  )}
                  {(monthly.current.contractorCut ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 tabular-nums text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                      <HardHat className="h-3 w-3" aria-hidden />contractor {formatINR(monthly.current.contractorCut ?? 0, { compact: true })}
                    </span>
                  )}
                </div>
                {monthly.insights.length > 0 && (
                  <div
                    className="flex items-start gap-2 rounded-xl border border-primary/20 bg-gradient-to-r from-primary/5 via-primary/[0.03] to-transparent p-3 print:border-border print:bg-transparent"
                    role="note"
                    aria-label="Automated insights"
                  >
                    <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                    <ul className="min-w-0 space-y-0.5">
                      {monthly.insights.map((line) => (
                        <li key={line} className="text-xs leading-relaxed text-foreground/80">{line}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-muted-foreground">
                  <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                  {monthly.note}
                </p>
              </CardContent>
              </Card>
            </div>
          ) : null}

          {/* Collections + attention */}
          <section className="grid gap-3 lg:grid-cols-2" aria-label="Collections and attention">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{tr(lang, "dash.collections")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl bg-muted/60 p-3 text-center">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Billed</p>
                    <p className="text-sm font-bold tabular-nums">{formatINR(c?.totalBilled ?? 0, { compact: true })}</p>
                  </div>
                  <div className="rounded-xl bg-emerald-50 p-3 text-center dark:bg-emerald-950/40">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Received</p>
                    <p className="text-sm font-bold tabular-nums text-emerald-700 dark:text-emerald-300">{formatINR(c?.totalReceived ?? 0, { compact: true })}</p>
                  </div>
                  <div className="rounded-xl bg-red-50 p-3 text-center dark:bg-red-950/40">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Outstanding</p>
                    <p className="text-sm font-bold tabular-nums text-red-600 dark:text-red-400">{formatINR(c?.totalOutstanding ?? 0, { compact: true })}</p>
                  </div>
                </div>
                <p className="mb-1.5 mt-4 text-xs font-medium text-muted-foreground">Top pending properties</p>
                <div className="space-y-1">
                  {(c?.byProperty ?? []).slice(0, 5).map((p) => (
                    <button
                      key={p.propertyId}
                      type="button"
                      onClick={() => navigate("property-detail", { id: p.propertyId })}
                      className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-muted/60"
                    >
                      <span className="min-w-0 truncate">{p.propertyName}</span>
                      <span className="shrink-0 font-semibold tabular-nums text-red-600 dark:text-red-400">{formatINR(p.outstanding, { compact: true })}</span>
                    </button>
                  ))}
                  {(c?.byProperty?.length ?? 0) === 0 && (
                    <p className="py-3 text-center text-xs text-muted-foreground">Nothing pending — all collected</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="min-w-0 text-base">{tr(lang, "dash.attention")}</CardTitle>
                  <Button variant="ghost" size="sm" className="h-8 shrink-0 text-xs" onClick={() => navigate("notifications")}>{tr(lang, "common.viewAll")}</Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {(data.attention ?? []).length === 0 && (
                  <p className="py-6 text-center text-xs text-muted-foreground">All clear — nothing needs your attention</p>
                )}
                {(data.attention ?? []).map((n) => {
                  const sev = SEVERITY_STYLE[n.severity] ?? SEVERITY_STYLE.INFO;
                  const Icon = sev.icon;
                  return (
                    <button
                      key={n.key}
                      type="button"
                      onClick={() => n.view && navigate(n.view, n.params)}
                      className="flex w-full items-start gap-2.5 rounded-lg border p-2.5 text-left transition-colors hover:bg-muted/60"
                    >
                      <span className={cn("rounded-lg p-1.5", sev.cls)} aria-hidden><Icon className="h-3.5 w-3.5" /></span>
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-semibold">{n.title}</span>
                        <span className="mt-0.5 line-clamp-2 block text-[11px] text-muted-foreground">{n.message}</span>
                      </span>
                    </button>
                  );
                })}
              </CardContent>
            </Card>
          </section>

          {/* Recent activity */}
          <section aria-label="Recent activity">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <History className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                      {tr(lang, "dash.activity")}
                    </CardTitle>
                    <CardDescription className="text-xs">Latest actions across both businesses — fully audited</CardDescription>
                  </div>
                  <Button variant="ghost" size="sm" className="h-8 shrink-0 text-xs" onClick={() => navigate("audit")}>{tr(lang, "common.viewAll")}</Button>
                </div>
              </CardHeader>
              <CardContent>
                {auditLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
                  </div>
                ) : (
                  <ul className="divide-y">
                    {(audit?.items ?? []).map((a) => (
                      <li key={a.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                        <Badge
                          variant="secondary"
                          className={cn("w-[68px] shrink-0 justify-center text-[10px] font-semibold", ACTION_BADGE[a.action] ?? "bg-muted text-muted-foreground")}
                        >
                          {a.action}
                        </Badge>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium">
                            {a.recordLabel || a.module}
                            <span className="ml-1.5 font-normal text-muted-foreground">· {a.module}</span>
                          </p>
                          <p className="truncate text-[11px] text-muted-foreground">{a.ownerName}</p>
                        </div>
                        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{fmtRel(a.createdAt)}</span>
                      </li>
                    ))}
                    {(audit?.items?.length ?? 0) === 0 && (
                      <li className="py-4 text-center text-xs text-muted-foreground">No activity yet</li>
                    )}
                  </ul>
                )}
              </CardContent>
            </Card>
          </section>

          {/* Quick actions */}
          <section aria-label="Quick actions">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Quick actions</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {QUICK_ACTIONS.map((a) => (
                <Button
                  key={a.view + a.label}
                  variant="outline"
                  className="h-auto min-h-11 flex-col gap-1.5 py-2.5"
                  onClick={() => navigate(a.view)}
                >
                  <a.icon className="h-4 w-4 text-primary" aria-hidden />
                  <span className="text-xs font-medium leading-none">{a.label}</span>
                </Button>
              ))}
            </div>
          </section>
        </>
      )}

      {/* Universal Formula Inspector Dialog */}
      <FormulaInspectorDialog
        open={Boolean(inspectorData)}
        onOpenChange={(open) => {
          if (!open) setInspectorData(null);
        }}
        data={inspectorData}
      />

      {/* Universal Zero-Mismatch Reconciliation Center Dialog */}
      <ReconciliationCenterDialog
        open={reconciliationOpen}
        onOpenChange={setReconciliationOpen}
        onNavigate={navigate}
      />
    </div>
  );
}
