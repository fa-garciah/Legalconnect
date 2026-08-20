# Quickstart Validation Results

**Feature**: `001-tenant-foundation` | **Run date**: 2026-08-20

All 15 scenarios in [quickstart.md](./quickstart.md) pass. Full suite: **44 test
files, 239 tests, 0 failures**. Blocking coverage
(`src/common/tenant/**`, `src/common/audit/**`): **100%** statements, branches,
functions and lines — enforced by `npm test -- --coverage` per T105.

| # | Scenario | Status | Evidence |
|---|---|---|---|
| V1 | Application role is not superuser, owns no tables, lacks `BYPASSRLS` | ✅ PASS | `npm run verify:role` — `backend/tests/integration/verify-role.test.ts` (4 tests) |
| V2 | Every tenant-scoped table has row security and a policy; an uncovered table fails the build | ✅ PASS | `npm run test:rls` — `backend/tests/integration/rls-coverage.test.ts` (7 tests) |
| V3 | Unfiltered read returns own rows and zero foreign rows | ✅ PASS | `backend/tests/integration/isolation/unfiltered-read.test.ts` (4 tests) |
| V4 | Cross-tenant request answers `404` and is recorded against the target, actor's home tenant absent | ✅ PASS | `backend/tests/contract/cross-tenant-404.test.ts` (4), `backend/tests/integration/isolation/cross-attempt-record.test.ts` (3) |
| V5 | Audit entries cannot be updated or deleted by the application | ✅ PASS | `backend/tests/integration/audit-immutability.test.ts` (5 tests) |
| V6 | A mutation whose audit entry fails leaves no trace | ✅ PASS | `backend/tests/integration/audit-atomicity.test.ts` (3 tests) |
| V7 | Duplicate RFC is refused and leaves no partial tenant; concurrent duplicates yield exactly one tenant | ✅ PASS | `backend/tests/contract/provision-duplicate-rfc.test.ts` (4), `provision-concurrent-rfc.test.ts` (3) |
| V8 | Plan and plan limits change with no deployment | ✅ PASS | `backend/tests/contract/plan-change.test.ts` (2), `plan-limits-config.test.ts` (2), `plan-limits-exceeded.test.ts` (3), `plan-invariants.test.ts` (3) |
| V9 | Audit query is tenant-scoped, clamped to 24 months, self-audits only on interactive reads | ✅ PASS | `backend/tests/contract/audit-query-scope.test.ts` (3), `audit-query-retention.test.ts` (3), `audit-query-channel.test.ts` (4), `audit-query-authz.test.ts` (2), `audit-query-pagination.test.ts` (3), `platform-audit-query.test.ts` (2) |
| V10 | An identity in two tenants leaks neither to the other | ✅ PASS | `backend/tests/integration/isolation/multi-membership.test.ts` (5 tests) |
| V11 | Deactivation refuses activation and retains records | ✅ PASS | `backend/tests/integration/isolation/deactivated-refusal.test.ts` (4 tests) |
| V12 | Async jobs are isolated exactly as requests are | ✅ PASS | `backend/tests/integration/isolation/async-job.test.ts` (3 tests) |
| V13 | Every one of the seven actions emits exactly one entry with all required fields; the two channel-gated ones emit only on interactive reads | ✅ PASS | `backend/tests/integration/audit-fields.test.ts` (16 tests) |
| V14 | No entry contains end-client personal data, secrets or authentication factors | ✅ PASS | `backend/tests/integration/audit-no-pii.test.ts` (32 tests) |
| V15 | No active tenant context → zero rows and no error, on every tenant-scoped table | ✅ PASS | `backend/tests/integration/isolation/no-context.test.ts` (4 tests) |

## Additional gates verified beyond the 15 scenarios

- **SC-010** (first page of an audit query under 3 seconds, over a seeded history
  spanning ~20 months across partitions): ✅ PASS —
  `backend/tests/integration/audit-latency.test.ts`.
- **Retention** (partitions past 24 months are dropped, and the application role
  cannot invoke the drop routine): ✅ PASS —
  `backend/tests/integration/audit-retention.test.ts`.
- **Platform administration reach** (touches only `tenant`, `plan`, `audit_event`,
  never a business table): ✅ PASS —
  `backend/tests/integration/platform-scope.test.ts`.
- **No hard delete** (no capability anywhere removes a tenant row): ✅ PASS —
  `backend/tests/integration/no-hard-delete.test.ts`.
- **Definer-function scope** (the cross-tenant audit writer can do nothing else):
  ✅ PASS — `backend/tests/integration/audit-definer-scope.test.ts`.

## Two defects found and fixed while validating

Both were pre-existing gaps from earlier phases that this validation pass — and
the tests written for US4/US5 — first exercised end to end. Neither is a
regression introduced by this slice's later work; both are now covered by tests
that would catch a recurrence.

1. **`PermissionGuard` could never enforce an archetype requirement.** NestJS runs
   Guards before Interceptors for every request, and the guard read
   `request.principal`, which only `TenantContextInterceptor` (an interceptor) ever
   sets. Every archetype-gated tenant route would have been refused unconditionally,
   regardless of the caller's actual archetype — a bug T031's shell was never
   exercised against until `GET /audit/events` (T088) needed it to actually gate on
   `SA`. Fixed by moving the check into `TenantContextInterceptor`, immediately
   after principal resolution. See `backend/src/common/permissions/guard.ts` and
   `backend/src/common/tenant/middleware.ts`.
2. **The partition-management functions were not `SECURITY DEFINER`.**
   `audit_event_ensure_partition` and `audit_event_drop_expired_partitions`
   (`0004_audit_partitions.sql`) ran DDL (`CREATE TABLE`, `DETACH`/`DROP`) as
   whichever role called them. `lc_platform` and `lc_retention` hold no `CREATE`
   on schema `public` and do not own the table, so both would have failed with
   "permission denied" the first time either was invoked outside the initial
   migration run. Fixed in `0010_audit_partition_fns_definer.sql`, following the
   same `SECURITY DEFINER` pattern already used for the cross-tenant audit writer
   (D8).

## Commands run

```bash
npm run verify:role      # V1
npm run test:rls         # V2
npm run test:isolation   # V3, V4 (half), V10, V11, V12, V15
npm test -- --coverage   # everything, plus the blocking coverage gate (T105)
```
