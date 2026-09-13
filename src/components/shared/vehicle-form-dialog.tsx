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
import { Field, MoneyInput, useMutation } from "@/components/views/_shared";
import type { VehicleRec } from "@/components/views/_shared";

/**
 * THE single vehicle add/edit dialog — used by BOTH the vehicles list view and
 * the vehicle detail view, so edit always has 1:1 parity with add (same fields,
 * same validation, same payload). Edit mode never hides fields.
 * Status is intentionally NOT here — it stays managed by the detail view's status select.
 */
export function VehicleFormDialog({ open, onOpenChange, vehicle, onDone }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  vehicle: VehicleRec | null;
  onDone: () => void;
}) {
  const editing = Boolean(vehicle);
  const blank = {
    registrationNumber: "", name: "", make: "", model: "", variant: "", year: "",
    purchaseDate: "", purchasePrice: "", loanAmount: "", monthlyEmi: "", emiStartDate: "", emiCount: "",
    insuranceCompany: "", insuranceNumber: "", insuranceExpiry: "", fitnessExpiry: "",
    permitInfo: "", notes: "",
  };
  const [form, setForm] = useState(blank);
  const { mutate, saving } = useMutation();

  // Reset form each time the dialog opens (render-time state adjustment).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setForm(vehicle ? {
        registrationNumber: vehicle.registrationNumber ?? "",
        name: vehicle.name ?? "",
        make: vehicle.make ?? "",
        model: vehicle.model ?? "",
        variant: vehicle.variant ?? "",
        year: vehicle.year ? String(vehicle.year) : "",
        purchaseDate: vehicle.purchaseDate?.slice(0, 10) ?? "",
        purchasePrice: vehicle.purchasePrice ? String(vehicle.purchasePrice) : "",
        loanAmount: vehicle.loanAmount ? String(vehicle.loanAmount) : "",
        monthlyEmi: vehicle.monthlyEmi ? String(vehicle.monthlyEmi) : "",
        emiStartDate: vehicle.emiStartDate?.slice(0, 10) ?? "",
        emiCount: vehicle.emiCount ? String(vehicle.emiCount) : "",
        insuranceCompany: vehicle.insuranceCompany ?? "",
        insuranceNumber: vehicle.insuranceNumber ?? "",
        insuranceExpiry: vehicle.insuranceExpiry?.slice(0, 10) ?? "",
        fitnessExpiry: vehicle.fitnessExpiry?.slice(0, 10) ?? "",
        permitInfo: vehicle.permitInfo ?? "",
        notes: vehicle.notes ?? "",
      } : blank);
    }
  }

  // Event-compatible setter: works directly as Input/Textarea onChange.
  const set = (k: keyof typeof blank) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    if (!form.registrationNumber.trim()) { toast.error("Registration number is required"); return; }
    if (!form.name.trim()) { toast.error("Vehicle name is required"); return; }
    // Same body shape for add & edit; empty optionals go out as null so an edit
    // can also CLEAR a field (the PUT route maps null → cleared).
    const body = {
      registrationNumber: form.registrationNumber.trim().toUpperCase(),
      name: form.name.trim(),
      make: form.make || null,
      model: form.model || null,
      variant: form.variant || null,
      year: form.year ? Number(form.year) : null,
      purchaseDate: form.purchaseDate || null,
      purchasePrice: form.purchasePrice ? parseAmount(form.purchasePrice) : null,
      loanAmount: form.loanAmount ? parseAmount(form.loanAmount) : null,
      monthlyEmi: form.monthlyEmi ? parseAmount(form.monthlyEmi) : null,
      emiStartDate: form.emiStartDate || null,
      emiCount: form.emiCount ? Number(form.emiCount) : null,
      insuranceCompany: form.insuranceCompany || null,
      insuranceNumber: form.insuranceNumber || null,
      insuranceExpiry: form.insuranceExpiry || null,
      fitnessExpiry: form.fitnessExpiry || null,
      permitInfo: form.permitInfo || null,
      notes: form.notes || null,
    };
    const res = editing
      ? await mutate(
          () => api.put(`/api/vehicles/${vehicle!.id}`, body),
          "Vehicle updated — changes apply from now; generated EMI rows keep their recorded amounts",
        )
      : await mutate(() => api.post("/api/vehicles", body), "Vehicle added");
    if (res.ok) { onOpenChange(false); onDone(); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Vehicle" : "Add Vehicle"}</DialogTitle>
          <DialogDescription>
            {editing ? `Updating ${vehicle?.registrationNumber}` : "Vehicle code (VEH-xxx) is auto-generated. Loan details drive the EMI schedule."}
          </DialogDescription>
        </DialogHeader>
        {editing && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-[11px] leading-relaxed text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300" role="note">
            <span className="font-semibold">Historical integrity:</span> changes apply from the moment you save. EMI rows already generated keep their recorded amounts.
          </div>
        )}
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
          <Field label="Purchase price (₹)"><MoneyInput value={form.purchasePrice} onChange={(v) => setForm((f) => ({ ...f, purchasePrice: v }))} className="h-10" /></Field>

          <div className="sm:col-span-2">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Loan &amp; EMI</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Loan amount (₹)"><MoneyInput value={form.loanAmount} onChange={(v) => setForm((f) => ({ ...f, loanAmount: v }))} className="h-10" /></Field>
              <Field label="Monthly EMI (₹)"><MoneyInput value={form.monthlyEmi} onChange={(v) => setForm((f) => ({ ...f, monthlyEmi: v }))} className="h-10" /></Field>
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
          <Button className="min-h-10 flex-1 sm:flex-none" onClick={submit} disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Add vehicle"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
