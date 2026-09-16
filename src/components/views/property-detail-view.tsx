"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { StatCard } from "@/components/shared/stat-card";
import {
  FormulaInspectorDialog,
  type FormulaInspectorData,
} from "@/components/shared/formula-inspector-dialog";
import { toast } from "sonner";
import {
  Building, Pencil, Phone, MessageCircle, Mail, MapPin, Wallet,
  CalendarCheck, IndianRupee, Receipt, TrendingUp, Plus, ArrowUpRight,
  ArrowDownLeft, HelpCircle, CheckCircle, AlertCircle, FileText,
} from "lucide-react";
import {
  BarsCompare, CHART_COLORS, DeploymentRec, Field, MoneyInput, PaymentRec,
  PropertyRec, RecordPaymentDialog, SelectInput, ShiftBadgeInline,
  errMessage, fmtDay, useMutation,
} from "./_shared";

interface PropertyDetailData {
  property: PropertyRec;
  ledger: {
    billed: number;
    received: number;
    outstanding: number;
    staffCost?: number;
    margin?: number;
  };
  deployments: DeploymentRec[];
  payments: PaymentRec[];
  monthly: { month: string; billed: number; received: number }[];
}

interface PropertyLedgerItem {
  id: string;
  date: string;
  type: "INVOICE" | "PAYMENT";
  title: string;
  subtitle: string;
  debit: number;    // Invoiced / Billed
  credit: number;   // Payment received
  balance: number;  // Running outstanding balance after transaction
  rawRecord: DeploymentRec | PaymentRec;
}

