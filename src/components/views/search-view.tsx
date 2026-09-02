"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api, qs } from "@/lib/api-client";
import type { ViewProps } from "@/components/view-types";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  CalendarCheck, CarFront, ChevronRight, Contact2, Building2, Keyboard, Receipt,
  Search, SearchX, Sparkles, UserRound, X, type LucideIcon,
} from "lucide-react";
import { useDebounced, useAsync } from "./_shared";

// ---------------------------------------------------------------------------
// Search response (GET /api/search?q= → grouped results, ≤5 each)
// ---------------------------------------------------------------------------

interface SearchItem {
  id: string;
  title: string;
  subtitle?: string | null;
  view: string;
  params?: Record<string, string> | null;
}

interface SearchResp {
  employees: SearchItem[];
  properties: SearchItem[];
  vehicles: SearchItem[];
  clients: SearchItem[];
  expenses: SearchItem[];
  deployments: SearchItem[];
}

const GROUPS: { key: keyof SearchResp; label: string; icon: LucideIcon }[] = [
  { key: "employees", label: "Employees", icon: UserRound },
  { key: "properties", label: "Properties", icon: Building2 },
  { key: "vehicles", label: "Vehicles", icon: CarFront },
  { key: "clients", label: "Clients", icon: Contact2 },
  { key: "expenses", label: "Expenses", icon: Receipt },
  { key: "deployments", label: "Deployments", icon: CalendarCheck },
];

const SEARCHABLE = [
  { label: "Employees", hint: "name, code, mobile", icon: UserRound },
  { label: "Properties", hint: "name, brand, area", icon: Building2 },
  { label: "Vehicles", hint: "name, registration number", icon: CarFront },
  { label: "Clients", hint: "name, company, phone", icon: Contact2 },
  { label: "Expenses", hint: "description, category", icon: Receipt },
  { label: "Deployments", hint: "employee, property, date", icon: CalendarCheck },
];

export default function SearchView({ params, navigate }: ViewProps) {
  const [q, setQ] = useState(params?.q ?? "");
  const inputRef = useRef<HTMLInputElement>(null);
  const debounced = useDebounced(q, 350);
  const trimmed = debounced.trim();

  // Ctrl+K / Cmd+K focuses the search box from anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const { data, loading, error } = useAsync<SearchResp | null>(
    () => (trimmed ? api.get<SearchResp>(`/api/search${qs({ q: trimmed })}`) : Promise.resolve(null)),
    [trimmed]
  );

  const groups = useMemo(
    () =>
      GROUPS.map((g) => ({ ...g, items: (data?.[g.key] as SearchItem[] | undefined) ?? [] })).filter(
        (g) => g.items.length > 0
      ),
    [data]
  );

  const resultCount = groups.reduce((sum, g) => sum + g.items.length, 0);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      {/* Search box */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search employees, properties, vehicles, clients…"
          className="h-12 rounded-2xl bg-card pl-12 pr-10 text-base shadow-sm"
          inputMode="search"
          autoFocus
          aria-label="Search everything"
        />
        {q && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1.5 top-1/2 h-9 w-9 -translate-y-1/2 text-muted-foreground"
            onClick={() => {
              setQ("");
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50/60 p-4 text-center dark:border-red-900 dark:bg-red-950/30">
          <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {/* Loading skeletons */}
      {loading && trimmed && (
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      )}

      {/* Idle state — what can be searched */}
      {!trimmed && !loading && (
        <>
          <Card className="border-primary/20">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" aria-hidden />
                <p className="text-sm font-bold">Search everything in one place</p>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Type a few letters — names, codes, numbers — and jump straight to the record. Everything below is
                searchable:
              </p>
              <ul className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {SEARCHABLE.map((s) => (
                  <li
                    key={s.label}
                    className="flex items-center gap-2.5 rounded-lg bg-muted/50 px-2.5 py-2"
                  >
                    <s.icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium leading-tight">{s.label}</p>
                      <p className="truncate text-[10px] text-muted-foreground">{s.hint}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex items-center gap-2 text-[11px] text-muted-foreground">
                <Keyboard className="h-3.5 w-3.5" aria-hidden />
                <span>
                  Press <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">Ctrl</kbd>{" "}
                  <span className="mx-0.5">+</span>{" "}
                  <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">K</kbd> anywhere to open
                  search
                </span>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* No results */}
      {!loading && trimmed && !error && resultCount === 0 && (
        <EmptyState
          icon={SearchX}
          title={`No results for “${trimmed}”`}
          description="Check the spelling or try a shorter keyword — partial names work too."
        />
      )}

      {/* Result groups */}
      {groups.map((g) => (
        <section key={g.key} aria-label={`${g.label} results`}>
          <div className="mb-1.5 flex items-center gap-2 px-1">
            <g.icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{g.label}</h2>
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
              {g.items.length}
            </span>
          </div>
          <Card>
            <CardContent className="p-1.5">
              {g.items.map((item) => (
                <button
                  key={`${g.key}-${item.id}`}
                  type="button"
                  onClick={() => navigate(item.view, item.params ?? {})}
                  className={cn(
                    "group flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors",
                    "hover:bg-muted/70 focus-visible:bg-muted/70 focus-visible:outline-none"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    {item.subtitle && (
                      <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>
                    )}
                  </div>
                  <ChevronRight
                    className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </button>
              ))}
            </CardContent>
          </Card>
        </section>
      ))}
    </div>
  );
}
