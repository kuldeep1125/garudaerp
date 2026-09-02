# Business Management SaaS — Complete Product Requirements Specification

## 1. Product Overview

The system will be a **centralized business management SaaS/PWA for a group of business owners** to manage two separate businesses from one secure platform:

1. **Manpower / Staffing Supply Business**
   - Employees are supplied/deployed to restaurant properties.
   - Properties pay the business for deployed employees/shifts.
   - Employees are paid according to their agreed rates.
   - The system tracks deployments, attendance/work, property billing, collections, employee earnings, advances, expenses, profitability, and monthly settlements.

2. **Transport / Vehicle Rental Business**
   - Business-owned vehicles are rented to clients or used for trips.
   - Each vehicle has independent revenue, expenses, EMI, maintenance, profitability, and history.
   - This business must remain financially and operationally separate from the manpower business.

The platform should function as a **single business-control center for all owners**, with extremely simple day-to-day data entry and highly automated calculations, reporting, statements, and notifications.

The application must be designed **mobile-first**, with a smooth app-like experience through a **Progressive Web App (PWA)**, while also working properly on desktop/laptop screens.

---

# 2. Core Product Goals

The system should be designed around the following principles:

### 2.1 Minimum Data Entry

Owners should not have to repeatedly enter information that the system already knows.

For example:

- Employee details are entered once.
- Property details are entered once.
- Standard rates are stored once.
- Vehicle information is entered once.
- Recurring expenses can be configured once.
- Monthly employee statements should be generated automatically from recorded work.

### 2.2 Maximum Automation

The system should automatically:

- Calculate daily billing.
- Calculate employee earnings.
- Calculate business margins.
- Calculate monthly employee totals.
- Deduct advances.
- Generate monthly statements.
- Generate PDFs.
- Prepare WhatsApp messages.
- Calculate revenue and expenses.
- Calculate profit/loss.
- Produce daily/weekly/monthly reports.
- Identify unpaid property amounts.
- Calculate outstanding employee advances.
- Calculate vehicle profitability.
- Generate recurring financial records where configured.

### 2.3 One Source of Truth

All business records should exist in one centralized database.

The same data should be reused across:

- Dashboards
- Reports
- Employee statements
- Property statements
- Expense reports
- Profit/loss reports
- Owner reports
- Vehicle reports
- Monthly settlements

There should not be separate manually maintained Excel-style datasets for different reports.

---

# 3. Users and Access Control

## 3.1 Owners

There are currently **15 owners**.

Known owners:

- Yash
- Saurabh
- Santosh
- 12 additional owners

The system must not hardcode the number of owners.

Administrators should be able to:

- Add owner
- Edit owner
- Deactivate owner
- Reactivate owner
- Change owner profile information
- View activity performed by each owner

## 3.2 Owner Permissions

All owners have **equal full access**.

There is currently no requirement for:

- Super admin
- Manager
- Accountant
- Employee login
- Property login
- Restricted owner role

Every owner should be able to access the same business modules and records.

However, the system should still maintain an internal **audit log** identifying which owner created, edited, deleted, approved, or changed each record.

Example:

> Saurabh created deployment #482 at 10:42 AM.

> Yash changed employee rate from ₹850 to ₹900 at 11:17 AM.

This is important for accountability even though all owners have equal permissions.

---

# 4. Authentication and Security

The application should provide secure owner authentication.

Required functionality:

- Login
- Logout
- Password reset
- Change password
- Session management
- Remember-device/session option where appropriate
- Secure password hashing
- Automatic session expiration
- Optional device/session management
- Login activity tracking

Because the system contains financial information, security should be treated as a core requirement rather than an optional feature.

---

# 5. APPLICATION STRUCTURE

The application should contain two clearly separated business areas.

## Main Navigation

### Global

- Dashboard
- Notifications
- Search
- Owners
- Settings
- Activity/Audit Log

### Business 1 — Manpower

- Manpower Dashboard
- Employees
- Properties
- Contracts/Rates
- Deployments
- Attendance/Work Records
- Payments/Collections
- Employee Advances
- Employee Settlements
- Expenses
- Reports

### Business 2 — Transport

- Transport Dashboard
- Vehicles
- Clients
- Trips/Rentals
- Vehicle Expenses
- EMI
- Maintenance
- Revenue
- Profitability
- Reports

The user must always be able to clearly see which business they are operating in.

Financial records from the two businesses must never accidentally mix.

---

