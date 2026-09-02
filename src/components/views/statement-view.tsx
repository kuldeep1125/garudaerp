"use client";

import { api } from "@/lib/api-client";
import { formatINR } from "@/lib/money";
import type { ViewProps } from "@/components/view-types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Printer, ArrowLeft, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type SettlementRec, type SettlementLineRec, type EmployeeRec, ErrorState, fmtDay, useAsync, initials,
} from "./_shared";

interface StatementResp {
  settlement: SettlementRec;
  employee: EmployeeRec;
  business: { name?: string; address?: string; contact?: string; gstin?: string; logoText?: string };
  lines: SettlementLineRec[];
}

const cellCls = "border border-neutral-300 px-2 py-1.5 print:border-neutral-500";

export default function StatementView({ params, navigate }: ViewProps) {
  const id = params?.id ?? "";

  const { data, loading, error, reload } = useAsync<StatementResp>(
    () => api.get(`/api/settlements/${id}/statement`),
    [id]
  );

  if (!id) {
    return (
      <div className="py-10">
        <ErrorState message="No settlement selected. Open a settlement and choose View Statement." />
        <div className="mt-4 flex justify-center">
          <Button variant="outline" className="min-h-10" onClick={() => navigate("settlements")}>
            <ArrowLeft className="h-4 w-4" aria-hidden />Back to Settlements
          </Button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4" aria-busy="true">
        <Skeleton className="h-10 w-44 rounded-xl" />
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="py-10">
        <ErrorState message={error ?? "Statement not found"} onRetry={() => void reload()} />
        <div className="mt-4 flex justify-center">
          <Button variant="outline" className="min-h-10" onClick={() => navigate("settlements")}>
            <ArrowLeft className="h-4 w-4" aria-hidden />Back to Settlements
          </Button>
        </div>
      </div>
    );
  }

  const { settlement: s, employee, business, lines } = data;
  const generatedAt = new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const monthLabel = (() => {
    const [y, m] = (s.month ?? "").split("-").map(Number);
    if (!y || !m) return s.month;
    return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  })();

  return (
    <div className="space-y-4">
      {/* Toolbar (never printed) */}
      <div className="no-print flex items-center justify-between gap-2">
        <Button variant="outline" className="min-h-10 gap-1.5" onClick={() => navigate("settlements")}>
          <ArrowLeft className="h-4 w-4" aria-hidden />Back
        </Button>
        <Button className="min-h-10 gap-1.5" onClick={() => window.print()}>
          <Printer className="h-4 w-4" aria-hidden />Print
        </Button>
      </div>

      {/* Print-ready statement */}
      <div
        className="print-area mx-auto w-full max-w-3xl rounded-xl border border-neutral-300 bg-white p-4 text-neutral-900 shadow-sm sm:p-8 print:rounded-none print:border-0 print:p-0 print:shadow-none"
        style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" } as React.CSSProperties}
      >
        {/* Letterhead */}
        <div className="flex flex-col gap-3 border-b-2 border-neutral-900 pb-4 sm:flex-row sm:items-start sm:justify-between print:text-black">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-neutral-900 text-lg font-bold text-white print:text-black print:[background:none] print:border-2 print:border-black">
              <span aria-hidden>{initials(business.logoText || business.name)}</span>
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold leading-tight sm:text-xl">{business.name ?? "Business"}</h1>
              {business.address && <p className="mt-0.5 text-xs leading-snug text-neutral-600 print:text-black">{business.address}</p>}
              {business.contact && <p className="text-xs text-neutral-600 print:text-black">Contact: {business.contact}</p>}
              {business.gstin && <p className="text-xs text-neutral-600 print:text-black">GSTIN: {business.gstin}</p>}
            </div>
          </div>
          <div className="sm:text-right">
            <h2 className="font-serif text-base font-bold uppercase tracking-widest sm:text-lg">Employee Salary Statement</h2>
            <p className="mt-1 text-sm font-semibold">{monthLabel}</p>
            <p className="text-xs text-neutral-600 print:text-black">Generated: {generatedAt}</p>
          </div>
        </div>

        {/* Employee block */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-b border-neutral-300 py-4 text-sm sm:grid-cols-4 print:text-black">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-neutral-500 print:text-black">Employee</p>
            <p className="font-semibold">{employee?.fullName ?? s.employeeName}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-neutral-500 print:text-black">Code</p>
            <p className="font-semibold tabular-nums">{employee?.code ?? s.employeeCode ?? "—"}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-neutral-500 print:text-black">Designation</p>
            <p className="font-semibold">{employee?.designation || "—"}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-neutral-500 print:text-black">Period</p>
            <p className="font-semibold">{monthLabel}</p>
          </div>
        </div>

        {/* Work lines */}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="bg-neutral-100 print:[background:none]">
                <th className={cn(cellCls, "text-left font-semibold")}>Date</th>
                <th className={cn(cellCls, "text-left font-semibold")}>Property</th>
                <th className={cn(cellCls, "text-left font-semibold")}>Shift</th>
                <th className={cn(cellCls, "text-right font-semibold")}>Rate</th>
                <th className={cn(cellCls, "text-right font-semibold")}>Earning</th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 && (
                <tr><td className={cn(cellCls, "text-center")} colSpan={5}>No work lines recorded</td></tr>
              )}
              {lines.map((l, i) => (
                <tr key={`${l.date}-${l.propertyName}-${i}`}>
                  <td className={cn(cellCls, "whitespace-nowrap tabular-nums")}>{fmtDay(l.date)}</td>
                  <td className={cellCls}>{l.propertyName}</td>
                  <td className={cellCls}>{l.shift === "NIGHT" ? "Night" : "Day"}</td>
                  <td className={cn(cellCls, "text-right tabular-nums")}>{formatINR(l.rate, { decimals: true })}</td>
                  <td className={cn(cellCls, "text-right tabular-nums")}>{formatINR(l.amount, { decimals: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="mt-5 flex justify-end print:text-black">
          <div className="w-full max-w-sm border-collapse text-sm">
            <div className="flex justify-between border-b border-neutral-300 py-1.5">
              <span className="text-neutral-600 print:text-black">Total working days</span>
              <span className="font-semibold tabular-nums">{s.totalDays ?? 0}</span>
            </div>
            <div className="flex justify-between border-b border-neutral-300 py-1.5">
              <span className="text-neutral-600 print:text-black">Day / Night shifts</span>
              <span className="font-semibold tabular-nums">{s.dayShifts ?? 0} / {s.nightShifts ?? 0}</span>
            </div>
            <div className="flex justify-between border-b border-neutral-300 py-1.5">
              <span className="text-neutral-600 print:text-black">Gross earnings</span>
              <span className="font-semibold tabular-nums">{formatINR(s.grossEarnings ?? 0, { decimals: true })}</span>
            </div>
            <div className="flex justify-between border-b border-neutral-300 py-1.5">
              <span className="text-neutral-600 print:text-black">Additions</span>
              <span className="font-semibold tabular-nums">+{formatINR(s.additions ?? 0, { decimals: true })}</span>
            </div>
            <div className="flex justify-between border-b border-neutral-300 py-1.5">
              <span className="text-neutral-600 print:text-black">Advance deducted</span>
              <span className="font-semibold tabular-nums">−{formatINR(s.advanceDeducted ?? 0, { decimals: true })}</span>
            </div>
            <div className="flex justify-between border-b border-neutral-300 py-1.5">
              <span className="text-neutral-600 print:text-black">Other deductions</span>
              <span className="font-semibold tabular-nums">−{formatINR(s.otherDeductions ?? 0, { decimals: true })}</span>
            </div>
            {(s.advanceCarryForward ?? 0) !== 0 && (
              <div className="flex justify-between border-b border-neutral-300 py-1.5">
                <span className="text-neutral-600 print:text-black">Advance carry-forward</span>
                <span className="font-semibold tabular-nums">{formatINR(s.advanceCarryForward ?? 0, { decimals: true })}</span>
              </div>
            )}
            <div className="mt-2 flex items-center justify-between border-2 border-neutral-900 bg-neutral-100 px-3 py-2.5 print:[background:none]">
              <span className="text-xs font-bold uppercase tracking-widest">Net Payable</span>
              <span className="text-lg font-bold tabular-nums">{formatINR(s.netPayable ?? 0, { decimals: true })}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 flex flex-col gap-1 border-t border-neutral-300 pt-3 text-[10px] text-neutral-500 sm:flex-row sm:items-center sm:justify-between print:text-black">
          <p>
            System-generated · Ref #{s.id.slice(-8)}{s.employeeCode ? ` · Emp ${s.employeeCode}` : ""} · {monthLabel}
          </p>
          <p>
            {business.contact ? `${business.name ?? ""} · ${business.contact} · ` : ""}Printed {generatedAt}
          </p>
        </div>
      </div>

      {/* Screen-only helper */}
      <p className="no-print mx-auto max-w-3xl text-center text-xs text-muted-foreground">
        <FileText className="mr-1 inline h-3 w-3" aria-hidden />
        Use Print to save as PDF or print — the toolbar is excluded automatically.
      </p>
    </div>
  );
}
