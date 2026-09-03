# Task 18-B — UX Batch Agent

Status: COMPLETE
Owner: ux-batch agent (18-B)
Scope: Phase B of the approved enhancement program (7 features).

## Work Record
- Recovered an interrupted prior run of this task: audited every Phase-B file against the spec, then fixed gaps:
  1. Bulk deletes (expenses + deployments) made SEQUENTIAL with allSettled semantics (no FIFO-recompute races; partial failures never abort the batch).
  2. RecordPaymentDialog ConfirmAmount subject falls back to `data.property.name` from the ledger payload when opened with a preset propertyId.
  3. Undo Center dispatches global `UNDO_APPLIED_EVENT` ("bizhub:undo-applied") after a successful reversal; expenses-view + deployments-view listen and live-reload.
- Features delivered: onboarding checklist card (+ GET /api/dashboard/onboarding), Undo Center sheet in TopBar, shortcuts dialog + G-chords in app-shell, notifications dismiss-all + per-category mute (localStorage "notif-muted-groups", mute-aware bell), palette Actions group + entity preview subtitles, ConfirmAmount ≥₹50k echo in RecordPaymentDialog/GiveAdvanceDialog/trips payment, DataTable selection + sticky bulk bar wired to expenses/deployments.

## Verification
- bun run lint: clean. npx tsc --noEmit: zero src/ errors (pre-existing examples/ + skills/ only).
- agent-browser E2E (admin/admin123): checklist "0 of 3 → 2 of 3 steps done" + navigation; Undo Center empty/list/undo/Reversed states; "?" dialog; g d → dashboard, g t → trips; palette Actions group + "QA Palace — … ₹600 due" previews; ₹60,000 payment → amber confirm strip → Confirm → undo reconciles; 2-expense bulk delete → "Deleted 2 of 2" → Undo → rows restored live.
- Console: zero app errors. DB reset via scripts/reset.ts after QA — final state 0 business rows, admin/admin123 login kept.
