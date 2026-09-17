"use client";

import { useState } from "react";
import { api, qs } from "@/lib/api-client";
import { formatINR, parseAmount } from "@/lib/money";
import type { ViewProps } from "@/components/view-types";
import { PageHeader } from "@/components/shared/page-header";
import { ViewFab } from "@/components/shared/view-fab";
import { DataTable, type Column } from "@/components/shared/data-table";
import { StatCard, StatGrid } from "@/components/shared/stat-card";
import { RangeSelector, type RangeKey } from "@/components/shared/filters";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TripFormDialog } from "@/components/shared/trip-form-dialog";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useLang, t } from "@/lib/i18n";
import { Route, Plus, IndianRupee, TimerOff, BadgeCheck, MoreHorizontal, Pencil, Eye } from "lucide-react";
import {
  type TripRec, type VehicleRec, type ClientRec, type Option, SelectInput, Field, KV, ErrorState, MoneyInput,
  fmtDay, fmtDateTime, useAsync, useMutation, ConfirmAmount,
} from "./_shared";

type TripsResp = { items: TripRec[]; total: number; totals?: { revenue: number; pending: number } };

const STATUS_OPTIONS: Option[] = [
  { label: "All statuses", value: "" },
  { label: "Confirmed", value: "CONFIRMED" },
  { label: "Active", value: "ACTIVE" },
  { label: "Completed", value: "COMPLETED" },
  { label: "Cancelled", value: "CANCELLED" },
];

const PAY_STATUS_OPTIONS: Option[] = [
  { label: "All payments", value: "" },
  { label: "Pending", value: "PENDING" },
  { label: "Partial", value: "PARTIAL" },
  { label: "Paid", value: "PAID" },
];

const METHOD_OPTIONS: Option[] = ["Cash", "UPI", "Bank", "Cheque", "Other"].map((m) => ({ label: m, value: m }));

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

