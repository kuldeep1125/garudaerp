"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { formatINR, parseAmount } from "@/lib/money";
import type { ViewProps } from "@/components/view-types";
import { useNav } from "@/components/providers";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/shared/status-badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Phone, MessageCircle, HandCoins, Pencil, CalendarDays, Wallet, ReceiptText,
} from "lucide-react";
import {
  AdvanceRec, DeploymentRec, EmployeeRec, Field, GiveAdvanceDialog, InitialAvatar, Option,
  SelectInput, SettlementRec, ShiftBadgeInline, errMessage, fmtDay, todayStr, useMutation,
} from "./_shared";

interface AdjustmentRec {
  id: string; employeeId?: string; employeeName?: string; date: string;
  type: string; amount: number; reason?: string | null; createdByName?: string;
}
interface EmpDetail {
  employee: EmployeeRec;
  deployments: DeploymentRec[];
  advances: AdvanceRec[];
  adjustments: AdjustmentRec[] | { items: AdjustmentRec[] };
  settlements: SettlementRec[];
}

const ADJ_TYPES: Option[] = [
  { label: "Bonus (+)", value: "BONUS" },
  { label: "Overtime (+)", value: "OVERTIME" },
  { label: "Deduction (−)", value: "DEDUCTION" },
  { label: "Penalty (−)", value: "PENALTY" },
  { label: "Other", value: "OTHER" },
];

