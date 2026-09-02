"use client";

import { useMemo, useState } from "react";
import { api, qs } from "@/lib/api-client";
import type { ViewProps } from "@/components/view-types";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, History } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ListResp, Option, SelectInput, errMessage, fmtDay, useAsync,
} from "./_shared";

// ---------------------------------------------------------------------------
// Shapes & option lists
// ---------------------------------------------------------------------------

interface AuditRec {
  id: string;
  ownerName: string;
  action: string;
  module: string;
  recordId?: string | null;
  recordLabel?: string | null;
  previousValue?: unknown;
  newValue?: unknown;
  createdAt: string;
}

const MODULES = [
  "AUTH", "EMPLOYEE", "PROPERTY", "CONTRACT", "DEPLOYMENT", "PAYMENT", "ADVANCE",
  "SETTLEMENT", "EXPENSE", "RECURRING", "VEHICLE", "CLIENT", "TRIP", "EMI",
  "MAINTENANCE", "OWNER", "SETTINGS",
];

const ACTIONS = ["CREATE", "UPDATE", "DELETE", "STATUS", "LOGIN", "LOGOUT", "FINALIZE", "PAYMENT", "GENERATE", "TOGGLE"];

const MODULE_OPTIONS: Option[] = [{ label: "All modules", value: "" }, ...MODULES.map((m) => ({ label: m, value: m }))];
const ACTION_OPTIONS: Option[] = [{ label: "All actions", value: "" }, ...ACTIONS.map((a) => ({ label: a, value: a }))];

const PAGE_SIZE = 50;

// ---------------------------------------------------------------------------
// Local helpers (kept here — _shared.tsx is off-limits for edits)
// ---------------------------------------------------------------------------

