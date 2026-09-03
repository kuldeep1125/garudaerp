"use client";

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { Checkbox } from "@/components/ui/checkbox";
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
  /** pin the leading column while the table scrolls horizontally (wide tables) */
  stickyFirstCol?: boolean;
  /** when set, a selection checkbox column is shown (desktop) and each mobile
   *  card gets a checkbox; pair with selectedIds + onSelectedChange */
  selectKey?: (row: T) => string;
  selectedIds?: Set<string>;
  onSelectedChange?: (ids: Set<string>) => void;
  /** sticky bottom action bar, rendered while the selection is non-empty */
  bulkBar?: (ids: string[]) => React.ReactNode;
}

function csvEscape(v: string): string {
  // quote everything containing separator/quote/newline; double embedded quotes
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

/** Shared with views so bulk bars can export exactly the selected rows. */
export function downloadCsv<T>(name: string, columns: Column<T>[], rows: T[]) {
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
  stickyFirstCol,
  selectKey,
  selectedIds,
  onSelectedChange,
  bulkBar,
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

  // Selection (opt-in via selectKey) — checkbox-only, never row-click.
  const selectionEnabled = Boolean(selectKey && selectedIds && onSelectedChange);
  const allKeys = selectKey ? rows.map((row) => selectKey(row)).filter(Boolean) : [];
  const toggleRow = (key: string) => {
    if (!selectedIds || !onSelectedChange) return;
    const next = new Set(selectedIds);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onSelectedChange(next);
  };
  const toggleAll = () => {
    if (!onSelectedChange) return;
    if (allKeys.length > 0 && allKeys.every((k) => selectedIds?.has(k))) {
      onSelectedChange(new Set());
    } else {
      onSelectedChange(new Set(allKeys));
    }
  };
  const allSelected = selectionEnabled && allKeys.length > 0 && allKeys.every((k) => selectedIds?.has(k));
  const someSelected = !allSelected && selectionEnabled && allKeys.some((k) => selectedIds?.has(k));
  const selectedRowIds = selectionEnabled ? allKeys.filter((k) => selectedIds?.has(k)) : [];

  const selectHeader = selectKey ? (
    <TableHead className="w-10 whitespace-nowrap pr-0">
      {selectionEnabled ? (
        <Checkbox
          checked={allSelected || (someSelected && "indeterminate")}
          onCheckedChange={toggleAll}
          aria-label={allSelected ? "Deselect all rows" : "Select all rows"}
        />
      ) : null}
    </TableHead>
  ) : null;

  const bulkBarNode =
    selectionEnabled && selectedRowIds.length > 0 && bulkBar ? (
      <div
        role="toolbar"
        aria-label="Bulk actions"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-3 md:bottom-5"
      >
        <div className="pointer-events-auto flex items-center gap-1.5 rounded-2xl border bg-card/95 p-2 shadow-lg backdrop-blur sm:gap-2">
          {bulkBar(selectedRowIds)}
        </div>
      </div>
    ) : null;

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
      {bulkBarNode}
      {/* Desktop table */}
      <div className={cn("hidden md:block overflow-x-auto rounded-xl border scroll-shadows", className)}>
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/60 hover:bg-muted/60 border-b">
              {selectHeader}
              {columns.map((c, i) => (
                <TableHead
                  key={c.key}
                  className={cn(
                    "whitespace-nowrap text-[11px] font-semibold uppercase tracking-wide text-muted-foreground",
                    stickyFirstCol && i === 0 && !selectKey && "sticky left-0 z-10 bg-muted/95 shadow-[1px_0_0_0_var(--border)]",
                    stickyFirstCol && selectKey && i === 0 && "sticky left-10 z-10 bg-muted/95 shadow-[1px_0_0_0_var(--border)]",
                    c.className
                  )}
                >{c.label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const rowId = selectKey?.(row);
              const checked = selectionEnabled && rowId !== undefined && selectedIds?.has(rowId);
              return (
              <TableRow
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                data-selected={checked || undefined}
                className={cn(
                  onRowClick && "cursor-pointer",
                  stickyFirstCol && "group/row",
                  checked && "bg-primary/5",
                  // hover accent: 2px primary bar on the leading cell
                  "[&>td:first-child]:border-l-2 [&>td:first-child]:border-l-transparent [&>td:first-child]:transition-colors",
                  onRowClick && "hover:[&>td:first-child]:border-l-primary/50"
                )}
              >
                {selectKey && (
                  <TableCell
                    className="w-10 py-2.5 pr-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {selectionEnabled && rowId !== undefined ? (
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleRow(rowId)}
                        aria-label={`Select row ${allKeys.indexOf(rowId) + 1}`}
                      />
                    ) : null}
                  </TableCell>
                )}
                {columns.map((c, i) => (
                  <TableCell
                    key={c.key}
                    className={cn(
                      "py-2.5 tabular-nums",
                      stickyFirstCol && i === 0 && (selectKey ? "sticky left-10" : "sticky left-0") && "z-10 bg-card group-hover/row:bg-muted/50 shadow-[1px_0_0_0_var(--border)]",
                      c.className
                    )}
                  >
                    {c.render ? c.render(row) : (c.value?.(row) ?? String((row as Record<string, unknown>)[c.key] ?? ""))}
                  </TableCell>
                ))}
              </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {footer}
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {rows.map((row) => {
          const primaryCol = columns.find((c) => c.primary) ?? columns[0];
          const rest = columns.filter((c) => c !== primaryCol && !c.hideOnMobile);
          const rowId = selectKey?.(row);
          const checked = selectionEnabled && rowId !== undefined && selectedIds?.has(rowId);
          return (
            <div
              key={rowKey(row)}
              className={cn(
                "relative rounded-xl border bg-card p-3 transition-colors",
                onRowClick && "active:bg-muted/60 cursor-pointer",
                onRowClick && "before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-primary/50 before:opacity-0 before:transition-opacity active:before:opacity-100",
                checked && "border-primary/50 bg-primary/5"
              )}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              role={onRowClick ? "button" : undefined}
            >
              <div className="flex items-start justify-between gap-2">
                {selectKey && (
                  <span
                    className="flex shrink-0 items-center pt-0.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {selectionEnabled && rowId !== undefined ? (
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleRow(rowId)}
                        aria-label="Select row"
                      />
                    ) : null}
                  </span>
                )}
                <div className="min-w-0 flex-1 font-medium text-sm">
                  {primaryCol.render ? primaryCol.render(row) : (primaryCol.value?.(row) ?? String((row as Record<string, unknown>)[primaryCol.key] ?? ""))}
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
                {rest.map((c) => (
                  <div key={c.key} className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{c.label}</p>
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
