// Minimal, robust client-side CSV parser + row mapping helpers.
// Handles: quoted fields, escaped quotes (""), CRLF/LF line endings, BOM,
// and case-insensitive header aliases. No dependencies.

export interface CsvParseResult {
  header: string[];
  rows: Record<string, string>[];
  /** raw row count excluding the header (includes visually empty lines) */
  totalRows: number;
}

/** Strip BOM, then parse full CSV text into a header + row objects. */
export function parseCsv(text: string): CsvParseResult {
  const clean = text.replace(/^\uFEFF/, "");
  const records = parseRecords(clean);
  if (records.length === 0) return { header: [], rows: [], totalRows: 0 };
  const header = records[0].map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < records.length; i++) {
    const rec = records[i];
    // Skip completely empty lines (trailing newline etc.)
    if (rec.every((c) => c.trim() === "")) continue;
    const row: Record<string, string> = {};
    for (let c = 0; c < header.length; c++) {
      row[header[c]] = (rec[c] ?? "").trim();
    }
    rows.push(row);
  }
  return { header, rows, totalRows: rows.length };
}

/** RFC-4180-style record tokenizer: quotes, "" escapes, \r\n and \n. */
function parseRecords(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  const pushField = () => { record.push(field); field = ""; };
  const pushRecord = () => { pushField(); records.push(record); record = []; };

  while (i < n) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"' && field === "") { inQuotes = true; i++; continue; }
    if (ch === ",") { pushField(); i++; continue; }
    if (ch === "\r") { if (text[i + 1] === "\n") i++; pushRecord(); i++; continue; }
    if (ch === "\n") { pushRecord(); i++; continue; }
    field += ch; i++;
  }
  // Final record when the file does not end with a newline
  if (field !== "" || record.length > 0) pushRecord();
  return records;
}

// ---------------------------------------------------------------------------
// Header alias mapping — canonical field → accepted column names (normalized)
// ---------------------------------------------------------------------------

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export type CsvAliases = Record<string, string[]>;

/** Build a canonical-field → header-column lookup from alias sets.
 *  (pick() consumes it as colForField[field] → column name.) */
export function headerMap(header: string[], aliases: CsvAliases): Record<string, string> {
  const map: Record<string, string> = {};
  for (const col of header) {
    const norm = normalize(col);
    for (const [field, list] of Object.entries(aliases)) {
      if (list.map(normalize).includes(norm)) {
        if (!map[field]) map[field] = col; // first matching column wins
        break;
      }
    }
  }
  return map;
}

/** Read a canonical field's raw string value out of a parsed row. */
export function pick(row: Record<string, string>, colForField: Record<string, string>, field: string): string {
  const col = colForField[field];
  return col ? (row[col] ?? "").trim() : "";
}

// ---------------------------------------------------------------------------
// Validation helpers — produce human-readable reasons for the preview table
// ---------------------------------------------------------------------------

export function isValidDateStr(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    // also accept DD-MM-YYYY / DD/MM/YYYY
    const m = v.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (!m) return false;
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    return !Number.isNaN(d.getTime()) && Number(m[2]) >= 1 && Number(m[2]) <= 12;
  }
  const d = new Date(`${v}T00:00:00`);
  return !Number.isNaN(d.getTime());
}

/** Normalize accepted date formats to ISO YYYY-MM-DD. */
export function normalizeDateStr(v: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = v.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) {
    return `${m[3]}-${String(Number(m[2])).padStart(2, "0")}-${String(Number(m[1])).padStart(2, "0")}`;
  }
  return v;
}

export function toAmount(v: string): number | null {
  const n = Number(v.replace(/,/g, ""));
  return Number.isFinite(n) && v !== "" ? n : null;
}

// ---------------------------------------------------------------------------
// Templates (client-side blob download)
// ---------------------------------------------------------------------------

export function downloadCsvTemplate(filename: string, csv: string) {
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const EXPENSE_CSV_ALIASES: CsvAliases = {
  date: ["date"],
  business: ["business"],
  amount: ["amount", "amt", "value", "total"],
  category: ["category", "categoryname", "category_name", "expensetype", "type"],
  method: ["method", "paymentmethod", "payment_method", "paidby", "mode"],
  description: ["description", "desc", "notes", "note", "particulars", "details", "remark"],
};

export const EMPLOYEE_CSV_ALIASES: CsvAliases = {
  fullName: ["fullname", "full_name", "name", "employeename", "employee_name"],
  designation: ["designation", "role", "jobtitle", "job_title", "title", "post"],
  mobile: ["mobile", "phone", "phoneno", "contact", "mobilenumber", "mobile_number"],
  standardRate: ["standardrate", "standard_rate", "rate", "pay", "wage", "salary", "payout", "payoutRate", "payout_rate", "perShift", "per_shift"],
  joiningDate: ["joiningdate", "joining_date", "dateofjoining", "doj", "join_date"],
  status: ["status"],
};

export const EXPENSE_TEMPLATE_CSV = [
  "Date,Business,Amount,Category,Method,Description",
  "2025-01-15,MANPOWER,1500,Tea & Snacks,Cash,Evening refreshments for deployed staff",
  "2025-01-16,TRANSPORT,2500,Diesel,UPI,Tata 407 fuel top-up",
  "2025-01-17,TRANSPORT,900,Parking,Cash,Airport parking charges",
].join("\n");

export const EMPLOYEE_TEMPLATE_CSV = [
  "FullName,Designation,Mobile,StandardRate,JoiningDate",
  "Ramesh Kumar,Cook,9876543210,450,2025-01-01",
  "Suresh Patel,Driver,9812345678,500,2025-02-15",
  "Anita Sharma,Housekeeping,,400,2025-03-10",
].join("\n");
