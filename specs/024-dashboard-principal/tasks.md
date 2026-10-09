# Tasks: Dashboard Principal

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [contracts/dashboard-api.md](./contracts/dashboard-api.md).
Strict TDD: every test task is run and **seen failing** before its implementation task.

## Phase 1 — Setup

- [X] T001 Point `.specify/feature.json` at `specs/024-dashboard-principal`; confirm the matrix ends at row 55 and migrations at `0049`.

## Phase 2 — Foundational

- [ ] T002 Matrix tests first: row 56 in `backend/tests/unit/matrix-exhaustive.test.ts`; count 56 in `registry-shape.test.ts` and `capability-declared-everywhere.test.ts`. **See them fail.** Then `capability.ts`, `matrix.ts`.
- [ ] T003 Extract 008's activity SELECT into `backend/src/modules/notes/activity-query.ts` (one function taking a "which matters" predicate); `activity.repository.ts` calls it; 008's `case-activity.test.ts` stays green unchanged.

## Phase 3 — User Stories 1–3 (backend)

- [ ] T004 [US1] [US2] [US3] Contract test `backend/tests/contract/dashboard.test.ts`: `today`; `activeMatters` excludes closing statuses; `myMinutesToday` own only, `null` for SA; `todayEvents` today only, no cancelled; `deadlines.upcoming` / `recent` by ±7 days, deadlines only; `recentActivity` allow-listed, newest first, with `case`, ≤ 20; whole-JSON scan (no `metadata`, no status ids, no note text, no revenue words); no audit row written; BM `403`. **See it fail.**
- [ ] T005 [US1] [US2] [US3] `backend/src/modules/dashboard/*`, registered in `app.module.ts`.
- [ ] T006 Isolation test `backend/tests/integration/isolation/dashboard-isolation.test.ts`: an AA with an unassigned matter carrying an event, a deadline, hours and activity sees none of it; an AA with no assignments gets zeros and empty lists (`200`); firm B's data never appears; taken off a matter, its rows leave on the next request. **See it fail where new.**
- [ ] T007 Backend gates.

## Phase 4 — Frontend

- [ ] T008 Mirror row 56 + sync fixture (test first) + matrix-view label.
- [ ] T009 [US1] [US2] [US3] Component test `frontend/tests/component/dashboard/DashboardView.test.tsx`: tiles; "Mis horas de hoy" absent when `null`; deadlines with the past-deadline sentence and never "vencido"; activity sentences with file numbers linking to `/actividad`; `/kpis` link only with `kpi.read`; BM welcome with no request; empty states. **See it fail.**
- [ ] T010 `frontend/src/dashboard/{types,api}.ts`, `frontend/src/app/DashboardView.tsx`, `frontend/src/app/page.tsx`; Spanish-copy additions.

## Phase 5 — Polish

- [ ] T011 e2e `frontend/tests/e2e/dashboard.spec.ts` (demo-session helper): the MP lands on `/` and sees the tiles; a note written on a matter appears in "Actividad reciente" without its text.
- [ ] T012 Frontend gates; `quickstart-results.md`; registro and plan-paralelo rows; catalog EP01 note.

## Dependencies

T002 → T004/T005. T003 before T005. T005 before T006. Frontend after T007. T011 after T010 and after
`fix-stale-e2e` (the `demo-session` helper) is on `main` and this branch's base is rebased onto it.
