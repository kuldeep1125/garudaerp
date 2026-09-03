# BizHub API Contract (v1) — BINDING for backend & frontend agents

All endpoints live under `/api`. JSON in/out. Money = number (rupees, round 2dp). Dates: `YYYY-MM-DD` strings for day-precision; `DateTime` ISO strings where time matters.

## Conventions
- Success: `200` with data (bare object/array or `{ items, total, page, pageSize }` for lists).
- Error: non-200 with `{ error: string }`. Client shows `error`.
- Auth: httpOnly cookie `bizhub_session` set by `/api/auth/login`. All non-auth endpoints return `401 { error: "Unauthorized" }` when missing/invalid.
- List endpoints accept `page` (1-based), `pageSize` (default 50, max 200), plus documented filters.
- All mutating endpoints write an AuditLog entry (server-side responsibility).

## Shape reference
```
Owner { id, name, username, mobile, isActive, createdAt }
Employee { id, code, fullName, photoUrl, dob, gender, mobile, whatsapp, address, city, emergencyContact,
  joiningDate, designation, skills, standardRate, rateType, status: ACTIVE|INACTIVE|SUSPENDED|LEFT,
  bankDetails, upiId, preferredPaymentMethod, notes, advanceBalance (computed), createdAt }
Property { id, name, brandName, type, address, contactPerson, contactNumber, whatsapp, email,
  startDate, status: ACTIVE|INACTIVE, notes, createdAt }
Contract { id, propertyId, propertyName, name, startDate, endDate, billingRate, payoutRate, shift,
  category, maxEmployees, paymentTerms, notes, status: ACTIVE|ENDED }
Deployment { id, date, employeeId, employeeName, employeeCode, propertyId, propertyName, shift,
  workCategory, billingRate, payoutRate, billingAmount, payoutAmount, adjustmentAmount, adjustmentNote,
  status: SCHEDULED|CONFIRMED|COMPLETED|PARTIAL|CANCELLED|NO_SHOW, paidStatus: UNPAID|PARTIAL|PAID,
  paidAmount, notes, createdByName, createdAt }
PropertyPayment { id, propertyId, propertyName, date, amount, method, reference, notes, receivedByName, createdAt }
Advance { id, employeeId, employeeName, employeeCode, date, amount, reason, method, reference, notes, givenByName, createdAt }
Settlement { id, employeeId, employeeName, employeeCode, month(YYYY-MM), totalDays, dayShifts, nightShifts,
  grossEarnings, additions, advanceDeducted, otherDeductions, netPayable, advanceCarryForward,
  status: DRAFT|FINALIZED|PAID, finalizedAt, notes, lines: SettlementLine[] }
SettlementLine { date, propertyName, shift, rate, amount }
Expense { id, date, business: MANPOWER|TRANSPORT, categoryId, categoryName, amount, method, description, notes,
  vehicleId, vehicleName, spentByName, createdByName, createdAt }
ExpenseCategory { id, name, business: MANPOWER|TRANSPORT|COMMON, kind: EXPENSE|FINANCIAL|OWNER }
Vehicle { id, code, registrationNumber, name, make, model, variant, year, purchaseDate, purchasePrice,
  status: AVAILABLE|RENTED|TRIP|MAINTENANCE|INACTIVE, insuranceCompany, insuranceNumber, insuranceExpiry,
  permitInfo, fitnessExpiry, notes, loanAmount, monthlyEmi, emiStartDate, emiEndDate,
  stats: { monthRevenue, monthExpense, monthEmi, monthNet, revenue, expense, net } }
Client { id, name, company, phone, whatsapp, email, address, billingDetails, notes }
Trip { id, vehicleId, vehicleName, vehicleReg, clientId, clientName, startAt, endAt, tripType: RENTAL|TRIP,
  rentalType: DAILY|WEEKLY|MONTHLY|OUTSTATION|LOCAL, pickup, destination, driver, agreedAmount,
  advanceReceived, extraCharges, finalAmount, paymentStatus: PENDING|PARTIAL|PAID,
  status: CONFIRMED|ACTIVE|COMPLETED|CANCELLED, fuelResponsibility, notes, createdByName,
  paidAmount }
EmiPayment { id, vehicleId, month, dueDate, amount, paidDate, status: PENDING|PAID, reference }
Maintenance { id, vehicleId, vehicleName, date, type, description, cost, nextDueDate, status: SCHEDULED|DONE, createdByName }
Notification { key, severity: INFO|WARNING|CRITICAL, title, message, view, params }
AuditEntry { id, ownerName, action, module, recordId, recordLabel, previousValue, newValue, createdAt }
```

