"use client";

import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

// Month navigation chip: ‹ October 2025 ›
export function MonthPicker({
  month, // YYYY-MM
  onChange,
  className,
}: {
  month: string;
  onChange: (m: string) => void;
  className?: string;
}) {
  const [y, m] = month.split("-").map(Number);
  const date = new Date(y, m - 1, 1);
  const label = date.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const shift = (delta: number) => {
    const next = new Date(date);
    next.setMonth(next.getMonth() + delta);
    onChange(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`);
  };
  const current = new Date();
  const isCurrent = month === `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`;
  return (
    <div className={cn("inline-flex items-center gap-1 rounded-full border bg-card p-1", className)}>
      <Button variant="ghost" size="icon" className="h-9 w-9 sm:h-8 sm:w-8" onClick={() => shift(-1)} aria-label="Previous month">
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="min-w-[120px] text-center text-sm font-medium tabular-nums">
        {label}
        {isCurrent && <span className="ml-1.5 text-[10px] text-muted-foreground font-normal">(current)</span>}
      </span>
      <Button variant="ghost" size="icon" className="h-9 w-9 sm:h-8 sm:w-8" onClick={() => shift(1)} aria-label="Next month">
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function toMonth(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
