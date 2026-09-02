"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { formatINR } from "@/lib/money";
import type { ViewProps } from "@/components/view-types";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { RangeSelector, type RangeKey } from "@/components/shared/filters";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  CalendarCheck, Users, Building2, IndianRupee, Wallet, HandCoins, Receipt, TrendingDown,
  Sun, Moon, AlertTriangle, Grid3X3,
} from "lucide-react";
import { AreaTrend, CHART_COLORS, ErrorState, useAsync } from "./_shared";

interface ManpowerBlock {
  employeesDeployed: number; propertiesServed: number; expectedBilling: number; payout: number;
  grossMargin: number; received: number; pending: number; advancesGiven: number; expenses: number;
  dayShifts: number; nightShifts: number; deployments: number;
}
interface ByPropertyRow {
  propertyId: string; propertyName: string; billing: number; payout: number; margin: number;
  received: number; outstanding: number;
}
interface Resp {
  manpower?: ManpowerBlock;
  trend: { date: string; billing: number; payout: number; margin: number }[];
  byProperty: ByPropertyRow[];
  topOwedProperty?: { propertyId: string; propertyName: string; outstanding: number } | null;
}

interface HeatResp {
  days: number;
  dates: string[];
  rows: {
    propertyId: string; propertyName: string; total: number;
    cells: { date: string; shifts: number }[];
  }[];
  unlistedShifts: number;
}

// Intensity scale for the heat-map: 0 = empty, then 4 emerald steps.
const HEAT_STEPS = [
  "bg-muted/60",
  "bg-emerald-200/70 dark:bg-emerald-900/60",
  "bg-emerald-300/80 dark:bg-emerald-800/80",
  "bg-emerald-500/85 dark:bg-emerald-700",
  "bg-emerald-600 dark:bg-emerald-600",
];

function heatClass(n: number, max: number): string {
  if (n <= 0) return HEAT_STEPS[0];
  const level = Math.min(4, Math.max(1, Math.ceil((n / Math.max(1, max)) * 4)));
  return HEAT_STEPS[level];
}

