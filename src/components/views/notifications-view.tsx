"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/api-client";
import type { ViewProps } from "@/components/view-types";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  AlertCircle, AlertTriangle, ArrowRight, Bell, BellOff, Eye, EyeOff, Info, RefreshCw, Trash2, X,
} from "lucide-react";
import { errMessage, useAsync, useMutation } from "./_shared";
import { readMutedGroups, writeMutedGroups, NOTIF_MUTED_EVENT, NOTIF_CHANGED_EVENT } from "@/lib/notif-mute";

// ---------------------------------------------------------------------------
// Notification shape (GET /api/notifications → Notification[])
// ---------------------------------------------------------------------------

interface NotificationRec {
  key: string;
  severity: "INFO" | "WARNING" | "CRITICAL" | string;
  title: string;
  message: string;
  view: string;
  params?: Record<string, string> | null;
}

const GROUPS = [
  {
    key: "CRITICAL",
    label: "Critical",
    hint: "Needs immediate action",
    icon: AlertCircle,
    iconText: "text-red-600 dark:text-red-400",
    iconWrap: "bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400",
    chip: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  },
  {
    key: "WARNING",
    label: "Warning",
    hint: "Follow up soon",
    icon: AlertTriangle,
    iconText: "text-amber-600 dark:text-amber-400",
    iconWrap: "bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400",
    chip: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  },
  {
    key: "INFO",
    label: "Info",
    hint: "Good to know",
    icon: Info,
    iconText: "text-zinc-600 dark:text-zinc-300",
    iconWrap: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
    chip: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  },
] as const;

// ---------------------------------------------------------------------------
// Mobile swipe-to-dismiss — drag a card left past 72px to dismiss it.
// Mobile-only (guarded per touch via matchMedia): md+ keeps the X button as
// the dismiss path. Below the threshold the card springs back; the spring has
// no transition when the user prefers reduced motion.
// ---------------------------------------------------------------------------

const SWIPE_DISMISS_PX = 72;

function SwipeDismissCard({ onDismiss, children }: { onDismiss: () => void; children: React.ReactNode }) {
  const [swipe, setSwipe] = useState<{ dx: number; dragging: boolean } | null>(null);
  const startX = useRef(0);
  const startY = useRef(0);
  const horizontal = useRef(false);

  const onTouchStart = (e: React.TouchEvent) => {
    // Desktop/tablet (md+) never swipes — the X button is the dismiss path.
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches) return;
    const t = e.touches[0];
    startX.current = t.clientX;
    startY.current = t.clientY;
    horizontal.current = false;
    setSwipe({ dx: 0, dragging: true });
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!swipe?.dragging) return;
    const t = e.touches[0];
    const dx = t.clientX - startX.current;
    const dy = t.clientY - startY.current;
    if (!horizontal.current) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      // Lock to horizontal gestures; vertical ones keep scrolling the page.
      if (Math.abs(dx) <= Math.abs(dy)) {
        setSwipe(null);
        return;
      }
      horizontal.current = true;
    }
    const d = Math.min(0, dx); // left swipe only
    const eased = d < -120 ? -120 + (d + 120) * 0.25 : d; // resistance past 120px
    setSwipe({ dx: eased, dragging: true });
  };

  const onTouchEnd = () => {
    if (swipe && swipe.dx < -SWIPE_DISMISS_PX) {
      setSwipe(null);
      onDismiss(); // same handler as the X button
      return;
    }
    setSwipe((cur) => (cur ? { dx: 0, dragging: false } : null)); // spring back
  };

  const reduceMotion =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Red action layer revealed behind the card while swiping left */}
      <div
        aria-hidden
        className="absolute inset-0 flex items-center justify-end rounded-xl bg-red-600 pr-5 text-white"
      >
        <Trash2 className="h-5 w-5" />
      </div>
      <div
        className={cn(
          "relative touch-pan-y",
          !swipe?.dragging && !reduceMotion && "transition-transform duration-200 ease-out"
        )}
        style={{ transform: `translateX(${swipe?.dx ?? 0}px)` }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}

