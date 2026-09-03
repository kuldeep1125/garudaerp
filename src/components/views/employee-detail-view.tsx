"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api-client";
import { formatINR, parseAmount } from "@/lib/money";
import type { ViewProps } from "@/components/view-types";
import { useNav } from "@/components/providers";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/shared/status-badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Phone, MessageCircle, HandCoins, Pencil, CalendarDays, Wallet, ReceiptText, Activity,
} from "lucide-react";
import {
  AdvanceRec, AreaTrend, CHART_COLORS, DeploymentRec, EmployeeRec, Field, GiveAdvanceDialog,
  InitialAvatar, Option, SelectInput, SettlementRec, SHIFT_UNITS, ShiftBadgeInline, errMessage, fmtDay,
  todayStr, useMutation,
} from "./_shared";

interface AdjustmentRec {
  id: string; employeeId?: string; employeeName?: string; date: string;
  type: string; amount: number; reason?: string | null; createdByName?: string;
}
interface EmpDetail {
  employee: EmployeeRec;
  deployments: DeploymentRec[];
  advances: AdvanceRec[];
  adjustments: AdjustmentRec[] | { items: AdjustmentRec[] };
  settlements: SettlementRec[];
}

const ADJ_TYPES: Option[] = [
  { label: "Bonus (+)", value: "BONUS" },
  { label: "Overtime (+)", value: "OVERTIME" },
  { label: "Deduction (−)", value: "DEDUCTION" },
  { label: "Penalty (−)", value: "PENALTY" },
  { label: "Other", value: "OTHER" },
];

