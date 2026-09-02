"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/money";
import { CalendarDays, Download, Search } from "lucide-react";

export type RangeKey = "today" | "yesterday" | "week" | "lastweek" | "month" | "lastmonth" | "custom";

export const RANGE_LABELS: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "week", label: "This Week" },
  { key: "lastweek", label: "Last Week" },
  { key: "month", label: "This Month" },
  { key: "lastmonth", label: "Last Month" },
];

// Horizontal scrollable date-range pill selector.
export function RangeSelector({
  value,
  onChange,
  className,
}: {
  value: RangeKey;
  onChange: (v: RangeKey) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 no-scrollbar", className)} role="tablist" aria-label="Date range">
      {RANGE_LABELS.map((r) => (
        <Button
          key={r.key}
          role="tab"
          aria-selected={value === r.key}
          size="sm"
          variant={value === r.key ? "default" : "outline"}
          className="h-8 shrink-0 rounded-full px-3 text-xs"
          onClick={() => onChange(r.key)}
        >
          {r.label}
        </Button>
      ))}
    </div>
  );
}

// Search box with icon. Debounce handled by caller or useDebouncedValue.
export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 pl-9 rounded-xl bg-card"
        aria-label={placeholder}
        inputMode="search"
      />
    </div>
  );
}

// Money delta chip for +X / −Y values.
export function MoneyDelta({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("tabular-nums font-medium", value >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400", className)}>
      {formatINR(value)}
    </span>
  );
}

export function ExportButton({ onExport, disabled }: { onExport: () => void; disabled?: boolean }) {
  return (
    <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={onExport} disabled={disabled}>
      <Download className="h-3.5 w-3.5" aria-hidden />
      <span className="hidden sm:inline">Export CSV</span>
      <span className="sm:hidden">CSV</span>
    </Button>
  );
}

export function DateBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
      <CalendarDays className="h-3 w-3" aria-hidden />
      {children}
    </span>
  );
}
