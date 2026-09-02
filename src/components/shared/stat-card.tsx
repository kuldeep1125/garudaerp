"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string;
  icon?: LucideIcon;
  tone?: "default" | "positive" | "negative" | "warning" | "info" | "transport";
  hint?: string;
  onClick?: () => void;
  className?: string;
}

const TONES: Record<NonNullable<StatCardProps["tone"]>, string> = {
  default: "text-foreground",
  positive: "text-emerald-600 dark:text-emerald-400",
  negative: "text-red-600 dark:text-red-400",
  warning: "text-amber-600 dark:text-amber-400",
  info: "text-teal-600 dark:text-teal-400",
  transport: "text-amber-600 dark:text-amber-400",
};

// Responsive stat card: tappable, answers a business question at a glance.
export function StatCard({ label, value, icon: Icon, tone = "default", hint, onClick, className }: StatCardProps) {
  const interactive = Boolean(onClick);
  return (
    <Card
      className={cn(
        "border-border/70 shadow-sm transition-all",
        interactive && "cursor-pointer hover:shadow-md hover:border-primary/40 active:scale-[0.99]",
        className
      )}
      onClick={onClick}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick?.(); } } : undefined}
      aria-label={`${label}: ${value}`}
    >
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[11px] sm:text-xs font-medium text-muted-foreground leading-tight">{label}</p>
          {Icon && (
            <div className="shrink-0 rounded-lg bg-muted p-1.5">
              <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            </div>
          )}
        </div>
        <p className={cn("mt-1.5 text-lg sm:text-xl font-bold tabular-nums tracking-tight", TONES[tone])}>{value}</p>
        {hint && <p className="mt-0.5 text-[10px] sm:text-[11px] text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export function StatGrid({ children, cols = 4, className }: { children: React.ReactNode; cols?: 2 | 3 | 4 | 5; className?: string }) {
  const grid = {
    2: "grid-cols-2",
    3: "grid-cols-2 sm:grid-cols-3",
    4: "grid-cols-2 md:grid-cols-4",
    5: "grid-cols-2 md:grid-cols-3 xl:grid-cols-5",
  }[cols];
  return <div className={cn("grid gap-2.5 sm:gap-3", grid, className)}>{children}</div>;
}

export function StatCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-3 sm:p-4 space-y-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-6 w-16" />
      </CardContent>
    </Card>
  );
}
