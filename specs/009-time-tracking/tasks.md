---
description: "Task list for 009-time-tracking"
---

# Tasks: Recording Time

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [data-model.md](./data-model.md),
[contracts/time-entries-api.md](./contracts/time-entries-api.md)
**Tests**: mandatory, strict TDD (constitution) — every test task is run and **seen to fail** before
the task that makes it pass.

## Phase 1: Setup

- [ ] T001 Point `.specify/feature.json` at `specs/009-time-tracking`; confirm migrations end at `0047` and the matrix at row 47 (`backend/tests/unit/registry-shape.test.ts`).

## Phase 2: Foundational (blocks every story)

- [ ] T002 [P] Unit test `backend/tests/unit/time-entry-duration.test.ts`: `minutesFromElapsed` (0 s → 1, 29 s → 1, 89 s → 1, 90 s → 2, exactly 1440 min → 1440, negative clock skew → 1), `exceedsDay` (1440 min false, 1440 min + 31 s true), `sumMinutes`, `dayTotals` (grouped, newest first, only days present). **See it fail.**
- [ ] T003 [P] Unit test `backend/tests/unit/time-entry-input.test.ts`: manual body (workDate real `YYYY-MM-DD`, minutes integer 1..1440, description trimmed 1..1000, unknown fields ignored), timer start body (optional description ≤ 1000), stop body, correction patch (only `workDate`/`minutes`/`description`, each validated) and `changedFields` (sorted names, never values). **See it fail.**
- [ ] T004 [P] Unit test `backend/tests/unit/time-entry-audit-actions.test.ts` (six actions, target `time_entry`, none channel-gated) and bump the pinned vocabulary counts in `directory-audit-actions.test.ts`, `document-audit-actions.test.ts` and `calendar-audit-actions.test.ts` if they pin totals. **See it fail.**
- [ ] T005 Implement `backend/src/modules/time-entries/duration.ts` and `time-entry-input.ts` until T002–T003 pass.
- [ ] T006 Add the six actions to `backend/src/common/audit/actions.ts` (`AUDIT_ACTIONS`, `TARGET_ENTITY_BY_ACTION`) until T004 passes.
- [ ] T007 Integration test `backend/tests/integration/time-entry-constraints.test.ts`: each CHECK of data-model.md refuses its violating row; the partial unique index refuses a second running timer; `lc_app` has no `DELETE` on `time_entry`; RLS is forced. **See it fail** (table absent).
- [ ] T008 Migration `backend/drizzle/0048_time_entry.sql` (enums, table, CHECKs, indexes, RLS + null-safe policy, grants, audit `CHECK` re-issued whole); register in `backend/src/common/db/tenant-scoped-tables.ts`; fixture row per tenant in `backend/drizzle/seed.ts` (FR-021). Run `db:migrate`, `db:seed`, then T007, `test:rls` and `no-context.test.ts`.
- [ ] T009 Matrix tests first: rows 48–51 in `backend/tests/unit/matrix-exhaustive.test.ts`, count 51 in `registry-shape.test.ts`, `portal-archetypes-empty.test.ts`. **See them fail.** Then rows 48–51 in `backend/src/common/authz/capability.ts` and `matrix.ts`.
- [ ] T010 Error classes in `backend/src/common/http/errors.ts`: `TimerRunning`, `NoRunningTimer`, `TimerTooLong`, `CorrectionWindowClosed`, `EntryVoided` (all `409`, codes per contract).
- [ ] T011 Coverage threshold: `src/modules/time-entries/duration.ts` at 100% in `backend/vitest.config.ts` (FR-020).

## Phase 3: User Story 1 — the timer (P1) 🎯 MVP

**Goal**: start, stop and discard a server-side timer on a reachable matter.
**Independent test**: as an AA, start → stop with description → entry exists with elapsed minutes; second start refused; unreachable matter 404; discard works when the matter is unreachable.

