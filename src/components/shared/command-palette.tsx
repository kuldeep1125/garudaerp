"use client";

import { useMemo, useState } from "react";
import { api } from "@/lib/api-client";
import { useNav, useBusiness } from "@/components/providers";
import { VIEWS } from "@/lib/views";
import { useLang, t } from "@/lib/i18n";
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty,
  CommandGroup, CommandItem, CommandSeparator,
} from "@/components/ui/command";
import { useDebounced, useAsync } from "@/components/views/_shared";
import { cn } from "@/lib/utils";
import {
  AlertCircle, ArrowRight, Building2, CalendarCheck, CarFront, Contact2,
  CornerDownLeft, Receipt, Search, UserRound, type LucideIcon,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Global command palette (Ctrl/Cmd+K) — quick navigation, quick actions and
// live entity search (mirrors /api/search used by the full search view).
// ---------------------------------------------------------------------------

interface SearchItem {
  id: string;
  title: string;
  subtitle?: string | null;
  view: string;
  params?: Record<string, string> | null;
}

type SearchResp = Record<string, SearchItem[]>;

const RESULT_GROUPS: { key: string; icon: LucideIcon; tint: string }[] = [
  { key: "employees", icon: UserRound, tint: "text-emerald-600 dark:text-emerald-400" },
  { key: "properties", icon: Building2, tint: "text-emerald-600 dark:text-emerald-400" },
  { key: "vehicles", icon: CarFront, tint: "text-amber-600 dark:text-amber-400" },
  { key: "clients", icon: Contact2, tint: "text-amber-600 dark:text-amber-400" },
  { key: "expenses", icon: Receipt, tint: "text-muted-foreground" },
  { key: "deployments", icon: CalendarCheck, tint: "text-emerald-600 dark:text-emerald-400" },
];

// Business accent per view group (matches SideNav accents).
const GROUP_TINT: Record<string, string> = {
  MAIN: "text-primary",
  MANPOWER: "text-emerald-600 dark:text-emerald-400",
  TRANSPORT: "text-amber-600 dark:text-amber-400",
  SYSTEM: "text-muted-foreground",
};

// Quick actions — first-class destinations beyond the sidebar (icons come from VIEWS).
const ACTIONS = [
  "deployments", "payments", "advances", "expenses", "trips", "vehicles",
  "reports", "notifications", "audit",
];

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { navigate } = useNav();
  const { scope } = useBusiness();
  const { lang } = useLang();
  const [q, setQ] = useState("");
  const debounced = useDebounced(q, 250);

  const live = debounced.trim().length >= 2;

  const { data: results } = useSearch(live ? debounced.trim() : "");

  const navViews = useMemo(
    () =>
      VIEWS.filter(
        (v) => !v.hidden && (scope === "ALL" || v.group === "MAIN" || v.group === "SYSTEM" || v.group === scope)
      ),
    [scope]
  );

  const go = (view: string, params?: Record<string, string>) => {
    onOpenChange(false);
    navigate(view, params);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={(o) => { onOpenChange(o); if (!o) setQ(""); }}
      title={t(lang, "topbar.searchShort")}
      description={t(lang, "palette.placeholder")}
      className="sm:max-w-[580px] rounded-2xl border shadow-2xl top-[12%] translate-y-0 sm:top-[14%]"
      showCloseButton={false}
    >
      <CommandInput
        value={q}
        onValueChange={setQ}
        placeholder={t(lang, "palette.placeholder")}
        aria-label={t(lang, "palette.placeholder")}
      />
      <CommandList className="max-h-[min(420px,60vh)]">
        <CommandEmpty>{t(lang, "palette.empty")}</CommandEmpty>

        {/* Live entity results (query ≥ 2 chars) — group renders whenever live so
            the "full search" handoff stays reachable even with zero live matches. */}
        {live && (
          <CommandGroup heading={t(lang, "palette.results")}>
            {RESULT_GROUPS.map((g) =>
              (results?.[g.key] ?? []).slice(0, 4).map((item) => (
                <CommandItem
                  key={`${g.key}-${item.id}`}
                  value={`sr-${g.key}-${item.title} ${item.subtitle ?? ""}`}
                  onSelect={() => go(item.view, item.params ?? undefined)}
                  className="gap-3 rounded-lg aria-selected:translate-x-0.5"
                >
                  <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/70", g.tint)}>
                    <g.icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{item.title}</span>
                    {item.subtitle && (
                      <span className="block truncate text-[11px] text-muted-foreground">{item.subtitle}</span>
                    )}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" aria-hidden />
                </CommandItem>
              ))
            )}
            <CommandItem
              value={`full-search ${debounced.trim()}`} // embed the query so cmdk never filters this item out
              onSelect={() => go("search", { q: debounced.trim() })}
              className="gap-3 rounded-lg text-primary"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10">
                <Search className="h-4 w-4" aria-hidden />
              </span>
              <span className="flex-1 text-[13px] font-medium">
                {t(lang, "palette.searchAll")}
                {debounced.trim() && <span className="text-muted-foreground"> · “{debounced.trim()}”</span>}
              </span>
              <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" aria-hidden />
            </CommandItem>
          </CommandGroup>
        )}
        {live && <CommandSeparator />}

        {/* Quick actions */}
        <CommandGroup heading={t(lang, "palette.actions")}>
          {ACTIONS.map((id) => {
            const v = VIEWS.find((x) => x.id === id);
            if (!v) return null;
            const Icon = v.icon as LucideIcon;
            return (
              <CommandItem
                key={v.id}
                value={`act-${v.label}`}
                onSelect={() => go(v.id)}
                className="gap-3 rounded-lg"
              >
                <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/70", GROUP_TINT[v.group])}>
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="flex-1 text-[13px] font-medium">{v.label}</span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" aria-hidden />
              </CommandItem>
            );
          })}
        </CommandGroup>
        <CommandSeparator />

        {/* Navigation */}
        <CommandGroup heading={t(lang, "palette.goTo")}>
          {navViews.map((v) => {
            const Icon = v.icon as LucideIcon;
            return (
              <CommandItem
                key={v.id}
                value={`go-${v.label}`}
                onSelect={() => go(v.id)}
                className="gap-3 rounded-lg"
              >
                <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/70", GROUP_TINT[v.group])}>
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="flex-1 text-[13px] font-medium">{v.label}</span>
                {v.description && (
                  <span className="hidden sm:block truncate text-[11px] text-muted-foreground max-w-[40%]">{v.description}</span>
                )}
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>

      {/* Footer kbd hints */}
      <div className="flex items-center gap-4 border-t bg-muted/30 px-4 py-2 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <kbd className="rounded border bg-background px-1 font-mono">↑↓</kbd> {t(lang, "palette.hint.nav")}
        </span>
        <span className="flex items-center gap-1.5">
          <kbd className="rounded border bg-background px-1 font-mono">↵</kbd> {t(lang, "palette.hint.open")}
        </span>
        <span className="flex items-center gap-1.5">
          <kbd className="rounded border bg-background px-1 font-mono">esc</kbd> {t(lang, "palette.hint.close")}
        </span>
        <span className="ml-auto hidden items-center gap-1 text-[10px] sm:flex">
          <AlertCircle className="h-3 w-3" aria-hidden /> {t(lang, "palette.searchAll")} →
        </span>
      </div>
    </CommandDialog>
  );
}

function useSearch(q: string) {
  return useAsync<SearchResp | null>(async () => {
    if (!q) return null;
    try {
      return await api.get<SearchResp>(`/api/search?q=${encodeURIComponent(q)}`);
    } catch {
      return null;
    }
  }, [q]);
}
