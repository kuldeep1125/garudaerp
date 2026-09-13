// Shared server-side business engine for BizHub API routes.
// Pure logic + data access helpers reused across endpoints (property FIFO ledger,
// advance balances, settlement inputs, trip math, vehicle stats, notifications).
// NOTE: private folder (underscore prefix) — never treated as a route by Next.js.
import { db } from "@/lib/db";
import { round2 } from "@/lib/money";
import { HttpError, endOfDay, monthBounds, parseDate } from "@/lib/api-helpers";
import type { Prisma } from "@prisma/client";

export type Tx = Prisma.TransactionClient;

// Re-export the standard route toolkit so route files can import everything from one place.
export { handleRoute, readBody, requireFields, parseDate, parsePage, parseRange, monthBounds, endOfDay, HttpError } from "@/lib/api-helpers";
export { logAudit } from "@/lib/audit";
export { db } from "@/lib/db";

/** Shift units: FULL = day + night = 2 paid/billed shift units. */
export const SHIFT_UNITS: Record<string, number> = { DAY: 1, NIGHT: 1, FULL: 2 };
export const SHIFTS = ["DAY", "NIGHT", "FULL"] as const;
export const EMPLOYEE_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export const ADJUSTMENT_TYPES = ["BONUS", "OVERTIME", "DEDUCTION", "PENALTY", "OTHER"] as const;
export const BUSINESSES = ["MANPOWER", "TRANSPORT"] as const;
export const TRIP_STATUSES = ["CONFIRMED", "ACTIVE", "COMPLETED", "CANCELLED"] as const;

export const EPS = 0.005;

// ---------- employment types / rent / contractor (canonical constants) ----------
export const EMPLOYMENT_TYPES = ["NON_SALARIED", "SALARIED"] as const;
export const RENT_MODES = ["MONTH", "DAY"] as const;

/**
 * Manpower money model (the zero-mismatch contract):
 *  - NON_SALARIED employee: cost = Σ deployment.payoutAmount (per shift, snapshot).
 *  - SALARIED employee: deployments carry payout 0; cost accrues as
 *    monthlySalary prorated per ACTIVE day + overtime = (deployments in month −
 *    threshold) × overtimeRate. Settlement gross for a full month uses the SAME
 *    formula, so settled statements always reconcile with accrued cost.
 *  - Contractor cut: snapshotted per deployment, taken FROM the employee's
 *    payout and paid to the contractor (business cost unchanged = split). Cuts
 *    that exceed the deployment payout (only possible on salaried/edge rows)
 *    are an EXTRA business cost and are added to the payout metric.
 *  - Employee rent (employee rents the business flat): ACCRUED INCOME —
 *    MONTH mode prorates rentAmount per active day over the calendar month,
 *    DAY mode charges rentAmount per active day.
 *  Canonical net: net = revenue + rentIncome − payout − operatingExpenses.
 */
export interface ManpowerCostBreakdown {
  billing: number;
  shiftPayout: number;
  contractorCut: number; // memo — commission earned by contractors (inside shiftPayout in the normal case)
  extraContractorCut: number; // cuts exceeding the deployment payout (salaried edge) — extra business cost
  salary: number; // salaried accrual in range
  overtime: number; // salaried overtime accrual in range
  rentIncome: number; // employee-rent accrual in range (income)
  payout: number; // THE employee-cost metric = shiftPayout + salary + overtime + extraContractorCut
  salariedCount: number;
  rentCount: number;
  contractorCount: number;
}

export interface MonthSegment { from: Date; to: Date; month: string; daysInMonth: number }

/** Splits [from, to] into calendar-month segments (clipped to the range). */
export function monthSegments(from: Date, to: Date): MonthSegment[] {
  const segs: MonthSegment[] = [];
  let cur = new Date(from.getFullYear(), from.getMonth(), 1);
  while (cur.getTime() <= to.getTime()) {
    const next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    const segEnd = new Date(next.getTime() - 1); // last ms of the month
    const dim = new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate();
    segs.push({
      from: startOfDay(cur < from ? from : cur),
      to: segEnd > to ? to : segEnd,
      month: monthKey(cur),
      daysInMonth: dim,
    });
    cur = next;
  }
  return segs;
}

