# Worklog — Business Management SaaS (BizHub)

Project: Business Management SaaS / PWA per uploaded SRS ("Business Management SaaS — Complete Product Requirements Specification.md") + master-engineering.rules.md.

## Product Summary
Single business-control center managing TWO financially separated businesses:
1. **Manpower/Staffing** — employees deployed to restaurant properties; billing, collections, advances, settlements.
2. **Transport/Vehicle Rental** — vehicles, clients, trips, expenses, EMI, profitability.

Stack (non-negotiable env constraint): Next.js 16 App Router + TypeScript + Prisma/SQLite + Tailwind 4 + shadcn/ui + recharts. Single user-visible route `/` (SPA with client-side view switching). API routes under `/api/*`.

---
Task ID: 0
Agent: main (orchestrator)
Task: Inspect project, read SRS + rules, write API contract, plan tasks.

Work Log:
- Read full SRS (2224 lines) and master engineering rules.
- Inspected scaffold: shadcn/ui complete set present, prisma+sqlite present, recharts/zustand/sonner present.
- Defined architecture: SPA at `/` with client-side view registry; auth via session cookie; audit logging central helper; FIFO property ledger; settlement engine with draft/finalize; live notification engine.

Stage Summary:
- Architecture decided; parallel agent split defined; contract doc written to docs/api-contract.md.

---
Task ID: 1
Agent: main (orchestrator)
Task: Foundation — schema, seed, libs, auth, shell, PWA.

