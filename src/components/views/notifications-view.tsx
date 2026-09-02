"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import type { ViewProps } from "@/components/view-types";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  AlertCircle, AlertTriangle, ArrowRight, Bell, BellOff, Info, RefreshCw, X,
} from "lucide-react";
import { errMessage, useAsync, useMutation } from "./_shared";

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

export default function NotificationsView({ navigate }: ViewProps) {
  const { data, loading, error, reload, setData } = useAsync<NotificationRec[]>(
    () => api.get<NotificationRec[]>("/api/notifications"),
    []
  );
  const { mutate } = useMutation();

  const dismiss = async (n: NotificationRec) => {
    const res = await mutate(() => api.post("/api/notifications/dismiss", { key: n.key }));
    if (res.ok) {
      setData((prev) => (prev ?? []).filter((x) => x.key !== n.key));
      toast.success("Notification dismissed");
    }
  };

  const items = data ?? [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Notifications"
        subtitle="Live alerts that need your attention"
        icon={Bell}
        actions={
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => void reload()} disabled={loading}>
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} aria-hidden />
            Refresh
          </Button>
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
            return (
              <section key={g.key} aria-label={`${g.label} notifications`}>
                <div className="mb-2 flex items-center gap-2">
                  <g.icon className={cn("h-4 w-4", g.iconText)} aria-hidden />
                  <h2 className="text-sm font-bold tracking-tight">{g.label}</h2>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums", g.chip)}>
                    {groupItems.length}
                  </span>
                  <span className="hidden text-[11px] text-muted-foreground sm:inline">· {g.hint}</span>
                </div>

                <div className="space-y-2">
                  {groupItems.map((n) => (
                    <Card key={n.key} className="transition-all hover:shadow-sm">
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
                              className="h-8 w-8 text-muted-foreground hover:text-red-600"
                              onClick={() => void dismiss(n)}
                              aria-label={`Dismiss: ${n.title}`}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