function daysBetweenInclusive(a: Date, b: Date): number {
  return Math.floor((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86400000) + 1;
}

/**
 * ACTIVE days for an employee inside a month segment: from joiningDate (or
 * segment start) to segment end — capped at the last work date for INACTIVE
 * employees (best available signal for "left the job").
 */
function activeDaysInSegment(
  emp: { joiningDate: Date; status: string },
  lastWork: Date | null,
  seg: MonthSegment,
): number {
  const start = emp.joiningDate > seg.from ? emp.joiningDate : seg.from;
  let end = seg.to;
  if (emp.status !== "ACTIVE") {
    const lw = lastWork ?? emp.joiningDate;
    if (lw < end) end = lw;
  }
  if (end < start) return 0;
  return Math.max(0, daysBetweenInclusive(start, end));
}

// ---------- effective-dated pay history (the historical-integrity core) ----------

/** The compensation terms carried by an Employee record or a pay-history row. */
export interface PayValues {
  employmentType: string;
  standardRate: number;
  monthlySalary: number;
  overtimeThreshold: number;
  overtimeRate: number;
  onBusinessRent: boolean;
  rentAmount: number;
  rentMode: string;
  hasContractor: boolean;
  contractorName: string | null;
  contractorRateCut: number;
}

export type PayHistoryRow = PayValues & { effectiveFrom: Date };

/** Extracts the pay snapshot carried by an Employee record (fallback / initial terms). */
export function payValuesOf(emp: {
  employmentType: string; standardRate: number; monthlySalary: number; overtimeThreshold: number;
  overtimeRate: number; onBusinessRent: boolean; rentAmount: number; rentMode: string;
  hasContractor: boolean; contractorName: string | null; contractorRateCut: number;
}): PayValues {
  return {
    employmentType: emp.employmentType,
    standardRate: emp.standardRate,
    monthlySalary: emp.monthlySalary,
    overtimeThreshold: emp.overtimeThreshold,
    overtimeRate: emp.overtimeRate,
    onBusinessRent: emp.onBusinessRent,
    rentAmount: emp.rentAmount,
    rentMode: emp.rentMode,
    hasContractor: emp.hasContractor,
    contractorName: emp.contractorName,
    contractorRateCut: emp.contractorRateCut,
  };
}

/** Terms in effect at instant `at`: latest row whose CHANGE DAY has started (rows ascending), else the fallback. */
export function payAsOf(rows: PayHistoryRow[], at: Date, fallback: PayValues): PayValues {
  let picked = fallback;
  for (const r of rows) {
    if (startOfDay(r.effectiveFrom).getTime() <= at.getTime()) picked = r;
    else break;
  }
  return picked;
}

/**
 * Splits [from, to] at pay-change boundaries → sub-segments, each carrying the
 * terms effective inside it. Boundaries are quantized to the START of the
 * change's calendar day, so a change applies from that whole day and the
 * prorated day counts always sum exactly to the period length (no day is ever
 * counted twice or skipped). A change made today can never rewrite any period
 * that ended before today (the historical-integrity rule).
 */
export function paySegments(
  rows: PayHistoryRow[],
  from: Date,
  to: Date,
  fallback: PayValues,
): { values: PayValues; from: Date; to: Date }[] {
  // Segment STARTS: the range start + each change day strictly inside the range.
  // `to` is only ever a closing bound (never a new segment start) — otherwise a
  // 1ms sliver at the end would double-count one day of salary/rent.
  const startTimes = new Set<number>([startOfDay(from).getTime()]);
  for (const r of rows) {
    const t = startOfDay(r.effectiveFrom).getTime();
    if (t > startOfDay(from).getTime() && t <= to.getTime()) startTimes.add(t);
  }
  const starts = [...startTimes].sort((a, b) => a - b).map((ms) => new Date(ms));
  const out: { values: PayValues; from: Date; to: Date }[] = [];
  for (let i = 0; i < starts.length; i++) {
    const segFrom = starts[i];
    const segTo = i + 1 < starts.length ? new Date(starts[i + 1].getTime() - 1) : to;
    if (segFrom.getTime() > segTo.getTime()) continue;
    out.push({ values: payAsOf(rows, segFrom, fallback), from: segFrom, to: segTo });
  }
  return out;
}

/** Rent accrual for given active days under one pay-values snapshot. */
export function rentForValues(values: PayValues, activeDays: number, daysInMonth: number): number {
  if (!values.onBusinessRent || activeDays <= 0) return 0;
  if (String(values.rentMode).toUpperCase() === "DAY") return round2((values.rentAmount ?? 0) * activeDays);
  return round2((values.rentAmount ?? 0) * (activeDays / daysInMonth));
}

export interface SalariedAccrualResult { salary: number; overtime: number; rent: number }

/**
 * Salaried salary + overtime + employee-rent accrual for an arbitrary range,
 * resolved through the employee's effective-dated pay history: each change is
 * applied exactly from the moment it was made and NEVER rewrites past periods.
 *  - salary: monthlySalary prorated per ACTIVE day, piecewise across pay changes
 *  - rent: MONTH prorated / DAY per active day, piecewise across pay changes
 *  - overtime: month-scoped; uses the threshold/rate in effect at month end, so
 *    a later edit cannot reach back into a closed month
 */
export async function salaryRentOvertimeForRange(
  emp: { id: string; joiningDate: Date; status: string } & PayValues,
  from: Date,
  to: Date,
  lastWork?: Date | null,
): Promise<SalariedAccrualResult> {
  const rows = (await db.employeePayHistory.findMany({
    where: { employeeId: emp.id },
    orderBy: { effectiveFrom: "asc" },
  })) as PayHistoryRow[];
  const fallback = payValuesOf(emp);
  const segments = monthSegments(from, to);
  const segFrom = startOfDay(from);
  let salary = 0;
  let overtime = 0;
  let rent = 0;
  for (const seg of segments) {
    const effSeg = { ...seg, from: seg.from < segFrom ? segFrom : seg.from };
    if (effSeg.from > effSeg.to) continue;
    for (const sub of paySegments(rows, effSeg.from, effSeg.to, fallback)) {
      const days = activeDaysInSegment(emp, lastWork ?? null, { ...effSeg, from: sub.from, to: sub.to });
      if (days <= 0) continue;
      if (sub.values.employmentType === "SALARIED") {
        salary += (sub.values.monthlySalary ?? 0) * (days / effSeg.daysInMonth);
      }
      rent += rentForValues(sub.values, days, effSeg.daysInMonth);
    }
    const ov = payAsOf(rows, effSeg.to, fallback);
    if (ov.employmentType === "SALARIED" && (ov.overtimeRate ?? 0) > 0) {
      const count = await db.deployment.count({ where: { employeeId: emp.id, date: { gte: effSeg.from, lte: effSeg.to } } });
      overtime += Math.max(0, count - (ov.overtimeThreshold ?? 30)) * (ov.overtimeRate ?? 0);
    }
  }
  return { salary: round2(salary), overtime: round2(overtime), rent: round2(rent) };
}

export interface SalariedMonthPay {
  salary: number;
  overtime: number;
  total: number;
  extraDeployments: number;
  threshold: number;
  wasSalaried: boolean; // salaried as of the month end (draft-generation gate)
}

/**
 * Salaried pay for a settlement month — THE canonical settlement formula,
 * aligned 1:1 with the accrual the dashboards show (same active-day proration,
 * same effective-dated history), so a settled month always reconciles:
 *  - salary: prorated per ACTIVE day, piecewise across pay-history changes
 *  - overtime: (deployments in month − threshold) × rate, params as of month end
 *  - wasSalaried: whether the terms in effect at month end were salaried
 */
export async function salariedMonthPay(args: {
  employeeId: string;
  month: string;
  joiningDate: Date;
  status: string;
  lastWork: Date | null;
  deploymentsInMonth: number;
  current: PayValues;
}): Promise<SalariedMonthPay> {
  const { from, to } = monthBounds(args.month);
  const rows = (await db.employeePayHistory.findMany({
    where: { employeeId: args.employeeId },
    orderBy: { effectiveFrom: "asc" },
  })) as PayHistoryRow[];
  const fallback = args.current;
  const endValues = payAsOf(rows, to, fallback);
  const wasSalaried = endValues.employmentType === "SALARIED";
  const daysInMonth = new Date(from.getFullYear(), from.getMonth() + 1, 0).getDate();
  const seg: MonthSegment = { from, to, month: args.month, daysInMonth };
  let salary = 0;
  for (const sub of paySegments(rows, from, to, fallback)) {
    const days = activeDaysInSegment({ joiningDate: args.joiningDate, status: args.status }, args.lastWork, { ...seg, from: sub.from, to: sub.to });
    if (days > 0 && sub.values.employmentType === "SALARIED") {
      salary += (sub.values.monthlySalary ?? 0) * (days / daysInMonth);
    }
  }
  const extra = Math.max(0, args.deploymentsInMonth - (endValues.overtimeThreshold ?? 30));
  const sal = round2(salary);
  const overtime = wasSalaried ? round2(extra * (endValues.overtimeRate ?? 0)) : 0;
  return { salary: sal, overtime, total: round2(sal + overtime), extraDeployments: extra, threshold: endValues.overtimeThreshold ?? 30, wasSalaried };
}

/**
 * THE canonical manpower cost/accrual aggregation for [from, to].
 * dashboard/summary, reports/profitability and monthly-metrics ALL read from
 * this function — numbers can never disagree across pages by construction.
 * Salary/rent accruals resolve through each employee's effective-dated pay
 * history, so editing an employee never rewrites a past period's numbers.
 */
export async function manpowerCostBreakdown(from: Date, to: Date): Promise<ManpowerCostBreakdown> {
  const candidateWhere = {
    OR: [
      { employmentType: "SALARIED" },
      { onBusinessRent: true },
      { payHistory: { some: {} } }, // was salaried/on-rent at some point in history
    ],
  };
  const [depAgg, cutRows, specials, lastWorks, historyRows] = await Promise.all([
    db.deployment.aggregate({
      where: { date: { gte: from, lte: to } },
      _sum: { billingAmount: true, payoutAmount: true, contractorCut: true },
    }),
    db.deployment.findMany({
      where: { date: { gte: from, lte: to }, contractorCut: { gt: 0 } },
      select: { payoutAmount: true, contractorCut: true },
    }),
    db.employee.findMany({
      where: candidateWhere,
      select: { id: true, fullName: true, status: true, joiningDate: true, employmentType: true, standardRate: true, monthlySalary: true, overtimeThreshold: true, overtimeRate: true, onBusinessRent: true, rentAmount: true, rentMode: true, hasContractor: true, contractorName: true, contractorRateCut: true },
    }),
    db.deployment.groupBy({
      by: ["employeeId"],
      _max: { date: true },
      where: { employee: candidateWhere },
    }),
    db.employeePayHistory.findMany({
      where: { employee: candidateWhere },
      orderBy: [{ employeeId: "asc" }, { effectiveFrom: "asc" }],
    }),
  ]);

  const billing = round2(depAgg._sum.billingAmount ?? 0);
  const shiftPayout = round2(depAgg._sum.payoutAmount ?? 0);
  const contractorCut = round2(depAgg._sum.contractorCut ?? 0);
  let extraContractorCut = 0;
  for (const r of cutRows) extraContractorCut += Math.max(0, r.contractorCut - r.payoutAmount);
  extraContractorCut = round2(extraContractorCut);

  const segments = monthSegments(from, to);
  const lastWorkBy = new Map(lastWorks.map((r) => [r.employeeId, r._max.date as Date | null]));
  const historyBy = new Map<string, PayHistoryRow[]>();
  for (const r of historyRows) {
    const arr = historyBy.get(r.employeeId) ?? [];
    arr.push(r as PayHistoryRow);
    historyBy.set(r.employeeId, arr);
  }
  let salary = 0;
  let overtime = 0;
  let rentIncome = 0;
  const segFrom = startOfDay(from);
  for (const emp of specials) {
    const rows = historyBy.get(emp.id) ?? [];
    const fallback = payValuesOf(emp);
    const lastWork = lastWorkBy.get(emp.id) ?? null;
    for (const seg of segments) {
      // only count days inside the requested range (segment is already clipped, but the
      // segment start may precede `from` when the range starts mid-month — clamp again)
      const effSeg = { ...seg, from: seg.from < segFrom ? segFrom : seg.from };
      if (effSeg.from > effSeg.to) continue;
      for (const sub of paySegments(rows, effSeg.from, effSeg.to, fallback)) {
        const days = activeDaysInSegment(emp, lastWork, { ...effSeg, from: sub.from, to: sub.to });
        if (days <= 0) continue;
        if (sub.values.employmentType === "SALARIED") {
          salary += (sub.values.monthlySalary ?? 0) * (days / effSeg.daysInMonth);
        }
        rentIncome += rentForValues(sub.values, days, effSeg.daysInMonth);
      }
      // month-scoped overtime: terms as of the month's end — later edits never
      // reach back into a closed month
      const ov = payAsOf(rows, effSeg.to, fallback);
      if (ov.employmentType === "SALARIED" && (ov.overtimeRate ?? 0) > 0) {
        const count = await db.deployment.count({
          where: { employeeId: emp.id, date: { gte: effSeg.from, lte: effSeg.to } },
        });
        overtime += Math.max(0, count - (ov.overtimeThreshold ?? 30)) * (ov.overtimeRate ?? 0);
      }
    }
  }
  salary = round2(salary);
  overtime = round2(overtime);
  rentIncome = round2(rentIncome);

  return {
    billing,
    shiftPayout,
    contractorCut,
    extraContractorCut,
    salary,
    overtime,
    rentIncome,
    payout: round2(shiftPayout + salary + overtime + extraContractorCut),
    salariedCount: specials.filter((e) => e.employmentType === "SALARIED").length,
    rentCount: specials.filter((e) => e.onBusinessRent).length,
    contractorCount: 0, // filled by callers that need it (cheap separate query)
  };
}

export interface ContractorStat {
  name: string;
  todayDeployments: number;
  todayCommission: number;
  monthDeployments: number;
  monthCommission: number;
  employees: string[];
}

/** Per-contractor commission: today + current month (dashboard cards). */
export async function contractorStats(): Promise<ContractorStat[]> {
  const now = new Date();
  const dayStart = startOfDay(now);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const rows = await db.deployment.findMany({
    where: { contractorName: { not: null }, date: { gte: monthStart, lte: endOfDay(now) } },
    select: { contractorName: true, date: true, contractorCut: true, employee: { select: { fullName: true } } },
    orderBy: { date: "asc" },
  });
  const map = new Map<string, ContractorStat>();
  for (const r of rows) {
    const name = r.contractorName as string;
    const stat = map.get(name) ?? { name, todayDeployments: 0, todayCommission: 0, monthDeployments: 0, monthCommission: 0, employees: [] };
    stat.monthDeployments += 1;
    stat.monthCommission = round2(stat.monthCommission + r.contractorCut);
    if (!stat.employees.includes(r.employee.fullName)) stat.employees.push(r.employee.fullName);
    if (r.date >= dayStart) {
      stat.todayDeployments += 1;
      stat.todayCommission = round2(stat.todayCommission + r.contractorCut);
    }
    map.set(name, stat);
  }
  return [...map.values()].sort((a, b) => b.monthCommission - a.monthCommission);
}

/** Distinct contractor names on the Employee master (for filters). */
export async function contractorNames(): Promise<string[]> {
  const rows = await db.employee.findMany({
    where: { hasContractor: true, contractorName: { not: null } },
    select: { contractorName: true },
    orderBy: { contractorName: "asc" },
  });
  return [...new Set(rows.map((r) => r.contractorName as string))];
}

// ---------- owner capital movements (canonical predicate) ----------
// Owner CONTRIBUTION (money in) / WITHDRAWAL (drawings) are capital movements,
// NOT operating expenses. Every P&L aggregation must count OPERATING expenses
// only — the Owner Breakdown surfaces capital flows separately. This constant
// list is the single source of truth; Expense.kind is stamped from it on write.
export const CAPITAL_CATEGORY_NAMES = ["OWNER CONTRIBUTION", "OWNER WITHDRAWAL"] as const;
export const EXPENSE_KINDS = ["OPERATING", "CAPITAL"] as const;

export function isCapitalCategoryName(name?: string | null): boolean {
  return (CAPITAL_CATEGORY_NAMES as readonly string[]).includes((name ?? "").trim().toUpperCase());
}

/** Canonical expense kind stamp: capital when the category is an owner capital movement. */
export function expenseKindForCategory(categoryName?: string | null): (typeof EXPENSE_KINDS)[number] {
  return isCapitalCategoryName(categoryName) ? "CAPITAL" : "OPERATING";
}

export interface ExpenseAttribution {
  isCommon: boolean;
  spentById: string | null;
  spentByName: string | null;
}

/**
 * Resolves who the money is attributed to for an expense.
 * - `isCommon: true` (or spentById === "COMMON") → shared by all owners & the business;
 *   `spentBy` still records who physically took/spent the money (the acting user).
 * - `spentById` of a real owner → attributed to that owner.
 * - otherwise → attributed to the acting user.
 */
export async function resolveExpenseAttribution(
  body: { isCommon?: unknown; spentById?: unknown },
  actingOwner: { id: string; name: string },
): Promise<ExpenseAttribution> {
  if (body.isCommon === true || String(body.spentById ?? "") === "COMMON") {
    return { isCommon: true, spentById: actingOwner.id, spentByName: actingOwner.name };
  }
  const wanted = body.spentById ? String(body.spentById) : "";
  if (wanted && wanted !== actingOwner.id) {
    const o = await db.owner.findUnique({ where: { id: wanted } });
    if (!o || !o.isActive) throw new HttpError(404, "Selected owner not found");
    return { isCommon: false, spentById: o.id, spentByName: o.name };
  }
  return { isCommon: false, spentById: actingOwner.id, spentByName: actingOwner.name };
}

// ---------- date helpers ----------

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Historical-integrity guard: blocks any deployment mutation (edit/delete) in a
 * month already locked by a FINALIZED/PAID settlement — settled payroll rows are
 * frozen inputs of that settlement, so editing them would silently stale its
 * totals. DRAFT months stay freely editable (drafts regenerate).
 */
export async function assertDeploymentMonthUnlocked(employeeId: string, date: Date): Promise<void> {
  const month = monthKey(date);
  const locked = await db.settlement.findFirst({
    where: { employeeId, month, status: { not: "DRAFT" } },
    select: { id: true },
  });
  if (locked) {
    throw new HttpError(
      409,
      `This deployment is in ${month} — a month already settled & finalized for this employee. Finalized payroll is immutable, so the row cannot be modified.`,
    );
  }
}

export function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function addMonths(d: Date, n: number): Date {
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const dim = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(target.getFullYear(), target.getMonth(), Math.min(d.getDate(), dim), d.getHours(), d.getMinutes());
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Range for reports: explicit from/to, else month param, else current month. */
export function reportRange(sp: URLSearchParams): { from: Date; to: Date } {
  const from = sp.get("from");
  const to = sp.get("to");
  if (from && to) return { from: parseDate(from), to: endOfDay(parseDate(to)) };
  const month = sp.get("month");
  if (month) return monthBounds(month);
  const now = new Date();
  return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: endOfDay(now) };
}

export function currentMonth(): string {
  return monthKey(new Date());
}

// ---------- property ledger (FIFO) ----------

export interface LedgerDay {
  date: string;
  billed: number;
  paid: number;
  outstanding: number;
  status: "UNPAID" | "PARTIAL" | "PAID";
}

export interface PropertyLedger {
  billed: number;
  received: number;
  outstanding: number;
  oldestUnpaidDate: string | null;
  unpaidCount: number;
  days: LedgerDay[];
  monthly: { month: string; billed: number; received: number }[];
}

type LedgerDepRow = { date: Date; billingAmount: number };
type LedgerPayRow = { date: Date; amount: number };

/**
 * FIFO walk: billable deployments sorted by date consume the payment pool
 * chronologically. Produces per-day rows + totals + monthly aggregates.
 */
export function ledgerFromRows(deployments: LedgerDepRow[], payments: LedgerPayRow[]): PropertyLedger {
  const billed = round2(deployments.reduce((s, d) => s + d.billingAmount, 0));
  const received = round2(payments.reduce((s, p) => s + p.amount, 0));

  const byDay = new Map<string, { billed: number; paid: number; sort: number }>();
  const monthlyMap = new Map<string, { billed: number; received: number }>();
  const sorted = [...deployments].sort((a, b) => a.date.getTime() - b.date.getTime());
  let pool = received;
  for (const dep of sorted) {
    const dk = dayKey(dep.date);
    const row = byDay.get(dk) ?? { billed: 0, paid: 0, sort: dep.date.getTime() };
    const alloc = Math.max(0, Math.min(dep.billingAmount, pool));
    pool = round2(pool - alloc);
    row.billed = round2(row.billed + dep.billingAmount);
    row.paid = round2(row.paid + alloc);
    byDay.set(dk, row);
    const mk = monthKey(dep.date);
    const mrow = monthlyMap.get(mk) ?? { billed: 0, received: 0 };
    mrow.billed = round2(mrow.billed + dep.billingAmount);
    monthlyMap.set(mk, mrow);
  }
  for (const p of payments) {
    const mk = monthKey(p.date);
    const mrow = monthlyMap.get(mk) ?? { billed: 0, received: 0 };
    mrow.received = round2(mrow.received + p.amount);
    monthlyMap.set(mk, mrow);
  }

  let running = 0;
  let oldestUnpaidDate: string | null = null;
  let unpaidCount = 0;
  const days: LedgerDay[] = [...byDay.entries()]
    .sort((a, b) => a[1].sort - b[1].sort)
    .map(([date, row]) => {
      running = round2(running + row.billed - row.paid);
      const status: LedgerDay["status"] =
        row.billed - row.paid <= EPS ? "PAID" : row.paid > EPS ? "PARTIAL" : "UNPAID";
      if (status !== "PAID") {
        unpaidCount++;
        if (!oldestUnpaidDate) oldestUnpaidDate = date;
      }
      return { date, billed: row.billed, paid: row.paid, outstanding: running, status };
    });

  const monthly = [...monthlyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, r]) => ({ month, billed: r.billed, received: r.received }));

  return { billed, received, outstanding: round2(billed - received), oldestUnpaidDate, unpaidCount, days, monthly };
}

