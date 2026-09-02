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
  BarChart, Bar,
} from "recharts";
import {
  AlertTriangle, AlertCircle, ArrowRight, Check, ChevronLeft, RefreshCw, Search, Users,
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
  workCategory?: string | null;
  billingRate?: number;
  payoutRate?: number;
  billingAmount?: number;
  payoutAmount?: number;
  adjustmentAmount?: number | null;
  adjustmentNote?: string | null;
  status: string;
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
  status: string;
  notes?: string | null;
  activeContractName?: string | null;
  totalBilled?: number;
  totalReceived?: number;
  totalOutstanding?: number;
}

export interface ContractRec {
  id: string;
  propertyId: string;
  propertyName?: string;
  name: string;
  startDate: string;
  endDate?: string | null;
  billingRate: number;
  payoutRate: number;
  shift?: string | null;
  category?: string | null;
  maxEmployees?: number | null;
  paymentTerms?: string | null;
  notes?: string | null;
  status: string;
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
  givenByName?: string | null;
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
  advanceDeducted?: number;
  otherDeductions?: number;
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
  vehicleId?: string | null;
  vehicleName?: string | null;
  spentByName?: string | null;
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

/** Mutation wrapper: consistent error toasts, optional success toast. */
export function useMutation() {
  const [saving, setSaving] = useState(false);
  const mutate = useCallback(async (fn: () => Promise<unknown>, success?: string) => {
    setSaving(true);
    try {
      const data = await fn();
      if (success) toast.success(success);
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

export interface Option { label: string; value: string }

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

export const CHART_COLORS = { emerald: "#059669", amber: "#d97706", teal: "#0d9488", red: "#dc2626" } as const;

export interface SeriesDef { key: string; label: string; color: string }

const AXIS_TICK = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };
const TOOLTIP_STYLE = {
  borderRadius: 10,
  border: "1px solid hsl(var(--border))",
  background: "hsl(var(--card))",
  color: "hsl(var(--foreground))",
  fontSize: 12,
} as const;

export function AreaTrend({ data, xKey, series, height = 220 }: {
  data: Record<string, unknown>[]; xKey: string; series: SeriesDef[]; height?: number;
}) {
  return (
    <div className="w-full overflow-hidden" style={{ height }}>
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
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey={xKey} tick={AXIS_TICK} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
          <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={56} tickFormatter={(v) => formatINR(Number(v), { compact: true })} />
          <Tooltip formatter={(v) => formatINR(Number(v))} contentStyle={TOOLTIP_STYLE} cursor={{ stroke: "hsl(var(--border))" }} />
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

export function BarsCompare({ data, xKey, series, height = 220 }: {
  data: Record<string, unknown>[]; xKey: string; series: SeriesDef[]; height?: number;
}) {
  return (
    <div className="w-full overflow-hidden" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -14, bottom: 0 }} barCategoryGap="24%">
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey={xKey} tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={16} />
          <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={56} tickFormatter={(v) => formatINR(Number(v), { compact: true })} />
          <Tooltip formatter={(v) => formatINR(Number(v))} contentStyle={TOOLTIP_STYLE} cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />}
          {series.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[4, 4, 4, 4]} maxBarSize={30} />
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
  advanceBalance?: number | null;
}

export function EmployeePicker({ employees, value, onChange, multi = true, height = "max-h-60" }: {
  employees: PickerEmployee[];
  value: string[];
  onChange: (ids: string[]) => void;
  multi?: boolean;
  height?: string;
}) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) => `${e.fullName} ${e.code ?? ""}`.toLowerCase().includes(q));
  }, [employees, search]);

  const toggle = (id: string) => {
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
          return (
            <div
              key={e.id}
              role="option"
              aria-selected={on}
              tabIndex={0}
              onClick={() => toggle(e.id)}
              onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); toggle(e.id); } }}
              className={cn(
                "flex cursor-pointer items-center gap-2.5 border-b px-3 py-2.5 transition-colors last:border-b-0 hover:bg-muted/60",
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
                <p className="text-[11px] text-muted-foreground">
                  {e.code ?? ""}{e.standardRate ? ` · ${formatINR(e.standardRate)}/day` : ""}
                </p>
              </div>
              {(e.advanceBalance ?? 0) > 0 && (
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

  const selected = employees.find((e) => e.id === employeeId);

  const submit = async () => {
    if (!employeeId) { toast.error("Select an employee"); return; }
    const amt = parseAmount(amount);
    if (amt <= 0) { toast.error("Enter a valid amount"); return; }
    const res = await mutate(
      () => api.post("/api/advances", { employeeId, date, amount: amt, reason: reason || undefined, method: method || undefined }),
      "Advance recorded"
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
              <Input type="number" inputMode="numeric" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" className="h-10" />
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
        <DialogFooter className="gap-2">
          <Button variant="outline" className="min-h-10 flex-1 sm:flex-none" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="min-h-10 flex-1 sm:flex-none" onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Give Advance"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Record Payment dialog (payments-view; also property ledger)
// ---------------------------------------------------------------------------

interface LedgerDay { date: string; billed: number; paid: number; outstanding: number; status: string }
interface PropertyLedger { ledger: { billed: number; received: number; outstanding: number }; days: LedgerDay[] }

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

  const submit = async () => {
    if (!selected) { toast.error("Select a property"); return; }
    const amt = parseAmount(amount);
    if (amt <= 0) { toast.error("Enter a valid amount"); return; }
    const res = await mutate(
      () => api.post("/api/payments", { propertyId: selected, date, amount: amt, method: method || undefined, reference: reference || undefined, notes: notes || undefined }),
      `Payment of ${formatINR(amt)} recorded`
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
              <Input type="number" inputMode="numeric" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" className="h-10" />
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
        <DialogFooter className="gap-2">
          <Button variant="outline" className="min-h-10 flex-1 sm:flex-none" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="min-h-10 flex-1 sm:flex-none" onClick={submit} disabled={saving}>{saving ? "Saving…" : "Record Payment"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Deploy Wizard (multi-step: details → employees → review & save)
// ---------------------------------------------------------------------------

interface ShiftRec { id: string; name: string; startTime?: string; endTime?: string }

export function DeployWizard({ open, onOpenChange, defaultDate, defaultPropertyId, onDone }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultDate?: string;
  defaultPropertyId?: string;
  onDone: () => void;
}) {
  const [step, setStep] = useState(1);
  const [properties, setProperties] = useState<PropertyRec[]>([]);
  const [shifts, setShifts] = useState<ShiftRec[]>([]);
  const { employees, loading: loadingEmps } = useActiveEmployees(open);
  const [propertyId, setPropertyId] = useState(defaultPropertyId ?? "");
  const [date, setDate] = useState(defaultDate ?? todayStr());
  const [shift, setShift] = useState("DAY");
  const [workCategory, setWorkCategory] = useState("");
  const [notes, setNotes] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [overrides, setOverrides] = useState<Record<string, { billingRate?: string; payoutRate?: string }>>({});
  const [resolved, setResolved] = useState<{ billingRate: number | null; payoutRate: number | null } | null>(null);
  const [duplicates, setDuplicates] = useState<string[] | null>(null);
  const [creating, setCreating] = useState(false);

  // Load static options (async) + reset on open (render-time state adjustment).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setStep(1);
      setPropertyId(defaultPropertyId ?? "");
      setDate(defaultDate ?? todayStr());
      setShift("DAY");
      setWorkCategory("");
      setNotes("");
      setSelected([]);
      setOverrides({});
      setResolved(null);
      setDuplicates(null);
    }
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api.get<ListResp<PropertyRec>>("/api/properties" + qs({ status: "ACTIVE", pageSize: 200 }))
      .then((d) => { if (!cancelled) setProperties(d.items); })
      .catch(() => {});
    api.get<{ items: ShiftRec[] }>("/api/shifts")
      .then((d) => { if (!cancelled) setShifts(d.items); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open]);

  // Resolve contract rates when property + date known.
  const [prevResolveKey, setPrevResolveKey] = useState("");
  const resolveKey = open && propertyId && date ? `${propertyId}|${date}` : "";
  if (resolveKey !== prevResolveKey) {
    setPrevResolveKey(resolveKey);
    if (!resolveKey) setResolved(null);
  }
  useEffect(() => {
    if (!resolveKey) return;
    let cancelled = false;
    api.get<{ contract: ContractRec | null; billingRate: number | null; payoutRate: number | null }>(
      "/api/contracts/resolve" + qs({ propertyId, date })
    )
      .then((d) => { if (!cancelled) setResolved({ billingRate: d.billingRate, payoutRate: d.payoutRate }); })
      .catch(() => { if (!cancelled) setResolved(null); });
    return () => { cancelled = true; };
  }, [resolveKey]);

  const selectedEmployees = useMemo(
    () => employees.filter((e) => selected.includes(e.id)),
    [employees, selected]
  );

  const rateFor = useCallback((emp: PickerEmployee, key: "billingRate" | "payoutRate"): number => {
    const o = overrides[emp.id];
    if (o && o[key] !== undefined && o[key] !== "") return parseAmount(o[key]);
    if (key === "billingRate") return resolved?.billingRate ?? 0;
    return resolved?.payoutRate ?? emp.standardRate ?? 0;
  }, [overrides, resolved]);

  const totals = useMemo(() => {
    let billing = 0, payout = 0;
    for (const e of selectedEmployees) {
      billing += rateFor(e, "billingRate");
      payout += rateFor(e, "payoutRate");
    }
    return { billing, payout, margin: billing - payout };
  }, [selectedEmployees, rateFor]);

  const buildBody = (ids: string[]) => {
    const overridesPayload: Record<string, Record<string, number>> = {};
    for (const e of selectedEmployees) {
      if (!ids.includes(e.id)) continue;
      const o = overrides[e.id];
      if (!o) continue;
      const payload: Record<string, number> = {};
      if (o.billingRate !== undefined && o.billingRate !== "") payload.billingRate = parseAmount(o.billingRate);
      if (o.payoutRate !== undefined && o.payoutRate !== "") payload.payoutRate = parseAmount(o.payoutRate);
      if (Object.keys(payload).length > 0) overridesPayload[e.id] = payload;
    }
    return {
      propertyId,
      date,
      shift,
      workCategory: workCategory || undefined,
      notes: notes || undefined,
      employeeIds: ids,
      overrides: Object.keys(overridesPayload).length > 0 ? overridesPayload : undefined,
    };
  };

  const finish = (result: { created?: unknown[]; skipped?: { employeeName?: string }[] }) => {
    const created = result.created?.length ?? 0;
    const skipped = result.skipped?.length ?? 0;
    toast.success(
      created > 0
        ? `Deployed ${created} employee${created === 1 ? "" : "s"}${skipped > 0 ? ` · ${skipped} skipped (duplicates)` : ""}`
        : "No new deployments created"
    );
    onOpenChange(false);
    onDone();
  };

  const submit = async (skipIds?: string[]) => {
    const ids = skipIds ?? selected;
    if (ids.length === 0) { toast.error("Select at least one employee"); return; }
    setCreating(true);
    try {
      const result = await api.post<{ created: unknown[]; skipped: { employeeName?: string }[] }>("/api/deployments", buildBody(ids));
      finish(result);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const dups = Array.isArray(e.extra?.duplicates) ? (e.extra.duplicates as string[]) : [];
        setDuplicates(dups);
        toast.error(e.message || "Some employees are already deployed on this date & shift");
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

  const canNext = propertyId && date && shift;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[86vh] flex-col gap-0 overflow-hidden p-0 sm:h-[82vh] sm:max-w-xl">
        <DialogHeader className="border-b px-5 pb-4 pt-5 text-left">
          <DialogTitle>Deploy Employees</DialogTitle>
          <DialogDescription>
            Step {step} of 3 · {step === 1 ? "Where & when" : step === 2 ? "Pick employees" : "Review rates & save"}
          </DialogDescription>
          <div className="mt-3 flex items-center gap-1.5" aria-hidden>
            {[1, 2, 3].map((s) => (
              <div key={s} className={cn("h-1.5 flex-1 rounded-full transition-colors", s <= step ? "bg-primary" : "bg-muted")} />
            ))}
          </div>
        </DialogHeader>

        <div className="flex-1 space-y-3.5 overflow-y-auto px-5 py-4">
          {duplicates && duplicates.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs dark:border-amber-900 dark:bg-amber-950/40">
              <p className="flex items-center gap-1.5 font-semibold text-amber-800 dark:text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Already deployed
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
              <Field label="Property" required>
                <SelectInput
                  value={propertyId}
                  onChange={setPropertyId}
                  placeholder="Select property…"
                  options={properties.map((p) => ({ label: p.brandName ? `${p.name} (${p.brandName})` : p.name, value: p.id }))}
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Date" required>
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-10" />
                </Field>
                <Field label="Shift" required>
                  <SelectInput
                    value={shift}
                    onChange={setShift}
                    options={shifts.length > 0
                      ? shifts.map((s) => ({ label: `${s.name} (${s.startTime ?? ""}–${s.endTime ?? ""})`, value: s.name }))
                      : [{ label: "Day", value: "DAY" }, { label: "Night", value: "NIGHT" }]}
                  />
                </Field>
              </div>
              <Field label="Work category" hint="e.g. Service, Kitchen, Bar, Delivery — optional">
                <Input value={workCategory} onChange={(e) => setWorkCategory(e.target.value)} className="h-10" placeholder="Service" />
              </Field>
              <Field label="Notes">
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional instructions" />
              </Field>
              <div className={cn(
                "rounded-xl border px-3.5 py-3 text-xs",
                resolved?.billingRate != null
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
                  : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
              )}>
                {resolved?.billingRate != null ? (
                  <p className="font-medium">
                    Contract rates will be used: billing {formatINR(resolved.billingRate)} / payout {formatINR(resolved.payoutRate ?? 0)} per shift
                  </p>
                ) : (
                  <p className="font-medium">
                    No contract found for this property & date. Payout falls back to each employee&apos;s standard rate; set billing manually in review or the save may be rejected.
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
                    onClick={() => setSelected(selected.length === employees.length ? [] : employees.map((e) => e.id))}
                  >
                    {selected.length === employees.length ? "Deselect all" : "Select all"}
                  </Button>
                </div>
                <EmployeePicker employees={employees} value={selected} onChange={setSelected} height="max-h-[46vh]" />
              </>
            )
          )}

          {step === 3 && (
            <>
              <div className="rounded-xl border bg-muted/40 px-3.5 py-2.5 text-xs">
                <p className="font-medium">{properties.find((p) => p.id === propertyId)?.name ?? "Property"}</p>
                <p className="mt-0.5 text-muted-foreground">
                  {fmtDay(date)} · {shift} shift{workCategory ? ` · ${workCategory}` : ""} · {selected.length} employee{selected.length === 1 ? "" : "s"}
                </p>
              </div>
              <div className="overflow-hidden rounded-xl border">
                <div className="grid grid-cols-[1fr_auto_auto] gap-2 border-b bg-muted/50 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <span>Employee</span><span className="text-right">Billing ₹</span><span className="text-right">Payout ₹</span>
                </div>
                <div className="max-h-56 overflow-y-auto">
                  {selectedEmployees.map((e) => (
                    <div key={e.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 border-b px-3 py-2 last:border-b-0">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium">{e.fullName}</p>
                        <p className="text-[10px] text-muted-foreground">{e.code}</p>
                      </div>
                      <Input
                        type="number"
                        inputMode="numeric"
                        className="h-8 w-20 text-right text-xs tabular-nums"
                        value={overrides[e.id]?.billingRate ?? String(resolved?.billingRate ?? 0)}
                        onChange={(ev) => setOverrides((o) => ({ ...o, [e.id]: { ...o[e.id], billingRate: ev.target.value } }))}
                        aria-label={`Billing rate for ${e.fullName}`}
                      />
                      <Input
                        type="number"
                        inputMode="numeric"
                        className="h-8 w-20 text-right text-xs tabular-nums"
                        value={overrides[e.id]?.payoutRate ?? String(resolved?.payoutRate ?? e.standardRate ?? 0)}
                        onChange={(ev) => setOverrides((o) => ({ ...o, [e.id]: { ...o[e.id], payoutRate: ev.target.value } }))}
                        aria-label={`Payout rate for ${e.fullName}`}
                      />
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">Rates are per shift. Edit any cell to override the contract rate for that employee only.</p>
            </>
          )}
        </div>

        <div className="border-t bg-card px-5 py-3">
          {step === 3 && (
            <div className="mb-2.5 flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2 text-xs font-medium tabular-nums">
              <span>Billing <span className="font-bold">{formatINR(totals.billing)}</span></span>
              <span>Payout <span className="font-bold">{formatINR(totals.payout)}</span></span>
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
              <Button className="min-h-10 gap-1.5" disabled={!canNext} onClick={() => setStep(step + 1)}>
                Next<ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
            ) : (
              <Button className="min-h-10 gap-1.5" onClick={() => submit()} disabled={creating || selected.length === 0}>
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
// Contract form (contracts-view + property-detail-view)
// ---------------------------------------------------------------------------

export function ContractFormDialog({ open, onOpenChange, contract, defaultPropertyId, properties: propsProp, onDone }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contract?: ContractRec | null;
  defaultPropertyId?: string;
  properties?: { id: string; name: string }[];
  onDone: () => void;
}) {
  const editing = Boolean(contract);
  const [fetchedProps, setFetchedProps] = useState<{ id: string; name: string }[]>([]);
  const properties = propsProp ?? fetchedProps;
  const [form, setForm] = useState({
    propertyId: defaultPropertyId ?? "", name: "", startDate: todayStr(), endDate: "",
    billingRate: "", payoutRate: "", shift: "DAY", category: "", maxEmployees: "",
    paymentTerms: "", notes: "",
  });
  const { mutate, saving } = useMutation();

  useEffect(() => {
    if (propsProp || properties.length > 0) return;
    let cancelled = false;
    api.get<ListResp<PropertyRec>>("/api/properties" + qs({ pageSize: 200 }))
      .then((d) => { if (!cancelled) setFetchedProps(d.items.map((p) => ({ id: p.id, name: p.name }))); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [propsProp]);

  // Reset form each time the dialog opens (render-time state adjustment).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setForm({
        propertyId: contract?.propertyId ?? defaultPropertyId ?? "",
        name: contract?.name ?? "",
        startDate: contract?.startDate?.slice(0, 10) ?? todayStr(),
        endDate: contract?.endDate?.slice(0, 10) ?? "",
        billingRate: contract ? String(contract.billingRate) : "",
        payoutRate: contract ? String(contract.payoutRate) : "",
        shift: contract?.shift ?? "DAY",
        category: contract?.category ?? "",
        maxEmployees: contract?.maxEmployees ? String(contract.maxEmployees) : "",
        paymentTerms: contract?.paymentTerms ?? "",
        notes: contract?.notes ?? "",
      });
    }
  }

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.propertyId) { toast.error("Select a property"); return; }
    if (!form.name.trim()) { toast.error("Contract name is required"); return; }
    if (!form.startDate) { toast.error("Start date is required"); return; }
    const b = parseAmount(form.billingRate);
    const p = parseAmount(form.payoutRate);
    if (b <= 0 || p <= 0) { toast.error("Billing and payout rates are required"); return; }
    const body = {
      propertyId: form.propertyId,
      name: form.name.trim(),
      startDate: form.startDate,
      endDate: form.endDate || undefined,
      billingRate: b,
      payoutRate: p,
      shift: form.shift || undefined,
      category: form.category || undefined,
      maxEmployees: form.maxEmployees ? Number(form.maxEmployees) : undefined,
      paymentTerms: form.paymentTerms || undefined,
      notes: form.notes || undefined,
    };
    const res = editing
      ? await mutate(() => api.put(`/api/contracts/${contract!.id}`, body), "Contract updated — affects future deployments only")
      : await mutate(() => api.post("/api/contracts", body), "Contract created");
    if (res.ok) { onOpenChange(false); onDone(); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Contract" : "New Contract"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Rate changes affect future deployments only — historical records keep their snapshot."
              : "Creating an ACTIVE contract ends the property's previous active contract."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Property" required className="sm:col-span-2">
            <SelectInput
              value={form.propertyId}
              onChange={set("propertyId")}
              placeholder="Select property…"
              disabled={Boolean(defaultPropertyId) && !editing}
              options={properties.map((p) => ({ label: p.name, value: p.id }))}
            />
          </Field>
          <Field label="Contract name" required className="sm:col-span-2">
            <Input value={form.name} onChange={(e) => set("name")(e.target.value)} className="h-10" placeholder="e.g. Day-shift 2025" />
          </Field>
          <Field label="Start date" required><Input type="date" value={form.startDate} onChange={(e) => set("startDate")(e.target.value)} className="h-10" /></Field>
          <Field label="End date"><Input type="date" value={form.endDate} onChange={(e) => set("endDate")(e.target.value)} className="h-10" /></Field>
          <Field label="Billing rate (₹/shift)" required><Input type="number" inputMode="numeric" value={form.billingRate} onChange={(e) => set("billingRate")(e.target.value)} className="h-10" /></Field>
          <Field label="Payout rate (₹/shift)" required><Input type="number" inputMode="numeric" value={form.payoutRate} onChange={(e) => set("payoutRate")(e.target.value)} className="h-10" /></Field>
          <Field label="Shift">
            <SelectInput value={form.shift} onChange={set("shift")} options={[{ label: "Day", value: "DAY" }, { label: "Night", value: "NIGHT" }, { label: "All", value: "ALL" }]} />
          </Field>
          <Field label="Work category"><Input value={form.category} onChange={(e) => set("category")(e.target.value)} className="h-10" placeholder="Service, Kitchen…" /></Field>
          <Field label="Max employees"><Input type="number" inputMode="numeric" value={form.maxEmployees} onChange={(e) => set("maxEmployees")(e.target.value)} className="h-10" /></Field>
          <Field label="Payment terms"><Input value={form.paymentTerms} onChange={(e) => set("paymentTerms")(e.target.value)} className="h-10" placeholder="Weekly, every Monday" /></Field>
          <Field label="Notes" className="sm:col-span-2"><Textarea value={form.notes} onChange={(e) => set("notes")(e.target.value)} rows={2} /></Field>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="min-h-10 flex-1 sm:flex-none" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="min-h-10 flex-1 sm:flex-none" onClick={submit} disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Create contract"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Misc shared bits
// ---------------------------------------------------------------------------

export function ShiftBadgeInline({ shift }: { shift: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
      <span className={cn("inline-block h-1.5 w-1.5 rounded-full", shift === "NIGHT" ? "bg-slate-500" : "bg-amber-500")} aria-hidden />
      {shift}
    </span>
  );
}