export default function PropertyDetailView({ params, navigate }: ViewProps) {
  const id = params?.id ?? "";
  const { back } = useNav();
  const [data, setData] = useState<PropertyDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [inspectorData, setInspectorData] = useState<FormulaInspectorData | null>(null);

  const [form, setForm] = useState({
    name: "", brandName: "", type: "", billingRate: "", contactPerson: "", contactNumber: "",
    whatsapp: "", email: "", address: "", notes: "", startDate: "", status: "ACTIVE",
  });
  const { mutate, saving } = useMutation();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.get<PropertyDetailData>(`/api/properties/${id}`);
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
      startDate: p?.startDate?.slice(0, 10) ?? "",
      status: p?.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
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
      startDate: form.startDate,
      status: form.status,
    }), "Property updated — new rate applies to future deployments only");
    if (res.ok) { setEditOpen(false); void load(); }
  };

  // Build Chronological Statement (Passbook Ledger)
  const statementLedger = useMemo<PropertyLedgerItem[]>(() => {
    if (!data) return [];
    const items: Array<{
      id: string;
      date: string;
      createdAt: string;
      type: "INVOICE" | "PAYMENT";
      title: string;
      subtitle: string;
      debit: number;
      credit: number;
      rawRecord: DeploymentRec | PaymentRec;
    }> = [];

    // Add Invoices (Deployments)
    (data.deployments ?? []).forEach((d) => {
      const amount = d.billingAmount ?? 0;
      items.push({
        id: `deploy-${d.id}`,
        date: d.date,
        createdAt: d.createdAt || d.date,
        type: "INVOICE",
        title: `${d.employeeName} (${d.shift} Shift)`,
        subtitle: `Invoiced at contract rate · Payout cost ${formatINR(d.payoutAmount ?? 0)}`,
        debit: amount,
        credit: 0,
        rawRecord: d,
      });
    });

    // Add Payments Received
    (data.payments ?? []).forEach((p) => {
      const pCreated = (p as unknown as { createdAt?: string }).createdAt || p.date;
      items.push({
        id: `pay-${p.id}`,
        date: p.date,
        createdAt: pCreated,
        type: "PAYMENT",
        title: `Payment Received (${p.method || "Direct"})`,
        subtitle: [
          p.reference ? `Ref: ${p.reference}` : null,
          p.receivedByName ? `Recorded by ${p.receivedByName}` : null,
          p.notes ? `Note: ${p.notes}` : null,
        ].filter(Boolean).join(" · ") || "Direct settlement",
        debit: 0,
        credit: p.amount ?? 0,
        rawRecord: p,
      });
    });

    // Sort ascending by date to compute chronological running balance
    items.sort((a, b) => {
      const cmp = a.date.localeCompare(b.date);
      if (cmp !== 0) return cmp;
      // If same date: invoice before payment
      if (a.type !== b.type) return a.type === "INVOICE" ? -1 : 1;
      return a.createdAt.localeCompare(b.createdAt);
    });

    let runningBal = 0;
    const computed = items.map((it) => {
      runningBal += it.debit - it.credit;
      return {
        ...it,
        balance: runningBal,
      };
    });

    // Reverse for UI display (newest first)
    return computed.reverse();
  }, [data]);

  // Open Formula Inspector Drawer
  const openInspector = (metric: "contract" | "billed" | "received" | "outstanding" | "margin") => {
    if (!data) return;
    const p = data.property;
    const l = data.ledger;
    const totalDeployments = data.deployments?.length ?? 0;
    const totalPaymentsCount = data.payments?.length ?? 0;
    const staffCost = l.staffCost ?? (data.deployments ?? []).reduce((s, d) => s + (d.payoutAmount ?? 0), 0);
    const margin = l.margin ?? (l.billed - staffCost);
    const marginPercent = l.billed > 0 ? ((margin / l.billed) * 100).toFixed(1) : "0.0";

    switch (metric) {
      case "contract":
        setInspectorData({
          title: "Contract Rate Explanation",
          subtitle: `${p.name} · Property Terms`,
          resultLabel: "Contract Rate",
          resultValue: `${formatINR(p.billingRate ?? 0)}/shift`,
          formulaEquation: "Billing Rate = Contract Price per Completed Staff Shift",
          steps: [
            { label: "Active Billing Rate", amount: p.billingRate ?? 0, operation: "info", detail: "Charged per completed staff shift" },
            { label: "Total Shifts Logged", amount: totalDeployments, operation: "result", detail: "Serviced since inception" },
          ],
          notes: [
            "Every past shift deployment locks its billing rate permanently at time of creation.",
            "Changing this property's billing rate today only affects future shifts. Historical invoices and account balances remain 100% stable and audit-proof.",
          ],
        });
        break;

      case "billed":
        setInspectorData({
          title: "Total Invoiced (Billed) Calculation",
          subtitle: `${p.name} · Debits`,
          resultLabel: "Total Billed",
          resultValue: formatINR(l.billed),
          formulaEquation: "Total Billed = ∑(Shift Deployments × Invoiced Rate)",
          steps: [
            { label: "Total Shifts Deployed", amount: totalDeployments, operation: "info", detail: "Work performed by staff" },
            { label: "Gross Invoiced Revenue", amount: l.billed, operation: "result", detail: "Sum of all deployment billings" },
          ],
          sourceRows: (data.deployments ?? []).slice(0, 10).map((d) => ({
            id: d.id,
            title: `${d.employeeName} (${d.shift} Shift)`,
            subtitle: `${fmtDay(d.date)} · Rate ${formatINR(d.billingAmount ?? 0)}`,
            amount: formatINR(d.billingAmount ?? 0),
            badge: d.shift,
          })),
          sourceRowsTitle: "Recent Invoiced Shifts",
          notes: [
            "This reflects the gross revenue Garuda billed to this property for all staff deployments.",
            "Click on the 'Deployments' tab to inspect every individual shift.",
          ],
        });
        break;

      case "received":
        setInspectorData({
          title: "Total Collections Received",
          subtitle: `${p.name} · Credits`,
          resultLabel: "Total Received",
          resultValue: formatINR(l.received),
          formulaEquation: "Total Received = ∑(Verified Payment Receipts)",
          steps: [
            { label: "Receipts Count", amount: totalPaymentsCount, operation: "info", detail: "Payment transactions recorded" },
            { label: "Total Cash/UPI Received", amount: l.received, operation: "result", detail: "Direct collections from client" },
          ],
          sourceRows: (data.payments ?? []).slice(0, 10).map((pay) => ({
            id: pay.id,
            title: `Payment via ${pay.method || "Direct"}`,
            subtitle: `${fmtDay(pay.date)}${pay.reference ? ` · Ref: ${pay.reference}` : ""}`,
            amount: formatINR(pay.amount ?? 0),
            badge: pay.method || "Payment",
            badgeTone: "emerald",
          })),
          sourceRowsTitle: "Recent Payment Receipts",
          notes: [
            "Only confirmed payments recorded in the Collections ledger reduce the property's outstanding balance.",
            "Click '+ Record Payment' on the top right to record a new receipt instantly.",
          ],
        });
        break;

      case "outstanding":
        setInspectorData({
          title: "Outstanding Balance Due",
          subtitle: `${p.name} · Live Balance`,
          resultLabel: "Outstanding Due",
          resultValue: formatINR(l.outstanding),
          formulaEquation: "Outstanding Balance = Total Billed − Total Received",
          steps: [
            { label: "Total Invoiced (Billed)", amount: l.billed, operation: "add", detail: "Work billed for shifts" },
            { label: "Total Payments Received", amount: l.received, operation: "subtract", detail: "Paid by property owner" },
            { label: "Net Outstanding Due", amount: l.outstanding, operation: "result", detail: l.outstanding > 0 ? "Pending to collect from property" : "Zero pending balance" },
          ],
          notes: [
            "A positive balance means the restaurant owes money to Garuda.",
            "A zero balance means the account is fully paid up.",
            "A negative balance means the property has an advance overpayment credited to future shifts.",
          ],
        });
        break;

      case "margin":
        setInspectorData({
          title: "Property Profit Margin Breakdown",
          subtitle: `${p.name} · Operating Profitability`,
          resultLabel: "Gross Profit Margin",
          resultValue: `${formatINR(margin)} (${marginPercent}%)`,
          formulaEquation: "Gross Margin = Invoiced Revenue − Staff Wages Incurred",
          steps: [
            { label: "Total Invoiced Revenue", amount: l.billed, operation: "add", detail: "Gross billing to restaurant" },
            { label: "Direct Staff Wages Incurred", amount: staffCost, operation: "subtract", detail: "Accrued wages payable to deployed employees" },
            { label: "Gross Profit Contribution", amount: margin, operation: "result", detail: `Garuda gross operational margin (${marginPercent}%)` },
          ],
          notes: [
            "This metric reveals the true commercial profitability of this property contract.",
            "Profit Margin % = (Gross Margin ÷ Total Invoiced Revenue) × 100%.",
            "This calculation isolates direct shift labor costs and does not include unallocated overheads.",
          ],
        });
        break;
    }
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
    { key: "billingAmount", label: "Billing", className: "text-right font-medium", value: (r) => formatINR(r.billingAmount ?? 0) },
    { key: "payoutAmount", label: "Staff Cost", className: "text-right text-muted-foreground", value: (r) => formatINR(r.payoutAmount ?? 0), hideOnMobile: true },
    { key: "paid", label: "Paid", render: (r) => <StatusBadge status={r.paidStatus ?? "UNPAID"} />, value: (r) => r.paidStatus ?? "UNPAID", hideOnMobile: true },
  ];

  const payColumns: Column<PaymentRec>[] = [
    { key: "date", label: "Date", value: (r) => fmtDay(r.date), hideOnMobile: true },
    { key: "amount", label: "Amount", primary: true, render: (r) => <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{formatINR(r.amount)}</span>, value: (r) => formatINR(r.amount) },
    { key: "method", label: "Method", value: (r) => r.method ?? "—" },
    { key: "reference", label: "Reference", value: (r) => r.reference ?? "—", hideOnMobile: true },
    { key: "receivedBy", label: "Received by", value: (r) => r.receivedByName ?? "—", hideOnMobile: true },
  ];

  const ledgerColumns: Column<PropertyLedgerItem>[] = [
    {
      key: "date",
      label: "Date",
      value: (r) => fmtDay(r.date),
      hideOnMobile: true,
    },
    {
      key: "type",
      label: "Transaction",
      primary: true,
      render: (r) => (
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {r.type === "INVOICE" ? (
              <ArrowUpRight className="h-3.5 w-3.5 text-primary shrink-0" aria-hidden />
            ) : (
              <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden />
            )}
            <p className="truncate font-semibold text-xs sm:text-sm">{r.title}</p>
          </div>
          <p className="text-[11px] text-muted-foreground truncate">{r.subtitle}</p>
          <p className="text-[10px] text-muted-foreground sm:hidden">{fmtDay(r.date)}</p>
        </div>
      ),
      value: (r) => r.title,
    },
    {
      key: "debit",
      label: "Billed (+)",
      className: "text-right font-medium",
      render: (r) => r.debit > 0 ? (
        <span className="tabular-nums font-semibold text-foreground">+{formatINR(r.debit)}</span>
      ) : (
        <span className="text-muted-foreground/50">—</span>
      ),
      value: (r) => formatINR(r.debit),
    },
    {
      key: "credit",
      label: "Received (−)",
      className: "text-right font-medium",
      render: (r) => r.credit > 0 ? (
        <span className="tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">−{formatINR(r.credit)}</span>
      ) : (
        <span className="text-muted-foreground/50">—</span>
      ),
      value: (r) => formatINR(r.credit),
    },
    {
      key: "balance",
      label: "Balance Due",
      className: "text-right font-bold",
      render: (r) => (
        <span className={`tabular-nums ${r.balance > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
          {formatINR(r.balance)}
        </span>
      ),
      value: (r) => formatINR(r.balance),
    },
  ];

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-36 w-full rounded-xl" />
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
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
  const l = data.ledger;
  const staffCost = l.staffCost ?? (data.deployments ?? []).reduce((s, d) => s + (d.payoutAmount ?? 0), 0);
  const margin = l.margin ?? (l.billed - staffCost);

  return (
    <div className="space-y-4">
      {/* Header with Title and Primary Actions */}
      <PageHeader
        title={p.name}
        subtitle={[p.type, p.brandName].filter(Boolean).join(" · ") || undefined}
        onBack={back}
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="h-9 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => setPaymentOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              <span>Record Payment</span>
            </Button>
            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={openEdit}>
              <Pencil className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden sm:inline">Edit</span>
            </Button>
          </div>
        }
      />

      {/* Profile & Contact Card */}
      <Card className="border-border/70 shadow-sm">
        <CardContent className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex items-start gap-3 lg:col-span-2">
            <div className="rounded-xl bg-primary/10 p-2.5 shrink-0" aria-hidden>
              <Building className="h-6 w-6 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-base font-bold truncate">{p.name}</p>
                <StatusBadge status={p.status} />
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground font-medium">
                {p.brandName ? `${p.brandName} · ` : ""}{p.type || "Commercial Partner"}
              </p>
              {p.address && (
                <p className="mt-1 flex items-start gap-1 text-xs text-muted-foreground">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="line-clamp-2">{p.address}</span>
                </p>
              )}
            </div>
          </div>

          <div className="space-y-1.5 text-sm sm:justify-self-end">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Contact Details</p>
            <p className="text-sm font-medium">{p.contactPerson || "No contact person recorded"}</p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {p.contactNumber && (
                <Button asChild variant="outline" size="sm" className="h-8">
                  <a href={`tel:${p.contactNumber}`} aria-label="Call property">
                    <Phone className="h-3 w-3 mr-1 text-primary" />
                    <span className="text-xs">{p.contactNumber}</span>
                  </a>
                </Button>
              )}
              {(p.whatsapp || p.contactNumber) && (
                <Button asChild variant="outline" size="sm" className="h-8">
                  <a
                    href={`https://wa.me/${(p.whatsapp ?? p.contactNumber ?? "").replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="WhatsApp property"
                  >
                    <MessageCircle className="h-3 w-3 mr-1 text-emerald-600" />
                    <span className="text-xs">WhatsApp</span>
                  </a>
                </Button>
              )}
              {p.email && (
                <Button asChild variant="outline" size="sm" className="h-8">
                  <a href={`mailto:${p.email}`} aria-label="Email property">
                    <Mail className="h-3 w-3 mr-1" />
                    <span className="text-xs">Email</span>
                  </a>
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* [ADDED] Interactive 360° KPI Banner with Click-to-Inspect Formula Math */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5" role="list" aria-label="Property Financial KPIs">
        <StatCard
          label="Contract Rate"
          value={`${formatINR(p.billingRate ?? 0)}/shift`}
          icon={IndianRupee}
          hint="Click to inspect rate"
          onClick={() => openInspector("contract")}
        />
        <StatCard
          label="Total Billed"
          value={formatINR(l.billed, { compact: true })}
          icon={Receipt}
          hint="Shifts invoiced"
          onClick={() => openInspector("billed")}
        />
        <StatCard
          label="Total Received"
          value={formatINR(l.received, { compact: true })}
          icon={Wallet}
          tone="positive"
          hint="Collections cleared"
          onClick={() => openInspector("received")}
        />
        <StatCard
          label="Outstanding Due"
          value={formatINR(l.outstanding, { compact: true })}
          icon={AlertCircle}
          tone={l.outstanding > 0 ? "negative" : "positive"}
          hint={l.outstanding > 0 ? "Pending collection" : "Fully settled"}
          onClick={() => openInspector("outstanding")}
        />
        <StatCard
          label="Property Margin"
          value={formatINR(margin, { compact: true })}
          icon={TrendingUp}
          tone="positive"
          hint="Billed − Staff Cost"
          onClick={() => openInspector("margin")}
        />
      </div>

      {/* Centralized 360° Restaurant Views */}
      <Tabs defaultValue="statement">
        <div className="overflow-x-auto no-scrollbar">
          <TabsList className="w-max min-w-full sm:min-w-0">
            <TabsTrigger value="statement" className="gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              <span>Account Statement (Ledger)</span>
            </TabsTrigger>
            <TabsTrigger value="deployments" className="gap-1.5">
              <CalendarCheck className="h-3.5 w-3.5" />
              <span>Deployments ({data.deployments?.length ?? 0})</span>
            </TabsTrigger>
            <TabsTrigger value="payments" className="gap-1.5">
              <Wallet className="h-3.5 w-3.5" />
              <span>Payments ({data.payments?.length ?? 0})</span>
            </TabsTrigger>
            <TabsTrigger value="monthly" className="gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" />
              <span>Monthly Trends</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Tab 1: Account Statement (Ledger) */}
        <TabsContent value="statement" className="mt-3 space-y-3">
          <Card className="border-border/70">
            <CardHeader className="pb-3 border-b">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <span>Live Account Passbook</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      (Billed Debits vs Payments Received with Running Balance)
                    </span>
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Every shift billed increases receivable; every payment received reduces it.
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs bg-muted/40 px-3 py-1.5 rounded-lg">
                  <div>
                    <span className="text-muted-foreground">Billed: </span>
                    <span className="font-semibold tabular-nums">{formatINR(l.billed)}</span>
                  </div>
                  <div className="text-muted-foreground">|</div>
                  <div>
                    <span className="text-muted-foreground">Received: </span>
                    <span className="font-semibold text-emerald-600 tabular-nums">{formatINR(l.received)}</span>
                  </div>
                  <div className="text-muted-foreground">|</div>
                  <div>
                    <span className="text-muted-foreground">Due: </span>
                    <span className={`font-bold tabular-nums ${l.outstanding > 0 ? "text-red-600" : "text-emerald-600"}`}>
                      {formatINR(l.outstanding)}
                    </span>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <DataTable
                columns={ledgerColumns}
                rows={statementLedger}
                rowKey={(r) => r.id}
                emptyIcon={Receipt}
                emptyTitle="No transactions recorded"
                emptyDescription="Deploy staff or record payments to build the property statement ledger."
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Deployments */}
        <TabsContent value="deployments" className="mt-3">
          <Card className="border-border/70">
            <CardHeader className="pb-3 border-b flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Shift Deployments Log</CardTitle>
                <p className="text-xs text-muted-foreground">Every shift served at this property with billed rate and staff wage cost.</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => navigate("deployments", { propertyId: id })}
              >
                Open Deployments View
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <DataTable
                columns={deployColumns}
                rows={data.deployments ?? []}
                rowKey={(r) => r.id}
                onRowClick={(r) => navigate("deployments", { date: r.date, propertyId: r.propertyId })}
                emptyIcon={CalendarCheck}
                emptyTitle="No deployments yet"
                emptyDescription="Deploy employees to this property from the Deployments view."
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Payments */}
        <TabsContent value="payments" className="mt-3">
          <Card className="border-border/70">
            <CardHeader className="pb-3 border-b flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Payments & Receipts</CardTitle>
                <p className="text-xs text-muted-foreground">Confirmed payment transactions cleared against this property.</p>
              </div>
              <Button
                size="sm"
                className="h-8 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => setPaymentOpen(true)}
              >
                <Plus className="h-3 w-3" />
                <span>+ Record Payment</span>
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <DataTable
                columns={payColumns}
                rows={data.payments ?? []}
                rowKey={(r) => r.id}
                emptyIcon={Wallet}
                emptyTitle="No payments received yet"
                emptyDescription="Record receipts directly using '+ Record Payment' above."
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: Monthly Trends */}
        <TabsContent value="monthly" className="mt-3">
          <Card className="border-border/70">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Billed vs Received by Month</CardTitle>
              <p className="text-xs text-muted-foreground">Compare work invoiced against collections cleared each month.</p>
            </CardHeader>
            <CardContent>
              <BarsCompare
                data={data.monthly.map((m) => ({
                  month: m.month.slice(2),
                  billed: m.billed,
                  received: m.received,
                }))}
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

      {/* Edit Property Modal */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Property</DialogTitle>
            <DialogDescription>Update property contact information and contract billing rate.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" required className="sm:col-span-2">
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="h-10" />
            </Field>
            <Field label="Start date">
              <Input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} className="h-10" />
            </Field>
            <Field label="Status">
              <SelectInput
                value={form.status}
                onChange={(v) => setForm((f) => ({ ...f, status: v }))}
                options={[{ label: "Active", value: "ACTIVE" }, { label: "Inactive", value: "INACTIVE" }]}
              />
            </Field>
            <Field
              label="Billing rate (₹/shift)"
              required
              className="sm:col-span-2"
              hint="Applies to future deployments only — every past shift keeps its original locked rate."
            >
              <MoneyInput value={form.billingRate} onChange={(v) => setForm((f) => ({ ...f, billingRate: v }))} className="h-10" />
            </Field>
            <Field label="Brand name">
              <Input value={form.brandName} onChange={(e) => setForm((f) => ({ ...f, brandName: e.target.value }))} className="h-10" />
            </Field>
            <Field label="Type">
              <Input value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} className="h-10" />
            </Field>
            <Field label="Contact person">
              <Input value={form.contactPerson} onChange={(e) => setForm((f) => ({ ...f, contactPerson: e.target.value }))} className="h-10" />
            </Field>
            <Field label="Contact number">
              <Input value={form.contactNumber} onChange={(e) => setForm((f) => ({ ...f, contactNumber: e.target.value }))} className="h-10" />
            </Field>
            <Field label="WhatsApp">
              <Input value={form.whatsapp} onChange={(e) => setForm((f) => ({ ...f, whatsapp: e.target.value }))} className="h-10" />
            </Field>
            <Field label="Email">
              <Input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="h-10" />
            </Field>
            <Field label="Address" className="sm:col-span-2">
              <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} className="h-10" />
            </Field>
            <Field label="Notes" className="sm:col-span-2">
              <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="h-10" />
            </Field>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="min-h-10 flex-1 sm:flex-none" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button className="min-h-10 flex-1 sm:flex-none" onClick={submitEdit} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record Payment Dialog */}
      {paymentOpen && (
        <RecordPaymentDialog
          open={paymentOpen}
          onOpenChange={setPaymentOpen}
          propertyId={id}
          onDone={() => {
            setPaymentOpen(false);
            void load();
          }}
        />
      )}

      {/* Formula Inspector Dialog */}
      <FormulaInspectorDialog
        open={Boolean(inspectorData)}
        onOpenChange={(open) => {
          if (!open) setInspectorData(null);
        }}
        data={inspectorData}
      />
    </div>
  );
}
