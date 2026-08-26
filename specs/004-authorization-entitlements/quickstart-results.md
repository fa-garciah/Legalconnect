# Quickstart Validation Results

**Feature**: `004-authorization-entitlements` | **Run date**: 2026-08-26

All 8 scenarios in [quickstart.md](./quickstart.md) pass. Full suite: **91 test
files, 665 tests, 0 failures**. Blocking coverage (`src/common/tenant/**`,
`src/common/audit/**`, `src/common/authz/**`): **100%** statements, branches,
functions and lines — enforced by `npm test -- --coverage` per T003/T065.

| # | Scenario | Status | Evidence |
|---|---|---|---|
| 1 | The default is closed — absence of a rule is a refusal, not a gap | ✅ PASS | `backend/tests/unit/deny-by-default.test.ts` (3 tests). Compile-time half verified by hand — see below |
| 2 | Every (subject × capability) pair is asserted, none sampled | ✅ PASS | `backend/tests/unit/matrix-exhaustive.test.ts` (213 tests), `portal-archetypes-empty.test.ts` (33), `matrix-shape.test.ts` (5), `registry-shape.test.ts` (5) |
| 3 | The server decides, and the client cannot influence it | ✅ PASS | `backend/tests/contract/decision-equals-endpoint.test.ts` (3), `capability-declared-everywhere.test.ts` (4), `undeclared-route-unreachable.test.ts` (2), `po-refused-everything.test.ts` (8) |
| 4 | Tier entitlement, with no deployment | ✅ PASS | `backend/tests/unit/entitlement.test.ts` (9), `refusal-ordering.test.ts` (8), `refusal-mapping.test.ts` (7), `backend/tests/integration/entitlement-no-deploy.test.ts` (3), `backend/tests/contract/refusal-shapes.test.ts` (4) |
| 5 | Live archetype changes — no grace period, no session cache | ✅ PASS | `backend/tests/integration/archetype-change-live.test.ts` (1 test) |
| 6 | A tenant always keeps one SA, under concurrency as well as in sequence | ✅ PASS | `backend/tests/integration/last-sa-protected.test.ts` (3 tests, including the concurrent-demotion race) |
| 7 | Scope, with the resolver that does not exist yet | ✅ PASS | `backend/tests/unit/scope-port.test.ts` (6), `scope-resolvers.test.ts` (10), `scope-port-extensibility.test.ts` (1) |
| 8 | Nothing that already worked stopped working | ✅ PASS | `npm run test:isolation` (57), `npm run test:rls` (11), `npm run verify:role` (4), `npm run test:contract` (all contract suites) — see Commands run |

## Additional gates verified beyond the 8 scenarios

- **FR-021's build gate** (a capability without its matrix row fails `tsc --noEmit`,
  naming the missing property): ✅ PASS, verified by hand — see below and
  [quickstart.md](./quickstart.md) Scenario 1.
- **`archetype.redefine` held by nobody, and no invention surface anywhere**:
  ✅ PASS — `backend/tests/contract/archetype-no-invention.test.ts` (3 tests).
- **Refusal audit vocabulary** (cross-tenant refusals visible, in-tenant refusals
  silent, no PII): ✅ PASS — `backend/tests/integration/refusal-audit-vocabulary.test.ts`
  (3 tests), `backend/tests/unit/audit-vocabulary-unchanged.test.ts` (2 tests, still
  exactly 16 actions).
- **Grant audit** (research.md D10): ✅ PASS, expected finding **none** —
  `backend/tests/integration/grants-lockdown.test.ts`, extended with `tenant`/`plan`
  assertions (T061). `0020_authz_grant_verification.sql` was never created; there was
  nothing to narrow.
- **`npm run db:migrate`** applies `0019_membership_retain_one_sa.sql` cleanly against
  the existing schema, with no manual intervention.

### FR-021 verified by hand

```
src/common/authz/matrix.ts(40,14): error TS2741: Property '"test.fr021_probe"' is
missing in type '{ ... }' but required in type 'Readonly<Record<"audit.read_own_tenant"
| ... | "test.fr021_probe", ReadonlySet<...>>>'.
```

Added `'test.fr021_probe': { scope: 'none' }` to `CAPABILITIES` with no `MATRIX` row;
`npx tsc --noEmit` failed naming the missing property, as FR-021 requires. Reverted
immediately; `npx tsc --noEmit` is clean on the branch.

## Three things found and fixed while validating

None are regressions in 001/002 — all three are bugs in this slice's own first draft,
caught by the tests this slice's own tasks required writing.

1. **The last-SA trigger's `SQLSTATE` was not where the mapping code looked for it.**
   Drizzle wraps the driver's error in a `DrizzleQueryError`; the real Postgres error
   — and its `code: '23001'` — lives on `.cause`, not on the wrapper itself. The first
   draft of `membership.service.ts`'s SQLSTATE check read `error.code` directly and
   always missed, turning every last-SA refusal into an unhandled `500`. Fixed by
   walking `.cause` recursively (`sqlstateOf()`). Caught by
   `last-sa-protected.test.ts`, which expected `409` and got `500`.
2. **The first concurrency test design raced the wrong thing.** Having each of two
   SAs demote the *other* makes the second request's own PERMISSION step depend on
   whether the first has already committed — a caller demoted to `AA` by request 1 is
   correctly refused permission on request 2, which looks like the invariant working
   but actually proves nothing about the trigger's concurrency behaviour. Corrected to
   have each SA demote *themselves* concurrently, so only the trigger's `FOR UPDATE`
   lock decides the outcome.
3. **`ActivePrincipal`'s exact-key-list assertion in 002's own isolation suite.**
   `membership-real-data.test.ts` asserted the literal key set of a resolved
   principal. Adding `plan` (T015, research.md D7) is a direct, required consequence
   of this slice's own design, not an accommodation of a regression — the assertion
   was updated to include `plan`, the one legitimate, narrow exception to "0 test
   files modified to accommodate this slice."

## Commands run

```bash
npm run db:migrate                                    # applies 0019
npm run test:isolation                                # Scenario 8 (isolation half)
npm run test:rls                                       # Scenario 8 (RLS half)
npm run verify:role                                     # Scenario 8 (role half)
npm run test:contract                                   # Scenario 8 (contract half), T040
npm test -- --coverage                                  # everything, plus T003/T065's blocking gate
npx tsc --noEmit                                         # FR-021's build gate (clean on the branch)
```
