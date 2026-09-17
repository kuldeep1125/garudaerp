"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, api, qs } from "@/lib/api-client";
import { formatINR, parseAmount } from "@/lib/money";
import type { ViewProps } from "@/components/view-types";
import { PageHeader } from "@/components/shared/page-header";
import { ViewFab } from "@/components/shared/view-fab";
import { DataTable, type Column } from "@/components/shared/data-table";
import { SearchInput } from "@/components/shared/filters";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/shared/status-badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useLang, t } from "@/lib/i18n";
import {
  UserRound, MoreHorizontal, Pencil, Eye, HandCoins, UserPlus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  EmployeePayBadges, EmployeeRec, Field, GiveAdvanceDialog, ListResp, Option, SelectInput, errMessage, useMutation,
} from "./_shared";
import { EmployeeFormDialog } from "@/components/shared/employee-form-dialog";

const STATUS_OPTIONS: Option[] = [
  { label: "All statuses", value: "" },
  { label: "Active", value: "ACTIVE" },
  { label: "Inactive", value: "INACTIVE" },
];

const TYPE_OPTIONS: Option[] = [
  { label: "All types", value: "" },
  { label: "Salaried (monthly)", value: "SALARIED" },
  { label: "Non-salaried (per shift)", value: "NON_SALARIED" },
];

const STATUS_VALUES = ["ACTIVE", "INACTIVE"];

