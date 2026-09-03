"use client";

import { useState } from "react";
import { api, qs } from "@/lib/api-client";
import { formatINR, parseAmount } from "@/lib/money";
import type { ViewProps } from "@/components/view-types";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { StatCard, StatGrid } from "@/components/shared/stat-card";
import { MonthPicker, toMonth } from "@/components/shared/month-picker";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useLang, t } from "@/lib/i18n";
import {
  ReceiptText, Users, Landmark, Banknote, CheckCircle2, Wand2, FileText, CalendarClock,
} from "lucide-react";
import {
  type SettlementRec, type Option, SelectInput, Field, KV, MoneyInput, ShiftBadgeInline,
  fmtDay, todayStr, useAsync, useMutation,
} from "./_shared";

interface SettlementTotals { gross: number; advance: number; net: number; count: number; finalized: number }
type SettlementsResp = { items: SettlementRec[]; totals: SettlementTotals };

const STATUS_OPTIONS: Option[] = [
  { label: "All statuses", value: "" },
  { label: "Draft", value: "DRAFT" },
  { label: "Finalized", value: "FINALIZED" },
  { label: "Paid", value: "PAID" },
];

const METHOD_OPTIONS: Option[] = ["Cash", "UPI", "Bank", "Cheque", "Other"].map((m) => ({ label: m, value: m }));