- [ ] T012 [US1] Contract test `backend/tests/contract/time-entries-timer.test.ts` (+ helper `backend/tests/helpers/time-entries.ts` building a firm with MP, AA on/off a case, PL, CM, BM, SA): start `201` + one `time_entry.timer_started`; second start `409 timer_running`; `GET …/timer` shows it; stop `201` with minutes ≥ 1, `workDate` = Mexico City start day, one `time_entry.timer_stopped`; stop twice `409 no_running_timer`; stop without description `400`; stop on a timer backdated > 24 h `409 timer_too_long`; discard `200` + `time_entry.timer_discarded`, nothing on the timesheet; AA on a case they are not on `404`; unassigned mid-timer → timer read `case: null, caseAvailable: false`, stop `404`, discard `200`; BM and SA `403` on all routes; **two concurrent starts** (`Promise.all`) → exactly one `201`, one `409 timer_running`, one audit row (analyze C2); a timer whose `started_at` is backdated to `05:30Z` (23:30 the previous day in Mexico City) records the **previous** day on stop (SC-005, analyze C1). **See it fail.**
- [ ] T013 [US1] `time-entries.repository.ts`, `time-entries.service.ts`, `time-entries.controller.ts` (nested, `@ScopeTarget('caseId')`), `timesheet.controller.ts` (flat), `time-entries.module.ts`; register in `backend/src/app.module.ts`; update `capability-declared-everywhere.test.ts` counts. T012 passes.

## Phase 4: User Story 2 — manual entry (P1) 🎯 MVP

**Independent test**: POST a manual entry; future date, zero/over-24 h minutes, missing description refused; unreachable matter 404.

- [ ] T014 [US2] Contract test `backend/tests/contract/time-entries-manual.test.ts`: `201` + exactly one `time_entry.logged` whose metadata has no description/minutes/date; future date (Mexico City) `400`; minutes 0 / 1441 / 1.5 `400`; blank description `400`; unknown case `404`; AA off-case `404`; MP on an unstaffed case `201` (006 Decision 2); BM/SA `403`. **See it fail.**
- [ ] T015 [US2] Manual-entry path in repository/service/controller. T014 passes.

## Phase 5: User Story 3 — my timesheet (P2)

**Independent test**: list a range; totals equal sums; entries on unassigned matters absent from items and totals; nobody sees another's entries.

- [ ] T016 [US3] Isolation test `backend/tests/integration/isolation/time-entries-isolation.test.ts`: firm B never reads firm A's entries (as `lc_app` with B's context, and through the API: every route `404`/empty); an AA unassigned from a matter loses its entries from items **and** `totalMinutes`/`days`; an AA never sees the PL's entries on the same matter; MP sees their own entries on any matter and nobody else's. **See it fail.**
- [ ] T017 [US3] Contract test `backend/tests/contract/time-entries-timesheet.test.ts`: range `[from,to)` on Mexico City days; > 62 days, reversed, malformed `400`; ordering; `totalMinutes` and `days` equal the sums of `items` (SC-003); voided and running excluded; `correctableUntil` present for a fresh entry and `null` for one logged 25 h ago. **See it fail.**
- [ ] T018 [US3] Timesheet read path (`visibleTo()` predicate, totals via `duration.ts`). T016–T017 pass.

## Phase 6: User Story 4 — correction (P2)

- [ ] T019 [US4] Contract test `backend/tests/contract/time-entries-correction.test.ts`: PATCH own fresh entry `200`, audit `{changed:[…]}` names only; void `200` then absent from list and totals, row still present with `voided_at`; second void `409 entry_voided`; entry logged 25 h ago `409 correction_window_closed` on both; another person's entry `404` (including MP on an AA's entry); wrong `caseId` in URL `404`; patch with `caseId` ignored. **See it fail.**
- [ ] T020 [US4] Correction and void paths. T019 passes.
- [ ] T021 Backend gates: `check:env`, `lint`, `typecheck`, `npm test -- --coverage` (thresholds), `test:isolation`, `test:rls`, `verify:role`, `test:auth-coverage`.

## Phase 7: Frontend (US1–US4)

