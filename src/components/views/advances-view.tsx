"use client";

import { useCallback, useEffect, useState } from "react";
import { api, qs } from "@/lib/api-client";
import { formatINR } from "@/lib/money";
import type { ViewProps } from "@/components/view-types";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { StatCard, StatGrid } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HandCoins, Users, Wallet, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type AdvanceRec, type EmployeeRec, type ListResp, type Option, SelectInput, ErrorState,
  fmtDay, useAsync, GiveAdvanceDialog, errMessage,
} from "./_shared";
import { toast } from "sonner";

interface BalanceRow {
  employeeId: string;
  employeeName: string;
  employeeCode?: string | null;
  totalTaken: number;
  totalDeducted: number;
  balance: number;
}

export default function AdvancesView({ navigate }: ViewProps) {
  const [tab, setTab] = useState("balances");
  const [giveOpen, setGiveOpen] = useState(false);

  // ----- Balances -----
  const balances = useAsync<{ items: BalanceRow[]; total: number }>(() => api.get("/api/advances/balances"), []);

  const balanceColumns: Column<BalanceRow>[] = [
    {
      key: "employeeName", label: "Employee", primary: true,
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{r.employeeName}</p>
          <p className="truncate text-[11px] text-muted-foreground">{r.employeeCode ?? "—"}</p>
        </div>
      ),
      value: (r) => r.employeeName,
    },
    { key: "totalTaken", label: "Taken", className: "text-right", hideOnMobile: true, value: (r) => formatINR(r.totalTaken) },
    { key: "totalDeducted", label: "Deducted", className: "text-right", hideOnMobile: true, value: (r) => formatINR(r.totalDeducted) },
    {
      key: "balance", label: "Outstanding balance",
      render: (r) => (
        <span className={cn("font-bold tabular-nums", r.balance > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400")}>
          {formatINR(r.balance)}
        </span>
      ),
      value: (r) => formatINR(r.balance),
    },
    { key: "go", label: "", render: () => <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden />, value: () => "", className: "w-8" },
  ];

  // ----- History -----
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [history, setHistory] = useState<(ListResp<AdvanceRec> & { totals?: { given: number } }) | null>(null);
  const [hLoading, setHLoading] = useState(true);
  const [hError, setHError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setHLoading(true);
    try {
      const d = await api.get<ListResp<AdvanceRec> & { totals?: { given: number } }>(
        "/api/advances" + qs({ employeeId: employeeFilter || undefined, from: from || undefined, to: to || undefined, pageSize: 200 })
      );
      setHistory(d);
      setHError(null);
    } catch (e) {
      setHError(errMessage(e));
      toast.error(errMessage(e));
    } finally {
      setHLoading(false);
    }
  }, [employeeFilter, from, to]);

  useEffect(() => { if (tab === "history") void loadHistory(); }, [tab, loadHistory]);

  // Employee options (all statuses) for the filter.
  const [employees, setEmployees] = useState<EmployeeRec[]>([]);
  useEffect(() => {
    let cancelled = false;
    api.get<ListResp<EmployeeRec>>("/api/employees" + qs({ pageSize: 200 }))
      .then((d) => { if (!cancelled) setEmployees(d.items); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const employeeOptions: Option[] = [
    { label: "All employees", value: "" },
    ...employees.map((e) => ({ label: `${e.fullName} (${e.code})`, value: e.id })),
  ];

  const historyColumns: Column<AdvanceRec>[] = [
    { key: "date", label: "Date", value: (r) => fmtDay(r.date), hideOnMobile: true },
    {
      key: "employeeName", label: "Employee", primary: true,
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{r.employeeName ?? "—"}</p>
          <p className="truncate text-[11px] text-muted-foreground">{r.employeeCode ?? ""}{r.date ? ` · ${fmtDay(r.date)}` : ""}</p>
        </div>
      ),
      value: (r) => r.employeeName ?? "—",
    },
    {
      key: "amount", label: "Amount", className: "text-right",
      render: (r) => <span className="font-semibold tabular-nums text-red-600 dark:text-red-400">{formatINR(r.amount)}</span>,
      value: (r) => formatINR(r.amount),
    },
    { key: "reason", label: "Reason", value: (r) => r.reason || "—", hideOnMobile: true },
    { key: "method", label: "Method", value: (r) => r.method ?? "—" },
    { key: "givenBy", label: "Given by", value: (r) => r.givenByName ?? "—", hideOnMobile: true },
  ];

  const refreshAll = () => {
    void balances.reload();
    if (tab === "history") void loadHistory();
  };

  const totalOutstanding = (balances.data?.items ?? []).reduce((s, b) => s + (b.balance > 0 ? b.balance : 0), 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Advances"
        subtitle="Salary advances & outstanding balances"
        actions={
          <Button size="sm" className="h-9 gap-1.5" onClick={() => setGiveOpen(true)}>
            <HandCoins className="h-4 w-4" aria-hidden />Give Advance
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-2 sm:w-72">
          <TabsTrigger value="balances">Balances</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {/* ----- Balances ----- */}
        <TabsContent value="balances" className="mt-3 space-y-3">
          <StatGrid cols={2}>
            <StatCard label="Employees with outstanding" value={String((balances.data?.items ?? []).filter((b) => b.balance > 0).length)} icon={Users} tone="warning" />
            <StatCard label="Total outstanding" value={formatINR(totalOutstanding)} icon={Wallet} tone="negative" hint="Recovered via month-end settlement" />
          </StatGrid>
          <Card>
            <CardContent className="p-3 sm:p-4">
              {balances.error ? (
                <ErrorState message={balances.error} onRetry={() => void balances.reload()} />
              ) : (
                <DataTable
                  columns={balanceColumns}
                  rows={balances.data?.items ?? []}
                  rowKey={(r) => r.employeeId}
                  onRowClick={(r) => navigate("employee-detail", { id: r.employeeId })}
                  loading={balances.loading}
                  emptyIcon={HandCoins}
                  emptyTitle="No advances on record"
                  emptyDescription="Balances appear here once advances are given and settlements deduct them."
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ----- History ----- */}
        <TabsContent value="history" className="mt-3 space-y-3">
          <Card>
            <CardContent className="space-y-3 p-3 sm:p-4">
              <div className="flex flex-col gap-2.5 md:flex-row md:items-center">
                <div className="w-full md:w-56">
                  <SelectInput value={employeeFilter} onChange={setEmployeeFilter} options={employeeOptions} placeholder="All employees" />
                </div>
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-10 flex-1 sm:flex-none sm:w-40" aria-label="From date" />
                  <span className="text-xs text-muted-foreground">to</span>
                  <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-10 flex-1 sm:flex-none sm:w-40" aria-label="To date" />
                </div>
              </div>

              {hError ? (
                <ErrorState message={hError} onRetry={() => void loadHistory()} />
              ) : (
                <>
                  <StatCard
                    label="Total advanced (filtered)"
                    value={formatINR(history?.totals?.given ?? 0)}
                    icon={Wallet}
                    tone="warning"
                    hint={`${history?.total ?? 0} record(s)`}
                  />
                  <DataTable
                    columns={historyColumns}
                    rows={history?.items ?? []}
                    rowKey={(r) => r.id}
                    loading={hLoading}
                    emptyIcon={HandCoins}
                    emptyTitle="No advances found"
                    emptyDescription="Adjust the filters or record a new advance."
                  />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <GiveAdvanceDialog open={giveOpen} onOpenChange={setGiveOpen} onDone={refreshAll} />
    </div>
  );
}
