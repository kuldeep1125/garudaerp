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
