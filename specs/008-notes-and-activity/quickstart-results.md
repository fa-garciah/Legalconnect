# Quickstart Results — Case Notes and Case Activity

**Feature**: `008-notes-and-activity` | **Validated**: 2026-10-09 | by the implementer (Claude, Opus 5.5)
**Environment**: Windows 11, Docker Desktop, PostgreSQL 16 in a disposable container (host port 5463,
migrated through `0049`), backend on 3001, frontend `next dev` on 3000. The branch is rebased on
`fix-stale-e2e` (the shared `demo-session` e2e helper).

## Automated gates

| Gate | Result |
|---|---|
| Backend `check:env`, `lint`, `typecheck` | ✅ clean |
| Backend `npm test -- --coverage`, all files | ✅ 231 files, 2,542 tests, coverage thresholds met |
| `test:isolation` | ✅ 144 tests (incl. `notes-isolation.test.ts`, 4, and five new probes in `foreign-reference-oracle.test.ts`) |
| `test:rls` | ✅ 37 tests (`case_note` covered) |
| `verify:role` | ✅ 4 tests |
| `test:auth-coverage` | ✅ 32 tests |
| Frontend `npm test` | ✅ 96 files, 815 tests |
| Frontend `typecheck`, `lint` | ✅ clean |
| Frontend `build` | ✅ `next build` ok — run in the main checkout at this branch's tip (a worktree build fails on Turbopack's refusal of a `node_modules` junction, an environment limit) |
| Colour literals in new files | ✅ 0 |
| e2e `tests/e2e/notas.spec.ts` + `notas-billing.spec.ts` (desktop, live backend, demo firm) | ✅ `notas` 1/1, `notas-billing` 1/1 (demo MP Alejandro Méndez; BM Sergio Pantoja); `notas` also 1/1 again on `024`'s tip |

## This slice's own tests

| Suite | Tests |
|---|---|
| `tests/unit/{note-input,note-audit-actions,activity-actions,demo-notes}.test.ts` | unit |
| `tests/integration/case-note-constraints.test.ts` | constraints, RLS forced, no `DELETE` for `lc_app` |
| `tests/contract/case-notes.test.ts` | 12 |
| `tests/contract/case-notes-correction.test.ts` | 6 |
| `tests/contract/case-activity.test.ts` | 8 |
| `tests/integration/isolation/notes-isolation.test.ts` | 4 |
| `tests/integration/demo-seed.test.ts` — notes section + idempotency across days | 3 + 2 assertions |
| Frontend unit `tests/unit/notes/*` | 12 |
| Frontend component `notas/NotesView`, `actividad/ActivityView`, panel links, Spanish copy | 9 + 7 + 5 + 3 |

## Findings recorded during implementation

- **Analyze M1 — answered.** An unassignment written by the membership-revocation cascade
  (006/FR-012a) carries `metadata.caseId` (`close-assignments.ts`), so it **does** appear in the
  matter's activity. Asserted in `case-activity.test.ts`.
- **T015's new isolation probes were green on first run.** Reach is decided by 006's resolver, which
  `fix-cross-tenant-fk-oracle` already firm-checks for every archetype; there was no new code path to
  fail. Their value is as regression guards.
- **Demo activity starts empty** (Decision 5): the seed writes notes but never `audit_event`.
