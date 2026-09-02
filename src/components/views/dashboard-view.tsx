"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { formatINR } from "@/lib/money";
import type { ViewProps } from "@/components/view-types";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { RangeSelector, type RangeKey } from "@/components/shared/filters";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  Users, Truck, Wallet, IndianRupee, Landmark, CalendarCheck, Receipt, HandCoins, ReceiptText,
  Route, AlertTriangle, AlertCircle, Info, ChevronRight, Building2,
} from "lucide-react";
import { ErrorState, useAsync } from "./_shared";

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
    grossMargin: number; received: number; pending: number; advancesGiven: number; expenses: number;
    dayShifts: number; nightShifts: number; deployments: number;
  };
  transport: {
    availableVehicles: number; onTripVehicles: number; revenue: number; expenses: number;
    received: number; pending: number; monthRevenue: number; monthExpense: number;
    monthEmi: number; monthNet: number;
  };
  combined: { revenue: number; expenses: number; net: number; manpowerMargin: number; transportNet: number };
  collections: {
    totalBilled: number; totalReceived: number; totalOutstanding: number;
    byProperty: { propertyId: string; propertyName: string; outstanding: number }[];
  };
  attention: AttentionItem[];
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

export default function DashboardView({ navigate }: ViewProps) {
  const [range, setRange] = useState<RangeKey>("today");
  const { data, loading, error, reload } = useAsync<SummaryResp>(
    () => api.get<SummaryResp>("/api/dashboard/summary" + (range !== "custom" ? `?range=${range}` : `?range=month`)),
    [range]
  );

  const m = data?.manpower;
  const t = data?.transport;
  const c = data?.collections;
  const net = data?.combined.net ?? 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dashboard"
        subtitle="Both businesses at a glance"
        actions={<Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => navigate("reports")}>
          <Landmark className="h-3.5 w-3.5" aria-hidden />Reports
        </Button>}
      />

      <RangeSelector value={range} onChange={setRange} />

      {error && <ErrorState message={error} onRetry={reload} />}

      {loading && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Skeleton className="h-48 rounded-xl" />
            <Skeleton className="h-48 rounded-xl" />
          </div>
        </div>
      )}

      {!loading && data && !error && (
        <>
          {/* Row 1 — headline stats */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6" role="list" aria-label="Key numbers">
            <StatCard label="Today Billing" value={formatINR(m?.expectedBilling ?? 0, { compact: true })} icon={IndianRupee} onClick={() => navigate("manpower")} hint="Manpower expected" />
            <StatCard label="Collections" value={formatINR(m?.received ?? 0, { compact: true })} icon={Wallet} tone="positive" onClick={() => navigate("payments")} hint="Received in range" />
            <StatCard label="Outstanding" value={formatINR(c?.totalOutstanding ?? 0, { compact: true })} icon={Building2} tone="negative" onClick={() => navigate("payments")} hint="All properties" />
            <StatCard label="Employee Payout" value={formatINR(m?.payout ?? 0, { compact: true })} icon={Users} onClick={() => navigate("manpower")} hint={`${m?.deployments ?? 0} deployments`} />
            <StatCard label="Transport Revenue" value={formatINR(t?.revenue ?? 0, { compact: true })} icon={Truck} tone="transport" onClick={() => navigate("transport")} hint={`${t?.onTripVehicles ?? 0} on trip`} />
            <StatCard label="Net Result" value={formatINR(net, { compact: true })} icon={Landmark} tone={net >= 0 ? "positive" : "negative"} onClick={() => navigate("reports")} hint="Revenue − all expenses" />
          </div>

          {/* Business split */}
          <section aria-label="Business split" className="grid gap-3 md:grid-cols-2">
            <Card className="border-emerald-200/70 dark:border-emerald-900">
              <CardHeader className="flex-row items-center gap-3 space-y-0 pb-2">
                <div className="rounded-xl bg-emerald-100 p-2 dark:bg-emerald-950">
                  <Users className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
                </div>
                <div>
                  <CardTitle className="text-base">Manpower Business</CardTitle>
                  <p className="text-xs text-muted-foreground">Staffing · deployments · payroll</p>
                </div>
              </CardHeader>
              <CardContent className="space-y-0.5">
                <div className="flex justify-between py-1 text-sm"><span className="text-muted-foreground">Expected billing</span><span className="font-semibold tabular-nums">{formatINR(m?.expectedBilling ?? 0)}</span></div>
                <div className="flex justify-between py-1 text-sm"><span className="text-muted-foreground">Employee payout</span><span className="font-semibold tabular-nums">{formatINR(m?.payout ?? 0)}</span></div>
                <div className="flex justify-between py-1 text-sm"><span className="text-muted-foreground">Gross margin</span><span className={cn("font-semibold tabular-nums", (m?.grossMargin ?? 0) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>{formatINR(m?.grossMargin ?? 0)}</span></div>
                <div className="flex justify-between py-1 text-sm"><span className="text-muted-foreground">Other expenses</span><span className="font-semibold tabular-nums">{formatINR(m?.expenses ?? 0)}</span></div>
                <div className="flex justify-between border-t pt-1.5 text-sm"><span className="text-muted-foreground">Net result</span><span className="font-bold tabular-nums">{formatINR((m?.grossMargin ?? 0) - (m?.expenses ?? 0))}</span></div>
                <Button variant="outline" size="sm" className="mt-3 h-9 w-full gap-1 sm:w-auto" onClick={() => navigate("manpower")}>
                  View details <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </CardContent>
            </Card>

            <Card className="border-amber-200/70 dark:border-amber-900">
              <CardHeader className="flex-row items-center gap-3 space-y-0 pb-2">
                <div className="rounded-xl bg-amber-100 p-2 dark:bg-amber-950">
                  <Truck className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden />
                </div>
                <div>
                  <CardTitle className="text-base">Transport Business</CardTitle>
                  <p className="text-xs text-muted-foreground">Vehicles · trips & rentals</p>
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

          {/* Collections + attention */}
          <section className="grid gap-3 lg:grid-cols-2" aria-label="Collections and attention">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Collections</CardTitle>
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
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-base">Needs attention</CardTitle>
                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => navigate("notifications")}>View all</Button>
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
    </div>
  );
}
