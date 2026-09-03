// Self-contained A4 payslip HTML generator (opens in a new window and prints).
// Inline CSS only + system fonts so it renders identically in Chromium print.
// The ₹ formatter replicates formatINR() logic (non-compact path) because the
// print window is a separate document that cannot import app modules.

export interface PayslipDay {
  date: string;
  propertyName: string;
  shift: string;
  payoutRate: number;
  earnings: number;
}

export interface PayslipData {
  businessName: string | null;
  employee: { fullName: string; code: string | null; designation: string | null };
  periodLabel: string;
  days: PayslipDay[];
  dayTotals: { daysWorked: number; shifts: number; earnings: number };
  advances: number;
  netPayable: number;
}

/** Mirror of formatINR() (non-compact, no decimals) — kept in sync with src/lib/money.ts. */
function inr(n: number): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "₹0";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  return `${sign}₹${abs.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtDay(v: string): string {
  const d = new Date(v.length === 10 ? `${v}T00:00:00` : v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function shiftLabel(s: string): string {
  const u = (s || "").toUpperCase();
  return u === "NIGHT" ? "Night" : u === "FULL" ? "Full (D+N)" : "Day";
}

export function buildPayslipHtml(data: PayslipData): string {
  const generated = new Date().toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
  const business = data.businessName?.trim() || "";
  const e = data.employee;
  const hasAdvances = data.advances > 0.005;

  const rowsHtml = data.days.map((d) => `
    <tr>
      <td class="num">${esc(fmtDay(d.date))}</td>
      <td>${esc(d.propertyName)}</td>
      <td>${esc(shiftLabel(d.shift))}</td>
      <td class="num right">${esc(inr(d.payoutRate))}</td>
      <td class="num right strong">${esc(inr(d.earnings))}</td>
    </tr>`).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Payslip — ${esc(e.fullName)} (${esc(e.code ?? "")})</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
    color: #171717; font-size: 12px; line-height: 1.45;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .sheet { max-width: 800px; margin: 0 auto; padding: 24px 28px; }
  .letterhead { display: flex; justify-content: space-between; align-items: center; gap: 12px;
    border-bottom: 3px double #171717; padding-bottom: 8px; }
  .brand { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .dot { width: 10px; height: 10px; border-radius: 999px; background: #171717; flex: none; }
  .brand b { font-size: 14px; letter-spacing: -0.01em; }
  .brand span { color: #525252; font-weight: 600; }
  .generated { color: #737373; font-size: 10px; white-space: nowrap; }
  h1 { font-size: 18px; margin: 14px 0 2px; }
  .period { color: #525252; font-size: 12px; margin: 0 0 14px; }
  .emp { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;
    border-bottom: 1px solid #d4d4d4; padding: 10px 0 12px; }
  .emp .k { font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em; color: #737373; margin: 0 0 2px; }
  .emp .v { font-weight: 700; font-size: 13px; margin: 0; }
  .chips { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 14px 0; }
  .chip { border: 1px solid #d4d4d4; border-radius: 8px; padding: 8px 10px; text-align: center; }
  .chip .k { font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em; color: #737373; margin: 0 0 2px; }
  .chip .v { font-weight: 700; font-size: 14px; margin: 0; }
  table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
  th, td { border: 1px solid #d4d4d4; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f5f5f5; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
  .num { white-space: nowrap; }
  .right { text-align: right; }
  .strong { font-weight: 700; }
  tr.total td { background: #f5f5f5; font-weight: 700; }
  .deduct { margin-top: 12px; margin-left: auto; width: 300px; font-size: 12px; }
  .deduct .row { display: flex; justify-content: space-between; border-bottom: 1px solid #d4d4d4; padding: 5px 2px; }
  .deduct .muted { color: #525252; }
  .net { display: flex; justify-content: space-between; align-items: center; margin-top: 10px;
    border: 2px solid #171717; background: #f5f5f5; padding: 8px 12px; }
  .net .k { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; }
  .net .v { font-size: 17px; font-weight: 800; }
  .footer { margin-top: 26px; border-top: 1px solid #d4d4d4; padding-top: 8px;
    display: flex; justify-content: space-between; gap: 10px; color: #737373; font-size: 10px; }
  @media print { .sheet { padding: 0; } }
</style>
</head>
<body>
  <div class="sheet">
    <div class="letterhead">
      <div class="brand">
        <span class="dot" aria-hidden="true"></span>
        <b>BizHub</b>
        ${business ? `<span>&nbsp;· ${esc(business)}</span>` : ""}
      </div>
      <div class="generated">Generated ${esc(generated)}</div>
    </div>

    <h1>Payslip</h1>
    <p class="period">Period: ${esc(data.periodLabel)}</p>

    <div class="emp">
      <div><p class="k">Employee</p><p class="v">${esc(e.fullName)}</p></div>
      <div><p class="k">Code</p><p class="v">${esc(e.code || "—")}</p></div>
      <div><p class="k">Designation</p><p class="v">${esc(e.designation || "—")}</p></div>
      <div><p class="k">Period</p><p class="v">${esc(data.periodLabel)}</p></div>
    </div>

    <div class="chips">
      <div class="chip"><p class="k">Days worked</p><p class="v">${esc(data.dayTotals.daysWorked)}</p></div>
      <div class="chip"><p class="k">Shifts</p><p class="v">${esc(data.dayTotals.shifts)}</p></div>
      <div class="chip"><p class="k">Gross earnings</p><p class="v">${esc(inr(data.dayTotals.earnings))}</p></div>
      <div class="chip"><p class="k">Net after advances</p><p class="v">${esc(inr(data.netPayable))}</p></div>
    </div>

    <table>
      <thead>
        <tr><th>Date</th><th>Property</th><th>Shift</th><th class="right">Rate</th><th class="right">Earnings</th></tr>
      </thead>
      <tbody>
        ${rowsHtml || `<tr><td colspan="5" style="text-align:center;color:#737373">No shifts in this period</td></tr>`}
        <tr class="total">
          <td colspan="2">Totals</td>
          <td class="num">${esc(data.dayTotals.shifts)} shift${data.dayTotals.shifts === 1 ? "" : "s"}</td>
          <td class="num"></td>
          <td class="num right">${esc(inr(data.dayTotals.earnings))}</td>
        </tr>
      </tbody>
    </table>

    ${hasAdvances ? `
    <div class="deduct">
      <div class="row"><span class="muted">Advances deducted</span><span class="num">− ${esc(inr(data.advances))}</span></div>
      <div class="net"><span class="k">Net payable</span><span class="v">${esc(inr(data.netPayable))}</span></div>
    </div>` : `
    <div class="deduct">
      <div class="net"><span class="k">Net payable</span><span class="v">${esc(inr(data.netPayable))}</span></div>
    </div>`}

    <div class="footer">
      <span>Generated ${esc(generated)}</span>
      <span>computer-generated payslip</span>
    </div>
  </div>
  <script>window.onload = function () { window.print(); };</script>
</body>
</html>`;
}