## Employees
- `GET /api/employees?search=&status=&page=&pageSize=` → `{ items: Employee[], total, page, pageSize }` (advanceBalance computed: Σ advances − Σ settlements.advanceDeducted where status != CANCELLED)
- `POST /api/employees` body: fullName required + optional fields → Employee (auto code EMP-001…)
- `GET /api/employees/:id` → `{ employee, deployments: Deployment[], advances: Advance[], adjustments, settlements: Settlement[] }` (recent first, limit 100 each)
- `PUT /api/employees/:id` body: any subset → Employee
- `POST /api/employees/:id/status` `{ status }` → Employee

## Properties
- `GET /api/properties?search=&status=&page=&pageSize=` → `{ items: (Property & { activeContractName, totalBilled, totalReceived, totalOutstanding })[], ... }`
- `POST /api/properties` name required
- `GET /api/properties/:id` → `{ property, contracts: Contract[], ledger: { billed, received, outstanding }, deployments: Deployment[], payments: PropertyPayment[], monthly: [{ month, billed, received }] }`
- `PUT /api/properties/:id`

## Contracts
- `GET /api/contracts?propertyId=&status=&page=` → list (propertyName joined)
- `POST /api/contracts` `{ propertyId, name, startDate, endDate?, billingRate, payoutRate, shift?, category?, maxEmployees?, paymentTerms?, notes? }`. Creating with status ACTIVE ends (status=ENDED, endDate=yesterday) other ACTIVE contracts of that property.
- `PUT /api/contracts/:id` — editing rates only affects future; audit logged.
- `GET /api/contracts/resolve?propertyId=&date=YYYY-MM-DD` → `{ contract | null, billingRate, payoutRate (null if no contract) }` (active contract on date; fallback latest started before date → else null)

## Deployments
- `GET /api/deployments?date=&from=&to=&propertyId=&employeeId=&shift=&status=&page=&pageSize=` → `{ items, total, page, pageSize, totals: { billing, payout, margin, count } }`
- `POST /api/deployments` `{ propertyId, date, shift, workCategory?, notes?, overrides?: { [employeeId]: { billingRate, payoutRate } }, employeeIds: string[] }` → creates one Deployment per employee. Rate resolution: override > active contract payoutRate??employee.standardRate for payout; billing: override > contract.billingRate (error if no contract & no override). Rejects duplicates (same employee+property+date+shift, not CANCELLED) with 409 `{ error, duplicates: string[] }`. Response: `{ created: Deployment[], skipped: [{ employeeName, reason }] }`.
- `PUT /api/deployments/:id/status` `{ status }` → Deployment
- `POST /api/deployments/bulk-status` `{ ids: string[], status }` → `{ updated: number }`
- `PUT /api/deployments/:id` `{ billingRate?, payoutRate?, adjustmentAmount?, adjustmentNote?, notes? }` → recalc amounts. Only when status != CANCELLED.

## Payments
- `GET /api/payments?propertyId=&from=&to=&page=` → `{ items, total, page, pageSize, totals: { received } }`
- `GET /api/payments/pending` → `{ items: [{ propertyId, propertyName, outstanding, oldestUnpaidDate, unpaidCount }], total }` (properties with outstanding > 0, desc)
- `POST /api/payments` `{ propertyId, date, amount, method, reference?, notes? }` → PropertyPayment (FIFO allocation implied; per-deployment paidStatus computed dynamically)
- `GET /api/payments/property/:propertyId` → `{ ledger: { billed, received, outstanding }, days: [{ date, billed, paid, outstanding, status }] }` for record-payment dialog.

## Advances
- `GET /api/advances?employeeId=&from=&to=&page=` → `{ items, total, page, pageSize, totals: { given } }`
- `POST /api/advances` `{ employeeId, date, amount, reason?, method?, reference?, notes? }`
- `GET /api/advances/balances` → `{ items: [{ employeeId, employeeName, employeeCode, totalTaken, totalDeducted, balance }], total }` (balance > 0 first)

