"use client";

import { useState } from "react";
import { api, qs } from "@/lib/api-client";
import { formatINR } from "@/lib/money";
import type { ViewProps } from "@/components/view-types";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { SearchInput } from "@/components/shared/filters";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Contact2, EllipsisVertical, Pencil, Plus, Route } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Field, ListResp, useAsync, useMutation,
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
// View
// ---------------------------------------------------------------------------

export default function ClientsView({ navigate }: ViewProps) {
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ClientRec | null>(null);

  const { data, loading, error, reload } = useAsync<ListResp<ClientRec>>(
    () => api.get<ListResp<ClientRec>>(`/api/clients${qs({ search: search || undefined })}`),
    [search]
  );

  const clients = data?.items ?? [];

  const columns: Column<ClientRec>[] = [
    {
      key: "name",
      label: "Client",
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
      label: "Phone",
      render: (r) => <span className="tabular-nums">{r.phone || <span className="text-muted-foreground">—</span>}</span>,
      value: (r) => r.phone ?? "",
    },
    { key: "email", label: "Email", value: (r) => r.email ?? "", hideOnMobile: true },
    {
      key: "tripCount",
      label: "Trips",
      className: "text-right",
      render: (r) => <span className="tabular-nums">{r.tripCount ?? 0}</span>,
      value: (r) => String(r.tripCount ?? 0),
    },
    {
      key: "totalBusiness",
      label: "Total business",
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
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${r.name}`}>
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
        title="Clients"
        subtitle={`${clients.length} transport customer${clients.length === 1 ? "" : "s"}`}
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
              onRowClick={(r) => navigate("trips", { clientId: r.id })}
              loading={loading}
              emptyIcon={Contact2}
              emptyTitle={search ? "No clients match" : "No clients yet"}
              emptyDescription={search ? "Try a different search keyword." : "Add your first transport client to start booking trips."}
            />
          )}

          {!error && !loading && clients.length > 0 && (
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Route className="h-3 w-3" aria-hidden />
              Tap a client to see their trips &amp; rentals.
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
    </div>
  );
}
