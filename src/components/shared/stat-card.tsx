"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

const ICON_CHIPS: Record<NonNullable<StatCardProps["tone"]>, string> = {
  default: "bg-muted text-muted-foreground",
  positive: "bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400",
  negative: "bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400",
  warning: "bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400",
  info: "bg-teal-100 text-teal-600 dark:bg-teal-950 dark:text-teal-400",
  transport: "bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400",
};

// ---------------------------------------------------------------------------
// Count-up: tween the numeric portion of a formatted value ("₹21.5K",
// "₹17,110", "22 deployments") preserving prefix/suffix, decimals and
// Indian grouping. Respects prefers-reduced-motion; non-numeric values
// render unchanged.
// ---------------------------------------------------------------------------

const VALUE_RE = /^([^\d-]*)(-?[\d,]+(?:\.\d+)?)([\s\S]*)$/;

function formatPart(n: number, decimals: number, grouping: boolean): string {
  return n.toLocaleString(grouping ? "en-IN" : "en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function useCountUp(text: string): string {
  const m = useMemo(() => VALUE_RE.exec(text), [text]);
  const target = m ? parseFloat(m[2].replace(/,/g, "")) : NaN;
  const decimals = m ? (m[2].split(".")[1] ?? "").length : 0;
  const grouping = Boolean(m?.[2].includes(","));
  const [out, setOut] = useState(() =>
    m && Number.isFinite(target) ? m[1] + formatPart(0, decimals, grouping) + m[3] : text
  );
  const rafRef = useRef(0);

  useEffect(() => {
    if (!m || !Number.isFinite(target)) {
      // non-numeric value — render as-is (set during render would loop; rAF once is safe)
      rafRef.current = requestAnimationFrame(() => setOut(text));
      return () => cancelAnimationFrame(rafRef.current);
    }
    const dur = 750;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      const eased = reduced ? 1 : 1 - Math.pow(1 - p, 3);
      setOut(m[1] + formatPart(target * eased, decimals, grouping) + m[3]);
      if (p < 1 && !reduced) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text]);

  return out;
}

// Responsive stat card: tappable, answers a business question at a glance.
export function StatCard({ label, value, icon: Icon, tone = "default", hint, onClick, className }: StatCardProps) {
  const interactive = Boolean(onClick);
  const animated = useCountUp(value);
  return (
    <Card
      className={cn(
        "group relative overflow-hidden border-border/70 shadow-sm transition-all",
        // gradient hairline that fades in on hover
        "before:pointer-events-none before:absolute before:inset-x-3 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-primary/60 before:to-transparent before:opacity-0 before:transition-opacity before:duration-300 hover:before:opacity-100",
        interactive && "cursor-pointer hover:shadow-md hover:border-primary/40 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99]",
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
            <div className={cn("shrink-0 rounded-lg p-1.5 transition-transform duration-300 group-hover:scale-110", ICON_CHIPS[tone])}>
              <Icon className="h-3.5 w-3.5" aria-hidden />
            </div>
          )}
        </div>
        <p className={cn("mt-1.5 text-lg sm:text-xl font-bold tabular-nums tracking-tight", TONES[tone])}>{animated}</p>
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
