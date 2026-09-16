"use client";

import { useEffect, useState, useMemo } from "react";
import { api, qs } from "@/lib/api-client";
import { formatINR, parseAmount } from "@/lib/money";
import type { ViewProps } from "@/components/view-types";
import { useNav } from "@/components/providers";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { StatCard, StatGrid } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { VehicleFormDialog } from "@/components/shared/vehicle-form-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  CarFront, Plus, Route, Receipt, CalendarClock, Wrench, IndianRupee, BadgeCheck, ShieldAlert,
  Pencil, RefreshCw, ArrowDownLeft, ArrowUpRight, FileText, CheckCircle, TrendingUp, TrendingDown,
} from "lucide-react";
import {
  FormulaInspectorDialog,
  type FormulaInspectorData,
} from "@/components/shared/formula-inspector-dialog";
import {
  TransactionLineageDialog,
  type TransactionLineageData,
} from "@/components/shared/transaction-lineage-dialog";
import {
  type VehicleRec, type TripRec, type ExpenseRec, type Option, SelectInput, Field, ErrorState, MoneyInput,
  useAsync, useMutation, fmtDay, todayStr,
} from "./_shared";

interface EmiRec { id: string; vehicleId: string; month: string; dueDate: string; amount: number; paidDate?: string | null; status: string; reference?: string | null }
interface MaintenanceRec {
  id: string; vehicleId: string; vehicleName?: string; date: string; type: string;
  description?: string | null; cost?: number | null; nextDueDate?: string | null; status: string; createdByName?: string | null;
}
interface VehicleDetail { vehicle: VehicleRec; trips: TripRec[]; expenses: ExpenseRec[]; emis: EmiRec[]; maintenance: MaintenanceRec[] }

interface ExpenseCategoryRec { id: string; name: string; business: string; kind?: string; isActive?: boolean }

const VEHICLE_STATUS_OPTIONS: Option[] = ["AVAILABLE", "RENTED", "TRIP", "MAINTENANCE", "INACTIVE"]
  .map((s) => ({ label: s.charAt(0) + s.slice(1).toLowerCase(), value: s }));

const METHOD_OPTIONS: Option[] = ["Cash", "UPI", "Bank", "Card", "Cheque", "Other"].map((m) => ({ label: m, value: m }));

const MAINTENANCE_TYPE_OPTIONS: Option[] = ["SERVICE", "REPAIR", "TYRES", "OTHER"]
  .map((t) => ({ label: t.charAt(0) + t.slice(1).toLowerCase(), value: t }));

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
              options={categories.filter((c) => c.isActive !== false).map((c) => ({ label: c.name, value: c.id }))}
            />
          </Field>
          <Field label="Amount (₹)" required>
            <MoneyInput value={form.amount} onChange={(v) => setForm((f) => ({ ...f, amount: v }))} min={1} className="h-10" />
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
            <MoneyInput value={form.cost} onChange={(v) => setForm((f) => ({ ...f, cost: v }))} min={0} className="h-10" />
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
// Edit maintenance
// ---------------------------------------------------------------------------

