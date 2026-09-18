"use client";

import { useState } from "react";
import { api, downloadJSON } from "@/lib/api-client";
import { formatINR } from "@/lib/money";
import { buildPeriodClosureDossierHtml } from "@/lib/report-statements";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  Archive,
  CheckCircle2,
  Download,
  FileCheck,
  FileText,
  HelpCircle,
  History,
  Lock,
  Printer,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { todayStr, useAsync } from "../views/_shared";

interface DossierData {
  closingCutoff: string;
  period: string;
  generatedAt: string;
  executiveSummary: {
    totalRevenue: number;
    manpowerBilling: number;
    transportBilling: number;
    rentIncome: number;
    totalLaborCost: number;
    grossProfit: number;
    totalOpex: number;
    netProfit: number;
    netMarginPct: number;
  };
  cashLedger: {
    totalInflow: number;
    propertyCollections: number;
    tripCollections: number;
    totalOutflow: number;
    advancesDisbursed: number;
    settlementsPaid: number;
    opexPaid: number;
    emiPaid: number;
    netCashFlow: number;
  };
  carriedForwardBalances: {
    propertyReceivables: number;
    unrecoveredAdvancesCount: number;
    unrecoveredAdvancesTotal: number;
    unrecoveredAdvancesList: Array<{
      id: string;
      employeeId: string;
      employeeName: string;
      code: string;
      amount: number;
      recovered: number;
      outstanding: number;
      date: string;
    }>;
  };
  archivableRecordCounts: {
    deployments: number;
    trips: number;
    propertyPayments: number;
    expenses: number;
    settlements: number;
  };
}