const ACTION_TONES: Record<string, string> = {
  CREATE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  UPDATE: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  DELETE: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

function ActionBadge({ action }: { action: string }) {
  return (
    <span
      className={cn(
        "inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold",
        ACTION_TONES[action] ?? "bg-muted text-muted-foreground"
      )}
    >
      {action}
    </span>
  );
}

function fmtTime(s?: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function jsonBrief(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  try {
    const s = JSON.stringify(v);
    return s.length > 90 ? `${s.slice(0, 90)}…` : s;
  } catch {
    return String(v);
  }
}

function pretty(v: unknown): string {
  if (v === null || v === undefined) return "—";
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

// ---------------------------------------------------------------------------
// Change detail dialog
// ---------------------------------------------------------------------------

function ChangeDetailDialog({ entry, onClose }: { entry: AuditRec | null; onClose: () => void }) {
  return (
    <Dialog open={Boolean(entry)} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            Change details
            {entry && <ActionBadge action={entry.action} />}
          </DialogTitle>
          <DialogDescription>
            {entry ? `${entry.module} · ${entry.recordLabel || entry.recordId || ""}` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Previous value</p>
            <pre className="max-h-[40vh] overflow-auto whitespace-pre-wrap rounded-xl bg-muted p-3 font-mono text-[11px] leading-relaxed">
              {pretty(entry?.previousValue)}
            </pre>
          </div>
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">New value</p>
            <pre className="max-h-[40vh] overflow-auto whitespace-pre-wrap rounded-xl bg-muted p-3 font-mono text-[11px] leading-relaxed">
              {pretty(entry?.newValue)}
            </pre>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

export default function AuditView(_props: ViewProps) {
  const [ownerId, setOwnerId] = useState("");
  const [module, setModule] = useState("");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<AuditRec | null>(null);

  const ownersReq = useAsync<ListResp<{ id: string; name: string; username: string }>>(
    () => api.get<ListResp<{ id: string; name: string; username: string }>>("/api/owners"),
    []
  );

  const ownerOptions: Option[] = useMemo(
    () => [
      { label: "All owners", value: "" },
      ...(ownersReq.data?.items ?? []).map((o) => ({ label: o.name, value: o.id })),
    ],
    [ownersReq.data]
  );

  const { data, loading, error, reload } = useAsync<ListResp<AuditRec>>(
    () => api.get<ListResp<AuditRec>>("/api/audit" + qs({ ownerId, module, action, from, to, page, pageSize: PAGE_SIZE })),
    [ownerId, module, action, from, to, page]
  );

  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const columns: Column<AuditRec>[] = [
    {
      key: "createdAt",
      label: "When",
      primary: true,
      render: (r) => (
        <div className="min-w-0">
          <p className="whitespace-nowrap text-[13px] font-medium">{fmtDay(r.createdAt)}</p>
          <p className="text-[11px] text-muted-foreground tabular-nums">{fmtTime(r.createdAt)}</p>
        </div>
      ),
      value: (r) => fmtDay(r.createdAt),
    },
    { key: "ownerName", label: "Owner", value: (r) => r.ownerName, hideOnMobile: true },
    { key: "action", label: "Action", render: (r) => <ActionBadge action={r.action} />, value: (r) => r.action },
    { key: "module", label: "Module", value: (r) => r.module },
    {
      key: "recordLabel",
      label: "Record",
      render: (r) => <span className="block max-w-[180px] truncate text-[13px]">{r.recordLabel || r.recordId || "—"}</span>,
      value: (r) => r.recordLabel ?? "",
      hideOnMobile: true,
    },
    {
      key: "change",
      label: "Change",
      render: (r) =>
        r.previousValue || r.newValue ? (
          <button
            type="button"
            className="max-w-[240px] text-left text-[11px] leading-snug text-muted-foreground line-clamp-2 hover:text-foreground hover:underline"
            onClick={() => setDetail(r)}
            aria-label="View full change details"
          >
            {r.previousValue ? jsonBrief(r.previousValue) : "—"} → {r.newValue ? jsonBrief(r.newValue) : "—"}
          </button>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
      value: (r) => `${jsonBrief(r.previousValue)} → ${jsonBrief(r.newValue)}`,
    },
  ];

  const resetPage = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Audit Log"
        subtitle={`${total} entr${total === 1 ? "y" : "ies"} · every change is recorded`}
        icon={History}
        actions={
          <Button variant="outline" size="sm" className="h-9" onClick={() => void reload()} disabled={loading}>
            Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
        <div className="col-span-2 md:col-span-1">
          <SelectInput value={ownerId} onChange={resetPage(setOwnerId)} options={ownerOptions} placeholder="All owners" />
        </div>
        <SelectInput value={module} onChange={resetPage(setModule)} options={MODULE_OPTIONS} placeholder="All modules" />
        <SelectInput value={action} onChange={resetPage(setAction)} options={ACTION_OPTIONS} placeholder="All actions" />
        <Input
          type="date"
          value={from}
          onChange={(e) => resetPage(setFrom)(e.target.value)}
          className="h-10"
          aria-label="From date"
        />
        <Input
          type="date"
          value={to}
          onChange={(e) => resetPage(setTo)(e.target.value)}
          className="h-10"
          aria-label="To date"
        />
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50/60 p-4 text-center dark:border-red-900 dark:bg-red-950/30">
          <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
          <Button variant="outline" size="sm" className="mt-2 h-8" onClick={() => void reload()}>Retry</Button>
        </div>
      )}

      {!error && (
        <DataTable
          columns={columns}
          rows={data?.items ?? []}
          rowKey={(r) => r.id}
          loading={loading}
          emptyIcon={History}
          emptyTitle="No audit entries"
          emptyDescription="Actions like creating, updating or finalizing records will appear here."
          footer={
            total > pageSize ? (
              <div className="flex items-center justify-between gap-2 border-t px-1 py-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-9 gap-1"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-3.5 w-3.5" aria-hidden />Prev
                </Button>
                <span className="text-xs text-muted-foreground tabular-nums">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-9 gap-1"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next<ChevronRight className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </div>
            ) : null
          }
        />
      )}

      <ChangeDetailDialog entry={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
