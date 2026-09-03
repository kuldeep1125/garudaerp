"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface ViewFabProps {
  icon: LucideIcon;
  /** Accessible name — also the tooltip. */
  label: string;
  onClick: () => void;
}

/**
 * Contextual mobile FAB — an alternate, thumb-reachable trigger for the view's
 * primary create action (same handler as the page-header button).
 *
 * Visible ONLY below md (the bottom nav's range): on md+ the header button is
 * always on screen, so the FAB would be redundant clutter. Sits above the
 * bottom nav (which is 4.5rem tall + safe-area inset) on the right edge.
 */
export function ViewFab({ icon: Icon, label, onClick }: ViewFabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 md:hidden",
        "flex h-14 w-14 items-center justify-center rounded-full",
        "bg-primary text-primary-foreground shadow-lg",
        "transition-transform duration-150 hover:scale-105 active:scale-95",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      )}
    >
      <Icon className="h-6 w-6" aria-hidden />
    </button>
  );
}
