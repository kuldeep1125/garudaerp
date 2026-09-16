import { db } from "@/lib/db";
import { handleRoute, HttpError } from "@/lib/api-helpers";
import { round2 } from "@/lib/money";

// GET /api/owners/:id/passbook — 360° Owner Financial Statement & Capital Ledger.
export const GET = handleRoute(async ({ params }) => {
  const { id } = params;

  const owner = await db.owner.findUnique({
    where: { id },
    select: { id: true, name: true, username: true, mobile: true, isActive: true, createdAt: true },
  });
  if (!owner) throw new HttpError(404, "Owner not found");

  const [expenses, audits, totalCreatedCount] = await Promise.all([
    db.expense.findMany({
      where: { spentById: id },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 200,
    }),
    db.auditLog.findMany({
      where: { ownerId: id },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true,
        action: true,
        module: true,
        recordLabel: true,
        createdAt: true,
      },
    }),
    db.auditLog.count({ where: { ownerId: id, action: "CREATE" } }),
  ]);

  let totalContributions = 0;
  let totalDrawings = 0;
  let totalOutOfPocket = 0;

  interface PassbookEntry {
    id: string;
    date: string;
    createdAt: string;
    type: "CONTRIBUTION" | "DRAWING" | "OUT_OF_POCKET";
    title: string;
    subtitle: string;
    inflow: number;  // Money owner put in or spent on behalf of business (+)
    outflow: number; // Money owner took out (−)
    balance: number; // Running balance
    notes?: string | null;
  }

  const rawEntries: Array<Omit<PassbookEntry, "balance">> = [];

  for (const e of expenses) {
    const amount = round2(e.amount);
    const cat = (e.categoryName ?? "").trim().toUpperCase();
    const dateStr = e.date instanceof Date ? e.date.toISOString().slice(0, 10) : String(e.date).slice(0, 10);

    if (e.kind === "CAPITAL") {
      if (cat.includes("CONTRIBUTION") || cat.includes("DEPOSIT") || cat.includes("INVEST")) {
        totalContributions = round2(totalContributions + amount);
        rawEntries.push({
          id: `exp-${e.id}`,
          date: dateStr,
          createdAt: e.createdAt.toISOString(),
          type: "CONTRIBUTION",
          title: "Capital Contribution (Deposit In)",
          subtitle: e.description || `${e.categoryName} into business account`,
          inflow: amount,
          outflow: 0,
          notes: e.notes,
        });
      } else {
        totalDrawings = round2(totalDrawings + amount);
        rawEntries.push({
          id: `exp-${e.id}`,
          date: dateStr,
          createdAt: e.createdAt.toISOString(),
          type: "DRAWING",
          title: "Personal Withdrawal (Drawing Out)",
          subtitle: e.description || `${e.categoryName} taken from company funds`,
          inflow: 0,
          outflow: amount,
          notes: e.notes,
        });
      }
    } else {
      // OPERATING SPEND paid by owner out of personal funds
      totalOutOfPocket = round2(totalOutOfPocket + amount);
      rawEntries.push({
        id: `exp-${e.id}`,
        date: dateStr,
        createdAt: e.createdAt.toISOString(),
        type: "OUT_OF_POCKET",
        title: `Expense Paid: ${e.categoryName || "Operational Spend"}`,
        subtitle: `${e.business} · ${e.description || "Paid out-of-pocket on behalf of business"}`,
        inflow: amount, // Reimbursable credit to owner
        outflow: 0,
        notes: e.notes,
      });
    }
  }

  // Sort chronologically ascending to compute running capital balance
  rawEntries.sort((a, b) => {
    const cmp = a.date.localeCompare(b.date);
    if (cmp !== 0) return cmp;
    return a.createdAt.localeCompare(b.createdAt);
  });

  let runningBal = 0;
  const chronologicalPassbook: PassbookEntry[] = rawEntries.map((entry) => {
    runningBal = round2(runningBal + entry.inflow - entry.outflow);
    return {
      ...entry,
      balance: runningBal,
    };
  });

  // Reverse for display (newest first)
  const passbook = [...chronologicalPassbook].reverse();

  const netOwnerPosition = round2(totalContributions + totalOutOfPocket - totalDrawings);

  return {
    owner: {
      ...owner,
      createdRecords: totalCreatedCount,
    },
    summary: {
      contributions: totalContributions,
      drawings: totalDrawings,
      outOfPocketSpend: totalOutOfPocket,
      netBalance: netOwnerPosition,
      recordsCount: expenses.length,
    },
    passbook,
    audits,
  };
});
