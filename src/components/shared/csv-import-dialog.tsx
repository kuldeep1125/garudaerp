"use client";

import { useMemo, useState } from "react";
import { api } from "@/lib/api-client";
import {
  EMPLOYEE_CSV_ALIASES, EMPLOYEE_TEMPLATE_CSV, EXPENSE_CSV_ALIASES, EXPENSE_TEMPLATE_CSV,
  downloadCsvTemplate, headerMap, isValidDateStr, normalizeDateStr, parseCsv, pick, toAmount,
} from "@/lib/csv";
import { formatINR } from "@/lib/money";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { CheckCircle2, Download, FileSpreadsheet, Loader2, Upload, XCircle } from "lucide-react";
import { errMessage } from "@/components/views/_shared";

type ImportType = "expenses" | "employees";

interface RowIssue { row: number; reason: string }
interface ParsedExpense { date: string; business: "MANPOWER" | "TRANSPORT"; amount: number; category: string; method: string; description: string }
interface ParsedEmployee { fullName: string; designation: string; mobile: string; standardRate: number; joiningDate: string; status: string }
type ParsedRow = ParsedExpense | ParsedEmployee;

function normBusiness(v: string): "MANPOWER" | "TRANSPORT" | null {
  const s = v.toLowerCase().replace(/[^a-z]/g, "");
  if (["manpower", "staffing", "staff", "man"].includes(s)) return "MANPOWER";
  if (["transport", "vehicle", "rental", "car", "travel"].includes(s)) return "TRANSPORT";
  return null;
}

function normStatus(v: string): string | null {
  const s = v.toUpperCase();
  return s === "ACTIVE" || s === "INACTIVE" ? s : null;
}

/** Parse + validate the CSV text for the selected import type. */
function parseForType(text: string, type: ImportType): { valid: ParsedRow[]; issues: RowIssue[]; total: number } {
  const { header, rows, totalRows } = parseCsv(text);
  if (header.length === 0) return { valid: [], issues: [{ row: 1, reason: "Empty file — no header row found" }], total: 0 };
  const colFor = headerMap(header, type === "expenses" ? EXPENSE_CSV_ALIASES : EMPLOYEE_CSV_ALIASES);
  const valid: ParsedRow[] = [];
  const issues: RowIssue[] = [];

  rows.forEach((raw, i) => {
    const rowNo = i + 2; // 1-based data row (header is line 1)
    if (type === "expenses") {
      const dateStr = pick(raw, colFor, "date");
      const bizStr = pick(raw, colFor, "business");
      const amtStr = pick(raw, colFor, "amount");
      const date = normalizeDateStr(dateStr);
      const business = normBusiness(bizStr);
      const amount = toAmount(amtStr);
      if (!dateStr) { issues.push({ row: rowNo, reason: "Missing date" }); return; }
      if (!isValidDateStr(dateStr)) { issues.push({ row: rowNo, reason: `Bad date "${dateStr}" — use YYYY-MM-DD` }); return; }
      if (!bizStr) { issues.push({ row: rowNo, reason: "Missing business — MANPOWER or TRANSPORT" }); return; }
      if (!business) { issues.push({ row: rowNo, reason: `Bad business "${bizStr}" — use MANPOWER or TRANSPORT` }); return; }
      if (!amtStr) { issues.push({ row: rowNo, reason: "Missing amount" }); return; }
      if (amount === null) { issues.push({ row: rowNo, reason: `Amount "${amtStr}" is not a number` }); return; }
      if (amount <= 0) { issues.push({ row: rowNo, reason: "Amount must be greater than 0" }); return; }
      valid.push({
        date, business, amount,
        category: pick(raw, colFor, "category"),
        method: pick(raw, colFor, "method"),
        description: pick(raw, colFor, "description"),
      });
    } else {
      const fullName = pick(raw, colFor, "fullName");
      const rateStr = pick(raw, colFor, "standardRate");
      const joining = pick(raw, colFor, "joiningDate");
      const standardRate = toAmount(rateStr);
      if (!fullName) { issues.push({ row: rowNo, reason: "Missing name" }); return; }
      if (!rateStr) { issues.push({ row: rowNo, reason: "Missing rate (₹ per shift)" }); return; }
      if (standardRate === null) { issues.push({ row: rowNo, reason: `Rate "${rateStr}" is not a number` }); return; }
      if (standardRate <= 0) { issues.push({ row: rowNo, reason: "Rate must be greater than 0" }); return; }
      if (joining && !isValidDateStr(joining)) { issues.push({ row: rowNo, reason: `Bad joining date "${joining}" — use YYYY-MM-DD` }); return; }
      valid.push({
        fullName, standardRate,
        designation: pick(raw, colFor, "designation"),
        mobile: pick(raw, colFor, "mobile"),
        joiningDate: joining ? normalizeDateStr(joining) : "",
        status: normStatus(pick(raw, colFor, "status")) ?? "",
      });
    }
  });
  return { valid, issues, total: totalRows };
}

