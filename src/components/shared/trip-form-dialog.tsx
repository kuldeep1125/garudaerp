"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { parseAmount } from "@/lib/money";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Field, MoneyInput, SelectInput,
  type ClientRec, type Option, type TripRec, type VehicleRec, useMutation,
} from "@/components/views/_shared";

const TRIP_TYPE_OPTIONS: Option[] = [
  { label: "Rental", value: "RENTAL" },
  { label: "Trip", value: "TRIP" },
];

const RENTAL_TYPE_OPTIONS: Option[] = ["DAILY", "WEEKLY", "MONTHLY", "OUTSTATION", "LOCAL"]
  .map((t) => ({ label: t.charAt(0) + t.slice(1).toLowerCase(), value: t }));

const FUEL_OPTIONS: Option[] = [
  { label: "Owner pays fuel", value: "OWNER" },
  { label: "Client pays fuel", value: "CLIENT" },
];

function nowLocalValue(): string {
  return new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

/** ISO timestamp → value for <input type="datetime-local"> in the local timezone. */
function toLocalInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

interface TripFormState {
  vehicleId: string; clientId: string; startAt: string; endAt: string;
  tripType: string; rentalType: string; pickup: string; destination: string;
  driver: string; fuelResponsibility: string; agreedAmount: string; advanceReceived: string;
  finalAmount: string; extraCharges: string; notes: string;
}

const EMPTY_FORM: TripFormState = {
  vehicleId: "", clientId: "", startAt: "", endAt: "", tripType: "RENTAL",
  rentalType: "DAILY", pickup: "", destination: "", driver: "", fuelResponsibility: "CLIENT",
  agreedAmount: "", advanceReceived: "", finalAmount: "", extraCharges: "", notes: "",
};

/**
 * THE single rental/trip add+edit dialog — add mode posts to /api/trips with the
 * original field set; edit mode sends only the fields the trip's status still
 * allows changing (booking fields while CONFIRMED, billing fields while
 * CONFIRMED/ACTIVE, never anything on terminal trips). The API re-guards
 * everything server-side regardless.
 */
export function TripFormDialog({ open, onOpenChange, trip, vehicles, clients, onDone }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  trip: TripRec | null;
  vehicles: VehicleRec[];
  clients: ClientRec[];
  onDone: () => void;
}) {
  const editing = Boolean(trip);
  const terminal = trip?.status === "COMPLETED" || trip?.status === "CANCELLED";
  const confirmed = trip?.status === "CONFIRMED";
  const active = trip?.status === "ACTIVE";
  const canEditBooking = editing && confirmed;                    // vehicle / client / startAt / agreedAmount
  const canEditBilling = editing && (confirmed || active);        // endAt / finalAmount / extraCharges
  const canEditDetails = editing && !terminal;                    // pickup / destination / driver / fuel / notes

  const [form, setForm] = useState<TripFormState>(EMPTY_FORM);
  const { mutate, saving } = useMutation();

  // Reset form each time the dialog opens (render-time state adjustment).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setForm(trip ? {
        vehicleId: trip.vehicleId ?? "",
        clientId: trip.clientId ?? "",
        startAt: toLocalInput(trip.startAt),
        endAt: toLocalInput(trip.endAt),
        tripType: trip.tripType ?? "RENTAL",
        rentalType: trip.rentalType ?? "DAILY",
        pickup: trip.pickup ?? "",
        destination: trip.destination ?? "",
        driver: trip.driver ?? "",
        fuelResponsibility: trip.fuelResponsibility ?? "",
        agreedAmount: String(trip.agreedAmount ?? ""),
        advanceReceived: String(trip.advanceReceived ?? "0"),
        finalAmount: trip.finalAmount != null ? String(trip.finalAmount) : "",
        extraCharges: String(trip.extraCharges ?? "0"),
        notes: trip.notes ?? "",
      } : {
        ...EMPTY_FORM,
        startAt: nowLocalValue(),
      });
    }
  }

  const set = (k: keyof TripFormState) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (editing && trip) {
      if (terminal) { toast.error("Completed/cancelled trips are locked — history cannot be rewritten"); return; }
      const body: Record<string, unknown> = {};
      if (canEditDetails) {
        body.pickup = form.pickup || undefined;
        body.destination = form.destination || undefined;
        body.driver = form.driver || undefined;
        body.fuelResponsibility = form.fuelResponsibility || undefined;
        body.notes = form.notes || undefined;
      }
      if (canEditBooking) {
        if (!form.vehicleId) { toast.error("Select a vehicle"); return; }
        if (!form.clientId) { toast.error("Select a client"); return; }
        if (!form.startAt) { toast.error("Start date & time is required"); return; }
        const amt = parseAmount(form.agreedAmount);
        if (amt <= 0) { toast.error("Enter the agreed amount"); return; }
        body.vehicleId = form.vehicleId;
        body.clientId = form.clientId;
        body.startAt = new Date(form.startAt).toISOString();
        body.agreedAmount = amt;
      }
      if (canEditBilling) {
        if (form.endAt && form.startAt && new Date(form.endAt).getTime() <= new Date(form.startAt).getTime()) {
          toast.error("End date & time must be after the start"); return;
        }
        body.endAt = form.endAt ? new Date(form.endAt).toISOString() : null;
        body.finalAmount = form.finalAmount ? parseAmount(form.finalAmount) : null;
        body.extraCharges = form.extraCharges ? parseAmount(form.extraCharges) : 0;
      }
      const res = await mutate(
        () => api.put(`/api/trips/${trip.id}`, body),
        "Trip updated — past payments and history stay untouched"
      );
      if (res.ok) { onOpenChange(false); onDone(); }
      return;
    }

    // Add path — identical to the original New Rental / Trip dialog.
    if (!form.vehicleId) { toast.error("Select a vehicle"); return; }
    if (!form.clientId) { toast.error("Select a client"); return; }
    if (!form.startAt) { toast.error("Start date & time is required"); return; }
    const amt = parseAmount(form.agreedAmount);
    if (amt <= 0) { toast.error("Enter the agreed amount"); return; }
    if (form.endAt && form.startAt && new Date(form.endAt).getTime() <= new Date(form.startAt).getTime()) {
      toast.error("End date & time must be after the start"); return;
    }
    const res = await mutate(
      () => api.post("/api/trips", {
        vehicleId: form.vehicleId,
        clientId: form.clientId,
        startAt: new Date(form.startAt).toISOString(),
        endAt: form.endAt ? new Date(form.endAt).toISOString() : undefined,
        tripType: form.tripType,
        rentalType: form.rentalType || undefined,
        pickup: form.pickup || undefined,
        destination: form.destination || undefined,
        driver: form.driver || undefined,
        fuelResponsibility: form.fuelResponsibility || undefined,
        agreedAmount: amt,
        advanceReceived: form.advanceReceived ? parseAmount(form.advanceReceived) : undefined,
        notes: form.notes || undefined,
      }),
      "Rental created — vehicle marked as engaged",
      (data) => ({ module: "TRIP", recordId: (data as { id: string }).id, onUndo: onDone })
    );
    if (res.ok) { onOpenChange(false); onDone(); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Rental / Trip" : "New Rental / Trip"}</DialogTitle>
          <DialogDescription>
            {editing
              ? `Updating the ${trip?.status.toLowerCase() ?? ""} booking — overlapping vehicle bookings are blocked automatically.`
              : "Overlapping bookings for the same vehicle are blocked automatically."}
          </DialogDescription>
        </DialogHeader>
        {editing && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-[11px] leading-relaxed text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300" role="note">
            <span className="font-semibold">Historical integrity:</span> vehicle, client, start time and agreed amount are editable only while the booking is CONFIRMED; final amount / extra charges until it COMPLETES. Recorded payments and completed/cancelled trips can never be rewritten.
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Vehicle"
            required
            className="sm:col-span-2"
            hint={editing && !canEditBooking ? "Locked once the trip started" : undefined}
          >
            <SelectInput
              value={form.vehicleId}
              onChange={set("vehicleId")}
              placeholder="Select vehicle…"
              options={vehicles.map((v) => ({ label: `${v.name} · ${v.status}`, value: v.id }))}
              disabled={editing && !canEditBooking}
            />
          </Field>
          <Field
            label="Client"
            required
            className="sm:col-span-2"
            hint={editing && !canEditBooking ? "Locked once the trip started" : undefined}
          >
            <SelectInput
              value={form.clientId}
              onChange={set("clientId")}
              placeholder="Select client…"
              options={clients.map((c) => ({ label: c.company ? `${c.name} (${c.company})` : c.name, value: c.id }))}
              disabled={editing && !canEditBooking}
            />
          </Field>
          <Field
            label="Start at"
            required
            hint={editing && !canEditBooking ? "Locked once the trip started" : undefined}
          >
            <Input
              type="datetime-local"
              value={form.startAt}
              onChange={(e) => set("startAt")(e.target.value)}
              className="h-10"
              disabled={editing && !canEditBooking}
            />
          </Field>
          <Field
            label="End at"
            hint={editing
              ? (canEditBilling ? "Leave empty for an open-ended rental" : "Locked on terminal trips")
              : "Leave empty for an open-ended rental"}
          >
            <Input
              type="datetime-local"
              value={form.endAt}
              onChange={(e) => set("endAt")(e.target.value)}
              className="h-10"
              disabled={editing && !canEditBilling}
            />
          </Field>
          <Field label="Type" required hint={editing ? "Trip type cannot change after creation" : undefined}>
            <SelectInput value={form.tripType} onChange={set("tripType")} options={TRIP_TYPE_OPTIONS} disabled={editing} />
          </Field>
          <Field label="Rental type" hint={editing ? "Rental type cannot change after creation" : undefined}>
            <SelectInput value={form.rentalType} onChange={set("rentalType")} options={RENTAL_TYPE_OPTIONS} disabled={editing} />
          </Field>
          <Field label="Pickup">
            <Input value={form.pickup} onChange={(e) => set("pickup")(e.target.value)} className="h-10" placeholder="Pickup point" disabled={editing && !canEditDetails} />
          </Field>
          <Field label="Destination">
            <Input value={form.destination} onChange={(e) => set("destination")(e.target.value)} className="h-10" placeholder="Drop point" disabled={editing && !canEditDetails} />
          </Field>
          <Field label="Driver">
            <Input value={form.driver} onChange={(e) => set("driver")(e.target.value)} className="h-10" placeholder="Driver name" disabled={editing && !canEditDetails} />
          </Field>
          <Field label="Fuel responsibility">
            <SelectInput
              value={form.fuelResponsibility}
              onChange={set("fuelResponsibility")}
              options={FUEL_OPTIONS}
              placeholder={editing ? "Not set" : "Select…"}
              disabled={editing && !canEditDetails}
            />
          </Field>
          <Field
            label="Agreed amount (₹)"
            required
            hint={editing && !canEditBooking
              ? "Locked once the trip started — correct billing via final amount / extra charges"
              : undefined}
          >
            <MoneyInput
              value={form.agreedAmount}
              onChange={set("agreedAmount")}
              min={1}
              className="h-10"
              disabled={editing && !canEditBooking}
            />
          </Field>
          <Field
            label="Advance received (₹)"
            hint={editing ? "Read-only — use Record Payment to add collections" : undefined}
          >
            <MoneyInput
              value={form.advanceReceived}
              onChange={set("advanceReceived")}
              min={0}
              className="h-10"
              disabled={editing}
            />
          </Field>
          {editing && (
            <>
              <Field label="Final amount (₹)" hint="Optional — overrides agreed amount + extra charges when set. Payment status recomputes automatically.">
                <MoneyInput
                  value={form.finalAmount}
                  onChange={set("finalAmount")}
                  min={0}
                  className="h-10"
                  disabled={!canEditBilling}
                />
              </Field>
              <Field label="Extra charges (₹)">
                <MoneyInput
                  value={form.extraCharges}
                  onChange={set("extraCharges")}
                  min={0}
                  className="h-10"
                  disabled={!canEditBilling}
                />
              </Field>
            </>
          )}
          <Field label="Notes" className="sm:col-span-2">
            <Textarea value={form.notes} onChange={(e) => set("notes")(e.target.value)} rows={2} placeholder="Optional instructions" disabled={editing && !canEditDetails} />
          </Field>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="min-h-10 flex-1 sm:flex-none" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="min-h-10 flex-1 sm:flex-none" onClick={submit} disabled={saving || terminal}>
            {saving ? "Saving…" : terminal ? "Locked" : editing ? "Save changes" : "Create rental"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
