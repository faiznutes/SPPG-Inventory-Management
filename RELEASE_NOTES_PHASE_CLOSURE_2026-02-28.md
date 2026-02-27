# Release Notes - Phase Closure (2026-02-28)

## What is completed

- Tenant/location isolation is enforced across dashboard, stocks, transactions, notifications, and checklist flows.
- Location display is standardized to clean labels (no tenant prefix in UI).
- `tenantCode` is provided as separate metadata for SUPER_ADMIN filtering.
- STAFF location access is explicit-assignment only and fail-closed.
- Settings access is SUPER_ADMIN-only in frontend navigation and route guard.

## Backend guard summary

### Auth context

- `POST /api/v1/auth/location/select` keeps tenant context and only allows location from `availableLocations`.
- SUPER_ADMIN can switch tenant without membership row (`POST /api/v1/auth/tenant/select`) while regular users remain membership-gated.

### Location scope

- `GET /api/v1/locations` is tenant-aware and role-aware:
  - SUPER_ADMIN/ADMIN: active tenant locations
  - STAFF: assigned active locations only
- `POST /api/v1/locations` is restricted to `SUPER_ADMIN` and `ADMIN`.

### Transaction scope

- `GET /api/v1/transactions` is scoped by active tenant and active location context.
- `POST /api/v1/transactions` rejects cross-tenant `fromLocationId/toLocationId`.
- `POST /api/v1/transactions/bulk/adjust` rejects cross-tenant location IDs and enforces active-location context.

### Checklist scope and role

- Monitoring endpoints are restricted to `SUPER_ADMIN` and `ADMIN`:
  - `GET /api/v1/checklists/monitoring`
  - `GET /api/v1/checklists/monitoring/export/pdf`
  - `POST /api/v1/checklists/monitoring/export/send-telegram`
- Today checklist endpoints stay authenticated and tenant/location scoped.

### Audit scope

- `GET /api/v1/audit-logs` is SUPER_ADMIN-only.

## Frontend guard summary

- `Pengaturan` menu is hidden for ADMIN/STAFF and `/settings` route is SUPER_ADMIN-only.
- Operational pages auto-refresh when active tenant/location changes:
  - `DashboardPage`
  - `StocksPage`
  - `TransactionsPage`
  - `NotificationsPage`
  - `ChecklistTodayPage`
  - `ChecklistMonitoringPage`

## UX/Display consistency

- Location labels shown to users are clean (example: `Sumatra`, not `tenant-code::Sumatra`).
- SUPER_ADMIN can filter by `tenantCode` in:
  - Dashboard low-stock
  - Stocks
  - Transactions
  - Notifications
- Export metadata now includes tenant fields where relevant (including checklist exports).

## Supporting docs

- `PHASE_SIGNOFF_2026-02-28.md`
- `ROLE_QA_MATRIX_2026-02-28.md`
