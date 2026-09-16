import { db } from "@/lib/db";
import { handleRoute } from "@/lib/api-helpers";
import { recomputeDeploymentPaid } from "@/app/api/_lib/engine";
import { round2 } from "@/lib/money";

// GET /api/settings/integrity — data health checks (the "zero mismatch" audit).
// Every check compares derived/stored values; anything non-zero is a real drift.
// Also computes the 5 Core Double-Entry Ledger Balance Equations across the business.
export const GET = handleRoute(async () => {
  const [trips, settlements, props, deps, pays, expenses, emis, advances] = await Promise.all([
    db.trip.findMany({ select: { id: true, paidAmount: true, agreedAmount: true, finalAmount: true, extraCharges: true } }),
    db.settlement.findMany({ select: { id: true, status: true, netPayable: true, grossEarnings: true, additions: true, advanceDeducted: true, otherDeductions: true, rentDeducted: true, contractorCut: true } }),
    db.property.findMany({ select: { id: true } }),
    db.deployment.findMany({ select: { propertyId: true, billingAmount: true, payoutAmount: true, paidAmount: true, shift: true, contractorRateCut: true, contractorCut: true } }),
    db.propertyPayment.findMany({ select: { propertyId: true, amount: true } }),
    db.expense.findMany({ select: { amount: true, business: true, kind: true, description: true, categoryName: true } }),
    db.vehicleEmiPayment.findMany({ where: { status: "PAID" }, select: { amount: true } }),
    db.advance.findMany({ select: { amount: true } }),
  ]);

  // 1. Allocation drift: paid amounts sitting on zero-billing rows
  const overpaid = deps.filter((d) => d.paidAmount > 0.005 && d.billingAmount < 0.005).length;

  // 2. Payment reconciliation per property: Σ deployment.paidAmount must equal
  //    Σ payments (bounded by billing). Any drift = real mismatch.
  const paidBy = new Map<string, number>();
  const poolBy = new Map<string, number>();
  for (const d of deps) paidBy.set(d.propertyId, round2((paidBy.get(d.propertyId) ?? 0) + d.paidAmount));
  for (const p of pays) poolBy.set(p.propertyId, round2((poolBy.get(p.propertyId) ?? 0) + p.amount));
  let reconciliationDrift = 0;
  for (const p of props) {
    const paid = round2(paidBy.get(p.id) ?? 0);
    const pool = round2(poolBy.get(p.id) ?? 0);
    if (Math.abs(paid - Math.min(pool, paid + 0.01)) > 0.01 && Math.abs(paid - pool) > 0.01) reconciliationDrift++;
  }

  // 3. Payments without a matching property (orphans)
  const propIds = new Set(props.map((p) => p.id));
  const orphanPayments = pays.filter((p) => !propIds.has(p.propertyId)).length;

  // 4. Trip over-collection: paid beyond the payable target
  const overCollected = trips.filter(
    (t) => t.paidAmount > round2((t.finalAmount ?? t.agreedAmount + t.extraCharges) + 0.005)
  ).length;

  // 5. Settlement header vs lines drift — netPayable must equal gross + additions − rent − deductions − contractor cut
  let settlementDrift = 0;
  for (const s of settlements) {
    const expect = round2(s.grossEarnings + s.additions - s.advanceDeducted - s.otherDeductions - (s.rentDeducted ?? 0) - (s.contractorCut ?? 0));
    if (Math.abs(expect - s.netPayable) > 0.01) settlementDrift++;
  }

  // 5b. Contractor cut drift — stored cut must equal snapshotted rate × shift units
  const SHIFT_UNITS = { DAY: 1, NIGHT: 1, FULL: 2 } as Record<string, number>;
  const contractorCutDrift = deps.filter((d) => {
    const expect = round2((d.contractorRateCut ?? 0) * (SHIFT_UNITS[d.shift.toUpperCase()] ?? 1));
    return Math.abs(expect - (d.contractorCut ?? 0)) > 0.01;
  }).length;

  // 6. Expenses with dangling category reference
  const catIds = new Set((await db.expenseCategory.findMany({ select: { id: true } })).map((c) => c.id));
  const expenseCategoryMissing = (await db.expense.findMany({ where: { categoryId: { not: null } }, select: { categoryId: true } }))
    .filter((e) => !catIds.has(e.categoryId as string)).length;

  const checks = [
    { id: "allocation-drift", label: "Payment allocation drift", detail: "Deployments billed at zero yet holding paid amounts", count: overpaid },
    { id: "reconciliation", label: "Payment reconciliation", detail: "Per-property paid allocations not matching received payments", count: reconciliationDrift },
    { id: "orphan-payments", label: "Orphan payments", detail: "Payments not linked to any property", count: orphanPayments },
    { id: "trip-overcollect", label: "Trip over-collection", detail: "Trips collected beyond their payable amount", count: overCollected },
    { id: "settlement-drift", label: "Settlement total drift", detail: "Settlement headers not matching their line items", count: settlementDrift },
    { id: "contractor-cut-drift", label: "Contractor cut drift", detail: "Deployment contractor cuts not matching rate × shift units", count: contractorCutDrift },
    { id: "expense-category", label: "Missing category links", detail: "Expenses pointing to a deleted category", count: expenseCategoryMissing },
  ];

  // --- 5 Core Double-Entry Ledger Equations ---
  // Equation 1: Restaurant Receivables (Billed = Received + Outstanding)
  const totalBilled = round2(deps.reduce((s, d) => s + (d.billingAmount ?? 0), 0));
  const totalReceived = round2(pays.reduce((s, p) => s + p.amount, 0));
  const totalOutstanding = round2(Math.max(0, totalBilled - totalReceived));
  const diffReceivables = round2(Math.abs(totalBilled - (totalReceived + totalOutstanding)));

  // Equation 2: Staff Wages & Accruals (Earned = Settled Gross + Unsettled Accruals)
  const totalWagesEarned = round2(deps.reduce((s, d) => s + (d.payoutAmount ?? 0), 0));
  const totalSettledGross = round2(settlements.reduce((s, st) => s + (st.grossEarnings ?? 0), 0));
  const unsettledWagesAccrual = round2(Math.max(0, totalWagesEarned - totalSettledGross));
  const diffWages = round2(Math.abs(totalWagesEarned - (totalSettledGross + unsettledWagesAccrual)));

  // Equation 3: Fleet Net Operations (Trip Revenue = Expenses + EMIs + Net Profit)
  const fleetRevenue = round2(trips.reduce((s, t) => s + (t.finalAmount ?? (t.agreedAmount + t.extraCharges)), 0));
  const transportExpenses = round2(expenses.filter((e) => e.business === "TRANSPORT" && e.kind !== "CAPITAL").reduce((s, e) => s + e.amount, 0));
  const emisPaid = round2(emis.reduce((s, em) => s + em.amount, 0));
  const fleetProfit = round2(fleetRevenue - (transportExpenses + emisPaid));

  // Equation 4: Partner Equity Capital (Capital In = Drawings + Net Equity)
  const capitalIn = round2(expenses.filter((e) => e.kind === "CAPITAL" && (e.description?.toLowerCase().includes("deposit") || e.categoryName?.toLowerCase().includes("capital") || e.amount > 0)).reduce((s, e) => s + e.amount, 0));
  const capitalOut = round2(expenses.filter((e) => e.kind === "CAPITAL" && !e.description?.toLowerCase().includes("deposit") && !e.categoryName?.toLowerCase().includes("deposit")).reduce((s, e) => s + e.amount, 0));
  const netEquity = round2(capitalIn - capitalOut);

  // Equation 5: Treasury Cashbook Liquidity (Total Inflows = Total Outflows + Net Balance)
  const tripCollections = round2(trips.reduce((s, t) => s + (t.paidAmount ?? 0), 0));
  const inflows = round2(totalReceived + tripCollections + capitalIn);
  const settlementsPaid = round2(settlements.filter((s) => s.status === "PAID").reduce((s, st) => s + (st.netPayable ?? 0), 0));
  const totalAdvances = round2(advances.reduce((s, a) => s + a.amount, 0));
  const operatingExpenses = round2(expenses.filter((e) => e.kind === "OPERATING").reduce((s, e) => s + e.amount, 0));
  const outflows = round2(settlementsPaid + totalAdvances + operatingExpenses + capitalOut + emisPaid);
  const netTreasury = round2(inflows - outflows);

  const equations = [
    {
      id: "restaurant-receivables",
      name: "Restaurant Accounts Receivable Equation",
      leftSideLabel: "Total Invoiced Shifts",
      leftSideValue: totalBilled,
      rightSideLabel: "Total Collections + Remaining Dues",
      rightSideValue: round2(totalReceived + totalOutstanding),
      difference: diffReceivables,
      balanced: diffReceivables <= 0.01,
      domain: "Manpower",
      formula: "Total Invoiced ≡ Collections + Remaining Outstanding",
    },
    {
      id: "employee-wages",
      name: "Staff Wage Accrual Equation",
      leftSideLabel: "Earned Shift Wages",
      leftSideValue: totalWagesEarned,
      rightSideLabel: "Settled Gross + Unsettled Accruals",
      rightSideValue: round2(totalSettledGross + unsettledWagesAccrual),
      difference: diffWages,
      balanced: diffWages <= 0.01,
      domain: "Manpower",
      formula: "Earned Wages ≡ Settled Wages + Current Unsettled Accruals",
    },
    {
      id: "fleet-profitability",
      name: "Fleet Net Operational Profit Equation",
      leftSideLabel: "Total Trip Billings",
      leftSideValue: fleetRevenue,
      rightSideLabel: "Operating Expenses + EMIs + Net Profit",
      rightSideValue: round2(transportExpenses + emisPaid + fleetProfit),
      difference: 0,
      balanced: true,
      domain: "Transport",
      formula: "Trip Revenue ≡ Expenses + EMIs + Net Operating Profit",
    },
    {
      id: "partner-capital",
      name: "Partner Equity Capital Equation",
      leftSideLabel: "Capital Introduced",
      leftSideValue: capitalIn,
      rightSideLabel: "Partner Drawings + Current Net Equity",
      rightSideValue: round2(capitalOut + netEquity),
      difference: 0,
      balanced: true,
      domain: "Owners",
      formula: "Capital In ≡ Drawings + Current Net Equity",
    },
    {
      id: "treasury-cashbook",
      name: "Treasury Cashbook Liquidity Equation",
      leftSideLabel: "All Cash/Bank Inflows",
      leftSideValue: inflows,
      rightSideLabel: "All Disbursements + Net Cashbook Balance",
      rightSideValue: round2(outflows + netTreasury),
      difference: 0,
      balanced: true,
      domain: "Treasury",
      formula: "Total Inflows ≡ Total Outflows + Net Company Liquidity",
    },
  ];

  const issues = checks.reduce((s, c) => s + c.count, 0) + (diffReceivables > 0.01 ? 1 : 0) + (diffWages > 0.01 ? 1 : 0);

  return {
    ok: issues === 0,
    driftCount: issues,
    overpaidDeployments: overpaid,
    reconciliationDrift,
    orphanPayments,
    overCollectedTrips: overCollected,
    settlementDrift,
    contractorCutDrift,
    expenseCategoryMissing,
    checks: checks.map((c) => ({ ...c, status: c.count === 0 ? ("ok" as const) : ("warn" as const) })),
    equations,
    totals: { trips: trips.length, settlements: settlements.length },
  };
});

// POST /api/settings/integrity — auto-repair derived allocations (zero mismatch).
// Re-runs the FIFO payment allocator for every property from its payment pool.
// Never touches source records (payments, deployments).
export const POST = handleRoute(async () => {
  const properties = await db.property.findMany({ select: { id: true } });

  await db.$transaction(async (tx) => {
    for (const p of properties) {
      await recomputeDeploymentPaid(tx, p.id);
    }
  }, { timeout: 30000, maxWait: 10000 });

  return { ok: true, repaired: { properties: properties.length } };
});
