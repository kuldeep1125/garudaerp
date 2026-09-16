"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatINR } from "@/lib/money";
import {
  GitCommit,
  User,
  Calendar,
  Layers,
  ArrowUpRight,
  ArrowDownLeft,
  ExternalLink,
  ShieldCheck,
  FileCode2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export interface TransactionLineageData {
  id: string;
  title: string;
  type: string;
  amount: number;
  date: string;
  createdAt?: string | null;
  createdByName?: string | null;
  ruleExplanation: string;
  impactedAccounts: Array<{
    account: string;
    type: "debit" | "credit";
    amount: number;
    description: string;
  }>;
  linkedEntities?: Array<{
    label: string;
    name: string;
    onClick?: () => void;
  }>;
  notes?: string | null;
}

interface TransactionLineageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: TransactionLineageData | null;
}

export function TransactionLineageDialog({
  open,
  onOpenChange,
  data,
}: TransactionLineageDialogProps) {
  if (!data) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md sm:max-w-lg p-0 gap-0 overflow-hidden">
        {/* Header with Type & ID */}
        <DialogHeader className="p-5 pb-3 border-b bg-muted/20">
          <div className="flex items-center justify-between gap-2">
            <Badge variant="outline" className="text-[11px] font-semibold tracking-wide uppercase">
              {data.type}
            </Badge>
            <span className="text-[10px] font-mono text-muted-foreground truncate">
              ID: {data.id.slice(0, 16)}…
            </span>
          </div>
          <DialogTitle className="text-lg font-bold mt-1 text-foreground flex items-center gap-2">
            <GitCommit className="h-4 w-4 text-primary shrink-0" />
            <span>{data.title}</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Transaction Lineage & Double-Entry Accounting Impact
          </DialogDescription>
        </DialogHeader>

        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Amount & Date Banner */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-primary/5 border border-primary/15">
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Transaction Amount</p>
              <p className="text-xl font-bold tabular-nums text-foreground mt-0.5">{formatINR(data.amount)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Effective Date</p>
              <p className="text-sm font-semibold text-foreground mt-0.5">{data.date}</p>
            </div>
          </div>

          {/* Audit Origin */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 rounded-lg border bg-card space-y-1">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase flex items-center gap-1">
                <User className="h-3 w-3 text-primary" />
                <span>Recorded By</span>
              </p>
              <p className="font-medium text-foreground">{data.createdByName || "System (Auto-generated)"}</p>
            </div>
            <div className="p-2.5 rounded-lg border bg-card space-y-1">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase flex items-center gap-1">
                <Calendar className="h-3 w-3 text-primary" />
                <span>Timestamp</span>
              </p>
              <p className="font-medium text-foreground truncate">{data.createdAt ? String(data.createdAt).replace("T", " ").slice(0, 19) : data.date}</p>
            </div>
          </div>

          {/* Governing Business Rule */}
          <Card className="border-border/70 shadow-none bg-muted/10">
            <CardContent className="p-3.5 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Governing Rule & Calculation Logic</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {data.ruleExplanation}
              </p>
            </CardContent>
          </Card>

          {/* Double-Entry Ledger Impact */}
          {data.impactedAccounts.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-primary" />
                <span>Ledger & Account Impacts</span>
              </p>
              <div className="border rounded-xl divide-y overflow-hidden text-xs">
                {data.impactedAccounts.map((acc, i) => (
                  <div key={i} className="p-2.5 flex items-center justify-between gap-3 bg-card hover:bg-muted/40 transition-colors">
                    <div className="flex items-start gap-2 min-w-0">
                      {acc.type === "debit" ? (
                        <div className="p-1 rounded bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 shrink-0 mt-0.5">
                          <ArrowUpRight className="h-3 w-3" />
                        </div>
                      ) : (
                        <div className="p-1 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5">
                          <ArrowDownLeft className="h-3 w-3" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground truncate">{acc.account}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{acc.description}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`font-semibold tabular-nums ${acc.type === "debit" ? "text-foreground" : "text-emerald-600 dark:text-emerald-400"}`}>
                        {acc.type === "debit" ? `+${formatINR(acc.amount)}` : `−${formatINR(acc.amount)}`}
                      </p>
                      <span className="text-[10px] uppercase font-bold text-muted-foreground">
                        {acc.type === "debit" ? "Debit" : "Credit"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Linked Entities */}
          {data.linkedEntities && data.linkedEntities.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Connected Entities</p>
              <div className="flex flex-wrap gap-2">
                {data.linkedEntities.map((ent, idx) => (
                  <Button
                    key={idx}
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1.5"
                    onClick={() => {
                      if (ent.onClick) {
                        onOpenChange(false);
                        ent.onClick();
                      }
                    }}
                  >
                    <span className="text-muted-foreground">{ent.label}:</span>
                    <span className="font-semibold">{ent.name}</span>
                    {ent.onClick && <ExternalLink className="h-3 w-3 text-muted-foreground ml-0.5" />}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Notes if any */}
          {data.notes && (
            <div className="p-3 rounded-lg bg-muted/40 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Note: </span>
              {data.notes}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
