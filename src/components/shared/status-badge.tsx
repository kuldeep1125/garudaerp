"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STYLES: Record<string, string> = {
  // generic
  ACTIVE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200",
  INACTIVE: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 border-zinc-200",
  SUSPENDED: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300 border-orange-200",
  LEFT: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 border-zinc-200",
  // deployment statuses
  SCHEDULED: "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300 border-sky-200",
  CONFIRMED: "bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300 border-teal-200",
  COMPLETED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200",
  PARTIAL: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-200",
  CANCELLED: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 border-zinc-200",
  NO_SHOW: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 border-red-200",
  // payment
  PAID: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200",
  UNPAID: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300 border-red-200",
  PENDING: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-200",
  // settlement
  DRAFT: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-200",
  FINALIZED: "bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300 border-teal-200",
  // trips
  AVAILABLE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200",
  RENTED: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-200",
  TRIP: "bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300 border-teal-200",
  MAINTENANCE: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300 border-orange-200",
  DONE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200",
  DAY: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-200",
  NIGHT: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const key = String(status ?? "").toUpperCase();
  const style = STYLES[key] ?? "bg-muted text-muted-foreground border-border";
  const label = key.replace(/_/g, " ");
  return (
    <Badge variant="outline" className={cn("font-medium text-[11px] px-2 py-0.5 whitespace-nowrap", style, className)}>
      {label}
    </Badge>
  );
}