# 6. BUSINESS 1 — MANPOWER / STAFFING MANAGEMENT

## 6.1 Business Model

The company supplies its employees/staff to restaurant properties.

Typical workflow:

**Property requests staff → Owner selects employees → Employees are assigned to property → Employee works shift → Property is billed → Payment is received/recorded → Employee earnings accumulate → Advances are deducted → Monthly settlement is generated.**

The system must support different rates and agreements for different properties.

---

# 7. Employee Management

Employees are records in the system.

They do **not** receive login access.

## 7.1 Employee Profile

Each employee should have a detailed profile containing, where required:

### Personal Information

- Employee ID
- Full name
- Profile photo
- Date of birth
- Gender
- Mobile number
- WhatsApp number
- Alternate contact
- Address
- City
- Emergency contact
- Joining date
- Employment status

### Payment Information

- Payment/bank details
- UPI ID
- Account holder name
- Bank name
- Account number
- IFSC
- Preferred payment method

### Employment Information

- Job/designation
- Skills/category
- Experience
- Standard payout rate
- Rate type
- Joining date
- Current status:
  - Active
  - Inactive
  - Suspended
  - Left business

### Additional Information

- Documents
- Notes
- Internal remarks
- Advance balance
- Historical rate changes

Sensitive information should be protected appropriately.

---

# 8. Employee Rate Management

Employee payment rates should not necessarily be permanently fixed.

The system should support:

- Standard employee rate
- Property-specific rate
- Shift-specific rate
- Assignment-specific rate
- Temporary rate override
- Effective-from date
- Effective-to date
- Historical rate records

Example:

Employee A:

- Property A → ₹800/day
- Property B → ₹900/day
- Special event → ₹1,000/day

The exact rate used for an assignment must be stored with that assignment so historical calculations never change accidentally when the employee's standard rate is later modified.

---

# 9. Property Management

Each restaurant/property should have its own master profile.

## Property Profile

Fields may include:

- Property ID
- Property name
- Brand/company name
- Property type
- Address
- Contact person
- Contact number
- WhatsApp number
- Email
- Billing contact
- Payment contact
- Start date
- Contract status
- Active/inactive status
- Notes

---

# 10. Property Contract and Rate Management

Because billing rates vary by property/contract, the system must support flexible contracts.

Each property may have:

- Contract name/number
- Contract start date
- Contract end date
- Billing rate
- Employee payout rate
- Shift
- Work category
- Number of employees allowed/required
- Special terms
- Payment terms
- Notes

Rates must be configurable instead of hardcoded.

The system should support rate history.

Example:

Property A:

| Period | Property Billing | Employee Payout |
|---|---:|---:|
| Jan–Mar | ₹1,000 | ₹800 |
| Apr–Jun | ₹1,100 | ₹850 |

Historical records must continue using the rates that were active when the work was performed.

---

# 11. Employee Deployment / Assignment

This is one of the most important modules.

When a property requests workers, an owner should be able to create a deployment in only a few steps.

## Deployment Flow

1. Select property.
2. Select date.
3. Select shift.
4. Select one or multiple employees.
5. Select work/category if applicable.
6. System loads applicable rates automatically.
7. Owner reviews the assignment.
8. Save.

The system should support multiple employees in one operation.

Example:

> Property A requests 5 employees for the night shift.

Owner selects:

- Employee 1
- Employee 2
- Employee 3
- Employee 4
- Employee 5

The system immediately calculates the expected billing and employee payout.

---

# 12. Shift Management

Initial shifts:

- Day
- Night

The architecture should support additional shifts later, such as:

- Morning
- Evening
- Full Day
- Custom shift

Each shift record may include:

- Name
- Start time
- End time
- Billing rate
- Employee rate
- Break rules if required

---

# 13. Daily Deployment Record

Every employee assignment must create an immutable historical work record containing:

- Date
- Employee
- Property
- Shift
- Work/category
- Property billing rate
- Employee payout rate
- Expected property billing
- Expected employee payout
- Owner who created the record
- Creation timestamp
- Notes
- Status

The actual rate used must be saved to the work record.

Changing a property's current rate in the future must not alter historical records.

---

# 14. Daily Earnings Calculation

The application must automatically calculate daily financial totals.

Example:

Property A:

5 employees × ₹1,000 billing rate

= ₹5,000 expected property billing.

Employee payout:

5 employees × ₹800

= ₹4,000 employee payout.

Gross manpower margin:

₹5,000 − ₹4,000

= ₹1,000

The dashboard should be able to show:

- Total expected billing
- Total employee payout
- Gross margin
- Number of employees deployed
- Number of properties served
- Day/night breakdown

---

# 15. Flexible Margin Calculation

The system must not assume that every contract follows the same margin formula.

The contract should support:

### Option A — Automatic Margin

Property billing − employee payout.

### Option B — Manually Defined Owner/Business Cut

An owner can explicitly define the business margin/cut for a contract or assignment.

### Option C — Special Adjustment

Allow additional adjustments such as:

- Bonus
- Deduction
- Commission
- Transportation charge
- Overtime
- Penalty
- Other adjustment

The final calculation should therefore be transparent rather than relying on hidden assumptions.

---

# 16. Attendance / Work Confirmation

Because employee salary depends on actual work performed, the system should distinguish between:

- Scheduled assignment
- Confirmed work
- Cancelled assignment
- No-show
- Replacement
- Partial shift
- Completed shift

A work record should be finalized before being included in monthly settlement.

Where practical, owners should be able to mark multiple employees as completed together.

---

# 17. Daily Property Payment / Collection Tracking

The system must track whether a property has paid for its deployed staff/work.

Basic requirement:

**Payment Received: YES / NO**

Per property and date.

The system should also support a more detailed payment record so the system is useful for actual accounting.

Possible fields:

- Property
- Work date
- Expected amount
- Received amount
- Payment date
- Payment method
- Reference/transaction number
- Received by owner
- Notes
- Outstanding amount

The UI can still keep this very simple:

> Property A — ₹5,000 — Received ✓

or

> Property B — ₹8,000 — Pending ₹8,000

---

# 18. Property Outstanding / Receivables

The system must automatically calculate:

- Today's outstanding
- This week's outstanding
- This month's outstanding
- Total property outstanding
- Property-wise outstanding
- Oldest unpaid amount
- Payment history

A property detail page should show:

**Total billed → Total received → Total outstanding.**

---

# 19. Property History

Every property should have a complete historical timeline.

It should show:

- Employees deployed
- Dates worked
- Shifts
- Rates
- Total billing
- Payments received
- Outstanding amounts
- Adjustments
- Contracts
- Rate changes
- Notes

Filters:

- Date range
- Employee
- Shift
- Payment status
- Contract

---

# 20. Employee History

Every employee should have a full historical record.

It should show:

- Date
- Property
- Shift
- Work
- Rate
- Daily earning
- Advance
- Deduction
- Adjustment
- Monthly settlement
- Outstanding advance

The employee profile should make it easy to answer:

> Where did this employee work?

> How much did they earn?

> How much advance have they taken?

> How much remains payable?

---

# 21. Employee Advances

Owners must be able to record advances given to employees.

Each advance should include:

- Employee
- Date
- Amount
- Reason
- Payment method
- Given by owner
- Reference number if applicable
- Notes

The system must maintain a running employee advance balance.

Example:

Employee receives:

₹3,000 advance.

Later:

₹2,000 advance.

Total outstanding advance:

₹5,000.

---

# 22. Advance Repayment / Deduction

At month-end, employee advances should automatically be deducted from payable salary/earnings.

Example:

Monthly earnings = ₹25,000

Advance = ₹5,000

Final payable = ₹20,000

The calculation must appear clearly in the employee statement.

The system should support:

- Full deduction
- Partial deduction
- Manual adjustment
- Carry-forward balance

Example:

Salary = ₹10,000

Advance balance = ₹15,000

Only ₹10,000 can be deducted.

Remaining advance:

₹5,000 carried into the next month.

---

# 23. Employee Monthly Settlement

At the end of each month, the system should generate a complete settlement for every employee.

The settlement should calculate:

- Total working days
- Total shifts
- Day shifts
- Night shifts
- Property-wise work
- Rate per shift
- Gross earnings
- Bonuses
- Overtime
- Other additions
- Advances
- Other deductions
- Net payable
- Previous outstanding advance
- Remaining advance after deduction

The owner should be able to review the settlement before finalization.

Once finalized, the settlement should be locked from accidental modifications.

Any correction should create an adjustment/revision rather than silently changing the finalized statement.

---

# 24. Employee Monthly Statement PDF

Each employee should receive a professional PDF statement.

The PDF should look similar to a formal salary/bank-style statement rather than a simple text document.

It should include:

### Header

