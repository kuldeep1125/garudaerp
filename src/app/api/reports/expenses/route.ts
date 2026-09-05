import { db } from "@/lib/db";
import { handleRoute } from "@/lib/api-helpers";
import { round2 } from "@/lib/money";
import { BUSINESSES, dayKey, reportRange } from "@/app/api/_lib/engine";

// GET /api/reports/expenses?from=&to=&business=
export const GET = handleRoute(async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const { from, to } = reportRange(sp);
  const business = sp.get("business")?.toUpperCase();

  const rows = await db.expense.findMany({
    where: {
      date: { gte: from, lte: to },
      ...(business && BUSINESSES.includes(business as (typeof BUSINESSES)[number]) ? { business } : {}),
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 2000,
    select: {
      id: true,
      date: true,
      business: true,
      categoryName: true,
      description: true,
      vehicleName: true,
      spentByName: true,
      isCommon: true,
      kind: true,
      amount: true,
    },
  });

  const items = rows.map((e) => ({
    id: e.id,
    date: dayKey(e.date),
    business: e.business,
    categoryName: e.categoryName ?? "Uncategorized",
    description: e.description ?? (e.vehicleName ? `Vehicle: ${e.vehicleName}` : "—"),
    isCommon: e.isCommon,
    spentByName: e.isCommon ? "Common — all owners" : (e.spentByName ?? "Unattributed"),
    kind: e.kind,
    amount: round2(e.amount),
  }));

  const operating = round2(items.filter((r) => r.kind === "OPERATING").reduce((s, r) => s + r.amount, 0));
  const capital = round2(items.filter((r) => r.kind === "CAPITAL").reduce((s, r) => s + r.amount, 0));
  const totals = {
    amount: round2(items.reduce((s, r) => s + r.amount, 0)),
    operating,
    capital,
    count: items.length,
    note: "Operating expenses feed profit; owner contributions/withdrawals are capital movements.",
  };

  return {
    columns: [
      { key: "date", label: "Date", type: "date" },
      { key: "business", label: "Business", type: "string" },
      { key: "categoryName", label: "Category", type: "string" },
      { key: "description", label: "Description", type: "string" },
      { key: "spentByName", label: "Spent By", type: "string" },
      { key: "kind", label: "Kind", type: "string" },
      { key: "amount", label: "Amount", type: "currency" },
    ],
    rows: items,
    totals,
    meta: { from: dayKey(from), to: dayKey(to), ...(business ? { business } : {}) },
  };
});
