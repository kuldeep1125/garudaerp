"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { formatINR } from "@/lib/money";
import type { ViewProps } from "@/components/view-types";
import { MonthPicker, toMonth } from "@/components/shared/month-picker";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  CalendarRange, ClipboardCopy, Crown, EllipsisVertical, Info, KeyRound, Mail, MessageCircle, Minus, Pencil,
  Plus, Send, ShieldCheck, TrendingDown, TrendingUp, UserPlus, Wallet, IndianRupee, ArrowDownLeft, ArrowUpRight,
  FileText, CheckCircle, Clock, GitCommit, RefreshCw,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatCard } from "@/components/shared/stat-card";
import {
  FormulaInspectorDialog,
  type FormulaInspectorData,
} from "@/components/shared/formula-inspector-dialog";
import {
  TransactionLineageDialog,
  type TransactionLineageData,
} from "@/components/shared/transaction-lineage-dialog";
import {
  Field, InitialAvatar, ListResp, errMessage, fmtDay, useAsync, useMutation,
} from "./_shared";
import { useAuth } from "@/components/providers";
import { ExpenseFormDialog, type ExpensePreset } from "./expenses-view";

// ---------------------------------------------------------------------------
// Owner row shape (GET /api/owners → { items })
// ---------------------------------------------------------------------------

interface EmailRow {
  key: string; label: string; value: number; previous: number;
  pct: number | null; goodUp: boolean;
}

interface EmailPreview {
  owner: { id: string; name: string; username: string; mobile: string | null; isActive: boolean };
  month: string; prevMonth: string; monthLabel: string; prevMonthLabel: string;
  subject: string;
  rows: EmailRow[];
  activity: { deployments: number; trips: number; advances: number; emi: number };
  insights: string[];
  note: string;
  bodyText: string;
  disclaimer: string;
}

interface OwnerRow {
  id: string;
  name: string;
  username: string;
  mobile?: string | null;
  isActive: boolean;
  createdAt?: string;
  createdRecords?: number;
}

// ---------------------------------------------------------------------------
// Monthly summary email dialog (mock send — audit-logged)
// ---------------------------------------------------------------------------

function EmailDeltaPill({ pct, goodUp }: { pct: number | null; goodUp: boolean }) {
  if (pct === null) {
    return <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary">new</span>;
  }
  if (pct === 0) {
    return <span className="inline-flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground"><Minus className="h-2.5 w-2.5" aria-hidden />0%</span>;
  }
  const up = pct > 0;
  const good = up === goodUp;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold tabular-nums",
        good
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
          : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
      )}
    >
      <Icon className="h-2.5 w-2.5" aria-hidden />{up ? "+" : ""}{pct}%
    </span>
  );
}

