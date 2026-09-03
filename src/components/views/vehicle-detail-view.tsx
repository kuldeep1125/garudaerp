"use client";

import { useEffect, useState } from "react";
import { api, qs } from "@/lib/api-client";
import { formatINR, parseAmount } from "@/lib/money";
import type { ViewProps } from "@/components/view-types";
import { useNav } from "@/components/providers";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { StatCard, StatGrid } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  CarFront, Plus, Route, Receipt, CalendarClock, Wrench, IndianRupee, BadgeCheck, ShieldAlert,
} from "lucide-react";
import {
  type VehicleRec, type TripRec, type ExpenseRec, type Option, SelectInput, Field, ErrorState,
  useAsync, useMutation, fmtDay, todayStr,
} from "./_shared";

interface EmiRec { id: string; vehicleId: string; month: string; dueDate: string; amount: number; paidDate?: string | null; status: string; reference?: string | null }
interface MaintenanceRec {
  id: string; vehicleId: string; vehicleName?: string; date: string; type: string;
  description?: string | null; cost?: number | null; nextDueDate?: string | null; status: string; createdByName?: string | null;
}
interface VehicleDetail { vehicle: VehicleRec; trips: TripRec[]; expenses: ExpenseRec[]; emis: EmiRec[]; maintenance: MaintenanceRec[] }

interface ExpenseCategoryRec { id: string; name: string; business: string; kind?: string }

const VEHICLE_STATUS_OPTIONS: Option[] = ["AVAILABLE", "RENTED", "TRIP", "MAINTENANCE", "INACTIVE"]
  .map((s) => ({ label: s.charAt(0) + s.slice(1).toLowerCase(), value: s }));

const METHOD_OPTIONS: Option[] = ["Cash", "UPI", "Bank", "Card", "Cheque", "Other"].map((m) => ({ label: m, value: m }));

