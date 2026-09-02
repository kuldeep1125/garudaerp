import { db } from "@/lib/db";
import type { SessionOwner } from "@/lib/auth";

// Audit trail helper — every financial mutation must call this.
export async function logAudit(opts: {
  owner: Pick<SessionOwner, "id" | "name">;
  action: string;
  module: string;
  recordId?: string | null;
  recordLabel?: string | null;
  previousValue?: unknown;
  newValue?: unknown;
}) {
  const prev = opts.previousValue === undefined ? undefined : safeJson(opts.previousValue);
  const next = opts.newValue === undefined ? undefined : safeJson(opts.newValue);
  try {
    await db.auditLog.create({
      data: {
        ownerId: opts.owner.id,
        ownerName: opts.owner.name,
        action: opts.action,
        module: opts.module,
        recordId: opts.recordId ?? null,
        recordLabel: opts.recordLabel ?? null,
        previousValue: prev ?? null,
        newValue: next ?? null,
      },
    });
  } catch (e) {
    console.error("[audit] Failed to write audit log", e);
  }
}

function safeJson(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