- Business/company name
- Logo
- Statement period
- Employee name
- Employee ID

### Detailed Table

| Date | Property | Shift | Rate | Earnings |
|---|---|---|---:|---:|

Every working day should appear individually.

### Summary

- Total days
- Total shifts
- Gross earnings
- Additions
- Advance deductions
- Other deductions
- Net payable
- Remaining advance

### Footer

- Statement generation date
- System-generated statement identifier
- Business contact information
- Notes/terms if required

PDFs should be available for download from the dashboard even if WhatsApp delivery fails.

---

# 25. Automated WhatsApp Statements

After monthly settlements are finalized, the system should automatically prepare and send the employee statement.

Current requirement:

**Unofficial WhatsApp automation**

Possible implementation:

- Baileys
- whatsapp-web.js
- Similar WhatsApp Web automation technology

The WhatsApp system should be implemented as a separate module so that it can later be replaced by the official WhatsApp Business API without rewriting the accounting system.

## WhatsApp Workflow

1. Monthly settlement finalized.
2. PDF generated.
3. Employee WhatsApp number verified.
4. Message prepared.
5. PDF attached.
6. Message sent.
7. Delivery/send status recorded.
8. Failure logged.
9. Owner can retry manually.

Possible statuses:

- Pending
- Queued
- Sending
- Sent
- Failed
- Retry required

The dashboard must always provide a manual PDF download fallback.

---

# 26. WhatsApp Automation Safety

The system should include:

- Sending queue
- Retry mechanism
- Rate limiting
- Delayed/staggered sending
- Failure handling
- Session health monitoring
- Connected/disconnected status
- Delivery logs
- Duplicate-send prevention

The unofficial integration must remain isolated from the core application so that changing WhatsApp providers later does not affect the rest of the system.

---

# 27. Owner Expense Management

A centralized expense system must track money spent by owners/business.

Every expense should contain:

- Date
- Business
- Owner
- Category
- Amount
- Payment method
- Description
- Recurring/non-recurring
- Attachment/receipt
- Notes

---

# 28. Expense Categories

The system should support customizable categories.

Examples:

### Business Expenses

- Office
- Salary
- Food
- Travel
- Fuel
- Repairs
- Equipment
- Software
- Internet
- Phone
- Marketing
- Legal
- Miscellaneous

### Financial

- EMI
- Loan payment
- Interest
- Bank charges

### Owner Transactions

- Owner withdrawal
- Personal draw
- Owner reimbursement
- Owner contribution
- Capital injection

Categories should be configurable rather than hardcoded.

---

# 29. Recurring Expenses

The expense module should support recurring records.

Examples:

- Monthly EMI
- Office rent
- Internet
- Software subscription
- Vehicle EMI
- Insurance

A recurring expense can contain:

- Frequency
- Start date
- End date
- Amount
- Category
- Business
- Owner

The system can automatically generate the expense record according to the configured schedule, while keeping an audit trail.

---

# 30. Owner Financial Dashboard

Because all owners have equal access, the dashboard should still show who spent what.

Examples:

> Yash — ₹25,000

> Saurabh — ₹18,500

> Santosh — ₹31,200

And:

- Total owner expenses
- Business expenses
- Personal withdrawals
- Owner contributions
- Reimbursements
- EMI payments

Filtering should be available by:

- Owner
- Date
- Category
- Business

---

# 31. MANPOWER DASHBOARD

The manpower dashboard should provide an immediate operational and financial overview.

## Today's Summary

Display cards for:

- Employees deployed
- Properties served
- Expected billing
- Employee payout
- Gross margin
- Amount received
- Amount pending
- Advances given today
- Expenses today

## Operational View

Show:

- Today's properties
- Employees assigned
- Day shift
- Night shift
- Missing assignments
- Cancelled assignments
- Payment pending

---

# 32. Daily / Weekly / Monthly Analytics

Every major dashboard should support:

- Today
- Yesterday
- This week
- Last week
- This month
- Last month
- Custom date range

Metrics:

- Revenue/billing
- Employee cost
- Gross margin
- Expenses
- Collections
- Outstanding
- Net profit approximation
- Number of employees
- Number of deployments
- Number of properties

---

# 33. Dashboard Filtering

Reports should support multiple filters.

Examples:

### Employee filter

Show everything related to one employee.

### Owner filter

Show expenses/actions entered by a specific owner.

### Property filter

Show billing, employees, payments, and profitability for one property.

