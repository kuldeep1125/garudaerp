"use client";

import { useState, useEffect, useMemo } from "react";
import { api, qs } from "@/lib/api-client";
import { formatINR } from "@/lib/money";
import type { ViewProps } from "@/components/view-types";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { SearchInput } from "@/components/shared/filters";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useLang, t } from "@/lib/i18n";
import {
  Contact2, EllipsisVertical, Pencil, Plus, Route, Phone, MessageCircle, Mail, MapPin,
  IndianRupee, Wallet, AlertCircle, FileText, ArrowUpRight, ArrowDownLeft, ExternalLink, Calendar, Receipt, ChevronRight,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  FormulaInspectorDialog,
  type FormulaInspectorData,
} from "@/components/shared/formula-inspector-dialog";
import {
  TransactionLineageDialog,
  type TransactionLineageData,
} from "@/components/shared/transaction-lineage-dialog";
import {
  Field, ListResp, useAsync, useMutation, fmtDay, type TripRec,
} from "./_shared";

// ---------------------------------------------------------------------------
// Client shape (GET /api/clients?search= → { items })
// ---------------------------------------------------------------------------

interface ClientRec {
  id: string;
  name: string;
  company?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  address?: string | null;
  billingDetails?: string | null;
  notes?: string | null;
  tripCount?: number;
  totalBusiness?: number;
}

// ---------------------------------------------------------------------------
// Add / Edit dialog
// ---------------------------------------------------------------------------

const EMPTY_FORM = {
  name: "", company: "", phone: "", whatsapp: "", email: "", address: "", billingDetails: "", notes: "",
};

