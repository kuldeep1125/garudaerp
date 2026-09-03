"use client";

import { useState } from "react";
import { api, downloadJSON } from "@/lib/api-client";
import type { ViewProps } from "@/components/view-types";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  AlertTriangle, Building2, Check, Crown, Database, Download, History, Languages, Loader2, Receipt,
  ReceiptText, RefreshCw, Settings, ShieldCheck, Smartphone, Sparkles, Truck, Users,
} from "lucide-react";
import { errMessage, Field, todayStr, useAsync, useMutation } from "./_shared";
import { usePwaInstall } from "@/components/shared/pwa-install";
import { useLang, t, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Settings shape (GET /api/settings → { business })
// ---------------------------------------------------------------------------

interface BusinessSettings {
  name?: string | null;
  address?: string | null;
  contact?: string | null;
  gstin?: string | null;
  logoText?: string | null;
}

interface SettingsResp {
  business: BusinessSettings;
}

type SettingsForm = { name: string; address: string; contact: string; gstin: string; logoText: string };

// ---------------------------------------------------------------------------
// Data & backup — full JSON export (GET /api/settings/backup)
// ---------------------------------------------------------------------------

interface BackupResp {
  format: string;
  version: number;
  generatedAt: string;
  counts: Record<string, number>;
}

function BackupCard() {
  const { lang } = useLang();
  const [exporting, setExporting] = useState(false);

  const exportBackup = async () => {
    setExporting(true);
    try {
      const backup = await api.get<BackupResp>("/api/settings/backup");
      const total = Object.values(backup.counts).reduce((s, n) => s + n, 0);
      downloadJSON(`bizhub-backup-${todayStr()}.json`, backup);
      toast.success(
        t(lang, "settings.backupDone")
          .replace("{total}", total.toLocaleString("en-IN"))
          .replace("{collections}", String(Object.keys(backup.counts).length))
      );
    } catch (e) {
      toast.error(errMessage(e));
    } finally {
      setExporting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Database className="h-4 w-4 text-primary" aria-hidden />
          {t(lang, "settings.backupTitle")}
        </CardTitle>
        <CardDescription>{t(lang, "settings.backupDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button variant="outline" className="min-h-10 gap-2" onClick={() => void exportBackup()} disabled={exporting}>
          {exporting ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Download className="h-4 w-4" aria-hidden />
          )}
          {exporting ? t(lang, "settings.backupWorking") : t(lang, "settings.backupAction")}
        </Button>
        <p className="text-xs leading-relaxed text-muted-foreground">{t(lang, "settings.backupNote")}</p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Data integrity — zero-mismatch health checks (GET/POST /api/settings/integrity)
// ---------------------------------------------------------------------------

interface IntegrityResp {
  ok: boolean;
  checks: { id: string; label: string; detail: string; count: number; status: "ok" | "warn" }[];
  totals: { trips: number; settlements: number };
}

function IntegrityCard() {
  const { data, loading, error, reload } = useAsync<IntegrityResp>(() => api.get("/api/settings/integrity"), []);
  const [repairing, setRepairing] = useState(false);

  const repair = async () => {
    setRepairing(true);
    try {
      const r = await api.post<{ repaired: { properties: number; cancelledCleaned: number } }>("/api/settings/integrity");
      toast.success(`Repaired — allocations re-checked across ${r.repaired.properties} property(ies)`);
      void reload();
    } catch (e) {
      toast.error(errMessage(e));
    } finally {
      setRepairing(false);
    }
  };

  const issues = data?.checks.reduce((s, c) => s + c.count, 0) ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
          Data integrity
        </CardTitle>
        <CardDescription>
          Continuous zero-mismatch audit — derived numbers are re-checked against their source records.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
            <Button variant="outline" size="sm" className="h-8" onClick={() => void reload()}>Retry</Button>
          </div>
        ) : data ? (
          <>
            <div
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium",
                data.ok
                  ? "border-emerald-200 bg-emerald-50/70 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"
                  : "border-amber-300 bg-amber-50/70 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300"
              )}
              role="status"
            >
              {data.ok ? <Check className="h-4 w-4 shrink-0" aria-hidden /> : <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />}
              {data.ok
                ? "All checks passed — books are consistent"
                : `${issues} issue${issues === 1 ? "" : "s"} found — auto-repair can fix allocation drift`}
            </div>
            <ul className="space-y-1.5">
              {data.checks.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold">{c.label}</p>
                    <p className="truncate text-[10px] text-muted-foreground">{c.detail}</p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold",
                      c.count === 0
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                        : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                    )}
                  >
                    {c.count === 0 ? "OK" : c.count}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => void reload()} disabled={loading}>
                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                Re-run checks
              </Button>
              {issues > 0 && (
                <Button size="sm" className="h-9 gap-1.5" onClick={() => void repair()} disabled={repairing}>
                  {repairing ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <ShieldCheck className="h-3.5 w-3.5" aria-hidden />}
                  Auto-repair
                </Button>
              )}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Danger zone — reset all business data (POST /api/settings/reset)
// ---------------------------------------------------------------------------

function DangerZoneCard() {
  const [confirmText, setConfirmText] = useState("");
  const [resetting, setResetting] = useState(false);

  const doReset = async () => {
    setResetting(true);
    try {
      await api.post("/api/settings/reset", { confirm: confirmText });
      toast.success("All business data wiped — clean slate ready. Master data and your login were kept.");
      setConfirmText("");
      window.location.reload();
    } catch (e) {
      toast.error(errMessage(e));
    } finally {
      setResetting(false);
    }
  };

  return (
    <Card className="border-red-200 dark:border-red-900/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-red-700 dark:text-red-400">
          <AlertTriangle className="h-4 w-4" aria-hidden />
          Danger zone
        </CardTitle>
        <CardDescription>
          Start over: wipe every employee, property, vehicle, trip, payment and expense. Your login and
          master lists (shifts, categories) are kept.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" className="min-h-10 gap-1.5">
              <AlertTriangle className="h-4 w-4" aria-hidden />
              Reset all business data
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Wipe all business data?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently deletes every employee, property, contract, deployment, payment,
                advance, expense, vehicle, client, trip and settlement. Type <span className="font-mono font-bold">RESET</span> below
                to confirm. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Type RESET"
              aria-label="Type RESET to confirm"
              className="h-10 font-mono"
            />
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-white hover:bg-destructive/90"
                disabled={confirmText.trim().toUpperCase() !== "RESET" || resetting}
                onClick={(e) => {
                  e.preventDefault();
                  void doReset();
                }}
              >
                {resetting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <AlertTriangle className="h-4 w-4" aria-hidden />}
                Yes, wipe everything
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Language preference (i18n scaffolding — persisted in localStorage)
// ---------------------------------------------------------------------------

const LANG_OPTIONS: { key: Lang; nameKey: string; native: string; sample: string }[] = [
  { key: "en", nameKey: "lang.en", native: "English", sample: "Dashboard · Reports · Settings" },
  { key: "hi", nameKey: "lang.hi", native: "हिन्दी", sample: "डैशबोर्ड · रिपोर्ट · सेटिंग" },
];

function LanguageCard() {
  const { lang, setLang } = useLang();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Languages className="h-4 w-4 text-primary" aria-hidden />
          {t(lang, "settings.language")}
        </CardTitle>
        <CardDescription>{t(lang, "settings.languageDesc")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2.5 sm:grid-cols-2" role="radiogroup" aria-label={t(lang, "settings.language")}>
          {LANG_OPTIONS.map((o) => {
            const active = lang === o.key;
            return (
              <button
                key={o.key}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setLang(o.key)}
                className={cn(
                  "flex min-h-[64px] items-center gap-3 rounded-xl border p-3 text-left transition-all",
                  active
                    ? "border-primary/50 bg-primary/5 ring-1 ring-primary/30"
                    : "border-border bg-card hover:border-primary/30 hover:bg-muted/40"
                )}
              >
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold",
                    active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  )}
                  aria-hidden
                >
                  {o.key === "hi" ? "अ" : "A"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{o.native}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{o.sample}</span>
                </span>
                {active && <Check className="h-4 w-4 shrink-0 text-primary" aria-label="Selected" />}
              </button>
            );
          })}
        </div>
        <p className="mt-2.5 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
          <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-primary" aria-hidden />
          {t(lang, "lang.note")}
        </p>
      </CardContent>
    </Card>
  );
}

export default function SettingsView({ navigate }: ViewProps) {
  const { canInstall, install, isStandalone } = usePwaInstall();
  const { data, loading, error, reload } = useAsync<SettingsResp>(
    () => api.get<SettingsResp>("/api/settings"),
    []
  );

  const [form, setForm] = useState<SettingsForm | null>(null);
  const { mutate, saving } = useMutation();

  // Derived defaults from server data; user edits take over via `form`.
  const biz = data?.business;
  const derived: SettingsForm | null = biz
    ? {
        name: biz.name ?? "",
        address: biz.address ?? "",
        contact: biz.contact ?? "",
        gstin: biz.gstin ?? "",
        logoText: biz.logoText ?? "",
      }
    : null;
  const current = form ?? derived;

  const dirty = Boolean(form && derived && JSON.stringify(form) !== JSON.stringify(derived));

  const set = (k: keyof SettingsForm) => (v: string) => setForm((f) => ({ ...(f ?? derived ?? { name: "", address: "", contact: "", gstin: "", logoText: "" }), [k]: v }));

  const save = async () => {
    if (!current) return;
    if (!current.name.trim()) {
      toast.error("Business name is required");
      return;
    }
    const res = await mutate(
      () => api.put("/api/settings", {
        name: current.name.trim(),
        address: current.address || undefined,
        contact: current.contact || undefined,
        gstin: current.gstin || undefined,
        logoText: current.logoText || undefined,
      }),
      "Settings saved"
    );
    if (res.ok) {
      setForm(null);
      reload();
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Settings" subtitle="Business profile & system" icon={Settings} />

      <div className="mx-auto w-full max-w-3xl space-y-4">
        {/* 1 — Business profile */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4 text-primary" aria-hidden />
              Business profile
            </CardTitle>
            <CardDescription>
              Shown on statements, reports and printed documents.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading && (
              <div className="space-y-2.5" aria-busy="true">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-2/3" />
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50/60 p-4 text-center dark:border-red-900 dark:bg-red-950/30">
                <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
                <Button variant="outline" size="sm" className="mt-2 h-8" onClick={() => void reload()}>Retry</Button>
              </div>
            )}

            {!loading && !error && current && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Business name" required className="sm:col-span-2">
                    <Input value={current.name} onChange={(e) => set("name")(e.target.value)} className="h-10" placeholder="e.g. Sri Balaji Services" />
                  </Field>
                  <Field label="Contact">
                    <Input value={current.contact} onChange={(e) => set("contact")(e.target.value)} inputMode="tel" className="h-10" placeholder="Phone / email" />
                  </Field>
                  <Field label="GSTIN">
                    <Input value={current.gstin} onChange={(e) => set("gstin")(e.target.value)} className="h-10" placeholder="e.g. 29ABCDE1234F1Z5" />
                  </Field>
                  <Field label="Logo text" className="sm:col-span-2" hint="Short initials shown in the header & sidebar (e.g. SB)">
                    <Input value={current.logoText} onChange={(e) => set("logoText")(e.target.value)} className="h-10" maxLength={4} />
                  </Field>
                  <Field label="Address" className="sm:col-span-2">
                    <Textarea value={current.address} onChange={(e) => set("address")(e.target.value)} rows={2} />
                  </Field>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] text-muted-foreground" aria-live="polite">
                    {dirty ? "Unsaved changes" : "All changes saved"}
                  </p>
                  <Button className="min-h-10" onClick={save} disabled={saving || !dirty}>
                    {saving ? "Saving…" : "Save changes"}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* 2 — Two businesses explainer */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Two businesses, one platform</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2.5 sm:grid-cols-2">
              <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
                <span className="shrink-0 rounded-lg bg-emerald-100 p-1.5 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300" aria-hidden>
                  <Users className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">Manpower</p>
                  <p className="text-xs leading-relaxed text-emerald-700/80 dark:text-emerald-300/80">
                    Employees, deployments, collections, advances & payroll.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900 dark:bg-amber-950/30">
                <span className="shrink-0 rounded-lg bg-amber-100 p-1.5 text-amber-700 dark:bg-amber-900 dark:text-amber-300" aria-hidden>
                  <Truck className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">Transport</p>
                  <p className="text-xs leading-relaxed text-amber-700/80 dark:text-amber-300/80">
                    Vehicles, clients, trips, expenses, EMI & maintenance.
                  </p>
                </div>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">Financial records never mix between businesses.</span> Every
              expense, trip and revenue entry is tagged to its business, so profit, receivables and payables are always
              reported separately.
            </p>
          </CardContent>
        </Card>

        {/* 3 — Language */}
        <LanguageCard />

        {/* 4 — Data & backup */}
        <BackupCard />

        {/* 4b — Data integrity (zero-mismatch audit) */}
        <IntegrityCard />

        {/* 4c — Danger zone (reset business data) */}
        <DangerZoneCard />

        {/* 5 — System shortcuts */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">System shortcuts</CardTitle>
            <CardDescription>Jump to administration and control screens.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {[
                { label: "Audit Log", icon: History, view: "audit" },
                { label: "Owners", icon: Crown, view: "owners" },
                { label: "Expenses", icon: Receipt, view: "expenses" },
                { label: "Settlements", icon: ReceiptText, view: "settlements" },
              ].map((s) => (
                <Button
                  key={s.view}
                  variant="outline"
                  className="min-h-10 min-w-0 flex-col gap-1.5 px-2 py-3"
                  onClick={() => navigate(s.view)}
                >
                  <s.icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                  <span className="w-full truncate text-center text-xs">{s.label}</span>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* 6 — About */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">About</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-base font-bold text-primary-foreground" aria-hidden>
                B
              </div>
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-bold">
                  BizHub
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">v1.0</span>
                </p>
                <p className="text-xs text-muted-foreground">Business management for Manpower & Transport</p>
              </div>
            </div>
            <div className="flex items-start gap-2 rounded-lg bg-muted/60 p-3">
              <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {isStandalone ? (
                    <span className="font-medium text-foreground">BizHub is running as an installed app — enjoy the full-screen experience.</span>
                  ) : canInstall ? (
                    <span className="font-medium text-foreground">Install BizHub on this device for a full-screen, offline-friendly app experience.</span>
                  ) : (
                    <span className="font-medium text-foreground">Add to home screen</span>
                  )}
                  {!isStandalone && !canInstall && (
                    <>
                      {" "}from your browser menu (Share → Add to Home Screen on iOS, ⋮ → Install app on Android/Chrome).
                    </>
                  )}
                </p>
              </div>
              {canInstall && (
                <Button
                  size="sm"
                  className="h-8 shrink-0"
                  onClick={() =>
                    install().then((r) => {
                      if (r === "accepted") toast.success("BizHub installed — find it on your home screen");
                    })
                  }
                >
                  Install
                </Button>
              )}
            </div>
            <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
              <span>
                <span className="font-medium text-foreground">Enter information once → the system calculates everything</span> —
                billing, payouts, advances, settlements, profit and alerts.
              </span>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
