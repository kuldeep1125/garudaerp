"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { formatINR, parseAmount } from "@/lib/money";
import type { ViewProps } from "@/components/view-types";
import { useNav } from "@/components/providers";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/shared/status-badge";
import { toast } from "sonner";
import {
  Building, Pencil, Phone, MessageCircle, Mail, MapPin, Wallet, CalendarCheck, IndianRupee,
} from "lucide-react";
import {
  BarsCompare, CHART_COLORS, DeploymentRec, Field, PaymentRec,
  PropertyRec, ShiftBadgeInline, errMessage, fmtDay, useMutation,
} from "./_shared";

interface Detail {
  property: PropertyRec;
  ledger: { billed: number; received: number; outstanding: number };
  deployments: DeploymentRec[];
  payments: PaymentRec[];
  monthly: { month: string; billed: number; received: number }[];
}

export default function PropertyDetailView({ params, navigate }: ViewProps) {
  const id = params?.id ?? "";
  const { back } = useNav();
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({
    name: "", brandName: "", type: "", billingRate: "", contactPerson: "", contactNumber: "",
    whatsapp: "", email: "", address: "", notes: "",
  });
  const { mutate, saving } = useMutation();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.get<Detail>(`/api/properties/${id}`);
      setData(d);
      setError(null);
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { if (id) void load(); }, [id, load]);

  const openEdit = () => {
    const p = data?.property;
    setForm({
      name: p?.name ?? "", brandName: p?.brandName ?? "", type: p?.type ?? "",
      billingRate: p?.billingRate ? String(p.billingRate) : "",
      contactPerson: p?.contactPerson ?? "", contactNumber: p?.contactNumber ?? "",
      whatsapp: p?.whatsapp ?? "", email: p?.email ?? "", address: p?.address ?? "", notes: p?.notes ?? "",
    });
    setEditOpen(true);
  };

  const submitEdit = async () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    const rate = parseAmount(form.billingRate);
    if (rate <= 0) { toast.error("Billing rate (₹ per shift) is required"); return; }
    const res = await mutate(() => api.put(`/api/properties/${id}`, {
      name: form.name.trim(), brandName: form.brandName || undefined, type: form.type || undefined,
      billingRate: rate,
      contactPerson: form.contactPerson || undefined, contactNumber: form.contactNumber || undefined,
      whatsapp: form.whatsapp || undefined, email: form.email || undefined, address: form.address || undefined,
      notes: form.notes || undefined,
    }), "Property updated — new rate applies to future deployments only");
    if (res.ok) { setEditOpen(false); void load(); }
  };

  const deployColumns: Column<DeploymentRec>[] = [
    { key: "date", label: "Date", value: (r) => fmtDay(r.date), hideOnMobile: true },
    {
      key: "employeeName", label: "Employee", primary: true,
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{r.employeeName}</p>
          <p className="text-[11px] text-muted-foreground">{fmtDay(r.date)}</p>
        </div>
      ),
      value: (r) => r.employeeName,
    },
    { key: "shift", label: "Shift", render: (r) => <ShiftBadgeInline shift={r.shift} />, value: (r) => r.shift },
    { key: "billingAmount", label: "Billing", className: "text-right", value: (r) => formatINR(r.billingAmount ?? 0) },
    { key: "payoutAmount", label: "Payout", className: "text-right", value: (r) => formatINR(r.payoutAmount ?? 0), hideOnMobile: true },
    { key: "paid", label: "Paid", render: (r) => <StatusBadge status={r.paidStatus ?? "UNPAID"} />, value: (r) => r.paidStatus ?? "UNPAID", hideOnMobile: true },
  ];

  const payColumns: Column<PaymentRec>[] = [
    { key: "date", label: "Date", value: (r) => fmtDay(r.date), hideOnMobile: true },
    { key: "amount", label: "Amount", primary: true, render: (r) => <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{formatINR(r.amount)}</span>, value: (r) => formatINR(r.amount) },
    { key: "method", label: "Method", value: (r) => r.method ?? "—" },
    { key: "reference", label: "Reference", value: (r) => r.reference ?? "—", hideOnMobile: true },
    { key: "receivedBy", label: "Received by", value: (r) => r.receivedByName ?? "—", hideOnMobile: true },
  ];

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-36 w-full rounded-xl" />
        <div className="grid grid-cols-3 gap-2.5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <PageHeader title="Property" onBack={back} />
        <Card><CardContent className="p-6 text-center">
          <p className="text-sm text-red-600 dark:text-red-400">{error ?? "Not found"}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>Retry</Button>
        </CardContent></Card>
      </div>
    );
  }

  const p = data.property;

  return (
    <div className="space-y-4">
      <PageHeader
        title={p.name}
        subtitle={[p.type, p.brandName].filter(Boolean).join(" · ") || undefined}
        onBack={back}
        actions={
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={openEdit}>
            <Pencil className="h-3.5 w-3.5" aria-hidden /><span className="hidden sm:inline">Edit</span>
          </Button>
        }
      />

      {/* Header card */}
      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-primary/10 p-2" aria-hidden><Building className="h-5 w-5 text-primary" /></div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-bold">{p.name}</p>
                <StatusBadge status={p.status} />
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{p.brandName || "—"} · {p.type || "—"}</p>
              {p.address && <p className="mt-1 flex items-start gap-1 text-xs text-muted-foreground"><MapPin className="mt-0.5 h-3 w-3 shrink-0" aria-hidden /><span>{p.address}</span></p>}
            </div>
          </div>
          <div className="space-y-1.5 text-sm sm:justify-self-end">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Contact</p>
            <p className="text-sm">{p.contactPerson || "—"}</p>
            <div className="flex flex-wrap gap-1.5">
              {p.contactNumber && (
                <Button asChild variant="outline" size="sm" className="h-8">
                  <a href={`tel:${p.contactNumber}`} aria-label="Call property"><Phone className="h-3 w-3" /><span className="text-xs">{p.contactNumber}</span></a>
                </Button>
              )}
              {(p.whatsapp || p.contactNumber) && (
                <Button asChild variant="outline" size="sm" className="h-8">
                  <a href={`https://wa.me/${(p.whatsapp ?? p.contactNumber ?? "").replace(/\D/g, "")}`} target="_blank" rel="noreferrer" aria-label="WhatsApp property"><MessageCircle className="h-3 w-3" /><span className="text-xs">WhatsApp</span></a>
                </Button>
              )}
              {p.email && (
                <Button asChild variant="outline" size="sm" className="h-8">
                  <a href={`mailto:${p.email}`} aria-label="Email property"><Mail className="h-3 w-3" /><span className="text-xs">Email</span></a>
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Ledger stats */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Card className="border-border/70 shadow-sm"><CardContent className="p-3 sm:p-4">
          <p className="text-[11px] sm:text-xs font-medium text-muted-foreground">Billing rate</p>
          <p className="mt-1.5 flex items-baseline gap-1 text-lg sm:text-xl font-bold tabular-nums text-primary">
            <IndianRupee className="h-4 w-4 self-center" aria-hidden />
            {formatINR(p.billingRate ?? 0)}
            <span className="text-[10px] font-medium text-muted-foreground">/shift</span>
          </p>
        </CardContent></Card>
        <Card className="border-border/70 shadow-sm"><CardContent className="p-3 sm:p-4">
          <p className="text-[11px] sm:text-xs font-medium text-muted-foreground">Total Billed</p>
          <p className="mt-1.5 text-lg sm:text-xl font-bold tabular-nums">{formatINR(data.ledger.billed, { compact: true })}</p>
        </CardContent></Card>
        <Card className="cursor-pointer border-emerald-200/70 shadow-sm transition-all hover:shadow-md dark:border-emerald-900" onClick={() => navigate("payments")} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") navigate("payments"); }}>
          <CardContent className="p-3 sm:p-4">
            <p className="text-[11px] sm:text-xs font-medium text-muted-foreground">Received</p>
            <p className="mt-1.5 text-lg sm:text-xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{formatINR(data.ledger.received, { compact: true })}</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer border-red-200/70 shadow-sm transition-all hover:shadow-md dark:border-red-900" onClick={() => navigate("payments")} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") navigate("payments"); }}>
          <CardContent className="p-3 sm:p-4">
            <p className="text-[11px] sm:text-xs font-medium text-muted-foreground">Outstanding</p>
            <p className="mt-1.5 text-lg sm:text-xl font-bold tabular-nums text-red-600 dark:text-red-400">{formatINR(data.ledger.outstanding, { compact: true })}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="deployments">
        <div className="overflow-x-auto no-scrollbar">
          <TabsList className="w-max min-w-full sm:min-w-0">
            <TabsTrigger value="deployments">Deployments</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="monthly">Monthly</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="deployments" className="mt-3">
          <DataTable columns={deployColumns} rows={data.deployments ?? []} rowKey={(r) => r.id}
            onRowClick={(r) => navigate("deployments", { date: r.date, propertyId: r.propertyId })}
            emptyIcon={CalendarCheck} emptyTitle="No deployments yet"
            emptyDescription="Deploy employees to this property from the Deployments view." />
        </TabsContent>

        <TabsContent value="payments" className="mt-3">
          <DataTable columns={payColumns} rows={data.payments ?? []} rowKey={(r) => r.id}
            onRowClick={() => navigate("payments")} emptyIcon={Wallet} emptyTitle="No payments received yet"
            emptyDescription="Record payments from the Collections view." />
        </TabsContent>

        <TabsContent value="monthly" className="mt-3">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Billed vs received by month</CardTitle></CardHeader>
            <CardContent>
              <BarsCompare
                data={data.monthly.map((m) => ({ month: m.month.slice(2), billed: m.billed, received: m.received }))}
                xKey="month"
                series={[
                  { key: "billed", label: "Billed", color: CHART_COLORS.teal },
                  { key: "received", label: "Received", color: CHART_COLORS.emerald },
                ]}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit property</DialogTitle>
            <DialogDescription>Update details and the billing rate.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" required className="sm:col-span-2"><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="h-10" /></Field>
            <Field
              label="Billing rate (₹/shift)"
              required
              className="sm:col-span-2"
              hint="Applies to future deployments only — every past record keeps its original rate, so history and profit never change."
            >
              <Input type="number" inputMode="numeric" value={form.billingRate} onChange={(e) => setForm((f) => ({ ...f, billingRate: e.target.value }))} className="h-10" />
            </Field>
            <Field label="Brand name"><Input value={form.brandName} onChange={(e) => setForm((f) => ({ ...f, brandName: e.target.value }))} className="h-10" /></Field>
            <Field label="Type"><Input value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} className="h-10" /></Field>
            <Field label="Contact person"><Input value={form.contactPerson} onChange={(e) => setForm((f) => ({ ...f, contactPerson: e.target.value }))} className="h-10" /></Field>
            <Field label="Contact number"><Input value={form.contactNumber} onChange={(e) => setForm((f) => ({ ...f, contactNumber: e.target.value }))} className="h-10" /></Field>
            <Field label="WhatsApp"><Input value={form.whatsapp} onChange={(e) => setForm((f) => ({ ...f, whatsapp: e.target.value }))} className="h-10" /></Field>
            <Field label="Email"><Input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="h-10" /></Field>
            <Field label="Address" className="sm:col-span-2"><Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} className="h-10" /></Field>
            <Field label="Notes" className="sm:col-span-2"><Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="h-10" /></Field>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="min-h-10 flex-1 sm:flex-none" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button className="min-h-10 flex-1 sm:flex-none" onClick={submitEdit} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
