"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api-client";
import { formatINR, parseAmount } from "@/lib/money";
import type { ViewProps } from "@/components/view-types";
import { useNav } from "@/components/providers";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/shared/status-badge";
import { StatCard } from "@/components/shared/stat-card";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Phone, MessageCircle, HandCoins, Pencil, CalendarDays, Wallet, ReceiptText, Activity,
  Home, BookOpen, Clock, ShieldCheck, ArrowUpRight, ArrowDownLeft, CheckCircle2, CalendarCheck,
} from "lucide-react";
import {
  EmployeePayBadges, AdvanceRec, AreaTrend, CHART_COLORS, DeploymentRec, EmployeeRec, Field, GiveAdvanceDialog,
  InitialAvatar, MoneyInput, Option, SelectInput, SettlementRec, SHIFT_UNITS, ShiftBadgeInline, errMessage, fmtDay,
  todayStr, useMutation,
} from "./_shared";
import { EmployeeFormDialog } from "@/components/shared/employee-form-dialog";
import { FormulaInspectorDialog, type FormulaInspectorData } from "@/components/shared/formula-inspector-dialog";
import {
  TransactionLineageDialog,
  type TransactionLineageData,
} from "@/components/shared/transaction-lineage-dialog";

interface AdjustmentRec {
  id: string; employeeId?: string; employeeName?: string; date: string;
  type: string; amount: number; reason?: string | null; createdByName?: string;
}
interface PayHistoryRec {
  id: string; effectiveFrom: string; employmentType: string; monthlySalary: number;
  standardRate: number; overtimeRate: number; onBusinessRent: boolean; rentAmount: number;
  rentMode: string; hasContractor: boolean; contractorName?: string | null; contractorRateCut: number;
  changedByName?: string | null; reason?: string | null; createdAt: string;
}
interface EmpDetail {
  employee: EmployeeRec;
  deployments: DeploymentRec[];
  advances: AdvanceRec[];
  adjustments: AdjustmentRec[] | { items: AdjustmentRec[] };
  settlements: SettlementRec[];
  payHistory?: PayHistoryRec[];
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
      "Adjustment recorded",
      (data) => ({ module: "ADJUSTMENT", recordId: (data as { id: string }).id, onUndo: onDone })
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
            <MoneyInput value={amount} onChange={setAmount} min={1} className="h-10" />
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

