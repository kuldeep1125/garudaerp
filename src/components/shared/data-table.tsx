"use client";

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface Column<T> {
  key: string;
  label: string;
  render?: (row: T) => React.ReactNode;
  /** plain text used for mobile card line + CSV fallback */
  value?: (row: T) => string;
  className?: string;
  hideOnMobile?: boolean;
  /** show this column as the mobile card title (defaults to first column) */
  primary?: boolean;
  /** exclude this column from CSV export (e.g. action arrows) */
  excludeFromExport?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  emptyIcon?: LucideIcon;
  emptyTitle?: string;
  emptyDescription?: string;
  loading?: boolean;
  footer?: React.ReactNode;
  className?: string;
  /** file base name (without .csv) — when set, an Export CSV toolbar appears */
  exportName?: string;
}

function csvEscape(v: string): string {
  // quote everything containing separator/quote/newline; double embedded quotes
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function downloadCsv<T>(name: string, columns: Column<T>[], rows: T[]) {
  const cols = columns.filter((c) => c.label && !c.excludeFromExport);
  const header = cols.map((c) => csvEscape(c.label)).join(",");
  const lines = rows.map((row) =>
    cols
      .map((c) => {
        const v = c.value?.(row);
        return csvEscape(v ?? String((row as Record<string, unknown>)[c.key] ?? ""));
      })
      .join(",")
  );
  // BOM so Excel opens Devanagari/₹ text correctly
  const blob = new Blob(["\uFEFF" + header + "\n" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Responsive data table: proper <table> on md+ screens, stacked cards on mobile.
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  emptyIcon,
  emptyTitle = "Nothing here yet",
  emptyDescription,
  loading,
  footer,
  className,
  exportName,
}: DataTableProps<T>) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    );
  }
  if (rows.length === 0) {
    return <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} />;
  }

  const exportBtn = exportName ? (
    <div className="mb-2 flex justify-end">
      <button
        type="button"
        onClick={() => downloadCsv(exportName, columns, rows)}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border bg-background px-2.5 text-[11px] font-medium text-muted-foreground shadow-sm transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        aria-label={`Download ${rows.length} rows as CSV`}
      >
        <Download className="h-3.5 w-3.5" aria-hidden />
        Export CSV
        <span className="tabular-nums text-muted-foreground/70">({rows.length})</span>
      </button>
    </div>
  ) : null;

  return (
    <>
      {exportBtn}
      {/* Desktop table */}
      <div className={cn("hidden md:block overflow-x-auto rounded-xl border", className)}>
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              {columns.map((c) => (
                <TableHead key={c.key} className={cn("whitespace-nowrap", c.className)}>{c.label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  onRowClick && "cursor-pointer",
                  // hover accent: 2px primary bar on the leading cell
                  "[&>td:first-child]:border-l-2 [&>td:first-child]:border-l-transparent [&>td:first-child]:transition-colors",
                  onRowClick && "hover:[&>td:first-child]:border-l-primary/50"
                )}
              >
                {columns.map((c) => (
                  <TableCell key={c.key} className={cn("py-2.5", c.className)}>
                    {c.render ? c.render(row) : (c.value?.(row) ?? String((row as Record<string, unknown>)[c.key] ?? ""))}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {footer}
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {rows.map((row) => {
          const primaryCol = columns.find((c) => c.primary) ?? columns[0];
          const rest = columns.filter((c) => c !== primaryCol && !c.hideOnMobile);
          return (
            <div
              key={rowKey(row)}
              className={cn(
                "relative rounded-xl border bg-card p-3 transition-colors",
                onRowClick && "active:bg-muted/60 cursor-pointer",
                onRowClick && "before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-primary/50 before:opacity-0 before:transition-opacity active:before:opacity-100"
              )}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              role={onRowClick ? "button" : undefined}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 font-medium text-sm">
                  {primaryCol.render ? primaryCol.render(row) : (primaryCol.value?.(row) ?? String((row as Record<string, unknown>)[primaryCol.key] ?? ""))}
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
                {rest.map((c) => (
                  <div key={c.key} className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{c.label}</p>
                    <div className="text-[13px] tabular-nums">
                      {c.render ? c.render(row) : (c.value?.(row) ?? String((row as Record<string, unknown>)[c.key] ?? ""))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {footer}
      </div>
    </>
  );
}