## Adjustments (employee additions/deductions)
- `GET /api/adjustments?employeeId=&month=` → `{ items: [{ id, employeeId, employeeName, date, type: BONUS|OVERTIME|DEDUCTION|PENALTY|OTHER, amount (signed), reason, createdByName }] }`
- `POST /api/adjustments` `{ employeeId, date, type, amount, reason? }`

## Settlements
- `GET /api/settlements?month=YYYY-MM&status=` → `{ items: Settlement[], totals: { gross, advance, net, count, finalized } }`
- `POST /api/settlements/generate` `{ month }` → regenerates DRAFT settlements for all ACTIVE employees with billable work/adjustments in month; keeps FINALIZED untouched; advances auto-deducted FIFO by advance date (partial carry-forward). Deletes previous DRAFTs for the month and releases their linked advances. Response: `{ generated, drafts }`.
- `PUT /api/settlements/:id` `{ additions?, otherDeductions?, notes? }` (DRAFT only) → recompute netPayable
- `PUT /api/settlements/:id/finalize` → status FINALIZED (locks; audit)
- `PUT /api/settlements/:id/mark-paid` `{ paymentDate?, method? }` → status PAID
- `GET /api/settlements/:id/statement` → `{ settlement, employee, business: { name, address, contact }, lines }` (frontend renders print-ready statement view)

## Expenses
- `GET /api/expenses?business=&categoryId=&vehicleId=&ownerId=(spentBy)&from=&to=&search=&page=` → `{ items, total, page, pageSize, totals: { amount } }`
- `POST /api/expenses` `{ date, business, categoryId?, amount, method?, description?, notes?, vehicleId? }`
- `PUT /api/expenses/:id` / `DELETE /api/expenses/:id` → `{ ok }` (audit DELETE)
- `GET /api/expense-categories?business=` → `{ items }`
- `POST /api/expense-categories` `{ name, business, kind }`
- `GET /api/recurring-expenses` / `POST /api/recurring-expenses` `{ name, business, categoryId?, amount, frequency: MONTHLY, startDate, method?, notes? }` / `POST /api/recurring-expenses/:id/run` `{ upToMonth }` → generates missing monthly Expense records (idempotent by name+month+business), returns `{ created: n }` / `PUT /api/recurring-expenses/:id/toggle`

## Vehicles
- `GET /api/vehicles?status=&search=` → `{ items: Vehicle[] }` (with stats for current month + all-time)
- `POST /api/vehicles` (auto code VEH-001…)
- `GET /api/vehicles/:id` → `{ vehicle, trips: Trip[], expenses: Expense[], emis: EmiPayment[], maintenance: Maintenance[] }`
- `PUT /api/vehicles/:id`

## Clients
- `GET /api/clients?search=` → `{ items: Client[] }` (+ tripCount, totalBusiness per client)
- `POST /api/clients` / `PUT /api/clients/:id`

## Trips
- `GET /api/trips?vehicleId=&clientId=&status=&paymentStatus=&from=&to=&page=` → `{ items, total, totals: { revenue, pending } }`
- `POST /api/trips` `{ vehicleId, clientId, startAt, endAt?, tripType, rentalType, agreedAmount, advanceReceived?, pickup?, destination?, driver?, fuelResponsibility?, notes? }` — validates overlap (vehicle must not have CONFIRMED/ACTIVE trip overlapping; open-ended ACTIVE blocks) → 409 on conflict. Sets vehicle status: RENTED (rental) / TRIP (trip).
- `PUT /api/trips/:id` `{ endAt?, finalAmount?, extraCharges?, paymentStatus?, status?, notes? }` — completing sets vehicle AVAILABLE (unless another active trip).
- `POST /api/trips/:id/payment` `{ amount, method? }` → adds to trip.paidAmount, sets paymentStatus PENDING/PARTIAL/PAID vs (agreedAmount+extraCharges). Trip has `paidAmount` field.

## Vehicle EMI & Maintenance
- `GET /api/vehicles/:id/emis` → `{ items: EmiPayment[] }`
- `POST /api/vehicles/:id/emis/generate` → builds monthly schedule from loan config (from emiStartDate, emiCount installments, monthlyEmi), skipping existing months
- `PUT /api/emis/:id/pay` `{ paidDate?, method? }` → PAID + auto-creates Expense (business TRANSPORT, category EMI, vehicleId) unless exists (idempotent by reference `EMI-:id`)
- `GET /api/maintenance?vehicleId=&status=` / `POST /api/maintenance` `{ vehicleId, date, type, description?, cost?, nextDueDate? }` / `PUT /api/maintenance/:id` `{ status, cost?, nextDueDate? }` — DONE creates Expense (idempotent ref `MNT-:id`)

