"use client";

import React, { useState, useEffect } from "react";
import { api } from "@/lib/api-client";
import { formatINR } from "@/lib/money";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  RefreshCw,
  Scale,
  Building2,
  Users,
  Truck,
  ArrowRight,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Wrench,
  Landmark,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export interface LedgerEquation {
  id: string;
  name: string;
  leftSideLabel: string;
  leftSideValue: number;
  rightSideLabel: string;
  rightSideValue: number;
  difference: number;
  balanced: boolean;
  domain: string;
  formula: string;
}

export interface IntegrityAuditResp {
  ok: boolean;
  driftCount: number;
  overpaidDeployments: number;
  reconciliationDrift: number;
  orphanPayments: number;
  overCollectedTrips: number;
  settlementDrift: number;
  contractorCutDrift: number;
  expenseCategoryMissing: number;
  equations?: LedgerEquation[];
}

interface ReconciliationCenterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate?: (view: string, params?: Record<string, string>) => void;
}

const COMMON_EXPLAINERS = [
  {
    q: "Why does Collections not equal Today Billing?",
    a: "Billing measures ACCRUAL WORK performed (invoices generated for shifts worked today). Collections measures CASH FLOW (actual money received into bank/cash accounts today, which often settles past weeks' or months' invoices). They are meant to differ on a day-to-day basis and reconcile over time.",
  },
  {
    q: "Why is Employee Net Payout lower than Gross Wages?",
    a: "Gross Wages represent the total shift earnings or base salary. If an employee stays in business accommodation, their company housing rent is deducted automatically. Furthermore, any cash advances or loans disbursed earlier are recovered, leaving the Net Estimated Payout.",
  },
  {
    q: "Why do Owner Contributions not increase Operating Profit?",
    a: "Capital contributed by an owner into company accounts is equity/capital, not operational revenue. Treating owner capital as income would falsely inflate business performance. It is tracked separately in the Owner 360° Passbook.",
  },
  {
    q: "How does Garuda earn margin on restaurants?",
    a: "For every shift, the restaurant is billed at the agreed Property Billing Rate (e.g. ₹800/shift). The deployed staff member is paid the Staff Payout Rate (e.g. ₹500/shift). The difference (₹300/shift) is Garuda's direct gross operating margin.",
  },
];

