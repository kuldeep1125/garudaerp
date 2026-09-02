"use client";

import { useCallback, useEffect, useState } from "react";
import { api, qs } from "@/lib/api-client";
import { formatINR } from "@/lib/money";
import type { ViewProps } from "@/components/view-types";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { toast } from "sonner";
import { ScrollText, Plus, Pencil } from "lucide-react";
import {
  ContractFormDialog, ContractRec, ListResp, Option, PropertyRec, SelectInput, ShiftBadgeInline,
  errMessage, fmtDay, useAsync,
} from "./_shared";

const STATUS_OPTIONS: Option[] = [
  { label: "All statuses", value: "" },
  { label: "Active", value: "ACTIVE" },
  { label: "Ended", value: "ENDED" },
];

export default function ContractsView({ navigate }: ViewProps) {
  const [propertyId, setPropertyId] = useState("");
  const [status, setStatus] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ContractRec | null>(null);

  const { data: propsData } = useAsync<ListResp<PropertyRec>>(
    () => api.get<ListResp<PropertyRec>>("/api/properties" + qs({ pageSize: 200 })),
    []
  );
  const propertyOptions: Option[] = [
    { label: "All properties", value: "" },
    ...(propsData?.items ?? []).map((p) => ({ label: p.name, value: p.id })),
  ];

  const [data, setData] = useState<ContractRec[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.get<ListResp<ContractRec>>("/api/contracts" + qs({ propertyId: propertyId || undefined, status: status || undefined, pageSize: 200 }));
      setData(Array.isArray(d) ? d : d.items ?? []);
      setError(null);
    } catch (e) {
      setError(errMessage(e));
      toast.error(errMessage(e));
    } finally {
      setLoading(false);
    }
  }, [propertyId, status]);

  useEffect(() => { void load(); }, [load]);

  const rows = data ?? [];
  const activeCount = rows.filter((r) => r.status === "ACTIVE").length;

  const columns: Column<ContractRec>[] = [
    {
      key: "property", label: "Property", primary: true,
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{r.propertyName ?? "—"}</p>
          <p className="truncate text-[11px] text-muted-foreground">{r.name}</p>
        </div>
      ),
      value: (r) => r.propertyName ?? "—",
    },
    { key: "dates", label: "Period", value: (r) => `${fmtDay(r.startDate)} → ${r.endDate ? fmtDay(r.endDate) : "open"}`, hideOnMobile: true },
    { key: "billing", label: "Billing", className: "text-right", value: (r) => formatINR(r.billingRate) },
    { key: "payout", label: "Payout", className: "text-right", value: (r) => formatINR(r.payoutRate), hideOnMobile: true },
    {
      key: "margin", label: "Margin/shift", className: "text-right",
      render: (r) => <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{formatINR(r.billingRate - r.payoutRate)}</span>,
      value: (r) => formatINR(r.billingRate - r.payoutRate),
    },
    { key: "shift", label: "Shift", render: (r) => <ShiftBadgeInline shift={r.shift ?? "ALL"} />, value: (r) => r.shift ?? "ALL", hideOnMobile: true },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} />, value: (r) => r.status },
    {
      key: "actions", label: "", className: "w-12",
      render: (r) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Edit ${r.name}`} onClick={() => setEditTarget(r)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
      value: () => "",
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Contracts & Rates"
        subtitle={`${activeCount} active · rate changes affect future deployments only`}
        actions={
          <Button size="sm" className="h-9 gap-1.5" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden />New Contract
          </Button>
        }
      />

      <Card>
        <CardContent className="space-y-3 p-3 sm:p-4">
          <div className="flex flex-col gap-2.5 sm:flex-row">
            <div className="flex-1">
              <SelectInput value={propertyId} onChange={setPropertyId} options={propertyOptions} placeholder="All properties" />
            </div>
            <div className="sm:w-40">
              <SelectInput value={status} onChange={setStatus} options={STATUS_OPTIONS} placeholder="All statuses" />
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50/60 p-4 text-center dark:border-red-900 dark:bg-red-950/30">
              <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
              <Button variant="outline" size="sm" className="mt-2 h-8" onClick={() => void load()}>Retry</Button>
            </div>
          )}

          {!error && (
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(r) => r.id}
              onRowClick={(r) => navigate("property-detail", { id: r.propertyId })}
              exportName="contracts"
              loading={loading}
              emptyIcon={ScrollText}
              emptyTitle="No contracts found"
              emptyDescription="Create a contract to define billing & payout rates per property."
            />
          )}
        </CardContent>
      </Card>

      <ContractFormDialog open={addOpen} onOpenChange={setAddOpen} onDone={load} />
      <ContractFormDialog
        open={Boolean(editTarget)}
        onOpenChange={(v) => !v && setEditTarget(null)}
        contract={editTarget}
        onDone={load}
      />
    </div>
  );
}