/**
 * Computes FIFO ledgers for ALL properties in three bulk queries (no N+1).
 * Returns property rows plus a ledger per property id.
 */
export async function loadAllLedgers(): Promise<{
  properties: { id: string; name: string }[];
  map: Map<string, PropertyLedger>;
}> {
  const [properties, deps, pays] = await Promise.all([
    db.property.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.deployment.findMany({
      select: { propertyId: true, date: true, billingAmount: true },
      orderBy: { date: "asc" },
    }),
    db.propertyPayment.findMany({
      select: { propertyId: true, date: true, amount: true },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    }),
  ]);
  const depBy = new Map<string, LedgerDepRow[]>();
  for (const d of deps) {
    const arr = depBy.get(d.propertyId) ?? [];
    arr.push({ date: d.date, billingAmount: d.billingAmount });
    depBy.set(d.propertyId, arr);
  }
  const payBy = new Map<string, LedgerPayRow[]>();
  for (const p of pays) {
    const arr = payBy.get(p.propertyId) ?? [];
    arr.push({ date: p.date, amount: p.amount });
    payBy.set(p.propertyId, arr);
  }
  const map = new Map<string, PropertyLedger>();
  for (const p of properties) {
    map.set(p.id, ledgerFromRows(depBy.get(p.id) ?? [], payBy.get(p.id) ?? []));
  }
  return { properties, map };
}