## Dashboards
- `GET /api/dashboard/summary?range=today|yesterday|week|lastweek|month|lastmonth|custom&from=&to=` →
```
{
  range: { from, to },
  manpower: { employeesDeployed, propertiesServed, expectedBilling, payout, grossMargin, received, pending,
    advancesGiven, expenses, dayShifts, nightShifts, deployments },
  transport: { availableVehicles, onTripVehicles, revenue, expenses, received, pending,
    monthRevenue, monthExpense, monthEmi, monthNet, revenuePerVehicle: [{ vehicleId, vehicleName, revenue }] },
  combined: { revenue, expenses, net, manpowerMargin, transportNet },
  collections: { totalBilled, totalReceived, totalOutstanding, byProperty: [{ propertyId, propertyName, outstanding }] },
  attention: Notification[] (top 6)
}
```
- `GET /api/dashboard/manpower?range=` → manpower block + `trend: [{ date, billing, payout, margin }]` (14 days) + `byProperty: [{ propertyId, propertyName, billing, payout, margin, received, outstanding }]` + `topOwedProperty`
- `GET /api/dashboard/transport?range=` → transport block + `trend: [{ date, revenue }]` + `perVehicle: [{ vehicleId, name, revenue, expense, emi, net }]`

## Reports (each returns `{ columns: [{key,label,type?}], rows: object[], totals: object?, meta }` — CSV-ready)
- `GET /api/reports/employee-earnings?from=&to=` rows: { employeeName, employeeCode, shifts, dayShifts, nightShifts, properties, earnings, advances, netPayable }
- `GET /api/reports/property-revenue?from=&to=` rows: { propertyName, employees, shifts, billing, received, outstanding, collectionPct }
- `GET /api/reports/collections?from=&to=` rows: { date, propertyName, billed, received, outstanding, pct }
- `GET /api/reports/expenses?from=&to=&business=` rows: { date, business, categoryName, description, spentByName, amount }
- `GET /api/reports/profitability?from=&to=&business=` rows: { business, billing, employeePayout, otherExpenses, grossMargin, net }
- `GET /api/reports/vehicle-profitability?from=&to=` rows: { vehicle, revenue, operatingExpenses, emi, net }
- `GET /api/reports/daily-operations?date=` rows: { propertyName, employeeName, shift, status, billingRate, payoutRate, billing, payout }
- `GET /api/reports/owner-expenses?from=&to=` rows: { ownerName, total, manpower, transport, withdrawals, contributions }
- `GET /api/reports/settlement-summary?month=` rows: { employeeName, totalDays, gross, additions, advanceDeducted, net, status }

## Search & Notifications & Audit & Owners & Settings
- `GET /api/search?q=` → `{ employees[], properties[], vehicles[], clients[], expenses[], deployments[] }` (≤5 each, each item: { id, title, subtitle, view, params })
- `GET /api/notifications` → `Notification[]` (live-computed: property payments pending, advance outstanding, prev-month settlements not finalized, EMI due ≤7d, insurance/fitness expiry ≤30d, maintenance scheduled, contract ending ≤30d, trip payment pending). Honors dismissals.
- `POST /api/notifications/dismiss` `{ key }`
- `GET /api/audit?ownerId=&module=&action=&from=&to=&page=` → `{ items, total, page, pageSize }`
- `GET /api/owners` → `{ items: Owner[] }` (+ createdRecords count)
- `POST /api/owners` `{ name, username, mobile?, password? }` / `PUT /api/owners/:id` `{ name?, mobile?, isActive?, password? }`
- `GET /api/settings` → `{ business: { name, address, contact, gstin, logoText } }` / `PUT /api/settings` (same shape, partial ok)
- `GET /api/shifts` → `{ items: [{ id, name, startTime, endTime }] }` (seeded Day/Night; used in deploy form)

## Critical business rules (server-enforced)
1. Historical rates snapshotted on Deployment at creation.
2. Duplicate deployment blocked (409).
3. Finalized settlements immutable (only mark-paid allowed).
4. Payment amount validated > 0; overpayment allowed but audit-flagged.
5. Trip overlap blocked (409).
6. Every create/update/delete audited with owner name.
7. Businesses never mix: expenses/trips carry explicit `business`/vehicle scoping.
