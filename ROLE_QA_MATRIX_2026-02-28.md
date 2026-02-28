# Role QA Matrix - 2026-02-28

## Scope

- Tenant/location isolation
- Clean location naming (no tenant prefix in UI)
- tenantCode as separate metadata for SUPER_ADMIN filtering
- Role visibility and access restrictions

## Matrix (Current)

| Area | SUPER_ADMIN | ADMIN | STAFF |
|---|---|---|---|
| Switch tenant | PASS | N/A | N/A |
| Switch location in active tenant | PASS | PASS | PASS (assigned only) |
| Access Settings page | PASS | PASS (hidden/blocked by policy change) | PASS (hidden/blocked by policy change) |
| Dashboard scoped by active location | PASS | PASS | PASS |
| Dashboard tenantCode filter | PASS | N/A | N/A |
| Stocks list scoped by active location | PASS | PASS | PASS |
| Stocks tenantCode filter | PASS | N/A | N/A |
| Transactions location selector lock | PASS | PASS | PASS |
| Transactions tenantCode filter | PASS | N/A | N/A |
| Notifications scoped + clean labels | PASS | PASS | PASS |
| Notifications tenantCode filter | PASS | N/A | N/A |
| Checklist Today scoped + clean template name | PASS | PASS | PASS |
| Checklist Monitoring scoped + clean template name | PASS | PASS | PASS |
| Checklist exports include tenant metadata | PASS | PASS | PASS |
| Cross-tenant transaction location injection rejected | PASS | PASS | PASS |

## Evidence Notes

- SUPER_ADMIN-only Settings route/menu guard is active in frontend router and shell menu.
- STAFF location access is explicit assignment based and fail-closed when mapping cannot be read.
- Transaction service validates tenant-owned locations for create/bulk-adjust and rejects out-of-scope IDs.
- Location names returned to UI-facing operational flows are cleaned from tenant prefix.

## Automated Checks (Latest)

- `npm run test:guards` (backend): PASS
- `npm run test:phase-final` (backend): PASS
- `npm run build` (backend): PASS
- `npm run build` (frontend): PASS

## Remaining Hardening (Optional)

- Add automated API integration tests for role + tenant/location guard paths.
- Add CI gate to run backend/frontend build checks on each push.
