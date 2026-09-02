# Task 2-b — Frontend Views Agent

Status: IN PROGRESS
Owner: frontend-views agent

## Plan
- Read foundation (worklog, api-contract, providers, shared components) — DONE
- Implement src/components/views/_shared.tsx (useAsync/useMutation hooks, charts, pickers, DeployWizard, RecordPaymentDialog, GiveAdvanceDialog, API record types)
- Implement all 24 views in src/components/views/
- Lint + fix, append worklog

## Decisions
- shift values normalized to DAY/NIGHT (seed uses these names)
- status change on employees uses POST /api/employees/:id/status per contract
- change-password: POST /api/auth/change-password { currentPassword, newPassword }
- audit modules fixed list: EMPLOYEE, PROPERTY, CONTRACT, DEPLOYMENT, PAYMENT, ADVANCE, ADJUSTMENT, SETTLEMENT, EXPENSE, RECURRING_EXPENSE, VEHICLE, CLIENT, TRIP, EMI, MAINTENANCE, OWNER, AUTH, SETTINGS
