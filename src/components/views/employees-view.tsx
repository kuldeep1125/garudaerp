"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, api, qs } from "@/lib/api-client";
import { formatINR, parseAmount } from "@/lib/money";
import type { ViewProps } from "@/components/view-types";
import { PageHeader } from "@/components/shared/page-header";
import { ViewFab } from "@/components/shared/view-fab";
import { DataTable, type Column } from "@/components/shared/data-table";
import { SearchInput } from "@/components/shared/filters";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/shared/status-badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useLang, t } from "@/lib/i18n";
import {
  UserRound, MoreHorizontal, Pencil, Eye, HandCoins, UserPlus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  EmployeePayBadges, EmployeeRec, Field, GiveAdvanceDialog, ListResp, MoneyInput, Option, SelectInput, errMessage, todayStr, useMutation,
} from "./_shared";

const STATUS_OPTIONS: Option[] = [
  { label: "All statuses", value: "" },
  { label: "Active", value: "ACTIVE" },
  { label: "Inactive", value: "INACTIVE" },
];

const TYPE_OPTIONS: Option[] = [
  { label: "All types", value: "" },
  { label: "Salaried (monthly)", value: "SALARIED" },
  { label: "Non-salaried (per shift)", value: "NON_SALARIED" },
];

const STATUS_VALUES = ["ACTIVE", "INACTIVE"];

function EmployeeFormDialog({ open, onOpenChange, employee, onDone }: {
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
        joiningDate: employee?.joiningDate?.slice(0, 10) ?? todayStr(),
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
      ? await mutate(() => api.put(`/api/employees/${employee!.id}`, body), "Employee updated — new rates apply to future deployments only")
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
                ? "Applies to future deployments only — past records keep their original rate."
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
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Rent amount (₹)" required>
                  <MoneyInput value={form.rentAmount} onChange={set("rentAmount")} className="h-10" placeholder="e.g. 3000" />
                </Field>
                <Field label="Rent mode" hint="Counted as business income in reports.">
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
                  hint="Taken from this employee's payout per shift and paid to the contractor — shown on every deployment, in reports and on the dashboard."
                >
                  <MoneyInput value={form.contractorRateCut} onChange={set("contractorRateCut")} className="h-10" placeholder="e.g. 50" />
                </Field>
              </div>
            )}
          </div>

          <Field label="Mobile"><Input value={form.mobile} onChange={(e) => set("mobile")(e.target.value)} inputMode="tel" className="h-10" /></Field>
          <Field label="WhatsApp"><Input value={form.whatsapp} onChange={(e) => set("whatsapp")(e.target.value)} inputMode="tel" className="h-10" /></Field>
          <Field label="Designation"><Input value={form.designation} onChange={(e) => set("designation")(e.target.value)} placeholder="Waiter, Cook…" className="h-10" /></Field>
          <Field label="Joining date"><Input type="date" value={form.joiningDate} onChange={(e) => set("joiningDate")(e.target.value)} className="h-10" /></Field>
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

