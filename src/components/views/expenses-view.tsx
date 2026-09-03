"use client";

import { useEffect, useMemo, useState } from "react";
import { api, qs } from "@/lib/api-client";
import { formatINR, parseAmount } from "@/lib/money";
import type { ViewProps } from "@/components/view-types";
import { useBusiness } from "@/components/providers";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { StatCard, StatGrid } from "@/components/shared/stat-card";
import { RangeSelector, SearchInput, type RangeKey } from "@/components/shared/filters";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useLang, t } from "@/lib/i18n";
import {
  Receipt, Plus, MoreHorizontal, Pencil, Trash2, Repeat, ChevronDown, Play, Wallet, Hash,
} from "lucide-react";
import {
  type ExpenseRec, type VehicleRec, type Option, SelectInput, Field, ErrorState, MiniBars, MoneyInput,
  CHART_COLORS, type ListResp, useAsync, useMutation, useDebounced, fmtDay, todayStr,
} from "./_shared";

interface ExpenseCategoryRec { id: string; name: string; business: string; kind?: string }
interface OwnerRec { id: string; name: string }
interface RecurringRow {
  id: string;
  name: string;
  business: string;
  categoryId?: string | null;
  categoryName?: string | null;
  amount: number;
  frequency: string;
  startDate: string;
  method?: string | null;
  notes?: string | null;
  active?: boolean;
  lastGeneratedMonth?: string | null;
}

const BUSINESS_OPTIONS: Option[] = [
  { label: "All businesses", value: "" },
  { label: "Manpower", value: "MANPOWER" },
  { label: "Transport", value: "TRANSPORT" },
];

const METHOD_OPTIONS: Option[] = ["Cash", "UPI", "Bank", "Card", "Cheque", "Other"].map((m) => ({ label: m, value: m }));

