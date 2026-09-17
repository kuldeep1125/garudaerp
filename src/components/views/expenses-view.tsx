"use client";

import { useEffect, useMemo, useState } from "react";
import { api, qs } from "@/lib/api-client";
import { formatINR, parseAmount } from "@/lib/money";
import type { ViewProps } from "@/components/view-types";
import { useBusiness } from "@/components/providers";
import { PageHeader } from "@/components/shared/page-header";
import { ViewFab } from "@/components/shared/view-fab";
import { DataTable, downloadCsv, type Column } from "@/components/shared/data-table";
import { StatCard, StatGrid } from "@/components/shared/stat-card";
import { RangeSelector, SearchInput, type RangeKey } from "@/components/shared/filters";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Receipt, Plus, MoreHorizontal, Pencil, Trash2, Repeat, ChevronDown, Play, Wallet, Hash, Download,
  Users, HandCoins, ArrowDownToLine, ArrowUpFromLine, Crown, Landmark, Building2, Check,
  ArrowDownLeft, ArrowUpRight, CreditCard, RefreshCw, Info, RotateCcw,
} from "lucide-react";
import {
  type ExpenseRec, type VehicleRec, type Option, SelectInput, Field, ErrorState, MiniBars, MoneyInput,
  AreaTrend, BarsCompare, CHART_COLORS, type ListResp, useAsync, useMutation, useDebounced, fmtDay,
  todayStr, undoRequest, UNDO_APPLIED_EVENT,
} from "./_shared";
import {
  TransactionLineageDialog,
  type TransactionLineageData,
} from "@/components/shared/transaction-lineage-dialog";

interface ExpenseCategoryRec { id: string; name: string; business: string; kind?: string; isActive?: boolean }
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
  isActive?: boolean; // canonical field from the API
  active?: boolean; // legacy alias kept for compatibility
  lastGeneratedMonth?: string | null;
}

interface OwnerBreakdownData {
  range: { from: string; to: string };
  business: string | null;
  owners: {
    id: string; name: string;
    deposits: number; withdrawals: number; advances: number; spent: number;
    manpower: number; transport: number; net: number;
    categories: { name: string; amount: number }[];
  }[];
  common: { total: number; manpower: number; transport: number; categories: { name: string; amount: number }[] };
  unattributed: { total: number; manpower: number; transport: number; categories: { name: string; amount: number }[] };
  totals: {
    deposits: number; withdrawals: number; advances: number; commonTotal: number;
    unattributed: number; operating: number; capital: number; grand: number; netPosition: number;
  };
  daily: { day: string; deposits: number; withdrawals: number; operating: number; common: number }[];
  byCategory: { name: string; amount: number; kind: string }[];
  transactions: {
    id: string; date: string; ownerId: string | null; ownerName: string;
    type: "IN" | "OUT"; category: string; reason: string | null; method: string | null;
    description: string | null; business: string; amount: number; balanceAfter: number;
  }[];
}

const BUSINESS_OPTIONS: Option[] = [
  { label: "All businesses", value: "" },
  { label: "Manpower", value: "MANPOWER" },
  { label: "Transport", value: "TRANSPORT" },
];

const METHOD_OPTIONS: Option[] = ["Cash", "UPI", "Bank", "Card", "Cheque", "Other"].map((m) => ({ label: m, value: m }));

// Mirrors CAPITAL_CATEGORY_NAMES in engine.ts (client can't import server code):
// these category NAMES decide capital vs operating stamping, so they are locked
// in the category manager (rename/deactivate blocked server-side too).
const CAPITAL_CATEGORY_NAMES = ["OWNER CONTRIBUTION", "OWNER WITHDRAWAL"];
const isCapitalCategory = (name?: string | null) => CAPITAL_CATEGORY_NAMES.includes((name ?? "").trim().toUpperCase());

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
        b === "MANPOWER" && "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900",
        b === "TRANSPORT" && "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-900"
      )}
    >
      {b || "—"}
    </Badge>
  );
}

/** Chip shown on owner-capital rows (contributions / withdrawals). */
function CapitalBadge() {
  return (
    <Badge variant="outline" className="border-violet-200 bg-violet-50 text-[10px] font-medium text-violet-700 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-300">
      Capital
    </Badge>
  );
}

/** "Common — shared by all owners" chip. */
function CommonBadge() {
  return (
    <Badge variant="outline" className="border-sky-200 bg-sky-50 text-[10px] font-medium text-sky-700 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300">
      <Users className="mr-1 h-3 w-3" aria-hidden />Common
    </Badge>
  );
}

