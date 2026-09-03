import { db } from "@/lib/db";
import { handleRoute } from "@/lib/api-helpers";
import { recomputeDeploymentPaid } from "@/app/api/_lib/engine";
import { round2 } from "@/lib/money";

// GET /api/settings/integrity — data health checks (the "zero mismatch" audit).
// Every check compares derived/stored values; anything non-zero is a real drift.
export const GET = handleRoute(async () => {
  const [trips, settlements] = await Promise.all([
    db.trip.findMany({ select: { id: true, paidAmount: true, agreedAmount: true, finalAmount: true, extraCharges: true } }),
    db.settlement.findMany({ select: { id: true, netPayable: true, grossEarnings: true, additions: true, advanceDeducted: true, otherDeductions: true } }),
  ]);

  // 1. Deployment paid-drift: paid amounts on zero-billing billable rows
  const overpaid = await db.deployment.count({
    where: { paidAmount: { gt: 0.005 }, billingAmount: { lt: 0.005 }, status: { in: ["CONFIRMED", "COMPLETED", "PARTIAL"] } },
  });

  // 2. Paid cancellations: cancelled deployments still holding allocated money
  const paidCancelled = await db.deployment.count({
    where: { paidAmount: { gt: 0.005 }, status: "CANCELLED" },
  });

  // 3. Payments without a matching property (orphans)
  const orphanPayments = await db.propertyPayment.count({
    where: { propertyId: { notIn: (await db.property.findMany({ select: { id: true } })).map((p) => p.id) } },
  });

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
    { id: "paid-cancelled", label: "Paid cancellations", detail: "Cancelled deployments still holding allocated money", count: paidCancelled },
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
// Re-runs the FIFO payment allocator for every property and zeroes paid amounts
// on cancelled deployments. Never touches source records (payments, deployments).
export const POST = handleRoute(async () => {
  const [properties, cancelled] = await Promise.all([
    db.property.findMany({ select: { id: true } }),
    db.deployment.findMany({ where: { paidAmount: { gt: 0.005 }, status: "CANCELLED" }, select: { id: true, propertyId: true } }),
  ]);

  await db.$transaction(async (tx) => {
    for (const c of cancelled) {
      await tx.deployment.update({ where: { id: c.id }, data: { paidAmount: 0 } });
    }
    for (const p of properties) {
      await recomputeDeploymentPaid(tx, p.id);
    }
  }, { timeout: 30000, maxWait: 10000 });

  return { ok: true, repaired: { properties: properties.length, cancelledCleaned: cancelled.length } };
});
