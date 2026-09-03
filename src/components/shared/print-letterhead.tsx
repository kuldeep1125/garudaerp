"use client";

import { cn } from "@/lib/utils";

/**
 * Print-only letterhead shown at the top of printed statements/reports.
 * Hidden on screen (`.print-only`), rendered inside the .print-area container.
 * Brand dot + BizHub + business name line + generated timestamp, separated by
 * a thin double border. Ink-safe neutral colours for reliable printing.
 */
export function PrintLetterhead({ businessName, title, meta, className }: {
  businessName?: string | null;
  title?: string;
  meta?: string;
  className?: string;
}) {
  const generated = new Date().toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
  return (
    <div
      className={cn("print-only text-neutral-900", className)}
      style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" } as React.CSSProperties}
    >
      <div className="flex items-center justify-between gap-3 border-b-[3px] border-double border-neutral-900 pb-2">
        <p className="flex min-w-0 items-center gap-2 text-sm">
          <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-neutral-900" />
          <span className="font-bold tracking-tight">BizHub</span>
          {businessName && <span className="truncate font-medium text-neutral-600">· {businessName}</span>}
        </p>
        <p className="shrink-0 text-[10px] text-neutral-500">Generated {generated}</p>
      </div>
      {title && <h1 className="mt-3 text-lg font-bold leading-tight">{title}</h1>}
      {meta && <p className="mt-0.5 text-xs text-neutral-600">{meta}</p>}
    </div>
  );
}