function rangeDates(r: RangeKey): { from: string; to: string } {
  const now = new Date();
  const f = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if (r === "today") { const t = f(now); return { from: t, to: t }; }
  if (r === "yesterday") return { from: f(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)), to: f(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)) };
  if (r === "week") return { from: f(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)), to: f(now) };
  if (r === "lastweek") return { from: f(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 13)), to: f(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7)) };
  if (r === "lastmonth") return { from: f(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: f(new Date(now.getFullYear(), now.getMonth(), 0)) };
  return { from: f(new Date(now.getFullYear(), now.getMonth(), 1)), to: f(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
}

function BusinessBadge({ business }: { business: string }) {
  const b = String(business ?? "").toUpperCase();
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-medium text-[11px] px-2 py-0.5 whitespace-nowrap",
        b === "MANPOWER" && "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200",
        b === "TRANSPORT" && "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-200"
      )}
    >
      {b || "—"}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Add / edit expense dialog
// ---------------------------------------------------------------------------

function ExpenseFormDialog({ open, onOpenChange, expense, vehicles, onDone }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  expense: ExpenseRec | null;
  vehicles: VehicleRec[];
  onDone: () => void;
}) {
  const editing = Boolean(expense);
  const [form, setForm] = useState({
    date: todayStr(), business: "MANPOWER", categoryId: "", amount: "", method: "Cash",
    description: "", vehicleId: "", notes: "",
  });
  const [categories, setCategories] = useState<ExpenseCategoryRec[]>([]);
  const { mutate, saving } = useMutation();

  // Reset form each time the dialog opens (render-time state adjustment).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setForm({
        date: expense?.date?.slice(0, 10) ?? todayStr(),
        business: expense?.business ?? "MANPOWER",
        categoryId: expense?.categoryId ?? "",
        amount: expense ? String(expense.amount) : "",
        method: expense?.method ?? "Cash",
        description: expense?.description ?? "",
        vehicleId: expense?.vehicleId ?? "",
        notes: expense?.notes ?? "",
      });
    }
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api.get<{ items: ExpenseCategoryRec[] }>("/api/expense-categories" + qs({ business: form.business || undefined }))
      .then((d) => { if (!cancelled) setCategories(d.items ?? []); })
      .catch(() => { if (!cancelled) setCategories([]); });
    return () => { cancelled = true; };
  }, [open, form.business]);

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    const amt = parseAmount(form.amount);
    if (amt <= 0) { toast.error("Enter a valid amount"); return; }
    if (!form.date) { toast.error("Date is required"); return; }
    const body = {
      date: form.date,
      business: form.business,
      categoryId: form.categoryId || undefined,
      amount: amt,
      method: form.method || undefined,
      description: form.description || undefined,
      notes: form.notes || undefined,
      vehicleId: form.business === "TRANSPORT" && form.vehicleId ? form.vehicleId : undefined,
    };
    const res = editing
      ? await mutate(() => api.put(`/api/expenses/${expense!.id}`, body), "Expense updated", () => ({ module: "EXPENSE", recordId: expense!.id, onUndo: onDone }))
      : await mutate(() => api.post("/api/expenses", body), "Expense recorded", (data) => ({ module: "EXPENSE", recordId: (data as { id: string }).id, onUndo: onDone }));
    if (res.ok) { onOpenChange(false); onDone(); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Expense" : "Add Expense"}</DialogTitle>
          <DialogDescription>Expenses are tracked separately for each business.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Date" required>
            <Input type="date" value={form.date} onChange={(e) => set("date")(e.target.value)} className="h-10" />
          </Field>
          <Field label="Business" required>
            <SelectInput
              value={form.business}
              onChange={(v) => setForm((f) => ({ ...f, business: v, categoryId: "", vehicleId: "" }))}
              options={[{ label: "Manpower", value: "MANPOWER" }, { label: "Transport", value: "TRANSPORT" }]}
            />
          </Field>
          <Field label="Category">
            <SelectInput
              value={form.categoryId}
              onChange={set("categoryId")}
              placeholder="Select category…"
              options={categories.map((c) => ({ label: c.name, value: c.id }))}
            />
          </Field>
          <Field label="Amount (₹)" required>
            <MoneyInput value={form.amount} onChange={set("amount")} min={1} className="h-10" />
          </Field>
          <Field label="Method">
            <SelectInput value={form.method} onChange={set("method")} options={METHOD_OPTIONS} />
          </Field>
          {form.business === "TRANSPORT" && (
            <Field label="Vehicle">
              <SelectInput
                value={form.vehicleId}
                onChange={set("vehicleId")}
                placeholder="No specific vehicle"
                options={[{ label: "No specific vehicle", value: "" }, ...vehicles.map((v) => ({ label: v.name, value: v.id }))]}
              />
            </Field>
          )}
          <Field label="Description" className="sm:col-span-2">
            <Input value={form.description} onChange={(e) => set("description")(e.target.value)} className="h-10" placeholder="What was this expense for?" />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea value={form.notes} onChange={(e) => set("notes")(e.target.value)} rows={2} placeholder="Optional" />
          </Field>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="min-h-10 flex-1 sm:flex-none" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="min-h-10 flex-1 sm:flex-none" onClick={submit} disabled={saving}>
            {saving ? "Saving…" : editing ? "Save changes" : "Add expense"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// New recurring expense dialog
// ---------------------------------------------------------------------------

function RecurringFormDialog({ open, onOpenChange, onDone }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState({ name: "", business: "MANPOWER", categoryId: "", amount: "", startDate: todayStr(), method: "Bank", notes: "" });
  const [categories, setCategories] = useState<ExpenseCategoryRec[]>([]);
  const { mutate, saving } = useMutation();

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setForm({ name: "", business: "MANPOWER", categoryId: "", amount: "", startDate: todayStr(), method: "Bank", notes: "" });
    }
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api.get<{ items: ExpenseCategoryRec[] }>("/api/expense-categories" + qs({ business: form.business || undefined }))
      .then((d) => { if (!cancelled) setCategories(d.items ?? []); })
      .catch(() => { if (!cancelled) setCategories([]); });
    return () => { cancelled = true; };
  }, [open, form.business]);

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    const amt = parseAmount(form.amount);
    if (amt <= 0) { toast.error("Enter a valid amount"); return; }
    if (!form.startDate) { toast.error("Start date is required"); return; }
    const res = await mutate(
      () => api.post("/api/recurring-expenses", {
        name: form.name.trim(),
        business: form.business,
        categoryId: form.categoryId || undefined,
        amount: amt,
        frequency: "MONTHLY",
        startDate: form.startDate,
        method: form.method || undefined,
        notes: form.notes || undefined,
      }),
      "Recurring expense created"
    );
    if (res.ok) { onOpenChange(false); onDone(); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Recurring Expense</DialogTitle>
          <DialogDescription>Generated monthly; idempotent per name + month + business.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" required className="sm:col-span-2">
            <Input value={form.name} onChange={(e) => set("name")(e.target.value)} className="h-10" placeholder="e.g. Truck insurance premium" />
          </Field>
          <Field label="Business" required>
            <SelectInput
              value={form.business}
              onChange={(v) => setForm((f) => ({ ...f, business: v, categoryId: "" }))}
              options={[{ label: "Manpower", value: "MANPOWER" }, { label: "Transport", value: "TRANSPORT" }]}
            />
          </Field>
          <Field label="Category">
            <SelectInput
              value={form.categoryId}
              onChange={set("categoryId")}
              placeholder="Select category…"
              options={categories.map((c) => ({ label: c.name, value: c.id }))}
            />
          </Field>
          <Field label="Amount (₹ / month)" required>
            <MoneyInput value={form.amount} onChange={set("amount")} min={1} className="h-10" />
          </Field>
          <Field label="Start date" required>
            <Input type="date" value={form.startDate} onChange={(e) => set("startDate")(e.target.value)} className="h-10" />
          </Field>
          <Field label="Method">
            <SelectInput value={form.method} onChange={set("method")} options={METHOD_OPTIONS} />
          </Field>
          <Field label="Frequency">
            <Input value="Monthly" disabled className="h-10" aria-label="Frequency (monthly)" />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea value={form.notes} onChange={(e) => set("notes")(e.target.value)} rows={2} placeholder="Optional" />
          </Field>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="min-h-10 flex-1 sm:flex-none" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="min-h-10 flex-1 sm:flex-none" onClick={submit} disabled={saving}>{saving ? "Saving…" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export default function ExpensesView({ navigate }: ViewProps) {
  const { lang } = useLang();
  void navigate; // reserved for future drill-downs
  const { scope } = useBusiness();
  const { mutate, saving } = useMutation();

  // Filters — default business follows the global scope when it isn't ALL
  const [business, setBusiness] = useState(scope === "ALL" ? "" : scope);
  const [categoryId, setCategoryId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [search, setSearch] = useState("");
  const searchDeb = useDebounced(search);
  const [rangeKey, setRangeKey] = useState<RangeKey>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const eff = rangeKey === "custom" ? { from: customFrom, to: customTo } : rangeDates(rangeKey);

  // Static option lists
  const categories = useAsync<{ items: ExpenseCategoryRec[] }>(
    () => api.get("/api/expense-categories" + qs({ business: business || undefined })),
    [business]
  );
  const vehicles = useAsync<{ items: VehicleRec[] }>(() => api.get("/api/vehicles"), []);
  const owners = useAsync<{ items: OwnerRec[] }>(() => api.get("/api/owners"), []);

  // Main list
  const expenses = useAsync<ListResp<ExpenseRec> & { totals?: { amount: number } }>(
    () => api.get("/api/expenses" + qs({
      business: business || undefined,
      categoryId: categoryId || undefined,
      vehicleId: vehicleId || undefined,
      ownerId: ownerId || undefined,
      from: eff.from || undefined,
      to: eff.to || undefined,
      search: searchDeb || undefined,
      pageSize: 200,
    })),
    [business, categoryId, vehicleId, ownerId, eff.from, eff.to, searchDeb]
  );

  // Recurring section
  const [recOpen, setRecOpen] = useState(false);
  const [recAddOpen, setRecAddOpen] = useState(false);
  const recurring = useAsync<RecurringRow[]>(async () => {
    const d = await api.get<RecurringRow[] | { items: RecurringRow[] }>("/api/recurring-expenses");
    return Array.isArray(d) ? d : (d.items ?? []);
  }, []);

  const items = expenses.data?.items ?? [];
  const vehicleItems = business === "TRANSPORT" ? vehicles.data?.items ?? [] : [];

  const breakdown = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of items) {
      const k = r.categoryName || "Uncategorized";
      m.set(k, (m.get(k) ?? 0) + r.amount);
    }
    return [...m.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [items]);

  const [editTarget, setEditTarget] = useState<ExpenseRec | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ExpenseRec | null>(null);

  const onBusinessChange = (v: string) => {
    setBusiness(v);
    setCategoryId("");
    setVehicleId("");
  };

  const removeExpense = async () => {
    if (!deleteTarget) return;
    const res = await mutate(() => api.del(`/api/expenses/${deleteTarget.id}`), "Expense deleted", () => ({ module: "EXPENSE", recordId: deleteTarget.id, onUndo: () => void expenses.reload() }));
    if (res.ok) void expenses.reload();
    setDeleteTarget(null);
  };

  const toggleRecurring = async (row: RecurringRow, next: boolean) => {
    const res = await mutate(() => api.put(`/api/recurring-expenses/${row.id}/toggle`, { active: next }));
    if (res.ok) {
      toast.success(next ? `"${row.name}" activated` : `"${row.name}" paused`);
      void recurring.reload();
    }
  };

  const runRecurring = async (row: RecurringRow) => {
    let created = 0;
    const res = await mutate(async () => {
      const d = await api.post<{ created: number }>(`/api/recurring-expenses/${row.id}/run`);
      created = d.created ?? 0;
      return d;
    });
    if (res.ok) {
      toast.success(`Created ${created} expenses from "${row.name}"`);
      void recurring.reload();
      void expenses.reload();
    }
  };

  const columns: Column<ExpenseRec>[] = [
    {
      key: "description", label: t(lang, "col.expense"), primary: true,
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{r.description || r.categoryName || "Untitled expense"}</p>
          <p className="truncate text-[11px] text-muted-foreground">{fmtDay(r.date)} · {r.categoryName ?? "Uncategorized"}</p>
        </div>
      ),
      value: (r) => r.description || r.categoryName || "Untitled expense",
    },
    { key: "date", label: t(lang, "col.date"), value: (r) => fmtDay(r.date), hideOnMobile: true },
    { key: "business", label: t(lang, "col.business"), render: (r) => <BusinessBadge business={r.business} />, value: (r) => r.business },
    { key: "category", label: t(lang, "col.category"), value: (r) => r.categoryName ?? "—", hideOnMobile: true },
    { key: "vehicle", label: t(lang, "col.vehicle"), value: (r) => r.vehicleName ?? "—", hideOnMobile: true },
    { key: "spentBy", label: t(lang, "col.spentBy"), value: (r) => r.spentByName ?? "—", hideOnMobile: true },
    {
      key: "amount", label: t(lang, "col.amount"), className: "text-right",
      render: (r) => <span className="font-semibold tabular-nums">{formatINR(r.amount)}</span>,
      value: (r) => formatINR(r.amount),
    },
    {
      key: "actions", label: "", className: "w-14",
      render: (r) => (
        <div className="flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${r.description || "expense"}`}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36">
              <DropdownMenuItem onClick={() => setEditTarget(r)}>
                <Pencil className="h-3.5 w-3.5" />Edit
              </DropdownMenuItem>
              <DropdownMenuItem className="text-red-600 dark:text-red-400" onClick={() => setDeleteTarget(r)}>
                <Trash2 className="h-3.5 w-3.5" />Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
      value: () => "",
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title={t(lang, "page.expenses")}
        subtitle={t(lang, "page.expenses.sub")}
        actions={
          <Button size="sm" className="h-9 gap-1.5" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden />Add Expense
          </Button>
        }
      />

      {/* Filters */}
      <Card>
        <CardContent className="space-y-3 p-3 sm:p-4">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
            <SelectInput value={business} onChange={onBusinessChange} options={BUSINESS_OPTIONS} placeholder="All businesses" />
            <SelectInput
              value={categoryId}
              onChange={setCategoryId}
              options={[{ label: "All categories", value: "" }, ...(categories.data?.items ?? []).map((c) => ({ label: c.name, value: c.id }))]}
              placeholder="All categories"
            />
            {business === "TRANSPORT" && (
              <SelectInput
                value={vehicleId}
                onChange={setVehicleId}
                options={[{ label: "All vehicles", value: "" }, ...vehicleItems.map((v) => ({ label: v.name, value: v.id }))]}
                placeholder="All vehicles"
              />
            )}
            <SelectInput
              value={ownerId}
              onChange={setOwnerId}
              options={[{ label: "All owners", value: "" }, ...(owners.data?.items ?? []).map((o) => ({ label: o.name, value: o.id }))]}
              placeholder="All owners"
            />
          </div>
          <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
            <div className="flex w-full items-center gap-2 overflow-hidden">
              <RangeSelector
                value={rangeKey}
                onChange={(r) => { setRangeKey(r); }}
                className="flex-1"
              />
              <Button
                size="sm"
                variant={rangeKey === "custom" ? "default" : "outline"}
                className="h-8 shrink-0 rounded-full px-3 text-xs"
                onClick={() => {
                  if (rangeKey === "custom") { setRangeKey("month"); setCustomFrom(""); setCustomTo(""); }
                  else setRangeKey("custom");
                }}
              >
                Custom
              </Button>
            </div>
            <SearchInput value={search} onChange={setSearch} placeholder="Search description…" className="lg:w-64" />
          </div>
          {rangeKey === "custom" && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed p-2.5">
              <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-9 w-full sm:w-40" aria-label="From date" />
              <span className="text-xs text-muted-foreground">to</span>
              <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-9 w-full sm:w-40" aria-label="To date" />
            </div>
          )}
        </CardContent>
      </Card>

      <StatGrid cols={2}>
        <StatCard label="Total expenses (filtered)" value={formatINR(expenses.data?.totals?.amount ?? 0)} icon={Wallet} tone="negative" />
        <StatCard label="Records" value={String(expenses.data?.total ?? items.length)} icon={Hash} hint="Matching current filters" />
      </StatGrid>

      <div className="grid gap-4 xl:grid-cols-3">
        {/* List */}
        <Card className="xl:col-span-2">
          <CardContent className="p-3 sm:p-4">
            {expenses.error ? (
              <ErrorState message={expenses.error} onRetry={() => void expenses.reload()} />
            ) : (
              <DataTable
                columns={columns}
                rows={items}
                rowKey={(r) => r.id}
                exportName="expenses"
                loading={expenses.loading}
                emptyIcon={Receipt}
                emptyTitle="No expenses match"
                emptyDescription="Try widening the date range or clearing filters."
              />
            )}
          </CardContent>
        </Card>

        {/* Side: breakdown + recurring */}
        <div className="space-y-4">
          <Card>
            <CardContent className="p-3 sm:p-4">
              <p className="mb-3 text-sm font-semibold">Category breakdown</p>
              {expenses.loading ? (
                <div className="space-y-2.5">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-8 rounded-lg bg-muted animate-pulse" />)}</div>
              ) : (
                <MiniBars rows={breakdown.map((b) => ({ ...b, color: CHART_COLORS.amber }))} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3 sm:p-4">
              <div
                role="button"
                tabIndex={0}
                className="flex w-full cursor-pointer items-center justify-between gap-2"
                onClick={() => setRecOpen((o) => !o)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setRecOpen((o) => !o); } }}
                aria-expanded={recOpen}
                aria-label="Toggle recurring expenses"
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <Repeat className="h-4 w-4 text-primary" aria-hidden />Recurring
                  <Badge variant="outline" className="text-[10px]">{recurring.data?.length ?? 0}</Badge>
                </span>
                <span className="flex items-center gap-1.5">
                  <Button
                    size="sm" variant="outline" className="h-8 gap-1 text-xs"
                    onClick={(e) => { e.stopPropagation(); setRecAddOpen(true); }}
                  >
                    <Plus className="h-3 w-3" aria-hidden />New
                  </Button>
                  <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", recOpen && "rotate-180")} aria-hidden />
                </span>
              </div>

              {recOpen && (
                <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-0.5">
                  {recurring.loading && <div className="h-16 animate-pulse rounded-lg bg-muted" />}
                  {!recurring.loading && (recurring.data ?? []).length === 0 && (
                    <p className="py-4 text-center text-xs text-muted-foreground">No recurring expenses yet</p>
                  )}
                  {(recurring.data ?? []).map((row) => (
                    <div key={row.id} className="rounded-xl border p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{row.name}</p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {formatINR(row.amount)} · {row.frequency?.toLowerCase() || "monthly"} · Last: {row.lastGeneratedMonth ?? "—"}
                          </p>
                        </div>
                        <BusinessBadge business={row.business} />
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <label className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Switch checked={row.active ?? false} onCheckedChange={(v) => void toggleRecurring(row, v)} disabled={saving} aria-label={`Toggle ${row.name}`} />
                          {row.active === false ? "Paused" : "Active"}
                        </label>
                        <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => void runRecurring(row)} disabled={saving}>
                          <Play className="h-3 w-3" aria-hidden />Run now
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <ExpenseFormDialog open={addOpen} onOpenChange={setAddOpen} expense={null} vehicles={vehicles.data?.items ?? []} onDone={() => void expenses.reload()} />
      <ExpenseFormDialog open={Boolean(editTarget)} onOpenChange={(v) => !v && setEditTarget(null)} expense={editTarget} vehicles={vehicles.data?.items ?? []} onDone={() => void expenses.reload()} />
      <RecurringFormDialog open={recAddOpen} onOpenChange={setRecAddOpen} onDone={() => { void recurring.reload(); void expenses.reload(); }} />

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this expense?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.description || deleteTarget?.categoryName || "Expense"} · {formatINR(deleteTarget?.amount ?? 0)} on {deleteTarget ? fmtDay(deleteTarget.date) : ""}.
              This is permanent and audit-logged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-10">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-10 bg-red-600 text-white hover:bg-red-700"
              onClick={(e) => { e.preventDefault(); void removeExpense(); }}
            >
              {saving ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