### Date filter

Show records for a specific period.

### Shift filter

Day/night/custom.

### Business filter

Manpower / Transport / Combined where appropriate.

---

# 34. MANPOWER REPORTS

The system should generate professional reports such as:

### Employee Earnings Report

- Employee
- Number of shifts
- Properties
- Earnings
- Advances
- Net payable

### Property Revenue Report

- Property
- Total employees
- Total shifts
- Total billing
- Received
- Outstanding

### Collection Report

- Expected
- Received
- Pending
- Collection percentage

### Expense Report

- Category
- Owner
- Amount
- Date

### Profitability Report

- Billing
- Employee payouts
- Other expenses
- Gross margin
- Net result

### Daily Operations Report

- All deployments
- Employees
- Properties
- Shifts
- Billing

### Monthly Settlement Report

Complete payroll/settlement overview.

All reports should be exportable where appropriate to:

- PDF
- Excel/CSV

---

# 35. BUSINESS 2 — TRANSPORT / VEHICLE BUSINESS

The transport business must function as an independent business module.

Its financial data must not automatically mix with manpower revenue, employee payouts, or manpower profitability.

---

# 36. Vehicle Management

Currently there are:

**2 vehicles**

The system must support adding additional vehicles indefinitely.

## Vehicle Profile

Each vehicle should have:

- Vehicle ID
- Registration number
- Vehicle name/model
- Make
- Model
- Variant
- Manufacturing year
- Purchase date
- Purchase price
- Current status
- Insurance details
- Registration documents
- Permit information
- Fitness information
- Driver information where applicable
- Notes

Status examples:

- Available
- Rented
- On trip
- Maintenance
- Inactive

---

# 37. Vehicle Financial Information

Each vehicle should independently maintain:

- Purchase cost
- EMI
- Loan amount
- EMI start date
- EMI end date
- Monthly EMI
- Insurance
- Maintenance
- Fuel
- Repairs
- Other expenses
- Rental revenue
- Trip revenue
- Other income

This allows actual per-vehicle profitability.

---

# 38. Transport Clients

Transport should have a client/customer module.

Client profile:

- Client ID
- Name
- Company
- Phone
- WhatsApp
- Email
- Address
- Billing details
- Notes
- Payment history

---

# 39. Vehicle Rental / Trip Management

Each rental/trip should record:

- Vehicle
- Client
- Start date/time
- End date/time
- Pickup location
- Destination
- Trip type
- Rental type
- Agreed amount
- Advance received
- Final amount
- Payment status
- Fuel responsibility
- Driver
- Additional charges
- Notes

---

# 40. Transport Revenue

The dashboard should calculate:

- Daily revenue
- Weekly revenue
- Monthly revenue
- Revenue per vehicle
- Revenue per client
- Revenue per trip
- Outstanding client payments

---

# 41. Vehicle Expenses

Expenses should be recorded per vehicle.

Examples:

- Fuel
- Service
- Repairs
- Tyres
- Insurance
- Permit
- Tax
- Cleaning
- Parking
- Toll
- EMI
- Driver costs
- Miscellaneous

Every expense should be linked to the appropriate vehicle wherever possible.

---

# 42. Vehicle Profitability

Each vehicle should have its own profit calculation.

Example:

Revenue:

₹80,000

Expenses:

₹25,000

EMI:

₹15,000

Net operating result:

₹40,000

The system should clearly separate:

- Revenue
- Operating expenses
- Financing/EMI
- Net profit

The exact accounting treatment can be configured later, but the dashboard must make the calculation transparent.

---

# 43. Vehicle History

Each vehicle should have a complete timeline:

- Rentals
- Trips
- Revenue
- Payments
- Expenses
- Maintenance
- EMI
- Repairs
- Documents
- Availability status

---

# 44. TRANSPORT DASHBOARD

The transport dashboard should show:

### Today

- Vehicles available
- Vehicles on trip
- Today's revenue
- Today's expenses
- Payments received
- Pending payments

### Month

- Total revenue
- Total expense
- Total EMI
- Net result
- Revenue per vehicle
- Most profitable vehicle

### Operational

- Current rentals
- Upcoming rentals
- Vehicles under maintenance
- Expiring documents

---

# 45. Combined Management Dashboard

There should be a high-level dashboard for the owners.

However, this dashboard must clearly distinguish the two businesses.

Example:

## Manpower

Revenue: ₹X

Expenses: ₹Y

Profit: ₹Z

