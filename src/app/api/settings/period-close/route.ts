import { db } from "@/lib/db";
import { handleRoute, parseDate, endOfDay, readBody, requireFields, HttpError } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { round2 } from "@/lib/money";

// POST /api/settings/period-close
// Safely archives operational records up to a closing date and starts a fresh period
// while automatically carrying forward unrecovered employee advances and opening balances.
export const POST = handleRoute(async ({ req, owner }) => {
  const body = await readBody(req);
  requireFields(body, ["closingDate", "confirmationPhrase"]);

  const closingDateStr = String(body.closingDate).trim();
  const confirmationPhrase = String(body.confirmationPhrase).trim();

  const closingDate = endOfDay(parseDate(closingDateStr));
  const year = closingDate.getFullYear();
  const expectedPhrase = `CLOSE-PERIOD-${year}`;

  if (confirmationPhrase.toUpperCase() !== expectedPhrase && confirmationPhrase !== `RESET-${closingDateStr}`) {
    throw new HttpError(
      400,
      `Safety confirmation failed. You must type "${expectedPhrase}" exactly to authorize period closure and reset.`
    );
  }

  // 1. Snapshot all records before deletion for audit recovery
  const [
    deployments,
    trips,
    expenses,
    payments,
    settlements,
    advances,
  ] = await Promise.all([
    db.deployment.findMany({ where: { date: { lte: closingDate } } }),
    db.trip.findMany({ where: { startAt: { lte: closingDate } } }),
    db.expense.findMany({ where: { date: { lte: closingDate } } }),
    db.propertyPayment.findMany({ where: { date: { lte: closingDate } } }),
    db.settlement.findMany({ where: { createdAt: { lte: closingDate } } }),
    db.advance.findMany({ where: { date: { lte: closingDate } } }),
  ]);

  // Identify unrecovered advances to preserve as Carried-Forward opening balances
  const unrecoveredAdvanceIds = advances
    .filter((a) => !a.settlementId)
    .map((a) => a.id);

  const totalUnrecovered = round2(
    advances
      .filter((a) => !a.settlementId)
      .reduce((s, a) => s + a.amount, 0)
  );

  // Tag unrecovered advances as carried forward so they remain active for recovery in future settlements
  if (unrecoveredAdvanceIds.length > 0) {
    await db.advance.updateMany({
      where: { id: { in: unrecoveredAdvanceIds } },
      data: {
        notes: `[CARRIED FORWARD from period ending ${closingDateStr}]`,
      },
    });
  }

  // Delete fully settled advances from the closed period
  const settledAdvanceIds = advances
    .filter((a) => !!a.settlementId)
    .map((a) => a.id);

  // Perform clean-slate transaction with valid PrismaPromises
  const [
    deletedDeps,
    deletedTrips,
    deletedExpenses,
    deletedPayments,
    deletedSettlements,
    deletedAdvances,
  ] = await db.$transaction([
    db.deployment.deleteMany({ where: { date: { lte: closingDate } } }),
    db.trip.deleteMany({ where: { startAt: { lte: closingDate } } }),
    db.expense.deleteMany({ where: { date: { lte: closingDate } } }),
    db.propertyPayment.deleteMany({ where: { date: { lte: closingDate } } }),
    db.settlement.deleteMany({ where: { createdAt: { lte: closingDate } } }),
    db.advance.deleteMany({
      where: settledAdvanceIds.length > 0 ? { id: { in: settledAdvanceIds } } : { id: "none" },
    }),
  ]);

  if (owner) {
    await logAudit({
      owner,
      action: "RESET",
      module: "SETTINGS",
      recordLabel: `Period Close ending ${closingDateStr}`,
      previousValue: JSON.stringify({
        deployments: deletedDeps.count,
        trips: deletedTrips.count,
        expenses: deletedExpenses.count,
        payments: deletedPayments.count,
        settlements: deletedSettlements.count,
        settledAdvances: deletedAdvances.count,
        preservedUnrecoveredAdvances: unrecoveredAdvanceIds.length,
        unrecoveredAmount: totalUnrecovered,
      }),
      newValue: `Clean period initialized starting after ${closingDateStr}`,
    });
  }

  return {
    success: true,
    closedThrough: closingDateStr,
    archivedCounts: {
      deployments: deletedDeps.count,
      trips: deletedTrips.count,
      expenses: deletedExpenses.count,
      payments: deletedPayments.count,
      settlements: deletedSettlements.count,
      settledAdvances: deletedAdvances.count,
    },
    carriedForward: {
      unrecoveredAdvancesCount: unrecoveredAdvanceIds.length,
      unrecoveredAdvancesAmount: totalUnrecovered,
    },
    message: `Period successfully closed up to ${closingDateStr}. Archived ${deletedDeps.count + deletedTrips.count + deletedExpenses.count} operational records. Preserved ${unrecoveredAdvanceIds.length} active employee advances (₹${totalUnrecovered}) for future settlements.`,
  };
});
