"use client";

import { api } from "@/lib/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Building2, Check, ChevronRight, Users, CalendarCheck, Sparkles } from "lucide-react";
import { useAsync } from "@/components/views/_shared";

// ---------------------------------------------------------------------------
// First-run onboarding checklist (dashboard) — appears until the business has
// at least one property, one employee and one deployment. Clean, token-only.
// ---------------------------------------------------------------------------

interface OnboardingResp {
  properties: number;
  employees: number;
  deployments: number;
  payments: number;
}

const STEPS: {
  key: keyof OnboardingResp;
  title: string;
  hint: string;
  view: string;
  icon: typeof Building2;
}[] = [
  { key: "properties", title: "Add your first property", hint: "Restaurants or venues you staff — with a fixed billing rate per shift.", view: "properties", icon: Building2 },
  { key: "employees", title: "Add employees", hint: "Your workforce, each with a fixed payout rate per shift.", view: "employees", icon: Users },
  { key: "deployments", title: "Deploy staff to a property", hint: "Mark who worked where and which shift — billing is priced automatically.", view: "deployments", icon: CalendarCheck },
];

export function OnboardingChecklist({ navigate }: { navigate: (view: string, params?: Record<string, string>) => void }) {
  const { data, loading } = useAsync<OnboardingResp>(() => api.get<OnboardingResp>("/api/dashboard/onboarding"), []);

  if (loading) {
    return <Skeleton className="h-28 w-full rounded-2xl" />;
  }

  // Hide entirely once every step has been completed at least once.
  if (!data || (data.properties > 0 && data.employees > 0 && data.deployments > 0)) return null;

  const doneCount = STEPS.filter((s) => data[s.key] > 0).length;

  return (
    <Card
      role="region"
      aria-label="Getting started checklist"
      className="border-primary/25 bg-gradient-to-br from-primary/[0.06] via-card to-card"
    >
      <CardContent className="p-4 sm:p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary" aria-hidden>
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-bold tracking-tight">Get BizHub ready</h2>
              <p className="text-[11px] text-muted-foreground">
                {doneCount} of {STEPS.length} steps done — you can hide this by finishing setup.
              </p>
            </div>
          </div>
          <span
            className="shrink-0 rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-bold tabular-nums text-primary"
            aria-hidden
          >
            {Math.round((doneCount / STEPS.length) * 100)}%
          </span>
        </div>

        <ol className="grid gap-2 sm:grid-cols-3">
          {STEPS.map((step, i) => {
            const done = data[step.key] > 0;
            return (
              <li key={step.key}>
                <button
                  type="button"
                  onClick={() => navigate(step.view)}
                  aria-label={
                    done
                      ? `${step.title} — done, open ${step.view}`
                      : `Step ${i + 1}: ${step.title} — go to ${step.view}`
                  }
                  className={cn(
                    "group flex w-full items-center gap-2.5 rounded-xl border bg-card p-3 text-left transition-all min-h-[44px]",
                    "hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                    done && "opacity-90"
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold transition-colors",
                      done
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : "border-dashed border-muted-foreground/40 text-muted-foreground"
                    )}
                  >
                    {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-[13px] font-semibold", done && "text-muted-foreground line-through decoration-emerald-500/60")}>
                      {step.title}
                    </span>
                    <span className="block truncate text-[11px] leading-snug text-muted-foreground">{step.hint}</span>
                  </span>
                  <ChevronRight
                    className="h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                    aria-hidden
                  />
                </button>
              </li>
            );
          })}
        </ol>

        <p className="mt-3 text-[11px] text-muted-foreground">
          Tip: the <Button variant="link" className="h-auto p-0 text-[11px] font-medium" onClick={() => navigate("deployments")}>Deploy wizard</Button>{" "}
          prices everything automatically once rates are set — nothing to calculate by hand.
        </p>
      </CardContent>
    </Card>
  );
}
