# Quickstart Results — Dashboard Principal

**Feature**: `024-dashboard-principal` | **Validated**: 2026-10-09 | by the implementer (Claude, Opus 5.5)
**Environment**: Windows 11, Docker Desktop, PostgreSQL 16 in a disposable container (host port 5463,
migrated through `0049` — this slice adds no migration), backend on 3001, frontend `next dev` on 3000.
Stacked on `008-notes-and-activity`, which is rebased on `fix-stale-e2e`.

## Automated gates

| Gate | Result |
|---|---|
| Backend `check:env`, `lint`, `typecheck` | ✅ clean |
| Backend `npm test -- --coverage`, all files | ✅ 233 files, 2,570 tests, coverage thresholds met |
| `test:isolation` | ✅ 148 tests (incl. `dashboard-isolation.test.ts`, 4) |
| `test:rls`, `verify:role`, `test:auth-coverage` | ✅ 37 · 4 · 32 |
| Frontend `npm test` | ✅ 97 files, 825 tests |
| Frontend `typecheck`, `lint` | ✅ clean |
| Frontend `build` | ✅ `next build` ok — run in the main checkout at this branch's tip (worktree builds hit Turbopack's junction limit) |
| e2e `tests/e2e/dashboard.spec.ts` (desktop, live backend, demo firm) | ✅ `dashboard` 2/2 (demo MP Alejandro Méndez), and `notas` 1/1 on this tip — 008's activity still right after the extraction |

## This slice's own tests

| Suite | Tests |
|---|---|
| `tests/contract/dashboard.test.ts` | 9 |
| `tests/integration/isolation/dashboard-isolation.test.ts` | 4 |
| Matrix: `matrix-exhaustive` (row 56), `registry-shape` (56), `capability-declared-everywhere` (56), `portal-archetypes-empty` (28 tenant-scoped) | — |
| Frontend `tests/component/dashboard/DashboardView.test.tsx` | 9 |
| Frontend `spanish-copy.test.tsx` — one new case | 1 |
| e2e `tests/e2e/dashboard.spec.ts` | 2 |

## Findings recorded during implementation

- **The reach predicate is load-bearing, and the isolation test proves it**: with `reaches()` forced
  to `TRUE`, three of the four isolation tests fail (the fourth is the firm boundary, held by RLS).
  Restored before commit.
- **008's activity query was extracted, not copied** (`modules/notes/activity-query.ts`): the
  per-matter feed and the dashboard's feed share one definition; 008's own suites stayed green
  unchanged.
- `portal-archetypes-empty.test.ts`'s title had drifted from its assertion since 009 ("25" vs 27);
  both now say 28.

- **The first e2e run failed on the test, not the product**: `getByRole('region', { name: 'Hoy' })` also
  matched "Resumen de hoy". Names are matched exactly now; 2/2.