function ClientFormDialog({ open, onOpenChange, target, onDone }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  target: ClientRec | null; // null = add
  onDone: () => void;
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const { mutate, saving } = useMutation();

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setForm(target
        ? {
            name: target.name ?? "",
            company: target.company ?? "",
            phone: target.phone ?? "",
            whatsapp: target.whatsapp ?? "",
            email: target.email ?? "",
            address: target.address ?? "",
            billingDetails: target.billingDetails ?? "",
            notes: target.notes ?? "",
          }
        : EMPTY_FORM);
    }
  }

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.name.trim()) {
      toast.error("Client name is required");
      return;
    }
    const payload = {
      name: form.name.trim(),
      company: form.company || undefined,
      phone: form.phone || undefined,
      whatsapp: form.whatsapp || undefined,
      email: form.email || undefined,
      address: form.address || undefined,
      billingDetails: form.billingDetails || undefined,
      notes: form.notes || undefined,
    };
    const res = target
      ? await mutate(() => api.put(`/api/clients/${target.id}`, payload), "Client updated")
      : await mutate(() => api.post("/api/clients", payload), "Client added");
    if (res.ok) {
      onOpenChange(false);
      onDone();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{target ? "Edit client" : "Add client"}</DialogTitle>
          <DialogDescription>Transport customers who book vehicles, trips and rentals.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" required>
            <Input value={form.name} onChange={(e) => set("name")(e.target.value)} className="h-10" placeholder="e.g. Anil Kumar" />
          </Field>
          <Field label="Company">
            <Input value={form.company} onChange={(e) => set("company")(e.target.value)} className="h-10" placeholder="e.g. Kumar Traders" />
          </Field>
          <Field label="Phone">
            <Input value={form.phone} onChange={(e) => set("phone")(e.target.value)} inputMode="tel" className="h-10" />
          </Field>
          <Field label="WhatsApp">
            <Input value={form.whatsapp} onChange={(e) => set("whatsapp")(e.target.value)} inputMode="tel" className="h-10" />
          </Field>
          <Field label="Email" className="sm:col-span-2">
            <Input value={form.email} onChange={(e) => set("email")(e.target.value)} inputMode="email" className="h-10" />
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <Textarea value={form.address} onChange={(e) => set("address")(e.target.value)} rows={2} />
          </Field>
          <Field label="Billing details" className="sm:col-span-2" hint="GSTIN, billing terms, invoice preferences…">
            <Textarea value={form.billingDetails} onChange={(e) => set("billingDetails")(e.target.value)} rows={2} />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea value={form.notes} onChange={(e) => set("notes")(e.target.value)} rows={2} />
          </Field>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="min-h-10 flex-1 sm:flex-none" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="min-h-10 flex-1 sm:flex-none" onClick={submit} disabled={saving}>
            {saving ? "Saving…" : target ? "Save changes" : "Add client"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Client 360° Passbook & Statement Dialog
// ---------------------------------------------------------------------------

interface ClientLedgerItem {
  id: string;
  date: string;
  type: "INVOICE" | "PAYMENT";
  title: string;
  subtitle: string;
  debit: number;
  credit: number;
  balance: number;
  rawTrip: TripRec;
}

function ClientPassbookDialog({
  open,
  onOpenChange,
  client,
  navigate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: ClientRec | null;
  navigate: (view: string, params?: Record<string, string>) => void;
}) {
  const [trips, setTrips] = useState<TripRec[]>([]);
  const [loading, setLoading] = useState(false);
  const [inspectorData, setInspectorData] = useState<FormulaInspectorData | null>(null);
  const [lineageData, setLineageData] = useState<TransactionLineageData | null>(null);

  useEffect(() => {
    if (!open || !client) return;
    let active = true;
    setLoading(true);
    api.get<{ items: TripRec[] }>(`/api/trips?clientId=${client.id}&pageSize=200`)
      .then((res) => {
        if (active) setTrips(res.items ?? []);
      })
      .catch(() => {
        if (active) setTrips([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [open, client]);

  const tripTotal = (t: TripRec) => (t.finalAmount ?? (t.agreedAmount + (t.extraCharges ?? 0)));
  const tripPaid = (t: TripRec) => (t.paidAmount ?? (t.paymentStatus === "PAID" ? tripTotal(t) : (t.advanceReceived ?? 0)));

  const totalBilled = useMemo(() => {
    return trips.filter((t) => t.status !== "CANCELLED").reduce((s, t) => s + tripTotal(t), 0);
  }, [trips]);

  const totalCollected = useMemo(() => {
    return trips.filter((t) => t.status !== "CANCELLED").reduce((s, t) => s + tripPaid(t), 0);
  }, [trips]);

  const totalDue = Math.max(0, totalBilled - totalCollected);

  // Chronological Statement Ledger
  const statementLedger = useMemo<ClientLedgerItem[]>(() => {
    const items: Array<{
      id: string;
      date: string;
      type: "INVOICE" | "PAYMENT";
      title: string;
      subtitle: string;
      debit: number;
      credit: number;
      rawTrip: TripRec;
    }> = [];

    trips.filter((t) => t.status !== "CANCELLED").forEach((t) => {
      const billed = tripTotal(t);
      const paid = tripPaid(t);

      // Invoiced trip
      items.push({
        id: `trip-inv-${t.id}`,
        date: String(t.startAt).slice(0, 10),
        type: "INVOICE",
        title: `Rental: ${t.pickup || "Origin"} → ${t.destination || "Destination"}`,
        subtitle: `${t.vehicleName || "Fleet Vehicle"} (${t.vehicleReg || "—"}) · ${t.status}`,
        debit: billed,
        credit: 0,
        rawTrip: t,
      });

      // Payments received if any
      if (paid > 0) {
        items.push({
          id: `trip-pay-${t.id}`,
          date: String(t.startAt).slice(0, 10),
          type: "PAYMENT",
          title: `Payment Received (${t.paymentStatus})`,
          subtitle: `Receipt for trip ${t.pickup || "Origin"} → ${t.destination || "Destination"}`,
          debit: 0,
          credit: paid,
          rawTrip: t,
        });
      }
    });

    items.sort((a, b) => a.date.localeCompare(b.date));

    let running = 0;
    const computed = items.map((it) => {
      running += it.debit - it.credit;
      return { ...it, balance: running };
    });

    return computed.reverse();
  }, [trips]);

  const openLineage = (r: ClientLedgerItem) => {
    if (!client) return;
    const t = r.rawTrip;
    if (r.type === "INVOICE") {
      setLineageData({
        id: r.id,
        title: `Rental Booking: ${client.name}`,
        type: "INVOICE (ACCRUAL REVENUE)",
        amount: r.debit,
        date: fmtDay(r.date),
        createdAt: String(t.startAt),
        createdByName: t.createdByName || "Transport Dispatch",
        ruleExplanation: `Vehicle rental booked for client ${client.name}. Invoiced base rate of ${formatINR(t.agreedAmount)}${t.extraCharges ? ` plus extra charges of ${formatINR(t.extraCharges)}` : ""}.`,
        impactedAccounts: [
          {
            account: "Accounts Receivable (Client)",
            type: "debit",
            amount: r.debit,
            description: `Receivable from ${client.name}`,
          },
          {
            account: "Transport Rental Revenue",
            type: "credit",
            amount: r.debit,
            description: "Operating fleet rental revenue earned",
          },
        ],
        linkedEntities: t.vehicleId ? [
          {
            label: "Assigned Fleet Vehicle",
            name: `${t.vehicleName || "Vehicle"} (${t.vehicleReg || "Fleet"})`,
            onClick: () => {
              onOpenChange(false);
              navigate("vehicles", { id: t.vehicleId });
            },
          },
        ] : undefined,
        notes: `Pickup: ${t.pickup || "N/A"} · Destination: ${t.destination || "N/A"}`,
      });
    } else {
      setLineageData({
        id: r.id,
        title: `Payment Received: ${client.name}`,
        type: "PAYMENT (CASH INFLOW)",
        amount: r.credit,
        date: fmtDay(r.date),
        createdAt: String(t.startAt),
        createdByName: t.createdByName || "Finance / Cashier",
        ruleExplanation: `Direct payment collected for rental booking. Status stamped as ${t.paymentStatus}.`,
        impactedAccounts: [
          {
            account: "Bank / Cash Inflow",
            type: "debit",
            amount: r.credit,
            description: "Direct funds deposited into accounts",
          },
          {
            account: "Accounts Receivable (Client)",
            type: "credit",
            amount: r.credit,
            description: `Reduces outstanding balance for ${client.name}`,
          },
        ],
      });
    }
  };

  const openInspector = (metric: "billed" | "collected" | "due") => {
    if (!client) return;
    switch (metric) {
      case "billed":
        setInspectorData({
          title: "Total Invoiced Rentals Calculation",
          subtitle: `${client.name} · Cumulative Invoiced`,
          resultLabel: "Lifetime Invoiced",
          resultValue: formatINR(totalBilled),
          formulaEquation: "Total Billed = ∑(Completed & Active Trip Invoices)",
          steps: [
            { label: "Total Completed Bookings", amount: trips.filter((t) => t.status !== "CANCELLED").length, operation: "info", detail: "Trips dispatched" },
            { label: "Cumulative Rental Revenue", amount: totalBilled, operation: "result", detail: "Gross invoices generated" },
          ],
          notes: ["Includes base agreed rental fares plus any logged driver allowances, toll, or extra kilometer charges."],
        });
        break;
      case "collected":
        setInspectorData({
          title: "Total Collected Cash Calculation",
          subtitle: `${client.name} · Cash Realized`,
          resultLabel: "Total Collected",
          resultValue: formatINR(totalCollected),
          formulaEquation: "Total Collected = ∑(Trip Advances + Final Settlements)",
          steps: [
            { label: "Total Payments Received", amount: totalCollected, operation: "result", detail: "Cleared bank/cash payments" },
          ],
          notes: ["Includes advance payments taken upon booking plus final balance cleared upon return."],
        });
        break;
      case "due":
        setInspectorData({
          title: "Outstanding Balance Due Calculation",
          subtitle: `${client.name} · Net Receivable`,
          resultLabel: "Outstanding Receivable",
          resultValue: formatINR(totalDue),
          formulaEquation: "Outstanding Due = Lifetime Billed − Total Collected",
          steps: [
            { label: "Cumulative Invoiced", amount: totalBilled, operation: "add", detail: "All rental billings" },
            { label: "Cumulative Collected", amount: totalCollected, operation: "subtract", detail: "All cleared receipts" },
            { label: "Net Pending Due", amount: totalDue, operation: "result", detail: totalDue > 0 ? "Pending collection" : "Fully settled" },
          ],
        });
        break;
    }
  };

  if (!client) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="p-5 pb-3 border-b bg-muted/20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <DialogTitle className="text-xl font-bold">{client.name}</DialogTitle>
                {client.company && (
                  <Badge variant="outline" className="text-xs">
                    {client.company}
                  </Badge>
                )}
              </div>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Client 360° Passbook · Complete rental history, payments, and live statement
              </DialogDescription>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {client.phone && (
                <Button asChild variant="outline" size="sm" className="h-8">
                  <a href={`tel:${client.phone}`}>
                    <Phone className="h-3 w-3 mr-1 text-primary" />
                    <span className="text-xs">{client.phone}</span>
                  </a>
                </Button>
              )}
              {(client.whatsapp || client.phone) && (
                <Button asChild variant="outline" size="sm" className="h-8">
                  <a
                    href={`https://wa.me/${(client.whatsapp || client.phone || "").replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MessageCircle className="h-3 w-3 mr-1 text-emerald-600" />
                    <span className="text-xs">WhatsApp</span>
                  </a>
                </Button>
              )}
              <Button
                size="sm"
                className="h-8 gap-1 text-xs"
                onClick={() => {
                  onOpenChange(false);
                  navigate("trips", { clientId: client.id });
                }}
              >
                <Route className="h-3.5 w-3.5" />
                <span>New Booking</span>
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="p-5 space-y-4">
          {/* Headline Stats with Click-to-Inspect Formula Math */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard
              label="Lifetime Invoiced"
              value={formatINR(totalBilled)}
              icon={IndianRupee}
              hint="Click to inspect formula"
              onClick={() => openInspector("billed")}
            />
            <StatCard
              label="Total Collected"
              value={formatINR(totalCollected)}
              icon={Wallet}
              tone="positive"
              hint="Click to inspect formula"
              onClick={() => openInspector("collected")}
            />
            <StatCard
              label="Outstanding Due"
              value={formatINR(totalDue)}
              icon={AlertCircle}
              tone={totalDue > 0 ? "negative" : "positive"}
              hint={totalDue > 0 ? "Pending collection" : "Fully settled"}
              onClick={() => openInspector("due")}
            />
          </div>

          {/* Centralized Tabs */}
          <Tabs defaultValue="statement">
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger value="statement" className="gap-1.5 text-xs">
                <FileText className="h-3.5 w-3.5" />
                <span>Passbook Statement ({statementLedger.length})</span>
              </TabsTrigger>
              <TabsTrigger value="bookings" className="gap-1.5 text-xs">
                <Route className="h-3.5 w-3.5" />
                <span>Bookings Log ({trips.length})</span>
              </TabsTrigger>
              <TabsTrigger value="profile" className="gap-1.5 text-xs">
                <Contact2 className="h-3.5 w-3.5" />
                <span>Client Profile</span>
              </TabsTrigger>
            </TabsList>

            {/* TAB 1: STATEMENT LEDGER */}
            <TabsContent value="statement" className="mt-3">
              <Card>
                <CardContent className="p-0">
                  <DataTable
                    columns={[
                      { key: "date", label: "Date", value: (r) => fmtDay(r.date), hideOnMobile: true },
                      {
                        key: "type",
                        label: "Transaction",
                        primary: true,
                        render: (r) => (
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              {r.type === "INVOICE" ? (
                                <ArrowUpRight className="h-3.5 w-3.5 text-primary shrink-0" />
                              ) : (
                                <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                              )}
                              <p className="font-semibold text-xs sm:text-sm truncate">{r.title}</p>
                            </div>
                            <p className="text-[11px] text-muted-foreground truncate">{r.subtitle}</p>
                          </div>
                        ),
                        value: (r) => r.title,
                      },
                      {
                        key: "debit",
                        label: "Invoiced (+)",
                        className: "text-right font-medium",
                        render: (r) => r.debit > 0 ? <span className="font-semibold tabular-nums">+{formatINR(r.debit)}</span> : <span className="text-muted-foreground/50">—</span>,
                        value: (r) => formatINR(r.debit),
                      },
                      {
                        key: "credit",
                        label: "Paid (−)",
                        className: "text-right font-medium",
                        render: (r) => r.credit > 0 ? <span className="font-semibold text-emerald-600 tabular-nums">−{formatINR(r.credit)}</span> : <span className="text-muted-foreground/50">—</span>,
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
                    ]}
                    rows={statementLedger}
                    rowKey={(r) => r.id}
                    onRowClick={(r) => openLineage(r)}
                    loading={loading}
                    emptyIcon={Receipt}
                    emptyTitle="No transactions yet"
                    emptyDescription="Vehicle bookings and payments will build this client's passbook."
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* TAB 2: BOOKINGS LOG */}
            <TabsContent value="bookings" className="mt-3">
              <Card>
                <CardContent className="p-0">
                  <DataTable
                    columns={[
                      { key: "startAt", label: "Date", value: (r) => fmtDay(r.startAt), hideOnMobile: true },
                      {
                        key: "route",
                        label: "Route / Trip",
                        primary: true,
                        render: (r) => (
                          <div className="min-w-0">
                            <p className="font-semibold text-xs sm:text-sm truncate">
                              {r.pickup || "Origin"} → {r.destination || "Destination"}
                            </p>
                            <p className="text-[11px] text-muted-foreground truncate">
                              {r.vehicleName || "Vehicle"} ({r.vehicleReg || "Fleet"}) · {r.tripType}
                            </p>
                          </div>
                        ),
                        value: (r) => `${r.pickup || ""} to ${r.destination || ""}`,
                      },
                      {
                        key: "status",
                        label: "Status",
                        render: (r) => <StatusBadge status={r.status} />,
                        value: (r) => r.status,
                      },
                      {
                        key: "paymentStatus",
                        label: "Payment",
                        render: (r) => <StatusBadge status={r.paymentStatus} />,
                        value: (r) => r.paymentStatus,
                        hideOnMobile: true,
                      },
                      {
                        key: "amount",
                        label: "Total Fare",
                        className: "text-right font-semibold",
                        render: (r) => formatINR(tripTotal(r)),
                        value: (r) => formatINR(tripTotal(r)),
                      },
                    ]}
                    rows={trips}
                    rowKey={(r) => r.id}
                    onRowClick={(r) => {
                      onOpenChange(false);
                      navigate("trips", { clientId: client.id });
                    }}
                    loading={loading}
                    emptyIcon={Route}
                    emptyTitle="No trips logged"
                    emptyDescription="Book a trip for this client to see full history."
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* TAB 3: CLIENT PROFILE */}
            <TabsContent value="profile" className="mt-3">
              <Card>
                <CardContent className="p-4 space-y-3 text-sm">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl border bg-muted/20 space-y-1">
                      <p className="text-[11px] uppercase font-bold text-muted-foreground">Full Name / Entity</p>
                      <p className="font-semibold">{client.name}</p>
                    </div>
                    <div className="p-3 rounded-xl border bg-muted/20 space-y-1">
                      <p className="text-[11px] uppercase font-bold text-muted-foreground">Company</p>
                      <p className="font-semibold">{client.company || "Individual Client"}</p>
                    </div>
                    <div className="p-3 rounded-xl border bg-muted/20 space-y-1">
                      <p className="text-[11px] uppercase font-bold text-muted-foreground">Email Address</p>
                      <p className="font-semibold">{client.email || "No email on record"}</p>
                    </div>
                    <div className="p-3 rounded-xl border bg-muted/20 space-y-1">
                      <p className="text-[11px] uppercase font-bold text-muted-foreground">Address</p>
                      <p className="font-semibold">{client.address || "No address provided"}</p>
                    </div>
                  </div>
                  {client.billingDetails && (
                    <div className="p-3 rounded-xl border bg-muted/20 space-y-1">
                      <p className="text-[11px] uppercase font-bold text-muted-foreground">Billing / GST Details</p>
                      <p className="font-medium whitespace-pre-wrap text-xs">{client.billingDetails}</p>
                    </div>
                  )}
                  {client.notes && (
                    <div className="p-3 rounded-xl border bg-muted/20 space-y-1">
                      <p className="text-[11px] uppercase font-bold text-muted-foreground">Internal Notes</p>
                      <p className="font-medium whitespace-pre-wrap text-xs">{client.notes}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Child Formula Inspector */}
        <FormulaInspectorDialog
          open={Boolean(inspectorData)}
          onOpenChange={(o) => { if (!o) setInspectorData(null); }}
          data={inspectorData}
        />

        {/* Child Transaction Lineage */}
        <TransactionLineageDialog
          open={Boolean(lineageData)}
          onOpenChange={(o) => { if (!o) setLineageData(null); }}
          data={lineageData}
        />
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

export default function ClientsView({ navigate }: ViewProps) {
  const { lang } = useLang();
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ClientRec | null>(null);
  const [selectedClient, setSelectedClient] = useState<ClientRec | null>(null);

  const { data, loading, error, reload } = useAsync<ListResp<ClientRec>>(
    () => api.get<ListResp<ClientRec>>(`/api/clients${qs({ search: search || undefined })}`),
    [search]
  );

  const clients = data?.items ?? [];

  const columns: Column<ClientRec>[] = [
    {
      key: "name",
      label: t(lang, "col.client"),
      primary: true,
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{r.name}</p>
          {r.company && <p className="truncate text-[11px] text-muted-foreground">{r.company}</p>}
        </div>
      ),
      value: (r) => r.company ? `${r.name} (${r.company})` : r.name,
    },
    {
      key: "phone",
      label: t(lang, "col.phone"),
      render: (r) => <span className="tabular-nums">{r.phone || <span className="text-muted-foreground">—</span>}</span>,
      value: (r) => r.phone ?? "",
    },
    { key: "email", label: t(lang, "col.email"), value: (r) => r.email ?? "", hideOnMobile: true },
    {
      key: "tripCount",
      label: t(lang, "col.trips"),
      className: "text-right",
      render: (r) => <span className="tabular-nums">{r.tripCount ?? 0}</span>,
      value: (r) => String(r.tripCount ?? 0),
    },
    {
      key: "totalBusiness",
      label: t(lang, "col.totalBusiness"),
      className: "text-right",
      render: (r) => <span className="font-semibold tabular-nums">{formatINR(r.totalBusiness ?? 0)}</span>,
      value: (r) => formatINR(r.totalBusiness ?? 0),
    },
    {
      key: "actions",
      label: "",
      className: "w-10",
      render: (r) => (
        <span onClick={(e) => e.stopPropagation()} className="inline-block">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 sm:h-8 sm:w-8" aria-label={`Actions for ${r.name}`}>
                <EllipsisVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={() => setEditTarget(r)}>
                <Pencil className="h-3.5 w-3.5" aria-hidden />Edit client
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      ),
      value: () => "",
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title={t(lang, "page.clients")}
        subtitle={t(lang, "page.clients.sub").replace("{n}", String(clients.length))}
        icon={Contact2}
        actions={
          <Button size="sm" className="h-9 gap-1.5" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden />Add Client
          </Button>
        }
      />

      <Card>
        <CardContent className="space-y-3 p-3 sm:p-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Search name, company, phone…" />

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50/60 p-4 text-center dark:border-red-900 dark:bg-red-950/30">
              <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
              <Button variant="outline" size="sm" className="mt-2 h-8" onClick={() => void reload()}>Retry</Button>
            </div>
          )}

          {!error && (
            <DataTable
              columns={columns}
              rows={clients}
              rowKey={(r) => r.id}
              onRowClick={(r) => setSelectedClient(r)}
              exportName="clients"
              loading={loading}
              emptyIcon={Contact2}
              emptyTitle={search ? "No clients match" : "No clients yet"}
              emptyDescription={search ? "Try a different search keyword." : "Add your first transport client to start booking trips."}
            />
          )}

          {!error && !loading && clients.length > 0 && (
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Route className="h-3 w-3" aria-hidden />
              Tap a client to open their 360° Passbook statement, trip records &amp; billing.
            </p>
          )}
        </CardContent>
      </Card>

      <ClientFormDialog
        open={addOpen || Boolean(editTarget)}
        onOpenChange={(v) => {
          if (!v) {
            setAddOpen(false);
            setEditTarget(null);
          }
        }}
        target={editTarget}
        onDone={reload}
      />

      <ClientPassbookDialog
        open={Boolean(selectedClient)}
        onOpenChange={(v) => {
          if (!v) setSelectedClient(null);
        }}
        client={selectedClient}
        navigate={navigate}
      />
    </div>
  );
}
