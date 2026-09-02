"use client";

import { useState } from "react";
import { api, qs } from "@/lib/api-client";
import { formatINR, parseAmount } from "@/lib/money";
import type { ViewProps } from "@/components/view-types";
import { PageHeader } from "@/components/shared/page-header";
import { SearchInput } from "@/components/shared/filters";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { StatCard, StatGrid } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CarFront, Plus, ShieldAlert, GaugeCircle } from "lucide-react";
import {
  type VehicleRec, type Option, SelectInput, Field, ErrorState, moneyCls,
  useAsync, useMutation, useDebounced, fmtDay,
} from "./_shared";

const STATUS_OPTIONS: Option[] = [
  { label: "All statuses", value: "" },
  { label: "Available", value: "AVAILABLE" },
  { label: "Rented", value: "RENTED" },
  { label: "On trip", value: "TRIP" },
  { label: "Maintenance", value: "MAINTENANCE" },
  { label: "Inactive", value: "INACTIVE" },
];

function daysUntil(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr.length === 10 ? `${dateStr}T00:00:00` : dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

function shortDay(dateStr?: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr.length === 10 ? `${dateStr}T00:00:00` : dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

// ---------------------------------------------------------------------------
// Add vehicle dialog
// ---------------------------------------------------------------------------

function AddVehicleDialog({ open, onOpenChange, onDone }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const blank = {
    registrationNumber: "", name: "", make: "", model: "", variant: "", year: "",
    purchaseDate: "", purchasePrice: "", loanAmount: "", monthlyEmi: "", emiStartDate: "", emiCount: "",
    insuranceCompany: "", insuranceNumber: "", insuranceExpiry: "", fitnessExpiry: "",
    permitInfo: "", notes: "",
  };
  const [form, setForm] = useState(blank);
  const { mutate, saving } = useMutation();

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setForm(blank);
  }

  // Event-compatible setter: works directly as Input/Textarea onChange.
  const set = (k: keyof typeof blank) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    if (!form.registrationNumber.trim()) { toast.error("Registration number is required"); return; }
    if (!form.name.trim()) { toast.error("Vehicle name is required"); return; }
    const res = await mutate(
      () => api.post("/api/vehicles", {
        registrationNumber: form.registrationNumber.trim().toUpperCase(),
        name: form.name.trim(),
        make: form.make || undefined,
        model: form.model || undefined,
        variant: form.variant || undefined,
        year: form.year ? Number(form.year) : undefined,
        purchaseDate: form.purchaseDate || undefined,
        purchasePrice: form.purchasePrice ? parseAmount(form.purchasePrice) : undefined,
        loanAmount: form.loanAmount ? parseAmount(form.loanAmount) : undefined,
        monthlyEmi: form.monthlyEmi ? parseAmount(form.monthlyEmi) : undefined,
        emiStartDate: form.emiStartDate || undefined,
        emiCount: form.emiCount ? Number(form.emiCount) : undefined,
        insuranceCompany: form.insuranceCompany || undefined,
        insuranceNumber: form.insuranceNumber || undefined,
        insuranceExpiry: form.insuranceExpiry || undefined,
        fitnessExpiry: form.fitnessExpiry || undefined,
        permitInfo: form.permitInfo || undefined,
        notes: form.notes || undefined,
      }),
      "Vehicle added"
    );
    if (res.ok) { onOpenChange(false); onDone(); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add Vehicle</DialogTitle>
          <DialogDescription>Vehicle code (VEH-xxx) is auto-generated. Loan details drive the EMI schedule.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Registration number" required>
            <Input value={form.registrationNumber} onChange={set("registrationNumber")} className="h-10 font-mono uppercase" placeholder="MH12AB1234" />
          </Field>
          <Field label="Name" required>
            <Input value={form.name} onChange={set("name")} className="h-10" placeholder="e.g. Swift Desire 01" />
          </Field>
          <Field label="Make"><Input value={form.make} onChange={set("make")} className="h-10" placeholder="Maruti" /></Field>
          <Field label="Model"><Input value={form.model} onChange={set("model")} className="h-10" placeholder="Dzire" /></Field>
          <Field label="Variant"><Input value={form.variant} onChange={set("variant")} className="h-10" placeholder="VXi" /></Field>
          <Field label="Year"><Input type="number" inputMode="numeric" value={form.year} onChange={set("year")} className="h-10" placeholder="2023" /></Field>
          <Field label="Purchase date"><Input type="date" value={form.purchaseDate} onChange={set("purchaseDate")} className="h-10" /></Field>
          <Field label="Purchase price (₹)"><Input type="number" inputMode="numeric" value={form.purchasePrice} onChange={set("purchasePrice")} className="h-10" /></Field>

          <div className="sm:col-span-2">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Loan & EMI</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Loan amount (₹)"><Input type="number" inputMode="numeric" value={form.loanAmount} onChange={set("loanAmount")} className="h-10" /></Field>
              <Field label="Monthly EMI (₹)"><Input type="number" inputMode="numeric" value={form.monthlyEmi} onChange={set("monthlyEmi")} className="h-10" /></Field>
              <Field label="EMI start date"><Input type="date" value={form.emiStartDate} onChange={set("emiStartDate")} className="h-10" /></Field>
              <Field label="Installments" hint="Number of monthly EMIs"><Input type="number" inputMode="numeric" value={form.emiCount} onChange={set("emiCount")} className="h-10" /></Field>
            </div>
          </div>

          <div className="sm:col-span-2">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Compliance</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Insurance company"><Input value={form.insuranceCompany} onChange={set("insuranceCompany")} className="h-10" /></Field>
              <Field label="Insurance number"><Input value={form.insuranceNumber} onChange={set("insuranceNumber")} className="h-10" /></Field>
              <Field label="Insurance expiry"><Input type="date" value={form.insuranceExpiry} onChange={set("insuranceExpiry")} className="h-10" /></Field>
              <Field label="Fitness expiry"><Input type="date" value={form.fitnessExpiry} onChange={set("fitnessExpiry")} className="h-10" /></Field>
              <Field label="Permit info" className="sm:col-span-2"><Input value={form.permitInfo} onChange={set("permitInfo")} className="h-10" placeholder="State permit, national permit…" /></Field>
            </div>
          </div>

          <Field label="Notes" className="sm:col-span-2">
            <Textarea value={form.notes} onChange={set("notes")} rows={2} placeholder="Optional" />
          </Field>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="min-h-10 flex-1 sm:flex-none" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="min-h-10 flex-1 sm:flex-none" onClick={submit} disabled={saving}>{saving ? "Saving…" : "Add vehicle"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export default function VehiclesView({ navigate }: ViewProps) {
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const searchDeb = useDebounced(search);
  const [addOpen, setAddOpen] = useState(false);

  const vehicles = useAsync<{ items: VehicleRec[] }>(
    () => api.get("/api/vehicles" + qs({ status: status || undefined, search: searchDeb || undefined })),
    [status, searchDeb]
  );

  const items = vehicles.data?.items ?? [];

  const fleetNet = items.reduce((s, v) => s + (v.stats?.monthNet ?? 0), 0);
  const flagged = items.filter((v) => {
    const d = daysUntil(v.insuranceExpiry);
    return d !== null && d <= 30;
  }).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Vehicles"
        subtitle={`${items.length} vehicle(s) in fleet`}
        actions={
          <Button size="sm" className="h-9 gap-1.5" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden />Add Vehicle
          </Button>
        }
      />

      <Card>
        <CardContent className="flex flex-col gap-2.5 p-3 sm:p-4 sm:flex-row sm:items-center">
          <SearchInput value={search} onChange={setSearch} placeholder="Search name or registration…" className="flex-1" />
          <div className="w-full sm:w-48">
            <SelectInput value={status} onChange={setStatus} options={STATUS_OPTIONS} placeholder="All statuses" />
          </div>
        </CardContent>
      </Card>

      <StatGrid cols={3}>
        <StatCard label="Fleet size" value={String(items.length)} icon={CarFront} />
        <StatCard label="Fleet net (this month)" value={formatINR(fleetNet, { compact: true })} icon={GaugeCircle} tone={fleetNet >= 0 ? "positive" : "negative"} />
        <StatCard label="Compliance alerts" value={String(flagged)} icon={ShieldAlert} tone={flagged > 0 ? "warning" : "default"} hint="Insurance due ≤ 30 days" />
      </StatGrid>

      {vehicles.error ? (
        <ErrorState message={vehicles.error} onRetry={() => void vehicles.reload()} />
      ) : vehicles.loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-52 animate-pulse rounded-xl bg-muted" />)}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={CarFront}
          title={search || status ? "No vehicles match" : "No vehicles yet"}
          description={search || status ? "Try clearing the search or status filter." : "Add your first vehicle to start tracking trips, EMI and profitability."}
          action={{ label: "Add Vehicle", onClick: () => setAddOpen(true) }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {items.map((v) => {
            const insDays = daysUntil(v.insuranceExpiry);
            const showInsWarning = insDays !== null && insDays <= 30;
            return (
              <Card
                key={v.id}
                role="button"
                tabIndex={0}
                onClick={() => navigate("vehicle-detail", { id: v.id })}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate("vehicle-detail", { id: v.id }); } }}
                className="cursor-pointer border-border/70 shadow-sm transition-all hover:shadow-md hover:border-primary/40 active:scale-[0.99]"
                aria-label={`Open ${v.name}`}
              >
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{v.name}</p>
                      <span className="mt-1 inline-block rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] tracking-tight">
                        {v.registrationNumber}
                      </span>
                    </div>
                    <StatusBadge status={v.status} />
                  </div>

                  <p className="truncate text-xs text-muted-foreground">
                    {[v.make, v.model, v.variant, v.year].filter(Boolean).join(" · ") || "—"}
                  </p>

                  <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted/40 p-2.5">
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Month revenue</p>
                      <p className="text-sm font-semibold tabular-nums">{formatINR(v.stats?.monthRevenue ?? 0, { compact: true })}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Month expense</p>
                      <p className="text-sm font-semibold tabular-nums">{formatINR(v.stats?.monthExpense ?? 0, { compact: true })}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Net</p>
                      <p className={cn("text-sm font-bold tabular-nums", moneyCls(v.stats?.monthNet ?? 0))}>
                        {formatINR(v.stats?.monthNet ?? 0, { compact: true })}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">EMI</p>
                      <p className="text-sm font-semibold tabular-nums">{formatINR(v.stats?.monthEmi ?? 0, { compact: true })}</p>
                    </div>
                  </div>

                  {showInsWarning && (
                    <p className={cn(
                      "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium",
                      (insDays ?? 0) < 0
                        ? "bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300"
                        : "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
                    )}>
                      <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      {(insDays ?? 0) < 0
                        ? `Insurance expired ${shortDay(v.insuranceExpiry)}`
                        : `Insurance expires ${shortDay(v.insuranceExpiry)}`}
                    </p>
                  )}

                  {(v.fitnessExpiry) && (daysUntil(v.fitnessExpiry) ?? 999) <= 30 && (
                    <p className={cn(
                      "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium",
                      (daysUntil(v.fitnessExpiry) ?? 0) < 0
                        ? "bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300"
                        : "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
                    )}>
                      <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      Fitness {(daysUntil(v.fitnessExpiry) ?? 0) < 0 ? "expired" : "expires"} {shortDay(v.fitnessExpiry)}
                    </p>
                  )}

                  <p className="text-[11px] text-muted-foreground">
                    Purchased {v.purchaseDate ? fmtDay(v.purchaseDate) : "—"}
                    {(v.monthlyEmi ?? 0) > 0 ? ` · EMI ${formatINR(v.monthlyEmi ?? 0)}/mo` : ""}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AddVehicleDialog open={addOpen} onOpenChange={setAddOpen} onDone={() => void vehicles.reload()} />
    </div>
  );
}
