import { db } from "@/lib/db";
import { handleRoute } from "@/lib/api-helpers";
import { recomputeDeploymentPaid } from "@/app/api/_lib/engine";
import { round2 } from "@/lib/money";

// GET /api/settings/integrity — data health checks (the "zero mismatch" audit).
// Every check compares derived/stored values; anything non-zero is a real drift.
export const GET = handleRoute(async () => {
  const [trips, settlements, props, deps, pays] = await Promise.all([
    db.trip.findMany({ select: { id: true, paidAmount: true, agreedAmount: true, finalAmount: true, extraCharges: true } }),
    db.settlement.findMany({ select: { id: true, netPayable: true, grossEarnings: true, additions: true, advanceDeducted: true, otherDeductions: true } }),
    db.property.findMany({ select: { id: true } }),
    db.deployment.findMany({ select: { propertyId: true, billingAmount: true, paidAmount: true } }),
    db.propertyPayment.findMany({ select: { propertyId: true, amount: true } }),
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

  // 5. Settlement header vs lines drift — netPayable must equal gross + additions − deductions
  let settlementDrift = 0;
  for (const s of settlements) {
    const expect = round2(s.grossEarnings + s.additions - s.advanceDeducted - s.otherDeductions);
    if (Math.abs(expect - s.netPayable) > 0.01) settlementDrift++;
  }

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
    { id: "expense-category", label: "Missing category links", detail: "Expenses pointing to a deleted category", count: expenseCategoryMissing },
  ];

  const issues = checks.reduce((s, c) => s + c.count, 0);
  return {
    ok: issues === 0,
    checks: checks.map((c) => ({ ...c, status: c.count === 0 ? ("ok" as const) : ("warn" as const) })),
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
