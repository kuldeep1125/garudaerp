import { db } from "@/lib/db";
import { handleRoute, parseRange } from "@/lib/api-helpers";
import { round2 } from "@/lib/money";
import { BUSINESSES, dayKey } from "@/app/api/_lib/engine";

interface OwnerRow {
  id: string;
  name: string;
  deposits: number;    // OWNER CONTRIBUTION — money the owner put IN
  withdrawals: number; // OWNER WITHDRAWAL — money the owner took OUT for themselves
  advances: number;    // OPERATING expenses the owner paid on behalf of the business
  spent: number;       // all expense rows attributed to this owner (advances + withdrawals)
  manpower: number;
  transport: number;
  net: number;         // deposits − withdrawals → negative means "needs to deposit again"
  categories: { name: string; amount: number }[];
}

interface Bucket {
  total: number;
  manpower: number;
  transport: number;
  categories: { name: string; amount: number }[];
}

function emptyBucket(): Bucket {
  return { total: 0, manpower: 0, transport: 0, categories: [] };
}

function addCat(list: { name: string; amount: number }[], name: string, amount: number) {
  const found = list.find((c) => c.name === name);
  if (found) found.amount = round2(found.amount + amount);
  else list.push({ name, amount: round2(amount) });
}

// GET /api/expenses/owner-breakdown?from=&to=&business=
// Single source of truth for the Owner Expense dashboard: per-owner deposits,
// withdrawals, business spend, common (shared) expenses and category splits —
// all from the same rows the Expenses list shows, so numbers always reconcile.
export const GET = handleRoute(async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const { from, to } = parseRange(sp);
  const business = sp.get("business")?.toUpperCase();
  const validBusiness = business && (BUSINESSES as readonly string[]).includes(business) ? business : null;

  const [rows, owners] = await Promise.all([
    db.expense.findMany({
      where: {
        date: { gte: from, lte: to },
        ...(validBusiness ? { business: validBusiness } : {}),
      },
      select: {
        date: true, business: true, amount: true, categoryName: true, description: true,
        isCommon: true, kind: true, spentById: true, spentByName: true,
      },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    }),
    db.owner.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const ownerMap = new Map<string, OwnerRow>();
  for (const o of owners) {
    ownerMap.set(o.id, {
      id: o.id, name: o.name,
      deposits: 0, withdrawals: 0, advances: 0, spent: 0, manpower: 0, transport: 0, net: 0,
      categories: [],
    });
  }
  const common = emptyBucket();
  const unattributed = emptyBucket();
  const daily = new Map<string, { day: string; deposits: number; withdrawals: number; operating: number; common: number }>();
  const byCategory = new Map<string, { name: string; amount: number; kind: string }>();

  for (const e of rows) {
    const amount = round2(e.amount);
    const cat = e.categoryName?.trim() || "Uncategorized";
    const day = dayKey(e.date);
    const dRow = daily.get(day) ?? { day, deposits: 0, withdrawals: 0, operating: 0, common: 0 };

    // Category roll-up (all rows, both kinds — chart shows capital separately).
    const catEntry = byCategory.get(cat) ?? { name: cat, amount: 0, kind: e.kind };
    catEntry.amount = round2(catEntry.amount + amount);
    byCategory.set(cat, catEntry);

    if (e.isCommon) {
      common.total = round2(common.total + amount);
      if (e.business === "MANPOWER") common.manpower = round2(common.manpower + amount);
      else if (e.business === "TRANSPORT") common.transport = round2(common.transport + amount);
      addCat(common.categories, cat, amount);
      dRow.common = round2(dRow.common + amount);
      daily.set(day, dRow);
      continue;
    }

    const ownerRow = e.spentById ? ownerMap.get(e.spentById) : undefined;
    if (ownerRow) {
      ownerRow.spent = round2(ownerRow.spent + amount);
      if (e.business === "MANPOWER") ownerRow.manpower = round2(ownerRow.manpower + amount);
      else if (e.business === "TRANSPORT") ownerRow.transport = round2(ownerRow.transport + amount);
      addCat(ownerRow.categories, cat, amount);
      const capCat = cat.toUpperCase();
      if (e.kind === "CAPITAL" && capCat === "OWNER CONTRIBUTION") {
        ownerRow.deposits = round2(ownerRow.deposits + amount);
        dRow.deposits = round2(dRow.deposits + amount);
      } else if (e.kind === "CAPITAL" && capCat === "OWNER WITHDRAWAL") {
        ownerRow.withdrawals = round2(ownerRow.withdrawals + amount);
        dRow.withdrawals = round2(dRow.withdrawals + amount);
      } else {
        ownerRow.advances = round2(ownerRow.advances + amount);
        dRow.operating = round2(dRow.operating + amount);
      }
    } else {
      unattributed.total = round2(unattributed.total + amount);
      if (e.business === "MANPOWER") unattributed.manpower = round2(unattributed.manpower + amount);
      else if (e.business === "TRANSPORT") unattributed.transport = round2(unattributed.transport + amount);
      addCat(unattributed.categories, cat, amount);
    }
    daily.set(day, dRow);
  }

  const ownerRows = [...ownerMap.values()];
  for (const r of ownerRows) r.net = round2(r.deposits - r.withdrawals);
  ownerRows.sort((a, b) => b.spent - a.spent);

  // Unattributed operating rows (legacy/no spentBy) count toward operating too.
  const unattributedOperating = round2(
    rows
      .filter((e) => !e.isCommon && e.kind === "OPERATING" && (!e.spentById || !ownerMap.has(e.spentById)))
      .reduce((s, e) => s + e.amount, 0),
  );
  const commonOperating = round2(rows.filter((e) => e.isCommon && e.kind === "OPERATING").reduce((s, e) => s + e.amount, 0));

  const totals = {
    deposits: round2(ownerRows.reduce((s, r) => s + r.deposits, 0)),
    withdrawals: round2(ownerRows.reduce((s, r) => s + r.withdrawals, 0)),
    advances: round2(ownerRows.reduce((s, r) => s + r.advances, 0)),
    commonTotal: common.total,
    unattributed: unattributed.total,
    // operating = owner advances + common operating + unattributed operating (mirrors kind=OPERATING)
    operating: round2(ownerRows.reduce((s, r) => s + r.advances, 0) + commonOperating + unattributedOperating),
    capital: round2(ownerRows.reduce((s, r) => s + r.deposits + r.withdrawals, 0)),
    grand: round2(rows.reduce((s, e) => s + e.amount, 0)),
    netPosition: round2(ownerRows.reduce((s, r) => s + r.deposits - r.withdrawals, 0)),
  };

  return {
    range: { from: dayKey(from), to: dayKey(to) },
    business: validBusiness,
    owners: ownerRows,
    common,
    unattributed,
    totals,
    daily: [...daily.values()].sort((a, b) => a.day.localeCompare(b.day)),
    byCategory: [...byCategory.values()].sort((a, b) => b.amount - a.amount),
  };
});
