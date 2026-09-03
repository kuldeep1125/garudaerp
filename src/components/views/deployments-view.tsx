"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, qs } from "@/lib/api-client";
import { formatINR, parseAmount } from "@/lib/money";
import type { ViewProps } from "@/components/view-types";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { RangeSelector, type RangeKey } from "@/components/shared/filters";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/shared/status-badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useLang, t } from "@/lib/i18n";
import { CalendarCheck, Pencil, Trash2, CalendarDays, ChevronDown } from "lucide-react";
import {
  DeploymentRec, DeployWizard, ListResp, MoneyInput, Option, PropertyRec, SelectInput, ShiftBadgeInline,
  SHIFT_OPTIONS, SHIFT_UNITS, errMessage, fmtDateTime, fmtDay, todayStr, useAsync, useMutation,
  undoRequest,
} from "./_shared";

const SHIFT_FILTER_OPTIONS: Option[] = [
  { label: "All shifts", value: "" },
  { label: "Day", value: "DAY" },
  { label: "Night", value: "NIGHT" },
  { label: "Full", value: "FULL" },
];

interface Totals { billing: number; payout: number; margin: number; count: number }

// --- Attendance month grid (per-employee × per-day shift units) ---
interface AttendanceCell { date: string; shifts: number }
interface AttendanceRow {
  employeeId: string; name: string; code: string; role?: string | null;
  total: number; workedDays: number; cells: AttendanceCell[];
}
interface AttendanceResp { month: string; dates: string[]; rows: AttendanceRow[]; totalShifts: number }

const ATT_HEAT = [
  "bg-muted/50",
  "bg-emerald-200/70 dark:bg-emerald-900/60",
  "bg-emerald-400/80 dark:bg-emerald-800/80",
  "bg-emerald-600 dark:bg-emerald-600",
];

function attClass(n: number): string {
  if (n <= 0) return ATT_HEAT[0];
  if (n === 1) return ATT_HEAT[1];
  if (n === 2) return ATT_HEAT[2];
  return ATT_HEAT[3];
}

const WD_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, (m ?? 1) - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function isWeekend(dateStr: string): boolean {
  const [y, m, d] = dateStr.split("-").map(Number);
  const wd = new Date(y, (m ?? 1) - 1, d ?? 1).getDay();
  return wd === 0 || wd === 6;
}

function monthBounds(offset = 0): { from: string; to: string } {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const last = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  const f = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { from: f(first), to: f(last) };
}