function MonthlyEmailDialog({ target, onClose }: { target: OwnerRow; onClose: () => void }) {
  const [month, setMonth] = useState<string>(() => toMonth());
  const { data, loading, error, reload } = useAsync<EmailPreview>(
    () => api.get<EmailPreview>(`/api/owners/monthly-email?ownerId=${target.id}&month=${month}`),
    [month, target.id]
  );
  const { mutate, saving } = useMutation();

  const copyText = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.bodyText);
      toast.success("Email text copied to clipboard");
    } catch {
      toast.error("Could not copy — clipboard unavailable");
    }
  };

  const markSent = async () => {
    const res = await mutate(
      () => api.post("/api/owners/monthly-email", { ownerId: target.id, month }),
      `Summary email logged as sent to ${target.name}`
    );
    if (res.ok) onClose();
  };

  // WhatsApp share — opens WhatsApp with the summary prefilled (mock, no server
  // delivery). Prefers the owner's mobile number; falls back to a blank share sheet.
  const waHref = (() => {
    const digits = (target.mobile ?? "").replace(/\D/g, "");
    const text = encodeURIComponent(data?.bodyText ?? "");
    return digits ? `https://wa.me/${digits}?text=${text}` : `https://wa.me/?text=${text}`;
  })();

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" aria-hidden />
            Monthly summary — {target.name}
          </DialogTitle>
          <DialogDescription>
            Composed from the same numbers as the dashboard summary card. Sending is a logged mock until Phase 2.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <MonthPicker month={month} onChange={setMonth} />
          {data && (
            <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={copyText}>
              <ClipboardCopy className="h-3.5 w-3.5" aria-hidden />Copy text
            </Button>
          )}
        </div>

        {loading && (
          <div className="space-y-2">
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50/60 p-4 text-center dark:border-red-900 dark:bg-red-950/30">
            <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
            <Button variant="outline" size="sm" className="mt-2 h-8" onClick={() => void reload()}>Retry</Button>
          </div>
        )}

        {data && !loading && (
          <div className="overflow-hidden rounded-xl border" aria-label="Email preview">
            {/* Email envelope header */}
            <div className="space-y-1 border-b bg-muted/40 px-4 py-3 text-xs">
              <p className="flex gap-2"><span className="w-12 shrink-0 font-semibold text-muted-foreground">From</span><span className="min-w-0 truncate">BizHub &lt;reports@bizhub.app&gt;</span></p>
              <p className="flex gap-2"><span className="w-12 shrink-0 font-semibold text-muted-foreground">To</span><span className="min-w-0 truncate">{data.owner.name} &lt;{data.owner.mobile || `@${data.owner.username}`}&gt;</span></p>
              <p className="flex gap-2"><span className="w-12 shrink-0 font-semibold text-muted-foreground">Subject</span><span className="min-w-0 font-semibold text-foreground">{data.subject}</span></p>
            </div>

            {/* Body */}
            <div className="space-y-4 px-4 py-4">
              <p className="text-sm">Hi <span className="font-semibold">{data.owner.name}</span>,</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Here is your BizHub business summary for <span className="font-semibold text-foreground">{data.monthLabel}</span> (compared with {data.prevMonthLabel}).
              </p>

              <div className="overflow-hidden rounded-lg border">
                <p className="border-b bg-muted/40 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Key numbers</p>
                <div className="divide-y">
                  {data.rows.map((r) => (
                    <div
                      key={r.key}
                      className={cn(
                        "flex items-center justify-between gap-2 px-3 py-2 text-xs transition-colors hover:bg-muted/40",
                        r.key === "net" && "bg-muted/30 font-semibold"
                      )}
                    >
                      <span className={cn("min-w-0 truncate", r.key !== "net" && "text-muted-foreground")}>{r.label}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="font-bold tabular-nums">{formatINR(r.value)}</span>
                        <span className="hidden text-[10px] tabular-nums text-muted-foreground sm:inline">was {formatINR(r.previous)}</span>
                        <EmailDeltaPill pct={r.pct} goodUp={r.goodUp} />
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="rounded-full bg-muted px-2 py-0.5">{data.activity.deployments} deployments</span>
                <span className="rounded-full bg-muted px-2 py-0.5">{data.activity.trips} trips</span>
                <span className="rounded-full bg-muted px-2 py-0.5">advances {formatINR(data.activity.advances, { compact: true })}</span>
                <span className="rounded-full bg-muted px-2 py-0.5">EMI {formatINR(data.activity.emi, { compact: true })}</span>
              </div>

              {data.insights.length > 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2" role="note">
                  <CalendarRange className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                  <ul className="min-w-0 space-y-0.5">
                    {data.insights.map((line) => (
                      <li key={line} className="text-[11px] leading-relaxed">{line}</li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="text-[10px] leading-relaxed text-muted-foreground">{data.note}</p>
              <p className="text-[10px] italic text-muted-foreground">— BizHub · automated summary</p>
            </div>
          </div>
        )}

        {data && (
          <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />{data.disclaimer}
          </p>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" className="min-h-10 flex-1 sm:flex-none" onClick={onClose}>Close</Button>
          {data && (
            <Button
              variant="outline"
              className="min-h-10 flex-1 gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950 sm:flex-none"
              asChild
            >
              <a href={waHref} target="_blank" rel="noreferrer" aria-label={`Share this summary with ${target.name} on WhatsApp`}>
                <MessageCircle className="h-3.5 w-3.5" aria-hidden />WhatsApp
              </a>
            </Button>
          )}
          <Button className="min-h-10 flex-1 gap-1.5 sm:flex-none" onClick={markSent} disabled={loading || !data || saving}>
            <Send className="h-3.5 w-3.5" aria-hidden />{saving ? "Logging…" : "Mark as sent"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Owner 360° Passbook & Partner Capital Ledger Dialog
// ---------------------------------------------------------------------------

interface OwnerPassbookResp {
  owner: OwnerRow & { createdRecords?: number };
  summary: {
    contributions: number;
    drawings: number;
    outOfPocketSpend: number;
    refunds?: number;
    netBalance: number;
    recordsCount: number;
  };
  passbook: Array<{
    id: string;
    date: string;
    createdAt: string;
    type: "CONTRIBUTION" | "DRAWING" | "OUT_OF_POCKET" | "REFUND";
    title: string;
    subtitle: string;
    inflow: number;
    outflow: number;
    balance: number;
    notes?: string | null;
  }>;
  audits: Array<{
    id: string;
    action: string;
    module: string;
    recordLabel?: string | null;
    createdAt: string;
  }>;
}

function OwnerPassbookDialog({ target, onClose }: { target: OwnerRow; onClose: () => void }) {
  const { data, loading, error, reload } = useAsync<OwnerPassbookResp>(
    () => api.get<OwnerPassbookResp>(`/api/owners/${target.id}/passbook`),
    [target.id]
  );
  const [inspectorData, setInspectorData] = useState<FormulaInspectorData | null>(null);
  const [lineageData, setLineageData] = useState<TransactionLineageData | null>(null);
  const [expenseFormOpen, setExpenseFormOpen] = useState(false);
  const [expensePreset, setExpensePreset] = useState<ExpensePreset | null>(null);

  const openNewDeposit = () => {
    setExpensePreset({
      type: "DEPOSIT",
      categoryName: "Owner Contribution",
      spentById: target.id,
      reason: `Capital deposit / repayment by ${target.name}`,
    });
    setExpenseFormOpen(true);
  };

  const openNewDrawing = () => {
    setExpensePreset({
      type: "DRAWING",
      categoryName: "Owner Withdrawal",
      spentById: target.id,
      reason: `Personal drawing / cash withdrawal by ${target.name}`,
    });
    setExpenseFormOpen(true);
  };

  const openNewOutOfPocket = () => {
    setExpensePreset({
      type: "OUT_OF_POCKET",
      spentById: target.id,
      reason: `Business expense paid personally by ${target.name}`,
    });
    setExpenseFormOpen(true);
  };

  const openInspector = (metric: "contributions" | "drawings" | "outofpocket" | "net") => {
    if (!data) return;
    const s = data.summary;
    switch (metric) {
      case "contributions":
        setInspectorData({
          title: "Capital Contributions (Deposits In)",
          subtitle: `${target.name} · Partner Equity`,
          resultLabel: "Total Contributed",
          resultValue: formatINR(s.contributions),
          formulaEquation: "Total Capital = ∑(Owner Contributions Deposited)",
          steps: [
            { label: "Direct Capital Invested", amount: s.contributions, operation: "result", detail: "Personal funds put into company accounts" },
          ],
          notes: [
            "Capital deposited by an owner into business accounts.",
            "This is equity funding, not operational revenue, so it is segregated from P&L.",
          ],
        });
        break;
      case "drawings":
        setInspectorData({
          title: "Personal Drawings (Withdrawals Out)",
          subtitle: `${target.name} · Capital Drawings`,
          resultLabel: "Total Drawings",
          resultValue: formatINR(s.drawings),
          formulaEquation: "Total Drawings = ∑(Owner Withdrawals Taken)",
          steps: [
            { label: "Company Funds Withdrawn", amount: s.drawings, operation: "result", detail: "Personal drawings taken out" },
          ],
          notes: [
            "Withdrawals reduce the partner's equity in the business.",
            "Drawings do not count as operational business expenses.",
          ],
        });
        break;
      case "outofpocket":
        setInspectorData({
          title: "Out-of-Pocket Business Spend",
          subtitle: `${target.name} · Reimbursable Company Spend`,
          resultLabel: "Total Out-of-Pocket",
          resultValue: formatINR(s.outOfPocketSpend),
          formulaEquation: "Total Out-of-Pocket = ∑(Operating Expenses Paid by Partner)",
          steps: [
            { label: "Expenses Paid on Behalf of Business", amount: s.outOfPocketSpend, operation: "result", detail: "Personal UPI/Cash/Card spend" },
          ],
          notes: [
            "Business operating costs (fuel, repairs, supplies) paid directly by the partner.",
            "The business owes this amount back to the partner.",
          ],
        });
        break;
      case "net":
        setInspectorData({
          title: "Net Partner Position",
          subtitle: `${target.name} · Capital & Current Balance`,
          resultLabel: "Net Balance Position",
          resultValue: formatINR(s.netBalance),
          formulaEquation: "Net Position = (Capital Contributed + Out-of-Pocket Spend) − Personal Drawings",
          steps: [
            { label: "Capital Contributed", amount: s.contributions, operation: "add", detail: "Equity deposits" },
            { label: "Out-of-Pocket Business Spend", amount: s.outOfPocketSpend, operation: "add", detail: "Reimbursable expenses" },
            { label: "Personal Drawings Taken", amount: s.drawings, operation: "subtract", detail: "Withdrawals taken" },
            { label: "Net Standing Balance", amount: s.netBalance, operation: "result", detail: s.netBalance >= 0 ? "Company owes Partner" : "Partner owes Company" },
          ],
          notes: [
            "If positive: The company owes this net amount to the partner.",
            "If negative: The partner has withdrawn more than contributed/spent, owing money back to company accounts.",
          ],
        });
        break;
    }
  };

  const openLineage = (item: OwnerPassbookResp["passbook"][number]) => {
    setLineageData({
      id: item.id,
      title: item.title,
      type: item.type === "CONTRIBUTION" ? "Owner Contribution" : item.type === "DRAWING" ? "Owner Drawing" : item.type === "REFUND" ? "Expense Refund" : "Out-of-Pocket Expense",
      amount: item.inflow > 0 ? item.inflow : item.outflow,
      date: fmtDay(item.date),
      createdAt: item.createdAt,
      createdByName: target.name,
      ruleExplanation: item.type === "CONTRIBUTION"
        ? "Partner contributed personal funds into the business bank/cash account."
        : item.type === "DRAWING"
        ? "Partner withdrew company funds for personal use, reducing equity."
        : item.type === "REFUND"
        ? "Returned unused operational cash or vendor refund deposited back into company funds."
        : "Partner paid a legitimate operational expense on behalf of Garuda from personal funds.",
      impactedAccounts: item.type === "CONTRIBUTION" ? [
        { account: "Company Bank / Cash", type: "debit", amount: item.inflow, description: "Funds deposited" },
        { account: `Partner Capital (${target.name})`, type: "credit", amount: item.inflow, description: "Equity credit to partner" },
      ] : item.type === "DRAWING" ? [
        { account: `Partner Capital (${target.name})`, type: "debit", amount: item.outflow, description: "Equity reduced" },
        { account: "Company Bank / Cash", type: "credit", amount: item.outflow, description: "Funds withdrawn" },
      ] : item.type === "REFUND" ? [
        { account: "Company Bank / Cash", type: "debit", amount: item.inflow, description: "Refund cash received" },
        { account: "Operational Expense Offset", type: "credit", amount: item.inflow, description: "Credit against business expenses" },
      ] : [
        { account: "Business Operational Expense", type: "debit", amount: item.inflow, description: "Operating cost incurred" },
        { account: `Partner Reimbursable (${target.name})`, type: "credit", amount: item.inflow, description: "Credit owed to partner" },
      ],
      notes: item.notes,
    });
  };

  const s = data?.summary;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl p-0 gap-0 overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[88vh]">
        {/* Header */}
        <DialogHeader className="p-4 sm:p-5 pb-3 border-b bg-muted/20 shrink-0">
          <div className="flex items-center justify-between gap-2 pr-6">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[11px] font-semibold tracking-wide">
                Owner 360° Passbook
              </Badge>
              <span className="text-xs text-muted-foreground">@{target.username}</span>
            </div>
            <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={() => void reload()} disabled={loading}>
              <Clock className="h-3.5 w-3.5" />
              <span>Refresh</span>
            </Button>
          </div>
          <DialogTitle className="text-lg font-bold mt-1 text-foreground flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary shrink-0" />
            <span>{target.name}&apos;s Capital & Current Account</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Complete transparent passbook of capital deposits, personal drawings, and out-of-pocket expenses.
          </DialogDescription>
        </DialogHeader>

        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 min-h-0 pb-6">
          {loading && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
              </div>
              <Skeleton className="h-64 rounded-xl" />
            </div>
          )}

          {error && (
            <div className="p-4 text-center text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 rounded-xl">
              {error}
            </div>
          )}

          {!loading && data && (
            <>
              {/* Interactive KPI Banner */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="list" aria-label="Owner KPIs">
                <StatCard
                  label="Capital In"
                  value={formatINR(s?.contributions ?? 0, { compact: true })}
                  icon={ArrowDownLeft}
                  tone="positive"
                  hint="Click to inspect formula"
                  onClick={() => openInspector("contributions")}
                />
                <StatCard
                  label="Drawings Out"
                  value={formatINR(s?.drawings ?? 0, { compact: true })}
                  icon={ArrowUpRight}
                  tone="warning"
                  hint="Click to inspect formula"
                  onClick={() => openInspector("drawings")}
                />
                <StatCard
                  label="Out-of-Pocket Spend"
                  value={formatINR(s?.outOfPocketSpend ?? 0, { compact: true })}
                  icon={IndianRupee}
                  hint="Click to inspect formula"
                  onClick={() => openInspector("outofpocket")}
                />
                <StatCard
                  label="Net Standing"
                  value={formatINR(s?.netBalance ?? 0, { compact: true })}
                  icon={Wallet}
                  tone={(s?.netBalance ?? 0) >= 0 ? "positive" : "negative"}
                  hint={(s?.netBalance ?? 0) >= 0 ? "Company owes you" : "You owe company"}
                  onClick={() => openInspector("net")}
                />
              </div>

              {/* Quick Actions Bar for Direct Capital & Expense Tracking */}
              <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/40 rounded-xl border">
                <span className="text-xs font-semibold text-muted-foreground mr-1">Quick Actions:</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 text-xs text-emerald-700 dark:text-emerald-300 border-emerald-500/30 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 font-medium"
                  onClick={openNewDeposit}
                >
                  <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>+ Deposit / Repay</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 text-xs text-amber-700 dark:text-amber-300 border-amber-500/30 hover:bg-amber-50 dark:hover:bg-amber-950/50 font-medium"
                  onClick={openNewDrawing}
                >
                  <ArrowUpRight className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                  <span>− Personal Drawing</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 text-xs text-purple-700 dark:text-purple-300 border-purple-500/30 hover:bg-purple-50 dark:hover:bg-purple-950/50 font-medium"
                  onClick={openNewOutOfPocket}
                >
                  <IndianRupee className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                  <span>💳 Out-of-Pocket Spend</span>
                </Button>
              </div>

              {/* Tabs */}
              <Tabs defaultValue="passbook">
                <TabsList className="w-full sm:w-auto">
                  <TabsTrigger value="passbook" className="gap-1.5">
                    <FileText className="h-3.5 w-3.5" />
                    <span>Capital Passbook ({data.passbook.length})</span>
                  </TabsTrigger>
                  <TabsTrigger value="audits" className="gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    <span>Audit Log ({data.audits.length})</span>
                  </TabsTrigger>
                </TabsList>

                {/* Tab 1: Passbook */}
                <TabsContent value="passbook" className="mt-3 space-y-3 pb-6">
                  <div className="border rounded-xl divide-y overflow-hidden text-xs">
                    {data.passbook.length === 0 ? (
                      <div className="p-8 text-center text-muted-foreground">
                        No capital transactions or personal expenses recorded for this owner yet.
                      </div>
                    ) : (
                      data.passbook.map((item) => (
                        <div
                          key={item.id}
                          className="p-3 flex items-center justify-between gap-3 hover:bg-muted/40 transition-colors cursor-pointer"
                          onClick={() => openLineage(item)}
                        >
                          <div className="min-w-0 flex items-start gap-2.5">
                            {item.type === "REFUND" ? (
                              <div className="p-1.5 rounded-lg bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300 shrink-0 mt-0.5">
                                <RefreshCw className="h-3.5 w-3.5" />
                              </div>
                            ) : item.inflow > 0 ? (
                              <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 shrink-0 mt-0.5">
                                <ArrowDownLeft className="h-3.5 w-3.5" />
                              </div>
                            ) : (
                              <div className="p-1.5 rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 shrink-0 mt-0.5">
                                <ArrowUpRight className="h-3.5 w-3.5" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="font-semibold text-foreground truncate">{item.title}</p>
                              <p className="text-[11px] text-muted-foreground truncate">{item.subtitle}</p>
                              <p className="text-[10px] text-muted-foreground mt-0.5">{fmtDay(item.date)}</p>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            {item.inflow > 0 && (
                              <p className={cn("font-semibold tabular-nums", item.type === "REFUND" ? "text-cyan-600 dark:text-cyan-400" : "text-emerald-600 dark:text-emerald-400")}>
                                +{formatINR(item.inflow)}
                              </p>
                            )}
                            {item.outflow > 0 && (
                              <p className="font-semibold text-amber-600 dark:text-amber-400 tabular-nums">−{formatINR(item.outflow)}</p>
                            )}
                            <p className="text-[11px] font-bold text-foreground tabular-nums mt-0.5">
                              Bal: {formatINR(item.balance)}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </TabsContent>

                {/* Tab 2: Audit */}
                <TabsContent value="audits" className="mt-3 pb-6">
                  <div className="border rounded-xl divide-y overflow-hidden text-xs">
                    {data.audits.length === 0 ? (
                      <div className="p-8 text-center text-muted-foreground">No recent actions logged.</div>
                    ) : (
                      data.audits.map((a) => (
                        <div key={a.id} className="p-3 flex items-center justify-between gap-2 hover:bg-muted/30">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <Badge variant="outline" className="text-[10px] font-mono">
                                {a.action}
                              </Badge>
                              <span className="font-semibold text-foreground truncate">{a.recordLabel || a.module}</span>
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              Module: {a.module} · {fmtDay(a.createdAt)}
                            </p>
                          </div>
                          <span className="text-[10px] text-muted-foreground shrink-0 font-mono">
                            {String(a.createdAt).slice(11, 19)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>

        <DialogFooter className="p-3 border-t bg-muted/20 shrink-0">
          <Button variant="outline" size="sm" onClick={onClose}>Close Passbook</Button>
        </DialogFooter>
      </DialogContent>

      {/* Unified Financial Entry Modal for Quick Actions */}
      <ExpenseFormDialog
        open={expenseFormOpen}
        onOpenChange={(o) => {
          setExpenseFormOpen(o);
          if (!o) setExpensePreset(null);
        }}
        expense={null}
        vehicles={[]}
        onDone={() => void reload()}
        preset={expensePreset}
      />

      {/* Formula Inspector Modal */}
      <FormulaInspectorDialog
        open={Boolean(inspectorData)}
        onOpenChange={(open) => { if (!open) setInspectorData(null); }}
        data={inspectorData}
      />

      {/* Transaction Lineage Modal */}
      <TransactionLineageDialog
        open={Boolean(lineageData)}
        onOpenChange={(open) => { if (!open) setLineageData(null); }}
        data={lineageData}
      />
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// My account card (change own password)
// ---------------------------------------------------------------------------

function MyAccountCard({ onOpenPassbook }: { onOpenPassbook?: () => void }) {
  const { owner: me } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const { mutate, saving } = useMutation();

  const submit = async () => {
    if (!current || !next) {
      toast.error("Fill in current and new password");
      return;
    }
    if (next.length < 6) {
      toast.error("New password must be at least 6 characters");
      return;
    }
    if (next !== confirm) {
      toast.error("New password and confirmation don't match");
      return;
    }
    const res = await mutate(
      () => api.post("/api/auth/change-password", { currentPassword: current, newPassword: next }),
      "Password updated"
    );
    if (res.ok) {
      setCurrent("");
      setNext("");
      setConfirm("");
    }
  };

  return (
    <Card className="border-primary/30">
      <CardContent className="p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <InitialAvatar name={me?.name} className="h-11 w-11 text-base" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="truncate text-sm font-bold">{me?.name ?? "My account"}</p>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  <ShieldCheck className="h-3 w-3" aria-hidden />You
                </span>
              </div>
              <p className="truncate text-xs text-muted-foreground">@{me?.username ?? "—"}{me?.mobile ? ` · ${me.mobile}` : ""}</p>
              {onOpenPassbook && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2.5 h-8 text-xs gap-1.5 font-medium border-primary/30 hover:bg-primary/5 hover:text-primary"
                  onClick={onOpenPassbook}
                >
                  <Wallet className="h-3.5 w-3.5 text-primary" />
                  <span>My 360° Capital Passbook</span>
                </Button>
              )}
            </div>
          </div>

          <div className="w-full space-y-2 sm:max-w-sm">
            <p className="text-xs font-semibold text-foreground">Change my password</p>
            <Input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              placeholder="Current password"
              autoComplete="current-password"
              className="h-10"
            />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Input
                type="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                placeholder="New password (min 6)"
                autoComplete="new-password"
                className="h-10"
              />
              <Input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Confirm new password"
                autoComplete="new-password"
                className="h-10"
              />
            </div>
            <Button className="min-h-10 w-full sm:w-auto" onClick={submit} disabled={saving}>
              {saving ? "Updating…" : "Update password"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Owner card
// ---------------------------------------------------------------------------

function OwnerCard({ owner, isSelf, saving, onEdit, onReset, onToggleActive, onEmail, onPassbook }: {
  owner: OwnerRow;
  isSelf: boolean;
  saving: boolean;
  onEdit: () => void;
  onReset: () => void;
  onToggleActive: (next: boolean) => void;
  onEmail: () => void;
  onPassbook: () => void;
}) {
  return (
    <Card className="min-w-0 transition-all hover:shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <InitialAvatar name={owner.name} tone={owner.isActive ? "emerald" : "zinc"} className="h-10 w-10 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-bold">{owner.name}</p>
              {isSelf && (
                <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary">
                  You
                </span>
              )}
            </div>
            <p className="truncate text-xs text-muted-foreground">@{owner.username}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground tabular-nums">
              {owner.mobile || "No mobile"}{owner.createdAt ? ` · joined ${fmtDay(owner.createdAt)}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                created {owner.createdRecords ?? 0} records
              </span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                  owner.isActive
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                    : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                )}
              >
                {owner.isActive ? "Active" : "Inactive"}
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <Switch
              checked={owner.isActive}
              disabled={isSelf || saving}
              aria-label={`Activate or deactivate ${owner.name}`}
              onCheckedChange={onToggleActive}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 sm:h-8 sm:w-8" aria-label={`Actions for ${owner.name}`}>
                  <EllipsisVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={onEmail}>
                  <Mail className="h-3.5 w-3.5" aria-hidden />Monthly summary email
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onEdit}>
                  <Pencil className="h-3.5 w-3.5" aria-hidden />Edit details
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onReset}>
                  <KeyRound className="h-3.5 w-3.5" aria-hidden />Reset password
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="mt-3 w-full h-8 text-xs gap-1.5 font-semibold border-primary/30 hover:bg-primary/5 hover:text-primary"
          onClick={onPassbook}
        >
          <Wallet className="h-3.5 w-3.5 text-primary" />
          <span>View 360° Capital Passbook</span>
        </Button>
        {isSelf && (
          <p className="mt-2 text-[10px] text-muted-foreground">Your own account stays active — change your password above.</p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Add / Edit dialog
// ---------------------------------------------------------------------------

function OwnerFormDialog({ open, onOpenChange, target, onDone }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  target: OwnerRow | null; // null = add
  onDone: () => void;
}) {
  const [form, setForm] = useState({ name: "", username: "", mobile: "", password: "" });
  const { mutate, saving } = useMutation();

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setForm(target
        ? { name: target.name, username: target.username, mobile: target.mobile ?? "", password: "" }
        : { name: "", username: "", mobile: "", password: "" });
    }
  }

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!form.username.trim()) {
      toast.error("Username is required");
      return;
    }
    if (!target && form.password && form.password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    const res = target
      ? await mutate(
          () => api.put(`/api/owners/${target.id}`, { name: form.name.trim(), mobile: form.mobile || undefined }),
          "Owner updated"
        )
      : await mutate(
          () => api.post("/api/owners", {
            name: form.name.trim(),
            username: form.username.trim(),
            mobile: form.mobile || undefined,
            password: form.password || undefined,
          }),
          "Owner added"
        );
    if (res.ok) {
      onOpenChange(false);
      onDone();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{target ? "Edit owner" : "Add owner"}</DialogTitle>
          <DialogDescription>
            {target ? "Update the owner's display details." : "New owners can log in and manage the business."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" required>
            <Input value={form.name} onChange={(e) => set("name")(e.target.value)} className="h-10" placeholder="e.g. Rahul Sharma" />
          </Field>
          <Field label="Mobile" hint="Optional contact number">
            <Input value={form.mobile} onChange={(e) => set("mobile")(e.target.value)} inputMode="tel" className="h-10" />
          </Field>
          <Field
            label="Username"
            required
            className="sm:col-span-2"
            hint={target ? "Username can't be changed" : "Used to log in — can't be changed later"}
          >
            <Input
              value={form.username}
              onChange={(e) => set("username")(e.target.value)}
              className="h-10"
              placeholder="e.g. rahul"
              disabled={Boolean(target)}
            />
          </Field>
          {!target && (
            <Field label="Password" className="sm:col-span-2" hint="Leave blank to use the default: owner123">
              <Input
                type="password"
                value={form.password}
                onChange={(e) => set("password")(e.target.value)}
                autoComplete="new-password"
                className="h-10"
                placeholder="Default: owner123"
              />
            </Field>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="min-h-10 flex-1 sm:flex-none" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="min-h-10 flex-1 sm:flex-none" onClick={submit} disabled={saving}>
            {saving ? "Saving…" : target ? "Save changes" : "Add owner"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Reset password dialog
// ---------------------------------------------------------------------------

function ResetPasswordDialog({ open, onOpenChange, target }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  target: OwnerRow | null;
}) {
  const [password, setPassword] = useState("");
  const { mutate, saving } = useMutation();

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setPassword("");
  }

  const submit = async () => {
    if (!target) return;
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    const res = await mutate(
      () => api.put(`/api/owners/${target.id}`, { password }),
      `Password reset for ${target.name}`
    );
    if (res.ok) {
      setPassword("");
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>
            Set a new password for <span className="font-medium">@{target?.username ?? ""}</span>. Minimum 6 characters.
          </DialogDescription>
        </DialogHeader>
        <Field label="New password" required>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            className="h-10"
            placeholder="Min 6 characters"
          />
        </Field>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="min-h-10 flex-1 sm:flex-none" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="min-h-10 flex-1 sm:flex-none" onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Reset password"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

export default function OwnersView({ params }: ViewProps) {
  const { owner: me } = useAuth();
  const { data, loading, error, reload } = useAsync<ListResp<OwnerRow>>(
    () => api.get<ListResp<OwnerRow>>("/api/owners"),
    []
  );

  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<OwnerRow | null>(null);
  const [resetTarget, setResetTarget] = useState<OwnerRow | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<OwnerRow | null>(null);
  const [emailTarget, setEmailTarget] = useState<OwnerRow | null>(null);
  const [passbookTarget, setPassbookTarget] = useState<OwnerRow | null>(null);
  const { mutate, saving } = useMutation();

  const owners = data?.items ?? [];

  // Auto-open 360° Passbook if linked via navigation parameter id
  useEffect(() => {
    if (params?.id && owners.length > 0) {
      const match = owners.find((o) => o.id === params.id);
      if (match) {
        setPassbookTarget(match);
      }
    }
  }, [params?.id, owners]);

  const activate = async (row: OwnerRow) => {
    const res = await mutate(() => api.put(`/api/owners/${row.id}`, { isActive: true }), `${row.name} activated`);
    if (res.ok) reload();
  };

  const deactivate = async () => {
    if (!deactivateTarget) return;
    const row = deactivateTarget;
    setDeactivateTarget(null);
    const res = await mutate(() => api.put(`/api/owners/${row.id}`, { isActive: false }), `${row.name} deactivated`);
    if (res.ok) reload();
  };

  const onToggleActive = (row: OwnerRow, next: boolean) => {
    if (next) void activate(row);
    else setDeactivateTarget(row);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Owners"
        subtitle={`${owners.length} team account${owners.length === 1 ? "" : "s"}`}
        icon={Crown}
        actions={
          <Button size="sm" className="h-9 gap-1.5" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden />Add Owner
          </Button>
        }
      />

      <MyAccountCard
        onOpenPassbook={() => {
          const meRow = owners.find((o) => o.username === me?.username) ?? (me ? {
            id: me.id,
            name: me.name,
            username: me.username,
            mobile: me.mobile,
            isActive: true,
          } : null);
          if (meRow) setPassbookTarget(meRow);
        }}
      />

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50/60 p-4 text-center dark:border-red-900 dark:bg-red-950/30">
          <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
          <Button variant="outline" size="sm" className="mt-2 h-8" onClick={() => void reload()}>Retry</Button>
        </div>
      )}

      {loading && !error && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      )}

      {!loading && !error && owners.length === 0 && (
        <EmptyState
          icon={UserPlus}
          title="No owners yet"
          description="Add team members so they can log in and help manage the business."
          action={{ label: "Add Owner", onClick: () => setAddOpen(true) }}
        />
      )}

      {!loading && !error && owners.length > 0 && (
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
          {owners.map((o) => (
            <OwnerCard
              key={o.id}
              owner={o}
              isSelf={o.username === me?.username}
              saving={saving}
              onEdit={() => setEditTarget(o)}
              onReset={() => setResetTarget(o)}
              onToggleActive={(next) => onToggleActive(o, next)}
              onEmail={() => setEmailTarget(o)}
              onPassbook={() => setPassbookTarget(o)}
            />
          ))}
        </div>
      )}

      {/* Deactivate confirmation */}
      <AlertDialog open={Boolean(deactivateTarget)} onOpenChange={(v) => !v && setDeactivateTarget(null)}>
        <AlertDialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate @{deactivateTarget?.username ?? ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              {deactivateTarget?.name} will lose access immediately. You can reactivate the account anytime with the
              switch on their card.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="min-h-10 flex-1 sm:flex-none">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-10 flex-1 bg-red-600 text-white hover:bg-red-700 sm:flex-none"
              onClick={(e) => {
                e.preventDefault();
                void deactivate();
              }}
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <OwnerFormDialog
        open={addOpen || Boolean(editTarget)}
        onOpenChange={(v) => {
          if (!v) {
            setAddOpen(false);
            setEditTarget(null);
          }
        }}
        target={editTarget}
        onDone={reload}
      />

      <ResetPasswordDialog
        open={Boolean(resetTarget)}
        onOpenChange={(v) => !v && setResetTarget(null)}
        target={resetTarget}
      />

      {emailTarget && (
        <MonthlyEmailDialog target={emailTarget} onClose={() => setEmailTarget(null)} />
      )}

      {passbookTarget && (
        <OwnerPassbookDialog target={passbookTarget} onClose={() => setPassbookTarget(null)} />
      )}
    </div>
  );
}