export async function loadPropertyLedger(propertyId: string): Promise<PropertyLedger> {
  const [deps, pays] = await Promise.all([
    db.deployment.findMany({
      where: { propertyId },
      select: { date: true, billingAmount: true },
      orderBy: { date: "asc" },
    }),
    db.propertyPayment.findMany({
      where: { propertyId },
      select: { date: true, amount: true },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    }),
  ]);
  return ledgerFromRows(deps, pays);
}

/**
 * Recomputes per-deployment paidAmount for a property via the FIFO pool.
 * Call inside a transaction after payments/deployments/amounts change.
 */
export async function recomputeDeploymentPaid(tx: Tx, propertyId: string): Promise<void> {
  const [deps, pays] = await Promise.all([
    tx.deployment.findMany({
      where: { propertyId },
      select: { id: true, paidAmount: true, date: true, billingAmount: true },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    }),
    tx.propertyPayment.findMany({
      where: { propertyId },
      select: { amount: true },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    }),
  ]);
  let pool = round2(pays.reduce((s, p) => s + p.amount, 0));
  for (const dep of deps) {
    const alloc = Math.max(0, Math.min(dep.billingAmount, pool));
    pool = round2(pool - alloc);
    if (Math.abs(dep.paidAmount - alloc) > EPS) {
      await tx.deployment.update({ where: { id: dep.id }, data: { paidAmount: alloc } });
    }
  }
}

