"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { History, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { errMessage, useAsync, type ListResp, UNDO_APPLIED_EVENT } from "@/components/views/_shared";

// ---------------------------------------------------------------------------
// Undo Center — quick access to recent audited actions with one-click reverse.
// Data comes from the same audit log as the Audit view; Undo posts
// { auditLogId } to /api/undo, which reverses server-side with zero mismatch.
// ---------------------------------------------------------------------------

interface AuditEntry {
  id: string;
  ownerName: string;
  action: string;
  module: string;
  recordId?: string | null;
  recordLabel?: string | null;
  undoneAt?: string | null;
  createdAt: string;
}

const UNDOABLE_ACTIONS = new Set(["CREATE", "PAYMENT", "STATUS", "UPDATE", "DELETE"]);

const ACTION_TONES: Record<string, string> = {
  CREATE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  UPDATE: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  DELETE: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  UNDO: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  PAYMENT: "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300",
  STATUS: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
};

function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const mins = Math.floor((Date.now() - t) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function UndoCenter({ open, onOpenChange, onChanged }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** called after a successful reversal so hosts can refresh their own data (e.g. bell count) */
  onChanged?: () => void;
}) {
  const { data, loading, reload } = useAsync<ListResp<AuditEntry>>(
    // Only hit the API while the sheet is actually open.
    () => (open ? api.get<ListResp<AuditEntry>>("/api/audit?page=1&pageSize=25") : Promise.resolve({ items: [], total: 0 })),
    [open]
  );
  const [busyId, setBusyId] = useState<string | null>(null);

  const undo = async (row: AuditEntry) => {
    setBusyId(row.id);
    try {
      await api.post("/api/undo", { auditLogId: row.id });
      toast.success("Reversed");
      window.dispatchEvent(new CustomEvent(UNDO_APPLIED_EVENT));
      await reload();
      onChanged?.();
    } catch (e) {
      toast.error(errMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  const items = data?.items ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[400px]">
        <SheetHeader className="border-b bg-muted/30 p-4">
          <SheetTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4 text-primary" aria-hidden />
            Undo center
          </SheetTitle>
          <SheetDescription className="text-xs">
            Your last 25 actions — reverse a mistake with one click.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="p-3">
            {loading && (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-xl" />
                ))}
              </div>
            )}

            {!loading && items.length === 0 && (
              <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
                <div className="rounded-full bg-muted p-3" aria-hidden>
                  <History className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="mt-3 text-sm font-semibold">Nothing to undo yet</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Actions like creating records, payments and deletions appear here and can be reversed.
                </p>
              </div>
            )}

            {!loading && items.length > 0 && (
              <ul className="space-y-2" aria-label="Recent audited actions">
                {items.map((row) => {
                  const undoable = !row.undoneAt && UNDOABLE_ACTIONS.has(row.action);
                  return (
                    <li
                      key={row.id}
                      className={cn(
                        "flex items-center gap-2.5 rounded-xl border bg-card p-3",
                        row.undoneAt && "opacity-60"
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={cn(
                              "inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold",
                              ACTION_TONES[row.action] ?? "bg-muted text-muted-foreground"
                            )}
                          >
                            {row.action}
                          </span>
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {row.module}
                          </span>
                          <span className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground">
                            {relTime(row.createdAt)}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-[13px] font-medium" title={row.recordLabel ?? row.recordId ?? undefined}>
                          {row.recordLabel || row.recordId || "—"}
                        </p>
                      </div>
                      {undoable ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 sm:h-8 shrink-0 gap-1 px-2.5 text-[11px]"
                          disabled={busyId === row.id}
                          onClick={() => void undo(row)}
                          aria-label={`Undo ${row.action.toLowerCase()} on ${row.module}: ${row.recordLabel ?? ""}`}
                        >
                          <Undo2 className={cn("h-3 w-3", busyId === row.id && "animate-spin")} aria-hidden />
                          Undo
                        </Button>
                      ) : row.undoneAt ? (
                        <span className="shrink-0 text-[10px] font-medium text-violet-600 dark:text-violet-400">Reversed</span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