function AddAdjustmentDialog({ open, onOpenChange, employeeId, onDone }: {
  open: boolean; onOpenChange: (v: boolean) => void; employeeId: string; onDone: () => void;
}) {
  const [type, setType] = useState("BONUS");
  const [date, setDate] = useState(todayStr());
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const { mutate, saving } = useMutation();

  // Reset form each time the dialog opens (render-time state adjustment).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) { setType("BONUS"); setDate(todayStr()); setAmount(""); setReason(""); }
  }

  const submit = async () => {
    const amt = parseAmount(amount);
    if (amt <= 0) { toast.error("Enter a valid amount"); return; }
    const signed = type === "DEDUCTION" || type === "PENALTY" ? -amt : amt;
    const res = await mutate(
      () => api.post("/api/adjustments", { employeeId, date, type, amount: signed, reason: reason || undefined }),
      "Adjustment recorded",
      (data) => ({ module: "ADJUSTMENT", recordId: (data as { id: string }).id, onUndo: onDone })
    );
    if (res.ok) { onOpenChange(false); onDone(); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Adjustment</DialogTitle>
          <DialogDescription>Bonus/overtime add to payout; deduction/penalty subtract in settlements.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Type" required>
            <SelectInput value={type} onChange={setType} options={ADJ_TYPES} />
          </Field>
          <Field label="Amount (₹)" required>
            <Input type="number" inputMode="numeric" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-10" placeholder="0" />
          </Field>
          <Field label="Date" required>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-10" />
          </Field>
          <Field label="Reason">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} className="h-10" placeholder="Extra shift, late mark…" />
          </Field>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="min-h-10 flex-1 sm:flex-none" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="min-h-10 flex-1 sm:flex-none" onClick={submit} disabled={saving}>{saving ? "Saving…" : "Add adjustment"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function EmployeeDetailView({ params, navigate }: ViewProps) {
  const id = params?.id ?? "";
  const { back } = useNav();
  const [data, setData] = useState<EmpDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ fullName: "", mobile: "", designation: "", standardRate: "", skills: "", city: "", upiId: "", bankDetails: "", notes: "" });
  const { mutate, saving } = useMutation();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.get<EmpDetail>(`/api/employees/${id}`);
      setData(d);
      setError(null);
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { if (id) void load(); }, [id, load]);

  const afterAdvance = useCallback(async () => {
    try {
      const d = await api.get<EmpDetail>(`/api/employees/${id}`);
      setData(d);
      toast.info(`Advance balance now ${formatINR(d.employee.advanceBalance ?? 0)}`);
    } catch {
      void load();
    }
  }, [id, load]);

  const changeStatus = async (next: string) => {
    const res = await mutate(() => api.post(`/api/employees/${id}/status`, { status: next }), `Status changed to ${next.toLowerCase()}`);
    if (res.ok) void load();
  };

  const openEdit = () => {
    const e = data?.employee;
    setEditForm({
      fullName: e?.fullName ?? "", mobile: e?.mobile ?? "", designation: e?.designation ?? "",
      standardRate: e?.standardRate ? String(e.standardRate) : "", skills: e?.skills ?? "",
      city: e?.city ?? "", upiId: e?.upiId ?? "", bankDetails: e?.bankDetails ?? "", notes: e?.notes ?? "",
    });
    setEditOpen(true);
  };

  const submitEdit = async () => {
    if (!editForm.fullName.trim()) { toast.error("Full name is required"); return; }
    const res = await mutate(
      () => api.put(`/api/employees/${id}`, {
        fullName: editForm.fullName.trim(),
        mobile: editForm.mobile || undefined,
        designation: editForm.designation || undefined,
        standardRate: editForm.standardRate ? parseAmount(editForm.standardRate) : undefined,
        skills: editForm.skills || undefined,
        city: editForm.city || undefined,
        upiId: editForm.upiId || undefined,
        bankDetails: editForm.bankDetails || undefined,
        notes: editForm.notes || undefined,
      }),
      "Profile updated"
    );
    if (res.ok) { setEditOpen(false); void load(); }
  };

  const workColumns: Column<DeploymentRec>[] = [
    { key: "date", label: "Date", value: (r) => fmtDay(r.date), hideOnMobile: true },
    {
      key: "propertyName", label: "Property", primary: true,
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{r.propertyName}</p>
          <p className="text-[11px] text-muted-foreground">{fmtDay(r.date)}</p>
        </div>
      ),
      value: (r) => r.propertyName,
    },
    { key: "shift", label: "Shift", render: (r) => <ShiftBadgeInline shift={r.shift} />, value: (r) => r.shift },
    { key: "rate", label: "Rate", className: "text-right", value: (r) => formatINR(r.payoutRate ?? 0), hideOnMobile: true },
    { key: "earning", label: "Earning", className: "text-right", value: (r) => formatINR((r.payoutAmount ?? 0) + (r.adjustmentAmount ?? 0)) },
    { key: "paid", label: "Paid", render: (r) => <StatusBadge status={r.paidStatus ?? "UNPAID"} />, value: (r) => r.paidStatus ?? "UNPAID", hideOnMobile: true },
  ];

  const advances = data?.advances ?? [];
  const advTotal = advances.reduce((s, a) => s + (a.amount ?? 0), 0);
  const adjustments = Array.isArray(data?.adjustments) ? (data?.adjustments as AdjustmentRec[]) : ((data?.adjustments as { items?: AdjustmentRec[] })?.items ?? []);
  const emp = data?.employee;

  // Last-30-day activity derived client-side from the 100 most recent deployments.
  const activity = useMemo(() => {
    const days = 30;
    const byDay = new Map<string, { shifts: number; billing: number }>();
    for (const d of data?.deployments ?? []) {
      if (!d.date) continue;
      const key = String(d.date).slice(0, 10);
      const row = byDay.get(key) ?? { shifts: 0, billing: 0 };
      row.shifts += SHIFT_UNITS[String(d.shift).toUpperCase()] ?? 1;
      row.billing += d.billingAmount ?? 0;
      byDay.set(key, row);
    }
    const list: { date: string; shifts: number; billing: number }[] = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const row = byDay.get(key);
      list.push({ date: key, shifts: row?.shifts ?? 0, billing: row?.billing ?? 0 });
    }
    const worked = list.filter((d) => d.shifts > 0).length;
    const totalShifts = list.reduce((s, d) => s + d.shifts, 0);
    const billed = list.reduce((s, d) => s + d.billing, 0);

    // Utilization analytics: shift mix, weekday distribution, top properties.
    // IMPORTANT: filter to the same 30-day window as the summary numbers above.
    // FULL covers both halves → counts once in day AND night (units stay equal).
    const window30 = new Set(list.map((d) => d.date));
    let dayShifts = 0;
    let nightShifts = 0;
    const weekday = [0, 0, 0, 0, 0, 0, 0]; // Sun..Sat
    const byProp = new Map<string, number>();
    for (const d of data?.deployments ?? []) {
      if (!d.date) continue;
      const key = String(d.date).slice(0, 10);
      if (window30.has(key)) {
        const s = String(d.shift).toUpperCase();
        if (s === "NIGHT" || s === "FULL") nightShifts += 1;
        if (s === "DAY" || s === "FULL") dayShifts += 1;
        const wd = new Date(`${key}T00:00:00`).getDay();
        weekday[wd] += 1;
        byProp.set(d.propertyName, (byProp.get(d.propertyName) ?? 0) + 1);
      }
    }
    const topProps = [...byProp.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    return { list, worked, totalShifts, billed, dayShifts, nightShifts, weekday, topProps };
  }, [data?.deployments]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !emp) {
    return (
      <div className="space-y-4">
        <PageHeader title="Employee" onBack={back} />
        <Card><CardContent className="p-6 text-center">
          <p className="text-sm text-red-600 dark:text-red-400">{error ?? "Not found"}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>Retry</Button>
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={emp.fullName}
        subtitle={`${emp.code}${emp.designation ? ` · ${emp.designation}` : ""}`}
        onBack={back}
        actions={
          <>
            <Button size="sm" className="h-9 gap-1.5" onClick={() => setAdvanceOpen(true)}>
              <HandCoins className="h-4 w-4" aria-hidden />Give Advance
            </Button>
            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={openEdit}>
              <Pencil className="h-3.5 w-3.5" aria-hidden /><span className="hidden sm:inline">Edit</span>
            </Button>
          </>
        }
      />

      {/* Header card */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <InitialAvatar name={emp.fullName} className="h-14 w-14 text-lg" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate font-bold">{emp.fullName}</p>
                <StatusBadge status={emp.status} />
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Joined {fmtDay(emp.joiningDate)} · {emp.city || "—"}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className="tabular-nums">{formatINR(emp.standardRate ?? 0)}/shift</Badge>
                {(emp.advanceBalance ?? 0) > 0 ? (
                  <Badge variant="outline" className="border-red-200 bg-red-50 tabular-nums text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                    Advance due {formatINR(emp.advanceBalance ?? 0)}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
                    No advance due
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            {emp.mobile && (
              <Button asChild variant="outline" size="sm" className="h-9">
                <a href={`tel:${emp.mobile}`} aria-label={`Call ${emp.fullName}`}><Phone className="h-3.5 w-3.5" /><span className="hidden sm:inline">Call</span></a>
              </Button>
            )}
            {(emp.whatsapp || emp.mobile) && (
              <Button asChild variant="outline" size="sm" className="h-9">
                <a href={`https://wa.me/${(emp.whatsapp ?? emp.mobile ?? "").replace(/\D/g, "")}`} target="_blank" rel="noreferrer" aria-label={`WhatsApp ${emp.fullName}`}>
                  <MessageCircle className="h-3.5 w-3.5" /><span className="hidden sm:inline">WhatsApp</span>
                </a>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="work">
        <div className="overflow-x-auto no-scrollbar">
          <TabsList className="w-max min-w-full sm:min-w-0">
            <TabsTrigger value="work">Work History</TabsTrigger>
            <TabsTrigger value="advances">Advances</TabsTrigger>
            <TabsTrigger value="adjustments">Adjustments</TabsTrigger>
            <TabsTrigger value="settlements">Settlements</TabsTrigger>
            <TabsTrigger value="profile">Profile</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="work" className="mt-3 space-y-3">
          {/* Last-30-days activity: presence strip + billing trend */}
          <Card>
            <CardContent className="p-4">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Activity className="h-4 w-4 text-primary" aria-hidden />
                Last 30 days
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                <span><span className="font-bold tabular-nums text-foreground">{activity.worked}</span>/30 days worked</span>
                <span><span className="font-bold tabular-nums text-foreground">{activity.totalShifts}</span> shifts</span>
                <span><span className="font-bold tabular-nums text-foreground">{formatINR(activity.billed, { compact: true })}</span> billed</span>
              </div>
              <div className="mt-2.5 flex gap-[3px]" role="img" aria-label={`Worked ${activity.worked} of the last 30 days`}>
                {activity.list.map((d) => (
                  <div
                    key={d.date}
                    className={cn(
                      "h-5 flex-1 rounded-[3px] transition-transform hover:scale-125",
                      d.shifts === 0 && "bg-muted",
                      d.shifts === 1 && "bg-emerald-300 dark:bg-emerald-700",
                      d.shifts >= 2 && "bg-emerald-600 dark:bg-emerald-500"
                    )}
                    title={`${d.date} · ${d.shifts} shift${d.shifts === 1 ? "" : "s"} · ${formatINR(d.billing)}`}
                  />
                ))}
              </div>
              <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
                <span>30 days ago</span>
                <span className="flex items-center gap-1">Less <span className="h-2 w-3 rounded-[2px] bg-muted" aria-hidden /><span className="h-2 w-3 rounded-[2px] bg-emerald-300 dark:bg-emerald-700" aria-hidden /><span className="h-2 w-3 rounded-[2px] bg-emerald-600 dark:bg-emerald-500" aria-hidden /> More</span>
                <span>Today</span>
              </div>
              {activity.totalShifts > 0 && (
                <div className="mt-4">
                  <p className="mb-1 text-[11px] font-medium text-muted-foreground">Daily billing</p>
                  <AreaTrend
                    data={activity.list as unknown as Record<string, unknown>[]}
                    xKey="date"
                    height={140}
                    series={[{ key: "billing", label: "Billing", color: CHART_COLORS.emerald }]}
                  />
                </div>
              )}

              {/* Utilization analytics: shift mix · weekday load · top properties */}
              {activity.totalShifts > 0 && (
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {/* Shift mix — day vs night stacked bar */}
                  <div className="rounded-xl border bg-muted/30 p-3 transition-colors hover:bg-muted/50">
                    <p className="text-[11px] font-medium text-muted-foreground">Shift mix · 30 days</p>
                    <div
                      className="mt-2.5 flex h-2.5 w-full overflow-hidden rounded-full"
                      role="img"
                      aria-label={`${activity.dayShifts} day shifts, ${activity.nightShifts} night shifts`}
                    >
                      <span
                        className="h-full bg-amber-400 transition-all dark:bg-amber-500"
                        style={{ width: `${Math.round((activity.dayShifts / activity.totalShifts) * 100)}%` }}
                        title={`Day · ${activity.dayShifts} shifts`}
                      />
                      <span
                        className="h-full bg-slate-500 transition-all dark:bg-slate-400"
                        style={{ width: `${Math.round((activity.nightShifts / activity.totalShifts) * 100)}%` }}
                        title={`Night · ${activity.nightShifts} shifts`}
                      />
                    </div>
                    <div className="mt-2.5 space-y-1 text-[11px]">
                      <p className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                          <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400 dark:bg-amber-500" aria-hidden />Day
                        </span>
                        <span className="shrink-0 font-bold tabular-nums">
                          {activity.dayShifts} <span className="font-normal text-muted-foreground">({Math.round((activity.dayShifts / activity.totalShifts) * 100)}%)</span>
                        </span>
                      </p>
                      <p className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                          <span className="h-2 w-2 shrink-0 rounded-full bg-slate-500 dark:bg-slate-400" aria-hidden />Night
                        </span>
                        <span className="shrink-0 font-bold tabular-nums">
                          {activity.nightShifts} <span className="font-normal text-muted-foreground">({Math.round((activity.nightShifts / activity.totalShifts) * 100)}%)</span>
                        </span>
                      </p>
                    </div>
                  </div>

                  {/* Busiest weekdays — mini bar chart Mon..Sun */}
                  <div className="rounded-xl border bg-muted/30 p-3 transition-colors hover:bg-muted/50">
                    <p className="text-[11px] font-medium text-muted-foreground">Busiest weekdays</p>
                    {(() => {
                      const order = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sun
                      const labels = ["M", "T", "W", "T", "F", "S", "S"];
                      const max = Math.max(...order.map((i) => activity.weekday[i]), 1);
                      return (
                        <div className="mt-2.5 flex h-14 items-end justify-between gap-1.5">
                          {order.map((i, idx) => (
                            <div key={i} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
                              <div
                                className={cn(
                                  "w-full rounded-t-[3px] transition-all hover:opacity-80",
                                  activity.weekday[i] > 0 ? "bg-emerald-500/80 dark:bg-emerald-500" : "bg-muted"
                                )}
                                style={{ height: `${Math.max((activity.weekday[i] / max) * 100, activity.weekday[i] > 0 ? 8 : 4)}%` }}
                                title={`${activity.weekday[i]} shift${activity.weekday[i] === 1 ? "" : "s"}`}
                              />
                              <span className="text-[9px] text-muted-foreground">{labels[idx]}</span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Top properties — where this employee works most */}
                  <div className="rounded-xl border bg-muted/30 p-3 transition-colors hover:bg-muted/50">
                    <p className="text-[11px] font-medium text-muted-foreground">Top properties</p>
                    <div className="mt-2.5 space-y-2">
                      {activity.topProps.map(([name, count]) => (
                        <div key={name} className="min-w-0">
                          <p className="flex items-center justify-between gap-2 text-[11px]">
                            <span className="min-w-0 truncate" title={name}>{name}</span>
                            <span className="shrink-0 font-bold tabular-nums">{count}</span>
                          </p>
                          <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-teal-500/80 transition-all dark:bg-teal-400"
                              style={{ width: `${Math.round((count / (activity.topProps[0]?.[1] ?? 1)) * 100)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <DataTable
            columns={workColumns}
            rows={data?.deployments ?? []}
            rowKey={(r) => r.id}
            onRowClick={(r) => navigate("deployments", { date: r.date })}
            emptyIcon={CalendarDays}
            emptyTitle="No deployments yet"
            emptyDescription="Deploy this employee to a property to build history."
          />
        </TabsContent>

        <TabsContent value="advances" className="mt-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Total taken: <span className="font-bold tabular-nums text-foreground">{formatINR(advTotal)}</span></p>
            <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => setAdvanceOpen(true)}>
              <HandCoins className="h-3.5 w-3.5" />Give
            </Button>
          </div>
          <DataTable
            columns={[
              { key: "date", label: "Date", value: (r) => fmtDay(r.date), hideOnMobile: true },
              { key: "amount", label: "Amount", primary: true, render: (r) => <span className="font-semibold tabular-nums">{formatINR(r.amount)}</span>, value: (r) => formatINR(r.amount) },
              { key: "reason", label: "Reason", value: (r) => r.reason ?? "—" },
              { key: "method", label: "Method", value: (r) => r.method ?? "—", hideOnMobile: true },
              { key: "givenBy", label: "Given by", value: (r) => r.givenByName ?? "—", hideOnMobile: true },
            ] as Column<AdvanceRec>[]}
            rows={advances}
            rowKey={(r) => r.id}
            emptyIcon={Wallet}
            emptyTitle="No advances given"
            emptyDescription="Advances given to this employee will appear here."
          />
        </TabsContent>

        <TabsContent value="adjustments" className="mt-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Bonuses add, deductions subtract at settlement</p>
            <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => setAdjustOpen(true)}>
              <ReceiptText className="h-3.5 w-3.5" />Add
            </Button>
          </div>
          <DataTable
            columns={[
              { key: "date", label: "Date", value: (r) => fmtDay(r.date), hideOnMobile: true },
              {
                key: "type", label: "Type", primary: true,
                render: (r) => <div className="min-w-0"><p className="truncate font-medium">{r.type}{r.reason ? ` · ${r.reason}` : ""}</p><p className="text-[11px] text-muted-foreground">{fmtDay(r.date)}</p></div>,
                value: (r) => r.type,
              },
              {
                key: "amount", label: "Amount", className: "text-right",
                render: (r) => <span className={cn("font-semibold tabular-nums", r.amount >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>{formatINR(r.amount)}</span>,
                value: (r) => formatINR(r.amount),
              },
              { key: "by", label: "By", value: (r) => r.createdByName ?? "—", hideOnMobile: true },
            ] as Column<AdjustmentRec>[]}
            rows={adjustments}
            rowKey={(r) => r.id}
            emptyIcon={ReceiptText}
            emptyTitle="No adjustments"
            emptyDescription="Bonuses, overtime and penalties appear here."
          />
        </TabsContent>

        <TabsContent value="settlements" className="mt-3">
          <DataTable
            columns={[
              { key: "month", label: "Month", primary: true, render: (r) => <span className="font-medium tabular-nums">{r.month}</span>, value: (r) => r.month },
              { key: "days", label: "Days", className: "text-right", value: (r) => String(r.totalDays ?? 0), hideOnMobile: true },
              { key: "gross", label: "Gross", className: "text-right", value: (r) => formatINR(r.grossEarnings ?? 0), hideOnMobile: true },
              { key: "advance", label: "Adv. deducted", className: "text-right", value: (r) => formatINR(r.advanceDeducted ?? 0), hideOnMobile: true },
              { key: "net", label: "Net payable", className: "text-right", render: (r) => <span className="font-bold tabular-nums">{formatINR(r.netPayable ?? 0)}</span>, value: (r) => formatINR(r.netPayable ?? 0) },
              { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} />, value: (r) => r.status },
            ] as Column<SettlementRec>[]}
            rows={data?.settlements ?? []}
            rowKey={(r) => r.id}
            onRowClick={(r) => navigate("settlements", { month: r.month })}
            emptyIcon={ReceiptText}
            emptyTitle="No settlements yet"
            emptyDescription="Generate month-end settlements to see them here."
          />
        </TabsContent>

        <TabsContent value="profile" className="mt-3">
          <Card>
            <CardContent className="p-4">
              <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                {([
                  ["Mobile", emp.mobile], ["WhatsApp", emp.whatsapp], ["Gender", emp.gender], ["City", emp.city],
                  ["Address", emp.address], ["Skills", emp.skills], ["Rate type", emp.rateType ?? "PER_SHIFT"],
                  ["Preferred payment", emp.preferredPaymentMethod], ["UPI ID", emp.upiId], ["Bank details", emp.bankDetails],
                  ["Emergency contact", (emp as unknown as { emergencyContact?: string | null }).emergencyContact],
                  ["Notes", emp.notes],
                ] as [string, string | null | undefined][]).map(([k, v]) => (
                  <div key={k} className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</p>
                    <p className="truncate text-sm" title={v ?? undefined}>{v || "—"}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
                <span className="mr-1 text-xs text-muted-foreground">Status control:</span>
                {["ACTIVE", "INACTIVE"].filter((s) => s !== emp.status).map((s) => (
                  <Button key={s} variant="outline" size="sm" className="h-8" disabled={saving} onClick={() => void changeStatus(s)}>
                    Mark {s.charAt(0) + s.slice(1).toLowerCase()}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <GiveAdvanceDialog open={advanceOpen} onOpenChange={setAdvanceOpen} defaultEmployeeId={id} employees={emp ? [{ id: emp.id, fullName: emp.fullName, code: emp.code, standardRate: emp.standardRate, advanceBalance: emp.advanceBalance }] : undefined} onDone={afterAdvance} />
      <AddAdjustmentDialog open={adjustOpen} onOpenChange={setAdjustOpen} employeeId={id} onDone={load} />

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit profile</DialogTitle>
            <DialogDescription>Update contact, rate and payment details.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Full name" required className="sm:col-span-2">
              <Input value={editForm.fullName} onChange={(e) => setEditForm((f) => ({ ...f, fullName: e.target.value }))} className="h-10" />
            </Field>
            <Field label="Mobile"><Input value={editForm.mobile} onChange={(e) => setEditForm((f) => ({ ...f, mobile: e.target.value }))} className="h-10" /></Field>
            <Field label="Designation"><Input value={editForm.designation} onChange={(e) => setEditForm((f) => ({ ...f, designation: e.target.value }))} className="h-10" /></Field>
            <Field
              label="Payout rate (₹/shift)"
              hint="Applies to future deployments only — past records keep their original rate."
            >
              <Input type="number" inputMode="numeric" value={editForm.standardRate} onChange={(e) => setEditForm((f) => ({ ...f, standardRate: e.target.value }))} className="h-10" />
            </Field>
            <Field label="City"><Input value={editForm.city} onChange={(e) => setEditForm((f) => ({ ...f, city: e.target.value }))} className="h-10" /></Field>
            <Field label="Skills" className="sm:col-span-2"><Input value={editForm.skills} onChange={(e) => setEditForm((f) => ({ ...f, skills: e.target.value }))} className="h-10" /></Field>
            <Field label="UPI ID"><Input value={editForm.upiId} onChange={(e) => setEditForm((f) => ({ ...f, upiId: e.target.value }))} className="h-10" /></Field>
            <Field label="Bank details"><Input value={editForm.bankDetails} onChange={(e) => setEditForm((f) => ({ ...f, bankDetails: e.target.value }))} className="h-10" /></Field>
            <Field label="Notes" className="sm:col-span-2"><Input value={editForm.notes} onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))} className="h-10" /></Field>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="min-h-10 flex-1 sm:flex-none" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button className="min-h-10 flex-1 sm:flex-none" onClick={submitEdit} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