export default function EmployeesView({ params, navigate }: ViewProps) {
  const { lang } = useLang();

  // If a specific employee ID is passed via navigation bridge, forward straight to detail
  useEffect(() => {
    if (params?.id) {
      navigate("employee-detail", { id: params.id });
    }
  }, [params?.id, navigate]);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [employmentType, setEmploymentType] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EmployeeRec | null>(null);
  const [advanceTarget, setAdvanceTarget] = useState<EmployeeRec | null>(null);
  const { mutate, saving } = useMutation();

  const [data, setData] = useState<ListResp<EmployeeRec> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.get<ListResp<EmployeeRec>>("/api/employees" + qs({ search: search || undefined, status: status || undefined, employmentType: employmentType || undefined, pageSize: 200 }));
      setData(d);
      setError(null);
    } catch (e) {
      const msg = errMessage(e);
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [search, status, employmentType]);

  useEffect(() => { void load(); }, [load]);

  const rows = data?.items ?? [];

  const changeStatus = async (emp: EmployeeRec, next: string) => {
    const res = await mutate(() => api.post(`/api/employees/${emp.id}/status`, { status: next }), `${emp.fullName} marked ${next.toLowerCase()}`);
    if (res.ok) void load();
  };

  const columns: Column<EmployeeRec>[] = [
    { key: "code", label: t(lang, "col.code"), className: "font-mono text-xs", value: (r) => r.code, hideOnMobile: true },
    {
      key: "fullName", label: t(lang, "col.employee"), primary: true,
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{r.fullName}</p>
          <p className="truncate text-[11px] text-muted-foreground">{r.designation || "—"} · {r.code}{r.hasContractor && r.contractorName ? ` · via ${r.contractorName}` : ""}</p>
          <div className="mt-1 flex flex-wrap gap-1"><EmployeePayBadges r={r} /></div>
        </div>
      ),
      value: (r) => r.fullName,
    },
    { key: "mobile", label: t(lang, "col.mobile"), value: (r) => r.mobile ?? "—", hideOnMobile: true },
    {
      key: "rate", label: "Pay", className: "text-right",
      render: (r) => r.employmentType === "SALARIED"
        ? <span className="tabular-nums">{formatINR(r.monthlySalary ?? 0)}<span className="text-[10px] text-muted-foreground">/mo</span></span>
        : <span className="tabular-nums">{formatINR(r.standardRate ?? 0)}<span className="text-[10px] text-muted-foreground">/shift</span></span>,
      value: (r) => r.employmentType === "SALARIED" ? `${formatINR(r.monthlySalary ?? 0)}/mo` : `${formatINR(r.standardRate ?? 0)}/shift`,
    },
    { key: "status", label: t(lang, "col.status"), render: (r) => <StatusBadge status={r.status} />, value: (r) => r.status },
    {
      key: "advanceBalance", label: t(lang, "col.advanceDue"), className: "text-right",
      render: (r) => (
        <span className={cn("tabular-nums font-medium", (r.advanceBalance ?? 0) > 0 && "text-red-600 dark:text-red-400")}>
          {formatINR(r.advanceBalance ?? 0)}
        </span>
      ),
      value: (r) => formatINR(r.advanceBalance ?? 0),
    },
    {
      key: "actions", label: "", className: "w-14",
      render: (r) => (
        <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 sm:h-8 sm:w-8" aria-label={`Actions for ${r.fullName}`}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel className="text-xs">{r.fullName}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("employee-detail", { id: r.id })}>
                <Eye className="h-3.5 w-3.5" />View profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setEditTarget(r)}>
                <Pencil className="h-3.5 w-3.5" />Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setAdvanceTarget(r)}>
                <HandCoins className="h-3.5 w-3.5" />Give advance
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">Change status</DropdownMenuLabel>
              {STATUS_VALUES.filter((s) => s !== r.status).map((s) => (
                <DropdownMenuItem key={s} disabled={saving} onClick={() => void changeStatus(r, s)}>
                  {s.charAt(0) + s.slice(1).toLowerCase()}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
      value: () => "",
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title={t(lang, "page.employees")}
        subtitle={t(lang, "page.employees.sub").replace("{n}", String(data?.total ?? 0))}
        actions={
          <Button size="sm" className="h-9 gap-1.5" onClick={() => setAddOpen(true)}>
            <UserPlus className="h-4 w-4" aria-hidden />Add Employee
          </Button>
        }
      />

      <Card>
        <CardContent className="space-y-3 p-3 sm:p-4">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <SearchInput value={search} onChange={setSearch} placeholder="Search name, code, mobile, contractor…" className="flex-1" />
            <div className="grid grid-cols-2 gap-2 sm:flex sm:w-auto">
              <div className="w-full sm:w-44">
                <SelectInput value={employmentType} onChange={setEmploymentType} options={TYPE_OPTIONS} placeholder="All types" />
              </div>
              <div className="w-full sm:w-36">
                <SelectInput value={status} onChange={setStatus} options={STATUS_OPTIONS} placeholder="All statuses" />
              </div>
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
              onRowClick={(r) => navigate("employee-detail", { id: r.id })}
              exportName="employees"
              loading={loading}
              emptyIcon={UserRound}
              emptyTitle={search || status ? "No employees match" : "No employees yet"}
              emptyDescription={search || status ? "Try clearing the search or status filter." : "Add your first employee to start deploying."}
            />
          )}
        </CardContent>
      </Card>

      <EmployeeFormDialog open={addOpen} onOpenChange={setAddOpen} employee={null} onDone={load} />
      <EmployeeFormDialog open={Boolean(editTarget)} onOpenChange={(v) => !v && setEditTarget(null)} employee={editTarget} onDone={load} />
      <GiveAdvanceDialog
        open={Boolean(advanceTarget)}
        onOpenChange={(v) => !v && setAdvanceTarget(null)}
        defaultEmployeeId={advanceTarget?.id}
        employees={advanceTarget ? [{ id: advanceTarget.id, fullName: advanceTarget.fullName, code: advanceTarget.code, standardRate: advanceTarget.standardRate, advanceBalance: advanceTarget.advanceBalance }] : undefined}
        onDone={load}
      />

      {/* Mobile FAB — alternate trigger for Add Employee */}
      <ViewFab icon={UserPlus} label="Add employee" onClick={() => setAddOpen(true)} />
    </div>
  );
}
