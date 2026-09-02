"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { formatINR } from "@/lib/money";
import type { ViewProps } from "@/components/view-types";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { RangeSelector, type RangeKey, rangeKeyToBounds, RANGE_HINT } from "@/components/shared/filters";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  Truck, CarFront, IndianRupee, Receipt, Route, Landmark, TrendingDown, Wallet, Trophy, Users, Info,
} from "lucide-react";
import { AreaTrend, CHART_COLORS, ErrorState, moneyCls, useAsync } from "./_shared";

interface TransportBlock {
  availableVehicles: number; onTripVehicles: number; revenue: number; expenses: number;
  received: number; pending: number; monthRevenue: number; monthExpense: number;
  monthEmi: number; monthNet: number;
}
interface PerVehicle { vehicleId: string; name: string; revenue: number; expense: number; emi: number; net: number }
interface TripProfitTrip {
  tripId: string; label: string; client: string; destination: string; vehicle: string;
  registrationNumber: string; rentalType: string; status: string;
  revenue: number; allocatedCost: number; profit: number; marginPct: number; collectedPct: number;
}
interface TripProfitResp {
  totalTrips: number;
  totals: { revenue: number; allocatedCost: number; profit: number };
  note: string;
  trips: TripProfitTrip[];
}
interface Resp {
  transport?: TransportBlock;
  trend: { date: string; revenue: number }[];
  perVehicle: PerVehicle[];
}