export function derivePaidStatus(billingAmount: number, paidAmount: number): "UNPAID" | "PARTIAL" | "PAID" {
  if (paidAmount <= EPS) return "UNPAID";
  if (paidAmount + EPS >= billingAmount && billingAmount > EPS) return "PAID";
  return "PARTIAL";
}

/** API contract shape for a serialized deployment (dynamic passthrough fields + computed). */
export type DeploymentDto = Record<string, unknown> & {
  employeeName: string | null;
  employeeCode: string | null;
  propertyName: string | null;
  paidStatus: string;
};

/** Maps a Deployment (with employee/property includes) to the API contract shape. */
export function serializeDeployment(d: {
  employee: { fullName: string; code: string } | null;
  property: { name: string } | null;
} & Record<string, unknown>): DeploymentDto {
  const { employee, property, ...rest } = d;
  return {
    ...rest,
    employeeName: employee?.fullName ?? null,
    employeeCode: employee?.code ?? null,
    propertyName: property?.name ?? null,
    paidStatus: derivePaidStatus(Number(rest.billingAmount), Number(rest.paidAmount)),
    shiftUnits: SHIFT_UNITS[String(rest.shift).toUpperCase()] ?? 1,
  };
}

// ---------- employee advances ----------

export interface AdvanceBalance {
  totalTaken: number;
  totalDeducted: number;
  balance: number;
}