## Transport

Revenue: ₹A

Expenses: ₹B

Profit: ₹C

## Combined Business Overview

Revenue: ₹X + ₹A

Expenses: ₹Y + ₹B

Net result: calculated separately and combined.

The user should always be able to drill down into the originating business.

---

# 46. GLOBAL REPORTING SYSTEM

The reporting system should support:

- Daily
- Weekly
- Monthly
- Yearly
- Custom date range

Reports should support filters and grouping.

Possible grouping:

- Owner
- Property
- Employee
- Vehicle
- Client
- Category
- Business
- Shift

---

# 47. Search

A global search should allow owners to quickly find:

- Employee
- Property
- Owner
- Vehicle
- Client
- Invoice/payment
- Deployment
- Expense
- Advance
- Statement

Example:

Searching:

> "Rahul"

could return:

- Employee Rahul
- Previous deployments
- Advances
- Monthly statements

---

# 48. Notifications

The system should provide notifications for important events.

Examples:

- Property payment pending
- Employee advance outstanding
- Monthly settlement ready
- WhatsApp statement failed
- Vehicle EMI due
- Vehicle insurance expiring
- Maintenance due
- Contract expiring
- Important document expiring

Notifications should be visible inside the application.

---

# 49. Audit Log

Every important action should be recorded.

Audit fields:

- User/owner
- Action
- Module
- Record
- Previous value
- New value
- Date/time
- IP/device information where appropriate

Examples:

> Yash changed Property A billing rate from ₹1,000 to ₹1,100.

> Saurabh deleted an expense of ₹5,000.

Critical financial records should preferably use soft-delete/reversal mechanisms instead of permanent deletion.

---

# 50. Data Integrity Rules

The system should prevent common accounting mistakes.

Examples:

### Duplicate Deployment

Prevent accidental duplicate assignment of the same employee to the same property, date, and shift unless explicitly allowed.

### Historical Rate Protection

Changing today's rate must not modify yesterday's records.

### Finalized Statements

Finalized monthly statements should not silently change.

### Payment Validation

Received amount should not accidentally exceed billed amount without an explicit adjustment/credit mechanism.

### Advance Validation

The system should clearly show remaining advance balances.

### Vehicle Availability

A vehicle already booked for a particular time should not automatically be available for another overlapping rental.

---

# 51. Attachments and Documents

The system should allow attachments where useful:

- Employee documents
- Property contracts
- Receipts
- Expense bills
- Vehicle documents
- Insurance
- RC
- Permits
- Payment proofs

Documents should be securely stored and linked to their relevant records.

---

# 52. Backup and Recovery

Because this is financial/business data, the system should include:

- Automated database backups
- Backup retention
- Recovery process
- Secure file backups
- Error logging
- Application monitoring

The backup strategy should be planned before production deployment.

---

# 53. PWA / Mobile Experience

The application should feel like a native mobile application.

Requirements:

- Responsive UI
- Bottom navigation where appropriate
- Large touch targets
- Fast loading
- Mobile-friendly forms
- Sticky action buttons
- Quick-add functionality
- Minimal scrolling
- Search-first interfaces
- Installable PWA
- App icon
- Splash screen
- Responsive desktop layout

---

# 54. Quick Actions

The home/dashboard screen should provide prominent quick actions such as:

### Manpower

- + Deploy Employee
- + Add Expense
- + Record Payment
- + Add Advance
- + Add Employee
- + Add Property

### Transport

- + New Rental
- + Add Vehicle Expense
- + Record Payment
- + Add Maintenance

The objective is that a common daily operation takes only a few taps.

---

# 55. Smart Auto-Fill

The system should automatically fill known information.

Example:

Selecting:

> Property A

could automatically load:

- Active contract
- Applicable billing rate
- Standard employee rates
- Payment terms

Selecting:

> Employee Rahul

could automatically load:

- Employee rate
- WhatsApp number
- Current advance balance

Selecting:

> Vehicle MHXX1234

could automatically load:

- Vehicle information
- Current availability
- EMI
- Current maintenance status

---

# 56. Month-End Automation

At the end of each month, the system should run a settlement process.

### Step 1

Calculate employee work.

### Step 2

Calculate gross earnings.

### Step 3

Apply advances.

### Step 4

Apply approved adjustments.

### Step 5

Generate net payable.

### Step 6

Generate employee PDF.

### Step 7

Queue WhatsApp delivery.

### Step 8

