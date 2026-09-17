"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { parseAmount, formatINR } from "@/lib/money"; // [FIXED] import formatINR
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Field, MoneyInput, Option, SelectInput, todayStr, toISTDateInput, useMutation } from "@/components/views/_shared"; // [ADDED] toISTDateInput
import type { EmployeeRec } from "@/components/views/_shared";

/**
 * THE single employee add/edit dialog — used by BOTH the employees list view and
 * the employee detail view, so edit always has 1:1 parity with add (same fields,
 * same validation, same payload). Edit mode never hides fields.
 */
export function EmployeeFormDialog({ open, onOpenChange, employee, onDone }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  employee: EmployeeRec | null;
  onDone: () => void;
}) {
  const editing = Boolean(employee);
  const [form, setForm] = useState({
    fullName: "", mobile: "", whatsapp: "", designation: "", skills: "", standardRate: "",
    joiningDate: todayStr(), gender: "", city: "", upiId: "", bankDetails: "", notes: "",
    employmentType: "NON_SALARIED", monthlySalary: "", overtimeThreshold: "30", overtimeRate: "",
    onBusinessRent: false, rentAmount: "", rentMode: "MONTH",
    hasContractor: false, contractorName: "", contractorRateCut: "",
  });
  const { mutate, saving } = useMutation();

  // Reset form each time the dialog opens (render-time state adjustment).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setForm({
        fullName: employee?.fullName ?? "",
        mobile: employee?.mobile ?? "",
        whatsapp: employee?.whatsapp ?? "",
        designation: employee?.designation ?? "",
        skills: employee?.skills ?? "",
        standardRate: employee?.standardRate ? String(employee.standardRate) : "",
        joiningDate: toISTDateInput(employee?.joiningDate) || todayStr(), // [FIXED] use toISTDateInput instead of slice(0, 10) to prevent UTC date rollback
        gender: employee?.gender ?? "",
        city: employee?.city ?? "",
        upiId: employee?.upiId ?? "",
        bankDetails: employee?.bankDetails ?? "",
        notes: employee?.notes ?? "",
        employmentType: employee?.employmentType === "SALARIED" ? "SALARIED" : "NON_SALARIED",
        monthlySalary: employee?.monthlySalary ? String(employee.monthlySalary) : "",
        overtimeThreshold: employee?.overtimeThreshold != null ? String(employee.overtimeThreshold) : "30",
        overtimeRate: employee?.overtimeRate ? String(employee.overtimeRate) : "",
        onBusinessRent: Boolean(employee?.onBusinessRent),
        rentAmount: employee?.rentAmount ? String(employee.rentAmount) : "",
        rentMode: employee?.rentMode === "DAY" ? "DAY" : "MONTH",
        hasContractor: Boolean(employee?.hasContractor),
        contractorName: employee?.contractorName ?? "",
        contractorRateCut: employee?.contractorRateCut ? String(employee.contractorRateCut) : "",
      });
    }
  }

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const salaried = form.employmentType === "SALARIED";

  const submit = async () => {
    if (!form.fullName.trim()) { toast.error("Full name is required"); return; }
    const rate = form.standardRate ? parseAmount(form.standardRate) : 0;
    const salary = form.monthlySalary ? parseAmount(form.monthlySalary) : 0;
    if (salaried && salary <= 0) { toast.error("Set the monthly salary for a salaried employee"); return; }
    if (!salaried && rate <= 0) { toast.error("Set the payout rate (₹ per shift)"); return; }
    if (form.onBusinessRent && parseAmount(form.rentAmount || "0") <= 0) { toast.error("Set the rent amount for business accommodation"); return; }
    if (form.hasContractor && !form.contractorName.trim()) { toast.error("Enter the contractor's name"); return; }
    const body = {
      fullName: form.fullName.trim(),
      mobile: form.mobile || undefined,
      whatsapp: form.whatsapp || undefined,
      designation: form.designation || undefined,
      skills: form.skills || undefined,
      standardRate: salaried ? 0 : rate,
      joiningDate: form.joiningDate || undefined,
      gender: form.gender || undefined,
      city: form.city || undefined,
      upiId: form.upiId || undefined,
      bankDetails: form.bankDetails || undefined,
      notes: form.notes || undefined,
      employmentType: form.employmentType,
      monthlySalary: salaried ? salary : 0,
      overtimeThreshold: salaried ? (form.overtimeThreshold ? Math.max(0, Math.floor(Number(form.overtimeThreshold) || 30)) : 30) : 30,
      overtimeRate: salaried && form.overtimeRate ? parseAmount(form.overtimeRate) : 0,
      onBusinessRent: form.onBusinessRent,
      rentAmount: form.onBusinessRent ? parseAmount(form.rentAmount || "0") : 0,
      rentMode: form.rentMode,
      hasContractor: form.hasContractor,
      contractorName: form.hasContractor ? form.contractorName.trim() : "",
      contractorRateCut: form.hasContractor && form.contractorRateCut ? parseAmount(form.contractorRateCut) : 0,
    };
    const res = editing
      ? await mutate(() => api.put(`/api/employees/${employee!.id}`, body), "Employee updated — changes apply from today; past reports & settled months stay unchanged")
      : await mutate(() => api.post("/api/employees", body), "Employee added");
    if (res.ok) { onOpenChange(false); onDone(); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Employee" : "Add Employee"}</DialogTitle>
          <DialogDescription>{editing ? `Updating ${employee?.fullName}` : "Employee code is auto-generated."}</DialogDescription>
        </DialogHeader>
        {editing && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-[11px] leading-relaxed text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300" role="note">
            <span className="font-semibold">Historical integrity:</span> changes apply from the moment you save. Past deployments, past reports and finalized settlements keep their original numbers — only future periods use the new terms.
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name" required className="sm:col-span-2">
            <Input value={form.fullName} onChange={(e) => set("fullName")(e.target.value)} className="h-10" placeholder="e.g. Rahul Sharma" />
          </Field>

          {/* --- 1 · Employment type: salaried vs per-shift --- */}
          <Field
            label="Employment type"
            required
            className="sm:col-span-2"
            hint={salaried
              ? "Salaried: fixed monthly pay. Deployments record attendance; cost accrues daily as salary — no per-shift payout."
              : "Per-shift: the employee is paid their rate for every deployed shift. Full shift = 2 units."}
          >
            <div className="flex rounded-lg border bg-muted/50 p-1" role="group" aria-label="Employment type">
              {([
                { value: "NON_SALARIED", label: "Non-salaried (per shift)" },
                { value: "SALARIED", label: "Salaried (monthly)" },
              ] as const).map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className={cn(
                    "min-h-9 flex-1 rounded-md px-2 text-xs font-medium transition-colors",
                    form.employmentType === o.value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                  aria-pressed={form.employmentType === o.value}
                  onClick={() => set("employmentType")(o.value)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </Field>

          {salaried ? (
            <>
              <Field label="Monthly salary (₹)" required>
                <MoneyInput value={form.monthlySalary} onChange={set("monthlySalary")} className="h-10" placeholder="e.g. 15000" />
              </Field>
              <Field label="Overtime threshold (deployments/mo)" hint="After this many deployments in a month, overtime pay kicks in.">
                <Input type="number" inputMode="numeric" min={0} step={1} value={form.overtimeThreshold} onChange={(e) => set("overtimeThreshold")(e.target.value)} className="h-10" placeholder="30" />
              </Field>
              <Field label="Overtime pay (₹ per extra deployment)" className="sm:col-span-2" hint="Paid for every deployment beyond the threshold in the same month. Example: threshold 30 + ₹150 → deployment 31 pays ₹150 extra.">
                <MoneyInput value={form.overtimeRate} onChange={set("overtimeRate")} className="h-10" placeholder="e.g. 150" />
              </Field>
            </>
          ) : (
            <Field
              label="Payout rate (₹/shift)"
              required
              hint={editing
                ? "Applies to deployments recorded from now on — past records keep their original rate."
                : "Paid to the employee per shift. Full shift = 2 units."}
            >
              <MoneyInput value={form.standardRate} onChange={set("standardRate")} className="h-10" placeholder="e.g. 500" />
            </Field>
          )}

          {/* --- 2 · Business accommodation rent --- */}
          <div className="rounded-xl border border-dashed p-3 sm:col-span-2">
            <label className="flex cursor-pointer items-center gap-2.5">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--primary)]"
                checked={form.onBusinessRent}
                onChange={(e) => setForm((f) => ({ ...f, onBusinessRent: e.target.checked }))}
              />
              <span className="text-sm font-medium">Lives in business flat/home (pays rent to the business)</span>
            </label>
            {form.onBusinessRent && (
              <>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label="Rent amount (₹)" required>
                    <MoneyInput value={form.rentAmount} onChange={set("rentAmount")} className="h-10" placeholder="e.g. 3000" />
                  </Field>
                  <Field label="Rent mode" hint="Auto-deducted from salary at monthly settlement.">
                    <div className="flex rounded-lg border bg-muted/50 p-1" role="group" aria-label="Rent mode">
                      {([
                        { value: "MONTH", label: "Per month" },
                        { value: "DAY", label: "Per day" },
                      ] as const).map((o) => (
                        <button
                          key={o.value}
                          type="button"
                          className={cn(
                            "min-h-9 flex-1 rounded-md px-2 text-xs font-medium transition-colors",
                            form.rentMode === o.value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                          )}
                          aria-pressed={form.rentMode === o.value}
                          onClick={() => set("rentMode")(o.value)}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </Field>
                </div>
                {salaried && (
                  <div className="mt-3 rounded-lg border border-teal-200 bg-teal-50/80 p-2.5 text-xs text-teal-950 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-200">
                    <p className="font-semibold text-teal-900 dark:text-teal-100">
                      Salary deduction preview:
                    </p>
                    <p className="mt-0.5">
                      Net base salary: <span className="font-bold tabular-nums">{formatINR(Math.max(0, parseAmount(form.monthlySalary || "0") - parseAmount(form.rentAmount || "0")))}</span> / month (Gross {formatINR(parseAmount(form.monthlySalary || "0"))} − Rent {formatINR(parseAmount(form.rentAmount || "0"))}).
                    </p>
                    <p className="mt-0.5 text-[11px] text-teal-800/80 dark:text-teal-300/80">
                      Rent will be deducted directly from salary when monthly settlements are generated.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* --- 3 · Contractor --- */}
          <div className="rounded-xl border border-dashed p-3 sm:col-span-2">
            <label className="flex cursor-pointer items-center gap-2.5">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--primary)]"
                checked={form.hasContractor}
                onChange={(e) => setForm((f) => ({ ...f, hasContractor: e.target.checked }))}
              />
              <span className="text-sm font-medium">There is a contractor between the business and this employee</span>
            </label>
            {form.hasContractor && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Contractor name" required>
                  <Input value={form.contractorName} onChange={(e) => set("contractorName")(e.target.value)} className="h-10" placeholder="e.g. Ramesh Contractors" />
                </Field>
                <Field
                  label="Contractor cut (₹ per shift)"
                  hint="Taken from this employee's payout per shift and paid to the contractor — shown on every deployment, in reports and on the dashboard. Applies to deployments recorded from now on."
                >
                  <MoneyInput value={form.contractorRateCut} onChange={set("contractorRateCut")} className="h-10" placeholder="e.g. 50" />
                </Field>
              </div>
            )}
          </div>

          <Field label="Mobile"><Input value={form.mobile} onChange={(e) => set("mobile")(e.target.value)} inputMode="tel" className="h-10" /></Field>
          <Field label="WhatsApp"><Input value={form.whatsapp} onChange={(e) => set("whatsapp")(e.target.value)} inputMode="tel" className="h-10" /></Field>
          <Field label="Designation"><Input value={form.designation} onChange={(e) => set("designation")(e.target.value)} placeholder="Waiter, Cook…" className="h-10" /></Field>
          <Field
            label="Joining date"
            hint={editing ? "Locked once the employee has deployments/advances/settlements — changing it would rewrite historical payroll." : undefined}
          >
            <Input type="date" value={form.joiningDate} onChange={(e) => set("joiningDate")(e.target.value)} className="h-10" />
          </Field>
          <Field label="Gender">
            <SelectInput
              value={form.gender}
              onChange={set("gender")}
              placeholder="Select…"
              options={[{ label: "Male", value: "MALE" }, { label: "Female", value: "FEMALE" }, { label: "Other", value: "OTHER" }]}
            />
          </Field>
          <Field label="City"><Input value={form.city} onChange={(e) => set("city")(e.target.value)} className="h-10" /></Field>
          <Field label="Skills"><Input value={form.skills} onChange={(e) => set("skills")(e.target.value)} placeholder="Comma separated" className="h-10" /></Field>
          <Field label="UPI ID"><Input value={form.upiId} onChange={(e) => set("upiId")(e.target.value)} className="h-10" /></Field>
          <Field label="Bank details" className="sm:col-span-2"><Input value={form.bankDetails} onChange={(e) => set("bankDetails")(e.target.value)} className="h-10" placeholder="A/C name · bank · A/C no · IFSC" /></Field>
          <Field label="Notes" className="sm:col-span-2"><Textarea value={form.notes} onChange={(e) => set("notes")(e.target.value)} rows={2} /></Field>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="min-h-10 flex-1 sm:flex-none" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="min-h-10 flex-1 sm:flex-none" onClick={submit} disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Add employee"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
