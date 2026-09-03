"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-border/80 bg-gradient-to-b from-muted/40 to-transparent px-6 py-12 text-center",
        className
      )}
    >
      {/* soft radial glow — themed, both modes */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(60%_100%_at_50%_0%,color-mix(in_oklab,var(--primary)_9%,transparent),transparent)]"
      />
      {Icon && (
        <div className="relative">
          <div
            aria-hidden
            className="absolute -inset-1.5 rounded-full bg-gradient-to-br from-primary/20 via-accent/30 to-transparent blur-[6px]"
          />
          <div className="relative rounded-full border border-dashed border-primary/30 bg-background p-4 shadow-sm">
            <Icon className="h-7 w-7 text-primary/80" aria-hidden />
          </div>
        </div>
      )}
      <p className="relative mt-4 text-sm font-semibold">{title}</p>
      {description && <p className="relative mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">{description}</p>}
      {action && (
        <Button size="sm" className="relative mt-4 h-9" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