/** 5-in-1 Transaction Type Badge: Operating, Drawing, Deposit, Refund, Out-of-Pocket. */
function TransactionTypeBadge({
  kind,
  categoryName,
  isCommon,
  spentById,
}: {
  kind?: string | null;
  categoryName?: string | null;
  isCommon?: boolean;
  spentById?: string | null;
}) {
  const cat = (categoryName ?? "").trim().toUpperCase();
  if (kind === "REFUND") {
    return (
      <Badge variant="outline" className="border-cyan-200 bg-cyan-50 text-[10px] font-medium text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950 dark:text-cyan-300">
        <RefreshCw className="mr-1 h-3 w-3" aria-hidden />Refund
      </Badge>
    );
  }
  if (kind === "CAPITAL") {
    if (cat.includes("WITHDRAWAL") || cat.includes("DRAWING")) {
      return (
        <Badge variant="outline" className="border-amber-200 bg-amber-50 text-[10px] font-medium text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          <ArrowUpRight className="mr-1 h-3 w-3" aria-hidden />Drawing
        </Badge>
      );
    }
    if (cat.includes("CONTRIBUTION") || cat.includes("DEPOSIT") || cat.includes("INVEST")) {
      return (
        <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-[10px] font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
          <ArrowDownLeft className="mr-1 h-3 w-3" aria-hidden />Deposit
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="border-violet-200 bg-violet-50 text-[10px] font-medium text-violet-700 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-300">
        Capital
      </Badge>
    );
  }
  if (!isCommon && spentById) {
    return (
      <Badge variant="outline" className="border-purple-200 bg-purple-50 text-[10px] font-medium text-purple-700 dark:border-purple-900 dark:bg-purple-950 dark:text-purple-300">
        <CreditCard className="mr-1 h-3 w-3" aria-hidden />Out-of-Pocket
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-slate-200 bg-slate-50 text-[10px] font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
      <Receipt className="mr-1 h-3 w-3" aria-hidden />Operating
    </Badge>
  );
}

export type ExpenseTxType = "OPERATING" | "DRAWING" | "DEPOSIT" | "REFUND" | "OUT_OF_POCKET";

export interface ExpensePreset {
  type?: ExpenseTxType;
  categoryName?: string;
  spentById?: string;
  amount?: number;
  description?: string;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Unified Financial Transaction Dialog (Expenses, Drawings, Deposits, Refunds)
// ---------------------------------------------------------------------------

export function ExpenseFormDialog({ open, onOpenChange, expense, vehicles = [], onDone, preset }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  expense: ExpenseRec | null;
  vehicles?: VehicleRec[];
  onDone: () => void;
  preset?: ExpensePreset | null;
}) {
  const editing = Boolean(expense);
  const [txType, setTxType] = useState<ExpenseTxType>("OPERATING");
  const [form, setForm] = useState({
    date: todayStr(), business: "MANPOWER", categoryId: "", amount: "", method: "Cash",
    description: "", vehicleId: "", notes: "", reason: "", spentById: "",
  });
  const [categories, setCategories] = useState<ExpenseCategoryRec[]>([]);
  const [owners, setOwners] = useState<OwnerRec[]>([]);
  const [meId, setMeId] = useState("");
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const { mutate, saving } = useMutation();

  // Reset form each time the dialog opens
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setNewCatOpen(false);
      setNewCatName("");

      // Derive initial transaction type
      let initialType: ExpenseTxType = "OPERATING";
      if (preset?.type) {
        initialType = preset.type;
      } else if (preset?.categoryName === "Owner Contribution") {
        initialType = "DEPOSIT";
      } else if (preset?.categoryName === "Owner Withdrawal") {
        initialType = "DRAWING";
      } else if (preset?.categoryName?.toLowerCase().includes("refund")) {
        initialType = "REFUND";
      } else if (expense) {
        if (expense.kind === "REFUND") initialType = "REFUND";
        else if (expense.kind === "CAPITAL") {
          const cat = (expense.categoryName ?? "").toUpperCase();
          initialType = cat.includes("WITHDRAWAL") ? "DRAWING" : "DEPOSIT";
        } else if (!expense.isCommon && expense.spentById) {
          initialType = "OUT_OF_POCKET";
        } else {
          initialType = "OPERATING";
        }
      }
      setTxType(initialType);

      setForm({
        date: expense?.date?.slice(0, 10) ?? todayStr(),
        business: expense?.business ?? "MANPOWER",
        categoryId: expense?.categoryId ?? "",
        amount: expense ? String(expense.amount) : (preset?.amount ? String(preset.amount) : ""),
        method: expense?.method ?? "Cash",
        description: expense?.description ?? (preset?.description || ""),
        vehicleId: expense?.vehicleId ?? "",
        notes: expense?.notes ?? "",
        reason: expense?.reason ?? (preset?.reason || ""),
        spentById: expense
          ? (expense.isCommon ? "COMMON" : (expense.spentById ?? ""))
          : (preset?.spentById || ""),
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

  // Owners list
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api.get<{ items: OwnerRec[] }>("/api/owners")
      .then((d) => { if (!cancelled) setOwners(d.items ?? []); })
      .catch(() => { /* non-fatal */ });
    api.get<OwnerRec>("/api/auth/me")
      .then((d) => { if (!cancelled) setMeId(d?.id ?? ""); })
      .catch(() => { /* non-fatal */ });
    return () => { cancelled = true; };
  }, [open]);

  // Pre-filled category name resolution
  const presetCategoryId = useMemo(() => {
    if (editing || !preset?.categoryName) return "";
    return categories.find((c) => c.name.toUpperCase() === preset.categoryName!.toUpperCase())?.id ?? "";
  }, [editing, preset, categories]);

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const categoryOptions = useMemo(() => {
    const selectedId = form.categoryId || presetCategoryId || expense?.categoryId || "";
    return categories
      .filter((c) => c.isActive !== false || c.id === selectedId)
      .map((c) => ({ label: c.isActive === false ? `${c.name} (inactive)` : c.name, value: c.id }));
  }, [categories, form.categoryId, presetCategoryId, expense?.categoryId]);

  const createCategory = async () => {
    const name = newCatName.trim();
    if (!name) { toast.error("Enter a category name"); return; }
    const res = await mutate(
      () => api.post<ExpenseCategoryRec>("/api/expense-categories", { name, business: form.business }),
      `Category "${name}" created`
    );
    if (res.ok && res.data) {
      setCategories((cs) => [...cs, res.data as ExpenseCategoryRec]);
      setForm((f) => ({ ...f, categoryId: (res.data as ExpenseCategoryRec).id }));
      setNewCatOpen(false);
      setNewCatName("");
    }
  };

  const submit = async () => {
    const amt = parseAmount(form.amount);
    if (amt <= 0) { toast.error("Enter a valid amount"); return; }
    if (!form.date) { toast.error("Date is required"); return; }

    // Validation for owner-specific flows
    if ((txType === "DRAWING" || txType === "DEPOSIT" || txType === "OUT_OF_POCKET") && (!form.spentById || form.spentById === "COMMON")) {
      toast.error("Please select a specific owner for this transaction");
      return;
    }

    const body = {
      date: form.date,
      business: form.business,
      categoryId: form.categoryId || presetCategoryId || "",
      amount: amt,
      method: form.method || undefined,
      description: form.description || undefined,
      notes: form.notes || undefined,
      reason: form.reason || undefined,
      spentById: txType === "OPERATING" && form.spentById === "COMMON" ? "COMMON" : (form.spentById || meId || undefined),
      vehicleId: form.business === "TRANSPORT" && form.vehicleId ? form.vehicleId : undefined,
      type: txType,
    };

    const res = editing
      ? await mutate(() => api.put(`/api/expenses/${expense!.id}`, body), "Transaction updated", () => ({ module: "EXPENSE", recordId: expense!.id, onUndo: onDone }))
      : await mutate(() => api.post("/api/expenses", body), "Transaction recorded", (data) => ({ module: "EXPENSE", recordId: (data as { id: string }).id, onUndo: onDone }));
    if (res.ok) { onOpenChange(false); onDone(); }
  };

  const selectedOwnerLabel = form.spentById === "COMMON"
    ? "Common — all owners"
    : (owners.find((o) => o.id === form.spentById)?.name ?? "You");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Financial Entry" : "Record Financial Entry"}</DialogTitle>
          <DialogDescription>Accurately categorize business costs, owner personal drawings, capital deposits, or refunds.</DialogDescription>
        </DialogHeader>

        {/* 5-in-1 Transaction Type Segmented Bar */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Transaction Nature</label>
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-muted/60 rounded-xl sm:grid-cols-5 text-xs">
            <button
              type="button"
              onClick={() => setTxType("OPERATING")}
              className={cn(
                "flex items-center justify-center gap-1.5 py-2 px-1.5 rounded-lg font-medium transition-all text-center",
                txType === "OPERATING" ? "bg-background text-foreground shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Receipt className="h-3.5 w-3.5 text-blue-500 shrink-0" />
              <span>Operating</span>
            </button>
            <button
              type="button"
              onClick={() => setTxType("DRAWING")}
              className={cn(
                "flex items-center justify-center gap-1.5 py-2 px-1.5 rounded-lg font-medium transition-all text-center",
                txType === "DRAWING" ? "bg-background text-amber-600 dark:text-amber-400 shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <ArrowUpRight className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              <span>Drawing</span>
            </button>
            <button
              type="button"
              onClick={() => setTxType("DEPOSIT")}
              className={cn(
                "flex items-center justify-center gap-1.5 py-2 px-1.5 rounded-lg font-medium transition-all text-center",
                txType === "DEPOSIT" ? "bg-background text-emerald-600 dark:text-emerald-400 shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              <span>Deposit</span>
            </button>
            <button
              type="button"
              onClick={() => setTxType("REFUND")}
              className={cn(
                "flex items-center justify-center gap-1.5 py-2 px-1.5 rounded-lg font-medium transition-all text-center",
                txType === "REFUND" ? "bg-background text-cyan-600 dark:text-cyan-400 shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <RefreshCw className="h-3.5 w-3.5 text-cyan-500 shrink-0" />
              <span>Refund</span>
            </button>
            <button
              type="button"
              onClick={() => setTxType("OUT_OF_POCKET")}
              className={cn(
                "flex items-center justify-center gap-1.5 py-2 px-1.5 rounded-lg font-medium transition-all text-center col-span-2 sm:col-span-1",
                txType === "OUT_OF_POCKET" ? "bg-background text-purple-600 dark:text-purple-400 shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <CreditCard className="h-3.5 w-3.5 text-purple-500 shrink-0" />
              <span>Out-of-Pocket</span>
            </button>
          </div>

          {/* Contextual Accounting Guidance Banner */}
          <div className={cn(
            "p-3 rounded-xl border text-xs flex items-start gap-2.5 transition-colors",
            txType === "OPERATING" && "bg-blue-50/70 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900 text-blue-900 dark:text-blue-200",
            txType === "DRAWING" && "bg-amber-50/70 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200",
            txType === "DEPOSIT" && "bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900 text-emerald-900 dark:text-emerald-200",
            txType === "REFUND" && "bg-cyan-50/70 dark:bg-cyan-950/30 border-cyan-200 dark:border-cyan-900 text-cyan-900 dark:text-cyan-200",
            txType === "OUT_OF_POCKET" && "bg-purple-50/70 dark:bg-purple-950/30 border-purple-200 dark:border-purple-900 text-purple-900 dark:text-purple-200",
          )}>
            <Info className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
            <div>
              {txType === "OPERATING" && "Company operating expenditure paid from business cash/bank. Feeds P&L operating expenses."}
              {txType === "DRAWING" && "Owner took cash from company funds for personal use. Deducted from owner equity in passbook — never inflates business P&L expenses."}
              {txType === "DEPOSIT" && "Owner deposited money into company bank or cash (capital injection or drawing repayment). Added to owner equity in passbook."}
              {txType === "REFUND" && "Funds returned to company (unused cash returned or vendor refund). Directly offsets and reduces operating expenses on dashboards & P&L."}
              {txType === "OUT_OF_POCKET" && "Owner paid for a business expense using their personal pocket. Company owes reimbursement; credited in owner passbook."}
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 pt-1">
          <Field label="Date" required>
            <Input type="date" value={form.date} onChange={(e) => set("date")(e.target.value)} className="h-10" />
          </Field>

          {/* Business field — visible for OPERATING, REFUND, OUT_OF_POCKET */}
          {txType !== "DRAWING" && txType !== "DEPOSIT" ? (
            <Field label="Business Division" required>
              <SelectInput
                value={form.business}
                onChange={(v) => setForm((f) => ({ ...f, business: v, categoryId: "", vehicleId: "" }))}
                options={[{ label: "Manpower", value: "MANPOWER" }, { label: "Transport", value: "TRANSPORT" }]}
              />
            </Field>
          ) : (
            <Field label="Business Division">
              <SelectInput
                value={form.business}
                onChange={(v) => setForm((f) => ({ ...f, business: v }))}
                options={[{ label: "Manpower", value: "MANPOWER" }, { label: "Transport", value: "TRANSPORT" }]}
              />
            </Field>
          )}

          {/* Owner Selector with Contextual Labels */}
          <Field
            label={
              txType === "DRAWING" ? "Owner Withdrawing Cash" :
              txType === "DEPOSIT" ? "Owner Depositing Capital / Repaying" :
              txType === "OUT_OF_POCKET" ? "Owner Who Paid From Pocket" :
              "Paid by / Attributed To"
            }
            required={txType === "DRAWING" || txType === "DEPOSIT" || txType === "OUT_OF_POCKET"}
            hint={
              txType === "DRAWING" ? "Owner whose equity will decrease" :
              txType === "DEPOSIT" ? "Owner whose equity will increase" :
              txType === "OUT_OF_POCKET" ? "Company will owe reimbursement to this owner" :
              form.spentById === "COMMON" ? "Shared equally by all owners & the business" : `Attributed to ${selectedOwnerLabel}`
            }
            className="sm:col-span-2"
          >
            <SelectInput
              value={form.spentById}
              onChange={set("spentById")}
              placeholder={txType === "OPERATING" ? "Select owner or Common…" : "Select owner…"}
              options={[
                ...(txType === "OPERATING" ? [{ label: "Common — shared by all owners & business", value: "COMMON" }] : []),
                ...owners.map((o) => ({ label: o.name, value: o.id })),
              ]}
            />
          </Field>

          {/* Reason / Detail */}
          <Field
            label={txType === "DRAWING" ? "Drawing Reason" : txType === "DEPOSIT" ? "Deposit Reason" : txType === "REFUND" ? "Refund Reason" : "Reason / Purpose"}
            hint={
              txType === "DRAWING" ? "e.g. Personal advance, salary withdrawal" :
              txType === "DEPOSIT" ? "e.g. Repaying withdrawal, new equity investment" :
              txType === "REFUND" ? "e.g. Returned unused generator cash, vendor credit" :
              "Why the money was spent"
            }
            className="sm:col-span-2"
          >
            <Input
              value={form.reason}
              onChange={(e) => set("reason")(e.target.value)}
              className="h-10"
              placeholder={
                txType === "DRAWING" ? "e.g. Personal cash withdrawal" :
                txType === "DEPOSIT" ? "e.g. Repaying previous drawing" :
                txType === "REFUND" ? "e.g. Returned excess cash from diesel" :
                "e.g. Generator diesel · Office tea · Uniforms"
              }
            />
          </Field>

          {/* Category — only relevant for OPERATING, REFUND, OUT_OF_POCKET */}
          {txType !== "DRAWING" && txType !== "DEPOSIT" && (
            <>
              <Field label="Category">
                <SelectInput
                  value={form.categoryId || presetCategoryId}
                  onChange={set("categoryId")}
                  placeholder="Select category…"
                  options={categoryOptions}
                />
              </Field>
              <div className="sm:col-span-1 sm:row-start-auto">
                {!newCatOpen ? (
                  <Button
                    type="button" variant="outline" size="sm"
                    className="mt-1 h-9 w-full gap-1 text-xs sm:mt-6"
                    onClick={() => setNewCatOpen(true)}
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden />New category
                  </Button>
                ) : (
                  <div className="mt-1 flex gap-1.5 sm:mt-6">
                    <Input
                      value={newCatName}
                      onChange={(e) => setNewCatName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void createCategory(); } }}
                      className="h-9 text-xs"
                      placeholder={`Category for ${form.business === "TRANSPORT" ? "Transport" : "Manpower"}`}
                      aria-label="New category name"
                      autoFocus
                    />
                    <Button type="button" size="sm" className="h-9 shrink-0 px-2.5" onClick={() => void createCategory()} disabled={saving} aria-label="Create category">
                      <Check className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                    <Button type="button" size="sm" variant="ghost" className="h-9 shrink-0 px-2.5" onClick={() => { setNewCatOpen(false); setNewCatName(""); }} aria-label="Cancel category creation">
                      ✕
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}

          <Field label="Amount (₹)" required>
            <MoneyInput value={form.amount} onChange={set("amount")} min={1} className="h-10" />
          </Field>

          <Field label="Payment Method">
            <SelectInput value={form.method} onChange={set("method")} options={METHOD_OPTIONS} />
          </Field>

          {form.business === "TRANSPORT" && txType !== "DRAWING" && txType !== "DEPOSIT" && (
            <Field label="Vehicle Asset">
              <SelectInput
                value={form.vehicleId}
                onChange={set("vehicleId")}
                placeholder="No specific vehicle"
                options={[{ label: "No specific vehicle", value: "" }, ...vehicles.map((v) => ({ label: v.name, value: v.id }))]}
              />
            </Field>
          )}

          <Field label="Description" className="sm:col-span-2">
            <Input value={form.description} onChange={(e) => set("description")(e.target.value)} className="h-10" placeholder="Optional brief summary…" />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea value={form.notes} onChange={(e) => set("notes")(e.target.value)} rows={2} placeholder="Optional extra remarks…" />
          </Field>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" className="min-h-10 flex-1 sm:flex-none" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="min-h-10 flex-1 sm:flex-none" onClick={submit} disabled={saving}>
            {saving ? "Saving…" : editing ? "Save changes" : "Record transaction"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Recurring expense dialog — shared by add AND edit (same fields either way)
// ---------------------------------------------------------------------------

function RecurringFormDialog({ open, onOpenChange, recurring, onDone }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** When set, the dialog edits this recurring expense (prefilled); null = create. */
  recurring: RecurringRow | null;
  onDone: () => void;
}) {
  const editing = Boolean(recurring);
  const [form, setForm] = useState({ name: "", business: "MANPOWER", categoryId: "", amount: "", startDate: todayStr(), method: "Bank", notes: "" });
  const [categories, setCategories] = useState<ExpenseCategoryRec[]>([]);
  const { mutate, saving } = useMutation();

  // Reset form each time the dialog opens (render-time state adjustment).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setForm({
        name: recurring?.name ?? "",
        business: recurring?.business ?? "MANPOWER",
        categoryId: recurring?.categoryId ?? "",
        amount: recurring ? String(recurring.amount) : "",
        startDate: recurring?.startDate?.slice(0, 10) ?? todayStr(),
        method: recurring?.method ?? "Bank",
        notes: recurring?.notes ?? "",
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

  // Inactive categories stay out of the picker — except the one already on the
  // recurring expense being edited.
  const recurringCategoryOptions = useMemo(() => {
    const selectedId = form.categoryId || recurring?.categoryId || "";
    return categories
      .filter((c) => c.isActive !== false || c.id === selectedId)
      .map((c) => ({ label: c.isActive === false ? `${c.name} (inactive)` : c.name, value: c.id }));
  }, [categories, form.categoryId, recurring?.categoryId]);

  const submit = async () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    const amt = parseAmount(form.amount);
    if (amt <= 0) { toast.error("Enter a valid amount"); return; }
    if (!form.startDate) { toast.error("Start date is required"); return; }
    const body = {
      name: form.name.trim(),
      business: form.business,
      categoryId: form.categoryId, // "" explicitly clears the category on PUT
      amount: amt,
      frequency: "MONTHLY",
      startDate: form.startDate,
      method: form.method || undefined,
      notes: form.notes || undefined,
    };
    const res = editing
      ? await mutate(() => api.put(`/api/recurring-expenses/${recurring!.id}`, body), "Recurring expense updated")
      : await mutate(() => api.post("/api/recurring-expenses", body), "Recurring expense created");
    if (res.ok) { onOpenChange(false); onDone(); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Recurring Expense" : "New Recurring Expense"}</DialogTitle>
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
              options={recurringCategoryOptions}
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
          <Button className="min-h-10 flex-1 sm:flex-none" onClick={submit} disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Expense category manager — rename + activate/deactivate (no delete: past
// expenses reference their category by name, so categories never disappear)
// ---------------------------------------------------------------------------

function CategoryManagerDialog({ open, onOpenChange, onChanged }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Called after any rename/toggle so the parent re-fetches its category lists. */
  onChanged: () => void;
}) {
  const [editingId, setEditingId] = useState("");
  const [editName, setEditName] = useState("");
  const { mutate, saving } = useMutation();

  // Full list (every business, active AND inactive) refetched whenever the dialog opens.
  const categories = useAsync<ExpenseCategoryRec[]>(async () => {
    if (!open) return [];
    const d = await api.get<{ items: ExpenseCategoryRec[] }>("/api/expense-categories");
    return d.items ?? [];
  }, [open]);

  const rename = async (c: ExpenseCategoryRec) => {
    const name = editName.trim();
    if (!name) { toast.error("Enter a category name"); return; }
    if (name === c.name) { setEditingId(""); return; }
    const res = await mutate(() => api.put(`/api/expense-categories/${c.id}`, { name }), `Category renamed to "${name}"`);
    if (res.ok) {
      setEditingId("");
      setEditName("");
      onChanged();
      void categories.reload();
    }
  };

  const toggleActive = async (c: ExpenseCategoryRec, next: boolean) => {
    const res = await mutate(
      () => api.put(`/api/expense-categories/${c.id}`, { isActive: next }),
      next ? `"${c.name}" is active again` : `"${c.name}" hidden from new expenses — past records keep it`
    );
    if (res.ok) { onChanged(); void categories.reload(); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Expense categories</DialogTitle>
          <DialogDescription>
            Rename or pause categories. Paused categories disappear from new-expense pickers; past expenses keep their category name. Deleting is never allowed.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-80 space-y-1.5 overflow-y-auto pr-0.5">
          {categories.loading && <div className="h-20 animate-pulse rounded-lg bg-muted" />}
          {!categories.loading && (categories.data ?? []).length === 0 && (
            <p className="py-4 text-center text-xs text-muted-foreground">No categories yet</p>
          )}
          {(categories.data ?? []).map((c) => {
            const capital = isCapitalCategory(c.name);
            const inactive = c.isActive === false;
            return (
              <div key={c.id} className="flex items-center gap-2 rounded-xl border p-2">
                {editingId === c.id ? (
                  <>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void rename(c); } }}
                      className="h-8 text-sm"
                      aria-label="Category name"
                      autoFocus
                    />
                    <Button type="button" size="sm" className="h-8 shrink-0 px-2" onClick={() => void rename(c)} disabled={saving} aria-label="Save category name">
                      <Check className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                    <Button type="button" size="sm" variant="ghost" className="h-8 shrink-0 px-2" onClick={() => setEditingId("")} aria-label="Cancel rename">
                      ✕
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="min-w-0 flex-1">
                      <p className={cn("truncate text-sm font-medium", inactive && "text-muted-foreground")}>{c.name}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                        <BusinessBadge business={c.business} />
                        {capital && <CapitalBadge />}
                        {inactive && <span>hidden from new expenses</span>}
                      </p>
                    </div>
                    <Switch
                      checked={!inactive}
                      onCheckedChange={(v) => void toggleActive(c, v)}
                      disabled={saving || capital}
                      aria-label={`${inactive ? "Activate" : "Deactivate"} ${c.name}`}
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 shrink-0"
                      onClick={() => { setEditingId(c.id); setEditName(c.name); }}
                      disabled={capital}
                      aria-label={`Rename ${c.name}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" className="min-h-10" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Owner expense breakdown — detailed dashboard
// ---------------------------------------------------------------------------

function NetPositionChip({ net }: { net: number }) {
  if (net < 0) {
    return (
      <Badge variant="outline" className="border-amber-200 bg-amber-50 text-[10px] font-medium text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
        Needs to deposit {formatINR(Math.abs(net))} again
      </Badge>
    );
  }
  if (net > 0) {
    return (
      <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-[10px] font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
        In credit {formatINR(net)}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] font-medium text-muted-foreground">
      Settled — no balance
    </Badge>
  );
}

type QuickCapitalKind = "deposit" | "withdrawal";

function OwnerBreakdownSection({ business, from, to, onQuickAction, refreshKey }: {
  business: string; from: string; to: string;
  onQuickAction?: (kind: QuickCapitalKind, ownerId?: string) => void;
  /** Bumped by the parent whenever expense data changes — keeps this section's numbers fresh. */
  refreshKey?: number;
}) {
  const [mode, setMode] = useState<"all" | "single">("all");
  const [focusId, setFocusId] = useState("");

  const data = useAsync<OwnerBreakdownData>(
    () => api.get("/api/expenses/owner-breakdown" + qs({ from, to, business: business || undefined })),
    [from, to, business, refreshKey]
  );

  const owners = data.data?.owners ?? [];
  const focus = owners.find((o) => o.id === focusId) ?? null;

  const ownerBars = useMemo(
    () =>
      owners.map((o) => ({
        name: o.name.length > 9 ? `${o.name.slice(0, 9)}…` : o.name,
        Deposits: o.deposits,
        Withdrawals: o.withdrawals,
        "Business spend": o.advances,
      })),
    [owners]
  );

  const dailySeries = useMemo(
    () =>
      (data.data?.daily ?? []).map((d) => ({
        day: d.day.slice(5), // MM-DD keeps the axis readable on phones
        Expenses: d.operating,
        Deposits: d.deposits,
        Withdrawals: d.withdrawals,
      })),
    [data.data?.daily]
  );

  const categoryRows = useMemo(() => {
    const rows = mode === "single" && focus ? focus.categories : (data.data?.byCategory ?? []).map((c) => ({ name: c.name, amount: c.amount }));
    return rows
      .slice()
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8)
      .map((r) => ({ label: r.name, value: r.amount, color: CHART_COLORS.amber }));
  }, [mode, focus, data.data?.byCategory]);

  const totals = data.data?.totals;

  // Detailed passbook ledger — every deposit & withdrawal, filtered to the
  // focused owner in single-owner mode. Newest first (API order).
  const ledgerRows = useMemo(() => {
    const all = data.data?.transactions ?? [];
    return mode === "single" && focus ? all.filter((tx) => tx.ownerId === focus.id) : all;
  }, [data.data?.transactions, mode, focus]);

  const ledgerColumns: Column<OwnerBreakdownData["transactions"][number]>[] = [
    {
      key: "owner", label: "Owner", primary: true,
      render: (tx) => (
        <div className="min-w-0">
          <p className="flex items-center gap-1 truncate font-medium">
            <Crown className="h-3 w-3 shrink-0 text-amber-500" aria-hidden />{tx.ownerName}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {fmtDay(tx.date)} · {tx.category}{tx.method ? ` · ${tx.method}` : ""}
          </p>
        </div>
      ),
      value: (tx) => tx.ownerName,
    },
    { key: "date", label: "Date", value: (tx) => fmtDay(tx.date), hideOnMobile: true },
    {
      key: "type", label: "Type",
      render: (tx) =>
        tx.type === "IN" ? (
          <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-[10px] font-semibold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
            <ArrowDownToLine className="mr-1 h-3 w-3" aria-hidden />Deposit
          </Badge>
        ) : (
          <Badge variant="outline" className="border-red-200 bg-red-50 text-[10px] font-semibold text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            <ArrowUpFromLine className="mr-1 h-3 w-3" aria-hidden />Withdrawal
          </Badge>
        ),
      value: (tx) => (tx.type === "IN" ? "Deposit (in)" : "Withdrawal (out)"),
    },
    { key: "category", label: "Category", value: (tx) => tx.category, hideOnMobile: true },
    {
      key: "reason", label: "Reason", hideOnMobile: true,
      render: (tx) => <span className="text-xs text-muted-foreground">{tx.reason || tx.description || "—"}</span>,
      value: (tx) => tx.reason || tx.description || "",
    },
    { key: "business", label: "Business", render: (tx) => <BusinessBadge business={tx.business} />, value: (tx) => tx.business, hideOnMobile: true },
    {
      key: "amount", label: "Amount", className: "text-right",
      render: (tx) => (
        <span className={cn("font-semibold tabular-nums", tx.type === "IN" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
          {tx.type === "IN" ? "+" : "−"}{formatINR(tx.amount)}
        </span>
      ),
      value: (tx) => `${tx.type === "IN" ? "+" : "-"}${formatINR(tx.amount)}`,
    },
    {
      key: "balance", label: "Balance after", className: "text-right",
      render: (tx) => <span className="tabular-nums text-muted-foreground">{formatINR(tx.balanceAfter)}</span>,
      value: (tx) => formatINR(tx.balanceAfter),
      hideOnMobile: true,
    },
  ];

  return (
    <div className="space-y-4" aria-busy={data.loading}>
      {data.error ? (
        <ErrorState message={data.error} onRetry={() => void data.reload()} />
      ) : (
        <>
          {/* Focus switch: all owners combined vs a single owner + quick record actions */}
          <Card>
            <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
              <div
                role="group"
                aria-label="Owner expense focus"
                className="grid w-full grid-cols-2 gap-1 rounded-xl bg-muted p-1 sm:w-auto"
              >
                <button
                  type="button"
                  className={cn(
                    "min-h-9 rounded-lg px-3 text-xs font-medium transition-colors",
                    mode === "all" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => setMode("all")}
                  aria-pressed={mode === "all"}
                >
                  <Users className="mr-1.5 inline h-3.5 w-3.5" aria-hidden />All owners combined
                </button>
                <button
                  type="button"
                  className={cn(
                    "min-h-9 rounded-lg px-3 text-xs font-medium transition-colors",
                    mode === "single" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => { if (!focusId && owners[0]) setFocusId(owners[0].id); setMode("single"); }}
                  aria-pressed={mode === "single"}
                >
                  <Crown className="mr-1.5 inline h-3.5 w-3.5" aria-hidden />Single owner
                </button>
              </div>
              {mode === "single" && (
                <div className="w-full sm:w-56">
                  <SelectInput
                    value={focusId}
                    onChange={setFocusId}
                    placeholder="Choose owner…"
                    options={owners.map((o) => ({ label: o.name, value: o.id }))}
                  />
                </div>
              )}
            </CardContent>
            <CardContent className="flex flex-wrap items-center gap-2 border-t py-2.5 sm:px-4">
              <span className="mr-auto text-[11px] font-medium text-muted-foreground">Quick record owner money:</span>
              <Button
                size="sm" variant="outline"
                className="h-8 gap-1.5 border-emerald-200 text-xs text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-300 dark:hover:bg-emerald-950"
                onClick={() => onQuickAction?.("deposit", mode === "single" ? focusId : undefined)}
                aria-label="Add owner deposit"
              >
                <ArrowDownToLine className="h-3.5 w-3.5" aria-hidden />Add deposit
              </Button>
              <Button
                size="sm" variant="outline"
                className="h-8 gap-1.5 border-red-200 text-xs text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
                onClick={() => onQuickAction?.("withdrawal", mode === "single" ? focusId : undefined)}
                aria-label="Add owner withdrawal"
              >
                <ArrowUpFromLine className="h-3.5 w-3.5" aria-hidden />Add withdrawal
              </Button>
            </CardContent>
          </Card>

          {/* Headline numbers */}
          <StatGrid cols={2}>
            <StatCard
              label="Owner deposits (in)"
              value={formatINR(totals?.deposits ?? 0)}
              icon={ArrowDownToLine}
              tone="positive"
              hint="Money owners put into the business"
            />
            <StatCard
              label="Owner withdrawals (out)"
              value={formatINR(totals?.withdrawals ?? 0)}
              icon={ArrowUpFromLine}
              tone="negative"
              hint="Money owners took for themselves"
            />
            <StatCard
              label="Business spend by owners"
              value={formatINR(totals?.advances ?? 0)}
              icon={HandCoins}
              hint="Operating expenses owners paid on behalf of the business"
            />
            <StatCard
              label="Common (shared) expenses"
              value={formatINR(totals?.commonTotal ?? 0)}
              icon={Users}
              hint="Shared equally by all owners & the business"
            />
            <StatCard
              label="Net owner position"
              value={formatINR(totals?.netPosition ?? 0)}
              icon={Landmark}
              tone={(totals?.netPosition ?? 0) >= 0 ? "positive" : "warning"}
              hint="Deposits − withdrawals"
            />
            <StatCard
              label="Operating expenses"
              value={formatINR(totals?.operating ?? 0)}
              icon={Receipt}
              tone="negative"
              hint="Feeds profit — owner deposits/withdrawals excluded"
            />
          </StatGrid>

          {/* Single-owner focus card */}
          {mode === "single" && (
            focus ? (
              <Card className="border-primary/30">
                <CardContent className="space-y-4 p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary" aria-hidden>
                        <Crown className="h-4.5 w-4.5" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{focus.name}</p>
                        <p className="text-[11px] text-muted-foreground">Owner expense ledger — this range</p>
                      </div>
                    </div>
                    <NetPositionChip net={focus.net} />
                  </div>
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                    <div className="rounded-xl border p-3">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Deposits in</p>
                      <p className="mt-1 text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{formatINR(focus.deposits)}</p>
                    </div>
                    <div className="rounded-xl border p-3">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Took out</p>
                      <p className="mt-1 text-sm font-bold tabular-nums text-red-600 dark:text-red-400">{formatINR(focus.withdrawals)}</p>
                    </div>
                    <div className="rounded-xl border p-3">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Business spend</p>
                      <p className="mt-1 text-sm font-bold tabular-nums">{formatINR(focus.advances)}</p>
                    </div>
                    <div className="rounded-xl border p-3">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Net position</p>
                      <p className={cn("mt-1 text-sm font-bold tabular-nums", focus.net < 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400")}>{formatINR(focus.net)}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Business split:</span>
                    <BusinessBadge business="MANPOWER" />
                    <span className="font-semibold tabular-nums">{formatINR(focus.manpower)}</span>
                    <BusinessBadge business="TRANSPORT" />
                    <span className="font-semibold tabular-nums">{formatINR(focus.transport)}</span>
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-semibold">What they spent on</p>
                    {focus.categories.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No expense rows in this range.</p>
                    ) : (
                      <MiniBars rows={focus.categories.slice().sort((a, b) => b.amount - a.amount).slice(0, 8).map((c) => ({ label: c.name, value: c.amount, color: CHART_COLORS.emerald }))} />
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-6 text-center text-sm text-muted-foreground">
                  No active owners found. Add owners from the Owners page.
                </CardContent>
              </Card>
            )
          )}

          {/* Charts — combined view */}
          {mode === "all" && (
            <div className="grid gap-4 xl:grid-cols-2">
              <Card>
                <CardContent className="p-3 sm:p-4">
                  <p className="mb-1 text-sm font-semibold">Deposits vs withdrawals — by owner</p>
                  <p className="mb-2 text-[11px] text-muted-foreground">Who put money in, who took money out, and whose card the business spend ran on</p>
                  {ownerBars.length === 0 ? (
                    <p className="flex h-44 items-center justify-center text-xs text-muted-foreground sm:h-52">No owner activity in this range</p>
                  ) : (
                    <BarsCompare
                      data={ownerBars}
                      xKey="name"
                      showValues
                      series={[
                        { key: "Deposits", label: "Deposits", color: CHART_COLORS.emerald },
                        { key: "Withdrawals", label: "Withdrawals", color: CHART_COLORS.red },
                        { key: "Business spend", label: "Business spend", color: CHART_COLORS.amber },
                      ]}
                    />
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 sm:p-4">
                  <p className="mb-1 text-sm font-semibold">Daily flow</p>
                  <p className="mb-2 text-[11px] text-muted-foreground">Operating expenses vs owner deposits & withdrawals per day</p>
                  {dailySeries.length === 0 ? (
                    <p className="flex h-44 items-center justify-center text-xs text-muted-foreground sm:h-52">No activity in this range</p>
                  ) : (
                    <AreaTrend
                      data={dailySeries}
                      xKey="day"
                      series={[
                        { key: "Expenses", label: "Operating expenses", color: CHART_COLORS.amber },
                        { key: "Deposits", label: "Deposits", color: CHART_COLORS.emerald },
                        { key: "Withdrawals", label: "Withdrawals", color: CHART_COLORS.red },
                      ]}
                    />
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Category breakdown for the current focus */}
          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-1">
              <CardContent className="p-3 sm:p-4">
                <p className="mb-3 text-sm font-semibold">{mode === "single" ? `${focus?.name ?? "Owner"} — categories` : "All categories"}</p>
                {data.loading ? (
                  <div className="space-y-2.5">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-8 animate-pulse rounded-lg bg-muted" />)}</div>
                ) : categoryRows.length === 0 ? (
                  <p className="py-4 text-center text-xs text-muted-foreground">Nothing in this range</p>
                ) : (
                  <MiniBars rows={categoryRows} />
                )}
              </CardContent>
            </Card>

            {/* Common (shared) expenses card */}
            <Card className="border-sky-200/70 dark:border-sky-900 xl:col-span-1">
              <CardContent className="space-y-3 p-3 sm:p-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100 text-sky-600 dark:bg-sky-950 dark:text-sky-400" aria-hidden>
                    <Users className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">Common expenses</p>
                    <p className="text-[11px] text-muted-foreground">For all owners & the business equally</p>
                  </div>
                </div>
                <p className="text-2xl font-bold tabular-nums">{formatINR(data.data?.common.total ?? 0)}</p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <BusinessBadge business="MANPOWER" />
                  <span className="font-semibold tabular-nums text-foreground">{formatINR(data.data?.common.manpower ?? 0)}</span>
                  <BusinessBadge business="TRANSPORT" />
                  <span className="font-semibold tabular-nums text-foreground">{formatINR(data.data?.common.transport ?? 0)}</span>
                </div>
                {(data.data?.common.categories ?? []).length > 0 && (
                  <MiniBars
                    rows={(data.data?.common.categories ?? []).slice().sort((a, b) => b.amount - a.amount).slice(0, 6).map((c) => ({ label: c.name, value: c.amount, color: CHART_COLORS.teal }))}
                  />
                )}
              </CardContent>
            </Card>

            {/* Per-owner ledger table */}
            <Card className="xl:col-span-1">
              <CardContent className="p-3 sm:p-4">
                <p className="mb-3 text-sm font-semibold">Owner ledger</p>
                <div className="max-h-96 space-y-2 overflow-y-auto pr-0.5">
                  {owners.length === 0 && !data.loading && (
                    <p className="py-4 text-center text-xs text-muted-foreground">No owners yet</p>
                  )}
                  {owners.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      className={cn(
                        "w-full rounded-xl border p-2.5 text-left transition-colors hover:bg-muted/50",
                        mode === "single" && focusId === o.id && "border-primary/50 bg-primary/5"
                      )}
                      onClick={() => { setFocusId(o.id); setMode("single"); }}
                      aria-label={`Focus ${o.name}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium">{o.name}</p>
                        <NetPositionChip net={o.net} />
                      </div>
                      <div className="mt-1.5 grid grid-cols-3 gap-1.5 text-[11px]">
                        <span className="text-muted-foreground">In <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{formatINR(o.deposits, { compact: true })}</span></span>
                        <span className="text-muted-foreground">Out <span className="font-semibold tabular-nums text-red-600 dark:text-red-400">{formatINR(o.withdrawals, { compact: true })}</span></span>
                        <span className="text-muted-foreground">Spend <span className="font-semibold tabular-nums">{formatINR(o.advances, { compact: true })}</span></span>
                      </div>
                    </button>
                  ))}
                </div>
                {(data.data?.unattributed.total ?? 0) > 0 && (
                  <p className="mt-3 rounded-lg border border-dashed p-2 text-[11px] text-muted-foreground">
                    {formatINR(data.data!.unattributed.total)} of older expenses has no owner attribution (recorded before owner tracking).
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Detailed passbook ledger — every deposit & withdrawal, one row each */}
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Detailed ledger — deposits &amp; withdrawals</p>
                  <p className="text-[11px] text-muted-foreground">
                    Every owner money movement in this range, newest first, with the running balance{mode === "single" && focus ? ` — ${focus.name} only` : " of all owners combined"}
                  </p>
                </div>
                <Badge variant="outline" className="shrink-0 text-[10px]">{ledgerRows.length} {ledgerRows.length === 1 ? "entry" : "entries"}</Badge>
              </div>
              {data.loading ? (
                <div className="space-y-2.5">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />)}</div>
              ) : ledgerRows.length === 0 ? (
                <div className="rounded-xl border border-dashed p-6 text-center">
                  <p className="text-sm font-medium">No deposits or withdrawals in this range yet</p>
                  <p className="mt-1 text-xs text-muted-foreground">Use “Add deposit” / “Add withdrawal” above — each entry then appears here with date, reason and running balance.</p>
                </div>
              ) : (
                <DataTable
                  columns={ledgerColumns}
                  rows={ledgerRows}
                  rowKey={(tx) => tx.id}
                  exportName="owner-deposits-withdrawals"
                  emptyIcon={Landmark}
                  emptyTitle="No movements"
                  emptyDescription="No deposits or withdrawals match this range."
                />
              )}
            </CardContent>
          </Card>

          {/* Reconciliation note — makes the zero-mismatch guarantee visible */}
          <p className="px-1 text-[11px] text-muted-foreground">
            Reconciliation: operating {formatINR(totals?.operating ?? 0)} + owner capital {formatINR(totals?.capital ?? 0)} = all expense rows {formatINR(totals?.grand ?? 0)}.
            Dashboards, reports and net profit count <span className="font-semibold text-foreground">operating expenses only</span> — owner deposits & withdrawals are capital, never P&amp;L expenses.
          </p>
        </>
      )}
    </div>
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
  const [expenseType, setExpenseType] = useState("");
  const [search, setSearch] = useState("");
  const searchDeb = useDebounced(search);
  const [rangeKey, setRangeKey] = useState<RangeKey>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const eff = rangeKey === "custom" ? { from: customFrom, to: customTo } : rangeDates(rangeKey);

  // Static option lists (catVersion bumps when the category manager edits a category)
  const [catVersion, setCatVersion] = useState(0);
  const categories = useAsync<{ items: ExpenseCategoryRec[] }>(
    () => api.get("/api/expense-categories" + qs({ business: business || undefined })),
    [business, catVersion]
  );
  const vehicles = useAsync<{ items: VehicleRec[] }>(() => api.get("/api/vehicles"), []);
  const owners = useAsync<{ items: OwnerRec[] }>(() => api.get("/api/owners"), []);

  // Main list
  const expenses = useAsync<ListResp<ExpenseRec> & {
    totals?: {
      amount: number;
      operating?: number;
      netOperating?: number;
      capital?: number;
      netCapital?: number;
      common?: number;
      refunds?: number;
      deposits?: number;
      withdrawals?: number;
    };
  }>(
    () => api.get("/api/expenses" + qs({
      business: business || undefined,
      categoryId: categoryId || undefined,
      vehicleId: vehicleId || undefined,
      ownerId: ownerId || undefined,
      type: expenseType || undefined,
      from: eff.from || undefined,
      to: eff.to || undefined,
      search: searchDeb || undefined,
      pageSize: 200,
    })),
    [business, categoryId, vehicleId, ownerId, expenseType, eff.from, eff.to, searchDeb]
  );

  // Recurring section
  const [recOpen, setRecOpen] = useState(false);
  const [recAddOpen, setRecAddOpen] = useState(false);
  const [recEditTarget, setRecEditTarget] = useState<RecurringRow | null>(null);
  const recurring = useAsync<RecurringRow[]>(async () => {
    const d = await api.get<RecurringRow[] | { items: RecurringRow[] }>("/api/recurring-expenses");
    return Array.isArray(d) ? d : (d.items ?? []);
  }, []);

  const items = expenses.data?.items ?? [];
  const vehicleItems = business === "TRANSPORT" ? vehicles.data?.items ?? [] : [];

  const [editTarget, setEditTarget] = useState<ExpenseRec | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ExpenseRec | null>(null);
  const [catManageOpen, setCatManageOpen] = useState(false);

  // Quick actions open the Add Expense dialog pre-filled with preset
  const [addPreset, setAddPreset] = useState<ExpensePreset | null>(null);
  const openQuickCapital = (kind: QuickCapitalKind, ownerId?: string) => {
    setAddPreset({
      type: kind === "deposit" ? "DEPOSIT" : "DRAWING",
      categoryName: kind === "deposit" ? "Owner Contribution" : "Owner Withdrawal",
      spentById: ownerId || undefined,
    });
    setAddOpen(true);
  };
  const openQuickRefund = (r: ExpenseRec) => {
    setAddPreset({
      type: "REFUND",
      categoryName: "Expense Refund",
      amount: r.amount,
      description: `Refund: ${r.description || r.categoryName || "Expense"}`,
      reason: `Returned from ${fmtDay(r.date)} expense`,
      spentById: r.spentById || undefined,
    });
    setAddOpen(true);
  };

  // Expenses tab ↔ Owner Breakdown tab (controlled so the hint strip can link across).
  const [tab, setTab] = useState("expenses");

  // Version bump whenever expense data changes — the Owner Breakdown section
  // includes it in its fetch deps so its numbers NEVER go stale after a
  // quick-action deposit/withdrawal, delete, edit or undo.
  const [bdVersion, setBdVersion] = useState(0);
  const reloadExpenses = () => { void expenses.reload(); setBdVersion((v) => v + 1); };

  // An undo applied from the global Undo Center may have restored rows — refresh.
  useEffect(() => {
    const onUndoApplied = () => reloadExpenses();
    window.addEventListener(UNDO_APPLIED_EVENT, onUndoApplied);
    return () => window.removeEventListener(UNDO_APPLIED_EVENT, onUndoApplied);
  }, [expenses.reload]);

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

  // Bulk selection + delete
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [lineageData, setLineageData] = useState<TransactionLineageData | null>(null);

  const openLineage = (r: ExpenseRec) => {
    const isCap = r.kind === "CAPITAL" || isCapitalCategory(r.categoryName);
    setLineageData({
      id: `exp-${r.id}`,
      title: `Expense: ${r.categoryName || "General Expense"}`,
      type: isCap ? "CAPITAL TRANSACTION" : `${r.business} OPERATING EXPENSE`,
      amount: r.amount,
      date: fmtDay(r.date),
      createdAt: (r as unknown as { createdAt?: string }).createdAt || String(r.date),
      createdByName: r.spentByName || "Operations Admin",
      ruleExplanation: isCap
        ? "Owner capital transaction (deposit or withdrawal). Directly impacts owner equity and passbook balance without affecting business operating profit or loss."
        : `Operational expenditure incurred for the ${r.business} division. Stamped as an operating expense feeding the financial P&L statement.`,
      impactedAccounts: [
        {
          account: isCap ? "Owner Capital / Equity Account" : `${r.business} Operating Expense`,
          type: "debit",
          amount: r.amount,
          description: isCap ? "Partner equity adjustment" : "Direct operating cost incurred",
        },
        {
          account: r.method ? `${r.method} Account` : "Cash / Bank Account",
          type: "credit",
          amount: r.amount,
          description: "Payment outflow from business funds",
        },
      ],
      linkedEntities: [
        ...(r.vehicleId ? [{
          label: "Fleet Vehicle Asset",
          name: r.vehicleName || "Vehicle",
          onClick: () => navigate("vehicles", { id: r.vehicleId! }),
        }] : []),
        ...(r.spentById && !r.isCommon ? [{
          label: "Paying Owner / Partner",
          name: r.spentByName || "Owner",
          onClick: () => navigate("owners", { id: r.spentById! }),
        }] : []),
      ],
      notes: [
        r.description ? `Description: ${r.description}` : null,
        r.reason ? `Reason: ${r.reason}` : null,
        r.method ? `Method: ${r.method}` : null,
      ].filter(Boolean).join(" · ") || undefined,
    });
  };

  const onBusinessChange = (v: string) => {
    setBusiness(v);
    setCategoryId("");
    setVehicleId("");
  };

  const removeExpense = async () => {
    if (!deleteTarget) return;
    const res = await mutate(() => api.del(`/api/expenses/${deleteTarget.id}`), "Expense deleted", () => ({ module: "EXPENSE", recordId: deleteTarget.id, onUndo: () => reloadExpenses() }));
    if (res.ok) reloadExpenses();
    setDeleteTarget(null);
  };

  // Bulk delete: one DELETE at a time (allSettled semantics — a failure never
  // aborts the rest), then a single toast + one Undo action that reverses every
  // deleted row via the audit log.
  const bulkDelete = async () => {
    const ids = items.filter((r) => selectedIds.has(r.id)).map((r) => r.id);
    if (ids.length === 0) { setBulkConfirm(false); return; }
    setBulkConfirm(false);
    const results: PromiseSettledResult<unknown>[] = [];
    for (const id of ids) {
      try {
        results.push({ status: "fulfilled", value: await api.del(`/api/expenses/${id}`) });
      } catch (e) {
        results.push({ status: "rejected", reason: e });
      }
    }
    const okIds = ids.filter((_, i) => results[i].status === "fulfilled");
    if (okIds.length > 0) {
      toast.success(`Deleted ${okIds.length} of ${ids.length} expense${ids.length === 1 ? "" : "s"}`, {
        duration: 8000,
        action: {
          label: "Undo",
          onClick: () => {
            void (async () => {
              for (const id of okIds) {
                await undoRequest({ module: "EXPENSE", recordId: id, onUndo: () => reloadExpenses() });
              }
            })();
          },
        },
      });
    } else {
      toast.error("Could not delete the selected expenses");
    }
    setSelectedIds(new Set());
    void reloadExpenses();
  };

  const toggleRecurring = async (row: RecurringRow, next: boolean) => {
    const res = await mutate(() => api.put(`/api/recurring-expenses/${row.id}/toggle`, { isActive: next }));
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
      reloadExpenses();
    }
  };

  const columns: Column<ExpenseRec>[] = [
    {
      key: "description", label: t(lang, "col.expense"), primary: true,
      render: (r) => (
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-medium truncate">{r.description || r.categoryName || "Untitled expense"}</span>
            <TransactionTypeBadge kind={r.kind} categoryName={r.categoryName} isCommon={r.isCommon} spentById={r.spentById} />
          </div>
          <p className="truncate text-[11px] text-muted-foreground mt-0.5">
            {fmtDay(r.date)} · {r.categoryName ?? "Uncategorized"}{r.reason ? ` · ${r.reason}` : ""}
          </p>
        </div>
      ),
      value: (r) => r.description || r.categoryName || "Untitled expense",
    },
    { key: "date", label: t(lang, "col.date"), value: (r) => fmtDay(r.date), hideOnMobile: true },
    { key: "business", label: t(lang, "col.business"), render: (r) => <BusinessBadge business={r.business} />, value: (r) => r.business },
    { key: "category", label: t(lang, "col.category"), value: (r) => r.categoryName ?? "—", hideOnMobile: true },
    { key: "vehicle", label: t(lang, "col.vehicle"), value: (r) => r.vehicleName ?? "—", hideOnMobile: true },
    {
      key: "spentBy", label: t(lang, "col.spentBy"),
      render: (r) =>
        r.isCommon ? (
          <CommonBadge />
        ) : (
          <span className="flex items-center gap-1 text-sm"><Crown className="h-3 w-3 shrink-0 text-amber-500" aria-hidden />{r.spentByName ?? "—"}</span>
        ),
      value: (r) => (r.isCommon ? "Common — all owners" : (r.spentByName ?? "—")),
    },
    {
      key: "reason", label: "Reason", hideOnMobile: true,
      render: (r) => <span className="text-xs text-muted-foreground">{r.reason ?? "—"}</span>,
      value: (r) => r.reason ?? "",
    },
    {
      key: "amount", label: t(lang, "col.amount"), className: "text-right",
      render: (r) => {
        const isRefund = r.kind === "REFUND";
        const cat = (r.categoryName ?? "").toUpperCase();
        const isDeposit = r.kind === "CAPITAL" && (cat.includes("CONTRIBUTION") || cat.includes("DEPOSIT") || cat.includes("INVEST"));
        const isDrawing = r.kind === "CAPITAL" && (cat.includes("WITHDRAWAL") || cat.includes("DRAWING"));
        return (
          <span className={cn(
            "font-semibold tabular-nums",
            isRefund && "text-cyan-600 dark:text-cyan-400 font-bold",
            isDeposit && "text-emerald-600 dark:text-emerald-400 font-bold",
            isDrawing && "text-amber-600 dark:text-amber-400"
          )}>
            {isRefund || isDeposit ? `+${formatINR(r.amount)}` : formatINR(r.amount)}
          </span>
        );
      },
      value: (r) => formatINR(r.amount),
    },
    {
      key: "actions", label: "", className: "w-14",
      render: (r) => (
        <div className="flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 sm:h-8 sm:w-8" aria-label={`Actions for ${r.description || "expense"}`}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => setEditTarget(r)}>
                <Pencil className="h-3.5 w-3.5" />Edit
              </DropdownMenuItem>
              {r.kind === "OPERATING" && (
                <DropdownMenuItem onClick={() => openQuickRefund(r)}>
                  <RefreshCw className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
                  <span>Record Refund / Return</span>
                </DropdownMenuItem>
              )}
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

  const totals = expenses.data?.totals;
  const operating = totals?.operating ?? 0;
  const netOperating = totals?.netOperating ?? operating;
  const refunds = totals?.refunds ?? 0;
  const capital = totals?.capital ?? 0;
  const netCapital = totals?.netCapital ?? 0;
  const deposits = totals?.deposits ?? 0;
  const withdrawals = totals?.withdrawals ?? 0;

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

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-10 w-full sm:w-auto" aria-label="Expense sections">
          <TabsTrigger value="expenses" className="flex-1 gap-1.5 sm:flex-none sm:px-4">
            <Receipt className="h-3.5 w-3.5" aria-hidden />Expenses
          </TabsTrigger>
          <TabsTrigger value="owners" className="flex-1 gap-1.5 sm:flex-none sm:px-4">
            <Crown className="h-3.5 w-3.5" aria-hidden />Owner Breakdown
          </TabsTrigger>
        </TabsList>

        {/* ------------------------- Expenses tab ------------------------- */}
        <TabsContent value="expenses" className="mt-4 space-y-4">
          {/* Discoverability pointer — owner deposits & withdrawals live in the Owner Breakdown tab */}
          <Card className="border-amber-200/70 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/30">
            <CardContent className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:p-3.5">
              <div className="flex min-w-0 items-start gap-2.5">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300" aria-hidden>
                  <Landmark className="h-4 w-4" />
                </span>
                <p className="text-xs leading-relaxed text-foreground">
                  <span className="font-semibold">Owner money in &amp; out?</span> When recording an expense, choose <span className="font-semibold">who took or put in the money</span> under “Paid by / Owner” — deposits, withdrawals, reasons and the full statement with running balance live in the <span className="font-semibold">Owner Breakdown</span> tab.
                </p>
              </div>
              <Button
                size="sm" variant="outline"
                className="h-8 shrink-0 gap-1.5 border-amber-300 text-xs text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:text-amber-200 dark:hover:bg-amber-900"
                onClick={() => setTab("owners")}
              >
                <Crown className="h-3.5 w-3.5" aria-hidden />Open Owner Breakdown
              </Button>
            </CardContent>
          </Card>

          {/* Filters */}
          <Card>
            <CardContent className="space-y-3 p-3 sm:p-4">
              <div className="grid grid-cols-2 gap-2.5 sm:gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <SelectInput value={business} onChange={onBusinessChange} options={BUSINESS_OPTIONS} placeholder="All businesses" />
                <SelectInput
                  value={expenseType}
                  onChange={setExpenseType}
                  options={[
                    { label: "All types", value: "" },
                    { label: "Operating (Business costs)", value: "OPERATING" },
                    { label: "Drawings (Owner withdrawals)", value: "DRAWING" },
                    { label: "Deposits (Owner capital/repayments)", value: "DEPOSIT" },
                    { label: "Refunds (Cash returned)", value: "REFUND" },
                    { label: "Out-of-Pocket (Paid by owner)", value: "OUT_OF_POCKET" },
                  ]}
                  placeholder="All types"
                />
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
                  options={[
                    { label: "All owners", value: "" },
                    { label: "Common — shared by all", value: "COMMON" },
                    ...((owners.data?.items ?? []).map((o) => ({ label: o.name, value: o.id }))),
                  ]}
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

          <StatGrid cols={2} className="sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Net Operating"
              value={formatINR(netOperating)}
              icon={Wallet}
              tone="negative"
              hint={refunds > 0 ? `Gross ${formatINR(operating)} − Refunds ${formatINR(refunds)}` : "Feeds profit & reports"}
            />
            <StatCard
              label="Refunds & Returns"
              value={formatINR(refunds)}
              icon={RefreshCw}
              tone="positive"
              hint="Offsets operating overhead"
            />
            <StatCard
              label="Owner Capital Flow"
              value={formatINR(netCapital)}
              icon={Landmark}
              hint={`Deposits ${formatINR(deposits)} | Drawings ${formatINR(withdrawals)}`}
            />
            <StatCard
              label="Common & Total"
              value={formatINR(totals?.common ?? 0)}
              icon={Users}
              hint={`${expenses.data?.total ?? items.length} records matching`}
            />
          </StatGrid>

          {/* Reconciliation strip — visible guarantee the numbers always add up */}
          <p className="px-1 text-[11px] text-muted-foreground">
            Reconciliation: Gross operating {formatINR(operating)} − Refunds {formatINR(refunds)} = Net operating {formatINR(netOperating)}. Owner Capital: Deposits {formatINR(deposits)} − Drawings {formatINR(withdrawals)} = Net capital {formatINR(netCapital)}. Grand total of all rows: {formatINR(totals?.amount ?? 0)}.
          </p>

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
                    onRowClick={(r) => openLineage(r)}
                    exportName="expenses"
                    loading={expenses.loading}
                    emptyIcon={Receipt}
                    emptyTitle="No expenses match"
                    emptyDescription="Try widening the date range or clearing filters."
                    selectKey={(r) => r.id}
                    selectedIds={selectedIds}
                    onSelectedChange={setSelectedIds}
                    bulkBar={(ids) => (
                      <>
                        <span className="px-1.5 text-xs font-semibold tabular-nums whitespace-nowrap">
                          {ids.length} selected
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1.5 text-xs"
                          onClick={() =>
                            downloadCsv(
                              "expenses-selected",
                              columns,
                              items.filter((r) => ids.includes(r.id))
                            )
                          }
                          aria-label={`Export ${ids.length} selected expenses as CSV`}
                        >
                          <Download className="h-3.5 w-3.5" aria-hidden />Export CSV
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-8 gap-1.5 text-xs"
                          onClick={() => setBulkConfirm(true)}
                          aria-label={`Delete ${ids.length} selected expenses`}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />Delete
                        </Button>
                      </>
                    )}
                  />
                )}
              </CardContent>
            </Card>

            {/* Side: breakdown + recurring */}
            <div className="space-y-4">
              <Card>
                <CardContent className="p-3 sm:p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">Category breakdown</p>
                    <Button
                      size="sm" variant="ghost" className="h-7 gap-1 text-xs"
                      onClick={() => setCatManageOpen(true)}
                      aria-label="Manage expense categories"
                    >
                      <Pencil className="h-3 w-3" aria-hidden />Manage
                    </Button>
                  </div>
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
                              <Switch checked={(row.isActive ?? row.active) ?? false} onCheckedChange={(v) => void toggleRecurring(row, v)} disabled={saving} aria-label={`Toggle ${row.name}`} />
                              {(row.isActive ?? row.active) === false ? "Paused" : "Active"}
                            </label>
                            <span className="flex items-center gap-1.5">
                              <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={() => setRecEditTarget(row)} aria-label={`Edit ${row.name}`}>
                                <Pencil className="h-3 w-3" aria-hidden />Edit
                              </Button>
                              <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => void runRecurring(row)} disabled={saving}>
                                <Play className="h-3 w-3" aria-hidden />Run now
                              </Button>
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ---------------------- Owner Breakdown tab ---------------------- */}
        <TabsContent value="owners" className="mt-4">
          <OwnerBreakdownSection business={business} from={eff.from} to={eff.to} onQuickAction={openQuickCapital} refreshKey={bdVersion} />
        </TabsContent>
      </Tabs>

      <ExpenseFormDialog
        open={addOpen}
        onOpenChange={(v) => { setAddOpen(v); if (!v) setAddPreset(null); }}
        expense={null}
        vehicles={vehicles.data?.items ?? []}
        onDone={() => { reloadExpenses(); }}
        preset={addPreset}
      />

      {/* Mobile FAB — alternate trigger for Add Expense (hidden while bulk rows
          are selected so the sticky bulk bar stays unobstructed) */}
      {selectedIds.size === 0 && (
        <ViewFab icon={Plus} label="Add expense" onClick={() => setAddOpen(true)} />
      )}
      <ExpenseFormDialog open={Boolean(editTarget)} onOpenChange={(v) => !v && setEditTarget(null)} expense={editTarget} vehicles={vehicles.data?.items ?? []} onDone={() => reloadExpenses()} />
      <RecurringFormDialog
        open={recAddOpen || Boolean(recEditTarget)}
        onOpenChange={(v) => { setRecAddOpen(false); if (!v) setRecEditTarget(null); }}
        recurring={recEditTarget}
        onDone={() => { void recurring.reload(); reloadExpenses(); }}
      />

      <CategoryManagerDialog
        open={catManageOpen}
        onOpenChange={setCatManageOpen}
        onChanged={() => setCatVersion((v) => v + 1)}
      />

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

      <AlertDialog open={bulkConfirm} onOpenChange={setBulkConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} selected expense{selectedIds.size === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>
              Each deleted expense is audit-logged — a single Undo action after deleting restores every row from the audit trail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-10">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-10 bg-red-600 text-white hover:bg-red-700"
              onClick={(e) => { e.preventDefault(); void bulkDelete(); }}
            >
              Delete {selectedIds.size}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Universal Transaction Lineage Dialog */}
      <TransactionLineageDialog
        open={Boolean(lineageData)}
        onOpenChange={(o) => { if (!o) setLineageData(null); }}
        data={lineageData}
      />
    </div>
  );
}
