"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/api-client";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ArchiveRestore, FileJson, Loader2 } from "lucide-react";
import { errMessage } from "@/components/views/_shared";

interface BackupFile {
  format: string;
  version?: number;
  generatedAt?: string;
  counts?: Record<string, number>;
  data?: Record<string, unknown[]>;
}

interface RestoreResp {
  ok: boolean;
  created: number;
  skipped: number;
  found: number;
  perCollection: Record<string, { created: number; skipped: number }>;
}

export function BackupRestoreDialog({ onRestored }: { onRestored: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<BackupFile | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [restoring, setRestoring] = useState(false);

  const openFile = async (file: File | null) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as BackupFile;
      if (parsed?.format !== "bizhub-backup" || !parsed.data || typeof parsed.data !== "object") {
        toast.error("This file is not a BizHub backup — pick a JSON file exported from Settings → Data & backup.");
        return;
      }
      setConfirmText("");
      setPending(parsed);
    } catch (e) {
      toast.error(`Could not read the file — ${errMessage(e)}`);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const collectionCounts = Object.entries(pending?.counts ?? {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  const totalRecords = collectionCounts.reduce((s, [, n]) => s + n, 0);
  const generatedLabel = pending?.generatedAt
    ? new Date(pending.generatedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "unknown date";

  const doRestore = async () => {
    if (!pending) return;
    setRestoring(true);
    try {
      const r = await api.post<RestoreResp>("/api/settings/restore", pending);
      toast.success(`Restore complete — created ${r.created}, skipped ${r.skipped}`, {
        duration: 9000,
        description: r.created > 0
          ? "Existing records were never touched. Refreshing to show the restored data…"
          : "Nothing new to import — every record in the file already exists.",
      });
      setPending(null);
      onRestored();
      if (r.created > 0) {
        // Give the toast a beat to be seen, then refresh the SPA data.
        window.setTimeout(() => window.location.reload(), 1600);
      }
    } catch (e) {
      toast.error(errMessage(e));
    } finally {
      setRestoring(false);
    }
  };

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        className="sr-only"
        aria-label="Choose backup JSON file"
        disabled={restoring}
        onChange={(e) => void openFile(e.target.files?.[0] ?? null)}
      />
      <Button variant="outline" className="min-h-10 gap-2" onClick={() => fileRef.current?.click()} disabled={restoring}>
        {restoring ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ArchiveRestore className="h-4 w-4" aria-hidden />}
        Import backup (merge)
      </Button>

      <AlertDialog open={pending !== null} onOpenChange={(v) => { if (!v && !restoring) setPending(null); }}>
        <AlertDialogContent className="max-h-[92dvh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>Restore this backup?</AlertDialogTitle>
            <AlertDialogDescription>
              Generated {generatedLabel} · {totalRecords.toLocaleString("en-IN")} records. Merge import: only
              records that don&apos;t already exist are created — nothing is deleted or updated. Type{" "}
              <span className="font-mono font-bold">RESTORE</span> to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="max-h-48 overflow-y-auto rounded-xl border">
            <ul className="divide-y text-xs">
              {collectionCounts.map(([name, n]) => (
                <li key={name} className="flex items-center justify-between gap-2 px-3 py-1.5">
                  <span className="truncate font-medium capitalize">{name.replace(/([A-Z])/g, " $1").toLowerCase()}</span>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold tabular-nums">{n.toLocaleString("en-IN")}</span>
                </li>
              ))}
            </ul>
          </div>

          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="Type RESTORE"
            aria-label="Type RESTORE to confirm"
            className="h-10 font-mono"
          />

          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoring}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={confirmText.trim().toUpperCase() !== "RESTORE" || restoring}
              onClick={(e) => {
                e.preventDefault();
                void doRestore();
              }}
            >
              {restoring ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FileJson className="h-4 w-4" aria-hidden />}
              Restore (merge)
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