export default function TransportDashboardView({ navigate }: ViewProps) {
  const [range, setRange] = useState<RangeKey>("month");
  const { data, loading, error, reload } = useAsync<Resp>(
    () => api.get<Resp>(`/api/dashboard/transport?range=${range}`),
    [range]
  );
  const { data: tripProfit, loading: tpLoading, error: tpError } = useAsync<TripProfitResp>(() => {
    const { from, to } = rangeKeyToBounds(range);
    return api.get<TripProfitResp>(`/api/transport/trip-profit?limit=6&from=${from}&to=${to}`);
  }, [range]);

  const t = data?.transport;
  const vehicles = [...(data?.perVehicle ?? [])].sort((a, b) => b.net - a.net);
  const best = vehicles[0];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Transport"
        subtitle="Vehicle rental business control"
        actions={
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => navigate("vehicles")}>
            <CarFront className="h-3.5 w-3.5" aria-hidden />Vehicles
          </Button>
        }
      />

      <RangeSelector value={range} onChange={setRange} />

      {error && <ErrorState message={error} onRetry={reload} />}

      {loading && (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      )}

      {!loading && data && !error && (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
            <StatCard label="Vehicles Available" value={String(t?.availableVehicles ?? 0)} icon={CarFront} tone="positive" onClick={() => navigate("vehicles")} hint={`${t?.onTripVehicles ?? 0} on trip`} />
            <StatCard label="Revenue" value={formatINR(t?.revenue ?? 0, { compact: true })} icon={IndianRupee} tone="transport" onClick={() => navigate("trips")} />
            <StatCard label="Expenses" value={formatINR(t?.expenses ?? 0, { compact: true })} icon={Receipt} tone="negative" onClick={() => navigate("expenses")} />
            <StatCard label="EMI (month)" value={formatINR(t?.monthEmi ?? 0, { compact: true })} icon={Landmark} tone="warning" onClick={() => navigate("vehicles")} />
            <StatCard label="Net" value={formatINR(t?.monthNet ?? 0, { compact: true })} icon={TrendingDown} tone={(t?.monthNet ?? 0) >= 0 ? "positive" : "negative"} />
            <StatCard label="Pending" value={formatINR(t?.pending ?? 0, { compact: true })} icon={Wallet} tone="negative" onClick={() => navigate("trips")} />
            <StatCard label="Received" value={formatINR(t?.received ?? 0, { compact: true })} icon={Wallet} tone="positive" onClick={() => navigate("trips")} />
            <StatCard label="Month Revenue" value={formatINR(t?.monthRevenue ?? 0, { compact: true })} icon={Route} onClick={() => navigate("reports")} />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Revenue trend — last 14 days</CardTitle>
            </CardHeader>
            <CardContent>
              <AreaTrend
                data={(data.trend ?? []).map((r) => ({ date: r.date.slice(5), revenue: r.revenue }))}
                xKey="date"
                series={[{ key: "revenue", label: "Revenue", color: CHART_COLORS.amber }]}
              />
            </CardContent>
          </Card>

          {/* Trip-wise estimated profitability — follows the range selector */}
          {tpLoading ? (
            <Card>
              <CardContent className="space-y-3 p-4">
                <Skeleton className="h-5 w-56" />
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
              </CardContent>
            </Card>
          ) : tpError ? null : tripProfit && tripProfit.trips.length > 0 ? (
            <Card>
              <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
                <div>
                  <CardTitle className="text-base">Top trips by estimated profit</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {tripProfit.totalTrips} {tripProfit.totalTrips === 1 ? "trip" : "trips"} {RANGE_HINT[range]}
                  </p>
                </div>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11px] font-bold tabular-nums",
                    tripProfit.totals.profit >= 0
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                      : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                  )}
                >
                  Net {formatINR(tripProfit.totals.profit, { compact: true })}
                </span>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {tripProfit.trips.map((t, i) => {
                  const maxProfit = Math.max(...tripProfit.trips.map((x) => Math.abs(x.profit)), 1);
                  const widthPct = Math.max(4, Math.round((Math.abs(t.profit) / maxProfit) * 100));
                  const positive = t.profit >= 0;
                  return (
                    <button
                      key={t.tripId}
                      type="button"
                      onClick={() => navigate("trips")}
                      className="group block w-full rounded-lg px-1 py-1 text-left transition-colors hover:bg-muted/50"
                      title={`${t.client} · ${t.destination} · ${t.vehicle} (${t.registrationNumber})\nRevenue ${formatINR(t.revenue)} · Cost ≈ ${formatINR(t.allocatedCost)} · Collected ${t.collectedPct}%`}
                    >
                      <div className="mb-1 flex items-center gap-2 text-xs">
                        <span className="w-4 shrink-0 text-[10px] font-bold text-muted-foreground" aria-hidden>{i + 1}</span>
                        <span className="min-w-0 flex-1 truncate font-medium">{t.label}</span>
                        <span className="hidden shrink-0 text-[10px] text-muted-foreground sm:inline">{t.vehicle}</span>
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
                            positive
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                              : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                          )}
                        >
                          {t.marginPct}%
                        </span>
                        <span className={cn("w-16 shrink-0 text-right font-bold tabular-nums", moneyCls(t.profit))}>
                          {formatINR(t.profit, { compact: true })}
                        </span>
                      </div>
                      <div className="ml-6 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all duration-500 group-hover:opacity-80",
                            positive ? "bg-emerald-500 dark:bg-emerald-600" : "bg-red-500 dark:bg-red-600"
                          )}
                          style={{ width: `${widthPct}%` }}
                        />
                      </div>
                    </button>
                  );
                })}
                <p className="flex items-start gap-1.5 pt-1 text-[11px] leading-relaxed text-muted-foreground">
                  <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                  {tripProfit.note}
                </p>
              </CardContent>
            </Card>
          ) : null}

          {/* Most profitable callout */}
          {best && (
            <button
              type="button"
              onClick={() => navigate("vehicle-detail", { id: best.vehicleId })}
              className="flex w-full items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-left transition-colors hover:bg-amber-100/60 dark:border-amber-900 dark:bg-amber-950/30 dark:hover:bg-amber-950/50"
            >
              <span className="rounded-xl bg-amber-100 p-2 dark:bg-amber-900/60" aria-hidden>
                <Trophy className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium text-amber-700 dark:text-amber-300">Most profitable this month</span>
                <span className="block truncate font-semibold">{best.name}</span>
              </span>
              <span className={cn("shrink-0 text-lg font-bold tabular-nums", moneyCls(best.net))}>{formatINR(best.net)}</span>
            </button>
          )}

          {/* Per vehicle profitability */}
          <section aria-label="Vehicle profitability">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Per-vehicle profitability</p>
            <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {vehicles.length === 0 && (
                <Card className="sm:col-span-2 xl:col-span-3">
                  <CardContent className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                    <Truck className="h-4 w-4" aria-hidden />No vehicle data in this range
                  </CardContent>
                </Card>
              )}
              {vehicles.map((v) => (
                <Card
                  key={v.vehicleId}
                  className="cursor-pointer border-border/70 shadow-sm transition-all hover:border-primary/40 hover:shadow-md"
                  onClick={() => navigate("vehicle-detail", { id: v.vehicleId })}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate("vehicle-detail", { id: v.vehicleId }); } }}
                  aria-label={`${v.name}: net ${formatINR(v.net)}`}
                >
                  <CardContent className="p-4">
                    <p className="truncate font-semibold">{v.name}</p>
                    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                      <div className="flex justify-between"><span className="text-muted-foreground">Revenue</span><span className="font-semibold tabular-nums">{formatINR(v.revenue, { compact: true })}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Expense</span><span className="font-semibold tabular-nums">{formatINR(v.expense, { compact: true })}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">EMI</span><span className="font-semibold tabular-nums">{formatINR(v.emi, { compact: true })}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Net</span><span className={cn("font-bold tabular-nums", moneyCls(v.net))}>{formatINR(v.net, { compact: true })}</span></div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: "New Rental", icon: Route, view: "trips" },
              { label: "Vehicle Expense", icon: Receipt, view: "expenses" },
              { label: "Vehicles", icon: CarFront, view: "vehicles" },
              { label: "Clients", icon: Users, view: "clients" },
            ].map((a) => (
              <Button key={a.view + a.label} variant="outline" className="h-auto min-h-11 flex-col gap-1.5 py-2.5" onClick={() => navigate(a.view)}>
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
