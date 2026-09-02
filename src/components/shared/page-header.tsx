"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowLeft, type LucideIcon } from "lucide-react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  onBack?: () => void;
  actions?: React.ReactNode;
  className?: string;
}

// Page title block with optional back button and actions. Touch-friendly.
export function PageHeader({ title, subtitle, icon: Icon, onBack, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", className)}>
      <div className="flex items-center gap-3 min-w-0">
        {onBack && (
          <Button variant="outline" size="icon" onClick={onBack} aria-label="Go back" className="h-10 w-10 shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        {Icon && !onBack && (
          <div className="rounded-xl bg-primary/10 p-2 shrink-0">
            <Icon className="h-5 w-5 text-primary" aria-hidden />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-bold tracking-tight truncate">{title}</h1>
          {subtitle && <p className="text-xs sm:text-sm text-muted-foreground truncate">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 overflow-x-auto pb-0.5 -mx-1 px-1 sm:pb-0">{actions}</div>}
    </div>
  );
}