export default function NotificationsView({ navigate }: ViewProps) {
  const { data, loading, error, reload } = useAsync<NotificationRec[]>(
    () => api.get<NotificationRec[]>("/api/notifications"),
    []
  );
  const { mutate } = useMutation();
  // Muted categories (severity group keys) — localStorage-backed, updated via
  // event handlers only (no state-in-effect).
  const [muted, setMuted] = useState<string[]>(() => readMutedGroups());
  const [confirmDismiss, setConfirmDismiss] = useState<{ keys: string[]; label: string } | null>(null);

  const items = data ?? [];

  const dismiss = async (n: NotificationRec) => {
    const res = await mutate(() => api.post("/api/notifications/dismiss", { key: n.key }));
    if (res.ok) {
      toast.success("Notification dismissed");
      window.dispatchEvent(new CustomEvent(NOTIF_CHANGED_EVENT));
      void reload();
    }
  };

  // Dismiss a set of notifications: loop the per-key endpoint client-side
  // (no bulk endpoint exists), then a single reload.
  const dismissMany = async (targets: NotificationRec[]) => {
    const results = await Promise.allSettled(
      targets.map((n) => api.post("/api/notifications/dismiss", { key: n.key }))
    );
    const ok = results.filter((r) => r.status === "fulfilled").length;
    if (ok > 0) {
      toast.success(`Dismissed ${ok} notification${ok === 1 ? "" : "s"}`);
      window.dispatchEvent(new CustomEvent(NOTIF_CHANGED_EVENT));
      void reload();
    } else {
      toast.error("Couldn't dismiss notifications");
    }
  };

  const requestDismissAll = (targets: NotificationRec[], label: string) => {
    if (targets.length === 0) return;
    if (targets.length > 3) {
      setConfirmDismiss({ keys: targets.map((n) => n.key), label });
      return;
    }
    void dismissMany(targets);
  };

  const toggleMute = (groupKey: string) => {
    const next = muted.includes(groupKey) ? muted.filter((m) => m !== groupKey) : [...muted, groupKey];
    setMuted(next);
    writeMutedGroups(next);
    toast.success(
      muted.includes(groupKey)
        ? "Category unmuted — alerts will show again"
        : "Category muted — the bell won't count these alerts"
    );
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Notifications"
        subtitle="Live alerts that need your attention"
        icon={Bell}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => void reload()} disabled={loading}>
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} aria-hidden />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5"
              onClick={() => requestDismissAll(items, "all notifications")}
              disabled={items.length === 0}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
              Dismiss all
            </Button>
          </div>
        }
      />

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50/60 p-4 text-center dark:border-red-900 dark:bg-red-950/30">
          <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
          <Button variant="outline" size="sm" className="mt-2 h-8" onClick={() => void reload()}>Retry</Button>
        </div>
      )}

      {loading && !error && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <EmptyState
          icon={BellOff}
          title="All clear — nothing needs attention"
          description="Live alerts about pending payments, advances, settlements, EMI due dates, expiries and more will appear here."
          action={{ label: "Refresh", onClick: () => void reload() }}
        />
      )}

      {!loading && !error && items.length > 0 && (
        <div className="space-y-5">
          {GROUPS.map((g) => {
            const groupItems = items.filter((n) => n.severity === g.key);
            if (groupItems.length === 0) return null;
            const isMuted = muted.includes(g.key);

            // Muted category — collapsed to a one-line chip; click to show again.
            if (isMuted) {
              return (
                <section key={g.key} aria-label={`${g.label} notifications (muted)`}>
                  <button
                    type="button"
                    onClick={() => toggleMute(g.key)}
                    className={cn(
                      "flex min-h-[44px] w-full items-center gap-2 rounded-xl border border-dashed bg-muted/30 px-3.5 py-2 text-left",
                      "text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    )}
                  >
                    <EyeOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span className="text-xs font-medium">
                      {g.label} category muted
                    </span>
                    <span className="ml-auto text-xs font-semibold text-primary">Show</span>
                  </button>
                </section>
              );
            }

            return (
              <section key={g.key} aria-label={`${g.label} notifications`}>
                <div className="mb-2 flex items-center gap-2">
                  <g.icon className={cn("h-4 w-4", g.iconText)} aria-hidden />
                  <h2 className="text-sm font-bold tracking-tight">{g.label}</h2>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums", g.chip)}>
                    {groupItems.length}
                  </span>
                  <span className="hidden text-[11px] text-muted-foreground sm:inline">· {g.hint}</span>
                  <div className="ml-auto flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 sm:h-8 sm:w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => toggleMute(g.key)}
                      aria-label={`Mute ${g.label} notifications`}
                      title={`Mute ${g.label} notifications`}
                    >
                      <EyeOff className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1 px-2.5 text-xs text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
                      onClick={() => requestDismissAll(groupItems, `${g.label.toLowerCase()} notifications`)}
                      aria-label={`Dismiss all ${g.label.toLowerCase()} notifications`}
                    >
                      <X className="h-3.5 w-3.5" aria-hidden />
                      Dismiss all
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  {groupItems.map((n) => (
                    <SwipeDismissCard key={n.key} onDismiss={() => void dismiss(n)}>
                      <Card className="transition-all hover:shadow-sm">
                        <CardContent className="p-3 sm:p-4">
                          <div className="flex items-start gap-3">
                            <div className={cn("shrink-0 rounded-lg p-2", g.iconWrap)} aria-hidden>
                              <g.icon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold leading-snug">{n.title}</p>
                              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{n.message}</p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 gap-1 px-2.5 text-xs"
                                onClick={() => navigate(n.view, n.params ?? {})}
                              >
                                View<ArrowRight className="h-3.5 w-3.5" aria-hidden />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-9 w-9 sm:h-8 sm:w-8 text-muted-foreground hover:text-red-600"
                                onClick={() => void dismiss(n)}
                                aria-label={`Dismiss: ${n.title}`}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </SwipeDismissCard>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <AlertDialog open={Boolean(confirmDismiss)} onOpenChange={(v) => !v && setConfirmDismiss(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dismiss {confirmDismiss?.label ? confirmDismiss.label : "these notifications"}?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDismiss?.keys.length ?? 0} alert{confirmDismiss?.keys.length === 1 ? "" : "s"} will be dismissed permanently — they stop resurfacing in the bell and here. Dismissals are audit-logged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-10">Keep them</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-10"
              onClick={(e) => {
                e.preventDefault();
                const keys = confirmDismiss?.keys ?? [];
                setConfirmDismiss(null);
                void dismissMany(items.filter((n) => keys.includes(n.key)));
              }}
            >
              Dismiss all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
