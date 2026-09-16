"use client";

// Shared view-level building blocks used by multiple views in components/views/.
// Owns: data hooks, form fields, charts, pickers, and the three cross-view dialogs
// (DeployWizard, RecordPaymentDialog, GiveAdvanceDialog). Do not import outside views/.

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError, qs } from "@/lib/api-client";
import { formatINR, parseAmount } from "@/lib/money";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LabelList,
  BarChart, Bar,
} from "recharts";
import {
  AlertTriangle, AlertCircle, ArrowRight, Banknote, Check, ChevronLeft, RefreshCw, Search, Users,
} from "lucide-react";

// ---------------------------------------------------------------------------
// API record shapes (subset of contract fields used by views)
// ---------------------------------------------------------------------------

export interface EmployeeRec {
  id: string;
  code: string;
  fullName: string;
  photoUrl?: string | null;
  gender?: string | null;
  mobile?: string | null;
  whatsapp?: string | null;
  address?: string | null;
  city?: string | null;
  joiningDate?: string | null;
  designation?: string | null;
  skills?: string | null;
  standardRate?: number | null;
  rateType?: string | null;
  employmentType?: string | null; // NON_SALARIED | SALARIED
  monthlySalary?: number | null;
  overtimeThreshold?: number | null;
  overtimeRate?: number | null;
  onBusinessRent?: boolean | null;
  rentAmount?: number | null;
  rentMode?: string | null; // MONTH | DAY
  hasContractor?: boolean | null;
  contractorName?: string | null;
  contractorRateCut?: number | null;
  status: string;
  bankDetails?: string | null;
  upiId?: string | null;
  preferredPaymentMethod?: string | null;
  notes?: string | null;
  advanceBalance?: number;
}

export interface DeploymentRec {
  id: string;
  date: string;
  employeeId: string;
  employeeName: string;
  employeeCode?: string;
  propertyId: string;
  propertyName: string;
  shift: string;
  billingRate?: number;
  payoutRate?: number;
  billingAmount?: number;
  payoutAmount?: number;
  adjustmentAmount?: number | null;
  adjustmentNote?: string | null;
  contractorName?: string | null;
  contractorRateCut?: number | null;
  contractorCut?: number | null;
  paidStatus?: string;
  paidAmount?: number | null;
  notes?: string | null;
  createdByName?: string;
  createdAt?: string;
}

export interface PropertyRec {
  id: string;
  name: string;
  brandName?: string | null;
  type?: string | null;
  address?: string | null;
  contactPerson?: string | null;
  contactNumber?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  startDate?: string | null;
  billingRate?: number | null;
  status: string;
  notes?: string | null;
  totalBilled?: number;
  totalReceived?: number;
  totalOutstanding?: number;
}

export interface PaymentRec {
  id: string;
  propertyId: string;
  propertyName?: string;
  date: string;
  amount: number;
  method?: string | null;
  reference?: string | null;
  notes?: string | null;
  receivedByName?: string | null;
}

export interface AdvanceRec {
  id: string;
  employeeId: string;
  employeeName?: string;
  employeeCode?: string;
  date: string;
  amount: number;
  reason?: string | null;
  method?: string | null;
  reference?: string | null;
  givenByName?: string | null;
  settlementId?: string | null;
}

export interface SettlementLineRec {
  date: string;
  propertyName: string;
  shift: string;
  rate: number;
  amount: number;
}

export interface SettlementRec {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode?: string;
  month: string;
  totalDays?: number;
  dayShifts?: number;
  nightShifts?: number;
  grossEarnings?: number;
  additions?: number;
  rentDeducted?: number; // [ADDED]
  advanceDeducted?: number;
  otherDeductions?: number;
  contractorCut?: number;
  netPayable?: number;
  advanceCarryForward?: number | null;
  status: string;
  notes?: string | null;
  lines?: SettlementLineRec[];
}

export interface ExpenseRec {
  id: string;
  date: string;
  business: string;
  categoryId?: string | null;
  categoryName?: string | null;
  amount: number;
  method?: string | null;
  description?: string | null;
  notes?: string | null;
  reason?: string | null;
  vehicleId?: string | null;
  vehicleName?: string | null;
  spentById?: string | null;
  spentByName?: string | null;
  isCommon?: boolean;
  kind?: string; // OPERATING | CAPITAL
}

export interface VehicleRec {
  id: string;
  code: string;
  registrationNumber: string;
  name: string;
  make?: string | null;
  model?: string | null;
  variant?: string | null;
  year?: number | null;
  purchaseDate?: string | null;
  purchasePrice?: number | null;
  status: string;
  insuranceCompany?: string | null;
  insuranceNumber?: string | null;
  insuranceExpiry?: string | null;
  permitInfo?: string | null;
  fitnessExpiry?: string | null;
  notes?: string | null;
  loanAmount?: number | null;
  monthlyEmi?: number | null;
  emiStartDate?: string | null;
  emiEndDate?: string | null;
  emiCount?: number | null;
  stats?: {
    monthRevenue: number;
    monthExpense: number;
    monthEmi: number;
    monthNet: number;
    revenue: number;
    expense: number;
    net: number;
  };
}

export interface ClientRec {
  id: string;
  name: string;
  company?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  address?: string | null;
  billingDetails?: string | null;
  notes?: string | null;
  tripCount?: number;
  totalBusiness?: number;
}

export interface TripRec {
  id: string;
  vehicleId: string;
  vehicleName?: string;
  vehicleReg?: string;
  clientId: string;
  clientName?: string;
  startAt: string;
  endAt?: string | null;
  tripType: string;
  rentalType?: string | null;
  pickup?: string | null;
  destination?: string | null;
  driver?: string | null;
  agreedAmount: number;
  advanceReceived?: number;
  extraCharges?: number;
  finalAmount?: number | null;
  paymentStatus: string;
  status: string;
  fuelResponsibility?: string | null;
  notes?: string | null;
  paidAmount?: number;
  createdByName?: string;
}

export interface ListResp<T> { items: T[]; total: number; page?: number; pageSize?: number }

// ---------------------------------------------------------------------------
// Hooks & small utils
// ---------------------------------------------------------------------------

export function errMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "Something went wrong";
}

/** Fetch-on-mount hook with loading/error/reload. Toasts load failures. */
export function useAsync<T>(loader: () => Promise<T>, deps: React.DependencyList) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await loader();
      setData(d);
      setError(null);
    } catch (e) {
      const msg = errMessage(e);
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, deps);
  useEffect(() => { void load(); }, [load]);
  return { data, loading, error, reload: load, setData };
}

/** Mutation wrapper: consistent error toasts, optional success toast.
 *  Pass an `undo` resolver to attach an "Undo" action to the success toast —
 *  it reverses the entry server-side (zero mismatch) and calls onUndo. */
export interface UndoSpec {
  module: string; // PAYMENT / ADVANCE / EXPENSE / DEPLOYMENT / TRIP / EMI / MAINTENANCE / ADJUSTMENT
  recordId?: string;
  onUndo?: () => void;
}

