"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/money";
import { Calculator, ArrowRight, Info, Plus, Minus, Equal } from "lucide-react";
import { cn } from "@/lib/utils";

// [ADDED] Universal Formula Inspector Dialog: Displays the transparent mathematical
// lineage of any metric card with plain-English explanation, visual equations, and itemized source rows.

export interface FormulaStep {
  label: string;
  amount: number;
  operation?: "add" | "subtract" | "result" | "info";
  detail?: string;
}

export interface SourceRow {
  id: string;
  title: string;
  subtitle?: string;
  amount: number | string;
  badge?: string;
  badgeTone?: "emerald" | "amber" | "red" | "gray";
  onClick?: () => void;
}

export interface FormulaInspectorData {
  title: string;
  subtitle?: string;
  period?: string;
  resultLabel: string;
  resultValue: number | string;
  formulaEquation: string; // e.g. "Gross Billed − Staff Cost − Incurred Expenses"
  steps: FormulaStep[];
  sourceRows?: SourceRow[];
  sourceRowsTitle?: string;
  notes?: string[];
}

interface FormulaInspectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: FormulaInspectorData | null;
}

export function FormulaInspectorDialog({
  open,
  onOpenChange,
  data,
}: FormulaInspectorDialogProps) {
  if (!data) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] sm:max-h-[88vh] sm:max-w-xl overflow-hidden flex flex-col p-0">
        <DialogHeader className="p-4 sm:p-5 pb-3 border-b bg-muted/20 shrink-0">
          <div className="flex items-center justify-between gap-2 pr-6">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <Calculator className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold">
                  {data.title}
                </DialogTitle>
                {data.subtitle && (
                  <DialogDescription className="text-xs text-muted-foreground">
                    {data.subtitle}
                  </DialogDescription>
                )}
              </div>
            </div>
            {data.period && (
              <Badge variant="outline" className="text-xs shrink-0 font-normal">
                {data.period}
              </Badge>
            )}
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 p-4 sm:p-5 overflow-y-auto min-h-0">
          <div className="space-y-4 pb-4">
            {/* Visual Equation Card */}
            <Card className="bg-slate-50 dark:bg-slate-900/50 border-border/70 shadow-none">
              <CardContent className="p-3.5 space-y-2">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Info className="h-3.5 w-3.5 text-primary" /> Plain English Formula
                </p>
                <p className="font-mono text-xs sm:text-sm font-semibold text-foreground break-words bg-background p-2 rounded border">
                  {data.formulaEquation}
                </p>
              </CardContent>
            </Card>

            {/* Step by Step Math */}
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Calculation Breakdown
              </p>
              <div className="divide-y divide-border/50 rounded-lg border bg-card text-xs">
                {data.steps.map((step, idx) => {
                  const isAdd = step.operation === "add";
                  const isSub = step.operation === "subtract";
                  const isResult = step.operation === "result";

                  return (
                    <div
                      key={idx}
                      className={cn(
                        "flex items-center justify-between p-3 gap-3",
                        isResult && "bg-muted/40 font-semibold text-sm"
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={cn(
                            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px]",
                            isAdd && "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
                            isSub && "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400",
                            isResult && "bg-primary text-primary-foreground",
                            !isAdd && !isSub && !isResult && "bg-muted text-muted-foreground"
                          )}
                        >
                          {isAdd && <Plus className="h-3 w-3" />}
                          {isSub && <Minus className="h-3 w-3" />}
                          {isResult && <Equal className="h-3 w-3" />}
                          {!isAdd && !isSub && !isResult && idx + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium text-foreground">{step.label}</p>
                          {step.detail && (
                            <p className="text-[10px] text-muted-foreground">{step.detail}</p>
                          )}
                        </div>
                      </div>
                      <span
                        className={cn(
                          "tabular-nums font-semibold shrink-0",
                          isAdd && "text-emerald-600 dark:text-emerald-400",
                          isSub && "text-rose-600 dark:text-rose-400",
                          isResult && "text-primary text-base"
                        )}
                      >
                        {isAdd && "+"}
                        {isSub && "−"}
                        {formatINR(step.amount)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Itemized Source Records */}
            {data.sourceRows && data.sourceRows.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <span>{data.sourceRowsTitle || "Contributing Records"}</span>
                  <Badge variant="secondary" className="text-[10px] h-4">
                    {data.sourceRows.length} {data.sourceRows.length === 1 ? "item" : "items"}
                  </Badge>
                </div>
                <div className="max-h-48 overflow-y-auto divide-y divide-border/40 rounded-lg border bg-card text-xs">
                  {data.sourceRows.map((row) => (
                    <div
                      key={row.id}
                      onClick={row.onClick}
                      className={cn(
                        "flex items-center justify-between p-2.5 hover:bg-muted/30 transition-colors gap-2",
                        row.onClick && "cursor-pointer"
                      )}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="font-medium text-foreground truncate">{row.title}</p>
                          {row.badge && (
                            <span
                              className={cn(
                                "text-[9px] px-1.5 py-0.2 rounded font-medium",
                                row.badgeTone === "emerald" && "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
                                row.badgeTone === "amber" && "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
                                row.badgeTone === "red" && "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
                                (!row.badgeTone || row.badgeTone === "gray") && "bg-muted text-muted-foreground"
                              )}
                            >
                              {row.badge}
                            </span>
                          )}
                        </div>
                        {row.subtitle && (
                          <p className="text-[10px] text-muted-foreground truncate">
                            {row.subtitle}
                          </p>
                        )}
                      </div>
                      <span className="tabular-nums font-medium shrink-0">
                        {typeof row.amount === "number" ? formatINR(row.amount) : row.amount}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Explanatory Notes & FAQ */}
            {data.notes && data.notes.length > 0 && (
              <div className="rounded-lg bg-blue-50/50 dark:bg-blue-950/20 p-3 border border-blue-200/50 dark:border-blue-900/40 text-xs space-y-1">
                <p className="font-semibold text-blue-900 dark:text-blue-300 flex items-center gap-1">
                  <Info className="h-3.5 w-3.5" /> Why does this matter?
                </p>
                <ul className="list-disc list-inside space-y-0.5 text-blue-800/90 dark:text-blue-300/90 text-[11px]">
                  {data.notes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="p-3 border-t bg-muted/20 shrink-0">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Close Inspector</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