export function CsvImportDialog({ open, onOpenChange, onImported }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImported: () => void;
}) {
  const [type, setType] = useState<ImportType>("expenses");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<{ valid: ParsedRow[]; issues: RowIssue[]; total: number } | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; imported: number } | null>(null);
  const [importing, setImporting] = useState(false);

  const reset = () => { setFileName(""); setPreview(null); setProgress(null); };

  const switchType = (t: ImportType) => { setType(t); reset(); };

  const onFile = async (file: File | null) => {
    if (!file) return;
    setFileName(file.name);
    setProgress(null);
    try {
      const text = await file.text();
      const parsed = parseForType(text, type);
      setPreview(parsed);
    } catch (e) {
      setPreview(null);
      toast.error(`Could not read the file — ${errMessage(e)}`);
    }
  };

  const downloadTemplate = () => {
    downloadCsvTemplate(
      type === "expenses" ? "bizhub-expenses-template.csv" : "bizhub-employees-template.csv",
      type === "expenses" ? EXPENSE_TEMPLATE_CSV : EMPLOYEE_TEMPLATE_CSV,
    );
    toast.success("Template downloaded — fill it and import");
  };

  const importRows = async () => {
    if (!preview || preview.valid.length === 0) return;
    setImporting(true);
    const errors: string[] = [];
    let imported = 0;

    // Category lookup (name → category), used to attach categoryId when the
    // name matches; otherwise the expense is left uncategorized (per spec).
    let cats: { id: string; name: string; business: string }[] = [];
    if (type === "expenses") {
      try {
        cats = (await api.get<{ items: { id: string; name: string; business: string }[] }>("/api/expense-categories")).items;
      } catch { /* resolve nothing — all rows import uncategorized */ }
    }
    const catFor = (name: string, business: string) => {
      const n = name.trim().toLowerCase();
      if (!n) return undefined;
      return cats.find((c) => c.name.trim().toLowerCase() === n && c.business === business)
        ?? cats.find((c) => c.name.trim().toLowerCase() === n && c.business === "COMMON");
    };

    for (let i = 0; i < preview.valid.length; i++) {
      const r = preview.valid[i];
      try {
        if (type === "expenses") {
          const e = r as ParsedExpense;
          const cat = catFor(e.category, e.business);
          await api.post("/api/expenses", {
            date: e.date,
            business: e.business,
            amount: e.amount,
            categoryId: cat?.id,
            method: e.method || undefined,
            description: e.description || undefined,
          });
        } else {
          const emp = r as ParsedEmployee;
          await api.post("/api/employees", {
            fullName: emp.fullName,
            designation: emp.designation || undefined,
            mobile: emp.mobile || undefined,
            standardRate: emp.standardRate,
            joiningDate: emp.joiningDate || undefined,
            status: emp.status || undefined,
          });
        }
        imported++;
      } catch (e) {
        if (errors.length < 3) errors.push(`Row ${i + 1}: ${errMessage(e)}`);
      }
      setProgress({ done: i + 1, total: preview.valid.length, imported });
    }

    setImporting(false);
    const skipped = preview.valid.length - imported;
    toast.success(`Imported ${imported}, skipped ${skipped}`, {
      duration: 9000,
      description: errors.length ? `First errors — ${errors.join(" · ")}` : undefined,
    });
    if (imported > 0) {
      reset();
      onOpenChange(false);
      onImported();
    }
  };

  const previewRows = useMemo(() => preview?.valid.slice(0, 5) ?? [], [preview]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!importing) { onOpenChange(v); if (!v) reset(); } }}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-primary" aria-hidden />
            Import CSV
          </DialogTitle>
          <DialogDescription>
            Bulk-import expenses or employees from a spreadsheet. Download the template first so column names match.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Type selector */}
          <div>
            <p className="mb-1.5 text-xs font-medium text-foreground">Import type</p>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Import type">
              {(["expenses", "employees"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={type === t}
                  onClick={() => switchType(t)}
                  disabled={importing}
                  className={cn(
                    "min-h-10 rounded-xl border px-3 py-2 text-sm font-semibold capitalize transition-all",
                    type === t ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-primary/40",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Template + file picker */}
          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="outline" className="min-h-10 gap-2" onClick={downloadTemplate} disabled={importing}>
              <Download className="h-4 w-4" aria-hidden />
              Download template
            </Button>
            <label
              className={cn(
                "flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-2 text-sm font-medium transition-colors",
                "hover:border-primary/50 hover:bg-primary/5",
              )}
            >
              <FileSpreadsheet className="h-4 w-4 text-primary" aria-hidden />
              <span className="truncate">{fileName || "Choose .csv file"}</span>
              <Input
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                aria-label="Choose CSV file"
                disabled={importing}
                onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>

          {/* Preview */}
          {preview && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-xs" aria-live="polite">
                <span className="rounded-full bg-muted px-2.5 py-1 font-medium">{preview.total} row{preview.total === 1 ? "" : "s"} found</span>
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  {preview.valid.length} valid
                </span>
                {preview.issues.length > 0 && (
                  <span className="rounded-full bg-red-100 px-2.5 py-1 font-semibold text-red-700 dark:bg-red-950 dark:text-red-300">
                    {preview.issues.length} invalid
                  </span>
                )}
              </div>

              {preview.valid.length > 0 && (
                <div className="max-h-48 overflow-y-auto rounded-xl border">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-muted/60">
                      <tr>
                        {type === "expenses" ? (
                          <>
                            <th className="px-2.5 py-1.5 font-semibold">Date</th>
                            <th className="px-2.5 py-1.5 font-semibold">Business</th>
                            <th className="px-2.5 py-1.5 text-right font-semibold">Amount</th>
                            <th className="px-2.5 py-1.5 font-semibold">Category</th>
                          </>
                        ) : (
                          <>
                            <th className="px-2.5 py-1.5 font-semibold">Name</th>
                            <th className="px-2.5 py-1.5 font-semibold">Designation</th>
                            <th className="px-2.5 py-1.5 text-right font-semibold">Rate</th>
                            <th className="px-2.5 py-1.5 font-semibold">Joining</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((r, i) => (
                        <tr key={i} className="border-t">
                          {type === "expenses" ? (
                            <>
                              <td className="px-2.5 py-1.5 tabular-nums">{(r as ParsedExpense).date}</td>
                              <td className="px-2.5 py-1.5">{(r as ParsedExpense).business}</td>
                              <td className="px-2.5 py-1.5 text-right font-semibold tabular-nums">{formatINR((r as ParsedExpense).amount)}</td>
                              <td className="px-2.5 py-1.5 truncate">{(r as ParsedExpense).category || <span className="text-muted-foreground">—</span>}</td>
                            </>
                          ) : (
                            <>
                              <td className="px-2.5 py-1.5 font-medium">{(r as ParsedEmployee).fullName}</td>
                              <td className="px-2.5 py-1.5 truncate">{(r as ParsedEmployee).designation || <span className="text-muted-foreground">—</span>}</td>
                              <td className="px-2.5 py-1.5 text-right font-semibold tabular-nums">{formatINR((r as ParsedEmployee).standardRate)}</td>
                              <td className="px-2.5 py-1.5 tabular-nums">{(r as ParsedEmployee).joiningDate || <span className="text-muted-foreground">—</span>}</td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {preview.valid.length > 5 && (
                    <p className="border-t bg-muted/30 px-2.5 py-1 text-[10px] text-muted-foreground">
                      Showing first 5 of {preview.valid.length} valid rows
                    </p>
                  )}
                </div>
              )}

              {preview.issues.length > 0 && (
                <ul className="max-h-32 space-y-1 overflow-y-auto rounded-xl border border-red-200 bg-red-50/60 p-2 dark:border-red-900 dark:bg-red-950/30" aria-label="Invalid rows">
                  {preview.issues.slice(0, 20).map((iss) => (
                    <li key={iss.row} className="flex items-start gap-1.5 text-[11px] text-red-700 dark:text-red-300">
                      <XCircle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                      <span><span className="font-semibold">Row {iss.row}:</span> {iss.reason}</span>
                    </li>
                  ))}
                  {preview.issues.length > 20 && <li className="pl-5 text-[10px]">…and {preview.issues.length - 20} more</li>}
                </ul>
              )}
            </div>
          )}

          {/* Progress */}
          {importing && progress && (
            <div className="flex items-center gap-2 rounded-xl border bg-muted/40 px-3 py-2 text-xs font-medium" role="status">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" aria-hidden />
              Imported {progress.done} / {progress.total}…
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" className="min-h-10 flex-1 sm:flex-none" onClick={() => onOpenChange(false)} disabled={importing}>
            Cancel
          </Button>
          <Button
            className="min-h-10 flex-1 gap-2 sm:flex-none"
            onClick={() => void importRows()}
            disabled={importing || !preview || preview.valid.length === 0}
          >
            {importing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CheckCircle2 className="h-4 w-4" aria-hidden />}
            {importing ? "Importing…" : `Import ${preview ? preview.valid.length : 0} row${preview?.valid.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