function AddAdjustmentDialog({ open, onOpenChange, employeeId, onDone }: {
  open: boolean; onOpenChange: (v: boolean) => void; employeeId: string; onDone: () => void;
}) {
  const [type, setType] = useState("BONUS");
  const [date, setDate] = useState(todayStr());
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const { mutate, saving } = useMutation();

  // Reset form each time the dialog opens (render-time state adjustment).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) { setType("BONUS"); setDate(todayStr()); setAmount(""); setReason(""); }
  }

  const submit = async () => {
    const amt = parseAmount(amount);
    if (amt <= 0) { toast.error("Enter a valid amount"); return; }
    const signed = type === "DEDUCTION" || type === "PENALTY" ? -amt : amt;
    const res = await mutate(
      () => api.post("/api/adjustments", { employeeId, date, type, amount: signed, reason: reason || undefined }),
      "Adjustment recorded"
    );
    if (res.ok) { onOpenChange(false); onDone(); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Adjustment</DialogTitle>
          <DialogDescription>Bonus/overtime add to payout; deduction/penalty subtract in settlements.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Type" required>
            <SelectInput value={type} onChange={setType} options={ADJ_TYPES} />
          </Field>
          <Field label="Amount (₹)" required>
            <Input type="number" inputMode="numeric" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-10" placeholder="0" />
          </Field>
          <Field label="Date" required>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-10" />
          </Field>
          <Field label="Reason">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} className="h-10" placeholder="Extra shift, late mark…" />
          </Field>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="min-h-10 flex-1 sm:flex-none" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="min-h-10 flex-1 sm:flex-none" onClick={submit} disabled={saving}>{saving ? "Saving…" : "Add adjustment"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function EmployeeDetailView({ params, navigate }: ViewProps) {
  const id = params?.id ?? "";
  const { back } = useNav();
  const [data, setData] = useState<EmpDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ fullName: "", mobile: "", designation: "", standardRate: "", skills: "", city: "", upiId: "", bankDetails: "", notes: "" });
  const { mutate, saving } = useMutation();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.get<EmpDetail>(`/api/employees/${id}`);
      setData(d);
      setError(null);
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { if (id) void load(); }, [id, load]);

  const afterAdvance = useCallback(async () => {
    try {
      const d = await api.get<EmpDetail>(`/api/employees/${id}`);
      setData(d);
      toast.info(`Advance balance now ${formatINR(d.employee.advanceBalance ?? 0)}`);
    } catch {
      void load();
    }
  }, [id, load]);

  const changeStatus = async (next: string) => {
    const res = await mutate(() => api.post(`/api/employees/${id}/status`, { status: next }), `Status changed to ${next.toLowerCase()}`);
    if (res.ok) void load();
  };

  const openEdit = () => {
    const e = data?.employee;
    setEditForm({
      fullName: e?.fullName ?? "", mobile: e?.mobile ?? "", designation: e?.designation ?? "",
      standardRate: e?.standardRate ? String(e.standardRate) : "", skills: e?.skills ?? "",
      city: e?.city ?? "", upiId: e?.upiId ?? "", bankDetails: e?.bankDetails ?? "", notes: e?.notes ?? "",
    });
    setEditOpen(true);
  };

  const submitEdit = async () => {
    if (!editForm.fullName.trim()) { toast.error("Full name is required"); return; }
    const res = await mutate(
      () => api.put(`/api/employees/${id}`, {
        fullName: editForm.fullName.trim(),
        mobile: editForm.mobile || undefined,
        designation: editForm.designation || undefined,
        standardRate: editForm.standardRate ? parseAmount(editForm.standardRate) : undefined,
        skills: editForm.skills || undefined,
        city: editForm.city || undefined,
        upiId: editForm.upiId || undefined,
        bankDetails: editForm.bankDetails || undefined,
        notes: editForm.notes || undefined,
      }),
      "Profile updated"
    );
    if (res.ok) { setEditOpen(false); void load(); }
  };

  const workColumns: Column<DeploymentRec>[] = [
    { key: "date", label: "Date", value: (r) => fmtDay(r.date), hideOnMobile: true },
    {
      key: "propertyName", label: "Property", primary: true,
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{r.propertyName}</p>
          <p className="text-[11px] text-muted-foreground">{fmtDay(r.date)}</p>
        </div>
      ),
      value: (r) => r.propertyName,
    },
    { key: "shift", label: "Shift", render: (r) => <ShiftBadgeInline shift={r.shift} />, value: (r) => r.shift },
    { key: "rate", label: "Rate", className: "text-right", value: (r) => formatINR(r.payoutRate ?? 0), hideOnMobile: true },
    { key: "earning", label: "Earning", className: "text-right", value: (r) => formatINR((r.payoutAmount ?? 0) + (r.adjustmentAmount ?? 0)) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} />, value: (r) => r.status },
  ];

  const advances = data?.advances ?? [];
  const advTotal = advances.reduce((s, a) => s + (a.amount ?? 0), 0);
  const adjustments = Array.isArray(data?.adjustments) ? (data?.adjustments as AdjustmentRec[]) : ((data?.adjustments as { items?: AdjustmentRec[] })?.items ?? []);
  const emp = data?.employee;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !emp) {
    return (
      <div className="space-y-4">
        <PageHeader title="Employee" onBack={back} />
        <Card><CardContent className="p-6 text-center">
          <p className="text-sm text-red-600 dark:text-red-400">{error ?? "Not found"}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>Retry</Button>
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={emp.fullName}
        subtitle={`${emp.code}${emp.designation ? ` · ${emp.designation}` : ""}`}
        onBack={back}
        actions={
          <>
            <Button size="sm" className="h-9 gap-1.5" onClick={() => setAdvanceOpen(true)}>
              <HandCoins className="h-4 w-4" aria-hidden />Give Advance
            </Button>
            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={openEdit}>
              <Pencil className="h-3.5 w-3.5" aria-hidden /><span className="hidden sm:inline">Edit</span>
            </Button>
          </>
        }
      />

      {/* Header card */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <InitialAvatar name={emp.fullName} className="h-14 w-14 text-lg" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate font-bold">{emp.fullName}</p>
                <StatusBadge status={emp.status} />
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Joined {fmtDay(emp.joiningDate)} · {emp.city || "—"}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className="tabular-nums">{formatINR(emp.standardRate ?? 0)}/day</Badge>
                {(emp.advanceBalance ?? 0) > 0 ? (
                  <Badge variant="outline" className="border-red-200 bg-red-50 tabular-nums text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                    Advance due {formatINR(emp.advanceBalance ?? 0)}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
                    No advance due
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            {emp.mobile && (
              <Button asChild variant="outline" size="sm" className="h-9">
                <a href={`tel:${emp.mobile}`} aria-label={`Call ${emp.fullName}`}><Phone className="h-3.5 w-3.5" /><span className="hidden sm:inline">Call</span></a>
              </Button>
            )}
            {(emp.whatsapp || emp.mobile) && (
              <Button asChild variant="outline" size="sm" className="h-9">
                <a href={`https://wa.me/${(emp.whatsapp ?? emp.mobile ?? "").replace(/\D/g, "")}`} target="_blank" rel="noreferrer" aria-label={`WhatsApp ${emp.fullName}`}>
                  <MessageCircle className="h-3.5 w-3.5" /><span className="hidden sm:inline">WhatsApp</span>
                </a>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="work">
        <div className="overflow-x-auto no-scrollbar">
          <TabsList className="w-max min-w-full sm:min-w-0">
            <TabsTrigger value="work">Work History</TabsTrigger>
            <TabsTrigger value="advances">Advances</TabsTrigger>
            <TabsTrigger value="adjustments">Adjustments</TabsTrigger>
            <TabsTrigger value="settlements">Settlements</TabsTrigger>
            <TabsTrigger value="profile">Profile</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="work" className="mt-3">
          <DataTable
            columns={workColumns}
            rows={data?.deployments ?? []}
            rowKey={(r) => r.id}
            onRowClick={(r) => navigate("deployments", { date: r.date })}
            emptyIcon={CalendarDays}
            emptyTitle="No deployments yet"
            emptyDescription="Deploy this employee to a property to build history."
          />
        </TabsContent>

        <TabsContent value="advances" className="mt-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Total taken: <span className="font-bold tabular-nums text-foreground">{formatINR(advTotal)}</span></p>
            <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => setAdvanceOpen(true)}>
              <HandCoins className="h-3.5 w-3.5" />Give
            </Button>
          </div>
          <DataTable
            columns={[
              { key: "date", label: "Date", value: (r) => fmtDay(r.date), hideOnMobile: true },
              { key: "amount", label: "Amount", primary: true, render: (r) => <span className="font-semibold tabular-nums">{formatINR(r.amount)}</span>, value: (r) => formatINR(r.amount) },
              { key: "reason", label: "Reason", value: (r) => r.reason ?? "—" },
              { key: "method", label: "Method", value: (r) => r.method ?? "—", hideOnMobile: true },
              { key: "givenBy", label: "Given by", value: (r) => r.givenByName ?? "—", hideOnMobile: true },
            ] as Column<AdvanceRec>[]}
            rows={advances}
            rowKey={(r) => r.id}
            emptyIcon={Wallet}
            emptyTitle="No advances given"
            emptyDescription="Advances given to this employee will appear here."
          />
        </TabsContent>

        <TabsContent value="adjustments" className="mt-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Bonuses add, deductions subtract at settlement</p>
            <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => setAdjustOpen(true)}>
              <ReceiptText className="h-3.5 w-3.5" />Add
            </Button>
          </div>
          <DataTable
            columns={[
              { key: "date", label: "Date", value: (r) => fmtDay(r.date), hideOnMobile: true },
              {
                key: "type", label: "Type", primary: true,
                render: (r) => <div className="min-w-0"><p className="truncate font-medium">{r.type}{r.reason ? ` · ${r.reason}` : ""}</p><p className="text-[11px] text-muted-foreground">{fmtDay(r.date)}</p></div>,
                value: (r) => r.type,
              },
              {
                key: "amount", label: "Amount", className: "text-right",
                render: (r) => <span className={cn("font-semibold tabular-nums", r.amount >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>{formatINR(r.amount)}</span>,
                value: (r) => formatINR(r.amount),
              },
              { key: "by", label: "By", value: (r) => r.createdByName ?? "—", hideOnMobile: true },
            ] as Column<AdjustmentRec>[]}
            rows={adjustments}
            rowKey={(r) => r.id}
            emptyIcon={ReceiptText}
            emptyTitle="No adjustments"
            emptyDescription="Bonuses, overtime and penalties appear here."
          />
        </TabsContent>

        <TabsContent value="settlements" className="mt-3">
          <DataTable
            columns={[
              { key: "month", label: "Month", primary: true, render: (r) => <span className="font-medium tabular-nums">{r.month}</span>, value: (r) => r.month },
              { key: "days", label: "Days", className: "text-right", value: (r) => String(r.totalDays ?? 0), hideOnMobile: true },
              { key: "gross", label: "Gross", className: "text-right", value: (r) => formatINR(r.grossEarnings ?? 0), hideOnMobile: true },
              { key: "advance", label: "Adv. deducted", className: "text-right", value: (r) => formatINR(r.advanceDeducted ?? 0), hideOnMobile: true },
              { key: "net", label: "Net payable", className: "text-right", render: (r) => <span className="font-bold tabular-nums">{formatINR(r.netPayable ?? 0)}</span>, value: (r) => formatINR(r.netPayable ?? 0) },
              { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} />, value: (r) => r.status },
            ] as Column<SettlementRec>[]}
            rows={data?.settlements ?? []}
            rowKey={(r) => r.id}
            onRowClick={(r) => navigate("settlements", { month: r.month })}
            emptyIcon={ReceiptText}
            emptyTitle="No settlements yet"
            emptyDescription="Generate month-end settlements to see them here."
          />
        </TabsContent>

        <TabsContent value="profile" className="mt-3">
          <Card>
            <CardContent className="p-4">
              <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                {([
                  ["Mobile", emp.mobile], ["WhatsApp", emp.whatsapp], ["Gender", emp.gender], ["City", emp.city],
                  ["Address", emp.address], ["Skills", emp.skills], ["Rate type", emp.rateType ?? "PER_SHIFT"],
                  ["Preferred payment", emp.preferredPaymentMethod], ["UPI ID", emp.upiId], ["Bank details", emp.bankDetails],
                  ["Emergency contact", (emp as unknown as { emergencyContact?: string | null }).emergencyContact],
                  ["Notes", emp.notes],
                ] as [string, string | null | undefined][]).map(([k, v]) => (
                  <div key={k} className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</p>
                    <p className="truncate text-sm" title={v ?? undefined}>{v || "—"}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
                <span className="mr-1 text-xs text-muted-foreground">Status control:</span>
                {["ACTIVE", "INACTIVE", "SUSPENDED", "LEFT"].filter((s) => s !== emp.status).map((s) => (
                  <Button key={s} variant="outline" size="sm" className="h-8" disabled={saving} onClick={() => void changeStatus(s)}>
                    Mark {s.charAt(0) + s.slice(1).toLowerCase()}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <GiveAdvanceDialog open={advanceOpen} onOpenChange={setAdvanceOpen} defaultEmployeeId={id} employees={emp ? [{ id: emp.id, fullName: emp.fullName, code: emp.code, standardRate: emp.standardRate, advanceBalance: emp.advanceBalance }] : undefined} onDone={afterAdvance} />
      <AddAdjustmentDialog open={adjustOpen} onOpenChange={setAdjustOpen} employeeId={id} onDone={load} />

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit profile</DialogTitle>
            <DialogDescription>Update contact, rate and payment details.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Full name" required className="sm:col-span-2">
              <Input value={editForm.fullName} onChange={(e) => setEditForm((f) => ({ ...f, fullName: e.target.value }))} className="h-10" />
            </Field>
            <Field label="Mobile"><Input value={editForm.mobile} onChange={(e) => setEditForm((f) => ({ ...f, mobile: e.target.value }))} className="h-10" /></Field>
            <Field label="Designation"><Input value={editForm.designation} onChange={(e) => setEditForm((f) => ({ ...f, designation: e.target.value }))} className="h-10" /></Field>
            <Field label="Standard rate (₹/day)"><Input type="number" inputMode="numeric" value={editForm.standardRate} onChange={(e) => setEditForm((f) => ({ ...f, standardRate: e.target.value }))} className="h-10" /></Field>
            <Field label="City"><Input value={editForm.city} onChange={(e) => setEditForm((f) => ({ ...f, city: e.target.value }))} className="h-10" /></Field>
            <Field label="Skills" className="sm:col-span-2"><Input value={editForm.skills} onChange={(e) => setEditForm((f) => ({ ...f, skills: e.target.value }))} className="h-10" /></Field>
            <Field label="UPI ID"><Input value={editForm.upiId} onChange={(e) => setEditForm((f) => ({ ...f, upiId: e.target.value }))} className="h-10" /></Field>
            <Field label="Bank details"><Input value={editForm.bankDetails} onChange={(e) => setEditForm((f) => ({ ...f, bankDetails: e.target.value }))} className="h-10" /></Field>
            <Field label="Notes" className="sm:col-span-2"><Input value={editForm.notes} onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))} className="h-10" /></Field>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="min-h-10 flex-1 sm:flex-none" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button className="min-h-10 flex-1 sm:flex-none" onClick={submitEdit} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
