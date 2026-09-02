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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/shared/status-badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CalendarCheck, CheckCheck, CheckSquare, Square, Users, IndianRupee, Pencil, UserX, XCircle, MinusCircle } from "lucide-react";
import {
  DeploymentRec, DeployWizard, ListResp, Option, PropertyRec, SelectInput, ShiftBadgeInline,
  errMessage, fmtDateTime, fmtDay, todayStr, useMutation,
} from "./_shared";

const STATUS_OPTIONS: Option[] = [
  { label: "All statuses", value: "" },
  { label: "Scheduled", value: "SCHEDULED" },
  { label: "Confirmed", value: "CONFIRMED" },
  { label: "Completed", value: "COMPLETED" },
  { label: "Partial", value: "PARTIAL" },
  { label: "No-show", value: "NO_SHOW" },
  { label: "Cancelled", value: "CANCELLED" },
];

const SHIFT_OPTIONS: Option[] = [
  { label: "All shifts", value: "" },
  { label: "Day", value: "DAY" },
  { label: "Night", value: "NIGHT" },
];

interface Totals { billing: number; payout: number; margin: number; count: number }

function monthBounds(offset = 0): { from: string; to: string } {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const last = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  const f = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { from: f(first), to: f(last) };
}

export default function DeploymentsView({ params }: ViewProps) {
  const [date, setDate] = useState(params?.date ?? todayStr());
  const [fromTo, setFromTo] = useState<{ from?: string; to?: string }>({});
  const [rangeKey, setRangeKey] = useState<RangeKey | null>(params?.date ? null : "today");
  const [propertyId, setPropertyId] = useState(params?.propertyId ?? "");
  const [shift, setShift] = useState("");
  const [status, setStatus] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [detail, setDetail] = useState<DeploymentRec | null>(null);
  const [editRates, setEditRates] = useState(false);
  const [rateForm, setRateForm] = useState({ billingRate: "", payoutRate: "", adjustmentAmount: "", adjustmentNote: "", notes: "" });
  const { mutate, saving } = useMutation();

  // Property options for filter.
  const [properties, setProperties] = useState<PropertyRec[]>([]);
  useEffect(() => {
    let cancelled = false;
    api.get<ListResp<PropertyRec>>("/api/properties" + qs({ pageSize: 200 }))
      .then((d) => { if (!cancelled) setProperties(d.items); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const onRange = (r: RangeKey) => {
    setRangeKey(r);
    setSelectedIds([]);
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
    setSelectedIds([]);
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
        shift: shift || undefined,
        status: status || undefined,
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
  }, [date, fromTo, propertyId, shift, status]);

  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => data?.items ?? [], [data]);
  const totals = data?.totals;

  const allChecked = rows.length > 0 && rows.every((r) => selectedIds.includes(r.id));

  const toggleAll = () => {
    setSelectedIds(allChecked ? [] : rows.map((r) => r.id));
  };

  const toggleOne = (id: string) => {
    setSelectedIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const bulkStatus = async (next: string) => {
    if (selectedIds.length === 0) return;
    const res = await mutate(
      () => api.post<{ updated: number }>("/api/deployments/bulk-status", { ids: selectedIds, status: next }),
      `${selectedIds.length} deployment(s) marked ${next.replace("_", " ").toLowerCase()}`
    );
    if (res.ok) { setSelectedIds([]); void load(); }
  };

  const changeStatus = async (d: DeploymentRec, next: string) => {
    const res = await mutate(() => api.put(`/api/deployments/${d.id}/status`, { status: next }), `Marked ${next.replace("_", " ").toLowerCase()}`);
    if (res.ok) { setDetail(null); void load(); }
  };

  const openDetail = (d: DeploymentRec) => {
    setDetail(d);
    setEditRates(false);
    setRateForm({
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
        billingRate: parseAmount(rateForm.billingRate),
        payoutRate: parseAmount(rateForm.payoutRate),
        adjustmentAmount: rateForm.adjustmentAmount ? parseAmount(rateForm.adjustmentAmount) : 0,
        adjustmentNote: rateForm.adjustmentNote || undefined,
        notes: rateForm.notes || undefined,
      }),
      "Rates & adjustments updated"
    );
    if (res.ok) { setDetail(null); void load(); }
  };

  const columns: Column<DeploymentRec>[] = [
    {
      key: "select", label: "", className: "w-10",
      render: (r) => (
        <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            aria-label={selectedIds.includes(r.id) ? "Unselect row" : "Select row"}
            aria-pressed={selectedIds.includes(r.id)}
            className="rounded p-1 hover:bg-muted"
            onClick={() => toggleOne(r.id)}
          >
            {selectedIds.includes(r.id)
              ? <CheckSquare className="h-4 w-4 text-primary" aria-hidden />
              : <Square className="h-4 w-4 text-muted-foreground" aria-hidden />}
          </button>
        </div>
      ),
      value: () => "",
    },
    { key: "date", label: "Date", value: (r) => fmtDay(r.date), hideOnMobile: true },
    {
      key: "employee", label: "Employee", primary: true,
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{r.employeeName}</p>
          <p className="truncate text-[11px] text-muted-foreground">{r.employeeCode} · {r.propertyName}</p>
        </div>
      ),
      value: (r) => r.employeeName,
    },
    { key: "property", label: "Property", value: (r) => r.propertyName, hideOnMobile: true },
    { key: "shift", label: "Shift", render: (r) => <ShiftBadgeInline shift={r.shift} />, value: (r) => r.shift },
    { key: "category", label: "Category", value: (r) => r.workCategory ?? "—", hideOnMobile: true },
    {
      key: "billingAmount", label: "Billing", className: "text-right",
      render: (r) => <span className="tabular-nums">{formatINR(r.billingAmount ?? 0)}</span>,
      value: (r) => formatINR(r.billingAmount ?? 0),
    },
    {
      key: "payoutAmount", label: "Payout", className: "text-right",
      render: (r) => <span className="tabular-nums">{formatINR(r.payoutAmount ?? 0)}</span>,
      value: (r) => formatINR(r.payoutAmount ?? 0),
      hideOnMobile: true,
    },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} />, value: (r) => r.status },
    {
      key: "paidStatus", label: "Paid", render: (r) => <StatusBadge status={r.paidStatus ?? "UNPAID"} />, value: (r) => r.paidStatus ?? "UNPAID",
      hideOnMobile: true,
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Deployments"
        subtitle="Daily work records & attendance"
        actions={
          <Button size="sm" className="h-9 gap-1.5" onClick={() => setWizardOpen(true)}>
            <Users className="h-4 w-4" aria-hidden />Deploy Employees
          </Button>
        }
      />

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
                onChange={(v) => { setPropertyId(v); setSelectedIds([]); }}
                options={[{ label: "All properties", value: "" }, ...properties.map((p) => ({ label: p.name, value: p.id }))]}
                placeholder="All properties"
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-[10px] uppercase tracking-wide text-muted-foreground">Shift</Label>
              <SelectInput value={shift} onChange={(v) => { setShift(v); setSelectedIds([]); }} options={SHIFT_OPTIONS} placeholder="All shifts" />
            </div>
            <div>
              <Label className="mb-1.5 block text-[10px] uppercase tracking-wide text-muted-foreground">Status</Label>
              <SelectInput value={status} onChange={(v) => { setStatus(v); setSelectedIds([]); }} options={STATUS_OPTIONS} placeholder="All statuses" />
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
            <div className="mb-2.5 flex items-center justify-between">
              <button
                type="button"
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                onClick={toggleAll}
              >
                {allChecked ? <CheckSquare className="h-4 w-4 text-primary" aria-hidden /> : <Square className="h-4 w-4" aria-hidden />}
                Select all {selectedIds.length > 0 && <span className="font-bold text-foreground">({selectedIds.length})</span>}
              </button>
              <p className="text-xs text-muted-foreground">Tap a row for details & rate edits</p>
            </div>
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(r) => r.id}
              onRowClick={openDetail}
              loading={loading}
              emptyIcon={CalendarCheck}
              emptyTitle="No deployments for this filter"
              emptyDescription="Use the Deploy Employees button to create today's roster."
            />
          </CardContent>
        </Card>
      )}

      {/* Bulk action bar */}
      {selectedIds.length > 0 && (
        <div className={cn(
          "fixed inset-x-3 bottom-20 z-40 md:inset-x-auto md:left-1/2 md:bottom-6 md:-translate-x-1/2",
          "rounded-2xl border bg-card/95 p-2 shadow-xl backdrop-blur supports-[backdrop-filter]:bg-card/80"
        )} role="toolbar" aria-label="Bulk actions">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <span className="shrink-0 px-1.5 text-xs font-semibold tabular-nums">{selectedIds.length} selected</span>
            <Separator orientation="vertical" className="h-6 shrink-0" />
            <Button size="sm" variant="outline" className="h-9 shrink-0 gap-1.5" onClick={() => void bulkStatus("COMPLETED")}>
              <CheckCheck className="h-3.5 w-3.5 text-emerald-600" aria-hidden />Complete
            </Button>
            <Button size="sm" variant="outline" className="h-9 shrink-0 gap-1.5" onClick={() => void bulkStatus("CONFIRMED")}>
              <IndianRupee className="h-3.5 w-3.5 text-teal-600" aria-hidden />Confirm
            </Button>
            <Button size="sm" variant="outline" className="h-9 shrink-0 gap-1.5" onClick={() => void bulkStatus("NO_SHOW")}>
              <UserX className="h-3.5 w-3.5 text-red-600" aria-hidden />No-Show
            </Button>
            <Button size="sm" variant="ghost" className="h-9 shrink-0" onClick={() => setSelectedIds([])}>Clear</Button>
          </div>
        </div>
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
                  <StatusBadge status={detail.status} />
                  <StatusBadge status={detail.paidStatus ?? "UNPAID"} />
                </DialogTitle>
                <DialogDescription>
                  {fmtDay(detail.date)} · {detail.propertyName} · {detail.shift} shift{detail.workCategory ? ` · ${detail.workCategory}` : ""}
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-muted/60 p-2.5">
                  <p className="text-[10px] uppercase text-muted-foreground">Billing</p>
                  <p className="text-sm font-bold tabular-nums">{formatINR(detail.billingAmount ?? 0)}</p>
                  <p className="text-[10px] text-muted-foreground tabular-nums">@ {formatINR(detail.billingRate ?? 0)}</p>
                </div>
                <div className="rounded-xl bg-muted/60 p-2.5">
                  <p className="text-[10px] uppercase text-muted-foreground">Payout</p>
                  <p className="text-sm font-bold tabular-nums">{formatINR(detail.payoutAmount ?? 0)}</p>
                  <p className="text-[10px] text-muted-foreground tabular-nums">@ {formatINR(detail.payoutRate ?? 0)}</p>
                </div>
                <div className="rounded-xl bg-muted/60 p-2.5">
                  <p className="text-[10px] uppercase text-muted-foreground">Margin</p>
                  <p className={cn("text-sm font-bold tabular-nums", (detail.billingAmount ?? 0) - (detail.payoutAmount ?? 0) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                    {formatINR((detail.billingAmount ?? 0) - (detail.payoutAmount ?? 0))}
                  </p>
                  <p className="text-[10px] text-muted-foreground">per shift</p>
                </div>
              </div>

              {(detail.adjustmentAmount ?? 0) !== 0 && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                  Adjustment {formatINR(detail.adjustmentAmount ?? 0)}{detail.adjustmentNote ? ` — ${detail.adjustmentNote}` : ""}
                </p>
              )}
              {detail.notes && <p className="text-xs text-muted-foreground">Notes: {detail.notes}</p>}

              <div>
                <p className="mb-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">Change status</p>
                <div className="flex flex-wrap gap-1.5">
                  {["CONFIRMED", "COMPLETED", "PARTIAL", "NO_SHOW", "CANCELLED"].filter((s) => s !== detail.status).map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1"
                      disabled={saving}
                      onClick={() => void changeStatus(detail, s)}
                    >
                      {s === "CANCELLED" && <XCircle className="h-3 w-3 text-red-500" aria-hidden />}
                      {s === "NO_SHOW" && <UserX className="h-3 w-3 text-red-500" aria-hidden />}
                      {s === "PARTIAL" && <MinusCircle className="h-3 w-3 text-amber-500" aria-hidden />}
                      {s.replace("_", " ").charAt(0) + s.replace("_", " ").slice(1).toLowerCase()}
                    </Button>
                  ))}
                </div>
              </div>

              <Separator />

              {editRates ? (
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Billing rate (₹)</Label>
                      <Input type="number" inputMode="numeric" className="h-9" value={rateForm.billingRate} onChange={(e) => setRateForm((f) => ({ ...f, billingRate: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Payout rate (₹)</Label>
                      <Input type="number" inputMode="numeric" className="h-9" value={rateForm.payoutRate} onChange={(e) => setRateForm((f) => ({ ...f, payoutRate: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Adjustment amount (± ₹)</Label>
                      <Input type="number" inputMode="numeric" className="h-9" value={rateForm.adjustmentAmount} onChange={(e) => setRateForm((f) => ({ ...f, adjustmentAmount: e.target.value }))} placeholder="e.g. -100 or 250" />
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
                  <div className="flex gap-2">
                    <Button variant="outline" className="min-h-10 flex-1" onClick={() => setEditRates(false)}>Cancel</Button>
                    <Button className="min-h-10 flex-1" onClick={saveRates} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] text-muted-foreground">
                    By {detail.createdByName ?? "—"} · {fmtDateTime(detail.createdAt)}
                  </p>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setEditRates(true)}>
                    <Pencil className="h-3 w-3" aria-hidden />Edit rates
                  </Button>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