export function ReconciliationCenterDialog({
  open,
  onOpenChange,
  onNavigate,
}: ReconciliationCenterDialogProps) {
  const [loading, setLoading] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [auditData, setAuditData] = useState<IntegrityAuditResp | null>(null);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"equations" | "diagnostics" | "faq">("equations");

  const runAudit = async () => {
    setLoading(true);
    try {
      const res = await api.get<IntegrityAuditResp>("/api/settings/integrity");
      setAuditData(res);
    } catch {
      // Handled silently
    } finally {
      setLoading(false);
    }
  };

  const runAutoRepair = async () => {
    setRepairing(true);
    try {
      await api.post("/api/settings/integrity");
      toast.success("Zero-drift FIFO repair completed successfully");
      await runAudit();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Auto-repair failed");
    } finally {
      setRepairing(false);
    }
  };

  useEffect(() => {
    if (open) {
      void runAudit();
    }
  }, [open]);

  const hasDrift = auditData && auditData.driftCount > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="p-5 pb-3 border-b bg-muted/20">
          <div className="flex items-center justify-between gap-2">
            <Badge
              variant="outline"
              className={cn(
                "text-[11px] font-semibold tracking-wide",
                hasDrift
                  ? "border-red-300 text-red-600 bg-red-50 dark:bg-red-950/40"
                  : "border-emerald-300 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40"
              )}
            >
              {hasDrift ? `${auditData.driftCount} Discrepancies Detected` : "100% Mathematically Reconciled"}
            </Badge>
            <div className="flex items-center gap-1.5">
              {hasDrift && (
                <Button
                  variant="default"
                  size="sm"
                  className="h-8 gap-1.5 text-xs bg-amber-600 hover:bg-amber-700 text-white"
                  onClick={() => void runAutoRepair()}
                  disabled={repairing}
                >
                  <Wrench className={cn("h-3.5 w-3.5", repairing && "animate-spin")} />
                  <span>{repairing ? "Repairing…" : "Auto-Repair FIFO"}</span>
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => void runAudit()}
                disabled={loading}
              >
                <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
                <span>Re-check</span>
              </Button>
            </div>
          </div>
          <DialogTitle className="text-lg font-bold mt-1.5 flex items-center gap-2">
            <Scale className="h-5 w-5 text-primary shrink-0" />
            <span>Automated Accounting Watchdog & Health Center</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Continuous verification of the 5 core double-entry accounting formulas across all company ledgers.
          </DialogDescription>

          {/* Sub-nav tabs */}
          <div className="flex items-center gap-2 mt-3 pt-2 border-t text-xs font-medium">
            <button
              type="button"
              onClick={() => setActiveTab("equations")}
              className={cn(
                "px-3 py-1.5 rounded-lg transition-colors",
                activeTab === "equations"
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              5 Core Equations Proof
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("diagnostics")}
              className={cn(
                "px-3 py-1.5 rounded-lg transition-colors",
                activeTab === "diagnostics"
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              Diagnostic Checklist
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("faq")}
              className={cn(
                "px-3 py-1.5 rounded-lg transition-colors",
                activeTab === "faq"
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              Plain-English Explainers
            </button>
          </div>
        </DialogHeader>

        <div className="p-5 space-y-4 max-h-[72vh] overflow-y-auto">
          {/* Status Banner */}
          <div
            className={cn(
              "p-3.5 rounded-xl border flex items-start gap-3 transition-colors",
              hasDrift
                ? "bg-red-50/70 dark:bg-red-950/30 border-red-200 dark:border-red-900"
                : "bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900"
            )}
          >
            {hasDrift ? (
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-bold text-sm text-foreground">
                {hasDrift
                  ? `${auditData?.driftCount} Accounting Anomalies Need Attention`
                  : "All 5 Core Mathematical Equations Match with 0 Drift"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {hasDrift
                  ? "The system detected an unallocated entry or settlement drift. You can click 'Auto-Repair FIFO' above to safely rebalance allocations without altering source records."
                  : "Every property ledger balance, wage liability, trip invoice, owner equity, and treasury balance reconciles across all screens."}
              </p>
            </div>
          </div>

          {/* TAB 1: 5 Core Equations Proof */}
          {activeTab === "equations" && (
            <div className="space-y-3">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                <span>Live Double-Entry Balance Proofs</span>
              </p>

              {(auditData?.equations ?? []).map((eq) => (
                <div key={eq.id} className="rounded-xl border p-3.5 bg-card space-y-2 hover:border-primary/40 transition-colors">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge variant="outline" className="text-[10px] uppercase font-bold shrink-0">
                        {eq.domain}
                      </Badge>
                      <span className="font-semibold text-xs text-foreground truncate">{eq.name}</span>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] font-bold shrink-0",
                        eq.balanced ? "text-emerald-600 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30" : "text-red-600 border-red-300 bg-red-50 dark:bg-red-950/30"
                      )}
                    >
                      {eq.balanced ? "BALANCED (₹0 DRIFT)" : `MISMATCH: ₹${eq.difference}`}
                    </Badge>
                  </div>

                  <p className="text-[11px] text-muted-foreground font-mono bg-muted/40 px-2.5 py-1 rounded">
                    {eq.formula}
                  </p>

                  <div className="grid grid-cols-2 gap-2 text-center pt-1">
                    <div className="p-2 rounded-lg bg-muted/30 border">
                      <p className="text-[10px] text-muted-foreground uppercase">{eq.leftSideLabel}</p>
                      <p className="text-sm font-bold tabular-nums text-foreground">{formatINR(eq.leftSideValue)}</p>
                    </div>
                    <div className="p-2 rounded-lg bg-muted/30 border">
                      <p className="text-[10px] text-muted-foreground uppercase">{eq.rightSideLabel}</p>
                      <p className="text-sm font-bold tabular-nums text-foreground">{formatINR(eq.rightSideValue)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* TAB 2: Diagnostic Checklist */}
          {activeTab === "diagnostics" && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                <span>System Component Diagnostics</span>
              </p>

              <div className="border rounded-xl divide-y overflow-hidden text-xs">
                {/* Check 1: Property Ledger Balance */}
                <div className="p-3 flex items-center justify-between gap-3 bg-card hover:bg-muted/30">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className="p-1.5 rounded-lg bg-primary/10 text-primary shrink-0 mt-0.5">
                      <Building2 className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground">Property Ledger & Collections</p>
                      <p className="text-[11px] text-muted-foreground">
                        Total Invoiced − Total Received ≡ Outstanding Due
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] font-bold shrink-0",
                      (auditData?.reconciliationDrift ?? 0) === 0
                        ? "text-emerald-600 border-emerald-300"
                        : "text-red-600 border-red-300"
                    )}
                  >
                    {(auditData?.reconciliationDrift ?? 0) === 0 ? "100% MATCH" : `${auditData?.reconciliationDrift} DRIFT`}
                  </Badge>
                </div>

                {/* Check 2: Settlement Header vs Lines */}
                <div className="p-3 flex items-center justify-between gap-3 bg-card hover:bg-muted/30">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className="p-1.5 rounded-lg bg-primary/10 text-primary shrink-0 mt-0.5">
                      <Users className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground">Employee Settlements & Deductions</p>
                      <p className="text-[11px] text-muted-foreground">
                        Gross Wages + Additions − Rent − Advances ≡ Net Payable
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] font-bold shrink-0",
                      (auditData?.settlementDrift ?? 0) === 0
                        ? "text-emerald-600 border-emerald-300"
                        : "text-red-600 border-red-300"
                    )}
                  >
                    {(auditData?.settlementDrift ?? 0) === 0 ? "100% MATCH" : `${auditData?.settlementDrift} DRIFT`}
                  </Badge>
                </div>

                {/* Check 3: Trip Invoicing & Collections */}
                <div className="p-3 flex items-center justify-between gap-3 bg-card hover:bg-muted/30">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 shrink-0 mt-0.5">
                      <Truck className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground">Vehicle Trips & Fleet Target</p>
                      <p className="text-[11px] text-muted-foreground">
                        Payments recorded bounded by agreed trip invoice amounts
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] font-bold shrink-0",
                      (auditData?.overCollectedTrips ?? 0) === 0
                        ? "text-emerald-600 border-emerald-300"
                        : "text-red-600 border-red-300"
                    )}
                  >
                    {(auditData?.overCollectedTrips ?? 0) === 0 ? "100% MATCH" : `${auditData?.overCollectedTrips} DRIFT`}
                  </Badge>
                </div>

                {/* Check 4: Unallocated Orphan Records */}
                <div className="p-3 flex items-center justify-between gap-3 bg-card hover:bg-muted/30">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className="p-1.5 rounded-lg bg-muted text-muted-foreground shrink-0 mt-0.5">
                      <Scale className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground">Orphaned Transactions</p>
                      <p className="text-[11px] text-muted-foreground">
                        Payments missing properties or expenses missing categories
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] font-bold shrink-0",
                      (auditData?.orphanPayments ?? 0) + (auditData?.expenseCategoryMissing ?? 0) === 0
                        ? "text-emerald-600 border-emerald-300"
                        : "text-red-600 border-red-300"
                    )}
                  >
                    {(auditData?.orphanPayments ?? 0) + (auditData?.expenseCategoryMissing ?? 0) === 0
                      ? "0 ORPHANS"
                      : "UNLINKED ROWS"}
                  </Badge>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Plain-English Calculation Explainer Section */}
          {activeTab === "faq" && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <HelpCircle className="h-3.5 w-3.5 text-primary" />
                <span>Common Calculation Questions Answered</span>
              </p>

              <div className="space-y-1.5">
                {COMMON_EXPLAINERS.map((item, idx) => {
                  const isOpen = expandedFaq === idx;
                  return (
                    <Card
                      key={idx}
                      className="border-border/60 shadow-none cursor-pointer hover:border-primary/40 transition-colors"
                      onClick={() => setExpandedFaq(isOpen ? null : idx)}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between gap-2 text-xs font-semibold text-foreground">
                          <span>{item.q}</span>
                          {isOpen ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                          )}
                        </div>
                        {isOpen && (
                          <p className="mt-2 text-xs text-muted-foreground leading-relaxed pt-2 border-t">
                            {item.a}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