function prevMonthStr(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

export default function SettlementsView({ navigate }: ViewProps) {
  const { lang } = useLang();
  const [month, setMonth] = useState(toMonth());
  const [status, setStatus] = useState("");

  const { data, loading, error, reload } = useAsync<SettlementsResp>(
    () => api.get("/api/settlements" + qs({ month, status: status || undefined })),
    [month, status]
  );

  const { mutate, saving } = useMutation();

  const [generateOpen, setGenerateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [finalizeId, setFinalizeId] = useState<string | null>(null);
  const [payFor, setPayFor] = useState<string | null>(null);
  const [payDate, setPayDate] = useState(todayStr());
  const [payMethod, setPayMethod] = useState("Cash");

  // DRAFT edit form inside detail dialog.
  const [additions, setAdditions] = useState("");
  const [otherDeductions, setOtherDeductions] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const items = data?.items ?? [];
  const totals = data?.totals;
  const detail = detailId ? items.find((s) => s.id === detailId) ?? null : null;

  // Seed the edit form when the detail target changes (render-time adjustment).
  const [prevDetailId, setPrevDetailId] = useState<string | null>(null);
  if (detailId !== prevDetailId) {
    setPrevDetailId(detailId);
    setAdditions(detail ? String(detail.additions ?? 0) : "");
    setOtherDeductions(detail ? String(detail.otherDeductions ?? 0) : "");
    setEditNotes(detail?.notes ?? "");
  }

  const generate = async () => {
    let generated = 0;
    const res = await mutate(async () => {
      const d = await api.post<{ generated: number; drafts: number }>("/api/settlements/generate", { month });
      generated = d.generated ?? 0;
      return d;
    });
    if (res.ok) {
      toast.success(`Generated ${generated} draft settlement(s) for ${monthLabel(month)}`);
      void reload();
    }
    setGenerateOpen(false);
  };

  const saveEdits = async () => {
    if (!detail) return;
    const res = await mutate(
      () => api.put(`/api/settlements/${detail.id}`, {
        additions: parseAmount(additions),
        otherDeductions: parseAmount(otherDeductions),
        notes: editNotes || undefined,
      }),
      "Settlement updated"
    );
    if (res.ok) void reload();
  };

  const finalize = async () => {
    if (!finalizeId) return;
    const res = await mutate(() => api.put(`/api/settlements/${finalizeId}/finalize`), "Settlement finalized & locked");
    if (res.ok) void reload();
    setFinalizeId(null);
  };

  const markPaid = async () => {
    if (!payFor) return;
    const res = await mutate(
      () => api.put(`/api/settlements/${payFor}/mark-paid`, { paymentDate: payDate || todayStr(), method: payMethod || undefined }),
      "Marked as paid"
    );
    if (res.ok) { void reload(); setDetailId(null); }
    setPayFor(null);
  };

  const columns: Column<SettlementRec>[] = [
    {
      key: "employeeName", label: t(lang, "col.employee"), primary: true,
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{r.employeeName}</p>
          <p className="truncate text-[11px] text-muted-foreground">{r.employeeCode ?? "—"} · {monthLabel(r.month)}</p>
        </div>
      ),
      value: (r) => r.employeeName,
    },
    { key: "totalDays", label: t(lang, "col.days"), className: "text-right", value: (r) => String(r.totalDays ?? 0) },
    { key: "shifts", label: t(lang, "col.shifts"), className: "text-right", hideOnMobile: true, value: (r) => `${r.dayShifts ?? 0}/${r.nightShifts ?? 0}` },
    { key: "gross", label: t(lang, "col.gross"), className: "text-right", hideOnMobile: true, value: (r) => formatINR(r.grossEarnings ?? 0) },
    { key: "additions", label: t(lang, "col.additions"), className: "text-right", hideOnMobile: true, value: (r) => formatINR(r.additions ?? 0) },
    {
      key: "advance", label: t(lang, "col.advance"), className: "text-right",
      render: (r) => <span className="tabular-nums text-red-600 dark:text-red-400">−{formatINR(r.advanceDeducted ?? 0)}</span>,
      value: (r) => formatINR(r.advanceDeducted ?? 0),
    },
    {
      key: "net", label: t(lang, "col.net"), className: "text-right",
      render: (r) => <span className="font-bold tabular-nums">{formatINR(r.netPayable ?? 0)}</span>,
      value: (r) => formatINR(r.netPayable ?? 0),
    },
    { key: "status", label: t(lang, "col.status"), render: (r) => <StatusBadge status={r.status} />, value: (r) => r.status },
  ];

  const detailLines = detail?.lines ?? [];
  const netTone = (detail?.netPayable ?? 0) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400";

  return (
    <div className="space-y-4">
      <PageHeader
        title={t(lang, "page.settlements")}
        subtitle={t(lang, "page.settlements.sub")}
        actions={
          <AlertDialog open={generateOpen} onOpenChange={setGenerateOpen}>
            <AlertDialogTrigger asChild>
              <Button size="sm" className="h-9 gap-1.5" disabled={saving}>
                <Wand2 className="h-4 w-4" aria-hidden />Generate Drafts
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Generate / regenerate drafts?</AlertDialogTitle>
                <AlertDialogDescription>
                  Drafts for <span className="font-medium">{monthLabel(month)}</span> will be rebuilt from deployments, adjustments and advances.
                  Drafts regenerate; finalized statements are never touched.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="min-h-10">Cancel</AlertDialogCancel>
                <AlertDialogAction className="min-h-10" onClick={(e) => { e.preventDefault(); void generate(); }}>
                  {saving ? "Generating…" : "Generate"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        }
      />

      <Card>
        <CardContent className="flex flex-col gap-2.5 p-3 sm:p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <MonthPicker month={month} onChange={setMonth} />
            <Button
              variant="outline" size="sm" className="h-9 gap-1.5"
              onClick={() => setMonth(prevMonthStr(month))}
              aria-label="Jump to previous month"
            >
              <CalendarClock className="h-3.5 w-3.5" aria-hidden />Prev month
            </Button>
          </div>
          <div className="w-full lg:w-48">
            <SelectInput value={status} onChange={setStatus} options={STATUS_OPTIONS} placeholder="All statuses" />
          </div>
        </CardContent>
      </Card>

      <StatGrid cols={5}>
        <StatCard label="Employees" value={String(totals?.count ?? 0)} icon={Users} hint={monthLabel(month)} />
        <StatCard label="Gross earnings" value={formatINR(totals?.gross ?? 0, { compact: true })} icon={Banknote} tone="info" />
        <StatCard label="Advance deducted" value={formatINR(totals?.advance ?? 0, { compact: true })} icon={Landmark} tone="warning" />
        <StatCard label="Net payable" value={formatINR(totals?.net ?? 0, { compact: true })} icon={ReceiptText} tone="positive" />
        <StatCard label="Finalized" value={String(totals?.finalized ?? 0)} icon={CheckCircle2} hint={`of ${totals?.count ?? 0} statements`} />
      </StatGrid>

      <Card>
        <CardContent className="p-3 sm:p-4">
          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50/60 p-4 text-center dark:border-red-900 dark:bg-red-950/30">
              <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
              <Button variant="outline" size="sm" className="mt-2 h-8" onClick={() => void reload()}>Retry</Button>
            </div>
          ) : (
            <DataTable
              columns={columns}
              rows={items}
              rowKey={(r) => r.id}
              onRowClick={(r) => setDetailId(r.id)}
              exportName="settlements"
              loading={loading}
              emptyIcon={ReceiptText}
              emptyTitle="No settlements for this month"
              emptyDescription="Generate drafts to build month-end salary statements from deployments and advances."
            />
          )}
        </CardContent>
      </Card>

      {/* Settlement detail dialog */}
      <Dialog open={Boolean(detail)} onOpenChange={(v) => !v && setDetailId(null)}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  <span>{detail.employeeName}</span>
                  <StatusBadge status={detail.status} />
                </DialogTitle>
                <DialogDescription>
                  {detail.employeeCode ?? "—"} · {monthLabel(detail.month)} · {detail.totalDays ?? 0} day(s) ({detail.dayShifts ?? 0} day / {detail.nightShifts ?? 0} night)
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3.5">
                {/* Work lines */}
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Work lines ({detailLines.length})</p>
                  <div className="max-h-64 overflow-y-auto rounded-xl border">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 z-10 bg-muted">
                        <tr>
                          <th className="px-2.5 py-2 text-left font-medium">Date</th>
                          <th className="px-2.5 py-2 text-left font-medium">Property</th>
                          <th className="px-2.5 py-2 text-left font-medium">Shift</th>
                          <th className="px-2.5 py-2 text-right font-medium">Rate</th>
                          <th className="px-2.5 py-2 text-right font-medium">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailLines.length === 0 && (
                          <tr><td colSpan={5} className="px-2.5 py-6 text-center text-muted-foreground">No work lines recorded</td></tr>
                        )}
                        {detailLines.map((l, i) => (
                          <tr key={`${l.date}-${l.propertyName}-${i}`} className="border-t">
                            <td className="whitespace-nowrap px-2.5 py-1.5 tabular-nums">{fmtDay(l.date)}</td>
                            <td className="max-w-[140px] truncate px-2.5 py-1.5">{l.propertyName}</td>
                            <td className="px-2.5 py-1.5"><ShiftBadgeInline shift={l.shift} /></td>
                            <td className="px-2.5 py-1.5 text-right tabular-nums">{formatINR(l.rate)}</td>
                            <td className="px-2.5 py-1.5 text-right font-medium tabular-nums">{formatINR(l.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Summary */}
                <div className="rounded-xl border bg-muted/30 px-3.5 py-2">
                  <KV label="Gross earnings" value={formatINR(detail.grossEarnings ?? 0)} />
                  <KV label="Additions (bonus/OT)" value={formatINR(detail.additions ?? 0)} className="text-emerald-600 dark:text-emerald-400" />
                  <KV label="Other deductions" value={(detail.otherDeductions ?? 0) > 0 ? `−${formatINR(detail.otherDeductions ?? 0)}` : formatINR(0)} />
                  <KV label="Advance deducted" value={`−${formatINR(detail.advanceDeducted ?? 0)}`} className="text-red-600 dark:text-red-400" />
                  {(detail.advanceCarryForward ?? 0) !== 0 && (
                    <KV label="Advance carry-forward" value={formatINR(detail.advanceCarryForward ?? 0)} className="text-amber-600 dark:text-amber-400" />
                  )}
                  <div className="mt-1.5 flex items-center justify-between gap-3 border-t pt-2">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Net payable</span>
                    <span className={cn("text-lg font-bold tabular-nums", netTone)}>{formatINR(detail.netPayable ?? 0)}</span>
                  </div>
                </div>

                {/* DRAFT editing */}
                {detail.status === "DRAFT" && (
                  <div className="space-y-3 rounded-xl border border-dashed p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Adjust draft</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Additions (₹)" hint="Bonus, overtime, extra payout">
                        <MoneyInput value={additions} onChange={setAdditions} className="h-10" />
                      </Field>
                      <Field label="Other deductions (₹)" hint="Penalty, damage, unpaid leave">
                        <MoneyInput value={otherDeductions} onChange={setOtherDeductions} className="h-10" />
                      </Field>
                    </div>
                    <Field label="Notes">
                      <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={2} placeholder="Optional remarks on this statement" />
                    </Field>
                    <div className="flex justify-end">
                      <Button size="sm" className="min-h-10" onClick={() => void saveEdits()} disabled={saving}>
                        {saving ? "Saving…" : "Save changes"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Button
                  variant="outline" className="min-h-10 gap-1.5"
                  onClick={() => { setDetailId(null); navigate("statement", { id: detail.id }); }}
                >
                  <FileText className="h-4 w-4" aria-hidden />View Statement
                </Button>
                <div className="flex flex-col gap-2 sm:flex-row">
                  {detail.status === "DRAFT" && (
                    <Button
                      className="min-h-10"
                      onClick={() => { setDetailId(null); setFinalizeId(detail.id); }}
                    >
                      Finalize
                    </Button>
                  )}
                  {detail.status === "FINALIZED" && (
                    <Button className="min-h-10" onClick={() => setPayFor(detail.id)}>Mark Paid</Button>
                  )}
                  {detail.status === "PAID" && (
                    <Button variant="outline" className="min-h-10" disabled>Paid ✓</Button>
                  )}
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Finalize confirmation */}
      <AlertDialog open={Boolean(finalizeId)} onOpenChange={(v) => !v && setFinalizeId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finalize this settlement?</AlertDialogTitle>
            <AlertDialogDescription>
              Finalizing locks the statement permanently — it can only be marked paid afterwards. Draft edits will no longer be possible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-10">Cancel</AlertDialogCancel>
            <AlertDialogAction className="min-h-10" onClick={(e) => { e.preventDefault(); void finalize(); }}>
              {saving ? "Finalizing…" : "Finalize"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Mark paid dialog */}
      <Dialog open={Boolean(payFor)} onOpenChange={(v) => !v && setPayFor(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Mark settlement paid</DialogTitle>
            <DialogDescription>Record when and how the salary was disbursed.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Payment date" required>
              <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className="h-10" />
            </Field>
            <Field label="Method">
              <SelectInput value={payMethod} onChange={setPayMethod} options={METHOD_OPTIONS} />
            </Field>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="min-h-10 flex-1 sm:flex-none" onClick={() => setPayFor(null)}>Cancel</Button>
            <Button className="min-h-10 flex-1 sm:flex-none" onClick={() => void markPaid()} disabled={saving}>
              {saving ? "Saving…" : "Mark Paid"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
