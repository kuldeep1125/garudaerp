"use client";

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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

  return (
    <>
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
                className={cn(onRowClick && "cursor-pointer")}
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
                "rounded-xl border bg-card p-3",
                onRowClick && "active:bg-muted/60 cursor-pointer transition-colors"
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
