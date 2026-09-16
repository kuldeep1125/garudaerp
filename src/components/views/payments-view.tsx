"use client";

import { useCallback, useEffect, useState } from "react";
import { api, qs } from "@/lib/api-client";
import { formatINR } from "@/lib/money";
import type { ViewProps } from "@/components/view-types";
import { PageHeader } from "@/components/shared/page-header";
import { ViewFab } from "@/components/shared/view-fab";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/shared/status-badge";
import { toast } from "sonner";
import { useLang, t } from "@/lib/i18n";
import { Wallet, Plus, Building2, ArrowRight } from "lucide-react";
import { TransactionLineageDialog, type TransactionLineageData } from "@/components/shared/transaction-lineage-dialog";
import {
  ListResp, Option, PaymentRec, PropertyRec, RecordPaymentDialog, SelectInput, errMessage, fmtDay, useAsync,
} from "./_shared";

interface PendingRow {
  propertyId: string;
  propertyName: string;
  outstanding: number;
  oldestUnpaidDate?: string | null;
  unpaidCount?: number;
}

export default function PaymentsView({ params, navigate }: ViewProps) {
  const { lang } = useLang();
  const [tab, setTab] = useState("outstanding");
  const [payFor, setPayFor] = useState<string | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [lineageData, setLineageData] = useState<TransactionLineageData | null>(null);

  // History filters
  const [historyProperty, setHistoryProperty] = useState(params?.propertyId ?? "");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const pending = useAsync<{ items: PendingRow[]; total: number }>(
    () => api.get("/api/payments/pending"),
    [tab]
  );

  const { data: propsData } = useAsync<ListResp<PropertyRec>>(
    () => api.get<ListResp<PropertyRec>>("/api/properties" + qs({ pageSize: 200 })),
    []
  );

  const [history, setHistory] = useState<(ListResp<PaymentRec> & { totals?: { received: number } }) | null>(null);
  const [hLoading, setHLoading] = useState(true);
  const [hError, setHError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setHLoading(true);
    try {
      const d = await api.get<ListResp<PaymentRec> & { totals?: { received: number } }>(
        "/api/payments" + qs({ propertyId: historyProperty || undefined, from: from || undefined, to: to || undefined, pageSize: 200 })
      );
      setHistory(d);
      setHError(null);
    } catch (e) {
      setHError(errMessage(e));
      toast.error(errMessage(e));
    } finally {
      setHLoading(false);
    }
  }, [historyProperty, from, to]);

  useEffect(() => { if (tab === "history") void loadHistory(); }, [tab, loadHistory]);

  const refreshAll = () => {
    if (tab === "outstanding") void pending.reload();
    else void loadHistory();
  };

  const propertyOptions: Option[] = [
    { label: "All properties", value: "" },
    ...(propsData?.items ?? []).map((p) => ({ label: p.name, value: p.id })),
  ];

  const historyColumns: Column<PaymentRec>[] = [
    { key: "date", label: t(lang, "col.date"), value: (r) => fmtDay(r.date), hideOnMobile: true },
    {
      key: "propertyName", label: t(lang, "col.property"), primary: true,
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{r.propertyName ?? "—"}</p>
          <p className="text-[11px] text-muted-foreground">{fmtDay(r.date)}</p>
        </div>
      ),
      value: (r) => r.propertyName ?? "—",
    },
    { key: "amount", label: t(lang, "col.amount"), className: "text-right", render: (r) => <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{formatINR(r.amount)}</span>, value: (r) => formatINR(r.amount) },
    { key: "method", label: t(lang, "col.method"), value: (r) => r.method ?? "—" },
    { key: "reference", label: t(lang, "col.reference"), value: (r) => r.reference ?? "—", hideOnMobile: true },
    { key: "receivedBy", label: t(lang, "col.receivedBy"), value: (r) => r.receivedByName ?? "—", hideOnMobile: true },
    {
      key: "lineage",
      label: "Trail",
      className: "text-right",
      render: (r) => (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs font-medium text-primary hover:text-primary"
          onClick={(e) => {
            e.stopPropagation();
            setLineageData({
              id: r.id,
              title: `Payment: ${r.propertyName ?? "Property"}`,
              type: "Property Payment",
              amount: r.amount,
              date: r.date,
              createdByName: r.receivedByName,
              ruleExplanation: "Property collection reduces customer receivables via FIFO and increases company liquidity in Cash/Bank.",
              impactedAccounts: [
                {
                  account: `Cash / Bank (${r.method ?? "UPI"})`,
                  type: "debit",
                  amount: r.amount,
                  description: "Cash inflow received from restaurant",
                },
                {
                  account: `Receivable: ${r.propertyName ?? "Property"}`,
                  type: "credit",
                  amount: r.amount,
                  description: "Reduced outstanding balance via FIFO allocation",
                },
              ],
              linkedEntities: [
                {
                  label: "Serviced Property",
                  name: r.propertyName ?? "Property",
                  onClick: () => {
                    setLineageData(null);
                    navigate("properties", { id: r.propertyId });
                  },
                },
              ],
              notes: r.reference ? `Ref: ${r.reference}` : undefined,
            });
          }}
        >
          View Trail →
        </Button>
      ),
      value: () => "View Trail",
    },
  ];

  const totalOutstanding = (pending.data?.items ?? []).reduce((s, i) => s + (i.outstanding ?? 0), 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title={t(lang, "page.payments")}
        subtitle={t(lang, "page.payments.sub")}
        actions={
          <Button size="sm" className="h-9 gap-1.5" onClick={() => setQuickOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden />Record Payment
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-2 sm:w-80">
          <TabsTrigger value="outstanding">Outstanding</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="outstanding" className="mt-3 space-y-3">
          {pending.loading && (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
          )}

          {!pending.loading && !pending.error && (pending.data?.items ?? []).length === 0 && (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
                <div className="rounded-full bg-emerald-100 p-3 dark:bg-emerald-950"><Wallet className="h-6 w-6 text-emerald-600 dark:text-emerald-400" aria-hidden /></div>
                <p className="text-sm font-semibold">Nothing outstanding</p>
                <p className="text-xs text-muted-foreground">Every property is fully collected. Excellent.</p>
              </CardContent>
            </Card>
          )}

          {!pending.loading && !pending.error && (pending.data?.items ?? []).length > 0 && (
            <p className="text-xs text-muted-foreground">
              Total outstanding <span className="font-bold text-red-600 tabular-nums dark:text-red-400">{formatINR(totalOutstanding)}</span> across {pending.data?.items.length} properties. Tap a card to record payment.
            </p>
          )}

          {!pending.loading && (pending.data?.items ?? []).map((row) => (
            <Card
              key={row.propertyId}
              className="cursor-pointer border-border/70 shadow-sm transition-all hover:border-primary/40 hover:shadow-md"
              onClick={() => setPayFor(row.propertyId)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPayFor(row.propertyId); } }}
              aria-label={`Record payment for ${row.propertyName}, outstanding ${formatINR(row.outstanding)}`}
            >
              <CardContent className="flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{row.propertyName}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Oldest unpaid {row.oldestUnpaidDate ? fmtDay(row.oldestUnpaidDate) : "—"}
                    {row.unpaidCount ? ` · ${row.unpaidCount} day${row.unpaidCount === 1 ? "" : "s"}` : ""}
                  </p>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Outstanding</p>
                    <p className="text-lg font-bold tabular-nums text-red-600 dark:text-red-400">{formatINR(row.outstanding)}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate("properties", { id: row.propertyId });
                    }}
                    title="View Property 360° Ledger"
                  >
                    <Building2 className="h-3.5 w-3.5 text-primary" />
                    Ledger
                  </Button>
                  <Button size="icon" variant="ghost" className="h-9 w-9 sm:h-8 sm:w-8 shrink-0" aria-label="Open">
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="history" className="mt-3 space-y-3">
          <Card>
            <CardContent className="space-y-3 p-3 sm:p-4">
              <div className="grid gap-2.5 sm:grid-cols-3">
                <SelectInput value={historyProperty} onChange={setHistoryProperty} options={propertyOptions} placeholder="All properties" />
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-10" aria-label="From date" />
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-10" aria-label="To date" />
              </div>
              <div className="flex items-center justify-between rounded-xl bg-muted/60 px-3.5 py-2.5">
                <p className="text-xs text-muted-foreground">Received in selection</p>
                <p className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{formatINR(history?.totals?.received ?? 0)}</p>
              </div>
              {hError && (
                <div className="rounded-xl border border-red-200 bg-red-50/60 p-4 text-center dark:border-red-900 dark:bg-red-950/30">
                  <p className="text-xs text-red-700 dark:text-red-300">{hError}</p>
                  <Button variant="outline" size="sm" className="mt-2 h-8" onClick={() => void loadHistory()}>Retry</Button>
                </div>
              )}
              {!hError && (
                <DataTable
                  columns={historyColumns}
                  rows={history?.items ?? []}
                  rowKey={(r) => r.id}
                  exportName="collections"
                  loading={hLoading}
                  emptyIcon={Wallet}
                  emptyTitle="No payments in this period"
                  emptyDescription="Recorded property payments will appear here."
                />
              )}
            </CardContent>
          </Card>
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => navigate("properties")}>
            <Building2 className="h-3.5 w-3.5" aria-hidden />Open properties
          </Button>
        </TabsContent>
      </Tabs>

      <RecordPaymentDialog
        open={Boolean(payFor)}
        onOpenChange={(v) => !v && setPayFor(null)}
        propertyId={payFor ?? undefined}
        onDone={refreshAll}
      />
      <RecordPaymentDialog
        open={quickOpen}
        onOpenChange={setQuickOpen}
        onDone={refreshAll}
      />

      <TransactionLineageDialog
        open={Boolean(lineageData)}
        onOpenChange={(v) => !v && setLineageData(null)}
        data={lineageData}
      />

      {/* Mobile FAB — alternate trigger for Record Payment */}
      <ViewFab icon={Plus} label="Record payment" onClick={() => setQuickOpen(true)} />
    </div>
  );
}