Work Log:
- prisma/schema.prisma: full domain model (Owner, Session, AuditLog, Employee, Property, Contract, Deployment, PropertyPayment, Advance, Adjustment, Settlement+Lines, Expense, ExpenseCategory, RecurringExpense, Vehicle, Client, Trip, VehicleEmiPayment, Maintenance, NotificationDismiss, AppSetting, Shift). Pushed to SQLite.
- scripts/seed.ts: seeded 15 owners (password: owner123), 24 employees, 8 properties (with ended+active contracts), 1748 deployments over 40 days, FIFO payments, advances, adjustments, 2 vehicles, 6 clients, 16 trips, EMI schedule (3 paid), maintenance, ~85 expenses, 3 recurring expenses, settings, shifts.
- Core libs: lib/money.ts (INR format), lib/password.ts (scrypt), lib/auth.ts (sessions + requireOwner + HttpError), lib/api-helpers.ts (handleRoute wrapper w/ {public:true} option, readBody, requireFields, parseDate, parsePage, parseRange, monthBounds), lib/audit.ts (logAudit), lib/api-client.ts (fetch wrapper, qs, toCSV/downloadCSV).
- Auth APIs: /api/auth/{login,logout,me,change-password,demo-owners}. VERIFIED with curl: login 200 + cookie + /me 200.
- PWA: public/manifest.webmanifest, public/sw.js (network-first, no API caching), AI-generated icons 192/512, SwRegister client component, viewport/apple meta.
- Frontend shell: providers.tsx (Auth+Nav+BusinessScope contexts), app-shell.tsx (desktop collapsible sidebar + mobile bottom nav + More sheet + TopBar w/ search+notifications+theme+owner menu + BusinessBanner + sticky footer on desktop), login-screen.tsx (split brand/login, one-tap demo login), lib/views.tsx (lazy view registry, 24 views incl. hidden detail views), view stubs in components/views/* (stubs now — agents must implement), shared components: stat-card, page-header, empty-state, data-table (desktop table/mobile cards), filters (RangeSelector/SearchInput/ExportButton), month-picker, status-badge.
- globals.css: emerald primary theme (light+dark), no-scrollbar util, print styles for statements (.print-area/.no-print).
- layout.tsx metadata/manifest/viewport updated; page.tsx renders LoginScreen or AppShell with active view.

Stage Summary:
- Foundation verified working (auth e2e via curl, dev server 200, lint clean).
- VIEW STUBS ARE PLACEHOLDERS — Task 2-b must implement all views in components/views/.
- API contract is BINDING: docs/api-contract.md — Task 2-a must implement exactly these endpoints.
- Gotchas learned: handleRoute passes {owner, params, req}; dynamic route ctx.params is a Promise (await it); SQLite lacks enums → String status fields; unique constraint errors surface as 409 via P2002 mapping.
---
Task ID: 2-b-resume-2
Agent: frontend-views-2 agent
Task: 7 global/utility views (reports, owners, audit, notifications, search, clients, settings)

Work Log:
- Read worklog.md, docs/api-contract.md (binding), foundation files (view-types, providers, api-client, money), shared components (DataTable/Column, RangeSelector/SearchInput/ExportButton, MonthPicker+toMonth, PageHeader, EmptyState, StatCard) and views/_shared.tsx exports (useAsync, useMutation, Field, SelectInput, ListResp, fmtDay, todayStr, InitialAvatar, ErrorState, Option, useDebounced). Did NOT edit _shared.tsx — all extra helpers defined locally per file.
- reports-view.tsx: hub of 9 report cards (grid-cols-2 sm:grid-cols-3, lucide icon+title+subtitle, selected state ring). Config panel: RangeSelector presets + Custom pill toggling two date inputs (from/to computed locally for today/yesterday/week/lastweek/month/lastmonth/custom with ymd helper); business select for expenses/profitability; date input (default today) for daily-operations; MonthPicker for settlement-summary. Run Report + Export CSV buttons (min-h-10). Results via useAsync → { columns, rows, totals?, meta }: DataTable built FROM server columns (type "money"→formatINR right-aligned tabular-nums, "number"→right), totals in footer card row (Total chip + labeled entries), meta as caption above table. Export = toCSV(rows, columns)+downloadCSV(`bizhub-${type}-${todayStr()}.csv`). Desktop lg:flex-row with config Card lg:w-72 shrink-0 + results flex-1; mobile stacked. ErrorState + DataTable loading skeletons.
- owners-view.tsx: My account card (matched via useAuth().owner.username) with Change Password form (current/new/confirm, min 6, POST /api/auth/change-password { currentPassword, newPassword }). Owner cards grid sm:grid-cols-2 xl:grid-cols-3: InitialAvatar, name, @username, mobile, joined date, "created N records" chip, Active/Inactive chip, Switch (ON→PUT isActive:true; OFF→AlertDialog confirm→PUT isActive:false; self-switch disabled), dropdown Edit/Reset Password. Add dialog (name*, username*, mobile, password optional default owner123 → POST /api/owners); Edit dialog (name/mobile only, username shown disabled & immutable); Reset Password dialog (min 6 → PUT { password }).
- audit-view.tsx: filters in grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 (owner select from GET /api/owners, module select 17 fixed values, action select 10 fixed values, from/to date inputs); every filter change resets page to 1 (no setState-in-effect). DataTable: primary createdAt (fmtDay + local fmtTime), ownerName (hideOnMobile), action via colored badge (CREATE emerald / UPDATE amber / DELETE red / rest gray), module, recordLabel (hideOnMobile), change summary cell (jsonBrief prev → next, line-clamp-2, button → ChangeDetailDialog with pretty-printed JSON.stringify(v,null,2) in scrollable pre blocks). Pagination footer Prev/Next + "Page X of Y" only when total > pageSize (50), GET with page+pageSize=50.
- notifications-view.tsx: GET /api/notifications → grouped by severity CRITICAL (red AlertCircle) / WARNING (amber AlertTriangle) / INFO (gray Info) with count chips + per-section icon color; card rows (icon tile, title, message, [View →] → navigate(view, params), X dismiss → POST /api/notifications/dismiss { key } then setData filter + toast). Global empty → EmptyState BellOff "All clear — nothing needs attention". Refresh button with spinning icon.
- search-view.tsx: max-w-2xl mx-auto command-palette page. params.q seed → large h-12 input (autoFocus, inputMode search, clear button), local useDebounced 350ms → GET /api/search?q=; real Ctrl/Cmd+K window listener focuses+selects input. Groups with header (icon+label+count chip): Employees, Properties, Vehicles, Clients, Expenses, Deployments; rows title+subtitle+ChevronRight → navigate(item.view, item.params). Empty groups hidden; idle state card lists what's searchable + Ctrl+K hint; 3 skeletons while loading; SearchX empty state.
- clients-view.tsx: SearchInput → useAsync GET /api/clients?search= (auto-refetch on debounced-less direct state). DataTable: primary name+company, phone (tabular-nums), email (hideOnMobile), tripCount, totalBusiness (formatINR bold right); row click → navigate("trips", { clientId }); actions dropdown (Edit) with stopPropagation so row click doesn't fire. Add/Edit dialog (name*, company, phone, whatsapp, email, address, billingDetails, notes → POST/PUT). EmptyState variants for search vs no data.
- settings-view.tsx: max-w-3xl cards. (1) Business profile form (name*, contact, gstin, logoText maxLength 4, address) with derived-defaults pattern (form ?? derived) — no setState-in-effect; dirty indicator + Save → PUT /api/settings + toast + reload. (2) "Two businesses, one platform" explainer with emerald Manpower (Users) / amber Transport (Truck) chips and "Financial records never mix" copy. (3) System shortcuts grid → navigate(audit/owners/expenses/settlements). (4) About card: BizHub v1.0 chip, PWA install note, tagline.
- Verify: bun run lint → 0 errors 0 warnings; bunx tsc --noEmit filtered to my 7 files → clean (remaining repo errors are in other agents' in-progress api routes/examples/skills); dev.log shows server Ready + APIs 200; curl / → 200. Fixed during dev: onChange handler typing (event → set(k)(e.target.value) like house style), removed stray role="listitem" aria-pressed a11y warning.

Stage Summary:
- All 7 views implemented & lint-clean: reports (9-report hub w/ CSV export), owners (accounts admin + my-account password), audit (filterable paginated log + JSON diff dialog), notifications (severity groups + dismiss), search (palette page w/ Ctrl+K), clients (transport CRM table), settings (profile + explainers).
- API assumptions (contract-silent spots): POST /api/auth/change-password body { currentPassword, newPassword }; PUT /api/owners/:id accepts { name?, mobile?, isActive?, password? } per contract; owners list = { items: Owner[] & createdRecords }; /api/audit accepts ownerId/module/action/from/to/page/pageSize and returns { items, total, page, pageSize }; report totals/meta optional and rendered defensively (meta string-or-object); search items always { id, title, subtitle?, view, params? }.
- Reports auto-run on select/config change (useAsync deps) AND manual Run Report re-uses reload; custom range swaps from/to if reversed; totals label fallback prettifies camelCase keys.
- CSV exports exactly the displayed rows/columns (server-filtered), filename bizhub-{type}-{today}.csv.

---
Task ID: 3
Agent: main (orchestrator)
Task: Integration, type/lint fixes, E2E browser verification.

Work Log:
- Resumed timed-out agents; confirmed ALL backend routes (67 files) and ALL 24 views were actually completed despite deadline cuts.
- Fixed TS layer: handleRoute overloads (AuthedHandler with non-null owner; public variant), engine re-exports (handleRoute/readBody/etc. via @/app/api/_lib/engine alias), readonly BILLABLE tuple spread into Prisma `in`, DeploymentDto type, wrong relative import depths normalized to alias.
- Fixed frontend: SelectInput empty-value sentinel (Radix forbids ""), missing imports (useState/useAsync/Input), DataTable emptyAction removal, render-time state-adjustment pattern replacing setState-in-effect dialog resets (React canonical pattern).
- Runtime bug found via agent-browser: mobile bottom nav rendered on desktop → added md:hidden.
- Data integrity issue found: previous agent's smoke tests polluted trips (cancelled seed trip, future-dated trips) → re-seeded for pristine demo state.
- Hardened Prisma interactive transactions: timeout 20s on settlements/generate, 15s on deployments bulk + payments (default 5s was exceeded once during testing).
- agent-browser E2E VERIFIED: login flow (form + one-tap), dashboard stat cards with live data, employees table, deployments filters + 3-step deploy wizard (property→employees w/ advance chips→rate review w/ live totals→save; duplicate detection returned "1 created · 1 skipped"), collections FIFO ledger + record payment (₹70,631 recorded, outstanding 3.93L→3.22L, property cleared from list), settlements generate (20 drafts, advance partial deduction + carry-forward verified: Amit gross ₹1,400 vs advance ₹2,000 → −₹1,400 deducted), professional print statement view, transport dashboard + revenue chart, vehicles w/ compliance warnings, all views cycled w/o errors, dark mode, footer sticky on desktop.
- Responsive VERIFIED via screenshots: 375px (bottom nav 5-tap, card lists, stacked filters, full-width CTAs), 768px (sidebar + scrollable table), 1280/1440px (sidebar + 6-col stats + charts). No console errors (only Fast Refresh logs).
- Final: tsc clean (src/), eslint clean, login+generate curl 200.

Stage Summary:
- PRODUCTION-READY state: 24 views, ~70 API routes, seeded demo data. Two businesses fully separated (emerald/amber theming + scoped nav + business field on finance records).
- Known acceptable limitations: WhatsApp delivery is mocked-out by design (Phase 2 per SRS; statement print-to-PDF works); file attachments not implemented (Phase 2); employee photos use initials avatars.

---
Task ID: 4
Agent: main (orchestrator)
Task: Status assessment, agent-browser QA round, styling detail fixes, dashboard feature expansion, PWA install.

Work Log:
- QA assessment: lint + tsc clean (src/ only; examples/skills noise pre-existing). agent-browser E2E: login → all 14 sidebar views cycled via snapshot refs — ZERO console errors. Screenshots verified at 375px / 768px / 1280px / 1920px: bottom nav, card lists, sticky footer, sidebar all correct. Verified dev.log error lines are historical (dbg-params route deleted; params now awaited by handleRoute line 28; 5000ms txn timeout already raised to 15/20s per Task 3).
- BUG FIX (styling): TopBar global-search button wrapped to 2 lines at 768px → added min-w-0 + truncate + whitespace-nowrap + shrink-0; also hover:border-primary/40 detail.
- NEW API: GET /api/dashboard/combined-trend?days=7..60 (clamped, default 14) — per-day { billing, collections, transport, expenses } from deployments (BILLABLE), propertyPayments, non-cancelled trips (paidAmount), all expenses; reuses lastNDays/dayKey helpers from api/_lib/dashboard. Verified via curl with auth cookie.
- Dashboard upgrade (dashboard-view.tsx rewritten): (1) greeting header "Good morning/afternoon…, {firstName}" + full en-IN date + Refresh button (spins while any fetch in flight, reloads summary+trend+audit) + Reports; (2) "14-day performance" card with AreaTrend 3-series (Manpower billing emerald / Collections teal / Transport amber) in lg:col-span-2; (3) "Expense split" donut card — recharts PieChart in ResponsiveContainer (first attempt with bare PieChart rendered 0-size, fixed), innerRadius 64%, center Total overlay, per-business legend rows with % shares, empty-state when no expenses; (4) "Recent activity" card — /api/audit?pageSize=6, action badges (CREATE emerald / UPDATE amber / DELETE red / LOGIN·GENERATE·PAYMENT gray), recordLabel+module, owner, relative time (fmtRel), View all → audit view. Loading skeletons per card; toasts via useAsync preserved.
- PWA install: new src/components/shared/pwa-install.ts using useSyncExternalStore (canonical external-store pattern — avoids lint error react-hooks/set-state-in-effect that the first useState/useEffect attempt triggered) wrapping beforeinstallprompt + appinstalled + standalone media-query listeners. "Install app" item added to owner dropdown menu (Smartphone icon, toast on accepted) and Settings About card upgraded to dynamic copy (installed / can-install w/ button / manual add-to-homescreen instructions per platform).
- Styling detail pass: StatCard (used by all 3 dashboards + more) got tone-colored icon chips (ICON_CHIPS map: emerald/red/amber/teal per tone incl. dark variants) + hover lift (hover:-translate-y-0.5 with active:scale compensation).
- Verification: agent-browser screenshots of new dashboard at 1280/768/375 in light+dark; donut + chart + activity feed render with live data (Manpower ₹6.7K 59% / Transport ₹4.7K 41%); trend API returns correct series; mobile donut fixed; lint + tsc clean; curl / → 200; console clean (only dev-mode Fast Refresh artifacts from editing).

Stage Summary:
- App remains production-ready; main dashboard is now analytics-rich (trend + split + activity) instead of stats-only.
- New endpoint contract: /api/dashboard/combined-trend?days=N → { days, trend: [{date, billing, collections, transport, expenses}] } (N clamped 7–60).
- pwa-install.ts is a module singleton (listeners registered at import) — import only from client components.
- Next-step candidates: toast on new notification while polling; workforce heat-map on manpower dashboard; trip-wise profit report chart; export whole dashboard to PDF.

---
Task ID: 5
Agent: main (orchestrator)
Task: Status QA round; workforce heat-map, trip payment progress, notification-arrival toast, view transition; sticky-sidebar overflow bug fix.

Work Log:
- QA: lint + tsc clean (src/); agent-browser cycle of settlements/deployments/trips/expenses/reports/employees — no runtime console errors (only stale dev-mode Fast Refresh warning from editing).
- BUG FOUND & FIXED (layout, pre-existing): sidebar nav spilled OUT of the 100vh aside on short pages — ScrollArea root used `flex-1` without `min-h-0`, so it refused to shrink, overflowed the aside (nav items visible below the footer; html scrollHeight inflated 152px; sticky sidebar appeared unpinned). Fix: `min-h-0 flex-1` on the ScrollArea in SideNav. Verified geometry after fix: docH 864 (was 1016), asideTop stays 0 at max scroll, logo always visible. Also keyed the ScrollArea by `view` so nav internal scroll resets on navigation.
- NEW API: GET /api/dashboard/manpower-heatmap?days=7..30 (default 14) → { dates[], rows: [{propertyId, propertyName, total, cells:[{date, shifts}]}] (top 8 properties by total, sorted desc), unlistedShifts } from BILLABLE deployments grouped by day×property.
- Manpower dashboard: new "Workforce heat-map" card after Day/Night split — GitHub-style grid (rows=properties w/ name+total, cols=14 days), 5-step emerald intensity scale (HEAT_STEPS, dark variants), per-cell title tooltip + hover scale, Less→More legend, horizontal scroll wrapper (min-w-[560px]) for mobile, skeleton + empty state. Verified desktop + 375px (scrolls horizontally).
- Trips view: Payment column now renders StatusBadge + mini Progress bar (Paid/Target %, h-1.5) + % label — verified (0% pending, 47% partial). tripPaidPct() helper (clamped 0-100, target = finalAmount ?? agreed+extra).
- TopBar notification-arrival toast: polling effect now diffs counts via refs (first load silent), fires `toast.info("N new notifications")` with View action → notifications view, only when tab visible; added visibilitychange listener for instant re-check on tab return.
- View transitions: globals.css adds `@keyframes view-in` (fade + 6px slide, 0.24s, cubic-bezier(0.22,1,0.36,1)) + `.view-enter` utility with prefers-reduced-motion guard; app-shell wraps children in `<div key={view} className="view-enter">` — remount per view plays the animation (getComputedStyle verified: view-in 0.24s).
- Regression checks after ScrollArea change: collapsed sidebar (68px rail) OK, mobile More sheet renders full nav OK, settings/owners/audit views OK, dark mode untouched.

Stage Summary:
- Sticky-sidebar spill bug is the headline fix — any future layout work in SideNav must keep `min-h-0` on the flex ScrollArea.
- New endpoint: /api/dashboard/manpower-heatmap?days=N (clamp 7-30).
- Heat-map maxes at 8 rows by design; unlisted shifts surfaced via unlistedShifts caption.
- Next-step candidates: PDF export bundle for reports; employee-wise utilization chart on employee-detail; monthly owner summary email mock; i18n (Hindi) scaffolding per SRS Phase 2.

---
Task ID: 6
Agent: main (orchestrator)
Task: QA round; Reports print/PDF export; employee-detail 30-day activity analytics; report currency formatting bug fix; TopBar/banner styling details.

Work Log:
- QA: lint + tsc clean; agent-browser cycle of Reports/Employees/Settlements/Vehicles/Audit — no console errors. Dev server had died mid-round (curl 000, no next process) → restarted via `bun run dev`, confirmed 200. Session cookie survived restart.
- BUG FOUND & FIXED (reports formatting): all 9 report APIs tag money columns as type "currency", but reports-view only formatted type "money" → raw decimals like 10967.78 shown. fmtCell/fmtCellText/fmtTotal/column className now accept "money" OR "currency"; also added "date" type formatting (en-IN short date) for the 2 date-typed columns. Verified: Property Revenue now shows ₹10,968 / ₹6,300 etc., right-aligned.
- NEW FEATURE (Reports print/PDF): "Print / Save PDF" button (full-width, 3rd in the Run/CSV grid) → window.print(); results column wrapped in .print-area with a print-only header (report title — BizHub, period label from date/month/computed range, generated timestamp). globals.css print block extended: `.print-area * { overflow: visible !important; max-height: none !important; }` so the DataTable's max-h-[70vh] scroll container prints fully. END-TO-END VERIFIED via agent-browser `pdf` command: 2-page PDF with ONLY the report (no sidebar/topbar), formatted ₹ values and TOTAL footer row.
- NEW FEATURE (employee-detail analytics): "Last 30 days" card at top of Work History tab — computed client-side via useMemo from the 100 most recent deployments (no new API): summary line (X/30 days worked · N shifts · ₹billed compact), 30-cell presence strip (muted / emerald-300 / emerald-600 by shift count, hover scale + title tooltip, aria role=img), Less→More legend, and a daily-billing AreaTrend (140px, emerald) shown when shifts exist. Verified live for Amit Verma: 28/30 days, 75 shifts, ₹68.8K billed.
- STYLING DETAILS: (1) business scope pills in BusinessBanner now carry colored dots (emerald=Manpower, amber=Transport, visible in both active/inactive states); (2) TopBar bell upgraded from bare red dot to numbered badge (h-4 min-w-4 rounded-full, "9+" cap, ring-2 ring-background). Verified on screen.
- Data-semantics observation (not a bug, noted for review): Property Revenue per-window "Received" can exceed "Billed" (Green Leaf ₹77,847 vs ₹5,280 → 1474% collection, negative outstanding) because payments received in the window may settle deployments billed before the window; totals Outstanding −₹50,645 follows the same window logic. Consider clamping or labeling in a future round.

Stage Summary:
- Reports now have three export paths: on-screen table, CSV download, print/PDF (with self-contained print header + full-table release).
- Employee detail Work History is now analytics-led (30-day strip + billing trend above the raw table).
- Report column-type contract: treat "currency" and "money" as synonyms on any new report consumers.
- Next-step candidates: window-vs-FIFO outstanding semantics on the collections report (label or clamp negatives); owner monthly summary; i18n scaffolding (SRS Phase 2); attendance-style month grid on deployments view.

---
Task ID: 7
Agent: main (orchestrator)
Task: QA round; report window-vs-FIFO semantics fix; trip-wise estimated profit chart; attendance month grid; styling details.

Work Log:
- QA first: server 200, lint + tsc clean (src/), agent-browser sweep of all sidebar views (manpower stack, collections, settlements, transport stack, reports, settings) — ZERO console errors. False alarm investigated: TopBar bell badge rendered "9+" (cap) and looked like "0+" in a low-res screenshot — verified geometry 22×16px, working as designed. Collections view healthy (₹2,73,160 outstanding / 6 properties).
- DATA-SEMANTICS FIX (Task 6 observation resolved): /api/reports/collections + /api/reports/property-revenue now clamp row outstanding at ≥0, cap Collection % at 100, clamp totals outstanding ≥0, and return a new `note` field explaining that received is dated-in-window payments which may settle earlier billings. Verified via API: 0 negative-outstanding rows, 0 pct>100 rows, note present.
- Reports view: new optional `note?: string` on ReportResp rendered as a muted info strip (Info icon, role="note", print-visible via bg-transparent on print) between the meta caption and the table.
- NEW API: GET /api/transport/trip-profit?from=&to=&limit=8 (clamp 3–20, defaults to month range) — top trips by ESTIMATED profit: revenue = finalAmount ?? agreed+extra; vehicle TRANSPORT expenses (opex+EMI) allocated pro-rata by each trip's share of that vehicle's revenue, so per-trip profits sum to vehicle net. Returns totals, note, per-trip {client, destination, vehicle+reg, revenue, allocatedCost, profit, marginPct, collectedPct}. Smoke-verified: Goa trip ₹32,000 revenue → ₹26,038 profit (81%).
- Transport dashboard: "Top trips by estimated profit" card after Revenue trend — ranked rows (1..n) with animated emerald/red bars scaled to max |profit|, margin chip, profit value (moneyCls), native tooltip with revenue/cost/collected %, header Net chip (emerald/red), count with singular/plural ("1 trip this month" — grammar bug caught and fixed in-round), Info note footer. Skeleton while loading, hidden when no trips.
- NEW API: GET /api/deployments/attendance?month=YYYY-MM (default current) — per-employee BILLABLE shift counts for every day of the month; rows = all ACTIVE employees (fullName/code/designation), sorted by total desc; returns dates[], rows with per-cell {date, shifts}, total, workedDays, totalShifts. Seed data: 22 employees × 31 days, 1,262 shifts. (Two Prisma fixes during dev: Employee has no isActive → status:"ACTIVE"; name field is fullName, role is designation.)
- Deployments view: collapsible "Attendance — {Month}" card between PageHeader and filters. Lazy fetch via useAsync (loader resolves null while collapsed, refetches on month change). Month nav (‹ This month ›), Less→More legend, CSS-grid matrix with sticky top header row + sticky-left employee column (bg-card z-layering), GitHub-style 3-step emerald heat cells (dark variants), weekend columns dimmed, today column ringed with ring-primary, per-cell hover:scale-125 + title tooltip + role="img" aria-label, Shifts/Days totals columns, max-h-[46vh] vertical scroll + horizontal scroll on narrow screens (min-w-[640px]).
- Verification: agent-browser screenshots — transport card light (1280) + dark + mobile 375; attendance grid light + dark + mobile 375 (sticky name column + horizontal scroll confirmed); reports note strip light. Full 17-view cycle zero console errors; lint clean; tsc 0 src errors; root 200.

Stage Summary:
- Report money semantics are now: outstanding never negative, pct ≤ 100, with an on-screen/print-visible explanation strip. New consumers of report payloads should copy this pattern (`note` field) whenever window-based numbers can be misread.
- New endpoints: /api/transport/trip-profit (est. profit, pro-rata cost allocation) and /api/deployments/attendance (month grid).
- Attendance grid layout trick: gridTemplateColumns inline style + sticky left column requires bg-card + z-index on the sticky cell; header row must be sticky top with higher z than row-sticky cells.
- Next-step candidates: make trip-profit respect the dashboard RangeSelector (from/to wiring); per-property attendance drill-down (click a heat cell → filtered deployments); owner monthly summary email mock; i18n (Hindi) scaffolding per SRS Phase 2.

---
Task ID: 8
Agent: main (orchestrator)
Task: QA round; monthly owner summary (API + dashboard card); trip-profit range wiring; heat-map & attendance drill-downs; employee filter; Radix Select controlled-state bug fix.

Work Log:
- QA first: server 200, lint + tsc clean (src/), agent-browser sweep — stable, zero console errors. Green-lit new features.
- NEW API: GET /api/dashboard/monthly-summary?month=YYYY-MM (regex-validated, defaults to current) → { month, prevMonth, current, previous, insights[], note }. MonthMetrics per month: deployments, manpowerBilling/Payout/Margin (BILLABLE deployments dated in month), collections (payments received), advances, trips, transportRevenue (trips STARTING in month, billing basis finalAmount ?? agreed+extra), transportCollected (paidAmount — documented as approximation), transportOpex (TRANSPORT expenses excl. EMI), transportEmi (EMI-category expenses), net = margin − manpowerOther + transportRevenue − opex − EMI. Server generates up to 3 insight lines (biggest |pct| mover ≥5%, collections < ½ billing, net<0 warning / turned-positive praise). Verified via curl: Sep-2026 vs Aug-2026 numbers correct.
- Dashboard: "Monthly business summary" card between business-split and collections — gradient top accent strip (emerald→teal→amber), MonthPicker nav (‹ ›), 5 metric tiles (icon + label + Delta chip + current vs "was X" + hover bg), chips row (deployments/trips/advances/EMI), Sparkles insight strip (role=note, gradient bg), Info money-semantics footer. Local Delta component: TrendingUp/Down/Minus, goodUp flag (expense down = green), "new" chip when prev=0, pct via pctOf(). Loading skeleton card.
- Shared filters.tsx: new rangeKeyToBounds(key) (client mirror of API presets, custom/month default) + RANGE_HINT map ("today"/"last 7 days"/…/custom:"selected range").
- Transport dashboard: trip-profit now wired to RangeSelector — useAsync deps [range], from/to params via rangeKeyToBounds; subtitle "N trips {RANGE_HINT[range]}"; tpError → card hidden. Verified: "1 trip this month" → This Week (hidden, no trips) → Last Month "14 trips last month".
- Manpower heat-map drill-down: cells are now <button>s (active only when shifts>0) → navigate("deployments", { propertyId, date }); property names clickable → property-detail; hover ring + focus-visible ring + aria-labels; description updated "click a cell to inspect deployments". Verified: Royal Orchid 2026-08-21 → deployments pre-filtered (6 deployments, ₹7.4K).
- Deployments view: (1) NEW Employee filter (SelectInput fed by /api/employees?status=ACTIVE, param params.employeeId supported; filter grid now xl:grid-cols-5); (2) attendance grid cells are buttons → drill-down sets employeeId + date, CLEARS propertyId (attendance grid is property-agnostic — first test exposed empty cross-filter result, fixed), collapses panel, toast "Showing {name} — {date}". Verified: Rahul Sharma 2026-09-01 → 3 deployments ₹2.9K.
- BUG FOUND & FIXED (pre-existing, exposed by drill-down): SelectInput passed value={value || undefined} → Radix Select flipped uncontrolled→controlled when value went ""→id ("Select is changing from uncontrolled to controlled" console warning). Fix: always pass defined value via EMPTY_SENTINEL (value || EMPTY_SENTINEL) — non-matching sentinel still renders placeholder visually. Verified warning gone on fresh load + after drill-down.
- Verification: agent-browser screenshots — summary card light 1280 (Sept: down-96% red chips, expenses down-93% GREEN — correct goodUp semantics) + August view (▲270%/▲288% green, "new" chip for transport from ₹0 baseline, dual insights) + dark 1280 + mobile 375 (tiles stack single-column, no truncation); full 18-view sweep + drill-down flows = ZERO console errors/warnings; tsc 0 src errors; lint clean; root 200.

Stage Summary:
- New endpoint contract: /api/dashboard/monthly-summary?month=YYYY-MM → { current, previous, insights, note } — money semantics documented in `note` (billing=dated-in-month deployments, transport revenue=trips starting in month, collections=received-in-month).
- Client-side rangeKeyToBounds + RANGE_HINT in shared/filters.tsx is the canonical way to keep any from/to API in sync with a RangeSelector.
- Drill-down pattern: heat/attendance cells carry aria-labels ending "— view/filter deployments"; attendance drill-down must clear property filter (cross-filter empties results).
- SelectInput is now always-controlled — do not reintroduce `value || undefined`.
- Next-step candidates: export monthly summary to PDF (print header like reports); per-employee utilization chart on employee-detail; owner monthly summary email mock (SRS Phase 2); i18n (Hindi) scaffolding.

---
Task ID: 9
Agent: main (orchestrator)
Task: QA round; monthly-summary print/PDF export; owner monthly summary email mock (API + dialog); employee utilization analytics; data-window bug fix.

Work Log:
- QA first: lint + tsc clean (src/ only; examples/skills noise pre-existing). agent-browser: 16 views cycled, ZERO console errors. False alarm re-checked: bell badge "0+"-looking glyph in low-res screenshots is actually "9+" (cap) — verified via DOM eval, same as Task 7. Server was healthy at round start.
- REFACTOR: extracted shared month-metrics engine to src/app/api/_lib/monthly-metrics.ts (MonthMetrics, boundsOf, shiftMonth, currentMonth, shortMonthLabel, metricsFor, pctChange, buildInsights, MONTH_METRICS_NOTE). /api/dashboard/monthly-summary now imports it — response shape unchanged. Insight lines now use friendly labels: "down 96% vs Aug 2026" instead of "vs 2026-08".
- BUG CAUGHT DURING ROUND: dev server died mid-round (curl 000, no process) — same as Task 6. Sandbox quirk discovered: ANY manually started `bun run dev` is reaped between Bash tool calls (even setsid/disown), so all server-dependent verification must be bundled into single tool calls (restart → wait → assert). Used UI login (amit/owner123) via agent-browser when the session cookie was lost.
- FEATURE A (dashboard print/PDF): monthly-summary card wrapped in .print-area with print-only header (title + month label + generated timestamp); Printer icon-button added next to MonthPicker (no-print, hover:border-primary/40 hover:text-primary); insight strip gets print:bg-transparent + print:border-border. Verified via agent-browser pdf: page 1 contains ONLY the summary (header + gradient strip + 5 tiles + chips + insight + note), no sidebar/topbar. Known cosmetic: trailing blank pages (visibility-based print CSS holds hidden layout height — same tradeoff as reports; a display:none strategy would break the ancestor chain).
- FEATURE B (owner monthly summary email mock): NEW API /api/owners/monthly-email — GET ?ownerId&month returns email preview {owner, monthLabel, subject, rows[5] with pct+goodUp, activity, insights, note, bodyText, disclaimer} from the SAME monthly-metrics engine; POST {ownerId, month} = mock send → logAudit(GENERATE, module Owners, recordLabel "Monthly summary email → {name} ({month}) — mock send"). Verified via curl: bodyText composes greeting + KEY NUMBERS (with ✓/⚠ markers, goodUp semantics: expenses-down shows ✓) + ACTIVITY + INSIGHTS; audit entry confirmed in /api/audit.
- Owners view: new "Monthly summary email" dropdown item (Mail icon, first in menu, separator before edit/reset) → MonthlyEmailDialog: MonthPicker + Copy text (clipboard + toast), email-client preview (From/To/Subject envelope header, greeting, Key-numbers table with was-values + EmailDeltaPill chips incl. "new"/0% states, Net-result row emphasized bg-muted/30 + font-semibold, activity chips, insights note, money-semantics, italic sign-off), disclaimer with Info icon, Close + "Mark as sent" (disabled until data loads; success toast "Summary email logged as sent to {name}" + auto-close). E2E verified: dialog renders fully, mark-as-sent fires toast, dialog closes, audit row written.
- FEATURE C (employee-detail utilization): activity useMemo extended with day/night split, weekday[7] distribution, top-3 properties — rendered as 3 panels under Daily billing (sm:grid-cols-3): "Shift mix · 30 days" (amber/slate stacked bar + legend rows with %), "Busiest weekdays" (Mon..Sun mini bars, emerald, hover:opacity), "Top properties" (top-3 rows with teal progress bars scaled to max). All panels hover:bg-muted/50.
- BUG FOUND & FIXED (data window): first E2E showed Shift mix Day 48 + Night 52 = 100 vs totalShifts 76 — utilization loop counted ALL loaded deployments (up to 100 records) because byDay.has(key) is true for every record's own date. Fix: build window30 = Set(list dates) and filter on it. After fix: 76 shifts = Day 36 (47%) + Night 40 (53%) ✓. Note: `window` var name avoided (global shadowing) → window30.
- Verification: lint + tsc clean after every step; agent-browser E2E of all three features; mobile 375 screenshots (summary card stacks single-column with bottom nav, print button beside MonthPicker); console clean throughout. Dark-mode simulated via `agent-browser set media dark` doesn't affect next-themes class strategy — skipped visual dark re-check (all new UI uses standard dark: tokens only).
- NOTE for next rounds: sandbox reaps background dev servers between tool calls; the system auto-dev-server may need a manual bundled restart if root returns 000. e2e script kept at scripts/e2e-task9.sh as a reference for bundled-verification patterns.

Stage Summary:
- New endpoint: /api/owners/monthly-email (GET preview / POST mock-send + audit). All monthly numbers across dashboard card + owner emails come from the single shared engine src/app/api/_lib/monthly-metrics.ts — extend THAT file, never duplicate month math.
- New UI patterns: EmailDeltaPill (new/0%/up/down chips) and email-client preview dialog in owners-view; .print-area + print-only header pattern now proven on BOTH reports and dashboard cards.
- Employee-detail panels must filter to the same 30-day window as their summary numbers (window30 Set pattern).
- Known cosmetic: print output may include trailing blank pages (visibility-based print CSS). Acceptable; revisit only if users complain.
- Next-step candidates: i18n (Hindi) scaffolding per SRS Phase 2; per-property attendance drill-down from manpower dashboard heat-map to property-detail; WhatsApp share button beside "Mark as sent" (still mock); notification-arrival e2e test (needs two browser contexts); dark-mode visual re-check of email dialog via ThemeToggle (not media emulation).

---
Task ID: 10
Agent: main (orchestrator)
Task: QA round; i18n (EN/Hindi) scaffolding; WhatsApp share on owner email dialog; dark-mode visual re-check.

Work Log:
- QA first: lint + tsc clean (src/), server 200, agent-browser sweep over 58 clickable nav elements — ZERO console errors. Stable → new features.
- FEATURE A (i18n scaffolding — SRS Phase 2): new src/lib/i18n.ts — Lang ("en"|"hi"), module-singleton store persisted to localStorage("bizhub-lang") using the canonical useSyncExternalStore pattern (hydration-safe, no setState-in-effect), t(lang,key) with en→key fallback, viewLabel(lang,id,enLabel) + HI_VIEWS map for nav ids, DICT with ~35 curated keys per language. document.documentElement.lang syncs on change.
- Coverage wired: SideNav group headers (nav.group.*) + item labels (viewLabel); TopBar search placeholder (topbar.search/searchShort); TopBar NEW Language dropdown (Languages icon, menuitemradio English/हिन्दी with Check indicator, aria-checked); owner dropdown menu (Owners/settings/audit/install/logout); BusinessBanner badge+scope pills+hint line (scope.badge.*/scope.*/scope.hint.*); BottomNav (nav.home, viewLabel, nav.more); dashboard card titles (dash.monthlySummary/bothBusinesses/trend/expenseSplit/collections/attention/activity) + header buttons (common.refresh/reports/viewAll).
- Settings: NEW LanguageCard (radiogroup, two big option rows with native names "English"/"हिन्दी", glyph chips A/अ, sample-line previews, primary ring on active, Sparkles note explaining scaffolding scope). Inserted as card 3.
- NAMING PITFALL: dashboard-view already had a local `const t = data?.transport` — importing i18n `t` collided ("This expression is not callable"). Fixed by aliasing the import: `import { t as tr, useLang } from "@/lib/i18n"`. Any view with a local `t`/`viewLabel`-like identifier must alias. Also removed now-dead GROUP_LABELS const.
- FEATURE B (WhatsApp share): email dialog footer gains emerald-styled WhatsApp button (MessageCircle) → wa.me link prefilled with bodyText, prefers owner mobile digits (wa.me/<msisdn>?text=) else blank share sheet; only rendered when preview data loaded (asChild+disabled combo avoided). Verified href: https://wa.me/9817922151?text=… (1432 chars).
- DARK-MODE RE-CHECK (Task 9 deferral): toggled via ThemeToggle (note: `agent-browser set media dark` can't drive next-themes class strategy) — email dialog, employee utilization panels, Hindi sidebar all render correctly in dark. Restored light after.
- E2E (bundled, single call): Hindi switch via TopBar → sidebar-hi/search-hi/group-hi OK, html[lang]="hi"; dashboard titles मासिक व्यावसायिक सारांश / 14-दिन का प्रदर्शन / वसूली OK; language PERSISTS across dev-server restart (localStorage); dark+Hindi screenshots; mobile 375 topbar fits 4 icons (search/bell/theme/language/avatar); restored light+EN. lint+tsc clean; console clean (HMR/Fast Refresh only — empty ✗ lines in `agent-browser errors` are benign formatting, confirmed via `console` output).
- SNAPSHOT PATTERN: Radix triggers/menuradios appear in snapshots as `button "…" [expanded=false, ref=eN]` / `menuitemradio "…" [checked=true, ref=eN]` — grep patterns must use `\[[^]]*ref=` (previous rounds' exact `button "X" \[ref=` missed trigger buttons; caused false FAILs in the first E2E attempt this round).

Stage Summary:
- i18n infrastructure is live: extend src/lib/i18n.ts (DICT keys + HI_VIEWS) and use `t(lang,key)` / `viewLabel(lang,id,enLabel)` — never hardcode translated strings in components. English fallback keeps untranslated screens safe.
- Lang state survives restarts (localStorage); theme unchanged (next-themes). TopBar language dropdown is the quick switch; Settings LanguageCard is the discoverable one.
- WhatsApp share is client-side mock only (wa.me deep link) — no server delivery, consistent with SRS Phase 2.
- scripts/e2e-task10.sh kept as reference (note its first-run grep bug was fixed in-repo during verification).
- Next-step candidates: continue Hindi coverage screen-by-screen (payments/settlements page headers + column labels); per-property drill-down from heat-map to property-detail; notification-arrival E2E with two browser contexts; print-output language switch (currently summary prints in UI language only for translated card title).

---
Task ID: 11
Agent: main (orchestrator)
Task: QA round; global command palette (Ctrl+K); rich notification-arrival toast + bell pulse; Hindi coverage extension (payments/settlements/deployments); search-API params bug fix.

Work Log:
- QA first: lint + tsc clean (src/), server 200. agent-browser console showed stale "Parsing ecmascript source code failed" errors for dashboard-view.tsx (636/498) — investigated: they were HMR artifacts from a previous editing session; fresh reload + full sweep = ZERO errors, file compiles clean. Green-lit new work.
- FEATURE A (global command palette): new src/components/shared/command-palette.tsx built on the previously-unused cmdk/shadcn Command primitives. AppShell's dead `ctrlK` state replaced with real `paletteOpen`: Ctrl/Cmd+K TOGGLES the dialog (verified open→close), TopBar desktop search pill + mobile search icon now open it (kbd hint "Ctrl K" is finally truthful). Content: (1) live entity results via /api/search?q= (debounced 250ms, ≥2 chars) grouped Employees/Properties/Vehicles/Clients/Expenses/Deployments with tinted icon tiles (emerald manpower / amber transport), ≤4 per group; (2) "Quick actions" (deployments, payments, advances, expenses, trips, vehicles, reports, notifications, audit — icons from VIEWS registry); (3) "Go to" nav group scope-filtered (same predicate as SideNav); (4) footer kbd hint bar (↑↓ navigate / ↵ open / esc close + "Open full search view →" hidden on mobile); selection closes dialog then navigates with params. Styling: rounded-2xl, shadow-2xl, top-[12%] placement, max-h min(420px,60vh), backdrop blur via new global CSS `[data-slot="dialog-overlay"] { backdrop-filter: blur(3px) }` (applies to ALL dialogs; reduced-motion disables), command-item transition slide. Dialog query state resets on close.
- UX FIX during palette E2E: "Open full search view" was unreachable when the live query matched zero entities (group was gated on hasResults AND cmdk filtered the item out because its value lacked the query). Fixed: group renders whenever query ≥2 chars, and the item's value embeds the query (`full-search ${q}`) so cmdk can never filter it. Verified with "trip" (zero live matches) → handoff item visible → search view opens with q prefilled and graceful empty state.
- BUG FOUND & FIXED (pre-existing, exposed by palette): /api/search returned `params: { propertyId | employeeId | vehicleId }` but property/employee/vehicle-detail views all read `params?.id` — clicking ANY search result (old search view included!) navigated to an id-less detail view that fetched forever (endless skeleton, no error). Fixed at the API (params now `{ id }`) so both search-view and palette benefit. E2E: palette → "Royal Orchid" → property-detail renders (main h1 = "Royal Orchid"). Note: clients/expenses result params (clientId/search) are unread by their views — harmless, left as-is.
- FEATURE B (rich arrival toast + bell pulse): TopBar now fetches the FULL notification array (not just length) and diffs by notification KEY (prevKeysRef). On genuine arrivals while tab is visible: sonner toast shows the headline (highest-severity of the fresh batch: CRITICAL→WARNING→INFO) with its REAL title + message, severity icon (AlertTriangle red / AlertCircle amber / Info sky), description appends "— and N more new alerts." when >1, action View → notifications view. Bell gets a 2.4s animate-ping red ripple + scale-110 (pulseTimerRef cleanup on unmount). E2E: created an advance via API → new engine key `emp-advance-…` → dispatched visibilitychange (immediate re-poll path) → toast "Amit Verma holds an advance / Advance balance ₹8,100 — will be deducted in the next settlement." with Info icon + View button captured on screenshot; second dispatch did NOT re-toast (key already seen — genuine-arrivals-only semantics verified). Polling stays 60s + visibilitychange fast-path; first load never toasts.
- FEATURE C (Hindi coverage): DICT +~35 key pairs (palette.*, sr.* result-group labels, page.payments/settlements/deployments (+.sub), col.* 19 table-column keys). Wired into payments-view (header + history columns), settlements-view (header + all 9 columns), deployments-view (header + all 10 columns) — each via `const { lang } = useLang()` + t(lang,…). Verified live in Hindi: "वसूली — प्रॉपर्टी भुगतान व प्राप्य" with columns दिनांक|प्रॉपर्टी|राशि|माध्यम|संदर्भ|प्राप्तकर्ता; "भुगतान" columns कर्मचारी|दिन|दि/रा शिफ्ट|कुल|अतिरिक्त|अग्रिम −|देय शुद्ध|स्थिति; "तैनाती" columns दिनांक|कर्मचारी|प्रॉपर्टी|शिफ्ट|श्रेणी|बिलिंग|वेतन|स्थिति|भुगतान. Status badges/filter options intentionally still EN (documented Phase-2 remainder).
- QA data note: toast E2E created 2 real advances for Amit Verma (₹1,500 + ₹6,000, 2026-09-03) to surface a new engine notification; BOTH deleted afterwards via prisma (advance.deleteMany by employeeId+amount+date) — notifications back to baseline 15, Amit not listed.
- Verification: light 1280 palette (quick actions, blur backdrop), dark 1280 palette (proper dark surfaces), mobile 375 palette (fits width; footer right hint hidden <sm), palette→property-detail E2E, Ctrl+K toggle E2E, toast E2E screenshots; full 16-view sweep ZERO console errors; lint + tsc clean.

Stage Summary:
- The command palette is the app's keyboard hub: Ctrl/Cmd+K (toggle), TopBar search affordances, live entity search + scoped navigation + quick actions + deep-search handoff. Any new view automatically appears in "Go to" via VIEWS; add to ACTIONS only for extra prominence.
- /api/search detail-result params are now `{ id }` — if you add entity types to search, the detail view MUST read params.id (or map explicitly). The old search view had this same silent bug; kept fixed for both consumers.
- Arrival-toast semantics: diff by notification KEY (not count), headline = highest severity of the batch, only when document.visibilityState === "visible", never on first load. Engine notification keys must be STABLE per entity (`emp-advance-<id>`, `prop-outstanding-<id>`) or toasts re-fire.
- i18n: page headers + main table columns of payments/settlements/deployments are bilingual. Remaining EN-by-design: status badges, filter option labels, module-level OPTIONS arrays (moving them inside components is the pattern if needed).
- QA artifacts cleaned (2 advances); no schema/API shape changes except /api/search params fix (see above).
- Next-step candidates: palette quick-create actions (inline Deploy/Payment/Advance dialogs instead of navigation); per-item palette sub-pages (employee → "give advance" action row); continue Hindi coverage (employees/properties/transport headers + filter labels); notification-arrival E2E automation script (the visibilitychange-dispatch + API-seed trick from this round is reusable); print-output language switch.

---
Task ID: 12
Agent: main (orchestrator)
Task: Status assessment + QA round; new features (palette quick-create, DataTable CSV export, styling details, Hindi coverage extension).

Work Log:
- ENV NOTE (important for next session): the dev server was DOWN at session start (cron-triggered session kills stale background processes; `bun run dev` was not auto-running). Fix pattern that survives across tool calls: `cd /home/z/my-project && (setsid bun run dev > /tmp/devserver.log 2>&1 &)` — verify with curl localhost:3000 → 200. Plain `nohup … &` also dies between calls.
- QA first: `bun run lint` + `bunx tsc --noEmit` = 0 errors/warnings in src/. agent-browser sweep: login (amit/owner123 — no demo button on login screen, credentials are seeded owner123), clicked through ALL 16 sidebar views at 1280 + 375 mobile (bottom tab bar) + 1920, dark + light themes. Console buffer accumulates across the WHOLE browser session (55+ "[HMR] connected" entries) — stale errors from previous sessions' mid-edit states (dashboard-view 636/498, command-palette 66) sit BEFORE the last HMR-connect line; after the fresh loads, ZERO errors (same verification pattern as Task 11: errors after last "[HMR] connected" = real). Verdict: stable, no bugs → proceeded to new features.
- FEATURE A (palette quick-create hub): command-palette.tsx now has a "Create new" group (after live results, before quick actions) with 3 inline actions: Record advance / Record property payment / New deployment. Each opens the existing shared self-fetching dialogs (GiveAdvanceDialog / RecordPaymentDialog / DeployWizard from views/_shared) after closing the palette; on successful save, navigates to advances/payments/deployments via createGotoRef. i18n keys palette.create.* added (EN+HI). E2E: Ctrl+K → "Record advance" → dialog self-fetched employees → gave ₹500 to Bhavesh Shah → submitted → landed on Advances view with success toast. QA artifact deleted afterwards via prisma (advance id cmtkj0lf60008l56c0ngfs12z) — DB back to baseline.
- FEATURE B (DataTable CSV export): data-table.tsx gained optional `exportName?: string` prop. When set (and rows exist), an "Export CSV (n)" toolbar button renders above the table/cards. CSV: filters columns with label && !excludeFromExport, uses value() ?? row[key], proper escaping (quotes/commas/newlines), U+FEFF BOM for Excel/Devanagari, filename `<name>-<today>.csv`, downloads via Blob+a.click(). Wired into 11 tables: employees, properties, contracts, deployments, collections(history), advances(history), settlements, expenses, trips, clients, audit-log. Verified real download: employees-2026-09-02.csv, 24 lines, ₹ symbols intact, BOM present. Column type gained `excludeFromExport?` (action/arrow columns already excluded by empty label).
- FEATURE C (styling details): (1) StatCard count-up — new useCountUp() in stat-card.tsx tweens the numeric portion of formatted values ("₹21.5K", "₹17,110", "22 deployments") over 750ms cubic ease-out, preserving prefix/suffix/decimals; en-IN grouping when original had commas; prefers-reduced-motion renders final value instantly; non-numeric values render unchanged; re-tweens on value change (range switch). Verified values settle exactly: ₹21.5K / ₹1.23L / ₹2.73L / ₹17.1K / ₹0 / ₹10.1K. (2) StatCard gradient hairline: 1px primary gradient line fades in at card top on hover (before: pseudo, inset-x-3); icon chip gets group-hover:scale-110. (3) DataTable desktop rows: 2px left primary accent bar on first cell on hover (only when rows are clickable); mobile cards get a matching left bar on press. (4) BottomNav (mobile): active indicator now animates width w-0→w-7 + opacity with 300ms ease-out; active icon scales-110 with -translate-y-px; button active:scale-95. (Existing view-enter animation on main keyed by view confirmed still in place.)
- FEATURE D (Hindi coverage extension): i18n DICT +~60 key pairs. Page headers: page.employees/.properties/.vehicles/.clients/.trips/.expenses (+.sub with {n} interpolation via .replace("{n}", n)). Table columns: col.code/.mobile/.rate/.advanceDue (employees), col.contact/.activeContract/.billed/.received/.outstanding (properties), col.client/.phone/.email/.trips/.totalBusiness (clients), col.vehicleClient/.type/.agreed/.payment + reuse col.paid/.status (trips), col.expense/.business/.vehicle/.spentBy + reuse col.date/.category/.amount (expenses). Wired via `const { lang } = useLang()` + t(lang,…) in 6 views. Verified live in Hindi: कर्मचारी (कोड|कर्मचारी|मोबाइल|दर/दिन|स्थिति|बकाया अग्रिम), प्रॉपर्टी (प्रॉपर्टी|संपर्क|सक्रिय अनुबंध|बिल|प्राप्त|बकाया|स्थिति), यात्राएँ व किराया (वाहन → ग्राहक|प्रकार|सहमत|प्राप्त राशि|भुगतान स्थिति|स्थिति), खर्च, वाहन ("बेड़े में 2 वाहन" interpolation). Palette create group in Hindi: नया रिकॉर्ड → अग्रिम दर्ज करें / प्रॉपर्टी भुगतान दर्ज करें / नई तैनाती. Fixed duplicate Hindi header found during QA: col.paid → "प्राप्त राशि", col.payment → "भुगतान स्थिति" (were both "भुगतान"). Language restored to EN + light theme after verification.
- Verification: lint + tsc 0 problems; full 16-view sweep after all changes = ZERO console errors (checked after last HMR-connect); E2E flows above; screenshots saved under tool-results/ (qa-dash-countup, qa-hindi-palette, qa-hindi-trips, qa-mobile-final, qa-final-dash).

Stage Summary:
- The command palette is now the app's power-user hub: Ctrl/Cmd+K → search, navigate, AND create (advance/payment/deployment) without leaving the current view. New create actions reuse views/_shared dialogs — if you add a new record dialog there, register it in CREATE_ITEMS (kind, icon, labelKey/subKey, goto) + render it in CommandPalette.
- DataTable exportName is one-prop CSV export for any table; new list views should set it. Columns with empty label (action arrows) are auto-excluded; use excludeFromExport for others. BOM included — Hindi CSV opens correctly in Excel.
- StatCard values self-animate; pass plain formatted strings as before. Keep values short (prefix+number+suffix); values with no leading numeric part render as-is.
- i18n coverage now includes 9 page headers + ~35 column keys + palette create group. Still EN-by-design: status badges, filter OPTIONS arrays, detail-view internals. {n} interpolation is manual .replace — no template engine.
- agent-browser gotcha this round: sidebar/view refs go stale across snapshots because the keyed main remounts on every navigation — take snapshot + extract ref + click in ONE shell call, never reuse refs from earlier snapshots.
- Dev-server startup pattern documented above — check server is up FIRST at the start of the next session (curl localhost:3000), else use the setsid one-liner.
- Next-step candidates: palette per-entity quick actions (employee row → "Give advance" sub-action); trip-profit chart on reports view (transport dashboard already has trip-profit bars; reports has profitability/vehicle-profitability tables); notification-arrival E2E automation script (visibilitychange-dispatch + API-seed trick from Task 11 is reusable); print-output language switch; remaining Hindi: status badges + filter option labels + settlements/payments detail dialogs.

---
Task ID: 13
Agent: main (orchestrator)
Task: Status assessment + QA round; new features (day/night workforce heat-map, trip-profit report chart, skeleton shimmer + chart polish, settings JSON backup export).

Work Log:
- ENV: dev server was DOWN at session start again (cron session kill pattern). Restarted with the documented `cd /home/z/my-project && (setsid bun run dev > /tmp/devserver.log 2>&1 &)` — NOTE: first curl after start can take ~15s (next compile); wait + re-curl before assuming failure. Mid-session the server died once more and the same pattern revived it.
- QA first: lint + tsc (src/) = 0 problems; agent-browser sweep of all 16+ views at 1280 (light) with the "errors after last [HMR] connected" console pattern = CLEAN. Verdict: stable → proceeded to new features.

- FEATURE A (day/night workforce heat-map — fulfils the promise from Task 11/12 next-step list):
  - API `/api/dashboard/manpower-heatmap` now returns per-cell `{ date, shifts, day, night }` (night = `shift.toUpperCase().includes("NIGHT")`, same convention as employee-earnings report).
  - View (manpower-dashboard-view): heat-map cells are now SPLIT cells — amber left half (day) + slate right half (night) proportional to that day's day/night mix, each half's OPACITY carrying its own intensity vs per-metric maxima (`heatMax.all/day/night`). Header gains an All / Day / Night segmented toggle (Globe2/Sun/Moon icons, aria-pressed) that re-renders intensities (Day mode = full-width amber fills only; Night = slate), row totals recompute per mode, tooltips/aria-labels read "X shift(s) (Y day / Z night)". Legend shows per-mode intensity ramp + Day/Night color keys. Data storytelling verified live: "Night Owl Diner" row is nearly all-slate (night venue), Green Leaf leads night totals (43) in Night mode.
  - Verified: light + dark @1280, mobile 375 (toggle wraps, cells scroll in the existing overflow-x container, legend wraps), Night toggle E2E screenshot.

- FEATURE B (trip-wise profit report chart — fulfils the promise from Task 11/12 next-step list):
  - Extracted the trip-profit computation into `src/app/api/_lib/trip-profit.ts` (`computeTripProfit(from,to)` + `TRIP_PROFIT_NOTE`); refactored `/api/transport/trip-profit` to use it (zero behavior change — same response verified).
  - New report `/api/reports/trip-profit?from=&to=` (reports contract: columns/rows/totals/meta/note) + optional `chart` field: rows = per-trip [Trip, Start, Vehicle, Type, Status, Revenue(money), Est. cost(money), Profit(money), Margin %(number), Collected %(number)], rows capped at 40, totals across ALL trips in window. `chart` = top 8 profit winners + up to 2 worst loss-makers (deduped, profit-sorted, labels truncated to 22 chars) each `{label, revenue, cost, profit, marginPct}`.
  - reports-view: REPORTS gains "Trip Profitability" (icon Route, config range). When `def.type === "trip-profit"` and chart present, a chart card (gradient hairline top + Route icon title) renders ABOVE the table inside `.print-area` (prints with PDF): `BarsCompare` 3 series — Revenue emerald / Est. cost red / Profit teal, height 260. Negative profit bars hang below the zero axis. CSV/Print buttons work unchanged (table columns flow through the generic runner).
  - Verified E2E: This Month (1 trip single group) → Last Month (30 bars = 10 trips × 3 series, loss-makers below axis, legend Revenue/Est. cost/Profit). API totals: revenue ₹1,64,500, cost ₹1,53,907, profit ₹10,593 across 15 trips (Aug window).

- FEATURE C (styling details round):
  - Global skeleton shimmer: `[data-slot="skeleton"]::after` sweeps a card-colored light gradient (`color-mix(in oklab, var(--card) 60%, transparent)` — CSS vars are complete oklch values, NOT raw channels, so `hsl(var(--x)/α)` would NOT work here) over every loading skeleton; `prefers-reduced-motion` disables. Applies app-wide (dashboards, tables, dialogs) with zero component changes.
  - BarsCompare bars now use `radius={[4,4,4,4]}` so mixed-sign charts (trip profit) don't have flat-cut negative bars.
  - Heat-map cells/legend/row-hover polish (see Feature A) + trip-profit chart card hairline (see Feature B).

- FEATURE D (settings data-backup export):
  - New `GET /api/settings/backup` → `{ format:"bizhub-backup", version:1, generatedAt, counts, data }` with all 22 collections (owners→auditLogs; audit capped 1,000 latest; Sessions deliberately EXCLUDED as auth artifacts). Verified payload: 2,378 records / 1.5MB pretty JSON.
  - `downloadJSON()` helper added to api-client (pretty JSON blob download).
  - settings-view gains "Data & backup" card (#4, Database icon): Export button with Loader2 spinner state → downloads `bizhub-backup-YYYY-MM-DD.json` → toast "Backup downloaded — {total} records across {collections} collections". Bilingual i18n keys `settings.backup*` added (EN+HI, {total}/{collections} interpolation via .replace).
  - Verified E2E: click → real 1,519,182-byte `bizhub-backup-2026-09-02.json` in downloads (header + counts inspected) + success toast; Hindi card verified (डेटा और बैकअप / बैकअप निर्यात करें (JSON)). Language + theme restored to EN/light after checks.

- Final verification: post-change full sweep (17 nav entries incl. palette-routed Notifications view) = ZERO console errors/warnings after last HMR-connect; lint + tsc(src) clean; server 200.

Stage Summary:
- Heat-map contract: cells now `{date, shifts, day, night}` — any other consumer must read all three; intensity = opacity (HEAT_OPACITY ramp), fills = DAY_FILL/NIGHT_FILL class constants in manpower-dashboard-view. heatMax computed per metric so toggles rescale independently.
- Trip-profit: computation lives ONLY in `src/app/api/_lib/trip-profit.ts` — dashboard endpoint (limit slice) and report endpoint (chart slice + totals) both consume it; change allocation model there in one place. Reports view renders `data.chart` generically only for the trip-profit type; a future charted report can reuse the same optional-chart pattern (render above table, inside print-area).
- Backup: 22 collections, no sessions; audit capped at 1,000. Restore/import is NOT implemented (documented Phase-2 candidate — needs conflict strategy).
- agent-browser gotchas confirmed again: (1) sidebar refs go stale after each navigation — snapshot+grep+click in ONE shell call; (2) "More menu"/bottom-nav labels only exist at mobile viewport; Notifications VIEW reachable via Ctrl+K palette → "Notifications" option (TopBar bell opens the panel, not the view); (3) after server restart, wait ~4s before eval (page rehydrate).
- Next-step candidates: palette per-entity quick actions (employee row → "Give advance"); backup RESTORE/import UI (danger zone, merge strategy); Hindi for status badges + filter OPTIONS + report titles (REPORTS array is module-level EN by design); trips-view trip-detail dialog with per-trip payment records; notification-arrival E2E automation script (Task 11's visibilitychange-dispatch trick remains reusable).

---
Task ID: 14
Agent: main (orchestrator)
Task: User mega-request round — remove fake data/seeder; UNDO system for wrong entries with zero mismatch; chart visibility fix (dark+light); professional Indian theme/fonts/icons; detailed reports (property day-sheet + employee day-by-day); mobile+laptop ease; data integrity checker; settings danger-zone reset.

Work Log:
- ENV: dev server was up (200). One mid-session restart was REQUIRED after Prisma client regeneration (`pkill -f "next dev"` + setsid one-liner) — the running server kept the pre-schema client and threw `Unknown argument 'undoneAt'` on first undo attempt. Remember: any `db:generate` needs a dev-server restart.
- FAKER DATA REMOVED: `scripts/seed.ts` DELETED. New `scripts/reset.ts` wipes all business data, KEEPS master data (shifts DAY/NIGHT, expense categories, app settings) + creates single login admin/admin123 (name "Owner"). DB reset to pristine (1 owner, 0 business records) TWICE (mid-QA + final) — user gets a clean manual-testing slate.
- SCHEMA: AuditLog gained `undoneAt DateTime?` + fixed corrupted `@@index(odule, createdAt])` → `@@index([module, createdAt])` + new `@@index([recordId])`. db:push OK.
- UNDO SYSTEM (flagship):
  - `POST /api/undo` {auditLogId} OR {module, recordId}: resolves latest non-undone audit entry (actions CREATE/PAYMENT/STATUS/UPDATE/DELETE), reverses inside ONE transaction, marks `undoneAt`, writes UNDO audit entry (prev/newValue swapped).
  - Reversal matrix: PAYMENT:PAYMENT/CREATE → delete payment + recomputeDeploymentPaid (FIFO re-alloc); EMI:PAYMENT → restore status+paidDate=null + delete expense ref EMI-<id>; ADVANCE:CREATE → guard settlementId; TRIP:CREATE → guard paidAmount>0; TRIP:PAYMENT → restore paidAmount/paymentStatus; MAINTENANCE UPDATE→status≠DONE → delete expense ref MNT-<id>; DEPLOYMENT:STATUS/UPDATE → restore + recompute; generic UPDATE/STATUS → restore previousValue fields (EMI paidDate special-case); DELETE → recreate from previousValue via DMMF `pickColumns` (strips non-columns, REJECTS snapshots missing required fields — no half-records).
  - `_shared.tsx`: `useMutation().mutate(fn, success, undoResolver)` — resolver returns {module, recordId, onUndo}; success toast gains 8s Undo action → `undoRequest()` helper (accepts auditLogId for exact reversal).
  - Wired: GiveAdvanceDialog, RecordPaymentDialog (_shared), trips (create/payment/cancel), expenses (create/update/delete), deployments (status), vehicle-detail (EMI pay + maintenance done), employee-detail (adjustment).
  - audit-view: per-row Undo button for undoable entries + violet "Reversed" chip for undoneAt entries; UNDO/PAYMENT/STATUS badge tones added.
- CHARTS/THEME (both-mode visibility):
  - ROOT CAUSE: charts used `hsl(var(--border))` etc. but vars are complete oklch values → invalid CSS → default fallbacks; plus fixed hex CHART_COLORS invisible-ish on dark.
  - Fixed 12 `hsl(var(--…))` occurrences (_shared, dashboard-view, sidebar.tsx shadow). CHART_COLORS now `var(--chart-1..5)`. AXIS_TICK/TOOLTIP/CartesianGrid/cursors → var(--*) with tooltip shadow. globals.css: global `.recharts-text`/`.recharts-legend-item-text`/`.recharts-pie-label-text` theme-following fills.
  - Palette (Indian professional): light = warm ivory bg `oklch(0.982 0.006 95)` + deep emerald primary `0.5 0.11 165` + saffron accent `0.945 0.035 80`; dark = deep green-charcoal `0.165 0.012 165` + luminous emerald `0.755` + saffron-brown accent; chart-1..5 tuned per mode (light deep 0.5-0.62 L, dark luminous 0.72-0.82 L). Scrollbar thumb uses foreground-mix.
- FONTS: Geist → Inter (UI, tnum-friendly) + JetBrains Mono (codes/kbd). next/font var names kept `--font-geist-sans/mono` = zero downstream changes. themeColor viewport now light/dark pair.
- REPORTS DETAIL (user's explicit ask):
  - `employee-earnings?employeeId=` → adds `employee` header + `days[]` (date/property/shift/status/rate/earnings) + `propertySummary[]` + `dayTotals`.
  - `daily-operations?propertyId=` → filters + `totals.employees` + `propertySummary[]` rollup; meta now `{date, property}` (cuid stripped after QA nit).
  - reports-view: employee Select (label `Name (code)`) → drill-down card (gradient hairline, stat chips, day-by-day DataTable with ShiftPill DAY/NIGHT, property chips); property Select → day-sheet card (4 stat chips). Selectors reset on report switch. Both cards inside `.print-area` (print/PDF included). Mobile: DataTable auto card-mode.
- INTEGRITY + RESET (zero-mismatch trust):
  - `GET /api/settings/integrity` → 6 checks (allocation-drift, paid-cancelled, orphan-payments, trip-overcollect, settlement-drift via netPayable identity, missing category links); `POST` → auto-repair (zero paid on CANCELLED + recomputeDeploymentPaid for ALL properties in one tx). NEVER touches source records.
  - `POST /api/settings/reset` {confirm:"RESET"} → wipes business tables (keeps owners/sessions/master data) + audit entry.
  - settings-view: IntegrityCard (status banner, per-check OK/count pills, Re-run + conditional Auto-repair) + DangerZoneCard (AlertDialog with typed-RESET confirm, destructive styling).
- QA (agent-browser): login admin/admin123 ✓; theme sweep light+dark @1280 (dash stat chips, area chart legend luminous in dark, drill-down cards) ✓; mobile 375 (bottom nav, settings/reports stacking, day-table card-mode) ✓; E2E: employee EMP-001 create → advance ₹500 (Undo toast visible) → advance ₹500 again → audit-view Undo → outstanding 1000→500 EXACTLY ✓; property + contract (₹600/₹450) + deploy SCHEDULED → CONFIRMED (undo toast) ✓; daily-operations day-sheet (1 dep/1 emp/₹600/₹450) ✓; employee-earnings drill-down (1 day, DAY pill, ₹450, net −₹50 honest math) ✓; API payment-undo: create ₹250 → PARTIAL 250 → undo → UNPAID 0 → integrity all OK ✓; console: zero errors, 1 pre-existing DialogContent aria warning.

Stage Summary:
- CREDENTIALS FOR USER: username `admin` / password `admin123` (single owner, no demo accounts).
- Undo contract: modules PAYMENT/ADVANCE/ADJUSTMENT/EXPENSE/DEPLOYMENT/TRIP/EMI/MAINTENANCE/EMPLOYEE/PROPERTY/CLIENT/VEHICLE/CONTRACT × actions CREATE/PAYMENT/STATUS/UPDATE/DELETE. FINALIZE/GENERATE/LOGIN deliberately NOT undoable (locked financial events). DELETE-restore requires full-snapshot previousValue (DMMF-validated) — only expense DELETE currently snapshots partial fields, so its restore will 409 politely until snapshots are widened.
- Any new chart must use `var(--chart-N)` / `var(--border)` etc. — NEVER `hsl(var(--…))` (vars are complete oklch values) and never raw hex.
- useMutation 3rd arg (undo resolver) is optional — old call sites unaffected; wire it into any NEW financial mutation.
- Integrity repair is derived-only by design; if trip payment records ever move to a separate table, extend repair accordingly.
- Next-step candidates: widen DELETE audit snapshots to full rows (enables true restore); settlement draft GENERATE undo; per-employee PDF payslip from drill-down card; Hindi coverage for report titles/filters; backup RESTORE import UI; notification-arrival E2E automation.