/** Σ advances − Σ settlements.advanceDeducted (status != CANCELLED) per employee. */
export async function advanceBalanceMap(employeeIds?: string[]): Promise<Map<string, AdvanceBalance>> {
  const empFilter = employeeIds ? { employeeId: { in: employeeIds } } : {};
  const [adv, set] = await Promise.all([
    db.advance.groupBy({ by: ["employeeId"], _sum: { amount: true }, where: empFilter }),
    db.settlement.groupBy({
      by: ["employeeId"],
      _sum: { advanceDeducted: true },
      where: { status: { not: "CANCELLED" }, ...empFilter },
    }),
  ]);
  const map = new Map<string, AdvanceBalance>();
  for (const row of adv) {
    map.set(row.employeeId, { totalTaken: round2(row._sum.amount ?? 0), totalDeducted: 0, balance: round2(row._sum.amount ?? 0) });
  }
  for (const row of set) {
    const cur = map.get(row.employeeId) ?? { totalTaken: 0, totalDeducted: 0, balance: 0 };
    cur.totalDeducted = round2(row._sum.advanceDeducted ?? 0);
    cur.balance = round2(cur.totalTaken - cur.totalDeducted);
    map.set(row.employeeId, cur);
  }
  return map;
}

// ---------- trips ----------

export function tripTarget(t: { finalAmount: number | null; agreedAmount: number; extraCharges: number }): number {
  return round2(t.finalAmount ?? t.agreedAmount + t.extraCharges);
}

export function tripPaymentStatusFor(paidAmount: number, target: number): "PENDING" | "PARTIAL" | "PAID" {
  if (paidAmount <= EPS) return "PENDING";
  if (paidAmount + EPS < target) return "PARTIAL";
  return "PAID";
}

/** Overlapping CONFIRMED/ACTIVE trip on the vehicle? (open-ended trip blocks everything after start) */
export async function findOverlappingTrip(
  vehicleId: string,
  startAt: Date,
  endAt: Date | null,
  excludeTripId?: string
) {
  const trips = await db.trip.findMany({
    where: { vehicleId, status: { in: ["CONFIRMED", "ACTIVE"] }, ...(excludeTripId ? { id: { not: excludeTripId } } : {}) },
    select: { id: true, startAt: true, endAt: true },
  });
  const newStart = startAt.getTime();
  const newEnd = endAt ? endAt.getTime() : Number.POSITIVE_INFINITY;
  return trips.find((t) => t.startAt.getTime() <= newEnd && (t.endAt ? t.endAt.getTime() : Number.POSITIVE_INFINITY) >= newStart) ?? null;
}

// ---------- vehicle stats ----------

export interface VehicleStat {
  monthRevenue: number;
  monthExpense: number;
  monthEmi: number;
  monthNet: number;
  revenue: number;
  expense: number;
  emi: number;
  net: number;
}

export function emptyVehicleStat(): VehicleStat {
  return { monthRevenue: 0, monthExpense: 0, monthEmi: 0, monthNet: 0, revenue: 0, expense: 0, emi: 0, net: 0 };
}