export default function ManpowerDashboardView({ navigate }: ViewProps) {
  const [range, setRange] = useState<RangeKey>("today");
  const { data, loading, error, reload } = useAsync<Resp>(
    () => api.get<Resp>(`/api/dashboard/manpower?range=${range}`),
    [range]
  );
  const { data: heat, loading: heatLoading } = useAsync<HeatResp>(
    () => api.get<HeatResp>("/api/dashboard/manpower-heatmap?days=14"),
    []
  );

  const m = data?.manpower;
  const day = m?.dayShifts ?? 0;
  const night = m?.nightShifts ?? 0;
  const total = day + night;
  const dayPct = total > 0 ? Math.round((day / total) * 100) : 0;

  const columns: Column<ByPropertyRow>[] = [
    {
      key: "propertyName", label: "Property", primary: true,
      render: (r) => <span className="font-medium">{r.propertyName}</span>,
      value: (r) => r.propertyName,
    },
    { key: "billing", label: "Billing", className: "text-right", value: (r) => formatINR(r.billing) },
    { key: "payout", label: "Payout", className: "text-right", value: (r) => formatINR(r.payout) },
    {
      key: "margin", label: "Margin", className: "text-right",
      render: (r) => <span className={r.margin >= 0 ? "tabular-nums text-emerald-600 dark:text-emerald-400" : "tabular-nums text-red-600 dark:text-red-400"}>{formatINR(r.margin)}</span>,
      value: (r) => formatINR(r.margin),
    },
    { key: "received", label: "Received", className: "text-right", value: (r) => formatINR(r.received) },
    {
      key: "outstanding", label: "Outstanding", className: "text-right",
      render: (r) => <span className="tabular-nums font-medium text-red-600 dark:text-red-400">{formatINR(r.outstanding)}</span>,
      value: (r) => formatINR(r.outstanding),
    },
  ];

  const trend = (data?.trend ?? []).map((t) => ({
    date: t.date.slice(5),
    billing: t.billing,
    payout: t.payout,
    margin: t.margin,
  }));

  return (
    <div className="space-y-5">
      <PageHeader title="Manpower" subtitle="Staffing business control center" />

      <RangeSelector value={range} onChange={setRange} />

      {error && <ErrorState message={error} onRetry={reload} />}

      {loading && (
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      )}

      {!loading && data && !error && (
        <>
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
            <StatCard label="Employees Deployed" value={String(m?.employeesDeployed ?? 0)} icon={Users} onClick={() => navigate("deployments")} />
            <StatCard label="Properties Served" value={String(m?.propertiesServed ?? 0)} icon={Building2} onClick={() => navigate("properties")} />
            <StatCard label="Expected Billing" value={formatINR(m?.expectedBilling ?? 0, { compact: true })} icon={IndianRupee} tone="info" onClick={() => navigate("deployments")} />
            <StatCard label="Employee Payout" value={formatINR(m?.payout ?? 0, { compact: true })} icon={TrendingDown} onClick={() => navigate("settlements")} />
            <StatCard label="Gross Margin" value={formatINR(m?.grossMargin ?? 0, { compact: true })} icon={IndianRupee} tone={(m?.grossMargin ?? 0) >= 0 ? "positive" : "negative"} onClick={() => navigate("reports")} />
            <StatCard label="Received" value={formatINR(m?.received ?? 0, { compact: true })} icon={Wallet} tone="positive" onClick={() => navigate("payments")} />
            <StatCard label="Pending" value={formatINR(m?.pending ?? 0, { compact: true })} icon={Wallet} tone="negative" onClick={() => navigate("payments")} />
            <StatCard label="Advances Given" value={formatINR(m?.advancesGiven ?? 0, { compact: true })} icon={HandCoins} tone="warning" onClick={() => navigate("advances")} />
          </div>

          {/* Day / Night split */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Day / Night split</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-xl border bg-amber-50/60 p-3 dark:bg-amber-950/20">
                  <div className="flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-300">
                    <Sun className="h-3.5 w-3.5" aria-hidden />Day shifts
                  </div>
                  <p className="mt-1 text-xl font-bold tabular-nums">{day}</p>
                  <p className="text-[11px] text-muted-foreground">{dayPct}% of shifts</p>
                </div>
                <div className="rounded-xl border bg-slate-50/60 p-3 dark:bg-slate-900/40">
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                    <Moon className="h-3.5 w-3.5" aria-hidden />Night shifts
                  </div>
                  <p className="mt-1 text-xl font-bold tabular-nums">{night}</p>
                  <p className="text-[11px] text-muted-foreground">{100 - dayPct}% of shifts</p>
                </div>
              </div>
              <div className="mt-3">
                <Progress value={dayPct} className="h-2.5" aria-label={`Day share ${dayPct}%`} />
                <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                  <span>Day {dayPct}%</span><span>Night {100 - dayPct}%</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Workforce heat-map — last 14 days × busiest properties */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Grid3X3 className="h-4 w-4 text-primary" aria-hidden />
                Workforce heat-map
              </CardTitle>
              <CardDescription className="text-xs">Shifts per day at the busiest properties — click a cell to inspect deployments</CardDescription>
            </CardHeader>
            <CardContent>
              {heatLoading ? (
                <Skeleton className="h-44 w-full rounded-lg" />
              ) : !heat || heat.rows.length === 0 ? (
                <p className="flex h-32 items-center justify-center text-center text-xs text-muted-foreground">
                  No deployments in the last 14 days
                </p>
              ) : (
                <>
                  <div className="-mx-1 overflow-x-auto px-1 pb-1">
                    <div className="min-w-[560px]">
                      {/* Date header row */}
                      <div className="flex items-end gap-1">
                        <div className="w-28 shrink-0" aria-hidden />
                        {heat.dates.map((d) => (
                          <div key={d} className="flex-1 text-center text-[9px] tabular-nums text-muted-foreground">
                            {d.slice(8)}
                          </div>
                        ))}
                      </div>
                      {/* One row per property */}
                      {heat.rows.map((row) => {
                        const max = Math.max(...heat.rows.map((r) => Math.max(...r.cells.map((c) => c.shifts))));
                        return (
                          <div key={row.propertyId} className="mt-1 flex items-center gap-1">
                            <button
                              type="button"
                              className="w-28 shrink-0 cursor-pointer truncate rounded pr-1 text-left text-[11px] font-medium hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                              title={`${row.propertyName} — open property`}
                              onClick={() => navigate("property-detail", { id: row.propertyId })}
                            >
                              {row.propertyName}
                            </button>
                            {row.cells.map((c) => {
                              const active = c.shifts > 0;
                              return (
                                <button
                                  key={c.date}
                                  type="button"
                                  disabled={!active}
                                  aria-label={
                                    active
                                      ? `${row.propertyName}, ${c.date}: ${c.shifts} shift${c.shifts === 1 ? "" : "s"} — view deployments`
                                      : `${row.propertyName}, ${c.date}: no shifts`
                                  }
                                  className={cn(
                                    "h-6 flex-1 rounded-[4px] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                                    active && "cursor-pointer hover:scale-110 hover:ring-1 hover:ring-primary/40",
                                    !active && "cursor-default",
                                    heatClass(c.shifts, max)
                                  )}
                                  title={
                                    active
                                      ? `${row.propertyName} · ${c.date} · ${c.shifts} shift${c.shifts === 1 ? "" : "s"} — click to view deployments`
                                      : `${row.propertyName} · ${c.date} · no shifts`
                                  }
                                  onClick={
                                    active
                                      ? () => navigate("deployments", { propertyId: row.propertyId, date: c.date })
                                      : undefined
                                  }
                                />
                              );
                            })}
                            <div className="w-7 shrink-0 text-right text-[10px] font-semibold tabular-nums text-muted-foreground">
                              {row.total}
                            </div>
                          </div>
                        );
                      })}
                      {heat.unlistedShifts > 0 && (
                        <p className="mt-2 text-[10px] text-muted-foreground">+ {heat.unlistedShifts} more shifts at other properties</p>
                      )}
                    </div>
                  </div>
                  {/* Legend */}
                  <div className="mt-3 flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span>Less</span>
                    {HEAT_STEPS.map((s) => (
                      <span key={s} className={cn("h-2.5 w-4 rounded-[3px]", s)} aria-hidden />
                    ))}
                    <span>More</span>
                    <span className="ml-auto">{heat.dates.length} days</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Trend */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Billing vs payout — last 14 days</CardTitle>
            </CardHeader>
            <CardContent>
              <AreaTrend
                data={trend}
                xKey="date"
                series={[
                  { key: "billing", label: "Billing", color: CHART_COLORS.emerald },
                  { key: "payout", label: "Payout", color: CHART_COLORS.amber },
                  { key: "margin", label: "Margin", color: CHART_COLORS.teal },
                ]}
              />
            </CardContent>
          </Card>

          {/* Top owed callout */}
          {data.topOwedProperty && data.topOwedProperty.outstanding > 0 && (
            <button
              type="button"
              onClick={() => navigate("property-detail", { id: data.topOwedProperty!.propertyId })}
              className="flex w-full items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-left transition-colors hover:bg-red-100/60 dark:border-red-900 dark:bg-red-950/30 dark:hover:bg-red-950/50"
            >
              <span className="rounded-xl bg-red-100 p-2 dark:bg-red-900/60" aria-hidden>
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium text-red-700 dark:text-red-300">Most outstanding</span>
                <span className="block truncate font-semibold">{data.topOwedProperty.propertyName}</span>
              </span>
              <span className="shrink-0 text-lg font-bold tabular-nums text-red-600 dark:text-red-400">
                {formatINR(data.topOwedProperty.outstanding)}
              </span>
            </button>
          )}

          {/* By property */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">By property</CardTitle></CardHeader>
            <CardContent>
              <DataTable
                columns={columns}
                rows={data.byProperty ?? []}
                rowKey={(r) => r.propertyId}
                onRowClick={(r) => navigate("property-detail", { id: r.propertyId })}
                loading={loading}
                emptyIcon={Building2}
                emptyTitle="No deployments in this range"
                emptyDescription="Deploy employees to a property to see numbers here."
              />
            </CardContent>
          </Card>

          {/* Quick actions */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: "Deploy", icon: CalendarCheck, view: "deployments" },
              { label: "Payment", icon: Wallet, view: "payments" },
              { label: "Advance", icon: HandCoins, view: "advances" },
              { label: "Expense", icon: Receipt, view: "expenses" },
            ].map((a) => (
              <Button key={a.view} variant="outline" className="h-auto min-h-11 flex-col gap-1.5 py-2.5" onClick={() => navigate(a.view)}>
                <a.icon className="h-4 w-4 text-primary" aria-hidden />
                <span className="text-xs font-medium">{a.label}</span>
              </Button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
