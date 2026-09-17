"use client";

import { useState } from "react"; // [ADDED]
import { api } from "@/lib/api-client";
import { formatINR, round2 } from "@/lib/money"; // [ADDED] round2
import type { ViewProps } from "@/components/view-types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Printer, ArrowLeft, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type SettlementRec, type SettlementLineRec, type EmployeeRec, ErrorState, fmtDay, useAsync, initials,
} from "./_shared";
import { PrintLetterhead } from "@/components/shared/print-letterhead";

interface StatementResp {
  settlement: SettlementRec;
  employee: EmployeeRec;
  business: { name?: string; address?: string; contact?: string; gstin?: string; logoText?: string };
  lines: SettlementLineRec[];
}

const cellCls = "border border-neutral-300 px-2 py-1.5 print:border-neutral-500";

export default function StatementView({ params, navigate }: ViewProps) {
  const id = params?.id ?? "";
  const [viewMode, setViewMode] = useState<"EMPLOYEE" | "AGENCY">("EMPLOYEE"); // [FIXED] Move hook to top of component before early returns

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

  const hasContractorCut = (s.contractorCut ?? 0) > 0;
  const isEmployeeMode = viewMode === "EMPLOYEE" && hasContractorCut;

  // [ADDED] In Employee mode, gross reflects the net rate owed to the employee (e.g. ₹500/shift instead of ₹600)
  // so the contractor fee is 100% confidential and omitted from the worker's payslip.
  const displayGross = isEmployeeMode
    ? Math.max(0, round2((s.grossEarnings ?? 0) - (s.contractorCut ?? 0)))
    : (s.grossEarnings ?? 0);

  // Distribute contractor cut across regular shift lines in employee mode so line item rates match the gross
  const shiftLines = lines.filter((l) => l.shift !== "SALARY" && l.shift !== "OVERTIME" && l.shift !== "RENT");
  const totalShiftUnits = shiftLines.reduce((sum, l) => sum + (l.shift === "FULL" ? 2 : 1), 0) || shiftLines.length || 1;
  const cutPerUnit = hasContractorCut ? (s.contractorCut ?? 0) / totalShiftUnits : 0;

  const displayLines = lines.map((l) => {
    if (isEmployeeMode && l.shift !== "SALARY" && l.shift !== "OVERTIME" && l.shift !== "RENT") {
      const units = l.shift === "FULL" ? 2 : 1;
      const netRate = Math.max(0, round2(l.rate - cutPerUnit));
      const netAmount = Math.max(0, round2(l.amount - (cutPerUnit * units)));
      return { ...l, rate: netRate, amount: netAmount };
    }
    return l;
  });

  return (
    <div className="space-y-4">
      {/* Toolbar (never printed) */}
      <div className="no-print flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <Button variant="outline" className="min-h-10 gap-1.5" onClick={() => navigate("settlements")}>
          <ArrowLeft className="h-4 w-4" aria-hidden />Back
        </Button>

        <div className="flex flex-wrap items-center gap-2">
          {hasContractorCut && (
            <div className="flex items-center rounded-lg border border-border bg-muted/60 p-1 text-xs" role="tablist" aria-label="Statement format">
              <button
                type="button"
                onClick={() => setViewMode("EMPLOYEE")}
                className={cn(
                  "rounded-md px-3 py-1.5 font-medium transition-colors",
                  viewMode === "EMPLOYEE"
                    ? "bg-background text-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
                title="Hides contractor cut, sets shift rate to net wage (₹500/shift) — safe to send to the worker"
              >
                Employee Slip (Confidential)
              </button>
              <button
                type="button"
                onClick={() => setViewMode("AGENCY")}
                className={cn(
                  "rounded-md px-3 py-1.5 font-medium transition-colors",
                  viewMode === "AGENCY"
                    ? "bg-background text-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
                title="Shows full breakdown with contractor commission — for contractor or internal records"
              >
                Contractor / Agency Copy
              </button>
            </div>
          )}
          <Button className="min-h-10 gap-1.5" onClick={() => window.print()}>
            <Printer className="h-4 w-4" aria-hidden />Print / Save PDF
          </Button>
        </div>
      </div>

      {/* Screen-only badge explaining active statement format */}
      {hasContractorCut && (
        <div className="no-print mx-auto max-w-3xl rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground flex items-center justify-between gap-2">
          <span>
            {isEmployeeMode ? (
              <>
                <strong className="text-foreground">Employee Payslip Active:</strong> Contractor cut is completely hidden; rates and gross reflect employee direct wage ({formatINR(displayGross)}). Ready to send to worker.
              </>
            ) : (
              <>
                <strong className="text-foreground">Contractor / Agency Copy Active:</strong> Full transparency showing {formatINR(s.grossEarnings)} gross and {formatINR(s.contractorCut ?? 0)} contractor cut.
              </>
            )}
          </span>
        </div>
      )}

      {/* Print-ready statement */}
      <div
        className="print-area mx-auto w-full max-w-3xl rounded-xl border border-neutral-300 bg-white p-4 text-neutral-900 shadow-sm sm:p-8 print:rounded-none print:border-0 print:p-0 print:shadow-none"
        style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" } as React.CSSProperties}
      >
        {/* Print-only brand strip (hidden on screen) */}
        <PrintLetterhead businessName={business.name} className="mb-4" />

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
            <h2 className="font-serif text-base font-bold uppercase tracking-widest sm:text-lg">
              {isEmployeeMode ? "Employee Salary Payslip" : hasContractorCut ? "Agency & Contractor Statement" : "Employee Salary Statement"}
            </h2>
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
        <div className="mt-4 overflow-x-auto"> {/* [FIXED] remove scroll-shadows which injected dark-mode var(--card) black gradient on white statement document */}
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
              {displayLines.length === 0 && (
                <tr><td className={cn(cellCls, "text-center")} colSpan={5}>No work lines recorded</td></tr>
              )}
              {displayLines.map((l, i) => (
                <tr key={`${l.date}-${l.propertyName}-${i}`}>
                  <td className={cn(cellCls, "whitespace-nowrap tabular-nums")}>{fmtDay(l.date)}</td>
                  <td className={cellCls}>{l.propertyName}</td>
                  <td className={cellCls}>{l.shift === "SALARY" ? "Salary" : l.shift === "OVERTIME" ? "Overtime" : l.shift === "RENT" ? "Rent" : l.shift === "NIGHT" ? "Night" : l.shift === "FULL" ? "Full" : "Day"}</td>
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
              <span className="font-semibold tabular-nums">{formatINR(displayGross, { decimals: true })}</span>
            </div>
            <div className="flex justify-between border-b border-neutral-300 py-1.5">
              <span className="text-neutral-600 print:text-black">Additions</span>
              <span className="font-semibold tabular-nums">+{formatINR(s.additions ?? 0, { decimals: true })}</span>
            </div>
            {(s.rentDeducted ?? 0) > 0 && (
              <div className="flex justify-between border-b border-neutral-300 py-1.5">
                <span className="text-neutral-600 print:text-black">Accommodation rent</span>
                <span className="font-semibold tabular-nums text-teal-700 print:text-black">−{formatINR(s.rentDeducted ?? 0, { decimals: true })}</span>
              </div>
            )}
            {!isEmployeeMode && (s.contractorCut ?? 0) > 0 && (
              <div className="flex justify-between border-b border-neutral-300 py-1.5">
                <span className="text-neutral-600 print:text-black">Contractor commission</span>
                <span className="font-semibold tabular-nums">−{formatINR(s.contractorCut ?? 0, { decimals: true })}</span>
              </div>
            )}
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