export async function undoRequest(spec: {
  auditLogId?: string;
  module?: string;
  recordId?: string;
  onUndo?: () => void;
}): Promise<boolean> {
  try {
    await api.post("/api/undo", {
      ...(spec.auditLogId ? { auditLogId: spec.auditLogId } : { module: spec.module, recordId: spec.recordId }),
    });
    toast.success("Entry reversed — everything is back to how it was", { icon: "↩️" });
    spec.onUndo?.();
    return true;
  } catch (e) {
    toast.error(errMessage(e));
    return false;
  }
}

/** Fired after an undo succeeds via the Undo Center — open views may reload. */
export const UNDO_APPLIED_EVENT = "bizhub:undo-applied";

export function useMutation() {
  const [saving, setSaving] = useState(false);
  const mutate = useCallback(async (
    fn: () => Promise<unknown>,
    success?: string,
    undo?: (data: unknown) => UndoSpec | null | undefined
  ) => {
    setSaving(true);
    try {
      const data = await fn();
      if (success) {
        const spec = undo?.(data);
        if (spec?.module && spec.recordId) {
          toast.success(success, {
            duration: 8000,
            action: { label: "Undo", onClick: () => void undoRequest(spec) },
          });
        } else {
          toast.success(success);
        }
      }
      return { ok: true as const, data };
    } catch (e) {
      toast.error(errMessage(e));
      return { ok: false as const, error: e };
    } finally {
      setSaving(false);
    }
  }, []);
  return { mutate, saving };
}

export function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