/** Revenue = trip paidAmount (by startAt). Expenses exclude EMI; EMI tracked separately. */
export async function vehicleStatsMap(vehicleIds: string[]): Promise<Map<string, VehicleStat>> {
  const map = new Map<string, VehicleStat>();
  if (!vehicleIds.length) return map;
  for (const id of vehicleIds) map.set(id, emptyVehicleStat());
  const now = new Date();
  const mFrom = new Date(now.getFullYear(), now.getMonth(), 1);
  const mTo = endOfDay(now);
  const [trips, expenses] = await Promise.all([
    db.trip.findMany({
      where: { vehicleId: { in: vehicleIds }, status: { not: "CANCELLED" } },
      select: { vehicleId: true, startAt: true, paidAmount: true },
    }),
    db.expense.findMany({
      where: { vehicleId: { in: vehicleIds } },
      select: { vehicleId: true, date: true, amount: true, categoryName: true, kind: true },
    }),
  ]);
  for (const t of trips) {
    const s = map.get(t.vehicleId);
    if (!s) continue;
    s.revenue = round2(s.revenue + t.paidAmount);
    if (t.startAt >= mFrom && t.startAt <= mTo) s.monthRevenue = round2(s.monthRevenue + t.paidAmount);
  }
  for (const e of expenses) {
    if (!e.vehicleId) continue; // nullable FK; filtered by query but guard anyway
    const s = map.get(e.vehicleId);
    if (!s) continue;
    if (e.kind === "CAPITAL") continue; // owner capital movements are never vehicle opex (defensive)
    const isEmi = (e.categoryName ?? "").toUpperCase() === "EMI";
    if (!isEmi) s.expense = round2(s.expense + e.amount);
    else s.emi = round2(s.emi + e.amount);
    if (e.date >= mFrom && e.date <= mTo) {
      if (!isEmi) s.monthExpense = round2(s.monthExpense + e.amount);
      else s.monthEmi = round2(s.monthEmi + e.amount);
    }
  }
  for (const s of map.values()) {
    s.monthNet = round2(s.monthRevenue - s.monthExpense - s.monthEmi);
    s.net = round2(s.revenue - s.expense - s.emi);
  }
  return map;
}

/** emiEndDate derived from loan config: emiStartDate + emiCount months. */
export function deriveEmiEndDate(v: { emiStartDate: Date | null; emiCount: number | null }): Date | null {
  if (!v.emiStartDate || !v.emiCount || v.emiCount <= 0) return null;
  return addMonths(v.emiStartDate, v.emiCount);
}

/**
 * THE single EMI schedule builder — shared by emis/generate and emis/regenerate.
 * Creates one VehicleEmiPayment row per installment month that does not exist yet
 * (idempotent). Months that already have a row are skipped, so PAID installments
 * keep their recorded amounts and are never duplicated.
 * Returns the number of rows created.
 */
export async function fillMissingEmiSchedule(
  tx: Tx,
  vehicleId: string,
  loan: { monthlyEmi: number; emiStartDate: Date; emiCount: number },
): Promise<number> {
  const existing = await tx.vehicleEmiPayment.findMany({ where: { vehicleId }, select: { month: true } });
  const existingMonths = new Set(existing.map((e) => e.month));
  const toCreate: { vehicleId: string; month: string; dueDate: Date; amount: number }[] = [];
  for (let i = 0; i < loan.emiCount; i++) {
    const due = addMonths(loan.emiStartDate, i);
    const mk = monthKey(due);
    if (existingMonths.has(mk)) continue;
    toCreate.push({ vehicleId, month: mk, dueDate: due, amount: loan.monthlyEmi });
  }
  if (toCreate.length) {
    await tx.vehicleEmiPayment.createMany({ data: toCreate });
  }
  return toCreate.length;
}

// ---------- auto expense creation (EMI / maintenance) ----------

/** Finds (or lazily creates) the given category within a business, falling back to COMMON. */
export async function ensureCategory(name: string, business: string): Promise<{ id: string | null; name: string }> {
  const found = await db.expenseCategory.findFirst({ where: { name, business } });
  if (found) return { id: found.id, name: found.name };
  const common = await db.expenseCategory.findFirst({ where: { name, business: "COMMON" } });
  if (common) return { id: common.id, name: common.name };
  try {
    const created = await db.expenseCategory.create({ data: { name, business, kind: "FINANCIAL" } });
    return { id: created.id, name: created.name };
  } catch {
    return { id: null, name };
  }
}

// ---------- notifications engine ----------

export interface AppNotification {
  key: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  title: string;
  message: string;
  view: string;
  params?: Record<string, unknown>;
}

const SEV_ORDER: Record<string, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };

/** Live-computed notifications, filtered by dismissals, severity-sorted. */
export async function computeNotifications(): Promise<AppNotification[]> {
  const now = new Date();
  const today = startOfDay(now);
  const in7 = endOfDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7));
  const in30 = endOfDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30));
  const list: AppNotification[] = [];

  // 1) Property outstanding balances
  const { properties, map: ledgers } = await loadAllLedgers();
  for (const p of properties) {
    const led = ledgers.get(p.id);
    if (!led || led.outstanding <= EPS) continue;
    const daysOver = led.oldestUnpaidDate
      ? Math.floor((today.getTime() - parseYmd(led.oldestUnpaidDate).getTime()) / 86400000)
      : 0;
    list.push({
      key: `prop-outstanding-${p.id}`,
      severity: daysOver > 14 ? "CRITICAL" : "WARNING",
      title: `${p.name} — payment pending`,
      message: `₹${led.outstanding.toLocaleString("en-IN")} outstanding across ${led.unpaidCount} unpaid day(s)${led.oldestUnpaidDate ? `; oldest since ${led.oldestUnpaidDate}` : ""}.`,
      view: "payments",
      params: { propertyId: p.id, propertyName: p.name },
    });
  }

  // 2) Employee advance balances (top 3)
  const balances = await advanceBalanceMap();
  const owing = [...balances.entries()]
    .filter(([, b]) => b.balance > EPS)
    .sort((a, b) => b[1].balance - a[1].balance)
    .slice(0, 3);
  if (owing.length) {
    const emps = await db.employee.findMany({
      where: { id: { in: owing.map(([id]) => id) } },
      select: { id: true, fullName: true, code: true },
    });
    const byId = new Map(emps.map((e) => [e.id, e]));
    for (const [empId, bal] of owing) {
      const emp = byId.get(empId);
      if (!emp) continue;
      list.push({
        key: `emp-advance-${empId}`,
        severity: "INFO",
        title: `${emp.fullName} holds an advance`,
        message: `Advance balance ₹${bal.balance.toLocaleString("en-IN")} — will be deducted in the next settlement.`,
        view: "advances",
        params: { employeeId: empId },
      });
    }
  }

  // 3) Previous-month settlements not finalized
  const prevMonth = monthKey(addMonths(new Date(now.getFullYear(), now.getMonth(), 1), -1));
  const draftCount = await db.settlement.count({ where: { month: prevMonth, status: "DRAFT" } });
  if (draftCount > 0) {
    list.push({
      key: `settle-draft-${prevMonth}`,
      severity: "WARNING",
      title: "Previous month settlements pending",
      message: `${draftCount} settlement draft(s) for ${prevMonth} not finalized yet.`,
      view: "settlements",
      params: { month: prevMonth },
    });
  }

  // 4) EMI due within 7 days
  const emis = await db.vehicleEmiPayment.findMany({
    where: { status: "PENDING", dueDate: { gte: today, lte: in7 } },
    include: { vehicle: { select: { name: true } } },
    orderBy: { dueDate: "asc" },
  });
  for (const e of emis) {
    list.push({
      key: `emi-${e.id}`,
      severity: "WARNING",
      title: `EMI due — ${e.vehicle.name}`,
      message: `₹${e.amount.toLocaleString("en-IN")} EMI for ${e.month} due on ${dayKey(e.dueDate)}.`,
      view: "vehicle-detail",
      params: { vehicleId: e.vehicleId },
    });
  }

  // 5) Insurance / fitness expiry within 30 days
  const vehicles = await db.vehicle.findMany({
    select: { id: true, name: true, registrationNumber: true, insuranceExpiry: true, fitnessExpiry: true },
  });
  for (const v of vehicles) {
    if (v.insuranceExpiry && v.insuranceExpiry.getTime() <= in30.getTime()) {
      list.push({
        key: `veh-ins-${v.id}`,
        severity: v.insuranceExpiry < today ? "CRITICAL" : "WARNING",
        title: `Insurance ${v.insuranceExpiry < today ? "expired" : "expiring"} — ${v.name}`,
        message: `Insurance (${v.registrationNumber}) expires on ${dayKey(v.insuranceExpiry)}.`,
        view: "vehicle-detail",
        params: { vehicleId: v.id },
      });
    }
    if (v.fitnessExpiry && v.fitnessExpiry.getTime() <= in30.getTime()) {
      list.push({
        key: `veh-fit-${v.id}`,
        severity: v.fitnessExpiry < today ? "CRITICAL" : "WARNING",
        title: `Fitness ${v.fitnessExpiry < today ? "expired" : "expiring"} — ${v.name}`,
        message: `Fitness certificate for ${v.registrationNumber} expires on ${dayKey(v.fitnessExpiry)}.`,
        view: "vehicle-detail",
        params: { vehicleId: v.id },
      });
    }
  }

  // 6) Scheduled maintenance
  const maintenances = await db.maintenance.findMany({
    where: { status: "SCHEDULED" },
    include: { vehicle: { select: { name: true } } },
    orderBy: { date: "asc" },
  });
  for (const m of maintenances) {
    list.push({
      key: `mnt-${m.id}`,
      severity: "INFO",
      title: `Maintenance scheduled — ${m.vehicle.name}`,
      message: `${m.type} on ${dayKey(m.date)}${m.description ? ` — ${m.description}` : ""}.`,
      view: "vehicle-detail",
      params: { vehicleId: m.vehicleId },
    });
  }

  // 7) Trips with pending payments
  const trips = await db.trip.findMany({
    where: { status: { not: "CANCELLED" }, paymentStatus: { in: ["PENDING", "PARTIAL"] } },
    include: { vehicle: { select: { name: true } }, client: { select: { name: true } } },
    orderBy: { startAt: "asc" },
    take: 10,
  });
  for (const t of trips) {
    const pending = round2(tripTarget(t) - t.paidAmount);
    if (pending <= EPS) continue;
    list.push({
      key: `trip-pay-${t.id}`,
      severity: "WARNING",
      title: `Trip payment pending — ${t.vehicle.name}`,
      message: `${t.client?.name ?? "Client"} owes ₹${pending.toLocaleString("en-IN")} (${t.rentalType.toLowerCase()} from ${dayKey(t.startAt)}).`,
      view: "trips",
      params: { tripId: t.id },
    });
  }

  const dismissed = await db.notificationDismiss.findMany({ select: { key: true } });
  const dismissedSet = new Set(dismissed.map((d) => d.key));
  return list
    .filter((n) => !dismissedSet.has(n.key))
    .sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
}

// ---------- misc ----------

/** Next sequential code like EMP-007 / VEH-003 based on existing rows. */
export async function nextCode(prefix: string, kind: "employee" | "vehicle"): Promise<string> {
  const rows =
    kind === "employee"
      ? await db.employee.findMany({ where: { code: { startsWith: `${prefix}-` } }, select: { code: true } })
      : await db.vehicle.findMany({ where: { code: { startsWith: `${prefix}-` } }, select: { code: true } });
  let max = 0;
  for (const r of rows) {
    const n = parseInt(r.code.slice(prefix.length + 1), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

export function requireEnum<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  const v = String(value ?? "").toUpperCase();
  if (!allowed.includes(v as T)) {
    throw new HttpError(400, `Invalid ${label}: must be one of ${allowed.join(", ")}`);
  }
  return v as T;
}

export function requirePositiveAmount(value: unknown, label = "Amount"): number {
  const n = typeof value === "string" ? parseFloat(value) : Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new HttpError(400, `${label} must be greater than 0`);
  return round2(n);
}

export function optionalAmount(value: unknown, fallback = 0): number {
  if (value === undefined || value === null || value === "") return fallback;
  const n = typeof value === "string" ? parseFloat(value) : Number(value);
  if (!Number.isFinite(n)) throw new HttpError(400, "Invalid number value");
  return round2(n);
}