function EditMaintenanceDialog({ open, onOpenChange, record, onDone }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  record: MaintenanceRec | null;
  onDone: () => void;
}) {
  const [form, setForm] = useState({ date: "", type: "", cost: "", nextDueDate: "", description: "" });
  const { mutate, saving } = useMutation();

  // Reset form each time the dialog opens (render-time state adjustment).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setForm({
        date: record?.date?.slice(0, 10) ?? todayStr(),
        type: record?.type ?? "",
        cost: record?.cost ? String(record.cost) : "",
        nextDueDate: record?.nextDueDate?.slice(0, 10) ?? "",
        description: record?.description ?? "",
      });
    }
  }

  const submit = async () => {
    if (!form.date) { toast.error("Date is required"); return; }
    if (!form.type) { toast.error("Maintenance type is required"); return; }
    const cost = form.cost ? parseAmount(form.cost) : 0;
    if (cost < 0) { toast.error("Cost cannot be negative"); return; }
    let synced = false;
    const res = await mutate(async () => {
      const d = await api.put<{ expenseSynced?: boolean }>(`/api/maintenance/${record!.id}`, {
        date: form.date,
        type: form.type,
        cost,
        nextDueDate: form.nextDueDate || null,
        description: form.description || null,
      });
      synced = Boolean(d.expenseSynced);
      return d;
    });
    if (res.ok) {
      toast.success(
        synced
          ? "Maintenance updated — linked expense synced to the new cost"
          : "Maintenance updated",
      );
      onOpenChange(false);
      onDone();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Maintenance</DialogTitle>
          <DialogDescription>
            {record?.status === "DONE"
              ? "Already done: changing the cost keeps the linked expense in sync (same date, new amount)."
              : "Marking it done later auto-creates the expense for this vehicle."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Date" required>
            <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className="h-10" />
          </Field>
          <Field label="Type" required>
            <SelectInput
              value={form.type}
              onChange={(v) => setForm((f) => ({ ...f, type: v }))}
              placeholder="Select type…"
              options={MAINTENANCE_TYPE_OPTIONS}
            />
          </Field>
          <Field label="Cost (₹)">
            <MoneyInput value={form.cost} onChange={(v) => setForm((f) => ({ ...f, cost: v }))} min={0} className="h-10" />
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
          <Button className="min-h-10 flex-1 sm:flex-none" onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
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
  const [editOpen, setEditOpen] = useState(false);
  const [editMaintenance, setEditMaintenance] = useState<MaintenanceRec | null>(null);

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

  const regenerateSchedule = async () => {
    const res = await mutate(
      () => api.post(`/api/vehicles/${v.id}/emis/regenerate`),
      "EMI schedule regenerated — paid EMIs untouched",
    );
    if (res.ok) void reload();
  };

  const markMaintenanceDone = async (m: MaintenanceRec) => {
    const res = await mutate(() => api.put(`/api/maintenance/${m.id}`, { status: "DONE" }), "Maintenance marked done — expense created", () => ({ module: "MAINTENANCE", recordId: m.id, onUndo: () => void reload() }));
    if (res.ok) void reload();
  };

  const [inspectorData, setInspectorData] = useState<FormulaInspectorData | null>(null);
  const [lineageData, setLineageData] = useState<TransactionLineageData | null>(null);

  interface VehicleLedgerItem {
    id: string;
    date: string;
    type: "TRIP" | "EXPENSE" | "EMI" | "MAINTENANCE";
    title: string;
    subtitle: string;
    inflow: number;  // Revenue (+)
    outflow: number; // Expense/EMI (−)
    balance: number; // Cumulative Contribution Margin
    raw: TripRec | ExpenseRec | EmiRec | MaintenanceRec;
  }

  const statementLedger = useMemo<VehicleLedgerItem[]>(() => {
    const items: Array<{
      id: string;
      date: string;
      createdAt: string;
      type: "TRIP" | "EXPENSE" | "EMI" | "MAINTENANCE";
      title: string;
      subtitle: string;
      inflow: number;
      outflow: number;
      raw: TripRec | ExpenseRec | EmiRec | MaintenanceRec;
    }> = [];

    // Trips
    (trips ?? []).forEach((t) => {
      const amt = tripTotal(t);
      items.push({
        id: `trip-${t.id}`,
        date: String(t.startAt).slice(0, 10),
        createdAt: String(t.startAt),
        type: "TRIP",
        title: `Trip: ${t.clientName || "Rental Booking"}`,
        subtitle: `${t.pickup || "Origin"} → ${t.destination || "Destination"} · ${t.status}`,
        inflow: amt,
        outflow: 0,
        raw: t,
      });
    });

    // Expenses
    (expenses ?? []).forEach((e) => {
      items.push({
        id: `exp-${e.id}`,
        date: String(e.date).slice(0, 10),
        createdAt: (e as unknown as { createdAt?: string }).createdAt || String(e.date),
        type: "EXPENSE",
        title: `Expense: ${e.categoryName || "Fleet OpEx"}`,
        subtitle: e.description || "Operational vehicle cost",
        inflow: 0,
        outflow: e.amount,
        raw: e,
      });
    });

    // Paid EMIs
    (emis ?? []).filter((e) => e.status === "PAID").forEach((e) => {
      items.push({
        id: `emi-${e.id}`,
        date: String(e.paidDate || e.dueDate).slice(0, 10),
        createdAt: String(e.paidDate || e.dueDate),
        type: "EMI",
        title: `Loan EMI: Month ${e.month}`,
        subtitle: `Installment paid ${e.reference ? `· Ref: ${e.reference}` : ""}`,
        inflow: 0,
        outflow: e.amount,
        raw: e,
      });
    });

    // Sort chronologically ascending
    items.sort((a, b) => a.date.localeCompare(b.date));

    let runningMargin = 0;
    const computed = items.map((it) => {
      runningMargin += it.inflow - it.outflow;
      return {
        ...it,
        balance: runningMargin,
      };
    });

    return computed.reverse();
  }, [trips, expenses, emis]);

  const openInspector = (metric: "monthRevenue" | "monthExpense" | "monthEmi" | "monthNet" | "allTimeNet") => {
    const st = v.stats ?? { monthRevenue: 0, monthExpense: 0, monthEmi: 0, monthNet: 0, revenue: 0, expense: 0, emi: 0, net: 0 };
    switch (metric) {
      case "monthRevenue":
        setInspectorData({
          title: "Month Trip Revenue Calculation",
          subtitle: `${v.name} (${v.registrationNumber}) · Month Trips`,
          resultLabel: "Month Revenue",
          resultValue: formatINR(st.monthRevenue),
          formulaEquation: "Month Revenue = ∑(Agreed Trip Rates + Extra Charges this month)",
          steps: [
            { label: "Trip Bookings Invoiced", amount: st.monthRevenue, operation: "result", detail: "Total billable transport rentals this month" },
          ],
          notes: [
            "Includes all completed and ongoing vehicle trips started in the current calendar month.",
          ],
        });
        break;
      case "monthExpense":
        setInspectorData({
          title: "Month Operational Expenses",
          subtitle: `${v.name} (${v.registrationNumber}) · Fleet OpEx`,
          resultLabel: "Month Expense",
          resultValue: formatINR(st.monthExpense),
          formulaEquation: "Month Expense = ∑(Fuel + Tolls + Maintenance recorded this month)",
          steps: [
            { label: "Direct Operating Costs", amount: st.monthExpense, operation: "result", detail: "Fuel, repairs, consumables" },
          ],
          notes: [
            "Operational running costs directly tagged to this vehicle.",
          ],
        });
        break;
      case "monthEmi":
        setInspectorData({
          title: "Month Loan EMI Cost",
          subtitle: `${v.name} (${v.registrationNumber}) · Vehicle Loan`,
          resultLabel: "Month EMI",
          resultValue: formatINR(st.monthEmi),
          formulaEquation: "Month EMI = Paid Loan Installments for Current Month",
          steps: [
            { label: "Vehicle Loan Payment", amount: st.monthEmi, operation: "result", detail: "Bank financing installment" },
          ],
          notes: [
            "Fixed financing repayment configured for this vehicle's loan.",
          ],
        });
        break;
      case "monthNet":
        setInspectorData({
          title: "Month Net Contribution Margin",
          subtitle: `${v.name} (${v.registrationNumber}) · Current Month Profitability`,
          resultLabel: "Month Net Margin",
          resultValue: formatINR(st.monthNet),
          formulaEquation: "Month Net = Month Revenue − Month Expenses − Month EMI",
          steps: [
            { label: "Month Trip Revenue", amount: st.monthRevenue, operation: "add", detail: "Transport bookings" },
            { label: "Operating Expenses (Fuel/Repairs)", amount: st.monthExpense, operation: "subtract", detail: "Direct running costs" },
            { label: "Loan EMI Installment", amount: st.monthEmi, operation: "subtract", detail: "Bank financing" },
            { label: "Net Month Margin", amount: st.monthNet, operation: "result", detail: st.monthNet >= 0 ? "Net Profitable" : "Net Operating Deficit" },
          ],
          notes: [
            "Commercial contribution margin generated by this vehicle for the current month.",
          ],
        });
        break;
      case "allTimeNet":
        setInspectorData({
          title: "All-Time Fleet Net Profit Margin",
          subtitle: `${v.name} (${v.registrationNumber}) · Lifetime Profitability`,
          resultLabel: "All-Time Net Profit",
          resultValue: formatINR(st.net),
          formulaEquation: "All-Time Net = Total Revenue − Total Expenses − Total EMIs Paid",
          steps: [
            { label: "Lifetime Invoiced Revenue", amount: st.revenue, operation: "add", detail: "All trips since onboarding" },
            { label: "Lifetime Operating Expenses", amount: st.expense, operation: "subtract", detail: "All fuel, repairs, and service" },
            { label: "Lifetime EMIs Paid", amount: (st as unknown as { emi?: number }).emi ?? 0, operation: "subtract", detail: "Total loan installments cleared" },
            { label: "Lifetime Net Profit", amount: st.net, operation: "result", detail: st.net >= 0 ? "Lifetime Profit" : "Lifetime Net Cost" },
          ],
          notes: [
            "This metric determines the true Return on Investment (ROI) for this vehicle asset.",
          ],
        });
        break;
    }
  };

  const openLineage = (item: VehicleLedgerItem) => {
    setLineageData({
      id: item.id,
      title: item.title,
      type: item.type === "TRIP" ? "Trip Booking" : item.type === "EXPENSE" ? "Fleet OpEx" : "Loan EMI",
      amount: item.inflow > 0 ? item.inflow : item.outflow,
      date: fmtDay(item.date),
      ruleExplanation: item.type === "TRIP"
        ? "Agreed rental rate and extra charges invoiced to transport client."
        : item.type === "EXPENSE"
        ? "Fleet operating expense logged against vehicle registration number."
        : "Monthly loan installment cleared with financing bank.",
      impactedAccounts: item.type === "TRIP" ? [
        { account: "Client Accounts Receivable", type: "debit", amount: item.inflow, description: "Billable trip booking" },
        { account: "Fleet Transport Revenue", type: "credit", amount: item.inflow, description: "Operating revenue recognized" },
      ] : [
        { account: item.type === "EMI" ? "Vehicle Loan Liability" : "Vehicle Operating Expense", type: "debit", amount: item.outflow, description: "Cost recognized" },
        { account: "Company Bank / Cash", type: "credit", amount: item.outflow, description: "Payment disbursed" },
      ],
    });
  };

  const ledgerColumns: Column<VehicleLedgerItem>[] = [
    {
      key: "date",
      label: "Date",
      value: (r) => fmtDay(r.date),
      hideOnMobile: true,
    },
    {
      key: "type",
      label: "Transaction",
      primary: true,
      render: (r) => (
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {r.type === "TRIP" ? (
              <ArrowUpRight className="h-3.5 w-3.5 text-primary shrink-0" aria-hidden />
            ) : (
              <ArrowDownLeft className="h-3.5 w-3.5 text-amber-600 shrink-0" aria-hidden />
            )}
            <p className="truncate font-semibold text-xs sm:text-sm">{r.title}</p>
          </div>
          <p className="text-[11px] text-muted-foreground truncate">{r.subtitle}</p>
          <p className="text-[10px] text-muted-foreground sm:hidden">{fmtDay(r.date)}</p>
        </div>
      ),
      value: (r) => r.title,
    },
    {
      key: "inflow",
      label: "Revenue (+)",
      className: "text-right font-medium",
      render: (r) => r.inflow > 0 ? (
        <span className="tabular-nums font-semibold text-foreground">+{formatINR(r.inflow)}</span>
      ) : (
        <span className="text-muted-foreground/50">—</span>
      ),
      value: (r) => formatINR(r.inflow),
    },
    {
      key: "outflow",
      label: "Expense/EMI (−)",
      className: "text-right font-medium",
      render: (r) => r.outflow > 0 ? (
        <span className="tabular-nums font-semibold text-amber-600 dark:text-amber-400">−{formatINR(r.outflow)}</span>
      ) : (
        <span className="text-muted-foreground/50">—</span>
      ),
      value: (r) => formatINR(r.outflow),
    },
    {
      key: "balance",
      label: "Net Margin",
      className: "text-right font-bold",
      render: (r) => (
        <span className={`tabular-nums ${r.balance >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
          {formatINR(r.balance)}
        </span>
      ),
      value: (r) => formatINR(r.balance),
    },
  ];

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
            <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" aria-hidden />Edit
            </Button>
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

      {/* Stats (with Click-to-Inspect Formula Math) */}
      <StatGrid cols={5}>
        <StatCard
          label="Month revenue"
          value={formatINR(v.stats?.monthRevenue ?? 0, { compact: true })}
          icon={IndianRupee}
          tone="positive"
          hint="Click to inspect formula"
          onClick={() => openInspector("monthRevenue")}
        />
        <StatCard
          label="Month expense"
          value={formatINR(v.stats?.monthExpense ?? 0, { compact: true })}
          icon={Receipt}
          tone="warning"
          hint="Click to inspect formula"
          onClick={() => openInspector("monthExpense")}
        />
        <StatCard
          label="Month EMI"
          value={formatINR(v.stats?.monthEmi ?? 0, { compact: true })}
          icon={CalendarClock}
          hint="Click to inspect formula"
          onClick={() => openInspector("monthEmi")}
        />
        <StatCard
          label="Month net"
          value={formatINR(v.stats?.monthNet ?? 0, { compact: true })}
          icon={CarFront}
          tone={(v.stats?.monthNet ?? 0) >= 0 ? "positive" : "negative"}
          hint="Click to inspect formula"
          onClick={() => openInspector("monthNet")}
        />
        <StatCard
          label="All-time net"
          value={formatINR(v.stats?.net ?? 0, { compact: true })}
          icon={BadgeCheck}
          tone={(v.stats?.net ?? 0) >= 0 ? "positive" : "negative"}
          hint="Click to inspect formula"
          onClick={() => openInspector("allTimeNet")}
        />
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

      <Tabs defaultValue="statement">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5 sm:w-auto sm:inline-flex">
          <TabsTrigger value="statement" className="gap-1.5 font-medium">
            <FileText className="h-3.5 w-3.5 text-primary" />
            <span>Passbook Ledger</span>
          </TabsTrigger>
          <TabsTrigger value="trips">Trips ({trips.length})</TabsTrigger>
          <TabsTrigger value="expenses">Expenses ({expenses.length})</TabsTrigger>
          <TabsTrigger value="emi">EMI ({emis.length})</TabsTrigger>
          <TabsTrigger value="maintenance">Maintenance ({maintenance.length})</TabsTrigger>
        </TabsList>

        {/* Tab 1: Live Vehicle Passbook Statement */}
        <TabsContent value="statement" className="mt-3">
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="mb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold flex items-center gap-1.5">
                    <span>Vehicle 360° Passbook Statement</span>
                    <span className="text-xs font-normal text-muted-foreground">(Trip Revenues vs Fleet Costs with Running Margin)</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Click any transaction row to inspect its creation lineage and accounting impact.
                  </p>
                </div>
              </div>
              <DataTable
                columns={ledgerColumns}
                rows={statementLedger}
                rowKey={(r) => r.id}
                onRowClick={(r) => openLineage(r)}
                emptyIcon={FileText}
                emptyTitle="No transactions recorded"
                emptyDescription="Trips and fleet expenses for this vehicle will build the passbook statement."
              />
            </CardContent>
          </Card>
        </TabsContent>

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
                <div className="flex flex-wrap items-center gap-2">
                  {Boolean(v.monthlyEmi && v.emiStartDate && v.emiCount) && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="outline" className="h-9 gap-1.5" disabled={saving}>
                          <RefreshCw className="h-4 w-4" aria-hidden />Regenerate pending schedule
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Regenerate the pending EMI schedule?</AlertDialogTitle>
                          <AlertDialogDescription>
                            All PENDING installments ({pendingEmis} right now) are deleted and rebuilt from the vehicle&apos;s current loan amount, monthly EMI, start date and installment count. PAID EMIs and their expenses are never touched.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="min-h-10">Cancel</AlertDialogCancel>
                          <AlertDialogAction className="min-h-10" onClick={(e) => { e.preventDefault(); void regenerateSchedule(); }}>
                            Regenerate
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                  <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={() => void generateSchedule()} disabled={saving}>
                    <CalendarClock className="h-4 w-4" aria-hidden />Generate Schedule
                  </Button>
                </div>
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
                          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setEditMaintenance(m)}>
                            Edit
                          </Button>
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
      <EditMaintenanceDialog open={Boolean(editMaintenance)} onOpenChange={(o) => !o && setEditMaintenance(null)} record={editMaintenance} onDone={() => void reload()} />
      <VehicleFormDialog open={editOpen} onOpenChange={setEditOpen} vehicle={v} onDone={() => void reload()} />

      {/* Formula Inspector Modal */}
      <FormulaInspectorDialog
        open={Boolean(inspectorData)}
        onOpenChange={(open) => { if (!open) setInspectorData(null); }}
        data={inspectorData}
      />

      {/* Transaction Lineage Modal */}
      <TransactionLineageDialog
        open={Boolean(lineageData)}
        onOpenChange={(open) => { if (!open) setLineageData(null); }}
        data={lineageData}
      />
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