Record delivery result.

### Step 9

Show completion/errors on owner dashboard.

The owner should have a month-end control screen showing:

> 15 employees processed

> 13 statements sent

> 1 failed

> 1 pending review

---

# 57. Dashboard Design Philosophy

Dashboards should not simply display dozens of numbers.

They should answer practical business questions immediately.

For example:

### "How much should we collect today?"

Show:

₹XX,XXX

### "How much have we collected?"

Show:

₹XX,XXX

### "How much is still pending?"

Show:

₹XX,XXX

### "How many employees are working today?"

Show:

XX

### "How much do employees need to be paid?"

Show:

₹XX,XXX

### "Which property owes us the most?"

Show:

Property + amount.

### "Which vehicle made the most this month?"

Show:

Vehicle + revenue/profit.

---

# 58. Financial Dashboard

The financial dashboard should allow owners to understand:

### Revenue

- Manpower billing
- Transport revenue
- Total revenue

### Costs

- Employee payouts
- Business expenses
- Vehicle expenses
- EMI
- Other costs

### Profitability

- Gross margin
- Operating expenses
- Net result

### Cash Position

- Amount received
- Amount pending
- Employee payable
- Outstanding advances
- Owner withdrawals

All figures should be drill-down capable.

For example, tapping:

> ₹75,000 outstanding

should open the exact properties and transactions contributing to that amount.

---

# 59. Reports Must Be Actionable

Every major number should ideally be clickable.

For example:

**Pending ₹42,500**

→ Open pending property payments.

**Employee payout ₹1,20,000**

→ Open employee-wise payout breakdown.

**Expenses ₹32,000**

→ Open detailed expense report.

**Vehicle profit ₹45,000**

→ Open vehicle revenue/expense breakdown.

---

# 60. Exporting

Relevant reports should support:

- PDF
- Excel
- CSV

Exports should preserve:

- Selected date range
- Selected filters
- Selected business
- Selected grouping

Example:

If the owner filters:

> Property = Property A  
> Date = August 2026

the exported report should reflect exactly that filtered dataset.

---

# 61. Settings

The settings section should contain:

### Business settings

- Business name
- Logo
- Address
- Contact information
- Tax information if applicable
- Statement branding

### Manpower settings

- Shifts
- Expense categories
- Adjustment types
- Rate configurations
- Settlement settings

### Transport settings

- Vehicle categories
- Expense categories
- Rental types
- Payment methods

### Notification settings

- WhatsApp
- Statement automation
- Reminder settings

### System

- Backup
- Audit log
- Session/device management
- System preferences

---

# 62. Technology / Architecture

The proposed technology stack is:

### Frontend

**React**

Used to create the responsive, mobile-first PWA.

### Backend

**Laravel**

Used for:

- REST/API
- Authentication
- Business logic
- Financial calculations
- PDF generation
- Scheduled jobs
- Notifications
- Reporting

### Database

**MySQL**

Used as the central relational database.

### WhatsApp

Unofficial WhatsApp automation through a dedicated service/module using a suitable library such as:

- Baileys
- whatsapp-web.js

This must be isolated from the core Laravel application.

### PDF Generation

Laravel-compatible PDF generation such as:

- DomPDF
- Similar server-side PDF library

### Hosting

Initial target:

**Hostinger**

The final deployment architecture should account for whether the selected Hostinger plan supports the required Laravel processes, queues, scheduled jobs, persistent WhatsApp session, and background services. If it does not, those components should be deployed separately rather than weakening the core architecture.

---

# 63. Recommended System Architecture

The architecture should conceptually be:

**React PWA**
↓
**Laravel API**
↓
**MySQL Database**

With supporting services:

**Laravel Queue / Scheduler**
→ Monthly settlements  
→ Notifications  
→ Reports  
→ Automated jobs

**PDF Service**
→ Employee statements

**WhatsApp Service**
→ Automated statement delivery

**File Storage**
→ Documents / receipts / PDFs

**Backup System**
→ Database + files

---

# 64. Important Architecture Requirement

The system should be modular.

At minimum, these modules should be logically separated:

- Authentication
- Owners
- Employees
- Properties
- Contracts
- Deployments
- Attendance
- Property Payments
- Employee Advances
- Employee Settlements
- Expenses
- Reports
- WhatsApp
- Notifications
- Vehicles
- Clients
- Rentals/Trips
- Vehicle Expenses
- Maintenance
- Audit Logs
- Settings