function nowLocalValue(): string {
  return new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function tripTotal(t: TripRec): number {
  return t.finalAmount ?? (t.agreedAmount + (t.extraCharges ?? 0));
}

function tripOutstanding(t: TripRec): number {
  return Math.max(0, tripTotal(t) - (t.paidAmount ?? 0));
}

function tripPaidPct(t: TripRec): number {
  const target = tripTotal(t);
  if (target <= 0) return 0;
  return Math.min(100, Math.round(((t.paidAmount ?? 0) / target) * 100));
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export default function TripsView({ params, navigate }: ViewProps) {
  const { lang } = useLang();
  const { mutate, saving } = useMutation();

  // Filters
  const [vehicleId, setVehicleId] = useState(params?.vehicleId ?? "");
  const [clientId, setClientId] = useState(params?.clientId ?? "");
  const [status, setStatus] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [rangeKey, setRangeKey] = useState<RangeKey | "custom">("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const eff = rangeKey === "custom" ? { from: customFrom, to: customTo } : rangeDates(rangeKey);

  const vehicles = useAsync<{ items: VehicleRec[] }>(() => api.get("/api/vehicles"), []);
  const clients = useAsync<{ items: ClientRec[] }>(() => api.get("/api/clients"), []);
  const trips = useAsync<TripsResp>(
    () => api.get("/api/trips" + qs({
      vehicleId: vehicleId || undefined,
      clientId: clientId || undefined,
      status: status || undefined,
      paymentStatus: paymentStatus || undefined,
      from: eff.from || undefined,
      to: eff.to || undefined,
      pageSize: 200,
    })),
    [vehicleId, clientId, status, paymentStatus, eff.from, eff.to]
  );

  const items = trips.data?.items ?? [];

  // Dialogs
  const [detailId, setDetailId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [editFor, setEditFor] = useState<TripRec | null>(null);
  const [endFor, setEndFor] = useState<string | null>(null);
  const [endForm, setEndForm] = useState({ endAt: nowLocalValue(), finalAmount: "", extraCharges: "" });
  const [payFor, setPayFor] = useState<string | null>(null);
  const [payForm, setPayForm] = useState({ amount: "", method: "Cash" });
  const [cancelFor, setCancelFor] = useState<string | null>(null);

  const detail = detailId ? items.find((t) => t.id === detailId) ?? null : null;

  // Seed end-trip form when target changes (render-time adjustment).
  const [prevEndFor, setPrevEndFor] = useState<string | null>(null);
  if (endFor !== prevEndFor) {
    setPrevEndFor(endFor);
    const t = endFor ? items.find((x) => x.id === endFor) ?? null : null;
    setEndForm({
      endAt: nowLocalValue(),
      finalAmount: t ? String(tripTotal(t)) : "",
      extraCharges: "0",
    });
  }

  // Seed payment form when target changes (render-time adjustment).
  const [prevPayFor, setPrevPayFor] = useState<string | null>(null);
  if (payFor !== prevPayFor) {
    setPrevPayFor(payFor);
    const t = payFor ? items.find((x) => x.id === payFor) ?? null : null;
    setPayForm({ amount: t ? String(tripOutstanding(t)) : "", method: "Cash" });
  }

  const submitEnd = async () => {
    if (!endFor) return;
    if (!endForm.endAt) { toast.error("End date & time is required"); return; }
    const res = await mutate(
      () => api.put(`/api/trips/${endFor}`, {
        endAt: new Date(endForm.endAt).toISOString(),
        finalAmount: parseAmount(endForm.finalAmount),
        extraCharges: parseAmount(endForm.extraCharges),
      }),
      "Trip completed — vehicle released"
    );
    if (res.ok) { setEndFor(null); setDetailId(null); void trips.reload(); }
  };

  const submitPayment = async () => {
    if (!payFor) return;
    const amt = parseAmount(payForm.amount);
    if (amt <= 0) { toast.error("Enter a valid amount"); return; }
    const res = await mutate(
      () => api.post(`/api/trips/${payFor}/payment`, { amount: amt, method: payForm.method || undefined }),
      `Payment of ${formatINR(amt)} recorded`,
      () => ({ module: "TRIP", recordId: payFor, onUndo: () => void trips.reload() })
    );
    if (res.ok) { setPayFor(null); void trips.reload(); }
  };

  const payTrip = payFor ? items.find((x) => x.id === payFor) ?? null : null;
  const paySubject = payTrip ? `${payTrip.vehicleName ?? "Vehicle"} → ${payTrip.clientName ?? "Client"}` : "this trip";

  const cancelTrip = async () => {
    if (!cancelFor) return;
    const res = await mutate(() => api.put(`/api/trips/${cancelFor}`, { status: "CANCELLED" }), "Trip cancelled", () => ({ module: "TRIP", recordId: cancelFor, onUndo: () => void trips.reload() }));
    if (res.ok) { setCancelFor(null); setDetailId(null); void trips.reload(); }
  };

  const columns: Column<TripRec>[] = [
    {
      key: "vehicle", label: t(lang, "col.vehicleClient"), primary: true,
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{r.vehicleName ?? "—"} <span className="text-muted-foreground">→ {r.clientName ?? "—"}</span></p>
          <p className="truncate text-[11px] text-muted-foreground">
            {fmtDateTime(r.startAt)} → {r.endAt ? fmtDateTime(r.endAt) : "ongoing"}
          </p>
        </div>
      ),
      value: (r) => `${r.vehicleName ?? "—"} → ${r.clientName ?? "—"}`,
    },
    {
      key: "type", label: t(lang, "col.type"), render: (r) => (
        <div className="flex flex-wrap gap-1">
          <StatusBadge status={r.tripType} />
          {r.rentalType && <StatusBadge status={r.rentalType} />}
        </div>
      ),
      value: (r) => `${r.tripType}${r.rentalType ? ` · ${r.rentalType}` : ""}`,
      hideOnMobile: true,
    },
    {
      key: "agreed", label: t(lang, "col.agreed"), className: "text-right",
      render: (r) => <span className="tabular-nums">{formatINR(tripTotal(r))}</span>,
      value: (r) => formatINR(tripTotal(r)),
    },
    {
      key: "paid", label: t(lang, "col.paid"), className: "text-right", hideOnMobile: true,
      render: (r) => <span className="tabular-nums text-emerald-600 dark:text-emerald-400">{formatINR(r.paidAmount ?? 0)}</span>,
      value: (r) => formatINR(r.paidAmount ?? 0),
    },
    {
      key: "paymentStatus", label: t(lang, "col.payment"),
      render: (r) => (
        <div className="min-w-[92px]">
          <StatusBadge status={r.paymentStatus} />
          <Progress
            value={tripPaidPct(r)}
            className="mt-1 h-1.5"
            aria-label={`Paid ${tripPaidPct(r)}% of ${formatINR(tripTotal(r))}`}
          />
          <p className="mt-0.5 text-[10px] tabular-nums text-muted-foreground">{tripPaidPct(r)}%</p>
        </div>
      ),
      value: (r) => r.paymentStatus,
    },
    { key: "status", label: t(lang, "col.status"), render: (r) => <StatusBadge status={r.status} />, value: (r) => r.status },
    {
      key: "actions", label: "", className: "w-14",
      render: (r) => (
        <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 sm:h-8 sm:w-8" aria-label={`Actions for ${r.vehicleName ?? "trip"}`}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel className="text-xs truncate">{r.vehicleName ?? "Trip"} → {r.clientName ?? "Client"}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setDetailId(r.id)}>
                <Eye className="h-3.5 w-3.5" />View details
              </DropdownMenuItem>
              {/* Edit only while the trip is still changeable — terminal trips are locked forever. */}
              {(r.status === "CONFIRMED" || r.status === "ACTIVE") && (
                <DropdownMenuItem onClick={() => setEditFor(r)}>
                  <Pencil className="h-3.5 w-3.5" />Edit
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
      value: () => "",
    },
  ];

  const detailTrip = detail;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t(lang, "page.trips")}
        subtitle={t(lang, "page.trips.sub")}
        actions={
          <Button size="sm" className="h-9 gap-1.5" onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden />New Rental
          </Button>
        }
      />

      <Card>
        <CardContent className="space-y-3 p-3 sm:p-4">
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SelectInput
              value={vehicleId}
              onChange={setVehicleId}
              options={[{ label: "All vehicles", value: "" }, ...(vehicles.data?.items ?? []).map((v) => ({ label: v.name, value: v.id }))]}
              placeholder="All vehicles"
            />
            <SelectInput
              value={clientId}
              onChange={setClientId}
              options={[{ label: "All clients", value: "" }, ...(clients.data?.items ?? []).map((c) => ({ label: c.name, value: c.id }))]}
              placeholder="All clients"
            />
            <SelectInput value={status} onChange={setStatus} options={STATUS_OPTIONS} placeholder="All statuses" />
            <SelectInput value={paymentStatus} onChange={setPaymentStatus} options={PAY_STATUS_OPTIONS} placeholder="All payment states" />
          </div>
          <div className="flex w-full flex-wrap items-center gap-2">
            <RangeSelector value={rangeKey === "custom" ? "custom" : rangeKey} onChange={setRangeKey} />
            <Button
              size="sm"
              variant={rangeKey === "custom" ? "default" : "outline"}
              className="h-8 shrink-0 rounded-full px-3 text-xs"
              onClick={() => setRangeKey(rangeKey === "custom" ? "month" : "custom")}
            >
              Custom
            </Button>
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
        <StatCard label="Revenue (filtered)" value={formatINR(trips.data?.totals?.revenue ?? 0)} icon={IndianRupee} tone="positive" />
        <StatCard label="Payment pending" value={formatINR(trips.data?.totals?.pending ?? 0)} icon={TimerOff} tone="warning" />
      </StatGrid>

      <Card>
        <CardContent className="p-3 sm:p-4">
          {trips.error ? (
            <ErrorState message={trips.error} onRetry={() => void trips.reload()} />
          ) : (
            <DataTable
              columns={columns}
              rows={items}
              rowKey={(r) => r.id}
              onRowClick={(r) => setDetailId(r.id)}
              exportName="trips"
              stickyFirstCol
              loading={trips.loading}
              emptyIcon={Route}
              emptyTitle="No trips match"
              emptyDescription="Adjust filters or create a new rental."
            />
          )}
        </CardContent>
      </Card>

      {/* Detail dialog */}
      <Dialog open={Boolean(detail)} onOpenChange={(v) => !v && setDetailId(null)}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
          {detailTrip && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  {detailTrip.vehicleName ?? "Vehicle"} <span className="text-muted-foreground">→</span> {detailTrip.clientName ?? "Client"}
                </DialogTitle>
                <DialogDescription className="flex flex-wrap items-center gap-1.5">
                  <StatusBadge status={detailTrip.status} />
                  <StatusBadge status={detailTrip.paymentStatus} />
                  <StatusBadge status={detailTrip.tripType} />
                  {detailTrip.rentalType && <StatusBadge status={detailTrip.rentalType} />}
                </DialogDescription>
              </DialogHeader>

              <div className="rounded-xl border bg-muted/30 px-3.5 py-2">
                <KV
                  label="Vehicle"
                  value={
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                      onClick={() => {
                        setDetailId(null);
                        navigate("vehicle-detail", { id: detailTrip.vehicleId });
                      }}
                    >
                      {detailTrip.vehicleReg ? `${detailTrip.vehicleName ?? ""} · ${detailTrip.vehicleReg}` : detailTrip.vehicleName ?? "—"}
                      <span className="text-[10px] text-muted-foreground">↗</span>
                    </button>
                  }
                />
                <KV
                  label="Client"
                  value={
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                      onClick={() => {
                        setDetailId(null);
                        navigate("clients", { id: detailTrip.clientId });
                      }}
                    >
                      {detailTrip.clientName ?? "—"}
                      <span className="text-[10px] text-muted-foreground">↗</span>
                    </button>
                  }
                />
                <KV label="Period" value={`${fmtDay(detailTrip.startAt)} → ${detailTrip.endAt ? fmtDay(detailTrip.endAt) : "ongoing"}`} />
                <KV label="Pickup" value={detailTrip.pickup || "—"} />
                <KV label="Destination" value={detailTrip.destination || "—"} />
                <KV label="Driver" value={detailTrip.driver || "—"} />
                <KV label="Fuel responsibility" value={detailTrip.fuelResponsibility === "OWNER" ? "Owner" : detailTrip.fuelResponsibility === "CLIENT" ? "Client" : "—"} />
                <KV label="Agreed amount" value={formatINR(detailTrip.agreedAmount)} />
                <KV label="Advance received" value={formatINR(detailTrip.advanceReceived ?? 0)} className="text-emerald-600 dark:text-emerald-400" />
                <KV label="Extra charges" value={formatINR(detailTrip.extraCharges ?? 0)} />
                <KV label="Final amount" value={formatINR(tripTotal(detailTrip))} />
                <KV label="Paid" value={formatINR(detailTrip.paidAmount ?? 0)} className="text-emerald-600 dark:text-emerald-400" />
                <KV
                  label="Outstanding"
                  value={formatINR(tripOutstanding(detailTrip))}
                  className={tripOutstanding(detailTrip) > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}
                />
                {detailTrip.notes && <KV label="Notes" value={<span className="text-xs font-normal">{detailTrip.notes}</span>} />}
                <KV label="Created by" value={detailTrip.createdByName ?? "—"} />
              </div>

              <Separator />

              <DialogFooter className="flex-col gap-2 sm:flex-row sm:flex-wrap">
                {(detailTrip.status === "ACTIVE" || detailTrip.status === "CONFIRMED") && (
                  <>
                    <Button variant="outline" className="min-h-10 gap-1.5" onClick={() => { setDetailId(null); setEndFor(detailTrip.id); }}>
                      <BadgeCheck className="h-4 w-4" aria-hidden />End Trip
                    </Button>
                    <Button
                      variant="outline" className="min-h-10 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                      onClick={() => { setDetailId(null); setCancelFor(detailTrip.id); }}
                    >
                      Cancel Trip
                    </Button>
                  </>
                )}
                {(detailTrip.status === "ACTIVE" || detailTrip.status === "CONFIRMED" || detailTrip.status === "COMPLETED") && (
                  <Button className="min-h-10" onClick={() => { setDetailId(null); setPayFor(detailTrip.id); }}>
                    Record Payment
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* End trip dialog */}
      <Dialog open={Boolean(endFor)} onOpenChange={(v) => !v && setEndFor(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>End trip</DialogTitle>
            <DialogDescription>Vehicle becomes available after completion (unless another trip is active).</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Ended at" required>
              <Input type="datetime-local" value={endForm.endAt} onChange={(e) => setEndForm((f) => ({ ...f, endAt: e.target.value }))} className="h-10" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Final amount (₹)" required>
                <MoneyInput value={endForm.finalAmount} onChange={(v) => setEndForm((f) => ({ ...f, finalAmount: v }))} className="h-10" />
              </Field>
              <Field label="Extra charges (₹)">
                <MoneyInput value={endForm.extraCharges} onChange={(v) => setEndForm((f) => ({ ...f, extraCharges: v }))} min={0} className="h-10" />
              </Field>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="min-h-10 flex-1 sm:flex-none" onClick={() => setEndFor(null)}>Back</Button>
            <Button className="min-h-10 flex-1 sm:flex-none" onClick={() => void submitEnd()} disabled={saving}>{saving ? "Saving…" : "Complete trip"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record payment dialog */}
      <Dialog open={Boolean(payFor)} onOpenChange={(v) => !v && setPayFor(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Record trip payment</DialogTitle>
            <DialogDescription>Amount is added to the trip&apos;s paid total; payment status updates automatically.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Amount (₹)" required>
              <MoneyInput value={payForm.amount} onChange={(v) => setPayForm((f) => ({ ...f, amount: v }))} min={1} className="h-10" />
            </Field>
            <Field label="Method">
              <SelectInput value={payForm.method} onChange={(v) => setPayForm((f) => ({ ...f, method: v }))} options={METHOD_OPTIONS} />
            </Field>
          </div>
          <ConfirmAmount amount={parseAmount(payForm.amount)} subject={paySubject} onSubmit={() => void submitPayment()}>
            {({ confirm, armed }) => (
              <DialogFooter className="gap-2">
                <Button variant="outline" className="min-h-10 flex-1 sm:flex-none" onClick={() => setPayFor(null)}>Cancel</Button>
                <Button className="min-h-10 flex-1 sm:flex-none" onClick={confirm} disabled={saving || armed}>
                  {saving ? "Saving…" : armed ? "Confirm below" : "Record payment"}
                </Button>
              </DialogFooter>
            )}
          </ConfirmAmount>
        </DialogContent>
      </Dialog>

      {/* Cancel trip confirm */}
      <AlertDialog open={Boolean(cancelFor)} onOpenChange={(v) => !v && setCancelFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this trip?</AlertDialogTitle>
            <AlertDialogDescription>The vehicle will be released and the trip marked CANCELLED. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-10">Keep trip</AlertDialogCancel>
            <AlertDialogAction
              className={cn("min-h-10 bg-red-600 text-white hover:bg-red-700")}
              onClick={(e) => { e.preventDefault(); void cancelTrip(); }}
            >
              {saving ? "Cancelling…" : "Cancel trip"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <TripFormDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        trip={null}
        vehicles={vehicles.data?.items ?? []}
        clients={clients.data?.items ?? []}
        onDone={() => void trips.reload()}
      />

      {/* Edit trip — only openable for CONFIRMED/ACTIVE trips (row actions menu) */}
      <TripFormDialog
        open={Boolean(editFor)}
        onOpenChange={(v) => !v && setEditFor(null)}
        trip={editFor}
        vehicles={vehicles.data?.items ?? []}
        clients={clients.data?.items ?? []}
        onDone={() => void trips.reload()}
      />

      {/* Mobile FAB — alternate trigger for New Rental */}
      <ViewFab icon={Plus} label="New trip" onClick={() => setNewOpen(true)} />
    </div>
  );
}