export function todayStr(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function fmtDay(s?: string | null): string {
  if (!s) return "—";
  const d = new Date(s.length === 10 ? `${s}T00:00:00` : s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function fmtDateTime(s?: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function initials(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export function moneyCls(v: number | null | undefined): string {
  return (v ?? 0) < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400";
}

// ---------------------------------------------------------------------------
// Form fields
// ---------------------------------------------------------------------------

export function Field({ label, required, hint, className, children }: {
  label: string; required?: boolean; hint?: string; className?: string; children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5 min-w-0", className)}>
      <Label className="text-xs font-medium text-foreground">
        {label}
        {required && <span className="ml-0.5 text-red-500" aria-hidden>*</span>}
      </Label>
      {children}
      {hint && <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p>}
    </div>
  );
}

// Money amount input with an inline ₹ symbol prefix — makes currency unmistakable
// without relying on the field label alone. Passes value/onChange like a plain Input.
// `autoFocus` grabs focus when a dialog opens (amount is the field people come
// here to type); `enterKeyHint="done"` gives mobile keypads a Done key.
export function MoneyInput({ value, onChange, placeholder, className, min, max, step, disabled, id, "aria-label": ariaLabel, autoFocus, enterKeyHint }: {
  value: string | number;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
  autoFocus?: boolean;
  enterKeyHint?: React.HTMLAttributes<HTMLInputElement>["enterKeyHint"];
}) {
  return (
    <div className="relative">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-3 flex select-none items-center text-sm font-semibold text-muted-foreground"
      >
        ₹
      </span>
      <Input
        type="number"
        inputMode="decimal"
        enterKeyHint={enterKeyHint}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "0"}
        disabled={disabled}
        id={id}
        aria-label={ariaLabel}
        autoFocus={autoFocus}
        className={cn("pl-8", className)}
      />
    </div>
  );
}

export interface Option { label: string; value: string }

// ---------------------------------------------------------------------------
// Large-amount confirmation echo
// ---------------------------------------------------------------------------

/** Payments at or above this amount ask for an explicit confirmation strip before saving. */
export const LARGE_AMOUNT_THRESHOLD = 50_000;

/**
 * Guard rail for large money entries: render-props the dialog footer. When the
 * parsed amount is ≥ LARGE_AMOUNT_THRESHOLD, the first press of the primary
 * button shows an amber confirmation strip instead of submitting; the payment
 * proceeds only via the strip's Confirm button. Under the threshold the
 * confirm handler fires immediately (existing behaviour, unchanged).
 */
export function ConfirmAmount({ amount, subject, onSubmit, children }: {
  amount: number;
  subject: string;
  /** the real save routine — runs only after explicit confirmation for large amounts */
  onSubmit: () => void;
  /** Render-prop footer: `confirm` wires into the primary save button, `edit`
   *  collapses the echo strip, `armed` is true while the strip is showing. */
  children: (h: { confirm: () => void; edit: () => void; armed: boolean }) => React.ReactNode;
}) {
  const [armed, setArmed] = useState(false);
  const show = amount >= LARGE_AMOUNT_THRESHOLD && armed;

  const confirm = () => {
    if (amount >= LARGE_AMOUNT_THRESHOLD && !armed) {
      setArmed(true);
      return;
    }
    setArmed(false);
    onSubmit();
  };

  return (
    <>
      {show && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 dark:border-amber-900 dark:bg-amber-950/40"
        >
          <Banknote className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
          <p className="min-w-0 flex-1 text-xs font-medium leading-snug text-amber-800 dark:text-amber-300">
            You are about to record <span className="font-bold tabular-nums">{formatINR(amount)}</span> for{" "}
            <span className="font-semibold">{subject}</span>.
          </p>
          <span className="flex shrink-0 items-center gap-1.5">
            <Button
              size="sm"
              className="h-8 bg-amber-600 text-white hover:bg-amber-700 focus-visible:ring-amber-600/40"
              onClick={confirm}
            >
              Confirm
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-amber-300 text-amber-800 hover:bg-amber-100 dark:border-amber-900 dark:text-amber-300 dark:hover:bg-amber-950"
              onClick={() => setArmed(false)}
            >
              Edit amount
            </Button>
          </span>
        </div>
      )}
      {children({ confirm, edit: () => setArmed(false), armed: show })}
    </>
  );
}

// Sentinel for "no selection" options (Radix Select forbids empty-string values).
export const EMPTY_SENTINEL = "__all__";

export function SelectInput({ value, onChange, options, placeholder = "Select…", className, disabled }: {
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <Select
      // Always controlled: `value || sentinel` keeps Radix from flipping
      // between uncontrolled (undefined) and controlled when value is "".
      // A non-matching sentinel still renders the placeholder visually.
      value={value || EMPTY_SENTINEL}
      onValueChange={(v) => onChange(v === EMPTY_SENTINEL ? "" : v)}
      disabled={disabled}
    >
      <SelectTrigger className={cn("h-10 w-full", className)} aria-label={placeholder}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent position="popper" className="max-h-72">
        {/* Radix forbids empty-string item values — map them to a sentinel. */}
        {options.map((o) => (
          <SelectItem key={o.value || EMPTY_SENTINEL} value={o.value || EMPTY_SENTINEL} className="text-sm">{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ---------------------------------------------------------------------------
// States & misc UI
// ---------------------------------------------------------------------------

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-red-200 bg-red-50/50 py-10 px-6 text-center dark:border-red-900 dark:bg-red-950/20">
      <div className="rounded-full bg-red-100 p-3 dark:bg-red-950">
        <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" aria-hidden />
      </div>
      <p className="mt-3 text-sm font-semibold">Couldn&apos;t load data</p>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">{message}</p>
      {onRetry && (
        <Button size="sm" variant="outline" className="mt-4 h-9 gap-1.5" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />Retry
        </Button>
      )}
    </div>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-xl" />
      ))}
    </div>
  );
}

/** Label/value row used inside summary cards. */
export function KV({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("text-sm font-semibold tabular-nums", className)}>{value}</span>
    </div>
  );
}

/** Rounded initials avatar block. */
export function InitialAvatar({ name, className, tone = "emerald" }: { name?: string | null; className?: string; tone?: "emerald" | "amber" | "zinc" }) {
  const tones = {
    emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    zinc: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  } as const;
  return (
    <div className={cn("flex shrink-0 items-center justify-center rounded-full font-bold", tones[tone], className ?? "h-10 w-10 text-sm")} aria-hidden>
      {initials(name)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Charts (recharts wrappers — responsive, theme-aware)
// ---------------------------------------------------------------------------

// Chart palette — CSS variables so every series re-tunes itself per theme
// (light: deep ledger tones on white; dark: luminous on deep cards).
export const CHART_COLORS = {
  emerald: "var(--chart-1)",
  amber: "var(--chart-2)",
  teal: "var(--chart-3)",
  red: "var(--chart-4)",
  plum: "var(--chart-5)",
} as const;

export interface SeriesDef { key: string; label: string; color: string }

const AXIS_TICK = { fontSize: 11, fill: "var(--muted-foreground)" };
const TOOLTIP_STYLE = {
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--card)",
  color: "var(--foreground)",
  fontSize: 12,
  boxShadow: "0 8px 24px -12px rgb(0 0 0 / 0.35)",
} as const;

export function AreaTrend({ data, xKey, series, height, className }: {
  data: Record<string, unknown>[]; xKey: string; series: SeriesDef[];
  /** fixed pixel height — omit to use the responsive height classes */
  height?: number;
  /** responsive height classes (e.g. "h-44 sm:h-52 lg:h-60"); used when `height` is not set */
  className?: string;
}) {
  return (
    <div
      className={cn("w-full overflow-hidden", height === undefined && (className ?? "h-44 sm:h-52 lg:h-60"))}
      style={height === undefined ? undefined : { height }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`grad-${s.key.replace(/[^a-z0-9]/gi, "")}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={s.color} stopOpacity={0.28} />
                <stop offset="95%" stopColor={s.color} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey={xKey} tick={AXIS_TICK} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
          <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={56} tickFormatter={(v) => formatINR(Number(v), { compact: true })} />
          <Tooltip formatter={(v) => formatINR(Number(v))} contentStyle={TOOLTIP_STYLE} cursor={{ stroke: "var(--border)" }} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />}
          {series.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              fill={`url(#grad-${s.key.replace(/[^a-z0-9]/gi, "")})`}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3 }}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BarsCompare({ data, xKey, series, height, className, showValues }: {
  data: Record<string, unknown>[]; xKey: string; series: SeriesDef[];
  /** fixed pixel height — omit to use the responsive height classes */
  height?: number;
  /** responsive height classes (e.g. "h-44 sm:h-52 lg:h-60"); used when `height` is not set */
  className?: string;
  /** render the ₹ value on top of every bar (themed via .recharts-label-list CSS) */
  showValues?: boolean;
}) {
  return (
    <div
      className={cn("w-full overflow-hidden", height === undefined && (className ?? "h-44 sm:h-52 lg:h-60"))}
      style={height === undefined ? undefined : { height }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: showValues ? 24 : 8, right: 8, left: -14, bottom: 0 }} barCategoryGap="24%">
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey={xKey} tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={16} />
          <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={56} tickFormatter={(v) => formatINR(Number(v), { compact: true })} />
          <Tooltip formatter={(v) => formatINR(Number(v))} contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--muted)", opacity: 0.5 }} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />}
          {series.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[4, 4, 4, 4]} maxBarSize={30}>
              {showValues && (
                <LabelList
                  dataKey={s.key}
                  position="top"
                  fontSize={10}
                  formatter={(v: unknown) => (Number(v) > 0 ? formatINR(Number(v), { compact: true }) : "")}
                />
              )}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Div-based horizontal bar list (category breakdown etc). */
export function MiniBars({ rows }: { rows: { label: string; value: number; color?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) return <p className="py-4 text-center text-xs text-muted-foreground">No data</p>;
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="mb-1 flex items-center justify-between gap-2 text-xs">
            <span className="min-w-0 truncate font-medium">{r.label}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{formatINR(r.value)}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${Math.max(3, (r.value / max) * 100)}%`, background: r.color ?? CHART_COLORS.emerald }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Employee picker (searchable checkbox list)
// ---------------------------------------------------------------------------

export interface PickerEmployee {
  id: string;
  fullName: string;
  code?: string | null;
  standardRate?: number | null;
  employmentType?: string | null;
  monthlySalary?: number | null;
  hasContractor?: boolean | null;
  contractorName?: string | null;
  contractorRateCut?: number | null;
  advanceBalance?: number | null;
}

export function EmployeePicker({ employees, value, onChange, multi = true, height = "max-h-60", unavailable }: {
  employees: PickerEmployee[];
  value: string[];
  onChange: (ids: string[]) => void;
  multi?: boolean;
  height?: string;
  /** Return a short reason string to mark an employee as unselectable (e.g. already booked all day), or null when selectable. */
  unavailable?: (e: PickerEmployee) => string | null;
}) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) => `${e.fullName} ${e.code ?? ""}`.toLowerCase().includes(q));
  }, [employees, search]);

  const toggle = (id: string) => {
    if (unavailable) {
      const emp = employees.find((e) => e.id === id);
      if (emp && unavailable(emp)) return; // blocked — ignore toggle
    }
    if (!multi) { onChange([id]); return; }
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search employees…"
          className="h-9 rounded-xl bg-card pl-9"
          aria-label="Search employees"
        />
      </div>
      {multi && value.length > 0 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{value.length} selected</span>
          <button type="button" className="font-medium text-primary hover:underline" onClick={() => onChange([])}>
            Clear all
          </button>
        </div>
      )}
      <div className={cn("overflow-y-auto rounded-xl border", height)} role="listbox" aria-multiselectable={multi}>
        {filtered.length === 0 && (
          <p className="p-6 text-center text-xs text-muted-foreground">No employees found</p>
        )}
        {filtered.map((e) => {
          const on = value.includes(e.id);
          const blockedReason = unavailable?.(e) ?? null;
          const blocked = Boolean(blockedReason);
          return (
            <div
              key={e.id}
              role="option"
              aria-selected={on}
              aria-disabled={blocked || undefined}
              tabIndex={blocked ? -1 : 0}
              onClick={() => { if (!blocked) toggle(e.id); }}
              onKeyDown={(ev) => { if (!blocked && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); toggle(e.id); } }}
              className={cn(
                "flex items-center gap-2.5 border-b px-3 py-2.5 transition-colors last:border-b-0",
                blocked ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-muted/60",
                on && "bg-primary/5"
              )}
            >
              {multi ? (
                <span className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                  on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background"
                )} aria-hidden>
                  {on && <Check className="h-3 w-3" />}
                </span>
              ) : (
                <span className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                  on ? "border-primary" : "border-input"
                )} aria-hidden>
                  {on && <span className="h-2 w-2 rounded-full bg-primary" />}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{e.fullName}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {e.code ?? ""}
                  {e.employmentType === "SALARIED"
                    ? ` · Salaried ${formatINR(e.monthlySalary ?? 0)}/mo`
                    : e.standardRate ? ` · ${formatINR(e.standardRate)}/shift` : ""}
                  {e.hasContractor && e.contractorName ? ` · via ${e.contractorName}` : ""}
                </p>
              </div>
              {blocked && blockedReason ? (
                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  {blockedReason}
                </span>
              ) : (e.advanceBalance ?? 0) > 0 && (
                <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium tabular-nums text-red-600 dark:bg-red-950 dark:text-red-400">
                  Adv {formatINR(e.advanceBalance ?? 0, { compact: true })}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Fetch ACTIVE employees for pickers. */
export function useActiveEmployees(enabled: boolean) {
  const [employees, setEmployees] = useState<PickerEmployee[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!enabled || loaded) return;
    let cancelled = false;
    api.get<ListResp<EmployeeRec>>("/api/employees" + qs({ status: "ACTIVE", pageSize: 200 }))
      .then((d) => { if (!cancelled) { setEmployees(d.items); setLoaded(true); } })
      .catch((e) => { if (!cancelled) { setLoaded(true); toast.error(errMessage(e)); } });
    return () => { cancelled = true; };
  }, [enabled, loaded]);
  return { employees, loading: enabled && !loaded };
}

// ---------------------------------------------------------------------------
// Give Advance dialog (advances-view + employee-detail-view)
// ---------------------------------------------------------------------------

export function GiveAdvanceDialog({ open, onOpenChange, defaultEmployeeId, employees: employeesProp, onDone }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultEmployeeId?: string;
  employees?: PickerEmployee[];
  onDone: () => void;
}) {
  const { employees: fetched, loading: loadingEmps } = useActiveEmployees(open && !employeesProp);
  const employees = employeesProp ?? fetched;
  const [employeeId, setEmployeeId] = useState("");
  const [date, setDate] = useState(todayStr());
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState("UPI");
  const { mutate, saving } = useMutation();

  // Reset form each time the dialog opens (render-time state adjustment).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setEmployeeId(defaultEmployeeId ?? "");
      setDate(todayStr());
      setAmount("");
      setReason("");
      setMethod("UPI");
    }
  }

  // Amount gets focus on open — Radix focuses the first focusable (employee
  // search), so re-focus the amount shortly after mount to win the race.
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => document.getElementById("advance-amount")?.focus(), 80);
    return () => window.clearTimeout(t);
  }, [open]);

  const selected = employees.find((e) => e.id === employeeId);

  const submit = async () => {
    if (!employeeId) { toast.error("Select an employee"); return; }
    const amt = parseAmount(amount);
    if (amt <= 0) { toast.error("Enter a valid amount"); return; }
    const res = await mutate(
      () => api.post("/api/advances", { employeeId, date, amount: amt, reason: reason || undefined, method: method || undefined }),
      "Advance recorded",
      (data) => ({ module: "ADVANCE", recordId: (data as { id: string }).id, onUndo: onDone })
    );
    if (res.ok) { onOpenChange(false); onDone(); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Give Advance</DialogTitle>
          <DialogDescription>Record a cash/UPI advance given to an employee. Auto-deducted at settlement.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {!defaultEmployeeId && (
            loadingEmps ? <Skeleton className="h-40 w-full rounded-xl" /> : (
              <Field label="Employee" required>
                <EmployeePicker
                  employees={employees}
                  value={employeeId ? [employeeId] : []}
                  onChange={(ids) => setEmployeeId(ids[0] ?? "")}
                  multi={false}
                  height="max-h-44"
                />
              </Field>
            )
          )}
          {defaultEmployeeId && selected && (
            <div className="rounded-xl border bg-muted/40 px-3 py-2 text-sm">
              <span className="font-medium">{selected.fullName}</span>
              <span className="ml-2 text-xs text-muted-foreground">{selected.code}</span>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Amount (₹)" required>
              <MoneyInput value={amount} onChange={setAmount} min={1} className="h-10" id="advance-amount" autoFocus enterKeyHint="done" />
            </Field>
            <Field label="Date" required>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-10" />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Method">
              <SelectInput
                value={method}
                onChange={setMethod}
                options={["UPI", "Bank", "Cash", "Cheque", "Other"].map((m) => ({ label: m, value: m }))}
              />
            </Field>
            <Field label="Reason">
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Festival, family emergency…" className="h-10" />
            </Field>
          </div>
        </div>
        <ConfirmAmount
          amount={parseAmount(amount)}
          subject={selected?.fullName || "the selected employee"}
          onSubmit={() => void submit()}
        >
          {({ confirm, armed }) => (
            <DialogFooter className="gap-2">
              <Button variant="outline" className="min-h-10 flex-1 sm:flex-none" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button className="min-h-10 flex-1 sm:flex-none" onClick={confirm} disabled={saving || armed}>
                {saving ? "Saving…" : armed ? "Confirm below" : "Give Advance"}
              </Button>
            </DialogFooter>
          )}
        </ConfirmAmount>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Record Payment dialog (payments-view; also property ledger)
// ---------------------------------------------------------------------------

interface LedgerDay { date: string; billed: number; paid: number; outstanding: number; status: string }
interface PropertyLedger { property?: { id: string; name: string }; ledger: { billed: number; received: number; outstanding: number }; days: LedgerDay[] }

export function RecordPaymentDialog({ open, onOpenChange, propertyId, properties: propertiesProp, onDone }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  propertyId?: string;
  properties?: { id: string; name: string; outstanding?: number }[];
  onDone: () => void;
}) {
  const [properties, setProperties] = useState(propertiesProp ?? []);
  const [selected, setSelected] = useState(propertyId ?? "");
  const [data, setData] = useState<PropertyLedger | null>(null);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayStr());
  const [method, setMethod] = useState("UPI");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const { mutate, saving } = useMutation();

  // Load property options if caller didn't pass any.
  useEffect(() => {
    if (!open || propertiesProp || propertyId) return;
    let cancelled = false;
    api.get<{ items: { propertyId: string; propertyName: string; outstanding: number }[] }>("/api/payments/pending")
      .then((d) => { if (!cancelled) setProperties(d.items.map((i) => ({ id: i.propertyId, name: i.propertyName, outstanding: i.outstanding }))); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open, propertiesProp, propertyId]);

  // Reset form each time the dialog opens (render-time state adjustment).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setSelected(propertyId ?? "");
      setAmount("");
      setDate(todayStr());
      setMethod("UPI");
      setReference("");
      setNotes("");
    }
  }

  const [loadedFor, setLoadedFor] = useState("");
  const loading = Boolean(open && selected && loadedFor !== selected);
  useEffect(() => {
    if (!open || !selected) return;
    let cancelled = false;
    api.get<PropertyLedger>(`/api/payments/property/${selected}`)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setLoadedFor(selected);
        setAmount((prev) => (prev ? prev : String(d.ledger.outstanding ?? 0)));
      })
      .catch((e) => { if (!cancelled) toast.error(errMessage(e)); });
    return () => { cancelled = true; };
  }, [open, selected]);

  // Amount gets focus on open — Radix focuses the first focusable (property
  // select), so re-focus the amount shortly after mount to win the race.
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => document.getElementById("payment-amount")?.focus(), 80);
    return () => window.clearTimeout(t);
  }, [open]);

  const submit = async () => {
    if (!selected) { toast.error("Select a property"); return; }
    const amt = parseAmount(amount);
    if (amt <= 0) { toast.error("Enter a valid amount"); return; }
    const res = await mutate(
      () => api.post("/api/payments", { propertyId: selected, date, amount: amt, method: method || undefined, reference: reference || undefined, notes: notes || undefined }),
      `Payment of ${formatINR(amt)} recorded`,
      (data) => ({ module: "PAYMENT", recordId: (data as { id: string }).id, onUndo: onDone })
    );
    if (res.ok) { onOpenChange(false); onDone(); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
          <DialogDescription>Received amount is allocated FIFO against oldest unpaid deployments.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {!propertyId && (
            <Field label="Property" required>
              <SelectInput
                value={selected}
                onChange={setSelected}
                placeholder="Select property…"
                options={properties.map((p) => ({ label: p.outstanding !== undefined ? `${p.name} · ${formatINR(p.outstanding, { compact: true })} due` : p.name, value: p.id }))}
              />
            </Field>
          )}

          {loading && <Skeleton className="h-24 w-full rounded-xl" />}

          {!loading && data && (
            <div className="rounded-xl border">
              <div className="grid grid-cols-3 divide-x border-b text-center">
                <div className="px-2 py-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Billed</p>
                  <p className="text-sm font-bold tabular-nums">{formatINR(data.ledger.billed, { compact: true })}</p>
                </div>
                <div className="px-2 py-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Received</p>
                  <p className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{formatINR(data.ledger.received, { compact: true })}</p>
                </div>
                <div className="px-2 py-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Outstanding</p>
                  <p className="text-sm font-bold tabular-nums text-red-600 dark:text-red-400">{formatINR(data.ledger.outstanding, { compact: true })}</p>
                </div>
              </div>
              <div className="max-h-40 overflow-y-auto">
                {data.days.length === 0 && <p className="p-4 text-center text-xs text-muted-foreground">No billing days yet</p>}
                {data.days.map((d) => (
                  <div key={d.date} className="flex items-center justify-between gap-2 border-b px-3 py-2 text-xs last:border-b-0">
                    <span className="tabular-nums text-muted-foreground">{fmtDay(d.date)}</span>
                    <span className="tabular-nums">{formatINR(d.billed)}</span>
                    <span className={cn("tabular-nums", d.paid >= d.billed ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                      {formatINR(d.paid)} paid
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Amount (₹)" required>
              <MoneyInput value={amount} onChange={setAmount} min={1} className="h-10" id="payment-amount" autoFocus enterKeyHint="done" />
            </Field>
            <Field label="Date" required>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-10" />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Method">
              <SelectInput value={method} onChange={setMethod} options={["UPI", "Bank", "Cash", "Cheque", "Other"].map((m) => ({ label: m, value: m }))} />
            </Field>
            <Field label="Reference">
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UTR / cheque no." className="h-10" />
            </Field>
          </div>
          <Field label="Notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional" />
          </Field>
        </div>
        <ConfirmAmount
          amount={parseAmount(amount)}
          subject={properties.find((p) => p.id === selected)?.name || data?.property?.name || "the selected property"}
          onSubmit={() => void submit()}
        >
          {({ confirm, armed }) => (
            <DialogFooter className="gap-2">
              <Button variant="outline" className="min-h-10 flex-1 sm:flex-none" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button className="min-h-10 flex-1 sm:flex-none" onClick={confirm} disabled={saving || armed}>
                {saving ? "Saving…" : armed ? "Confirm below" : "Record Payment"}
              </Button>
            </DialogFooter>
          )}
        </ConfirmAmount>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Shifts — simple fixed set: DAY / NIGHT / FULL (FULL = day + night = 2 units)
// ---------------------------------------------------------------------------

export const SHIFT_OPTIONS: Option[] = [
  { label: "Day", value: "DAY" },
  { label: "Night", value: "NIGHT" },
  { label: "Full (Day + Night)", value: "FULL" },
];

/** Employee pay/contract badges: Salaried / Rent / Contractor — shown in list + detail. */
export function EmployeePayBadges({ r, compact = false }: { r: EmployeeRec; compact?: boolean }) {
  const salaried = r.employmentType === "SALARIED";
  return (
    <>
      {salaried && (
        <Badge variant="outline" className="border-teal-200 bg-teal-50 text-[10px] tabular-nums text-teal-700 dark:border-teal-900 dark:bg-teal-950 dark:text-teal-300">
          Salaried {formatINR(r.monthlySalary ?? 0)}/mo
        </Badge>
      )}
      {r.onBusinessRent && (
        <Badge variant="outline" className="border-violet-200 bg-violet-50 text-[10px] tabular-nums text-violet-700 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-300">
          Rent {formatINR(r.rentAmount ?? 0)}/{(r.rentMode ?? "MONTH").toLowerCase() === "DAY" ? "day" : "mo"}
        </Badge>
      )}
      {r.hasContractor && r.contractorName && !compact && (
        <Badge variant="outline" className="border-amber-200 bg-amber-50 text-[10px] tabular-nums text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          Via {r.contractorName}{(r.contractorRateCut ?? 0) > 0 ? ` · ${formatINR(r.contractorRateCut ?? 0)}/shift` : ""}
        </Badge>
      )}
    </>
  );
}

export const SHIFT_UNITS: Record<string, number> = { DAY: 1, NIGHT: 1, FULL: 2 };

// ---------------------------------------------------------------------------
// Deploy Wizard (multi-step: details → employees → per-person shift & rates)
// Rates resolve automatically: billing from the property, payout from the
// employee. Anything editable per row is an override for that person only.
// ---------------------------------------------------------------------------

interface ShiftOverrides {
  shift?: string;
  billingRate?: string;
  payoutRate?: string;
}

export function DeployWizard({ open, onOpenChange, defaultDate, defaultPropertyId, onDone }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultDate?: string;
  defaultPropertyId?: string;
  onDone: () => void;
}) {
  const [step, setStep] = useState(1);
  const [properties, setProperties] = useState<PropertyRec[]>([]);
  const { employees, loading: loadingEmps } = useActiveEmployees(open);
  const [propertyId, setPropertyId] = useState(defaultPropertyId ?? "");
  const [date, setDate] = useState(defaultDate ?? todayStr());
  const [notes, setNotes] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [rowState, setRowState] = useState<Record<string, ShiftOverrides>>({});
  const [duplicates, setDuplicates] = useState<string[] | null>(null);
  const [creating, setCreating] = useState(false);
  // Same-day bookings for the picked date — across ALL properties. Drives the
  // "already booked" badges in the picker and the overlap guard in step 3.
  const [booked, setBooked] = useState<Record<string, { shift: string; propertyName: string }[]>>({});
  const [bookedLoadedFor, setBookedLoadedFor] = useState("");

  // Load properties + reset on open (render-time state adjustment).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setStep(1);
      setPropertyId(defaultPropertyId ?? "");
      setDate(defaultDate ?? todayStr());
      setNotes("");
      setSelected([]);
      setRowState({});
      setDuplicates(null);
      setBooked({});
      setBookedLoadedFor("");
    }
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api.get<ListResp<PropertyRec>>("/api/properties" + qs({ status: "ACTIVE", pageSize: 200 }))
      .then((d) => { if (!cancelled) setProperties(d.items); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open]);

  // Load the day's deployments (any property) whenever the wizard reaches the
  // employee step — the picker greys out fully-booked people, and step 3 uses
  // the same data to block overlapping shift choices.
  useEffect(() => {
    if (!open || step < 2) return;
    const key = `${date}|${selected.join(",")}`;
    if (bookedLoadedFor === key) return;
    let cancelled = false;
    api.get<ListResp<DeploymentRec>>("/api/deployments" + qs({ from: date, to: date, pageSize: 500 }))
      .then((d) => {
        if (cancelled) return;
        const map: Record<string, { shift: string; propertyName: string }[]> = {};
        for (const row of d.items) {
          const list = map[row.employeeId] ?? [];
          list.push({ shift: row.shift, propertyName: row.propertyName });
          map[row.employeeId] = list;
        }
        setBooked(map);
        setBookedLoadedFor(key);
      })
      .catch(() => { if (!cancelled) setBookedLoadedFor(key); });
    return () => { cancelled = true; };
  }, [open, step, date, selected]);

  const property = useMemo(() => properties.find((p) => p.id === propertyId) ?? null, [properties, propertyId]);

  const selectedEmployees = useMemo(
    () => employees.filter((e) => selected.includes(e.id)),
    [employees, selected]
  );

  const rowShift = (id: string) => (rowState[id]?.shift ?? "DAY");

  const bookedList = (id: string) => booked[id] ?? [];
  /** Employee has no free half-day left (FULL booked, or both DAY and NIGHT taken). */
  const fullyBooked = (id: string) => {
    const list = bookedList(id);
    return list.some((w) => w.shift === "FULL") ||
      (list.some((w) => w.shift === "DAY") && list.some((w) => w.shift === "NIGHT"));
  };
  /** Same-day rows (any property) that overlap the given shift — FULL overlaps everything. */
  const clashesFor = (id: string, shift: string) =>
    bookedList(id).filter((w) => shift === "FULL" || w.shift === "FULL" || w.shift === shift);
  /** Suggest the still-free half when the default DAY choice would clash. */
  const smartShift = (id: string) => {
    const list = bookedList(id);
    const has = (s: string) => list.some((w) => w.shift === s);
    if (has("DAY") && !has("NIGHT")) return "NIGHT";
    if (has("NIGHT") && !has("DAY")) return "DAY";
    return "DAY"; // fully booked or free — caller shows blocked state anyway
  };

  // Selected people whose currently-chosen shift overlaps an existing same-day
  // booking (any property). Blocks the Deploy button until resolved.
  const conflictingSelected = useMemo(
    () => selectedEmployees.filter((e) => clashesFor(e.id, rowShift(e.id)).length > 0),
    [selectedEmployees, rowState, booked]
  );
  const rowBillingRate = (e: PickerEmployee) => {
    const o = rowState[e.id];
    if (o?.billingRate !== undefined && o?.billingRate !== "") return parseAmount(o.billingRate);
    return property?.billingRate ?? 0;
  };
  /** Salaried employees never earn per-shift payouts — their cost is the monthly salary. */
  const isSalariedRow = (e: PickerEmployee) => e.employmentType === "SALARIED";
  const rowPayoutRate = (e: PickerEmployee) => {
    if (isSalariedRow(e)) return 0;
    const o = rowState[e.id];
    if (o?.payoutRate !== undefined && o?.payoutRate !== "") return parseAmount(o.payoutRate);
    return e.standardRate ?? 0;
  };
  /** Contractor commission for a row — snapshotted per deployment from the employee master. */
  const rowContractorCut = (e: PickerEmployee) =>
    e.hasContractor && e.contractorName && (e.contractorRateCut ?? 0) > 0
      ? { name: e.contractorName, perShift: e.contractorRateCut ?? 0 }
      : null;

  const totals = useMemo(() => {
    let billing = 0, payout = 0, contractorCut = 0;
    for (const e of selectedEmployees) {
      const units = SHIFT_UNITS[rowShift(e.id)] ?? 1;
      billing += rowBillingRate(e) * units;
      payout += rowPayoutRate(e) * units;
      const cut = rowContractorCut(e);
      if (cut) contractorCut += cut.perShift * units;
    }
    return { billing, payout: Math.round(payout * 100) / 100, contractorCut: Math.round(contractorCut * 100) / 100, margin: billing - payout };
  }, [selectedEmployees, rowState, property]);

  const buildBody = (ids: string[]) => ({
    propertyId,
    date,
    notes: notes || undefined,
    entries: ids.map((id) => {
      const o = rowState[id];
      return {
        employeeId: id,
        shift: o?.shift ?? "DAY",
        ...(o?.billingRate !== undefined && o?.billingRate !== "" ? { billingRate: parseAmount(o.billingRate) } : {}),
        ...(o?.payoutRate !== undefined && o?.payoutRate !== "" ? { payoutRate: parseAmount(o.payoutRate) } : {}),
      };
    }),
  });

  const finish = (result: { created?: { id: string }[]; skipped?: { employeeName?: string }[] }) => {
    const created = result.created?.length ?? 0;
    const skipped = result.skipped?.length ?? 0;
    const ids = (result.created ?? []).map((c) => c.id).join(",");
    toast.success(
      created > 0
        ? `Deployed ${created} employee${created === 1 ? "" : "s"}${skipped > 0 ? ` · ${skipped} skipped` : ""}`
        : "No new deployments created",
      created > 0
        ? { duration: 8000, action: { label: "Undo", onClick: () => void undoRequest({ module: "DEPLOYMENT", recordId: ids, onUndo: onDone }) } }
        : undefined
    );
    onOpenChange(false);
    onDone();
  };

  const submit = async (skipIds?: string[]) => {
    const ids = skipIds ?? selected;
    if (ids.length === 0) { toast.error("Select at least one employee"); return; }
    setCreating(true);
    try {
      const result = await api.post<{ created: { id: string }[]; skipped: { employeeName?: string }[] }>("/api/deployments", buildBody(ids));
      finish(result);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const dups = Array.isArray(e.extra?.duplicates) ? (e.extra.duplicates as string[]) : [];
        const conflicts = Array.isArray(e.extra?.conflicts) ? (e.extra.conflicts as string[]) : [];
        setDuplicates(conflicts.length > 0 ? conflicts : dups);
        toast.error(e.message || "Some employees are already booked for overlapping shifts on this date");
      } else {
        toast.error(errMessage(e));
      }
    } finally {
      setCreating(false);
    }
  };

  const remainingAfterSkip = useMemo(() => {
    if (!duplicates) return [];
    return selected.filter((id) => {
      const emp = employees.find((x) => x.id === id);
      if (!emp) return false;
      return !duplicates.some((d) => d.includes(emp.fullName) || (!!emp.code && d.includes(emp.code)));
    });
  }, [duplicates, selected, employees]);

  const canNext = propertyId && date;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-sm:max-h-[86dvh] flex-col gap-0 overflow-hidden p-0 sm:h-[82vh] sm:max-w-xl">
        <DialogHeader className="border-b px-5 pb-4 pt-5 text-left">
          <DialogTitle>Deploy Employees</DialogTitle>
          <DialogDescription>
            Step {step} of 3 · {step === 1 ? "Where & when" : step === 2 ? "Pick employees" : "Shift & rates per person"}
          </DialogDescription>
          <div className="mt-3 flex items-center gap-1.5" aria-hidden>
            {[1, 2, 3].map((s) => (
              <div key={s} className={cn("h-1.5 flex-1 rounded-full transition-colors", s <= step ? "bg-primary" : "bg-muted")} />
            ))}
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-5 py-4 max-sm:overscroll-contain">
          {duplicates && duplicates.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs dark:border-amber-900 dark:bg-amber-950/40">
              <p className="flex items-center gap-1.5 font-semibold text-amber-800 dark:text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Already booked for this date
              </p>
              <ul className="mt-1.5 max-h-24 space-y-0.5 overflow-y-auto text-amber-800/90 dark:text-amber-300/90">
                {duplicates.slice(0, 10).map((d, i) => <li key={i} className="truncate">• {d}</li>)}
              </ul>
              {remainingAfterSkip.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 h-8 border-amber-300 text-amber-800 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-950"
                  onClick={() => submit(remainingAfterSkip)}
                  disabled={creating}
                >
                  Skip duplicates & save {remainingAfterSkip.length} rest
                </Button>
              )}
            </div>
          )}

          {step === 1 && (
            <>
              <Field label="Property" required hint="Its billing rate is applied automatically to every selected employee.">
                <SelectInput
                  value={propertyId}
                  onChange={setPropertyId}
                  placeholder="Select property…"
                  options={properties.map((p) => ({
                    label: `${p.brandName ? `${p.name} (${p.brandName})` : p.name}${p.billingRate ? ` — ${formatINR(p.billingRate)}/shift` : ""}`,
                    value: p.id,
                  }))}
                />
              </Field>
              <Field label="Date" required>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-10" />
              </Field>
              <Field label="Notes">
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional instructions" />
              </Field>
              <div className={cn(
                "rounded-xl border px-3.5 py-3 text-xs",
                (property?.billingRate ?? 0) > 0
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
                  : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
              )}>
                {(property?.billingRate ?? 0) > 0 ? (
                  <p className="font-medium">
                    {property?.name}: billing {formatINR(property?.billingRate ?? 0)} per shift · each employee is paid at their own fixed rate. Full shift = 2 units.
                  </p>
                ) : (
                  <p className="font-medium">
                    This property has no billing rate yet — set it from the Properties page before deploying.
                  </p>
                )}
              </div>
            </>
          )}

          {step === 2 && (
            loadingEmps ? (
              <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}</div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Select employees <span className="text-muted-foreground">({selected.length} chosen)</span></p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => {
                      const selectable = employees.filter((e) => !fullyBooked(e.id)).map((e) => e.id);
                      setSelected(selected.length === selectable.length ? [] : selectable);
                    }}
                  >
                    {selected.length === employees.filter((e) => !fullyBooked(e.id)).length ? "Deselect all" : "Select all"}
                  </Button>
                </div>
                {employees.some((e) => fullyBooked(e.id)) && (
                  <p className="rounded-lg bg-amber-50 px-3 py-1.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                    Some employees are already fully booked for {fmtDay(date)} — they are marked and locked below.
                  </p>
                )}
                <EmployeePicker
                  employees={employees}
                  value={selected}
                  onChange={setSelected}
                  height="max-h-[46vh]"
                  unavailable={(e) => {
                    if (!fullyBooked(e.id)) return null;
                    const list = bookedList(e.id);
                    const short = (n: string) => (n.length > 16 ? `${n.slice(0, 15)}…` : n);
                    return list.some((w) => w.shift === "FULL")
                      ? `Full day · ${short(list[0].propertyName)}`
                      : `Day + Night · ${short(list[0].propertyName)}`;
                  }}
                />
              </>
            )
          )}

          {step === 3 && (
            <>
              <div className="rounded-xl border bg-muted/40 px-3.5 py-2.5 text-xs">
                <p className="font-medium">{property?.name ?? "Property"}</p>
                <p className="mt-0.5 text-muted-foreground">
                  {fmtDay(date)} · {selected.length} employee{selected.length === 1 ? "" : "s"} · rates auto-filled — change shift or any rate below
                </p>
              </div>
              <div className="space-y-2">
                {selectedEmployees.map((e) => {
                  const st = rowState[e.id] ?? {};
                  const shift = rowShift(e.id);
                  const clashes = clashesFor(e.id, shift);
                  const units = SHIFT_UNITS[shift] ?? 1;
                  const bRate = rowBillingRate(e);
                  const pRate = rowPayoutRate(e);
                  const salaried = isSalariedRow(e);
                  const cut = rowContractorCut(e);
                  return (
                    <div key={e.id} className={cn(
                      "rounded-xl border p-2.5 transition-colors",
                      clashes.length > 0 && "border-red-300 bg-red-50/70 dark:border-red-900 dark:bg-red-950/30"
                    )}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium">{e.fullName} <span className="text-muted-foreground">({e.code})</span></p>
                          <p className="text-[10px] text-muted-foreground">
                            {salaried
                              ? <>Auto: bill {formatINR(property?.billingRate ?? 0)} · <span className="font-semibold text-foreground">Salaried {formatINR(e.monthlySalary ?? 0)}/mo</span> — no per-shift pay</>
                              : <>Auto: bill {formatINR(property?.billingRate ?? 0)} · pay {formatINR(e.standardRate ?? 0)}/shift</>}
                          </p>
                        </div>
                        {/* Per-person shift segmented control */}
                        <div className="flex shrink-0 rounded-lg border bg-muted/50 p-0.5" role="group" aria-label={`Shift for ${e.fullName}`}>
                          {SHIFT_OPTIONS.map((s) => {
                            const optionClashes = clashesFor(e.id, s.value).length > 0;
                            return (
                              <button
                                key={s.value}
                                type="button"
                                className={cn(
                                  "min-h-7 rounded-md px-2 text-[11px] font-medium transition-colors",
                                  shift === s.value
                                    ? optionClashes
                                      ? "bg-red-600 text-white shadow-sm"
                                      : "bg-primary text-primary-foreground shadow-sm"
                                    : "text-muted-foreground hover:text-foreground"
                                )}
                                aria-pressed={shift === s.value}
                                title={optionClashes ? `Already booked for ${s.value.toLowerCase()} today` : undefined}
                                onClick={() => setRowState((r) => ({ ...r, [e.id]: { ...r[e.id], shift: s.value } }))}
                              >
                                {s.value === "FULL" ? "Full" : s.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <div>
                          <Label className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">Billing ₹/shift</Label>
                          <MoneyInput
                            className="h-8 text-right text-xs tabular-nums"
                            value={st.billingRate ?? String(property?.billingRate ?? 0)}
                            onChange={(v) => setRowState((r) => ({ ...r, [e.id]: { ...r[e.id], billingRate: v } }))}
                            aria-label={`Billing rate for ${e.fullName}`}
                          />
                        </div>
                        <div>
                          <Label className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">
                            {salaried ? "Payout (salary model)" : "Payout ₹/shift"}
                          </Label>
                          <MoneyInput
                            className="h-8 text-right text-xs tabular-nums"
                            value={salaried ? "0" : (st.payoutRate ?? String(e.standardRate ?? 0))}
                            onChange={(v) => setRowState((r) => ({ ...r, [e.id]: { ...r[e.id], payoutRate: v } }))}
                            disabled={salaried}
                            aria-label={`Payout rate for ${e.fullName}`}
                          />
                        </div>
                      </div>
                      {(cut || salaried) && clashes.length === 0 && (
                        <p className="mt-1.5 text-left text-[10px] tabular-nums text-muted-foreground">
                          {cut && (
                            <>Contractor <span className="font-semibold text-foreground">{cut.name}</span> gets {formatINR(cut.perShift)}/shift → {formatINR(cut.perShift * units)} of this payout · employee nets {formatINR(Math.max(0, pRate * units - cut.perShift * units))}</>
                          )}
                          {cut && salaried && " · "}
                          {salaried && <>Salaried — cost accrues via monthly salary, not per shift</>}
                        </p>
                      )}
                      {clashes.length > 0 ? (
                        <p className="mt-1.5 flex items-start gap-1 text-[10px] font-semibold text-red-600 dark:text-red-400">
                          <AlertTriangle className="mt-px h-3 w-3 shrink-0" aria-hidden />
                          Already booked: {clashes.map((w) => `${w.shift} @ ${w.propertyName}`).join(", ")} — pick the free shift or go back
                        </p>
                      ) : (
                        <p className="mt-1.5 text-right text-[10px] tabular-nums text-muted-foreground">
                          {units} unit{units > 1 ? "s" : ""} → bills <span className="font-semibold text-foreground">{formatINR(bRate * units)}</span> · pays <span className="font-semibold text-foreground">{formatINR(pRate * units)}</span>
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground">Full shift = Day + Night = 2 shift units. Edited rates apply to this deployment only — the fixed master rates never change.</p>
            </>
          )}
        </div>

        <div className="border-t bg-card px-5 py-3 max-sm:sticky max-sm:bottom-0 max-sm:z-10 max-sm:bg-background max-sm:pt-3">
          {step === 3 && conflictingSelected.length > 0 && (
            <p className="mb-2 rounded-lg bg-red-50 px-3 py-1.5 text-[11px] font-semibold text-red-600 dark:bg-red-950/40 dark:text-red-400">
              {conflictingSelected.length} employee{conflictingSelected.length === 1 ? " is" : "s are"} already booked for the selected shift — change the red shift or go back.
            </p>
          )}
          {step === 3 && (
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 rounded-lg bg-muted/60 px-3 py-2 text-xs font-medium tabular-nums">
              <span>Billing <span className="font-bold">{formatINR(totals.billing)}</span></span>
              <span>Payout <span className="font-bold">{formatINR(totals.payout)}</span></span>
              {totals.contractorCut > 0 && (
                <span title="Contractor commission is paid out of the payout above">Contractor cut <span className="font-bold">{formatINR(totals.contractorCut)}</span></span>
              )}
              <span className={totals.margin >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
                Margin <span className="font-bold">{formatINR(totals.margin)}</span>
              </span>
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            {step === 1 ? (
              <Button variant="outline" className="min-h-10" onClick={() => onOpenChange(false)}>Cancel</Button>
            ) : (
              <Button variant="outline" className="min-h-10 gap-1" onClick={() => setStep(step - 1)}>
                <ChevronLeft className="h-4 w-4" aria-hidden />Back
              </Button>
            )}
            {step < 3 ? (
              <Button
                className="min-h-10 gap-1.5"
                disabled={!canNext}
                onClick={() => {
                  if (step === 2) {
                    // Pre-pick the still-free half for people already booked today.
                    setRowState((r) => {
                      const next = { ...r };
                      for (const id of selected) {
                        const current = next[id]?.shift ?? "DAY";
                        if (clashesFor(id, current).length > 0 && !fullyBooked(id)) {
                          next[id] = { ...next[id], shift: smartShift(id) };
                        }
                      }
                      return next;
                    });
                  }
                  setStep(step + 1);
                }}
              >
                Next<ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
            ) : (
              <Button
                className="min-h-10 gap-1.5"
                onClick={() => submit()}
                disabled={creating || selected.length === 0 || conflictingSelected.length > 0}
                title={conflictingSelected.length > 0 ? "Resolve shift conflicts first" : undefined}
              >
                <Users className="h-4 w-4" aria-hidden />
                {creating ? "Deploying…" : `Deploy ${selected.length} employee${selected.length === 1 ? "" : "s"}`}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Misc shared bits
// ---------------------------------------------------------------------------

export function ShiftBadgeInline({ shift }: { shift: string }) {
  const s = String(shift).toUpperCase();
  if (s === "SALARY") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />Salary
      </span>
    );
  }
  if (s === "OVERTIME") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />Overtime
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
      {s === "FULL" ? (
        <>
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-500" aria-hidden />
          Full
        </>
      ) : (
        <>
          <span className={cn("inline-block h-1.5 w-1.5 rounded-full", s === "NIGHT" ? "bg-slate-500" : "bg-amber-500")} aria-hidden />
          {s === "NIGHT" ? "Night" : "Day"}
        </>
      )}
    </span>
  );
}