export default function DeploymentsView({ params }: ViewProps) {
  const { lang } = useLang();
  const [date, setDate] = useState(params?.date ?? todayStr());
  const [fromTo, setFromTo] = useState<{ from?: string; to?: string }>({});
  const [rangeKey, setRangeKey] = useState<RangeKey | null>(params?.date ? null : "today");
  const [propertyId, setPropertyId] = useState(params?.propertyId ?? "");
  const [employeeId, setEmployeeId] = useState(params?.employeeId ?? "");
  const [shift, setShift] = useState("");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [detail, setDetail] = useState<DeploymentRec | null>(null);
  const [editRates, setEditRates] = useState(false);
  const [rateForm, setRateForm] = useState({ shift: "DAY", billingRate: "", payoutRate: "", adjustmentAmount: "", adjustmentNote: "", notes: "" });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { mutate, saving } = useMutation();

  // Attendance month grid — fetched lazily, only while expanded.
  const [attOpen, setAttOpen] = useState(false);
  const [attMonth, setAttMonth] = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
  });
  const { data: att, loading: attLoading } = useAsync<AttendanceResp | null>(
    () => (attOpen ? api.get<AttendanceResp>(`/api/deployments/attendance?month=${attMonth}`) : Promise.resolve(null)),
    [attOpen, attMonth]
  );

  // Property options for filter.
  const [properties, setProperties] = useState<PropertyRec[]>([]);
  useEffect(() => {
    let cancelled = false;
    api.get<ListResp<PropertyRec>>("/api/properties" + qs({ pageSize: 200 }))
      .then((d) => { if (!cancelled) setProperties(d.items); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Employee options for filter (active only).
  const [employees, setEmployees] = useState<{ id: string; fullName: string; code: string }[]>([]);
  useEffect(() => {
    let cancelled = false;
    api.get<ListResp<{ id: string; fullName: string; code: string }>>("/api/employees" + qs({ status: "ACTIVE", pageSize: 200 }))
      .then((d) => { if (!cancelled) setEmployees(d.items); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const onRange = (r: RangeKey) => {
    setRangeKey(r);
    if (r === "today") { setDate(todayStr()); setFromTo({}); }
    else if (r === "yesterday") { setDate(todayStr(-1)); setFromTo({}); }
    else if (r === "week") { setDate(""); setFromTo({ from: todayStr(-6), to: todayStr() }); }
    else if (r === "lastweek") { setDate(""); setFromTo({ from: todayStr(-13), to: todayStr(-7) }); }
    else if (r === "month") { setDate(""); setFromTo({ ...monthBounds(0), to: todayStr() }); }
    else { setDate(""); setFromTo(monthBounds(-1)); }
  };

  const onDateChange = (d: string) => {
    setDate(d);
    setRangeKey(null);
    setFromTo({});
  };

  const [data, setData] = useState<ListResp<DeploymentRec> & { totals?: Totals } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = qs({
        date: date || undefined,
        from: fromTo.from,
        to: fromTo.to,
        propertyId: propertyId || undefined,
        employeeId: employeeId || undefined,
        shift: shift || undefined,
        pageSize: 200,
      });
      const d = await api.get<ListResp<DeploymentRec> & { totals?: Totals }>("/api/deployments" + query);
      setData(d);
      setError(null);
    } catch (e) {
      setError(errMessage(e));
      toast.error(errMessage(e));
    } finally {
      setLoading(false);
    }
  }, [date, fromTo, propertyId, employeeId, shift]);

  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => data?.items ?? [], [data]);
  const totals = data?.totals;

  const openDetail = (d: DeploymentRec) => {
    setDetail(d);
    setEditRates(false);
    setRateForm({
      shift: d.shift,
      billingRate: String(d.billingRate ?? 0),
      payoutRate: String(d.payoutRate ?? 0),
      adjustmentAmount: d.adjustmentAmount ? String(d.adjustmentAmount) : "",
      adjustmentNote: d.adjustmentNote ?? "",
      notes: d.notes ?? "",
    });
  };

  const saveRates = async () => {
    if (!detail) return;
    const res = await mutate(
      () => api.put(`/api/deployments/${detail.id}`, {
        shift: rateForm.shift,
        billingRate: parseAmount(rateForm.billingRate),
        payoutRate: parseAmount(rateForm.payoutRate),
        adjustmentAmount: rateForm.adjustmentAmount ? parseAmount(rateForm.adjustmentAmount) : 0,
        adjustmentNote: rateForm.adjustmentNote || undefined,
        notes: rateForm.notes || undefined,
      }),
      "Deployment updated",
      () => ({ module: "DEPLOYMENT", recordId: detail.id, onUndo: () => void load() })
    );
    if (res.ok) { setDetail(null); void load(); }
  };

  const deleteDeployment = async () => {
    if (!detail) return;
    const res = await mutate(
      () => api.del(`/api/deployments/${detail.id}`),
      "Deployment removed",
      () => ({ module: "DEPLOYMENT", recordId: detail.id, onUndo: () => void load() })
    );
    setConfirmDelete(false);
    if (res.ok) { setDetail(null); void load(); }
  };

  const columns: Column<DeploymentRec>[] = [
    { key: "date", label: t(lang, "col.date"), value: (r) => fmtDay(r.date), hideOnMobile: true },
    {
      key: "employee", label: t(lang, "col.employee"), primary: true,
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{r.employeeName}</p>
          <p className="truncate text-[11px] text-muted-foreground">{r.employeeCode} · {r.propertyName}</p>
        </div>
      ),
      value: (r) => r.employeeName,
    },
    { key: "property", label: t(lang, "col.property"), value: (r) => r.propertyName, hideOnMobile: true },
    { key: "shift", label: t(lang, "col.shift"), render: (r) => <ShiftBadgeInline shift={r.shift} />, value: (r) => r.shift },
    {
      key: "billingAmount", label: t(lang, "col.billing"), className: "text-right",
      render: (r) => <span className="tabular-nums">{formatINR(r.billingAmount ?? 0)}</span>,
      value: (r) => formatINR(r.billingAmount ?? 0),
    },
    {
      key: "payoutAmount", label: t(lang, "col.payout"), className: "text-right",
      render: (r) => <span className="tabular-nums">{formatINR(r.payoutAmount ?? 0)}</span>,
      value: (r) => formatINR(r.payoutAmount ?? 0),
      hideOnMobile: true,
    },
    {
      key: "paidStatus", label: t(lang, "col.paid"), render: (r) => <StatusBadge status={r.paidStatus ?? "UNPAID"} />, value: (r) => r.paidStatus ?? "UNPAID",
      hideOnMobile: true,
    },
  ];

  const detailUnits = detail ? SHIFT_UNITS[detail.shift] ?? 1 : 1;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t(lang, "page.deployments")}
        subtitle={t(lang, "page.deployments.sub")}
        actions={
          <Button size="sm" className="h-9 gap-1.5" onClick={() => setWizardOpen(true)}>
            <CalendarCheck className="h-4 w-4" aria-hidden />Deploy Employees
          </Button>
        }
      />

      {/* Attendance month grid (collapsible) */}
      <Card>
        <button
          type="button"
          className="flex w-full items-center gap-2.5 p-4 text-left"
          aria-expanded={attOpen}
          onClick={() => setAttOpen((v) => !v)}
        >
          <span className="rounded-lg bg-emerald-100 p-1.5 dark:bg-emerald-950" aria-hidden>
            <CalendarDays className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Attendance — {monthLabel(attMonth)}</span>
            <span className="block text-xs text-muted-foreground">
              {att ? `${att.totalShifts.toLocaleString("en-IN")} shift units across ${att.rows.length} employees · click a cell to inspect` : "Per-employee daily shift grid (Full = 2 units)"}
            </span>
          </span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", attOpen && "rotate-180")} aria-hidden />
        </button>
        {attOpen && (
          <CardContent className="border-t pt-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="h-7 w-7 p-0" aria-label="Previous month" onClick={() => setAttMonth((m) => shiftMonth(m, -1))}>
                  ‹
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  onClick={() => {
                    const n = new Date();
                    setAttMonth(`${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`);
                  }}
                >
                  This month
                </Button>
                <Button variant="outline" size="sm" className="h-7 w-7 p-0" aria-label="Next month" onClick={() => setAttMonth((m) => shiftMonth(m, 1))}>
                  ›
                </Button>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground" aria-hidden>
                <span>Less</span>
                {ATT_HEAT.map((c) => <span key={c} className={cn("h-3 w-3 rounded-[3px]", c)} />)}
                <span>More</span>
              </div>
            </div>

            {attLoading && !att ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}
              </div>
            ) : att && att.rows.length > 0 ? (
              <div className="overflow-x-auto pb-1">
                <div className="min-w-[640px]">
                  {/* Header: name + day numbers + totals */}
                  <div
                    className="sticky top-0 z-20 grid items-end gap-px border-b bg-card pb-1"
                    style={{ gridTemplateColumns: `minmax(8.5rem, 11rem) repeat(${att.dates.length}, minmax(14px, 1fr)) 2.6rem 2.6rem` }}
                  >
                    <div className="sticky left-0 z-30 bg-card pr-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Employee</div>
                    {att.dates.map((d, i) => {
                      const day = Number(d.slice(8));
                      const wd = WD_LETTERS[new Date(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, day).getDay()];
                      const isToday = d === todayStr();
                      return (
                        <div key={d} className={cn("text-center text-[9px] leading-tight", isWeekend(d) ? "text-muted-foreground/60" : "text-muted-foreground", isToday && "font-bold text-primary")}>
                          <div className={cn(isToday && "rounded-sm bg-primary/10")}>{day}</div>
                          <div className="opacity-70">{wd}</div>
                        </div>
                      );
                    })}
                    <div className="text-right text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Units</div>
                    <div className="text-right text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Days</div>
                  </div>

                  <div className="max-h-[46vh] overflow-y-auto">
                    {att.rows.map((r) => (
                      <div
                        key={r.employeeId}
                        className="grid items-center gap-px border-b border-border/40 py-1"
                        style={{ gridTemplateColumns: `minmax(8.5rem, 11rem) repeat(${att.dates.length}, minmax(14px, 1fr)) 2.6rem 2.6rem` }}
                      >
                        <div className="sticky left-0 z-10 bg-card pr-2">
                          <p className="truncate text-xs font-medium" title={`${r.name} (${r.code})`}>{r.name}</p>
                          <p className="truncate text-[10px] text-muted-foreground">{r.code}</p>
                        </div>
                        {r.cells.map((c) => {
                          const active = c.shifts > 0;
                          return (
                            <button
                              key={c.date}
                              type="button"
                              disabled={!active}
                              className={cn(
                                "mx-auto flex h-4 w-4 items-center justify-center rounded-[3px] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                                active && "cursor-pointer hover:scale-125 hover:ring-1 hover:ring-primary/40",
                                !active && "cursor-default",
                                attClass(c.shifts),
                                isWeekend(c.date) && c.shifts === 0 && "opacity-50",
                                c.date === todayStr() && "ring-1 ring-primary ring-offset-1 ring-offset-background"
                              )}
                              role="img"
                              aria-label={
                                active
                                  ? `${r.name}: ${c.shifts} shift unit(s) on ${c.date} — filter deployments`
                                  : `${r.name}: no shifts on ${c.date}`
                              }
                              title={
                                active
                                  ? `${fmtDay(c.date)} · ${r.name} · ${c.shifts} unit${c.shifts === 1 ? "" : "s"} — click to inspect`
                                  : `${fmtDay(c.date)} · ${r.name} · no shifts`
                              }
                              onClick={
                                active
                                  ? () => {
                                      // Drill down: filter the table below to this employee + day.
                                      setEmployeeId(r.employeeId);
                                      setPropertyId("");
                                      onDateChange(c.date);
                                      setAttOpen(false);
                                      toast.info(`Showing ${r.name} — ${fmtDay(c.date)}`);
                                    }
                                  : undefined
                              }
                            />
                          );
                        })}
                        <div className="text-right text-xs font-bold tabular-nums">{r.total}</div>
                        <div className="text-right text-xs tabular-nums text-muted-foreground">{r.workedDays}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <p className="py-6 text-center text-xs text-muted-foreground">No active employees found.</p>
            )}
          </CardContent>
        )}
      </Card>

      {/* Filters */}
      <Card>
        <CardContent className="space-y-3 p-3 sm:p-4">
          <RangeSelector
            value={(rangeKey ?? "today") as RangeKey}
            onChange={onRange}
          />
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label className="mb-1.5 block text-[10px] uppercase tracking-wide text-muted-foreground">Date</Label>
              <Input type="date" value={date} onChange={(e) => onDateChange(e.target.value)} className="h-10" aria-label="Filter by date" />
            </div>
            <div>
              <Label className="mb-1.5 block text-[10px] uppercase tracking-wide text-muted-foreground">Property</Label>
              <SelectInput
                value={propertyId}
                onChange={setPropertyId}
                options={[{ label: "All properties", value: "" }, ...properties.map((p) => ({ label: p.name, value: p.id }))]}
                placeholder="All properties"
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-[10px] uppercase tracking-wide text-muted-foreground">Employee</Label>
              <SelectInput
                value={employeeId}
                onChange={setEmployeeId}
                options={[{ label: "All employees", value: "" }, ...employees.map((e) => ({ label: `${e.fullName} (${e.code})`, value: e.id }))]}
                placeholder="All employees"
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-[10px] uppercase tracking-wide text-muted-foreground">Shift</Label>
              <SelectInput value={shift} onChange={setShift} options={SHIFT_FILTER_OPTIONS} placeholder="All shifts" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Totals */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)
        ) : (
          <>
            <Card className="border-border/70 shadow-sm"><CardContent className="p-3 sm:p-4">
              <p className="text-[11px] sm:text-xs text-muted-foreground">Deployments</p>
              <p className="mt-1 text-lg sm:text-xl font-bold tabular-nums">{totals?.count ?? rows.length}</p>
            </CardContent></Card>
            <Card className="border-border/70 shadow-sm"><CardContent className="p-3 sm:p-4">
              <p className="text-[11px] sm:text-xs text-muted-foreground">Billing</p>
              <p className="mt-1 text-lg sm:text-xl font-bold tabular-nums">{formatINR(totals?.billing ?? 0, { compact: true })}</p>
            </CardContent></Card>
            <Card className="border-border/70 shadow-sm"><CardContent className="p-3 sm:p-4">
              <p className="text-[11px] sm:text-xs text-muted-foreground">Payout</p>
              <p className="mt-1 text-lg sm:text-xl font-bold tabular-nums">{formatINR(totals?.payout ?? 0, { compact: true })}</p>
            </CardContent></Card>
            <Card className="border-border/70 shadow-sm"><CardContent className="p-3 sm:p-4">
              <p className="text-[11px] sm:text-xs text-muted-foreground">Margin</p>
              <p className={cn("mt-1 text-lg sm:text-xl font-bold tabular-nums", (totals?.margin ?? 0) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                {formatINR(totals?.margin ?? 0, { compact: true })}
              </p>
            </CardContent></Card>
          </>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50/60 p-4 text-center dark:border-red-900 dark:bg-red-950/30">
          <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
          <Button variant="outline" size="sm" className="mt-2 h-8" onClick={() => void load()}>Retry</Button>
        </div>
      )}

      {!error && (
        <Card>
          <CardContent className="p-3 sm:p-4">
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(r) => r.id}
              onRowClick={openDetail}
              exportName="deployments"
              loading={loading}
              emptyIcon={CalendarCheck}
              emptyTitle="No deployments for this filter"
              emptyDescription="Use the Deploy Employees button to create today's roster."
            />
          </CardContent>
        </Card>
      )}

      <DeployWizard open={wizardOpen} onOpenChange={setWizardOpen} defaultDate={date || undefined} defaultPropertyId={propertyId || undefined} onDone={load} />

      {/* Detail dialog */}
      <Dialog open={Boolean(detail)} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  {detail.employeeName}
                  <StatusBadge status={detail.paidStatus ?? "UNPAID"} />
                </DialogTitle>
                <DialogDescription>
                  {fmtDay(detail.date)} · {detail.propertyName} · {detail.shift === "FULL" ? "Full (day + night)" : detail.shift} shift
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-muted/60 p-2.5">
                  <p className="text-[10px] uppercase text-muted-foreground">Billing</p>
                  <p className="text-sm font-bold tabular-nums">{formatINR(detail.billingAmount ?? 0)}</p>
                  <p className="text-[10px] text-muted-foreground tabular-nums">{formatINR(detail.billingRate ?? 0)} × {detailUnits}</p>
                </div>
                <div className="rounded-xl bg-muted/60 p-2.5">
                  <p className="text-[10px] uppercase text-muted-foreground">Payout</p>
                  <p className="text-sm font-bold tabular-nums">{formatINR(detail.payoutAmount ?? 0)}</p>
                  <p className="text-[10px] text-muted-foreground tabular-nums">{formatINR(detail.payoutRate ?? 0)} × {detailUnits}</p>
                </div>
                <div className="rounded-xl bg-muted/60 p-2.5">
                  <p className="text-[10px] uppercase text-muted-foreground">Margin</p>
                  <p className={cn("text-sm font-bold tabular-nums", (detail.billingAmount ?? 0) - (detail.payoutAmount ?? 0) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                    {formatINR((detail.billingAmount ?? 0) - (detail.payoutAmount ?? 0))}
                  </p>
                  <p className="text-[10px] text-muted-foreground">this record</p>
                </div>
              </div>

              {(detail.adjustmentAmount ?? 0) !== 0 && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                  Adjustment {formatINR(detail.adjustmentAmount ?? 0)}{detail.adjustmentNote ? ` — ${detail.adjustmentNote}` : ""}
                </p>
              )}
              {detail.notes && <p className="text-xs text-muted-foreground">Notes: {detail.notes}</p>}

              <Separator />

              {editRates ? (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Shift</Label>
                    <div className="flex rounded-lg border bg-muted/50 p-1" role="group" aria-label="Shift">
                      {SHIFT_OPTIONS.map((s) => (
                        <button
                          key={s.value}
                          type="button"
                          className={cn(
                            "min-h-9 flex-1 rounded-md text-xs font-medium transition-colors",
                            rateForm.shift === s.value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                          )}
                          aria-pressed={rateForm.shift === s.value}
                          onClick={() => setRateForm((f) => ({ ...f, shift: s.value }))}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Billing rate (₹/shift)</Label>
                      <MoneyInput className="h-9" value={rateForm.billingRate} onChange={(v) => setRateForm((f) => ({ ...f, billingRate: v }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Payout rate (₹/shift)</Label>
                      <MoneyInput className="h-9" value={rateForm.payoutRate} onChange={(v) => setRateForm((f) => ({ ...f, payoutRate: v }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Adjustment amount (± ₹)</Label>
                      <MoneyInput className="h-9" value={rateForm.adjustmentAmount} onChange={(v) => setRateForm((f) => ({ ...f, adjustmentAmount: v }))} placeholder="e.g. -100 or 250" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Adjustment note</Label>
                      <Input className="h-9" value={rateForm.adjustmentNote} onChange={(e) => setRateForm((f) => ({ ...f, adjustmentNote: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label className="text-xs">Notes</Label>
                      <Input className="h-9" value={rateForm.notes} onChange={(e) => setRateForm((f) => ({ ...f, notes: e.target.value }))} />
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Amounts recompute as rate × shift units (Full = 2) + adjustment.</p>
                  <div className="flex gap-2">
                    <Button variant="outline" className="min-h-10 flex-1" onClick={() => setEditRates(false)}>Cancel</Button>
                    <Button className="min-h-10 flex-1" onClick={saveRates} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] text-muted-foreground">
                      By {detail.createdByName ?? "—"} · {fmtDateTime(detail.createdAt)}
                    </p>
                    <div className="flex gap-1.5">
                      <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setEditRates(true)}>
                        <Pencil className="h-3 w-3" aria-hidden />Edit
                      </Button>
                      <Button variant="outline" size="sm" className="h-8 gap-1.5 border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950" onClick={() => setConfirmDelete(true)}>
                        <Trash2 className="h-3 w-3" aria-hidden />Remove
                      </Button>
                    </div>
                  </div>
                  <p className="rounded-lg bg-muted/60 px-3 py-2 text-[11px] text-muted-foreground">
                    Removed by mistake? The toast Undo (or Audit Log) restores it exactly — amounts, allocation and totals included.
                  </p>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this deployment?</AlertDialogTitle>
            <AlertDialogDescription>
              {detail && `${detail.employeeName} — ${fmtDay(detail.date)} · ${detail.propertyName} · ${detail.shift} shift (${formatINR(detail.billingAmount ?? 0)} billing).`} The entry is snapshotted, so Undo restores it with zero mismatch.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-10">Cancel</AlertDialogCancel>
            <AlertDialogAction className="min-h-10 bg-red-600 text-white hover:bg-red-700" onClick={() => void deleteDeployment()}>
              {saving ? "Removing…" : "Remove entry"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
