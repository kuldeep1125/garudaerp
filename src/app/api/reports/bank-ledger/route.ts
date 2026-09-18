import { db } from "@/lib/db";
import { handleRoute } from "@/lib/api-helpers";
import { round2 } from "@/lib/money";
import { dayKey, reportRange } from "@/app/api/_lib/engine";

// GET /api/reports/bank-ledger?from=&to=&business=
// Consolidated Bank & Cash Book / Cash Flow Statement.
// Tracks all liquid inflows & outflows across Manpower & Transport.
export const GET = handleRoute(async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const { from, to } = reportRange(sp);
  const businessFilter = sp.get("business")?.toUpperCase();

  const includeManpower = !businessFilter || businessFilter === "MANPOWER";
  const includeTransport = !businessFilter || businessFilter === "TRANSPORT";

  const [
    propertyPayments,
    trips,
    advances,
    settlements,
    expenses,
    emiPayments,
  ] = await Promise.all([
    // 1. Manpower Collections
    includeManpower
      ? db.propertyPayment.findMany({
          where: { date: { gte: from, lte: to } },
          include: { property: { select: { name: true } } },
          orderBy: { date: "asc" },
        })
      : Promise.resolve([]),

    // 2. Transport Trip Collections (where paidAmount > 0)
    includeTransport
      ? db.trip.findMany({
          where: {
            startAt: { gte: from, lte: to },
            paidAmount: { gt: 0 },
            status: { not: "CANCELLED" },
          },
          include: {
            client: { select: { name: true } },
            vehicle: { select: { name: true, registrationNumber: true } },
          },
          orderBy: { startAt: "asc" },
        })
      : Promise.resolve([]),

    // 3. Employee Advances Disbursed (Cash Outflow)
    includeManpower
      ? db.advance.findMany({
          where: { date: { gte: from, lte: to } },
          include: { employee: { select: { fullName: true, code: true } } },
          orderBy: { date: "asc" },
        })
      : Promise.resolve([]),

    // 4. Employee Settlements Finalized / Paid (Cash Outflow)
    includeManpower
      ? db.settlement.findMany({
          where: {
            updatedAt: { gte: from, lte: to },
            status: { in: ["FINALIZED", "PAID"] },
            netPayable: { gt: 0 },
          },
          include: { employee: { select: { fullName: true, code: true } } },
          orderBy: { updatedAt: "asc" },
        })
      : Promise.resolve([]),

    // 5. Operating & Capital Expenses
    db.expense.findMany({
      where: {
        date: { gte: from, lte: to },
        ...(businessFilter ? { business: businessFilter } : {}),
      },
      orderBy: { date: "asc" },
    }),

    // 6. Vehicle EMI Outflows
    includeTransport
      ? db.vehicleEmiPayment.findMany({
          where: {
            status: "PAID",
            paidDate: { gte: from, lte: to },
          },
          include: { vehicle: { select: { name: true, registrationNumber: true } } },
          orderBy: { paidDate: "asc" },
        })
      : Promise.resolve([]),
  ]);

  interface LedgerRow {
    id: string;
    date: string;
    timestamp: number;
    business: "MANPOWER" | "TRANSPORT" | "GENERAL";
    category: string;
    entity: string;
    description: string;
    mode: string;
    inflow: number;
    outflow: number;
    balance: number;
  }

  const entries: Omit<LedgerRow, "balance">[] = [];

  // Add Property Payments (Inflow)
  for (const p of propertyPayments) {
    entries.push({
      id: `prop-pay-${p.id}`,
      date: dayKey(p.date),
      timestamp: p.date.getTime(),
      business: "MANPOWER",
      category: "Property Collection",
      entity: p.property.name,
      description: p.reference ? `Ref: ${p.reference}` : "Billing settlement",
      mode: p.method ?? "BANK",
      inflow: round2(p.amount),
      outflow: 0,
    });
  }

  // Add Trip Collections (Inflow)
  for (const t of trips) {
    entries.push({
      id: `trip-pay-${t.id}`,
      date: dayKey(t.startAt),
      timestamp: t.startAt.getTime(),
      business: "TRANSPORT",
      category: "Transport Fare Collection",
      entity: t.client.name,
      description: `${t.vehicle.name} (${t.rentalType})`,
      mode: "DIRECT",
      inflow: round2(t.paidAmount),
      outflow: 0,
    });
  }

  // Add Employee Advance Disbursements (Outflow)
  for (const a of advances) {
    entries.push({
      id: `adv-${a.id}`,
      date: dayKey(a.date),
      timestamp: a.date.getTime(),
      business: "MANPOWER",
      category: "Staff Advance Disbursed",
      entity: `${a.employee.fullName} (${a.employee.code})`,
      description: a.reason ?? "Salary advance",
      mode: a.method ?? "CASH",
      inflow: 0,
      outflow: round2(a.amount),
    });
  }

  // Add Settlement Payouts (Outflow)
  for (const s of settlements) {
    entries.push({
      id: `settle-${s.id}`,
      date: dayKey(s.updatedAt),
      timestamp: s.updatedAt.getTime(),
      business: "MANPOWER",
      category: "Settlement Payout",
      entity: `${s.employee.fullName} (${s.employee.code})`,
      description: `Payroll for month ${s.month}`,
      mode: "BANK",
      inflow: 0,
      outflow: round2(s.netPayable),
    });
  }

  // Add Operating & Capital Expenses
  for (const e of expenses) {
    const isCapital = e.kind === "CAPITAL";
    const catName = (e.categoryName ?? "").toUpperCase();
    const isDeposit = isCapital && (catName.includes("CONTRIBUTION") || catName.includes("DEPOSIT") || catName.includes("INVEST"));
    const isRefund = e.kind === "REFUND";

    if (isDeposit || isRefund) {
      entries.push({
        id: `exp-in-${e.id}`,
        date: dayKey(e.date),
        timestamp: e.date.getTime(),
        business: (e.business as "MANPOWER" | "TRANSPORT") ?? "GENERAL",
        category: isDeposit ? "Owner Capital Deposit" : "Expense Refund Credit",
        entity: e.spentByName ?? "Business Owner",
        description: e.description ?? (e.categoryName ?? "Deposit"),
        mode: "BANK",
        inflow: round2(e.amount),
        outflow: 0,
      });
    } else {
      entries.push({
        id: `exp-out-${e.id}`,
        date: dayKey(e.date),
        timestamp: e.date.getTime(),
        business: (e.business as "MANPOWER" | "TRANSPORT") ?? "GENERAL",
        category: isCapital ? "Owner Withdrawal (Capital)" : (e.categoryName ?? "Operating Expense"),
        entity: e.spentByName ?? (e.vehicleName ? `Vehicle: ${e.vehicleName}` : "Vendor"),
        description: e.description ?? (e.categoryName ?? "Business Expense"),
        mode: "ONLINE",
        inflow: 0,
        outflow: round2(e.amount),
      });
    }
  }

  // Add Vehicle EMI Outflows
  for (const emi of emiPayments) {
    const d = emi.paidDate ?? new Date();
    entries.push({
      id: `emi-${emi.id}`,
      date: dayKey(d),
      timestamp: d.getTime(),
      business: "TRANSPORT",
      category: "Vehicle Loan EMI",
      entity: `${emi.vehicle.name} (${emi.vehicle.registrationNumber})`,
      description: `Month: ${emi.month} · ${emi.reference ?? "Loan EMI"}`,
      mode: "AUTO-DEBIT",
      inflow: 0,
      outflow: round2(emi.amount),
    });
  }

  // Sort ascending by timestamp to calculate running balance
  entries.sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));

  let currentBal = 0;
  const chronologicalRows: LedgerRow[] = entries.map((e) => {
    currentBal = round2(currentBal + e.inflow - e.outflow);
    return {
      ...e,
      balance: currentBal,
    };
  });

  // Presentation rows: reverse chronological (newest first)
  const rows = [...chronologicalRows].reverse();

  const totalInflow = round2(entries.reduce((s, r) => s + r.inflow, 0));
  const totalOutflow = round2(entries.reduce((s, r) => s + r.outflow, 0));
  const netCashFlow = round2(totalInflow - totalOutflow);

  // Category aggregations for the breakdown summary
  const streamMap = new Map<string, { category: string; inflow: number; outflow: number; count: number }>();
  for (const e of entries) {
    const existing = streamMap.get(e.category) ?? { category: e.category, inflow: 0, outflow: 0, count: 0 };
    existing.inflow = round2(existing.inflow + e.inflow);
    existing.outflow = round2(existing.outflow + e.outflow);
    existing.count += 1;
    streamMap.set(e.category, existing);
  }

  const streams = Array.from(streamMap.values()).sort((a, b) => (b.inflow + b.outflow) - (a.inflow + a.outflow));

  return {
    columns: [
      { key: "date", label: "Date", type: "date" },
      { key: "category", label: "Category", type: "string" },
      { key: "entity", label: "Party / Entity", type: "string" },
      { key: "description", label: "Description / Ref", type: "string" },
      { key: "mode", label: "Mode", type: "string" },
      { key: "inflow", label: "Inflow (Money In)", type: "money" },
      { key: "outflow", label: "Outflow (Money Out)", type: "money" },
      { key: "balance", label: "Running Net", type: "money" },
    ],
    rows,
    totals: {
      inflow: totalInflow,
      outflow: totalOutflow,
      net: netCashFlow,
      count: rows.length,
    },
    streams,
    meta: {
      period: `${dayKey(from)} → ${dayKey(to)}`,
      totalInflows: totalInflow,
      totalOutflows: totalOutflow,
      netCashFlow,
      transactions: rows.length,
    },
    note: "Cash & Bank Statement tracking all money received (collections, trips, capital) and disbursed (advances, settlements, OPEX, EMI, owner drawings).",
  };
});
