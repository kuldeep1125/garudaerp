// Print-perfect A4 HTML generators for Entity Statements (Contractor, Property Client, Vehicle).
// Inline CSS only + system fonts for pristine rendering in browser print & PDF export.

function inr(n: number): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "₹0";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  return `${sign}₹${abs.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtDay(v: string): string {
  const d = new Date(v.length === 10 ? `${v}T00:00:00` : v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function shiftLabel(s: string): string {
  const u = (s || "").toUpperCase();
  return u === "NIGHT" ? "Night" : u === "FULL" ? "Full (D+N)" : "Day";
}

const COMMON_STYLES = `
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
    color: #0f172a; font-size: 11.5px; line-height: 1.45;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .sheet { max-width: 820px; margin: 0 auto; padding: 20px 24px; }
  .letterhead { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;
    border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px; }
  .brand { display: flex; align-items: center; gap: 8px; }
  .logo-badge { width: 32px; height: 32px; border-radius: 6px; background: #0f172a; color: #fff;
    display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 16px; }
  .brand-name { font-size: 16px; font-weight: 800; letter-spacing: -0.02em; color: #0f172a; }
  .brand-sub { font-size: 10.5px; color: #64748b; font-weight: 500; }
  .doc-title-block { text-align: right; }
  .doc-title { font-size: 17px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.04em; margin: 0; }
  .period { font-size: 11px; color: #475569; font-weight: 600; margin: 3px 0 0; }
  .generated { font-size: 9.5px; color: #94a3b8; margin: 3px 0 0; }
  
  .entity-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px;
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
  .entity-card .k { font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin: 0 0 3px; font-weight: 600; }
  .entity-card .v { font-size: 13px; font-weight: 700; color: #0f172a; margin: 0; }

  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 18px; }
  .kpi-box { border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px 12px; text-align: center; background: #fff; }
  .kpi-box.highlight { background: #f0fdf4; border-color: #86efac; }
  .kpi-box.warning { background: #fffbeb; border-color: #fde68a; }
  .kpi-box .k { font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; font-weight: 600; margin: 0 0 3px; }
  .kpi-box .v { font-size: 16px; font-weight: 800; color: #0f172a; margin: 0; }
  .kpi-box.highlight .v { color: #15803d; }
  .kpi-box.warning .v { color: #b45309; }

  .section-title { font-size: 12.5px; font-weight: 700; color: #0f172a; text-transform: uppercase; letter-spacing: 0.04em; margin: 16px 0 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 16px; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; vertical-align: middle; }
  th { background: #f1f5f9; font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #334155; }
  td.num { white-space: nowrap; font-variant-numeric: tabular-nums; }
  td.right, th.right { text-align: right; }
  tr.totals-row td { background: #f8fafc; font-weight: 800; border-top: 2px solid #0f172a; }
  .pill { display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 9.5px; font-weight: 700; text-transform: uppercase; }
  .pill-green { background: #dcfce7; color: #166534; }
  .pill-amber { background: #fef3c7; color: #92400e; }
  .pill-blue { background: #e0f2fe; color: #075985; }
  .pill-gray { background: #f1f5f9; color: #475569; }

  .footer { margin-top: 28px; padding-top: 12px; border-top: 1px dashed #cbd5e1; display: flex; justify-content: space-between; align-items: center; color: #94a3b8; font-size: 9px; }
`;

// ---------------------------------------------------------------------------
// 1. Contractor Commission Statement
// ---------------------------------------------------------------------------

export interface ContractorStatementData {
  businessName: string | null;
  contractorName: string;
  periodLabel: string;
  totals: { deployments: number; units: number; employees: number; commission: number };
  days: {
    date: string;
    employeeCode?: string;
    employeeName: string;
    propertyName: string;
    shift: string;
    units: number;
    rate: number;
    commission: number;
  }[];
}

export function buildContractorStatementHtml(data: ContractorStatementData): string {
  const generated = new Date().toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
  const business = data.businessName?.trim() || "Garuda ERP";

  const rowsHtml = data.days.map((d, i) => `
    <tr>
      <td class="num">${i + 1}</td>
      <td class="num">${esc(fmtDay(d.date))}</td>
      <td><strong>${esc(d.employeeName)}</strong> ${d.employeeCode ? `<span style="color:#64748b">(${esc(d.employeeCode)})</span>` : ""}</td>
      <td>${esc(d.propertyName)}</td>
      <td><span class="pill pill-blue">${esc(shiftLabel(d.shift))}</span></td>
      <td class="num right">${d.units}</td>
      <td class="num right">${esc(inr(d.rate))}</td>
      <td class="num right"><strong>${esc(inr(d.commission))}</strong></td>
    </tr>`).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Contractor Statement — ${esc(data.contractorName)}</title>
<style>${COMMON_STYLES}</style>
</head>
<body onload="window.print()">
  <div class="sheet">
    <div class="letterhead">
      <div class="brand">
        <div class="logo-badge">G</div>
        <div>
          <div class="brand-name">${esc(business)}</div>
          <div class="brand-sub">Manpower & Transport Enterprise Management</div>
        </div>
      </div>
      <div class="doc-title-block">
        <h1 class="doc-title">Contractor Statement</h1>
        <div class="period">Period: ${esc(data.periodLabel)}</div>
        <div class="generated">Generated: ${esc(generated)}</div>
      </div>
    </div>

    <div class="entity-card">
      <div>
        <div class="k">Contractor Name</div>
        <div class="v">${esc(data.contractorName)}</div>
      </div>
      <div>
        <div class="k">Statement Type</div>
        <div class="v">Commission Payout</div>
      </div>
      <div>
        <div class="k">Active Workforce</div>
        <div class="v">${data.totals.employees} Staff</div>
      </div>
      <div>
        <div class="k">Total Shifts</div>
        <div class="v">${data.totals.deployments} Deployments</div>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-box">
        <div class="k">Total Deployments</div>
        <div class="v">${data.totals.deployments}</div>
      </div>
      <div class="kpi-box">
        <div class="k">Shift Units (D+N)</div>
        <div class="v">${data.totals.units}</div>
      </div>
      <div class="kpi-box">
        <div class="k">Unique Employees</div>
        <div class="v">${data.totals.employees}</div>
      </div>
      <div class="kpi-box highlight">
        <div class="k">Total Commission</div>
        <div class="v">${esc(inr(data.totals.commission))}</div>
      </div>
    </div>

    <div class="section-title">Itemized Shift Deployments & Commission Cut</div>
    <table>
      <thead>
        <tr>
          <th style="width: 32px">#</th>
          <th>Date</th>
          <th>Employee</th>
          <th>Property</th>
          <th>Shift</th>
          <th class="right">Units</th>
          <th class="right">Rate Cut</th>
          <th class="right">Commission</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
        <tr class="totals-row">
          <td colspan="5"><strong>TOTAL (${data.days.length} Shifts)</strong></td>
          <td class="num right">${data.totals.units}</td>
          <td class="num right">—</td>
          <td class="num right" style="font-size: 13px; color: #15803d">${esc(inr(data.totals.commission))}</td>
        </tr>
      </tbody>
    </table>

    <div class="footer">
      <div>Official Garuda ERP System Generated Document • Accurate & Reconciled</div>
      <div>Authorized Signatory: ________________________</div>
    </div>
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// 2. Client / Property Billing & Ledger Statement
// ---------------------------------------------------------------------------

export interface PropertyStatementData {
  businessName: string | null;
  property: {
    id: string;
    name: string;
    code?: string | null;
    contactPerson?: string | null;
    phone?: string | null;
    address?: string | null;
    defaultBillingRate?: number | null;
  };
  periodLabel: string;
  summary: {
    shifts: number;
    employees: number;
    billing: number;
    received: number;
    outstanding: number;
    collectionPct: number;
  };
  deployments: {
    date: string;
    shift: string;
    employeeCode?: string;
    employeeName: string;
    designation?: string | null;
    billingRate: number;
    billingAmount: number;
  }[];
  payments: {
    date: string;
    amount: number;
    paymentMode?: string | null;
    referenceNote?: string | null;
  }[];
}

export function buildPropertyStatementHtml(data: PropertyStatementData): string {
  const generated = new Date().toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
  const business = data.businessName?.trim() || "Garuda ERP";
  const p = data.property;

  const depRows = data.deployments.map((d, i) => `
    <tr>
      <td class="num">${i + 1}</td>
      <td class="num">${esc(fmtDay(d.date))}</td>
      <td><strong>${esc(d.employeeName)}</strong> ${d.employeeCode ? `<span style="color:#64748b">(${esc(d.employeeCode)})</span>` : ""}</td>
      <td>${esc(d.designation ?? "Staff")}</td>
      <td><span class="pill pill-blue">${esc(shiftLabel(d.shift))}</span></td>
      <td class="num right">${esc(inr(d.billingRate))}</td>
      <td class="num right"><strong>${esc(inr(d.billingAmount))}</strong></td>
    </tr>`).join("");

  const payRows = data.payments.length > 0
    ? data.payments.map((m, i) => `
      <tr>
        <td class="num">${i + 1}</td>
        <td class="num">${esc(fmtDay(m.date))}</td>
        <td><span class="pill pill-green">${esc(m.paymentMode ?? "Bank")}</span></td>
        <td>${esc(m.referenceNote ?? "Payment Received")}</td>
        <td class="num right" style="color:#15803d"><strong>${esc(inr(m.amount))}</strong></td>
      </tr>`).join("")
    : `<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:12px">No collections recorded in this period</td></tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Billing Statement — ${esc(p.name)}</title>
<style>${COMMON_STYLES}</style>
</head>
<body onload="window.print()">
  <div class="sheet">
    <div class="letterhead">
      <div class="brand">
        <div class="logo-badge">G</div>
        <div>
          <div class="brand-name">${esc(business)}</div>
          <div class="brand-sub">Manpower & Staffing Solutions</div>
        </div>
      </div>
      <div class="doc-title-block">
        <h1 class="doc-title">Client Billing Statement</h1>
        <div class="period">Period: ${esc(data.periodLabel)}</div>
        <div class="generated">Generated: ${esc(generated)}</div>
      </div>
    </div>

    <div class="entity-card">
      <div>
        <div class="k">Client Property</div>
        <div class="v">${esc(p.name)} ${p.code ? `<span style="color:#64748b">(${esc(p.code)})</span>` : ""}</div>
      </div>
      <div>
        <div class="k">Contact Person</div>
        <div class="v">${esc(p.contactPerson ?? "Operations Head")}</div>
      </div>
      <div>
        <div class="k">Phone / Mobile</div>
        <div class="v">${esc(p.phone ?? "—")}</div>
      </div>
      <div>
        <div class="k">Contract Rate</div>
        <div class="v">${p.defaultBillingRate ? inr(p.defaultBillingRate) + "/shift" : "As per shift"}</div>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-box">
        <div class="k">Shifts Delivered</div>
        <div class="v">${data.summary.shifts}</div>
      </div>
      <div class="kpi-box">
        <div class="k">Total Billed</div>
        <div class="v">${esc(inr(data.summary.billing))}</div>
      </div>
      <div class="kpi-box highlight">
        <div class="k">Total Received</div>
        <div class="v">${esc(inr(data.summary.received))}</div>
      </div>
      <div class="kpi-box ${data.summary.outstanding > 0 ? "warning" : "highlight"}">
        <div class="k">Net Outstanding</div>
        <div class="v">${esc(inr(data.summary.outstanding))}</div>
      </div>
    </div>

    <div class="section-title">Itemized Shift Deployments (Billing Breakdown)</div>
    <table>
      <thead>
        <tr>
          <th style="width: 32px">#</th>
          <th>Date</th>
          <th>Employee</th>
          <th>Role</th>
          <th>Shift</th>
          <th class="right">Billing Rate</th>
          <th class="right">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${depRows}
        <tr class="totals-row">
          <td colspan="5"><strong>TOTAL BILLED (${data.deployments.length} Shifts)</strong></td>
          <td class="num right">—</td>
          <td class="num right" style="font-size: 13px;">${esc(inr(data.summary.billing))}</td>
        </tr>
      </tbody>
    </table>

    <div class="section-title">Collections & Payments Received</div>
    <table>
      <thead>
        <tr>
          <th style="width: 32px">#</th>
          <th>Date</th>
          <th>Mode</th>
          <th>Reference / Remarks</th>
          <th class="right">Amount Received</th>
        </tr>
      </thead>
      <tbody>
        ${payRows}
        <tr class="totals-row">
          <td colspan="4"><strong>TOTAL PAYMENTS RECEIVED</strong></td>
          <td class="num right" style="font-size: 13px; color: #15803d">${esc(inr(data.summary.received))}</td>
        </tr>
      </tbody>
    </table>

    <div class="footer">
      <div>Please make payments to Garuda ERP designated accounts • For queries, contact accounting</div>
      <div>Client Seal & Signature: ________________________</div>
    </div>
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// 3. Vehicle Fleet Profitability & Operations Statement
// ---------------------------------------------------------------------------

export interface VehicleStatementData {
  businessName: string | null;
  vehicle: {
    id: string;
    name: string;
    registrationNumber: string;
    make?: string | null;
    model?: string | null;
    year?: number | null;
    capacity?: number | null;
  };
  periodLabel: string;
  summary: {
    revenue: number;
    operatingExpenses: number;
    emi: number;
    net: number;
    tripsCount: number;
    expensesCount: number;
  };
  trips: {
    date: string;
    client: string;
    route: string;
    rentalType: string;
    fare: number;
    paidAmount: number;
    status: string;
  }[];
  expenses: {
    date: string;
    categoryName: string;
    description: string;
    amount: number;
    kind: string;
  }[];
  emis: {
    month: string;
    dueDate: string;
    paidAt?: string | null;
    amount: number;
    isPaid: boolean;
  }[];
}

export function buildVehicleStatementHtml(data: VehicleStatementData): string {
  const generated = new Date().toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
  const business = data.businessName?.trim() || "Garuda ERP";
  const v = data.vehicle;
  const s = data.summary;

  const tripRows = data.trips.length > 0
    ? data.trips.map((t, i) => `
      <tr>
        <td class="num">${i + 1}</td>
        <td class="num">${esc(fmtDay(t.date))}</td>
        <td><strong>${esc(t.client)}</strong></td>
        <td>${esc(t.route)}</td>
        <td><span class="pill pill-blue">${esc(t.rentalType)}</span></td>
        <td class="num right">${esc(inr(t.fare))}</td>
        <td class="num right"><strong>${esc(inr(t.paidAmount))}</strong></td>
      </tr>`).join("")
    : `<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:12px">No trips during this period</td></tr>`;

  const expRows = data.expenses.length > 0
    ? data.expenses.map((e, i) => `
      <tr>
        <td class="num">${i + 1}</td>
        <td class="num">${esc(fmtDay(e.date))}</td>
        <td><span class="pill pill-amber">${esc(e.categoryName)}</span></td>
        <td>${esc(e.description)}</td>
        <td class="num right"><strong>${esc(inr(e.amount))}</strong></td>
      </tr>`).join("")
    : `<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:12px">No direct expenses recorded</td></tr>`;

  const emiRows = data.emis.length > 0
    ? data.emis.map((m, i) => `
      <tr>
        <td class="num">${i + 1}</td>
        <td><strong>${esc(m.month)}</strong></td>
        <td class="num">${esc(fmtDay(m.dueDate))}</td>
        <td class="num">${m.paidAt ? esc(fmtDay(m.paidAt)) : "—"}</td>
        <td><span class="pill ${m.isPaid ? "pill-green" : "pill-amber"}">${m.isPaid ? "PAID" : "PENDING"}</span></td>
        <td class="num right"><strong>${esc(inr(m.amount))}</strong></td>
      </tr>`).join("")
    : `<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:12px">No EMI scheduled in this period</td></tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Vehicle Profitability Statement — ${esc(v.name)}</title>
<style>${COMMON_STYLES}</style>
</head>
<body onload="window.print()">
  <div class="sheet">
    <div class="letterhead">
      <div class="brand">
        <div class="logo-badge">G</div>
        <div>
          <div class="brand-name">${esc(business)}</div>
          <div class="brand-sub">Transport & Fleet Profitability</div>
        </div>
      </div>
      <div class="doc-title-block">
        <h1 class="doc-title">Vehicle Fleet Statement</h1>
        <div class="period">Period: ${esc(data.periodLabel)}</div>
        <div class="generated">Generated: ${esc(generated)}</div>
      </div>
    </div>

    <div class="entity-card">
      <div>
        <div class="k">Vehicle</div>
        <div class="v">${esc(v.name)}</div>
      </div>
      <div>
        <div class="k">Registration No</div>
        <div class="v">${esc(v.registrationNumber)}</div>
      </div>
      <div>
        <div class="k">Make / Model</div>
        <div class="v">${esc(v.make ?? "—")} ${esc(v.model ?? "")}</div>
      </div>
      <div>
        <div class="k">Capacity</div>
        <div class="v">${v.capacity ? `${v.capacity} Seater` : "Commercial"}</div>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-box highlight">
        <div class="k">Trip Revenue</div>
        <div class="v">${esc(inr(s.revenue))}</div>
      </div>
      <div class="kpi-box">
        <div class="k">Operating Opex</div>
        <div class="v">${esc(inr(s.operatingExpenses))}</div>
      </div>
      <div class="kpi-box">
        <div class="k">EMI Deductions</div>
        <div class="v">${esc(inr(s.emi))}</div>
      </div>
      <div class="kpi-box ${s.net >= 0 ? "highlight" : "warning"}">
        <div class="k">Net Margin</div>
        <div class="v">${esc(inr(s.net))}</div>
      </div>
    </div>

    <div class="section-title">Completed Client Trips & Rental Earnings</div>
    <table>
      <thead>
        <tr>
          <th style="width: 32px">#</th>
          <th>Date</th>
          <th>Client</th>
          <th>Route / Journey</th>
          <th>Type</th>
          <th class="right">Trip Fare</th>
          <th class="right">Collected</th>
        </tr>
      </thead>
      <tbody>
        ${tripRows}
        <tr class="totals-row">
          <td colspan="5"><strong>TOTAL REVENUE (${data.trips.length} Trips)</strong></td>
          <td class="num right">—</td>
          <td class="num right" style="font-size: 13px; color: #15803d">${esc(inr(s.revenue))}</td>
        </tr>
      </tbody>
    </table>

    <div class="section-title">Fuel, Repairs & Maintenance Expenses</div>
    <table>
      <thead>
        <tr>
          <th style="width: 32px">#</th>
          <th>Date</th>
          <th>Category</th>
          <th>Description</th>
          <th class="right">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${expRows}
        <tr class="totals-row">
          <td colspan="4"><strong>TOTAL OPEX</strong></td>
          <td class="num right" style="font-size: 13px;">${esc(inr(s.operatingExpenses))}</td>
        </tr>
      </tbody>
    </table>

    <div class="section-title">Vehicle EMI Schedule</div>
    <table>
      <thead>
        <tr>
          <th style="width: 32px">#</th>
          <th>Month</th>
          <th>Due Date</th>
          <th>Paid Date</th>
          <th>Status</th>
          <th class="right">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${emiRows}
        <tr class="totals-row">
          <td colspan="5"><strong>TOTAL EMI</strong></td>
          <td class="num right" style="font-size: 13px;">${esc(inr(s.emi))}</td>
        </tr>
      </tbody>
    </table>

    <div class="footer">
      <div>Garuda ERP Fleet Profitability System • Financial records never mix</div>
      <div>Fleet Manager: ________________________</div>
    </div>
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Bank & Cash Book Statement HTML Generator
// ---------------------------------------------------------------------------

export interface BankLedgerPrintParams {
  businessName: string;
  periodLabel: string;
  totals: { inflow: number; outflow: number; net: number; count: number };
  rows: Array<{
    date: string;
    category: string;
    entity: string;
    description: string;
    mode: string;
    inflow: number;
    outflow: number;
    balance: number;
  }>;
  streams?: Array<{ category: string; inflow: number; outflow: number; count: number }>;
}

export function buildBankLedgerHtml(p: BankLedgerPrintParams): string {
  const genAt = new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const streamRows = (p.streams ?? []).map((s, idx) => `
    <tr>
      <td class="num">${idx + 1}</td>
      <td><strong>${esc(s.category)}</strong></td>
      <td class="num right">${esc(String(s.count))}</td>
      <td class="num right" style="color: #059669">${esc(s.inflow > 0 ? inr(s.inflow) : "—")}</td>
      <td class="num right" style="color: #dc2626">${esc(s.outflow > 0 ? inr(s.outflow) : "—")}</td>
      <td class="num right"><strong>${esc(inr(s.inflow - s.outflow))}</strong></td>
    </tr>
  `).join("");

  const ledgerRows = p.rows.map((r, idx) => `
    <tr>
      <td class="num">${idx + 1}</td>
      <td>${esc(fmtDay(r.date))}</td>
      <td><span class="badge ${r.inflow > 0 ? "badge-day" : "badge-night"}">${esc(r.category)}</span></td>
      <td><strong>${esc(r.entity)}</strong></td>
      <td>${esc(r.description)}</td>
      <td><span class="badge badge-shift">${esc(r.mode)}</span></td>
      <td class="num right" style="color: #059669; font-weight: 600">${esc(r.inflow > 0 ? inr(r.inflow) : "—")}</td>
      <td class="num right" style="color: #dc2626; font-weight: 600">${esc(r.outflow > 0 ? inr(r.outflow) : "—")}</td>
      <td class="num right" style="font-weight: 700">${esc(inr(r.balance))}</td>
    </tr>
  `).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Bank & Cash Book — ${esc(p.periodLabel)}</title>
  <style>${COMMON_STYLES}</style>
</head>
<body>
  <div class="sheet">
    <div class="letterhead">
      <div class="brand">
        <div class="logo-badge">₹</div>
        <div>
          <div class="brand-name">${esc(p.businessName || "Garuda ERP Control Center")}</div>
          <div class="brand-sub">Consolidated Cash & Bank Treasury Book</div>
        </div>
      </div>
      <div class="doc-title-block">
        <h1 class="doc-title">CASH & BANK STATEMENT</h1>
        <p class="period">Period: ${esc(p.periodLabel)}</p>
        <p class="generated">Generated: ${esc(genAt)}</p>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-box highlight">
        <div class="k">TOTAL INFLOWS (RECEIVED)</div>
        <div class="v" style="color: #059669">${esc(inr(p.totals.inflow))}</div>
      </div>
      <div class="kpi-box warning">
        <div class="k">TOTAL OUTFLOWS (DISBURSED)</div>
        <div class="v" style="color: #dc2626">${esc(inr(p.totals.outflow))}</div>
      </div>
      <div class="kpi-box ${p.totals.net >= 0 ? "highlight" : "warning"}">
        <div class="k">NET CASH FLOW</div>
        <div class="v" style="color: ${p.totals.net >= 0 ? "#059669" : "#dc2626"}">${esc(inr(p.totals.net))}</div>
      </div>
      <div class="kpi-box">
        <div class="k">TRANSACTION COUNT</div>
        <div class="v">${esc(String(p.totals.count))} entries</div>
      </div>
    </div>

    ${p.streams && p.streams.length > 0 ? `
    <div class="section-title">Cash Flow Stream Summary</div>
    <table>
      <thead>
        <tr>
          <th style="width: 32px">#</th>
          <th>Stream / Flow Category</th>
          <th class="right">Entries</th>
          <th class="right">Total Inflow</th>
          <th class="right">Total Outflow</th>
          <th class="right">Net Contribution</th>
        </tr>
      </thead>
      <tbody>
        ${streamRows}
      </tbody>
    </table>
    ` : ""}

    <div class="section-title">Chronological Transaction Register (${p.rows.length} records)</div>
    <table>
      <thead>
        <tr>
          <th style="width: 28px">#</th>
          <th>Date</th>
          <th>Category</th>
          <th>Party / Entity</th>
          <th>Description / Ref</th>
          <th>Mode</th>
          <th class="right">Inflow (+)</th>
          <th class="right">Outflow (-)</th>
          <th class="right">Running Net</th>
        </tr>
      </thead>
      <tbody>
        ${ledgerRows}
        <tr class="totals-row">
          <td colspan="6"><strong>PERIOD TOTALS</strong></td>
          <td class="num right" style="color: #059669; font-size: 13px;">${esc(inr(p.totals.inflow))}</td>
          <td class="num right" style="color: #dc2626; font-size: 13px;">${esc(inr(p.totals.outflow))}</td>
          <td class="num right" style="font-size: 13px; font-weight: 800">${esc(inr(p.totals.net))}</td>
        </tr>
      </tbody>
    </table>

    <div class="footer">
      <div>Garuda ERP Treasury Audit System • All transactions digitally stamped</div>
      <div>Authorized Finance Controller: ________________________</div>
    </div>
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Executive Income Statement (P&L) HTML Generator
// ---------------------------------------------------------------------------

export interface ExecutivePnlPrintParams {
  businessName: string;
  periodLabel: string;
  incomeStatement: {
    revenue: {
      manpowerBilling: number;
      transportBilling: number;
      rentIncome: number;
      totalRevenue: number;
    };
    directCosts: {
      perShiftWages: number;
      salariedPayroll: number;
      overtime: number;
      contractorCommissions: number;
      totalLaborCost: number;
    };
    grossProfit: number;
    grossMarginPct: number;
    operatingExpenses: {
      categories: Array<{ category: string; amount: number; entriesCount: number }>;
      totalOpex: number;
    };
    netProfit: number;
    netMarginPct: number;
  };
}

export function buildExecutivePnlHtml(p: ExecutivePnlPrintParams): string {
  const genAt = new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const is = p.incomeStatement;

  const opexCategoryRows = is.operatingExpenses.categories.map((c, idx) => `
    <tr>
      <td style="padding-left: 24px; color: #475569;">${idx + 1}. ${esc(c.category)} (${c.entriesCount} bills)</td>
      <td class="num right">${esc(inr(c.amount))}</td>
    </tr>
  `).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Executive Income Statement (P&L) — ${esc(p.periodLabel)}</title>
  <style>
    ${COMMON_STYLES}
    .pnl-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    .pnl-table th, .pnl-table td { padding: 8px 12px; font-size: 12px; border-bottom: 1px solid #e2e8f0; }
    .pnl-header { background: #0f172a; color: #fff; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; font-size: 11px; }
    .pnl-section { background: #f8fafc; font-weight: 700; color: #0f172a; font-size: 13px; }
    .pnl-subtotal { background: #f1f5f9; font-weight: 700; border-top: 1px solid #94a3b8; border-bottom: 2px solid #0f172a; }
    .pnl-net { background: #ecfdf5; font-size: 14px; font-weight: 800; border-top: 2px solid #059669; border-bottom: 3px double #059669; }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="letterhead">
      <div class="brand">
        <div class="logo-badge">P&L</div>
        <div>
          <div class="brand-name">${esc(p.businessName || "Garuda ERP")}</div>
          <div class="brand-sub">Executive Financial Profit & Loss Statement</div>
        </div>
      </div>
      <div class="doc-title-block">
        <h1 class="doc-title">INCOME STATEMENT (P&L)</h1>
        <p class="period">Accounting Period: ${esc(p.periodLabel)}</p>
        <p class="generated">Report Date: ${esc(genAt)}</p>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-box highlight">
        <div class="k">TOTAL GROSS REVENUE</div>
        <div class="v" style="color: #059669">${esc(inr(is.revenue.totalRevenue))}</div>
      </div>
      <div class="kpi-box">
        <div class="k">DIRECT LABOR &amp; COGS</div>
        <div class="v">${esc(inr(is.directCosts.totalLaborCost))}</div>
      </div>
      <div class="kpi-box highlight">
        <div class="k">GROSS MARGIN (${is.grossMarginPct}%)</div>
        <div class="v" style="color: #059669">${esc(inr(is.grossProfit))}</div>
      </div>
      <div class="kpi-box ${is.netProfit >= 0 ? "highlight" : "warning"}">
        <div class="k">NET PROFIT (${is.netMarginPct}%)</div>
        <div class="v" style="color: ${is.netProfit >= 0 ? "#059669" : "#dc2626"}">${esc(inr(is.netProfit))}</div>
      </div>
    </div>

    <table class="pnl-table">
      <thead>
        <tr class="pnl-header">
          <th>Accounting Line Item</th>
          <th class="right" style="width: 140px">Amount (INR)</th>
        </tr>
      </thead>
      <tbody>
        <!-- Revenue Section -->
        <tr class="pnl-section">
          <td colspan="2">1. OPERATING REVENUE</td>
        </tr>
        <tr>
          <td style="padding-left: 24px">Manpower Client Deployments Billing</td>
          <td class="num right">${esc(inr(is.revenue.manpowerBilling))}</td>
        </tr>
        <tr>
          <td style="padding-left: 24px">Transport Vehicle Rental &amp; Trip Billings</td>
          <td class="num right">${esc(inr(is.revenue.transportBilling))}</td>
        </tr>
        <tr>
          <td style="padding-left: 24px">Staff Accommodation Business Rent Accruals</td>
          <td class="num right">${esc(inr(is.revenue.rentIncome))}</td>
        </tr>
        <tr class="pnl-subtotal">
          <td><strong>TOTAL OPERATING REVENUE</strong></td>
          <td class="num right" style="color: #059669; font-size: 13px;">${esc(inr(is.revenue.totalRevenue))}</td>
        </tr>

        <!-- Direct Labor Costs Section -->
        <tr class="pnl-section">
          <td colspan="2">2. COST OF SERVICES &amp; DIRECT LABOR (COGS)</td>
        </tr>
        <tr>
          <td style="padding-left: 24px">Per-Shift Employee Payouts (Hourly / Shift Wages)</td>
          <td class="num right">${esc(inr(is.directCosts.perShiftWages))}</td>
        </tr>
        <tr>
          <td style="padding-left: 24px">Fixed Monthly Salaried Staff Payroll Accrual</td>
          <td class="num right">${esc(inr(is.directCosts.salariedPayroll))}</td>
        </tr>
        <tr>
          <td style="padding-left: 24px">Salaried Overtime Deployments Accrual</td>
          <td class="num right">${esc(inr(is.directCosts.overtime))}</td>
        </tr>
        <tr>
          <td style="padding-left: 24px">Sub-Contractor Commission Cuts</td>
          <td class="num right">${esc(inr(is.directCosts.contractorCommissions))}</td>
        </tr>
        <tr class="pnl-subtotal">
          <td><strong>TOTAL DIRECT LABOR &amp; SERVICE COST</strong></td>
          <td class="num right" style="font-size: 13px;">${esc(inr(is.directCosts.totalLaborCost))}</td>
        </tr>

        <!-- Gross Profit -->
        <tr style="background: #f8fafc; font-weight: 800; font-size: 13px;">
          <td>GROSS OPERATING PROFIT (Revenue − Labor)</td>
          <td class="num right" style="color: #059669; font-size: 13px;">${esc(inr(is.grossProfit))}</td>
        </tr>

        <!-- Operating Expenses Section -->
        <tr class="pnl-section">
          <td colspan="2">3. OPERATING OVERHEADS &amp; EXPENSES (OPEX)</td>
        </tr>
        ${opexCategoryRows}
        <tr class="pnl-subtotal">
          <td><strong>TOTAL OPERATING EXPENSES</strong></td>
          <td class="num right" style="color: #dc2626; font-size: 13px;">${esc(inr(is.operatingExpenses.totalOpex))}</td>
        </tr>

        <!-- Net Profit -->
        <tr class="pnl-net">
          <td><strong>NET OPERATING PROFIT / (LOSS)</strong></td>
          <td class="num right" style="color: ${is.netProfit >= 0 ? "#059669" : "#dc2626"}; font-size: 15px;">
            ${esc(inr(is.netProfit))}
          </td>
        </tr>
      </tbody>
    </table>

    <div class="footer">
      <div>Certified P&L Statement • Garuda Enterprise Reporting Core</div>
      <div>Managing Partner / Director: ________________________</div>
    </div>
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Manpower Master Statement HTML Generator
// ---------------------------------------------------------------------------

export interface ManpowerMasterPrintParams {
  businessName: string;
  periodLabel: string;
  totals: {
    shifts: number;
    headcount: number;
    billing: number;
    payout: number;
    contractorCut: number;
    margin: number;
    marginPct: number;
  };
  rows: Array<{
    propertyName: string;
    shifts: number;
    headcount: number;
    billing: number;
    payout: number;
    contractorCut: number;
    margin: number;
    marginPct: number;
  }>;
  contractors?: Array<{ contractor: string; shifts: number; headcount: number; commission: number }>;
}

export function buildManpowerMasterHtml(p: ManpowerMasterPrintParams): string {
  const genAt = new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const propRows = p.rows.map((r, idx) => `
    <tr>
      <td class="num">${idx + 1}</td>
      <td><strong>${esc(r.propertyName)}</strong></td>
      <td class="num right">${esc(String(r.shifts))}</td>
      <td class="num right">${esc(String(r.headcount))}</td>
      <td class="num right font-semibold">${esc(inr(r.billing))}</td>
      <td class="num right">${esc(inr(r.payout))}</td>
      <td class="num right">${esc(inr(r.contractorCut))}</td>
      <td class="num right" style="font-weight: 700; color: ${r.margin >= 0 ? "#059669" : "#dc2626"}">${esc(inr(r.margin))}</td>
      <td class="num right">${esc(String(r.marginPct))}%</td>
    </tr>
  `).join("");

  const contractorRows = (p.contractors ?? []).map((c, idx) => `
    <tr>
      <td class="num">${idx + 1}</td>
      <td><strong>${esc(c.contractor)}</strong></td>
      <td class="num right">${esc(String(c.shifts))}</td>
      <td class="num right">${esc(String(c.headcount))}</td>
      <td class="num right font-bold" style="color: #059669">${esc(inr(c.commission))}</td>
    </tr>
  `).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Manpower Master Statement — ${esc(p.periodLabel)}</title>
  <style>${COMMON_STYLES}</style>
</head>
<body>
  <div class="sheet">
    <div class="letterhead">
      <div class="brand">
        <div class="logo-badge">M</div>
        <div>
          <div class="brand-name">${esc(p.businessName || "Garuda ERP")}</div>
          <div class="brand-sub">Manpower Operational & Financial Master Statement</div>
        </div>
      </div>
      <div class="doc-title-block">
        <h1 class="doc-title">MANPOWER MASTER STATEMENT</h1>
        <p class="period">Period: ${esc(p.periodLabel)}</p>
        <p class="generated">Generated: ${esc(genAt)}</p>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-box highlight">
        <div class="k">TOTAL BILLING REVENUE</div>
        <div class="v" style="color: #059669">${esc(inr(p.totals.billing))}</div>
      </div>
      <div class="kpi-box">
        <div class="k">EMPLOYEE PAYOUTS</div>
        <div class="v">${esc(inr(p.totals.payout))}</div>
      </div>
      <div class="kpi-box warning">
        <div class="k">CONTRACTOR COMMISSIONS</div>
        <div class="v">${esc(inr(p.totals.contractorCut))}</div>
      </div>
      <div class="kpi-box ${p.totals.margin >= 0 ? "highlight" : "warning"}">
        <div class="k">GROSS MARGIN (${p.totals.marginPct}%)</div>
        <div class="v" style="color: ${p.totals.margin >= 0 ? "#059669" : "#dc2626"}">${esc(inr(p.totals.margin))}</div>
      </div>
    </div>

    <div class="section-title">Property Performance &amp; Billings Breakdown</div>
    <table>
      <thead>
        <tr>
          <th style="width: 28px">#</th>
          <th>Restaurant / Property</th>
          <th class="right">Shifts</th>
          <th class="right">Staff</th>
          <th class="right">Billing</th>
          <th class="right">Payouts</th>
          <th class="right">Contractor Cut</th>
          <th class="right">Gross Margin</th>
          <th class="right">Margin %</th>
        </tr>
      </thead>
      <tbody>
        ${propRows}
        <tr class="totals-row">
          <td colspan="2"><strong>TOTALS</strong></td>
          <td class="num right">${esc(String(p.totals.shifts))}</td>
          <td class="num right">${esc(String(p.totals.headcount))}</td>
          <td class="num right font-bold">${esc(inr(p.totals.billing))}</td>
          <td class="num right">${esc(inr(p.totals.payout))}</td>
          <td class="num right">${esc(inr(p.totals.contractorCut))}</td>
          <td class="num right font-bold" style="color: #059669">${esc(inr(p.totals.margin))}</td>
          <td class="num right font-bold">${esc(String(p.totals.marginPct))}%</td>
        </tr>
      </tbody>
    </table>

    ${p.contractors && p.contractors.length > 0 ? `
    <div class="section-title">Sub-Contractor Payouts Summary</div>
    <table>
      <thead>
        <tr>
          <th style="width: 28px">#</th>
          <th>Contractor Partner</th>
          <th class="right">Shifts Provided</th>
          <th class="right">Workers Count</th>
          <th class="right">Commission Payable</th>
        </tr>
      </thead>
      <tbody>
        ${contractorRows}
      </tbody>
    </table>
    ` : ""}

    <div class="footer">
      <div>Garuda ERP Manpower Operations • Official Record</div>
      <div>Operations Head: ________________________</div>
    </div>
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Transport Master Statement HTML Generator
// ---------------------------------------------------------------------------

export interface TransportMasterPrintParams {
  businessName: string;
  periodLabel: string;
  totals: {
    tripsCount: number;
    revenue: number;
    collected: number;
    pending: number;
    opex: number;
    emi: number;
    net: number;
    marginPct: number;
  };
  rows: Array<{
    vehicleName: string;
    registration: string;
    tripsCount: number;
    revenue: number;
    opex: number;
    emi: number;
    net: number;
    marginPct: number;
  }>;
  trips?: Array<{
    date: string;
    vehicle: string;
    client: string;
    rentalType: string;
    fare: number;
    paid: number;
    pending: number;
  }>;
}

export function buildTransportMasterHtml(p: TransportMasterPrintParams): string {
  const genAt = new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const vehicleRows = p.rows.map((v, idx) => `
    <tr>
      <td class="num">${idx + 1}</td>
      <td><strong>${esc(v.vehicleName)}</strong> <span style="font-size: 10px; color: #64748b">(${esc(v.registration)})</span></td>
      <td class="num right">${esc(String(v.tripsCount))}</td>
      <td class="num right font-semibold">${esc(inr(v.revenue))}</td>
      <td class="num right">${esc(inr(v.opex))}</td>
      <td class="num right">${esc(inr(v.emi))}</td>
      <td class="num right font-bold" style="color: ${v.net >= 0 ? "#059669" : "#dc2626"}">${esc(inr(v.net))}</td>
      <td class="num right">${esc(String(v.marginPct))}%</td>
    </tr>
  `).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Transport Master Statement — ${esc(p.periodLabel)}</title>
  <style>${COMMON_STYLES}</style>
</head>
<body>
  <div class="sheet">
    <div class="letterhead">
      <div class="brand">
        <div class="logo-badge">T</div>
        <div>
          <div class="brand-name">${esc(p.businessName || "Garuda ERP")}</div>
          <div class="brand-sub">Transport Fleet Operational & Financial Statement</div>
        </div>
      </div>
      <div class="doc-title-block">
        <h1 class="doc-title">TRANSPORT MASTER STATEMENT</h1>
        <p class="period">Period: ${esc(p.periodLabel)}</p>
        <p class="generated">Generated: ${esc(genAt)}</p>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-box highlight">
        <div class="k">FLEET REVENUE</div>
        <div class="v" style="color: #059669">${esc(inr(p.totals.revenue))}</div>
      </div>
      <div class="kpi-box">
        <div class="k">OPEX (FUEL / SERVICE)</div>
        <div class="v">${esc(inr(p.totals.opex))}</div>
      </div>
      <div class="kpi-box warning">
        <div class="k">VEHICLE LOAN EMIS</div>
        <div class="v">${esc(inr(p.totals.emi))}</div>
      </div>
      <div class="kpi-box ${p.totals.net >= 0 ? "highlight" : "warning"}">
        <div class="k">NET PROFIT (${p.totals.marginPct}%)</div>
        <div class="v" style="color: ${p.totals.net >= 0 ? "#059669" : "#dc2626"}">${esc(inr(p.totals.net))}</div>
      </div>
    </div>

    <div class="section-title">Fleet Vehicles Profitability Summary</div>
    <table>
      <thead>
        <tr>
          <th style="width: 28px">#</th>
          <th>Vehicle</th>
          <th class="right">Trips</th>
          <th class="right">Revenue</th>
          <th class="right">Fuel/Repairs</th>
          <th class="right">Loan EMI</th>
          <th class="right">Net Profit</th>
          <th class="right">Margin %</th>
        </tr>
      </thead>
      <tbody>
        ${vehicleRows}
        <tr class="totals-row">
          <td colspan="2"><strong>FLEET TOTALS</strong></td>
          <td class="num right">${esc(String(p.totals.tripsCount))}</td>
          <td class="num right font-bold">${esc(inr(p.totals.revenue))}</td>
          <td class="num right">${esc(inr(p.totals.opex))}</td>
          <td class="num right">${esc(inr(p.totals.emi))}</td>
          <td class="num right font-bold" style="color: #059669">${esc(inr(p.totals.net))}</td>
          <td class="num right font-bold">${esc(String(p.totals.marginPct))}%</td>
        </tr>
      </tbody>
    </table>

    <div class="footer">
      <div>Garuda ERP Transport Logistics • Official Fleet Statement</div>
      <div>Fleet Incharge: ________________________</div>
    </div>
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Comprehensive Period Closure Dossier HTML Generator
// ---------------------------------------------------------------------------

export interface PeriodClosureDossierPrintParams {
  businessName: string;
  closingCutoff: string;
  period: string;
  dossier: {
    executiveSummary: {
      totalRevenue: number;
      manpowerBilling: number;
      transportBilling: number;
      rentIncome: number;
      totalLaborCost: number;
      grossProfit: number;
      totalOpex: number;
      netProfit: number;
      netMarginPct: number;
    };
    cashLedger: {
      totalInflow: number;
      propertyCollections: number;
      tripCollections: number;
      totalOutflow: number;
      advancesDisbursed: number;
      settlementsPaid: number;
      opexPaid: number;
      emiPaid: number;
      netCashFlow: number;
    };
    carriedForwardBalances: {
      propertyReceivables: number;
      unrecoveredAdvancesCount: number;
      unrecoveredAdvancesTotal: number;
      unrecoveredAdvancesList: Array<{
        employeeName: string;
        code: string;
        amount: number;
        recovered: number;
        outstanding: number;
        date: string;
      }>;
    };
    archivableRecordCounts: {
      deployments: number;
      trips: number;
      propertyPayments: number;
      expenses: number;
      settlements: number;
    };
  };
}

export function buildPeriodClosureDossierHtml(p: PeriodClosureDossierPrintParams): string {
  const genAt = new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const d = p.dossier;

  const advanceRows = d.carriedForwardBalances.unrecoveredAdvancesList.map((a, idx) => `
    <tr>
      <td class="num">${idx + 1}</td>
      <td><strong>${esc(a.employeeName)}</strong> (${esc(a.code)})</td>
      <td>${esc(fmtDay(a.date))}</td>
      <td class="num right">${esc(inr(a.amount))}</td>
      <td class="num right">${esc(inr(a.recovered))}</td>
      <td class="num right font-bold" style="color: #dc2626">${esc(inr(a.outstanding))}</td>
    </tr>
  `).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Period Closure Dossier — Through ${esc(p.closingCutoff)}</title>
  <style>${COMMON_STYLES}</style>
</head>
<body>
  <div class="sheet">
    <div class="letterhead">
      <div class="brand">
        <div class="logo-badge">🏛️</div>
        <div>
          <div class="brand-name">${esc(p.businessName || "Garuda ERP")}</div>
          <div class="brand-sub">Official Historical Period Closing &amp; Reset Dossier</div>
        </div>
      </div>
      <div class="doc-title-block">
        <h1 class="doc-title">PERIOD CLOSURE DOSSIER</h1>
        <p class="period">Closed Through Cutoff: ${esc(p.closingCutoff)}</p>
        <p class="generated">Stamped: ${esc(genAt)}</p>
      </div>
    </div>

    <div class="entity-card">
      <div>
        <p class="k">HISTORICAL PERIOD</p>
        <p class="v">${esc(p.period)}</p>
      </div>
      <div>
        <p class="k">NET HISTORICAL PROFIT</p>
        <p class="v" style="color: ${d.executiveSummary.netProfit >= 0 ? "#059669" : "#dc2626"}">${esc(inr(d.executiveSummary.netProfit))}</p>
      </div>
      <div>
        <p class="k">NET CASH GENERATED</p>
        <p class="v">${esc(inr(d.cashLedger.netCashFlow))}</p>
      </div>
      <div>
        <p class="k">CLOSING STATUS</p>
        <p class="v" style="color: #059669">AUDITED &amp; SEALED</p>
      </div>
    </div>

    <div class="section-title">1. Financial Performance Summary</div>
    <table>
      <tbody>
        <tr>
          <td><strong>Total Gross Revenue Generated</strong> (Manpower + Transport + Rent)</td>
          <td class="num right font-bold" style="color: #059669">${esc(inr(d.executiveSummary.totalRevenue))}</td>
        </tr>
        <tr>
          <td>&nbsp;&nbsp;· Manpower Shift Deployments Billing</td>
          <td class="num right">${esc(inr(d.executiveSummary.manpowerBilling))}</td>
        </tr>
        <tr>
          <td>&nbsp;&nbsp;· Transport Fleet Rental Billings</td>
          <td class="num right">${esc(inr(d.executiveSummary.transportBilling))}</td>
        </tr>
        <tr>
          <td>&nbsp;&nbsp;· Staff Accommodation Business Rent Accrual</td>
          <td class="num right">${esc(inr(d.executiveSummary.rentIncome))}</td>
        </tr>
        <tr>
          <td><strong>Total Labor &amp; Service Cost</strong> (Wages + Salary + Overtime + Contractor)</td>
          <td class="num right font-semibold">${esc(inr(d.executiveSummary.totalLaborCost))}</td>
        </tr>
        <tr>
          <td><strong>Total Operating Expenses &amp; EMIs</strong></td>
          <td class="num right font-semibold">${esc(inr(d.executiveSummary.totalOpex))}</td>
        </tr>
        <tr class="totals-row">
          <td><strong>FINAL NET PROFIT FOR CLOSED PERIOD</strong></td>
          <td class="num right" style="color: ${d.executiveSummary.netProfit >= 0 ? "#059669" : "#dc2626"}; font-size: 14px;">
            ${esc(inr(d.executiveSummary.netProfit))} (${d.executiveSummary.netMarginPct}%)
          </td>
        </tr>
      </tbody>
    </table>

    <div class="section-title">2. Carried Forward Balances Into New Period</div>
    <p style="font-size: 11px; color: #475569; margin: -4px 0 8px;">
      The following balances will be seamlessly carried forward into the fresh period to ensure zero financial loss.
    </p>
    <table>
      <tbody>
        <tr>
          <td><strong>Outstanding Property Client Receivables</strong> (Carried as opening dues)</td>
          <td class="num right font-bold" style="color: #d97706">${esc(inr(d.carriedForwardBalances.propertyReceivables))}</td>
        </tr>
        <tr>
          <td><strong>Active Unrecovered Staff Advances</strong> (${d.carriedForwardBalances.unrecoveredAdvancesCount} employees preserved)</td>
          <td class="num right font-bold" style="color: #dc2626">${esc(inr(d.carriedForwardBalances.unrecoveredAdvancesTotal))}</td>
        </tr>
      </tbody>
    </table>

    ${advanceRows ? `
    <div class="section-title">Preserved Advance Balances Detail</div>
    <table>
      <thead>
        <tr>
          <th style="width: 28px">#</th>
          <th>Employee</th>
          <th>Advance Date</th>
          <th class="right">Total Given</th>
          <th class="right">Recovered</th>
          <th class="right">Carried Forward Due</th>
        </tr>
      </thead>
      <tbody>
        ${advanceRows}
      </tbody>
    </table>
    ` : ""}

    <div class="section-title">3. Transaction Records to be Archived</div>
    <table>
      <tbody>
        <tr>
          <td>Deployment Shift Records: <strong>${d.archivableRecordCounts.deployments}</strong></td>
          <td>Trip &amp; Rental Records: <strong>${d.archivableRecordCounts.trips}</strong></td>
        </tr>
        <tr>
          <td>Property Payment Records: <strong>${d.archivableRecordCounts.propertyPayments}</strong></td>
          <td>Operating Expense Records: <strong>${d.archivableRecordCounts.expenses}</strong></td>
        </tr>
        <tr>
          <td colspan="2">Finalized Settlements: <strong>${d.archivableRecordCounts.settlements}</strong> (Master profiles preserved)</td>
        </tr>
      </tbody>
    </table>

    <div class="footer">
      <div>This document serves as the permanent legal historical record of Garuda ERP prior to period reset.</div>
      <div>Authorized Signatory / Executive Partner: ________________________</div>
    </div>
  </div>
</body>
</html>`;
}