This is important because the system will grow over time.

---

# 65. Future Scalability

Although the current business has approximately:

- 15 owners
- Manpower employees
- Restaurant properties
- 2 vehicles

the system should not be designed around today's exact numbers.

It must support:

- More owners
- Hundreds/thousands of employees
- More properties
- More contracts
- More vehicles
- More clients
- More transactions
- Multiple years of historical data

---

# 66. Most Important User Flows

## Flow A — Deploy Employee

Dashboard  
→ Deploy Employee  
→ Select Property  
→ Select Date  
→ Select Shift  
→ Select Employee(s)  
→ Rates automatically loaded  
→ Review total  
→ Save

---

## Flow B — Record Property Payment

Dashboard  
→ Pending Payments  
→ Select Property  
→ Select outstanding record  
→ Enter received amount  
→ Select payment method  
→ Save

System automatically updates:

- Received
- Outstanding
- Collection dashboard
- Property history

---

## Flow C — Give Employee Advance

Employee  
→ Give Advance  
→ Enter amount  
→ Enter reason  
→ Save

System automatically updates:

**Employee advance balance.**

---

## Flow D — Month-End Employee Settlement

Settlement Center  
→ Select Month  
→ Generate settlements  
→ Review employees  
→ Approve/finalize  
→ Generate PDFs  
→ Queue WhatsApp messages  
→ Monitor delivery

---

## Flow E — Vehicle Rental

Transport  
→ New Rental  
→ Select Client  
→ Select Vehicle  
→ Enter date/time  
→ Enter trip/rental details  
→ Enter amount  
→ Save

Vehicle becomes unavailable for the booked period.

---

## Flow F — Add Vehicle Expense

Vehicle  
→ Expenses  
→ Add Expense  
→ Select category  
→ Enter amount  
→ Attach bill  
→ Save

Dashboard immediately updates vehicle profitability.

---

# 67. MVP vs Future Features

The first production version should prioritize the functionality that directly runs the business.

## Phase 1 — Core

- Owner authentication
- Employee management
- Property management
- Contracts/rates
- Deployment
- Attendance/work confirmation
- Property collections
- Employee advances
- Monthly settlements
- PDF statements
- Expenses
- Manpower dashboard
- Vehicle management
- Rentals/trips
- Vehicle expenses
- Transport dashboard
- Reports
- Audit log

## Phase 2 — Automation

- WhatsApp automation
- Recurring expenses
- Automated reminders
- Month-end automation
- Advanced notifications
- Scheduled reports

## Phase 3 — Advanced Analytics

- Advanced profitability analytics
- Forecasting
- Business trends
- Cash-flow analytics
- Advanced dashboards
- Additional automation

---

# 68. Critical Business Rules

The following rules must be treated as system-level requirements:

1. **All 15 owners have equal full access.**

2. **Employees have no login or application access.**

3. **Properties have no login or application access.**

4. **Historical transactions must preserve the rate that was applicable when the transaction occurred.**

5. **Manpower and Transport must maintain separate financial records.**

6. **Employee advances must automatically participate in monthly settlement calculations.**

7. **Finalized settlements must not silently change.**

8. **Every financial modification must have an audit trail.**

9. **Property billing rates are contract/property dependent and cannot be hardcoded globally.**

10. **The system must support adding more owners, employees, properties, contracts, and vehicles without redesigning the database.**

11. **WhatsApp must be treated as an external integration, not as the source of truth.**

12. **PDF statements must remain available even when WhatsApp delivery fails.**

13. **All reports must be generated from transactional data rather than manually maintained numbers.**

14. **The two businesses must never accidentally share or mix operational records.**

---

# 69. Final Product Vision

The finished application should effectively become the owners' **single control center for the entire business**.

An owner should be able to open the application and immediately know:

> How much work was done today?

> How many employees are deployed?

> How much should properties pay us?

> How much have properties actually paid?

> How much is outstanding?

> How much do employees need to be paid?

> How much advance has each employee taken?

> How much did each owner spend?

> How profitable is each property?

> How profitable is each vehicle?

> How much revenue did each business generate this month?

> Where is money currently outstanding?

> What needs attention today?

The system should replace scattered spreadsheets, manual calculations, separate WhatsApp conversations, handwritten payment records, and manually prepared employee statements with **one centralized, automated, auditable business management platform**.

The ultimate design goal is:

**Enter information once → system calculates everything → owners only review, approve, and act.**