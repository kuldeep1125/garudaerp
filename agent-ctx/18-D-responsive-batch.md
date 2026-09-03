# Task 18-D — Responsive batch (Phase D) — work record

Agent: main (orchestrator, Responsive batch)
Date: QA completed + DB reset; worklog entry appended (Task ID: 18-D).

## What was done

An earlier interrupted run had already landed most Phase-D files. This pass audited every deliverable against the spec, verified the full matrix, and made one functional fix.

### Audit results (spec item → state found → action)
1. **Mobile FAB (`shared/view-fab.tsx`)** — already implemented + wired into all 6 views with each view's own dialog-open handler (deployments `setWizardOpen`, expenses `setAddOpen`, trips `setNewOpen`, properties `setAddOpen`, employees `setAddOpen`, payments `setQuickOpen`). Bulk-selection guard (`selectedIds.size === 0`) already present in expenses + deployments so the Phase-B sticky bulk bar (same bottom offset) is never overlapped. → verified only.
2. **Sidebar rail (app-shell)** — `RAIL_QUERY = (min-width:768px) and (max-width:1023.98px)` + `useIsRailWidth()` via `useSyncExternalStore` (server snapshot `false`, SSR-safe). `railActive = railMode || collapsed`; `onToggle` undefined in rail mode → no toggle; More sheet keeps `collapsed === undefined` → full labels. → **FIX APPLIED**: lg+ manual collapse had no way back (pre-existing dead end — toggle only rendered when expanded). Added ChevronsRight **"Expand sidebar"** button rendered only when `onToggle && collapsed`; rail mode still shows zero toggle buttons.
3. **Chart reflow** — `AreaTrend`/`BarsCompare` in `_shared.tsx` default to `h-44 sm:h-52 lg:h-60`; dashboard-view passes the same classes explicitly (trend, pie, empty state, skeletons). → live-measured 176px @390 / 208px @700 / 240px @1280.
4. **44px touch-target pass** — all `h-8 w-8` icon buttons in rows/lists → `h-9 w-9 sm:h-8 sm:w-8` (expenses, employees, clients, owners, payments, notifications mute+dismiss, month-picker); audit Undo `min-h-9 sm:min-h-8`; undo-center `h-9 sm:h-8`. Remaining `h-8 w-8` are non-interactive (logo mark, onboarding chip) or the desktop-only sidebar toggle. → measured 36×36 at 390.
5. **Swipe-to-dismiss (notifications)** — `SwipeDismissCard`: horizontal lock after 10px, left-only with 120px resistance, threshold 72, same dismiss() as X, spring back via transition-transform, disabled under `prefers-reduced-motion`, per-touch `matchMedia("(min-width:768px)")` guard. → verified with dispatched TouchEvents: full swipe dismisses (bell 2→1), short swipe springs back, vertical gesture bails, md+ no-ops.
6. **DeployWizard sheet** — root `flex flex-col max-sm:max-h-[86dvh] overflow-hidden p-0` (sm:h-[82vh]), steps `min-h-0 flex-1 overflow-y-auto max-sm:overscroll-contain`, footer `max-sm:sticky max-sm:bottom-0 max-sm:bg-background max-sm:pt-3` containing the step-3 totals bar. → navigated 1→2→3 and deployed at 390×844; footer bottom == dialog bottom.
7. **Scroll-shadows** — statement-view wrapper has `overflow-x-auto scroll-shadows` (live-verified); reports-view tables go through DataTable whose desktop container already carries `scroll-shadows`.

## Verification
- `bun run lint` clean.
- `npx tsc --noEmit`: zero errors in project `src/` (only pre-existing `skills/stock-analysis-skill` error — ignored per instructions).
- agent-browser QA (admin/admin123):
  - 390×844: FAB visible on all 6 views (56×56, right-4, 72px above bottom), each opens the correct dialog; wizard sheet navigable + deploy E2E; swipe dismiss/spring/vertical/md-guard pass; dark spot check (html.dark, token values resolved, screenshot `tool-results/qa-18d-390-dark-notifs.png`); Ctrl+K, `?`, g-chords intact.
  - 800×844: rail 68px icons-only, 0 labels/0 group headers/0 toggle buttons, 17 title tooltips, bottom nav `display:none`, FAB `display:none`, swipe disabled.
  - 1280×844: full 240px sidebar, 17 labels + 6 group headers, collapse/expand roundtrip works, FAB hidden.
- Console: ZERO errors (only pre-existing DialogContent `aria-describedby` warnings). dev.log: zero errors.

## Deviations
- lg+ "Expand sidebar" button added (fixes pre-existing stuck-collapsed dead end; rail invariant kept).
- Row-action touch targets are 36px at <sm — the spec's own `h-9` prescription (nominal "44px" title notwithstanding).

## Final DB state (after scripts/reset.ts)
- Business rows: property 0, employee 0, deployment 0, propertyPayment 0, expense 0, trip 0, settlement 0, advance 0.
- Master data intact: 1 owner (admin/admin123), 2 shifts, 24 expense categories.
- Post-reset login re-verified; dashboard boots to "0 of 3 steps done"; console clean.