function daysUntil(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr.length === 10 ? `${dateStr}T00:00:00` : dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

function tripTotal(t: TripRec): number {
  return t.finalAmount ?? (t.agreedAmount + (t.extraCharges ?? 0));
}

function expiryCls(dateStr?: string | null): string {
  const d = daysUntil(dateStr);
  if (d === null) return "";
  if (d < 0) return "text-red-600 dark:text-red-400 font-semibold";
  if (d <= 30) return "text-amber-600 dark:text-amber-400 font-semibold";
  return "";
}

function expiryHint(dateStr?: string | null): string {
  const d = daysUntil(dateStr);
  if (d === null) return "";
  if (d < 0) return ` (expired ${Math.abs(d)}d ago)`;
  if (d <= 30) return ` (in ${d}d)`;
  return "";
}

// ---------------------------------------------------------------------------
// Add expense (transport, vehicle prefilled)
// ---------------------------------------------------------------------------

function VehicleExpenseDialog({ open, onOpenChange, vehicleId, onDone }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  vehicleId: string;
  onDone: () => void;
}) {
  const [form, setForm] = useState({ date: todayStr(), categoryId: "", amount: "", method: "Cash", description: "", notes: "" });
  const [categories, setCategories] = useState<ExpenseCategoryRec[]>([]);
  const { mutate, saving } = useMutation();

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setForm({ date: todayStr(), categoryId: "", amount: "", method: "Cash", description: "", notes: "" });
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api.get<{ items: ExpenseCategoryRec[] }>("/api/expense-categories" + qs({ business: "TRANSPORT" }))
      .then((d) => { if (!cancelled) setCategories(d.items ?? []); })
      .catch(() => { if (!cancelled) setCategories([]); });
    return () => { cancelled = true; };
  }, [open]);

  const submit = async () => {
    const amt = parseAmount(form.amount);
    if (amt <= 0) { toast.error("Enter a valid amount"); return; }
    if (!form.date) { toast.error("Date is required"); return; }
    const res = await mutate(
      () => api.post("/api/expenses", {
        date: form.date,
        business: "TRANSPORT",
        vehicleId: vehicleId || undefined,
        categoryId: form.categoryId || undefined,
        amount: amt,
        method: form.method || undefined,
        description: form.description || undefined,
        notes: form.notes || undefined,
      }),
      "Expense recorded"
    );
    if (res.ok) { onOpenChange(false); onDone(); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Vehicle Expense</DialogTitle>
          <DialogDescription>Recorded under the Transport business for this vehicle.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Date" required>
            <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className="h-10" />
          </Field>
          <Field label="Category">
            <SelectInput
              value={form.categoryId}
              onChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}
              placeholder="Select category…"
              options={categories.map((c) => ({ label: c.name, value: c.id }))}
            />
          </Field>
          <Field label="Amount (₹)" required>
            <Input type="number" inputMode="numeric" min="1" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} className="h-10" placeholder="0" />
          </Field>
          <Field label="Method">
            <SelectInput value={form.method} onChange={(v) => setForm((f) => ({ ...f, method: v }))} options={METHOD_OPTIONS} />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="h-10" placeholder="Fuel, toll, repair…" />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Optional" />
          </Field>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="min-h-10 flex-1 sm:flex-none" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="min-h-10 flex-1 sm:flex-none" onClick={submit} disabled={saving}>{saving ? "Saving…" : "Add expense"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Add maintenance
// ---------------------------------------------------------------------------

function AddMaintenanceDialog({ open, onOpenChange, vehicleId, onDone }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  vehicleId: string;
  onDone: () => void;
}) {
  const [form, setForm] = useState({ date: todayStr(), type: "", description: "", cost: "", nextDueDate: "" });
  const { mutate, saving } = useMutation();

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setForm({ date: todayStr(), type: "", description: "", cost: "", nextDueDate: "" });
  }

  const submit = async () => {
    if (!form.type.trim()) { toast.error("Maintenance type is required"); return; }
    if (!form.date) { toast.error("Date is required"); return; }
    const res = await mutate(
      () => api.post("/api/maintenance", {
        vehicleId,
        date: form.date,
        type: form.type.trim(),
        description: form.description || undefined,
        cost: form.cost ? parseAmount(form.cost) : undefined,
        nextDueDate: form.nextDueDate || undefined,
      }),
      "Maintenance scheduled"
    );
    if (res.ok) { onOpenChange(false); onDone(); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Maintenance</DialogTitle>
          <DialogDescription>Marking it done later auto-creates the expense for this vehicle.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Date" required>
            <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className="h-10" />
          </Field>
          <Field label="Type" required>
            <Input value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} className="h-10" placeholder="Service, Tyres, Repair…" />
          </Field>
          <Field label="Cost (₹)">
            <Input type="number" inputMode="numeric" min="0" value={form.cost} onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))} className="h-10" placeholder="0" />
          </Field>
          <Field label="Next due date">
            <Input type="date" value={form.nextDueDate} onChange={(e) => setForm((f) => ({ ...f, nextDueDate: e.target.value }))} className="h-10" />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} placeholder="Optional details" />
          </Field>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="min-h-10 flex-1 sm:flex-none" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="min-h-10 flex-1 sm:flex-none" onClick={submit} disabled={saving}>{saving ? "Saving…" : "Add maintenance"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export default function VehicleDetailView({ params, navigate }: ViewProps) {
  const id = params?.id ?? "";
  const { back } = useNav();
  const { mutate, saving } = useMutation();

  const { data, loading, error, reload } = useAsync<VehicleDetail>(
    () => (id ? api.get(`/api/vehicles/${id}`) : Promise.reject(new Error("No vehicle selected"))),
    [id]
  );

  const [expenseOpen, setExpenseOpen] = useState(false);
  const [maintenanceOpen, setMaintenanceOpen] = useState(false);

  if (!id) {
    return (
      <div className="py-10">
        <ErrorState message="No vehicle selected." />
        <div className="mt-4 flex justify-center">
          <Button variant="outline" className="min-h-10" onClick={() => navigate("vehicles")}>Back to Vehicles</Button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="h-10 w-56 animate-pulse rounded-lg bg-muted" />
        <div className="h-48 animate-pulse rounded-xl bg-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="py-10">
        <ErrorState message={error ?? "Vehicle not found"} onRetry={() => void reload()} />
        <div className="mt-4 flex justify-center">
          <Button variant="outline" className="min-h-10" onClick={() => navigate("vehicles")}>Back to Vehicles</Button>
        </div>
      </div>
    );
  }

  const { vehicle: v, trips, expenses, emis, maintenance } = data;
  const sortedEmis = [...emis].sort((a, b) => a.month.localeCompare(b.month));
  const pendingEmis = sortedEmis.filter((e) => e.status === "PENDING").length;

  const changeStatus = async (next: string) => {
    const res = await mutate(() => api.put(`/api/vehicles/${v.id}`, { status: next }), `Marked ${next.toLowerCase()}`);
    if (res.ok) void reload();
  };

  const markEmiPaid = async (emi: EmiRec) => {
    const res = await mutate(
      () => api.put(`/api/emis/${emi.id}/pay`, { paidDate: todayStr() }),
      "EMI recorded & expense created",
      () => ({ module: "EMI", recordId: emi.id, onUndo: () => void reload() })
    );
    if (res.ok) void reload();
  };

  const generateSchedule = async () => {
    let createdCount: number | null = null;
    const res = await mutate(async () => {
      const d = await api.post<{ created?: number }>(`/api/vehicles/${v.id}/emis/generate`);
      createdCount = typeof d.created === "number" ? d.created : null;
      return d;
    });
    if (res.ok) {
      toast.success(`EMI schedule ready${createdCount !== null ? ` — ${createdCount} installment(s) added` : ""}`);
      void reload();
    }
  };

  const markMaintenanceDone = async (m: MaintenanceRec) => {
    const res = await mutate(() => api.put(`/api/maintenance/${m.id}`, { status: "DONE" }), "Maintenance marked done — expense created", () => ({ module: "MAINTENANCE", recordId: m.id, onUndo: () => void reload() }));
    if (res.ok) void reload();
  };

  const tripColumns: Column<TripRec>[] = [
    {
      key: "period", label: "Period", primary: true,
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{fmtDay(r.startAt)} → {r.endAt ? fmtDay(r.endAt) : "ongoing"}</p>
          <p className="truncate text-[11px] text-muted-foreground">{r.clientName ?? "—"}</p>
        </div>
      ),
      value: (r) => `${fmtDay(r.startAt)} → ${r.endAt ? fmtDay(r.endAt) : "ongoing"}`,
    },
    { key: "client", label: "Client", value: (r) => r.clientName ?? "—", hideOnMobile: true },
    {
      key: "amount", label: "Amount", className: "text-right",
      render: (r) => <span className="font-semibold tabular-nums">{formatINR(tripTotal(r))}</span>,
      value: (r) => formatINR(tripTotal(r)),
    },
    { key: "paymentStatus", label: "Payment", render: (r) => <StatusBadge status={r.paymentStatus} />, value: (r) => r.paymentStatus },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} />, value: (r) => r.status },
  ];

  const expenseColumns: Column<ExpenseRec>[] = [
    { key: "date", label: "Date", value: (r) => fmtDay(r.date), hideOnMobile: true },
    {
      key: "description", label: "Expense", primary: true,
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{r.description || r.categoryName || "Vehicle expense"}</p>
          <p className="truncate text-[11px] text-muted-foreground">{r.categoryName ?? "Uncategorized"} · {fmtDay(r.date)}</p>
        </div>
      ),
      value: (r) => r.description || r.categoryName || "Vehicle expense",
    },
    { key: "category", label: "Category", value: (r) => r.categoryName ?? "—", hideOnMobile: true },
    {
      key: "amount", label: "Amount", className: "text-right",
      render: (r) => <span className="font-semibold tabular-nums">{formatINR(r.amount)}</span>,
      value: (r) => formatINR(r.amount),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title={v.name}
        subtitle={[v.make, v.model, v.year].filter(Boolean).join(" · ") || v.registrationNumber}
        onBack={back}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={v.status} />
            <div className="w-36">
              <SelectInput value={v.status} onChange={(s) => void changeStatus(s)} options={VEHICLE_STATUS_OPTIONS} placeholder="Status" />
            </div>
          </div>
        }
      />

      {/* Identity strip */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3 sm:p-4">
          <span className="rounded-md bg-muted px-2 py-1 font-mono text-xs tracking-tight">{v.registrationNumber}</span>
          {v.variant && <span className="text-xs text-muted-foreground">{v.variant}</span>}
          <span className="text-xs text-muted-foreground">Purchased {v.purchaseDate ? fmtDay(v.purchaseDate) : "—"}{(v.purchasePrice ?? 0) > 0 ? ` · ${formatINR(v.purchasePrice ?? 0)}` : ""}</span>
          {(daysUntil(v.insuranceExpiry) ?? 999) <= 30 && v.insuranceExpiry && (
            <span className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
              <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
              Insurance {expiryHint(v.insuranceExpiry).replace(/[()]/g, "")}
            </span>
          )}
        </CardContent>
      </Card>

      {/* Stats */}
      <StatGrid cols={5}>
        <StatCard label="Month revenue" value={formatINR(v.stats?.monthRevenue ?? 0, { compact: true })} icon={IndianRupee} tone="positive" />
        <StatCard label="Month expense" value={formatINR(v.stats?.monthExpense ?? 0, { compact: true })} icon={Receipt} tone="warning" />
        <StatCard label="Month EMI" value={formatINR(v.stats?.monthEmi ?? 0, { compact: true })} icon={CalendarClock} />
        <StatCard label="Month net" value={formatINR(v.stats?.monthNet ?? 0, { compact: true })} icon={CarFront} tone={(v.stats?.monthNet ?? 0) >= 0 ? "positive" : "negative"} />
        <StatCard label="All-time net" value={formatINR(v.stats?.net ?? 0, { compact: true })} icon={BadgeCheck} tone={(v.stats?.net ?? 0) >= 0 ? "positive" : "negative"} hint="Revenue − expenses − EMI" />
      </StatGrid>

      {/* Info grid */}
      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
            <InfoCell label="Make" value={v.make || "—"} />
            <InfoCell label="Model" value={v.model || "—"} />
            <InfoCell label="Variant" value={v.variant || "—"} />
            <InfoCell label="Year" value={v.year ? String(v.year) : "—"} />
            <InfoCell label="Purchase date" value={v.purchaseDate ? fmtDay(v.purchaseDate) : "—"} />
            <InfoCell label="Purchase price" value={(v.purchasePrice ?? 0) > 0 ? formatINR(v.purchasePrice ?? 0) : "—"} />
            <InfoCell label="Loan amount" value={(v.loanAmount ?? 0) > 0 ? formatINR(v.loanAmount ?? 0) : "—"} />
            <InfoCell label="Monthly EMI" value={(v.monthlyEmi ?? 0) > 0 ? `${formatINR(v.monthlyEmi ?? 0)}/mo` : "—"} />
            <InfoCell
              label="EMI period"
              value={(v.emiStartDate || v.emiEndDate) ? `${v.emiStartDate ? fmtDay(v.emiStartDate) : "—"} → ${v.emiEndDate ? fmtDay(v.emiEndDate) : "ongoing"}` : "—"}
            />
            <InfoCell label="Installments" value={sortedEmis.length > 0 ? `${sortedEmis.length} (${pendingEmis} pending)` : "—"} />
            <InfoCell label="Insurance company" value={v.insuranceCompany || "—"} />
            <InfoCell label="Insurance number" value={v.insuranceNumber || "—"} />
            <InfoCell label="Insurance expiry" value={v.insuranceExpiry ? `${fmtDay(v.insuranceExpiry)}${expiryHint(v.insuranceExpiry)}` : "—"} className={expiryCls(v.insuranceExpiry)} />
            <InfoCell label="Fitness expiry" value={v.fitnessExpiry ? `${fmtDay(v.fitnessExpiry)}${expiryHint(v.fitnessExpiry)}` : "—"} className={expiryCls(v.fitnessExpiry)} />
            <InfoCell label="Permit" value={v.permitInfo || "—"} />
            <InfoCell label="Notes" value={v.notes || "—"} className="col-span-2 sm:col-span-3 lg:col-span-4" />
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="trips">
        <TabsList className="grid w-full grid-cols-4 sm:w-auto sm:inline-flex">
          <TabsTrigger value="trips">Trips ({trips.length})</TabsTrigger>
          <TabsTrigger value="expenses">Expenses ({expenses.length})</TabsTrigger>
          <TabsTrigger value="emi">EMI ({emis.length})</TabsTrigger>
          <TabsTrigger value="maintenance">Maintenance ({maintenance.length})</TabsTrigger>
        </TabsList>

        {/* Trips */}
        <TabsContent value="trips" className="mt-3">
          <Card>
            <CardContent className="p-3 sm:p-4">
              <DataTable
                columns={tripColumns}
                rows={trips}
                rowKey={(r) => r.id}
                onRowClick={() => navigate("trips", { vehicleId: v.id })}
                emptyIcon={Route}
                emptyTitle="No trips for this vehicle"
                emptyDescription="Create a rental from the Trips & Rentals screen."
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Expenses */}
        <TabsContent value="expenses" className="mt-3">
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="mb-3 flex justify-end">
                <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={() => setExpenseOpen(true)}>
                  <Plus className="h-4 w-4" aria-hidden />Add Expense
                </Button>
              </div>
              <DataTable
                columns={expenseColumns}
                rows={expenses}
                rowKey={(r) => r.id}
                emptyIcon={Receipt}
                emptyTitle="No expenses recorded"
                emptyDescription="Fuel, tolls, repairs and other vehicle costs appear here."
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* EMI */}
        <TabsContent value="emi" className="mt-3">
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">
                  EMI schedule
                  {sortedEmis.length === 0 && (v.monthlyEmi ?? 0) > 0 && (
                    <span className="ml-2 text-xs font-normal text-amber-600 dark:text-amber-400">Loan configured — generate the schedule</span>
                  )}
                </p>
                <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={() => void generateSchedule()} disabled={saving}>
                  <CalendarClock className="h-4 w-4" aria-hidden />Generate Schedule
                </Button>
              </div>

              {sortedEmis.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">
                  No EMI schedule yet. Generate one from the loan config (start date, installment count, monthly EMI).
                </p>
              ) : (
                <div className="max-h-96 overflow-y-auto rounded-xl border">
                  {sortedEmis.map((e) => (
                    <div key={e.id} className="flex items-center justify-between gap-3 border-b px-3 py-2.5 last:border-b-0">
                      <div className="min-w-0">
                        <p className="text-sm font-medium tabular-nums">{e.month}</p>
                        <p className="text-[11px] text-muted-foreground">Due {fmtDay(e.dueDate)}{e.paidDate ? ` · paid ${fmtDay(e.paidDate)}` : ""}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-sm font-semibold tabular-nums">{formatINR(e.amount)}</span>
                        <StatusBadge status={e.status} />
                        {e.status === "PENDING" && (
                          <Button size="sm" variant="outline" className="h-8 text-xs" disabled={saving} onClick={() => void markEmiPaid(e)}>
                            Mark Paid
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Maintenance */}
        <TabsContent value="maintenance" className="mt-3">
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="mb-3 flex justify-end">
                <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={() => setMaintenanceOpen(true)}>
                  <Wrench className="h-4 w-4" aria-hidden />Add Maintenance
                </Button>
              </div>

              {maintenance.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">No maintenance records yet.</p>
              ) : (
                <div className="max-h-96 space-y-2 overflow-y-auto pr-0.5">
                  {maintenance.map((m) => (
                    <div key={m.id} className="rounded-xl border p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{m.type}{(m.cost ?? 0) > 0 && <span className="ml-2 font-semibold tabular-nums">{formatINR(m.cost ?? 0)}</span>}</p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {fmtDay(m.date)}{m.nextDueDate ? ` · next due ${fmtDay(m.nextDueDate)}` : ""}
                            {m.createdByName ? ` · by ${m.createdByName}` : ""}
                          </p>
                          {m.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{m.description}</p>}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <StatusBadge status={m.status} />
                          {m.status === "SCHEDULED" && (
                            <Button size="sm" variant="outline" className="h-8 text-xs" disabled={saving} onClick={() => void markMaintenanceDone(m)}>
                              Mark Done
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <VehicleExpenseDialog open={expenseOpen} onOpenChange={setExpenseOpen} vehicleId={v.id} onDone={() => void reload()} />
      <AddMaintenanceDialog open={maintenanceOpen} onOpenChange={setMaintenanceOpen} vehicleId={v.id} onDone={() => void reload()} />
    </div>
  );
}

function InfoCell({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 break-words text-sm tabular-nums">{value}</p>
    </div>
  );
}
