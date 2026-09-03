"use client";

import { useCallback, useEffect, useState } from "react";
import { api, qs } from "@/lib/api-client";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/shared/status-badge";
import { toast } from "sonner";
import { useLang, t } from "@/lib/i18n";
import { Building2, Plus } from "lucide-react";
import { Field, ListResp, MoneyInput, Option, PropertyRec, SelectInput, errMessage, useMutation } from "./_shared";

const STATUS_OPTIONS: Option[] = [
  { label: "All statuses", value: "" },
  { label: "Active", value: "ACTIVE" },
  { label: "Inactive", value: "INACTIVE" },
];

const TYPES = ["Restaurant", "Cloud Kitchen", "Cafe", "Bar", "Banquet", "Other"];

function PropertyFormDialog({ open, onOpenChange, onDone }: {
  open: boolean; onOpenChange: (v: boolean) => void; onDone: () => void;
}) {
  const [form, setForm] = useState({ name: "", brandName: "", type: "Restaurant", billingRate: "", contactPerson: "", contactNumber: "", whatsapp: "", email: "", address: "", startDate: "", notes: "" });
  const { mutate, saving } = useMutation();

  // Reset form each time the dialog opens (render-time state adjustment).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setForm({ name: "", brandName: "", type: "Restaurant", billingRate: "", contactPerson: "", contactNumber: "", whatsapp: "", email: "", address: "", startDate: "", notes: "" });
  }

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.name.trim()) { toast.error("Property name is required"); return; }
    const rate = parseAmount(form.billingRate);
    if (rate <= 0) { toast.error("Set the billing rate (₹ per shift)"); return; }
    const res = await mutate(() => api.post("/api/properties", {
      name: form.name.trim(),
      brandName: form.brandName || undefined,
      type: form.type || undefined,
      billingRate: rate,
      contactPerson: form.contactPerson || undefined,
      contactNumber: form.contactNumber || undefined,
      whatsapp: form.whatsapp || undefined,
      email: form.email || undefined,
      address: form.address || undefined,
      startDate: form.startDate || undefined,
      notes: form.notes || undefined,
    }), "Property added — rate applies to all future deployments");
    if (res.ok) { onOpenChange(false); onDone(); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Property</DialogTitle>
          <DialogDescription>A client location where staff is deployed.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" required className="sm:col-span-2"><Input value={form.name} onChange={(e) => set("name")(e.target.value)} className="h-10" placeholder="e.g. Spice Garden" /></Field>
          <Field label="Brand name"><Input value={form.brandName} onChange={(e) => set("brandName")(e.target.value)} className="h-10" /></Field>
          <Field label="Type">
            <SelectInput value={form.type} onChange={set("type")} options={TYPES.map((t) => ({ label: t, value: t }))} />
          </Field>
          <Field
            label="Billing rate (₹/shift)"
            required
            className="sm:col-span-2"
            hint="Charged to the property per employee per shift. Full shift = 2 units. Change it anytime — old records keep their original rate."
          >
            <MoneyInput value={form.billingRate} onChange={set("billingRate")} className="h-10" placeholder="e.g. 650" />
          </Field>
          <Field label="Contact person"><Input value={form.contactPerson} onChange={(e) => set("contactPerson")(e.target.value)} className="h-10" /></Field>
          <Field label="Contact number"><Input value={form.contactNumber} onChange={(e) => set("contactNumber")(e.target.value)} inputMode="tel" className="h-10" /></Field>
          <Field label="WhatsApp"><Input value={form.whatsapp} onChange={(e) => set("whatsapp")(e.target.value)} inputMode="tel" className="h-10" /></Field>
          <Field label="Email"><Input value={form.email} onChange={(e) => set("email")(e.target.value)} inputMode="email" className="h-10" /></Field>
          <Field label="Address" className="sm:col-span-2"><Textarea value={form.address} onChange={(e) => set("address")(e.target.value)} rows={2} /></Field>
          <Field label="Start date"><Input type="date" value={form.startDate} onChange={(e) => set("startDate")(e.target.value)} className="h-10" /></Field>
          <Field label="Notes"><Input value={form.notes} onChange={(e) => set("notes")(e.target.value)} className="h-10" /></Field>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="min-h-10 flex-1 sm:flex-none" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="min-h-10 flex-1 sm:flex-none" onClick={submit} disabled={saving}>{saving ? "Saving…" : "Add property"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function PropertiesView({ navigate }: ViewProps) {
  const { lang } = useLang();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [data, setData] = useState<ListResp<PropertyRec> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.get<ListResp<PropertyRec>>("/api/properties" + qs({ search: search || undefined, status: status || undefined, pageSize: 200 }));
      setData(d);
      setError(null);
    } catch (e) {
      setError(errMessage(e));
      toast.error(errMessage(e));
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  useEffect(() => { void load(); }, [load]);

  const columns: Column<PropertyRec>[] = [
    {
      key: "name", label: t(lang, "col.property"), primary: true,
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{r.name}{r.brandName ? <span className="text-muted-foreground"> · {r.brandName}</span> : null}</p>
          <p className="truncate text-[11px] text-muted-foreground">{r.type || "—"}{r.address ? ` · ${r.address}` : ""}</p>
        </div>
      ),
      value: (r) => r.name,
    },
    { key: "contact", label: t(lang, "col.contact"), value: (r) => r.contactPerson ?? "—", hideOnMobile: true },
    {
      key: "billingRate", label: "Rate/shift", className: "text-right",
      render: (r) => <span className="font-semibold tabular-nums text-primary">{formatINR(r.billingRate ?? 0)}</span>,
      value: (r) => formatINR(r.billingRate ?? 0),
    },
    { key: "billed", label: t(lang, "col.billed"), className: "text-right", value: (r) => formatINR(r.totalBilled ?? 0), hideOnMobile: true },
    { key: "received", label: t(lang, "col.received"), className: "text-right", value: (r) => formatINR(r.totalReceived ?? 0), hideOnMobile: true },
    {
      key: "outstanding", label: t(lang, "col.outstanding"), className: "text-right",
      render: (r) => (
        <span className={(r.totalOutstanding ?? 0) > 0 ? "font-semibold tabular-nums text-red-600 dark:text-red-400" : "tabular-nums text-muted-foreground"}>
          {formatINR(r.totalOutstanding ?? 0)}
        </span>
      ),
      value: (r) => formatINR(r.totalOutstanding ?? 0),
    },
    { key: "status", label: t(lang, "col.status"), render: (r) => <StatusBadge status={r.status} />, value: (r) => r.status },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title={t(lang, "page.properties")}
        subtitle={t(lang, "page.properties.sub").replace("{n}", String(data?.total ?? 0))}
        actions={
          <Button size="sm" className="h-9 gap-1.5" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden />Add Property
          </Button>
        }
      />

      <Card>
        <CardContent className="space-y-3 p-3 sm:p-4">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <SearchInput value={search} onChange={setSearch} placeholder="Search name, brand, area…" className="flex-1" />
            <div className="w-full sm:w-44">
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
              rows={data?.items ?? []}
              rowKey={(r) => r.id}
              onRowClick={(r) => navigate("property-detail", { id: r.id })}
              exportName="properties"
              loading={loading}
              emptyIcon={Building2}
              emptyTitle={search || status ? "No properties match" : "No properties yet"}
              emptyDescription={search || status ? "Try a different search or filter." : "Add your first client property to deploy staff."}
            />
          )}
        </CardContent>
      </Card>

      <PropertyFormDialog open={addOpen} onOpenChange={setAddOpen} onDone={load} />

      {/* Mobile FAB — alternate trigger for Add Property */}
      <ViewFab icon={Plus} label="Add property" onClick={() => setAddOpen(true)} />
    </div>
  );
}
