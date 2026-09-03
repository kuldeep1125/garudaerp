"use client";

import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Command, Keyboard } from "lucide-react";

// ---------------------------------------------------------------------------
// Keyboard shortcuts overlay — opened with "?" from anywhere (or from the
// owner menu). Lists only shortcuts that actually exist in the app.
// ---------------------------------------------------------------------------

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[1.5rem] items-center justify-center rounded border bg-muted px-1.5 py-0.5 text-center font-mono text-[10px] font-semibold text-foreground">
      {children}
    </kbd>
  );
}

function ShortcutRow({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/50">
      <span className="min-w-0 text-[13px] text-foreground/90">{label}</span>
      <span className="flex shrink-0 items-center gap-1" aria-label={keys.join(" then ")}>
        {keys.map((k, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-[10px] text-muted-foreground" aria-hidden>then</span>}
            <Kbd>{k}</Kbd>
          </span>
        ))}
      </span>
    </div>
  );
}

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md" role="dialog" aria-label="Keyboard shortcuts">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-4 w-4 text-primary" aria-hidden />
            Keyboard shortcuts
          </DialogTitle>
          <DialogDescription className="text-xs">
            Move faster — everything here also works from the menus.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <p className="flex items-center gap-1.5 px-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <Command className="h-3 w-3" aria-hidden />General
          </p>
          <ShortcutRow keys={["Ctrl", "K"]} label="Open command palette" />
          <ShortcutRow keys={["?"]} label="This shortcuts help" />
          <ShortcutRow keys={["Esc"]} label="Close dialog or menu" />
        </div>

        <Separator />

        <div className="space-y-1.5">
          <p className="px-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Go to (press G, then…)</p>
          <ShortcutRow keys={["G", "D"]} label="Dashboard" />
          <ShortcutRow keys={["G", "E"]} label="Employees" />
          <ShortcutRow keys={["G", "P"]} label="Properties" />
          <ShortcutRow keys={["G", "T"]} label="Trips" />
        </div>

        <p className="text-[11px] leading-snug text-muted-foreground">
          Shortcuts pause while you type in a field, so <Kbd>G</Kbd> and <Kbd>?</Kbd> are always safe to use.
        </p>
      </DialogContent>
    </Dialog>
  );
}