- [ ] T022 [P] Unit tests `frontend/tests/unit/time/duration.test.ts` (`formatMinutes`: 0 h/45 min/1 h/1 h 30 min/24 h; `elapsedClock` hh:mm:ss; `toMinutes(hours, minutes)`), `range.test.ts` (this week Monday–Sunday Mexico City incl. a Sunday 23:00 UTC−6 edge, previous week, this month, `[from,to)` exclusive end, 62-day check), `schema.test.ts` (manual form: future date, 0, > 24 h, blank description refused). **See them fail.**
- [ ] T023 `frontend/src/time/{types,api,duration,range,schema}.ts`; capability mirror rows 48–51 in `frontend/src/authz/capability-matrix.ts` and `frontend/tests/unit/capability-matrix-sync.test.ts`'s fixture (test edit first, see it fail); labels in `frontend/src/configuracion/matrix-view-model.ts`.
- [ ] T024 [P] [US3] Component test `frontend/tests/component/horas/TimesheetView.test.tsx`: grouped by day, totals rendered from the response (not recomputed), range presets request the right `from`/`to`, empty state with "Registrar horas", error state with retry, BM/SA see the no-access message and nothing is requested. **See it fail.**
- [ ] T025 [P] [US1] Component test `frontend/tests/component/horas/TimerCard.test.tsx`: idle → choose matter → start; running shows file number and ticking clock; stop requires a description; `409 timer_running` copy; unavailable matter shows only "Descartar". **See it fail.**
- [ ] T026 [P] [US2] [US4] Component test `frontend/tests/component/horas/LogTimeDialog.test.tsx` and `CorrectEntryDialog.test.tsx`: refused before sending (future, zero, > 24 h, blank); correction sends only changed fields; controls drawn only when `correctableUntil` is set; void confirms. **See them fail.**
- [ ] T027 Implement `frontend/src/app/horas/{page,TimesheetView,TimerCard,LogTimeDialog,CorrectEntryDialog,VoidEntryDialog}.tsx`; flip `horas` in `frontend/src/shell/navigation-items.ts` to `available: true`, `['MP','AA','PL','CM']` with `frontend/tests/unit/time/navigation.test.ts` derived from `can()` (test first).
- [ ] T028 Spanish-copy and wire-vocabulary additions in `frontend/tests/component/spanish-copy.test.tsx`.

## Phase 8: Demo seed and polish

- [ ] T029 [P] Unit test `backend/tests/unit/demo-time-entries.test.ts`: deterministic; only MP/AA/PL/CM; only matters each is assigned to; working days in the last six weeks, none in the future; minutes 1..1440; heaviest ≥ 2× lightest timekeeper (SC-008); descriptions Spanish; the MP's entries are mostly `manual` (Decision 11, analyze C4). **See it fail.**
- [ ] T030 `backend/drizzle/demo/time-entries.ts` and `seedTimeEntries` in `backend/drizzle/seed-demo.ts` (idempotent on a deterministic id; `assertMigrated` includes `time_entry`); extend `backend/tests/integration/demo-seed.test.ts`.
- [ ] T031 e2e `frontend/tests/e2e/horas.spec.ts` against the demo firm: AA starts a timer on a matter, stops it with a description, sees it under today; records 1 h 30 min manually; corrects it to 45 min; voids it; BM has no "Registro de Horas".
- [ ] T032 Frontend gates: `test`, `typecheck`, `lint`, `build`; zero colour literals in new files.
- [ ] T033 `quickstart-results.md`; spec Approval Checklist untouched (ratification is Jero's); `registro-specs-mvp.md` and `plan-paralelo-2026-09.md` rows for 009; catalog note "Owned by" → "Delivered by".

## Dependencies

Phase 2 blocks everything. US1 (T012–T013) builds the module skeleton US2–US4 extend, so backend
stories run in order; T016 needs T013's routes. Frontend (Phase 7) needs T021 green. T029–T030 are
independent of Phase 7.

## Parallel opportunities

T002/T003/T004 together; T022 alongside T012–T020; T024/T025/T026 together; T029 alongside Phase 7.

## Implementation strategy

MVP = Phases 1–4 (timer + manual entry) — already a usable record. US3 makes it visible, US4 makes
it correctable; both ship in this slice because the spec's Decision 3 treats an uncorrectable record
as defective.
