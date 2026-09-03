import { db } from "@/lib/db";
import { handleRoute, readBody, requireFields, parseDate, parsePage, HttpError } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { round2 } from "@/lib/money";
import { requirePositiveAmount, recomputeDeploymentPaid, startOfDay } from "@/app/api/_lib/engine";

export const GET = handleRoute(async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const { page, pageSize, skip } = parsePage(sp);
  const where: Record<string, unknown> = {};
  const propertyId = sp.get("propertyId");
  const from = sp.get("from");
  const to = sp.get("to");
  if (propertyId) where.propertyId = propertyId;
  if (from && to) where.date = { gte: startOfDay(parseDate(from)), lte: endOfDayInclusive(to) };
  else if (from) where.date = { gte: startOfDay(parseDate(from)) };
  else if (to) where.date = { lte: endOfDayInclusive(to) };

  const [rows, total, agg] = await Promise.all([
    db.propertyPayment.findMany({
      where,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      skip,
      take: pageSize,
      include: { property: { select: { name: true } } },
    }),
    db.propertyPayment.count({ where }),
    db.propertyPayment.aggregate({ where, _sum: { amount: true } }),
  ]);
  const items = rows.map(({ property, ...p }) => ({ ...p, propertyName: property.name }));
  return { items, total, page, pageSize, totals: { received: round2(agg._sum.amount ?? 0) } };
});

function endOfDayInclusive(to: string): Date {
  const d = parseDate(to);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

export const POST = handleRoute(async ({ owner, req }) => {
  const body = await readBody<Record<string, unknown>>(req);
  requireFields(body, ["propertyId", "date", "amount"]);
  const property = await db.property.findUnique({ where: { id: String(body.propertyId) } });
  if (!property) throw new HttpError(404, "Property not found");
  const amount = requirePositiveAmount(body.amount, "Payment amount");
  const date = parseDate(String(body.date));

  // Overpayment is allowed but audit-flagged.
  const [deps, pays] = await Promise.all([
    db.deployment.aggregate({
      where: { propertyId: property.id },
      _sum: { billingAmount: true },
    }),
    db.propertyPayment.aggregate({ where: { propertyId: property.id }, _sum: { amount: true } }),
  ]);
  const outstandingBefore = round2((deps._sum?.billingAmount ?? 0) - (pays._sum?.amount ?? 0));

  const payment = await db.$transaction(async (tx) => {
    const row = await tx.propertyPayment.create({
      data: {
        propertyId: property.id,
        date,
        amount,
        method: body.method ? String(body.method) : null,
        reference: body.reference ? String(body.reference) : null,
        notes: body.notes ? String(body.notes) : null,
        receivedById: owner.id,
        receivedByName: owner.name,
      },
    });
    await recomputeDeploymentPaid(tx, property.id);
    return row;
  }, { timeout: 15000, maxWait: 10000 });

  await logAudit({
    owner,
    action: "PAYMENT",
    module: "PAYMENT",
    recordId: payment.id,
    recordLabel: `${property.name} — ₹${amount.toLocaleString("en-IN")} on ${String(body.date)}`,
    previousValue: { outstanding: outstandingBefore },
    newValue: {
      amount,
      method: payment.method,
      outstandingAfter: round2(outstandingBefore - amount),
      overpayment: amount > outstandingBefore,
    },
  });
  return { ...payment, propertyName: property.name };
});