  const openEdit = () => setEditOpen(true);

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
    { key: "paid", label: "Paid", render: (r) => <StatusBadge status={r.paidStatus ?? "UNPAID"} />, value: (r) => r.paidStatus ?? "UNPAID", hideOnMobile: true },
  ];

  const advances = data?.advances ?? [];
  const advTotal = advances.reduce((s, a) => s + (a.amount ?? 0), 0);
  const adjustments = Array.isArray(data?.adjustments) ? (data?.adjustments as AdjustmentRec[]) : ((data?.adjustments as { items?: AdjustmentRec[] })?.items ?? []);
  const emp = data?.employee;

  // Last-30-day activity derived client-side from the 100 most recent deployments.
  const activity = useMemo(() => {
    const days = 30;
    const byDay = new Map<string, { shifts: number; billing: number }>();
    for (const d of data?.deployments ?? []) {
      if (!d.date) continue;
      const key = String(d.date).slice(0, 10);
      const row = byDay.get(key) ?? { shifts: 0, billing: 0 };
      row.shifts += SHIFT_UNITS[String(d.shift).toUpperCase()] ?? 1;
      row.billing += d.billingAmount ?? 0;
      byDay.set(key, row);
    }
    const list: { date: string; shifts: number; billing: number }[] = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const row = byDay.get(key);
      list.push({ date: key, shifts: row?.shifts ?? 0, billing: row?.billing ?? 0 });
    }
    const worked = list.filter((d) => d.shifts > 0).length;
    const totalShifts = list.reduce((s, d) => s + d.shifts, 0);
    const billed = list.reduce((s, d) => s + d.billing, 0);

    // Utilization analytics: shift mix, weekday distribution, top properties.
    // IMPORTANT: filter to the same 30-day window as the summary numbers above.
    // FULL covers both halves → counts once in day AND night (units stay equal).
    const window30 = new Set(list.map((d) => d.date));
    let dayShifts = 0;
    let nightShifts = 0;
    const weekday = [0, 0, 0, 0, 0, 0, 0]; // Sun..Sat
    const byProp = new Map<string, number>();
    for (const d of data?.deployments ?? []) {
      if (!d.date) continue;
      const key = String(d.date).slice(0, 10);
      if (window30.has(key)) {
        const s = String(d.shift).toUpperCase();
        if (s === "NIGHT" || s === "FULL") nightShifts += 1;
        if (s === "DAY" || s === "FULL") dayShifts += 1;
        const wd = new Date(`${key}T00:00:00`).getDay();
        weekday[wd] += 1;
        byProp.set(d.propertyName, (byProp.get(d.propertyName) ?? 0) + 1);
      }
    }
    const topProps = [...byProp.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    return { list, worked, totalShifts, billed, dayShifts, nightShifts, weekday, topProps };
  }, [data?.deployments]);

  // [ADDED] Financial metrics for this employee
  const totalShifts = useMemo(() => {
    return (data?.deployments ?? []).reduce((s, d) => s + (SHIFT_UNITS[String(d.shift).toUpperCase()] ?? 1), 0);
  }, [data?.deployments]);

  const totalDeploymentEarnings = useMemo(() => {
    return (data?.deployments ?? []).reduce((s, d) => s + (d.payoutAmount ?? 0) + (d.adjustmentAmount ?? 0), 0);
  }, [data?.deployments]);

  const grossEarned = useMemo(() => {
    if (emp?.employmentType === "SALARIED") {
      return (emp.monthlySalary ?? 0) + totalDeploymentEarnings;
    }
    return totalDeploymentEarnings;
  }, [emp, totalDeploymentEarnings]);

  const rentConfig = emp?.onBusinessRent ? (emp.rentAmount ?? 0) : 0;
  const advanceDue = emp?.advanceBalance ?? 0;
  const netEstimate = Math.max(0, grossEarned - rentConfig - advanceDue);

  // [ADDED] Formula Inspector State
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorData, setInspectorData] = useState<FormulaInspectorData | null>(null);
  const [lineageData, setLineageData] = useState<TransactionLineageData | null>(null);

  // [ADDED] Chronological Unified Passbook Ledger
  const passbook = useMemo(() => {
    const rawEvents: Array<{
      id: string;
      date: string;
      type: "EARNING" | "ADVANCE_GIVEN" | "RENT" | "ADJUSTMENT" | "SETTLEMENT";
      typeLabel: string;
      badgeTone: "emerald" | "amber" | "red" | "gray";
      description: string;
      credit?: number;
      debit?: number;
      rawRecord?: unknown;
    }> = [];

    // 1. Deployments
    for (const d of data?.deployments ?? []) {
      const amt = (d.payoutAmount ?? 0) + (d.adjustmentAmount ?? 0);
      rawEvents.push({
        id: `dep-${d.id}`,
        date: String(d.date).slice(0, 10),
        type: "EARNING",
        typeLabel: "Shift Earning",
        badgeTone: "emerald",
        description: `${d.propertyName} · Shift ${d.shift} (${formatINR(d.payoutRate)}/shift)`,
        credit: amt,
        rawRecord: d,
      });
    }

    // 2. Advances Given
    for (const a of data?.advances ?? []) {
      rawEvents.push({
        id: `adv-${a.id}`,
        date: String(a.date).slice(0, 10),
        type: "ADVANCE_GIVEN",
        typeLabel: "Advance Given",
        badgeTone: "amber",
        description: a.reason || "Cash/UPI loan disbursed",
        debit: a.amount,
        rawRecord: a,
      });
    }

    // 3. Adjustments
    const adjs = Array.isArray(data?.adjustments)
      ? (data?.adjustments as AdjustmentRec[])
      : ((data?.adjustments as { items?: AdjustmentRec[] })?.items ?? []);
    for (const adj of adjs) {
      const isCredit = adj.amount >= 0;
      rawEvents.push({
        id: `adj-${adj.id}`,
        date: String(adj.date).slice(0, 10),
        type: "ADJUSTMENT",
        typeLabel: `Adjustment (${adj.type})`,
        badgeTone: isCredit ? "emerald" : "red",
        description: adj.reason || `Direct payroll ${adj.type.toLowerCase()}`,
        credit: isCredit ? adj.amount : undefined,
        debit: !isCredit ? Math.abs(adj.amount) : undefined,
        rawRecord: adj,
      });
    }

    // 4. Settlements
    for (const s of data?.settlements ?? []) {
      const dateStr = s.month ? `${s.month}-28` : todayStr();
      rawEvents.push({
        id: `set-${s.id}`,
        date: dateStr,
        type: "SETTLEMENT",
        typeLabel: "Settlement Payout",
        badgeTone: "gray",
        description: `Month ${s.month} Settlement (Rent: ${formatINR(s.rentDeducted ?? 0)}, Advance Recovered: ${formatINR(s.advanceDeducted ?? 0)})`,
        debit: s.netPayable,
        rawRecord: s,
      });
    }

    // Sort chronologically ascending to compute running balance
    rawEvents.sort((a, b) => a.date.localeCompare(b.date));

    let running = 0;
    const withBalance = rawEvents.map((ev) => {
      running += (ev.credit ?? 0) - (ev.debit ?? 0);
      return { ...ev, balance: running };
    });

    // Return descending for display
    return withBalance.reverse();
  }, [data?.deployments, data?.advances, data?.adjustments, data?.settlements]);

  const openLineage = (ev: {
    id: string;
    date: string;
    type: "EARNING" | "ADVANCE_GIVEN" | "RENT" | "ADJUSTMENT" | "SETTLEMENT";
    typeLabel: string;
    description: string;
    credit?: number;
    debit?: number;
    rawRecord?: unknown;
  }) => {
    if (!emp) return;

    switch (ev.type) {
      case "EARNING": {
        const d = ev.rawRecord as DeploymentRec;
        const amt = (d?.payoutAmount ?? 0) + (d?.adjustmentAmount ?? 0);
        setLineageData({
          id: ev.id,
          title: `Shift Earning: ${d?.propertyName || "Property"}`,
          type: "PAYROLL EARNING (ACCRUAL)",
          amount: amt,
          date: fmtDay(ev.date),
          createdAt: String(d?.date),
          createdByName: "Operations Dispatch",
          ruleExplanation: `Shift compensation for ${d?.shift || "Standard"} shift. Credited to employee wage liability at the standard rate of ${formatINR(d?.payoutRate ?? 0)}/shift.`,
          impactedAccounts: [
            {
              account: "Direct Wages Cost (Operating)",
              type: "debit",
              amount: amt,
              description: "Direct labor expense incurred",
            },
            {
              account: "Wages Payable (Employee)",
              type: "credit",
              amount: amt,
              description: `Owed to ${emp.fullName}`,
            },
          ],
          linkedEntities: d?.propertyId ? [
            {
              label: "Serviced Restaurant",
              name: d.propertyName,
              onClick: () => navigate("properties", { id: d.propertyId }),
            },
          ] : undefined,
        });
        break;
      }
      case "ADVANCE_GIVEN": {
        const a = ev.rawRecord as AdvanceRec;
        setLineageData({
          id: ev.id,
          title: "Advance Loan Disbursed",
          type: "ADVANCE (CASH OUTFLOW)",
          amount: a?.amount ?? (ev.debit ?? 0),
          date: fmtDay(ev.date),
          createdAt: (a as unknown as { createdAt?: string }).createdAt || ev.date,
          createdByName: (a as unknown as { createdByName?: string }).createdByName || "Finance / Cashier",
          ruleExplanation: "Cash advance disbursed to employee. Creates an asset receivable to be recovered during monthly settlement payroll.",
          impactedAccounts: [
            {
              account: "Staff Advance Asset (Receivable)",
              type: "debit",
              amount: a?.amount ?? (ev.debit ?? 0),
              description: `Recovery asset held against ${emp.fullName}`,
            },
            {
              account: "Cash / Bank Account",
              type: "credit",
              amount: a?.amount ?? (ev.debit ?? 0),
              description: "Disbursed out of company funds",
            },
          ],
          notes: a?.reason || undefined,
        });
        break;
      }
      case "ADJUSTMENT": {
        const adj = ev.rawRecord as AdjustmentRec;
        const amt = Math.abs(adj?.amount ?? (ev.credit || ev.debit || 0));
        const isBonus = (adj?.amount ?? 0) >= 0;
        setLineageData({
          id: ev.id,
          title: `Payroll Adjustment: ${adj?.type || "ADJUSTMENT"}`,
          type: isBonus ? "BONUS (CREDIT)" : "PENALTY (DEDUCTION)",
          amount: amt,
          date: fmtDay(ev.date),
          createdByName: adj?.createdByName || "Operations Manager",
          ruleExplanation: adj?.reason || `Manual payroll adjustment of type ${adj?.type || "adjustment"}.`,
          impactedAccounts: [
            {
              account: isBonus ? "Bonus & Incentive Cost" : "Payroll Liability (Employee)",
              type: "debit",
              amount: amt,
              description: isBonus ? "Direct incentive expense" : "Deduction applied to employee",
            },
            {
              account: isBonus ? "Payroll Liability (Employee)" : "Deduction Recovery / Penalty",
              type: "credit",
              amount: amt,
              description: isBonus ? `Credited to ${emp.fullName}` : "Company recovery",
            },
          ],
        });
        break;
      }
      case "SETTLEMENT": {
        const s = ev.rawRecord as SettlementRec;
        setLineageData({
          id: ev.id,
          title: `Payroll Settlement (Month ${s?.month || "N/A"})`,
          type: "SETTLEMENT (FINAL DISBURSEMENT)",
          amount: s?.netPayable ?? (ev.debit ?? 0),
          date: fmtDay(ev.date),
          ruleExplanation: `Final settlement for month ${s?.month}. Includes automatic deduction of company accommodation rent (${formatINR(s?.rentDeducted ?? 0)}) and recovery of prior advances (${formatINR(s?.advanceDeducted ?? 0)}).`,
          impactedAccounts: [
            {
              account: "Wages Payable (Employee)",
              type: "debit",
              amount: (s as unknown as { grossPayable?: number }).grossPayable ?? (s?.netPayable ?? (ev.debit ?? 0)),
              description: "Clears accumulated shift & salary liabilities",
            },
            {
              account: "Bank / Cash Payout",
              type: "credit",
              amount: s?.netPayable ?? (ev.debit ?? 0),
              description: "Actual net salary disbursed to employee",
            },
          ],
        });
        break;
      }
    }
  };

  const openInspector = (type: string) => {
    if (!emp) return;
    if (type === "shifts") {
      setInspectorData({
        title: "Total Shifts Calculation",
        subtitle: `${emp.fullName} (${emp.code})`,
        formulaEquation: `Total Shifts = Day Shifts (${activity.dayShifts}) + Night Shifts (${activity.nightShifts})`,
        resultLabel: "Total Shifts",
        resultValue: `${totalShifts} shifts`,
        steps: [
          { label: "Day Shifts Worked", amount: activity.dayShifts, operation: "add", detail: "1 shift unit each" },
          { label: "Night Shifts Worked", amount: activity.nightShifts, operation: "add", detail: "1 shift unit each" },
          { label: "Total Shift Units", amount: totalShifts, operation: "result" },
        ],
        sourceRows: (data?.deployments ?? []).slice(0, 15).map((d) => ({
          id: d.id,
          title: d.propertyName,
          subtitle: `${fmtDay(d.date)} · Shift ${d.shift}`,
          amount: formatINR(d.payoutRate),
          badge: d.shift,
          badgeTone: d.shift === "NIGHT" ? "gray" : "amber",
        })),
        sourceRowsTitle: "Recent Shifts Worked",
        notes: [
          "Deployments represent actual work recorded on property sites.",
          "Rate is snapshotted at creation time, preserving zero-mismatch historical accuracy.",
        ],
      });
    } else if (type === "earnings") {
      const isSal = emp.employmentType === "SALARIED";
      setInspectorData({
        title: "Gross Earnings Calculation",
        subtitle: `${emp.fullName} (${emp.code})`,
        formulaEquation: isSal
          ? `Gross Wages = Monthly Salary (₹${emp.monthlySalary}) + Extra Shift Accruals`
          : `Gross Wages = ∑(Shifts Worked × Shift Payout Rate) + Adjustments`,
        resultLabel: "Gross Earnings",
        resultValue: formatINR(grossEarned),
        steps: isSal ? [
          { label: "Base Monthly Salary", amount: emp.monthlySalary ?? 0, operation: "add", detail: "Fixed monthly compensation" },
          { label: "Additional Shift Overtime", amount: totalDeploymentEarnings, operation: "add", detail: "Extra shifts worked" },
          { label: "Total Gross Accrual", amount: grossEarned, operation: "result" },
        ] : [
          { label: "Deployment Shift Earnings", amount: totalDeploymentEarnings, operation: "add", detail: `${totalShifts} shifts deployed` },
          { label: "Total Gross Wages", amount: grossEarned, operation: "result" },
        ],
        sourceRows: (data?.deployments ?? []).slice(0, 15).map((d) => ({
          id: d.id,
          title: d.propertyName,
          subtitle: `${fmtDay(d.date)} · Shift ${d.shift}`,
          amount: (d.payoutAmount ?? 0) + (d.adjustmentAmount ?? 0),
          badge: formatINR(d.payoutRate),
        })),
        sourceRowsTitle: "Shift Payout Breakdown",
        notes: [
          "Gross earnings represent the full amount earned by the employee before any deductions.",
          "Accommodation rent and cash advances are deducted in the next steps.",
        ],
      });
    } else if (type === "rent") {
      setInspectorData({
        title: "Accommodation Rent Deduction",
        subtitle: `${emp.fullName} (${emp.code})`,
        formulaEquation: emp.onBusinessRent
          ? `Net Base = Gross Wages − Accommodation Rent (${formatINR(emp.rentAmount ?? 0)}/${(emp.rentMode ?? "MONTH").toLowerCase()})`
          : "Accommodation Rent = ₹0 (Employee provides own accommodation)",
        resultLabel: "Rent Deducted",
        resultValue: formatINR(rentConfig),
        steps: [
          { label: "Configured Rent Rate", amount: emp.rentAmount ?? 0, operation: "subtract", detail: `Cycle: per ${emp.rentMode ?? "MONTH"}` },
          { label: "Total Deducted", amount: rentConfig, operation: "result" },
        ],
        notes: [
          "Accommodation rent is automatically deducted from gross earnings/salary during monthly settlement.",
          "If rent exceeds earnings in a cycle, net payout is ₹0 and remaining rent carries over.",
        ],
      });
    } else if (type === "advances") {
      const advs = data?.advances ?? [];
      const totalAdv = advs.reduce((s, a) => s + (a.amount ?? 0), 0);
      const recovered = totalAdv - advanceDue;
      setInspectorData({
        title: "Advance Loan Recovery Calculation",
        subtitle: `${emp.fullName} (${emp.code})`,
        formulaEquation: `Advance Due = Total Advances Given (${formatINR(totalAdv)}) − Recovered in Settlements (${formatINR(recovered)})`,
        resultLabel: "Active Loan Balance",
        resultValue: formatINR(advanceDue),
        steps: [
          { label: "Total Advances Disbursed", amount: totalAdv, operation: "add", detail: "Cash/UPI given to employee" },
          { label: "Recovered via Settlements", amount: recovered, operation: "subtract", detail: "Deducted from past payouts" },
          { label: "Current Balance Pending", amount: advanceDue, operation: "result" },
        ],
        sourceRows: advs.map((a) => ({
          id: a.id,
          title: a.reason || "Cash Advance",
          subtitle: fmtDay(a.date),
          amount: a.amount,
          badge: a.settlementId ? "Deducted" : "Pending",
          badgeTone: a.settlementId ? "gray" : "red",
        })),
        sourceRowsTitle: "Advance Loan History",
        notes: [
          "Advances reduce the cash payable to the employee on settlement day.",
          "The outstanding balance carries forward automatically until fully repaid.",
        ],
      });
    } else if (type === "net") {
      setInspectorData({
        title: "Net Payable Formula",
        subtitle: `${emp.fullName} (${emp.code})`,
        formulaEquation: `Net Payable = Gross Accrued (${formatINR(grossEarned)}) − Rent (${formatINR(rentConfig)}) − Advance Balance (${formatINR(advanceDue)})`,
        resultLabel: "Estimated Net Due",
        resultValue: formatINR(netEstimate),
        steps: [
          { label: "Gross Accrued Wages", amount: grossEarned, operation: "add" },
          { label: "Accommodation Rent Deduction", amount: rentConfig, operation: "subtract" },
          { label: "Advance Loan Recovery", amount: advanceDue, operation: "subtract" },
          { label: "Net Payable / Disbursable", amount: netEstimate, operation: "result" },
        ],
        notes: [
          "This is the actual final cheque/cash/UPI amount payable to the employee.",
          "When you generate settlements, this exact line-by-line deduction statement is created.",
        ],
      });
    }
    setInspectorOpen(true);
  };

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
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" className="h-9 gap-1.5" onClick={() => setAdvanceOpen(true)}>
              <HandCoins className="h-4 w-4" aria-hidden />Give Advance
            </Button>
            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => setAdjustOpen(true)}>
              <Wallet className="h-4 w-4" aria-hidden />Adjustment
            </Button>
            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={openEdit}>
              <Pencil className="h-3.5 w-3.5" aria-hidden /><span className="hidden sm:inline">Edit Terms</span>
            </Button>
          </div>
        }
      />

      {/* Header Profile Card */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <InitialAvatar name={emp.fullName} className="h-14 w-14 text-lg" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate font-bold text-lg">{emp.fullName}</p>
                <StatusBadge status={emp.status} />
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Joined {fmtDay(emp.joiningDate)} · {emp.city || "—"}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {emp.employmentType === "SALARIED" ? (
                  <Badge variant="outline" className="tabular-nums font-semibold bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    {formatINR(emp.monthlySalary ?? 0)}/month · Salaried
                  </Badge>
                ) : (
                  <Badge variant="outline" className="tabular-nums font-semibold bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                    {formatINR(emp.standardRate ?? 0)}/shift · Per-Shift
                  </Badge>
                )}
                {emp.onBusinessRent && (
                  <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
                    Rent −{formatINR(emp.rentAmount ?? 0)}/{emp.rentMode?.toLowerCase() === "day" ? "day" : "mo"}
                  </Badge>
                )}
                {(emp.advanceBalance ?? 0) > 0 ? (
                  <Badge variant="outline" className="border-red-200 bg-red-50 tabular-nums text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                    Advance loan {formatINR(emp.advanceBalance ?? 0)}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
                    Advance clear
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

      {/* [ADDED] Interactive KPI Banner (Transparent Math with Click-to-Inspect Formula) */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5" role="list" aria-label="Employee KPI Summary">
        <StatCard
          label="Shifts Worked"
          value={`${totalShifts} shifts`}
          icon={CalendarCheck}
          hint="Click to inspect formula"
          onClick={() => openInspector("shifts")}
        />
        <StatCard
          label="Gross Accrued"
          value={formatINR(grossEarned, { compact: true })}
          icon={Wallet}
          tone="positive"
          hint="Wages earned"
          onClick={() => openInspector("earnings")}
        />
        <StatCard
          label="Rent Deducted"
          value={emp.onBusinessRent ? `−${formatINR(emp.rentAmount, { compact: true })}` : "₹0"}
          icon={Home}
          tone="warning"
          hint={emp.onBusinessRent ? `Per ${emp.rentMode?.toLowerCase()}` : "No rent"}
          onClick={() => openInspector("rent")}
        />
        <StatCard
          label="Advance Loan"
          value={formatINR(advanceDue, { compact: true })}
          icon={HandCoins}
          tone={advanceDue > 0 ? "negative" : "positive"}
          hint={advanceDue > 0 ? "Pending recovery" : "Fully clear"}
          onClick={() => openInspector("advances")}
        />
        <StatCard
          label="Estimated Net Due"
          value={formatINR(netEstimate, { compact: true })}
          icon={ReceiptText}
          tone="info"
          hint="Gross − Rent − Advance"
          onClick={() => openInspector("net")}
        />
      </div>

      {/* [ADDED] Centralized 360° Tabs */}
      <Tabs defaultValue="passbook">
        <div className="overflow-x-auto no-scrollbar">
          <TabsList className="w-max min-w-full sm:min-w-0">
            <TabsTrigger value="passbook" className="gap-1.5">
              <BookOpen className="h-3.5 w-3.5" />Passbook Ledger
            </TabsTrigger>
            <TabsTrigger value="work" className="gap-1.5">
              <Clock className="h-3.5 w-3.5" />Work History
            </TabsTrigger>
            <TabsTrigger value="advances" className="gap-1.5">
              <HandCoins className="h-3.5 w-3.5" />Advances & Adjustments
            </TabsTrigger>
            <TabsTrigger value="settlements" className="gap-1.5">
              <ReceiptText className="h-3.5 w-3.5" />Settlements
            </TabsTrigger>
            <TabsTrigger value="terms" className="gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" />Terms & History
            </TabsTrigger>
            <TabsTrigger value="profile">Full Profile</TabsTrigger>
          </TabsList>
        </div>

        {/* TAB 1: PASSBOOK LEDGER (Unified Financial Statement) */}
        <TabsContent value="passbook" className="mt-3 space-y-3">
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b pb-3">
                <div>
                  <h3 className="font-semibold text-sm">Unified Financial Passbook</h3>
                  <p className="text-xs text-muted-foreground">
                    Chronological audit ledger of all earnings, rent deductions, loans, and settlement payouts.
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs font-medium">
                  <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" /> Credit (+) Earnings
                  </span>
                  <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400">
                    <span className="h-2 w-2 rounded-full bg-rose-500" /> Debit (−) Payouts/Loans
                  </span>
                </div>
              </div>

              <DataTable
                columns={[
                  { key: "date", label: "Date", value: (r) => fmtDay(r.date), hideOnMobile: true },
                  {
                    key: "typeLabel", label: "Transaction", primary: true,
                    render: (r) => (
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              "text-[10px] px-1.5 py-0.5 rounded font-semibold",
                              r.badgeTone === "emerald" && "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
                              r.badgeTone === "amber" && "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
                              r.badgeTone === "red" && "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
                              r.badgeTone === "gray" && "bg-muted text-muted-foreground"
                            )}
                          >
                            {r.typeLabel}
                          </span>
                          <span className="text-[11px] text-muted-foreground sm:hidden">{fmtDay(r.date)}</span>
                        </div>
                        <p className="text-xs font-medium text-foreground mt-0.5 truncate">{r.description}</p>
                      </div>
                    ),
                    value: (r) => r.typeLabel,
                  },
                  {
                    key: "credit", label: "Credit (+)", className: "text-right",
                    render: (r) => r.credit ? <span className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">+{formatINR(r.credit)}</span> : <span className="text-muted-foreground">—</span>,
                    value: (r) => r.credit ? formatINR(r.credit) : "0",
                  },
                  {
                    key: "debit", label: "Debit (−)", className: "text-right",
                    render: (r) => r.debit ? <span className="font-semibold text-rose-600 dark:text-rose-400 tabular-nums">−{formatINR(r.debit)}</span> : <span className="text-muted-foreground">—</span>,
                    value: (r) => r.debit ? formatINR(r.debit) : "0",
                  },
                  {
                    key: "balance", label: "Balance", className: "text-right",
                    render: (r) => <span className="font-bold tabular-nums">{formatINR(r.balance)}</span>,
                    value: (r) => formatINR(r.balance),
                  },
                ]}
                rows={passbook}
                rowKey={(r) => r.id}
                onRowClick={(r) => openLineage(r)}
                emptyIcon={BookOpen}
                emptyTitle="No Passbook Activity"
                emptyDescription="Work shifts, advances, and settlements will automatically appear in this ledger."
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2: WORK HISTORY */}
        <TabsContent value="work" className="mt-3 space-y-3">
          {/* Pay model strip */}
          {(emp.employmentType === "SALARIED" || emp.onBusinessRent || (emp.hasContractor && emp.contractorName)) && (
            <Card>
              <CardContent className="grid gap-2 p-4 text-xs sm:grid-cols-2 lg:grid-cols-4">
                {emp.employmentType === "SALARIED" && (
                  <div className="rounded-lg bg-muted/50 p-2.5">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Salary model</p>
                    <p className="mt-0.5 font-semibold tabular-nums">{formatINR(emp.monthlySalary ?? 0)}/month</p>
                    <p className="text-[11px] text-muted-foreground">
                      {(emp.overtimeRate ?? 0) > 0
                        ? `Overtime ₹${emp.overtimeRate} per deployment beyond ${emp.overtimeThreshold ?? 30}/mo`
                        : "No overtime configured"}
                    </p>
                  </div>
                )}
                {emp.onBusinessRent && (
                  <div className="rounded-lg bg-muted/50 p-2.5">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Business accommodation rent</p>
                    <p className="mt-0.5 font-semibold tabular-nums">{formatINR(emp.rentAmount ?? 0)}/{(emp.rentMode ?? "MONTH").toLowerCase() === "day" ? "day" : "month"}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {emp.employmentType === "SALARIED"
                        ? `Auto-deducted from monthly salary on settlement (Net base: ${formatINR(Math.max(0, (emp.monthlySalary ?? 0) - (emp.rentAmount ?? 0)))}).`
                        : "Auto-deducted from employee earnings on settlement."}
                    </p>
                  </div>
                )}
                {emp.hasContractor && emp.contractorName && (
                  <div className="rounded-lg bg-muted/50 p-2.5">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Contractor</p>
                    <p className="mt-0.5 font-semibold">{emp.contractorName}</p>
                    <p className="text-[11px] text-muted-foreground tabular-nums">{formatINR(emp.contractorRateCut ?? 0)}/shift cut from payout, paid to the contractor</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Last-30-days presence strip */}
          <Card>
            <CardContent className="p-4">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Activity className="h-4 w-4 text-primary" aria-hidden />
                Attendance Presence (Last 30 Days)
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                <span><span className="font-bold tabular-nums text-foreground">{activity.worked}</span>/30 days worked</span>
                <span><span className="font-bold tabular-nums text-foreground">{activity.totalShifts}</span> shifts</span>
                <span><span className="font-bold tabular-nums text-foreground">{formatINR(activity.billed, { compact: true })}</span> billed</span>
              </div>
              <div className="mt-2.5 flex gap-[3px]" role="img" aria-label={`Worked ${activity.worked} of the last 30 days`}>
                {activity.list.map((d) => (
                  <div
                    key={d.date}
                    className={cn(
                      "h-5 flex-1 rounded-[3px] transition-transform hover:scale-125",
                      d.shifts === 0 && "bg-muted",
                      d.shifts === 1 && "bg-emerald-300 dark:bg-emerald-700",
                      d.shifts >= 2 && "bg-emerald-600 dark:bg-emerald-500"
                    )}
                    title={`${d.date} · ${d.shifts} shift${d.shifts === 1 ? "" : "s"} · ${formatINR(d.billing)}`}
                  />
                ))}
              </div>
              <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
                <span>30 days ago</span>
                <span className="flex items-center gap-1">Less <span className="h-2 w-3 rounded-[2px] bg-muted" aria-hidden /><span className="h-2 w-3 rounded-[2px] bg-emerald-300 dark:bg-emerald-700" aria-hidden /><span className="h-2 w-3 rounded-[2px] bg-emerald-600 dark:bg-emerald-500" aria-hidden /> More</span>
                <span>Today</span>
              </div>
            </CardContent>
          </Card>

          <DataTable
            columns={workColumns}
            rows={data?.deployments ?? []}
            rowKey={(r) => r.id}
            emptyIcon={CalendarDays}
            emptyTitle="No deployments yet"
            emptyDescription="Deploy this employee to a restaurant property to see records here."
          />
        </TabsContent>

        {/* TAB 3: ADVANCES & ADJUSTMENTS */}
        <TabsContent value="advances" className="mt-3 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Card>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase">Active Advance Balance</p>
                  <p className="text-xl font-bold tabular-nums text-foreground mt-1">
                    {formatINR(emp.advanceBalance ?? 0)}
                  </p>
                </div>
                <Button size="sm" onClick={() => setAdvanceOpen(true)}>Give Advance</Button>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase">Total Advances Given</p>
                  <p className="text-xl font-bold tabular-nums text-foreground mt-1">
                    {formatINR(advTotal)}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setAdjustOpen(true)}>Add Adjustment</Button>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm">Cash Advances History</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <DataTable
                columns={[
                  { key: "date", label: "Date", value: (r) => fmtDay(r.date), hideOnMobile: true },
                  {
                    key: "reason", label: "Details", primary: true,
                    render: (r) => (
                      <div className="min-w-0">
                        <p className="truncate font-medium">{r.reason || "Direct cash loan"}</p>
                        <p className="text-[11px] text-muted-foreground">{fmtDay(r.date)} · Ref: {r.reference || "None"}</p>
                      </div>
                    ),
                    value: (r) => r.reason || "Advance",
                  },
                  {
                    key: "amount", label: "Amount", className: "text-right",
                    render: (r) => <span className="font-semibold text-rose-600 dark:text-rose-400 tabular-nums">−{formatINR(r.amount)}</span>,
                    value: (r) => formatINR(r.amount),
                  },
                  {
                    key: "status", label: "Status",
                    render: (r) => r.settlementId ? (
                      <Badge variant="outline" className="bg-muted text-muted-foreground text-[10px]">Deducted in settlement</Badge>
                    ) : (
                      <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300 text-[10px]">Pending recovery</Badge>
                    ),
                    value: (r) => r.settlementId ? "Deducted" : "Pending",
                  },
                ]}
                rows={advances}
                rowKey={(r) => r.id}
                emptyIcon={HandCoins}
                emptyTitle="No advances recorded"
                emptyDescription="Advances given will appear here and be auto-deducted during settlement."
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm">Payroll Adjustments (Bonuses & Deductions)</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <DataTable
                columns={[
                  { key: "date", label: "Date", value: (r) => fmtDay(r.date), hideOnMobile: true },
                  {
                    key: "type", label: "Type", primary: true,
                    render: (r) => (
                      <div className="min-w-0">
                        <p className="truncate font-medium">{r.type}{r.reason ? ` · ${r.reason}` : ""}</p>
                        <p className="text-[11px] text-muted-foreground">{fmtDay(r.date)}</p>
                      </div>
                    ),
                    value: (r) => r.type,
                  },
                  {
                    key: "amount", label: "Amount", className: "text-right",
                    render: (r) => (
                      <span className={cn("font-semibold tabular-nums", r.amount >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                        {r.amount >= 0 ? "+" : ""}{formatINR(r.amount)}
                      </span>
                    ),
                    value: (r) => formatINR(r.amount),
                  },
                  { key: "by", label: "Recorded By", value: (r) => r.createdByName ?? "—", hideOnMobile: true },
                ]}
                rows={adjustments}
                rowKey={(r) => r.id}
                emptyIcon={ReceiptText}
                emptyTitle="No adjustments"
                emptyDescription="Bonuses, overtime and penalties appear here."
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 4: SETTLEMENTS */}
        <TabsContent value="settlements" className="mt-3">
          <DataTable
            columns={[
              { key: "month", label: "Month", primary: true, render: (r) => <span className="font-medium tabular-nums">{r.month}</span>, value: (r) => r.month },
              { key: "days", label: "Days", className: "text-right", value: (r) => String(r.totalDays ?? 0), hideOnMobile: true },
              { key: "gross", label: "Gross", className: "text-right", value: (r) => formatINR(r.grossEarnings ?? 0), hideOnMobile: true },
              { key: "rent", label: "Rent Deducted", className: "text-right", render: (r) => <span className="text-amber-700 dark:text-amber-400 font-medium tabular-nums">−{formatINR(r.rentDeducted ?? 0)}</span>, value: (r) => formatINR(r.rentDeducted ?? 0), hideOnMobile: true },
              { key: "advance", label: "Adv. Deducted", className: "text-right", render: (r) => <span className="text-rose-700 dark:text-rose-400 font-medium tabular-nums">−{formatINR(r.advanceDeducted ?? 0)}</span>, value: (r) => formatINR(r.advanceDeducted ?? 0), hideOnMobile: true },
              { key: "net", label: "Net Payable", className: "text-right", render: (r) => <span className="font-bold tabular-nums text-foreground">{formatINR(r.netPayable ?? 0)}</span>, value: (r) => formatINR(r.netPayable ?? 0) },
              { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} />, value: (r) => r.status },
            ]}
            rows={data?.settlements ?? []}
            rowKey={(r) => r.id}
            onRowClick={(r) => navigate("settlements", { month: r.month })}
            emptyIcon={ReceiptText}
            emptyTitle="No settlements yet"
            emptyDescription="Generate month-end settlements to see them here."
          />
        </TabsContent>

        {/* TAB 5: TERMS & PAY HISTORY LOG */}
        <TabsContent value="terms" className="mt-3 space-y-4">
          <Card>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm">Active Compensation Terms</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border p-3 bg-muted/20">
                <p className="text-xs text-muted-foreground uppercase font-medium">Employment Model</p>
                <p className="text-base font-bold mt-1">{emp.employmentType === "SALARIED" ? "Salaried Employee" : "Per-Shift Worker"}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {emp.employmentType === "SALARIED" ? `Fixed ${formatINR(emp.monthlySalary ?? 0)} / month` : `${formatINR(emp.standardRate ?? 0)} / shift`}
                </p>
              </div>
              <div className="rounded-lg border p-3 bg-muted/20">
                <p className="text-xs text-muted-foreground uppercase font-medium">Accommodation Rent</p>
                <p className="text-base font-bold mt-1">{emp.onBusinessRent ? formatINR(emp.rentAmount ?? 0) : "No Rent"}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {emp.onBusinessRent ? `Cycle: per ${emp.rentMode?.toLowerCase()}` : "Employee arranges own accommodation"}
                </p>
              </div>
              <div className="rounded-lg border p-3 bg-muted/20">
                <p className="text-xs text-muted-foreground uppercase font-medium">Contractor Commission</p>
                <p className="text-base font-bold mt-1">{emp.hasContractor ? emp.contractorName : "Direct Employee"}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {emp.hasContractor ? `${formatINR(emp.contractorRateCut ?? 0)}/shift cut from payout` : "No contractor commission"}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm">Terms & Pay Change History</CardTitle>
              <CardDescription className="text-xs">
                Audit trail of every rate, salary, or rent change made to this employee. Historical records preserve past rates.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <DataTable
                columns={[
                  { key: "date", label: "Effective From", value: (r) => fmtDay(r.effectiveFrom), hideOnMobile: true },
                  {
                    key: "terms", label: "Terms Applied", primary: true,
                    render: (r) => (
                      <div className="min-w-0">
                        <p className="font-medium text-xs">
                          {r.employmentType === "SALARIED" ? `Salaried: ${formatINR(r.monthlySalary)}/mo` : `Per-Shift: ${formatINR(r.standardRate)}/shift`}
                          {r.onBusinessRent && ` · Rent: ${formatINR(r.rentAmount)}`}
                        </p>
                        <p className="text-[11px] text-muted-foreground">{r.reason || "Terms updated"} · Effective {fmtDay(r.effectiveFrom)}</p>
                      </div>
                    ),
                    value: (r) => r.employmentType,
                  },
                  { key: "by", label: "Changed By", value: (r) => r.changedByName ?? "Admin", hideOnMobile: true },
                ]}
                rows={data?.payHistory ?? []}
                rowKey={(r) => r.id}
                emptyIcon={ShieldCheck}
                emptyTitle="No historical changes"
                emptyDescription="Any rate or rent adjustments will be recorded in this audit log."
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 6: FULL PROFILE */}
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
                    <p className="truncate text-sm font-medium" title={v ?? undefined}>{v || "—"}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
                <span className="mr-1 text-xs text-muted-foreground">Status control:</span>
                {["ACTIVE", "INACTIVE"].filter((s) => s !== emp.status).map((s) => (
                  <Button key={s} variant="outline" size="sm" className="h-8" disabled={saving} onClick={() => void changeStatus(s)}>
                    Mark {s.charAt(0) + s.slice(1).toLowerCase()}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <GiveAdvanceDialog open={advanceOpen} onOpenChange={setAdvanceOpen} defaultEmployeeId={id} employees={emp ? [{ id: emp.id, fullName: emp.fullName, code: emp.code, standardRate: emp.standardRate, advanceBalance: emp.advanceBalance }] : undefined} onDone={afterAdvance} />
      <AddAdjustmentDialog open={adjustOpen} onOpenChange={setAdjustOpen} employeeId={id} onDone={load} />
      <EmployeeFormDialog open={editOpen} onOpenChange={setEditOpen} employee={emp ?? null} onDone={load} />

      {/* [ADDED] Universal Formula Inspector Dialog */}
      <FormulaInspectorDialog open={inspectorOpen} onOpenChange={setInspectorOpen} data={inspectorData} />

      {/* [ADDED] Universal Transaction Lineage Dialog */}
      <TransactionLineageDialog
        open={Boolean(lineageData)}
        onOpenChange={(open) => {
          if (!open) setLineageData(null);
        }}
        data={lineageData}
      />
    </div>
  );
}
