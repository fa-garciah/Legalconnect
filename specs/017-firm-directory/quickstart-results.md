# Quickstart Validation Results

**Feature**: `017-firm-directory` | **Run date**: 2026-08-27

All 5 scenarios in [quickstart.md](./quickstart.md) pass. Full suite: **98 test
files, 757 tests, 0 failures** — run twice in succession to confirm idempotency
(no state one test run leaves behind breaks the next). Blocking coverage
(`src/common/tenant/**`, `src/common/audit/**`, `src/common/authz/**`): **100%**
statements, branches, functions and lines — enforced by `npm test -- --coverage`
per T030.

| # | Scenario | Status | Evidence |
|---|---|---|---|
| 1 | Assign a position (US1, FR-001 to FR-005) | ✅ PASS | `backend/tests/contract/assign-position.test.ts` (8 tests), `backend/tests/unit/directory-entry-independence.test.ts` (2 tests, SC-009) |
| 2 | Define the catalog (US2, FR-006 to FR-010) | ✅ PASS | `backend/tests/contract/position-catalog.test.ts` (9 tests), `backend/tests/unit/position-name-collision.test.ts` (4 tests, research.md D6) |
| 3 | Browse the directory (US3, FR-011 to FR-013) | ✅ PASS | `backend/tests/contract/directory-read.test.ts` (5 tests) |
| 4 | The capability matrix grows to 24 rows, exhaustively | ✅ PASS | `backend/tests/unit/matrix-exhaustive.test.ts` (246 tests, extended per T003 to cover the 3 new rows, 0 pairs unasserted); `tsc --noEmit` fails naming a missing row when one of the 3 new capabilities is removed from its `MATRIX` entry (verified by hand, see below) |
| 5 | Nothing that already worked stopped working | ✅ PASS | `npm run test:isolation` (59), `npm run test:rls` (15), `npm run verify:role` (4), `npm run test:contract` (37 files, 142 tests) — see Commands run |

## Additional gates verified beyond the 5 scenarios

- **`0020_directory.sql`/`0021_directory_audit_actions.sql`** apply cleanly against
  the existing schema via `npm run db:migrate`, with no manual intervention (T009).
- **Default seed** (research.md D2, FR-009, SC-008): `backend/tests/integration/directory-seed.test.ts`
  (2 tests) — both seeded tenants' catalogs contain the 5-entry default seed, all
  `active`.
- **Grant audit** (FR-004/FR-007, mirrors 004's T061 pattern): ✅ PASS, expected
  finding **none** — `backend/tests/integration/grants-lockdown.test.ts`, extended
  with `position`/`directory_entry` assertions (T027): `lc_app` holds no `DELETE`
  grant on either new table. `git diff --stat backend/drizzle/0006_grants.sql` is
  empty — this slice's grants are new (0020), never a change to an existing one.
- **`US11–US13-EP10-CFG`** added to `specs/master-user-story-catalog.md`'s EP10-CFG
  table (T028), raising that epic from 10 to 13 stories and the catalogue total
  from 172 to 175.
- **Audit shape** (FR-003, SC-001): every position/directory mutation produces
  exactly one audit entry with actor, subject, previous and new value — asserted
  directly in `assign-position.test.ts` (audit metadata `{from, to}`) and
  `position-catalog.test.ts` ("every catalog mutation produces exactly one audit
  entry").

### FR-021's build gate, verified by hand

```
src/common/authz/matrix.ts(40,14): error TS2741: Property '"directory.assign_position"'
is missing in type '{ ... }' but required in type 'Readonly<Record<"audit.read_own_tenant"
| ... | "directory.read", ReadonlySet<...>>>'.
```

Removed the `'directory.assign_position'` row from `MATRIX` temporarily;
`npx tsc --noEmit` failed naming the missing property, as FR-021 requires. Reverted
immediately; `npx tsc --noEmit` is clean on the branch.

## Three things found and fixed while validating

None are regressions in 001/002/004 — all three are bugs in this slice's own first
draft, caught by the tests this slice's own tasks required writing (or by running the
full suite together rather than one file at a time).

1. **A wrong import source compiled locally but failed `tsc --noEmit`.**
   `position.controller.ts` imported the `PositionRow` type from `./position.service`,
   which only re-exports it transitively through a return type — TypeScript's
   isolated-module resolution rejects that as "declared locally, but not exported."
   `vitest` never caught it (it transpiles per-file without a full program check);
   `npx tsc --noEmit`, run as part of this validation pass, did. Fixed by importing
   `PositionRow` from `./position.repository`, where it is actually declared.
2. **A contract test permanently retired a shared seed fixture.** The first draft of
   `assign-position.test.ts`'s "never assigned vs. assigned-then-retired" scenario
   retired the tenant's actual seeded `Pasante` catalog entry via direct SQL to set up
   the scenario. Retirement is one-way, so the mutation persisted in the real
   (non-rolled-back) dev database — the next full-suite run then failed
   `directory-seed.test.ts`'s "exactly 5 active" assertion, because `Pasante` was no
   longer active. Fixed two ways: the contract test now creates and retires a
   dedicated, uniquely-named position instead of reusing a shared default-seed row,
   and `directory-seed.test.ts`'s assertion was loosened from "the catalog has exactly
   5 rows" to "the 5 default rows are present and active" — the latter is what FR-009
   actually requires, and is resilient to `position-catalog.test.ts`'s own legitimate
   catalog-mutation tests running against the same long-lived seeded tenant.
3. **`capability-declared-everywhere.test.ts`'s `NO_ROUTE_YET` fixture went stale.**
   That list named all three of this slice's new capabilities as having no route yet,
   true only during the Foundational phase before US1–US3 shipped their controllers.
   Running `assign-position.test.ts` alone never exercises this file; running the full
   `test:contract` suite together did, and caught the stale fixture immediately.
   Updated the list to drop all three once their routes existed.

## Commands run

```bash
npm run db:up && npm run db:migrate && npm run db:seed   # T009
npx vitest run tests/unit/directory-entry-independence.test.ts tests/contract/assign-position.test.ts
npx vitest run tests/unit/position-name-collision.test.ts tests/contract/position-catalog.test.ts
npx vitest run tests/contract/directory-read.test.ts
npm run test:isolation                                    # Scenario 5 (isolation half)
npm run test:rls                                          # Scenario 5 (RLS half)
npm run verify:role                                       # Scenario 5 (role half)
npm run test:contract                                     # Scenario 5 (contract half), T029
npm test                                                  # full suite, run twice for idempotency
npm test -- --coverage                                    # everything, plus T030's blocking gate
npx tsc --noEmit                                          # FR-021's build gate (clean on the branch)
```