export function PeriodClosingDialog({
  businessName,
  onPeriodClosed,
}: {
  businessName?: string | null;
  onPeriodClosed?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [cutoffDate, setCutoffDate] = useState(() => todayStr());
  const [confirmationPhrase, setConfirmationPhrase] = useState("");
  const [closing, setClosing] = useState(false);
  const [dossierDownloaded, setDossierDownloaded] = useState(false);

  const cutoffYear = new Date(cutoffDate || todayStr()).getFullYear();
  const expectedPhrase = `CLOSE-PERIOD-${cutoffYear}`;

  const { data: dossier, loading, reload } = useAsync<DossierData | null>(
    () => (open ? api.get<DossierData>(`/api/reports/period-close/dossier?to=${cutoffDate}`) : Promise.resolve(null)),
    [open, cutoffDate]
  );

  const printDossier = () => {
    if (!dossier) return;
    const html = buildPeriodClosureDossierHtml({
      businessName: businessName ?? "Garuda ERP Control Center",
      closingCutoff: dossier.closingCutoff,
      period: dossier.period,
      dossier,
    });
    const w = window.open("", "_blank", "width=940,height=800");
    if (!w) {
      toast.error("Popup blocked — allow popups for this site to view the printable dossier.");
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    setDossierDownloaded(true);
    toast.success("Period Closing Dossier opened for print / PDF save");
  };

  const downloadBackup = async () => {
    try {
      toast.loading("Preparing full database JSON backup…", { id: "backup-dl" });
      const backup = await api.get<any>("/api/settings/backup");
      downloadJSON(`garudaerp-period-close-backup-${cutoffDate}.json`, backup);
      toast.success("Database backup downloaded successfully", { id: "backup-dl" });
      setDossierDownloaded(true);
    } catch (e: any) {
      toast.error(e?.message || "Failed to download backup", { id: "backup-dl" });
    }
  };

  const handleExecuteReset = async () => {
    if (confirmationPhrase.trim().toUpperCase() !== expectedPhrase) {
      toast.error(`Type "${expectedPhrase}" exactly to confirm period reset.`);
      return;
    }
    try {
      setClosing(true);
      const res = await api.post<{ message: string }>("/api/settings/period-close", {
        closingDate: cutoffDate,
        confirmationPhrase: confirmationPhrase.trim(),
      });
      toast.success(res.message || "Period successfully closed and clean state initialized!");
      setOpen(false);
      setConfirmationPhrase("");
      setDossierDownloaded(false);
      if (onPeriodClosed) onPeriodClosed();
    } catch (e: any) {
      toast.error(e?.message || "Failed to close period");
    } finally {
      setClosing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-1.5 border-primary/40 bg-background text-xs font-semibold shadow-xs hover:bg-primary/5 hover:text-primary"
        >
          <Archive className="h-4 w-4 text-primary" aria-hidden />
          <span>Period Closing &amp; Reset</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto p-5 sm:p-6">
        <DialogHeader className="pb-2">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Archive className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <DialogTitle className="text-base sm:text-lg font-bold">
                Period Closing &amp; Clean-Slate Reset Wizard
              </DialogTitle>
              <DialogDescription className="text-xs">
                Audit, print the complete historical dossier, preserve opening balances, and start fresh.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-1 text-xs">
          {/* Step 1: Select Closing Cutoff */}
          <div className="rounded-xl border bg-muted/30 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-bold text-foreground">1. Select Closing Cutoff Date</p>
                <p className="text-[11px] text-muted-foreground">
                  All operational activity up to this date will be audited and archived.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={cutoffDate}
                  onChange={(e) => setCutoffDate(e.target.value)}
                  className="h-8 w-38 text-xs font-semibold"
                />
                <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => void reload()} disabled={loading}>
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>

          {/* Step 2: Live Historical Dossier Preview */}
          {loading && (
            <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
              <RefreshCw className="h-4 w-4 animate-spin text-primary" />
              <span>Calculating historical period aggregates…</span>
            </div>
          )}

          {!loading && dossier && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-bold text-foreground flex items-center gap-1.5">
                  <FileCheck className="h-4 w-4 text-emerald-600" />
                  <span>2. Historical Audit Summary ({dossier.period})</span>
                </p>
                <span className="rounded-full bg-emerald-100 dark:bg-emerald-950 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:text-emerald-300">
                  Ready for Archive
                </span>
              </div>

              {/* Financial KPI chips */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-lg border bg-card p-2 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase">Gross Revenue</p>
                  <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {formatINR(dossier.executiveSummary.totalRevenue)}
                  </p>
                </div>
                <div className="rounded-lg border bg-card p-2 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase">Direct Labor Cost</p>
                  <p className="text-sm font-bold tabular-nums">{formatINR(dossier.executiveSummary.totalLaborCost)}</p>
                </div>
                <div className="rounded-lg border bg-card p-2 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase">Operating Expenses</p>
                  <p className="text-sm font-bold text-muted-foreground tabular-nums">
                    {formatINR(dossier.executiveSummary.totalOpex)}
                  </p>
                </div>
                <div className="rounded-lg border bg-card p-2 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase">Net Period Profit</p>
                  <p className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {formatINR(dossier.executiveSummary.netProfit)}
                  </p>
                </div>
              </div>

              {/* Carried Forward Protection Box */}
              <div className="rounded-xl border border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20 p-3">
                <p className="font-bold text-amber-900 dark:text-amber-300 flex items-center gap-1.5 mb-1">
                  <ShieldCheck className="h-4 w-4 text-amber-600" />
                  <span>Carried Forward Opening Balances (Zero Financial Loss)</span>
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 text-[11px] text-amber-800 dark:text-amber-200">
                  <div className="flex items-center justify-between border-b border-amber-200 dark:border-amber-900/50 pb-1">
                    <span>Unrecovered Employee Advances Preserved:</span>
                    <strong className="tabular-nums">
                      {formatINR(dossier.carriedForwardBalances.unrecoveredAdvancesTotal)} (
                      {dossier.carriedForwardBalances.unrecoveredAdvancesCount} staff)
                    </strong>
                  </div>
                  <div className="flex items-center justify-between border-b border-amber-200 dark:border-amber-900/50 pb-1">
                    <span>Unpaid Property Receivables:</span>
                    <strong className="tabular-nums">
                      {formatINR(dossier.carriedForwardBalances.propertyReceivables)}
                    </strong>
                  </div>
                </div>
                <p className="mt-1.5 text-[10px] text-amber-700/80 dark:text-amber-400">
                  ✓ Master Profiles (Employees, Properties, Vehicles, Clients, Owners) and loan schedules are never deleted.
                </p>
              </div>

              {/* Mandatory Action 3: Download & Print Verification */}
              <div className="rounded-xl border bg-card p-3 space-y-2">
                <p className="font-bold text-foreground">3. Download / Print Historical Dossier Record</p>
                <p className="text-[11px] text-muted-foreground">
                  Before sealing the period, generate your official printed statement or download a complete database backup.
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 pt-1">
                  <Button
                    variant="outline"
                    className="min-h-9 gap-1.5 text-xs font-medium"
                    onClick={printDossier}
                  >
                    <Printer className="h-3.5 w-3.5 text-primary" />
                    <span>Print Closing Audit Dossier (PDF)</span>
                  </Button>
                  <Button
                    variant="outline"
                    className="min-h-9 gap-1.5 text-xs font-medium"
                    onClick={() => void downloadBackup()}
                  >
                    <Download className="h-3.5 w-3.5 text-primary" />
                    <span>Download Full Backup (JSON)</span>
                  </Button>
                </div>
              </div>

              {/* Step 4: Double Confirmation & Execution */}
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 space-y-2.5">
                <div className="flex items-start gap-2">
                  <ShieldAlert className="mt-0.5 h-4 w-4 text-destructive shrink-0" />
                  <div>
                    <p className="font-bold text-destructive">4. Safety Confirmation to Initialize Clean Period</p>
                    <p className="text-[11px] text-muted-foreground">
                      Archiving clears operational shifts, trips, and settled records up through{" "}
                      <strong>{cutoffDate}</strong>. Type{" "}
                      <span className="rounded bg-destructive/10 px-1 font-mono font-bold text-destructive">
                        {expectedPhrase}
                      </span>{" "}
                      below to confirm.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Input
                    placeholder={`Type ${expectedPhrase}`}
                    value={confirmationPhrase}
                    onChange={(e) => setConfirmationPhrase(e.target.value)}
                    className="h-9 font-mono text-xs"
                  />
                  <Button
                    variant="destructive"
                    className="min-h-9 shrink-0 gap-1.5 font-bold"
                    disabled={
                      confirmationPhrase.trim().toUpperCase() !== expectedPhrase || closing
                    }
                    onClick={() => void handleExecuteReset()}
                  >
                    <Lock className="h-3.5 w-3.5" />
                    <span>{closing ? "Sealing Period…" : "Seal & Start Clean Slate"}</span>
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