export default function EmployeesView({ navigate }: ViewProps) {
  const { lang } = useLang();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [employmentType, setEmploymentType] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EmployeeRec | null>(null);
  const [advanceTarget, setAdvanceTarget] = useState<EmployeeRec | null>(null);
  const { mutate, saving } = useMutation();

  const [data, setData] = useState<ListResp<EmployeeRec> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.get<ListResp<EmployeeRec>>("/api/employees" + qs({ search: search || undefined, status: status || undefined, employmentType: employmentType || undefined, pageSize: 200 }));
      setData(d);
      setError(null);
    } catch (e) {
      const msg = errMessage(e);
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [search, status, employmentType]);

  useEffect(() => { void load(); }, [load]);

  const rows = data?.items ?? [];

  const changeStatus = async (emp: EmployeeRec, next: string) => {
    const res = await mutate(() => api.post(`/api/employees/${emp.id}/status`, { status: next }), `${emp.fullName} marked ${next.toLowerCase()}`);
    if (res.ok) void load();
  };

  const columns: Column<EmployeeRec>[] = [
    { key: "code", label: t(lang, "col.code"), className: "font-mono text-xs", value: (r) => r.code, hideOnMobile: true },
    {
      key: "fullName", label: t(lang, "col.employee"), primary: true,
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{r.fullName}</p>
          <p className="truncate text-[11px] text-muted-foreground">{r.designation || "—"} · {r.code}{r.hasContractor && r.contractorName ? ` · via ${r.contractorName}` : ""}</p>
          <div className="mt-1 flex flex-wrap gap-1"><EmployeePayBadges r={r} /></div>
        </div>
      ),
      value: (r) => r.fullName,
    },
    { key: "mobile", label: t(lang, "col.mobile"), value: (r) => r.mobile ?? "—", hideOnMobile: true },
    {
      key: "rate", label: "Pay", className: "text-right",
      render: (r) => r.employmentType === "SALARIED"
        ? <span className="tabular-nums">{formatINR(r.monthlySalary ?? 0)}<span className="text-[10px] text-muted-foreground">/mo</span></span>
        : <span className="tabular-nums">{formatINR(r.standardRate ?? 0)}<span className="text-[10px] text-muted-foreground">/shift</span></span>,
      value: (r) => r.employmentType === "SALARIED" ? `${formatINR(r.monthlySalary ?? 0)}/mo` : `${formatINR(r.standardRate ?? 0)}/shift`,
    },
    { key: "status", label: t(lang, "col.status"), render: (r) => <StatusBadge status={r.status} />, value: (r) => r.status },
    {
      key: "advanceBalance", label: t(lang, "col.advanceDue"), className: "text-right",
      render: (r) => (
        <span className={cn("tabular-nums font-medium", (r.advanceBalance ?? 0) > 0 && "text-red-600 dark:text-red-400")}>
          {formatINR(r.advanceBalance ?? 0)}
        </span>
      ),
      value: (r) => formatINR(r.advanceBalance ?? 0),
    },
    {
      key: "actions", label: "", className: "w-14",
      render: (r) => (
        <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 sm:h-8 sm:w-8" aria-label={`Actions for ${r.fullName}`}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel className="text-xs">{r.fullName}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("employee-detail", { id: r.id })}>
                <Eye className="h-3.5 w-3.5" />View profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setEditTarget(r)}>
                <Pencil className="h-3.5 w-3.5" />Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setAdvanceTarget(r)}>
                <HandCoins className="h-3.5 w-3.5" />Give advance
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">Change status</DropdownMenuLabel>
              {STATUS_VALUES.filter((s) => s !== r.status).map((s) => (
                <DropdownMenuItem key={s} disabled={saving} onClick={() => void changeStatus(r, s)}>
                  {s.charAt(0) + s.slice(1).toLowerCase()}
                </DropdownMenuItem>
              ))}
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
        title={t(lang, "page.employees")}
        subtitle={t(lang, "page.employees.sub").replace("{n}", String(data?.total ?? 0))}
        actions={
          <Button size="sm" className="h-9 gap-1.5" onClick={() => setAddOpen(true)}>
            <UserPlus className="h-4 w-4" aria-hidden />Add Employee
          </Button>
        }
      />

      <Card>
        <CardContent className="space-y-3 p-3 sm:p-4">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <SearchInput value={search} onChange={setSearch} placeholder="Search name, code, mobile, contractor…" className="flex-1" />
            <div className="grid grid-cols-2 gap-2 sm:flex sm:w-auto">
              <div className="w-full sm:w-44">
                <SelectInput value={employmentType} onChange={setEmploymentType} options={TYPE_OPTIONS} placeholder="All types" />
              </div>
              <div className="w-full sm:w-36">
                <SelectInput value={status} onChange={setStatus} options={STATUS_OPTIONS} placeholder="All statuses" />
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50/60 p-4 text-center dark:border-red-900 dark:bg-red-950/30">
              <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
              <Button variant="outline" size="sm" className="mt-2 h-8" onClick={() => void load()}>Retry</Button>
            </div>
          )}

          {!error && (
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(r) => r.id}
              onRowClick={(r) => navigate("employee-detail", { id: r.id })}
              exportName="employees"
              loading={loading}
              emptyIcon={UserRound}
              emptyTitle={search || status ? "No employees match" : "No employees yet"}
              emptyDescription={search || status ? "Try clearing the search or status filter." : "Add your first employee to start deploying."}
            />
          )}
        </CardContent>
      </Card>

      <EmployeeFormDialog open={addOpen} onOpenChange={setAddOpen} employee={null} onDone={load} />
      <EmployeeFormDialog open={Boolean(editTarget)} onOpenChange={(v) => !v && setEditTarget(null)} employee={editTarget} onDone={load} />
      <GiveAdvanceDialog
        open={Boolean(advanceTarget)}
        onOpenChange={(v) => !v && setAdvanceTarget(null)}
        defaultEmployeeId={advanceTarget?.id}
        employees={advanceTarget ? [{ id: advanceTarget.id, fullName: advanceTarget.fullName, code: advanceTarget.code, standardRate: advanceTarget.standardRate, advanceBalance: advanceTarget.advanceBalance }] : undefined}
        onDone={load}
      />

      {/* Mobile FAB — alternate trigger for Add Employee */}
      <ViewFab icon={UserPlus} label="Add employee" onClick={() => setAddOpen(true)} />
    </div>
  );
}
