---
description: "Task list for 008-notes-and-activity"
---

# Tasks: Case Notes and Case Activity

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [data-model.md](./data-model.md),
[contracts/notes-activity-api.md](./contracts/notes-activity-api.md)
**Tests**: mandatory, strict TDD — every test task is run and **seen to fail** first.

## Phase 1: Setup

- [ ] T001 Point `.specify/feature.json` at `specs/008-notes-and-activity`; confirm migrations end at `0048` and the matrix at row 51.

## Phase 2: Foundational

- [ ] T002 [P] Unit test `backend/tests/unit/note-input.test.ts`: body trimmed 1..5000, non-string / blank / too long refused, unknown fields (incl. `visibility`, `caseId`) ignored; `month` `YYYY-MM` valid, `2026-13` / `10-2026` / `hoy` refused, absent → null. **See it fail.**
- [ ] T003 [P] Unit test `backend/tests/unit/note-audit-actions.test.ts`: four actions; targets `case_note` ×3 and `case_file` for `note.list_read`; only `note.list_read` channel-gated; pinned vocabulary totals 65 → 69 in `directory-audit-actions`, `document-audit-actions`, `audit-fields`. **See it fail.**
- [ ] T004 [P] Unit test `backend/tests/unit/activity-actions.test.ts`: the allow-list is exactly spec FR-013's fifteen actions, each in `AUDIT_ACTIONS`, and contains no access action (`case.read`, `document.previewed`, `document.downloaded`, `note.list_read`) and no `time_entry.*`. **See it fail.**
- [ ] T005 Implement `backend/src/modules/notes/note-input.ts`, `activity-actions.ts`; actions in `backend/src/common/audit/actions.ts`.
- [ ] T006 Integration test `backend/tests/integration/case-note-constraints.test.ts`: body bounds, `visibility` refuses anything but `internal`, voided ⇔ `voided_at`, no `DELETE` for `lc_app`, RLS forced. **See it fail.**
- [ ] T007 Migration `backend/drizzle/0049_case_note.sql` (+ audit `CHECK` re-issued whole); `TENANT_SCOPED_TABLES`; fixture note per tenant in `backend/drizzle/seed.ts`; run `test:rls`, `no-context`.
- [ ] T008 Matrix tests first (rows 52–55 in `matrix-exhaustive.test.ts`; count 55 in `registry-shape.test.ts` and `capability-declared-everywhere.test.ts`), **see them fail**, then `capability.ts`, `matrix.ts`. Errors `NoteVoided` in `backend/src/common/http/errors.ts` (reuse `CorrectionWindowClosed`).

## Phase 3: User Stories 1, 2, 4 — write and read notes, audited (P1)

- [ ] T009 [US1] [US2] [US4] Contract test `backend/tests/contract/case-notes.test.ts`: create `201` + one `note.created` without text; list by Mexico City month (23:30 on the 31st stays in that month), newest first, author position, `own`, `correctableUntil`; list writes exactly one `note.list_read` `{month}`; `400` blank/long body and malformed month; AA off-matter `404`; BM and SA `403`. **See it fail.**
- [ ] T010 [US1] [US2] [US4] `notes.repository.ts`, `notes.service.ts`, `notes.controller.ts`, `notes.module.ts`; register in `backend/src/app.module.ts`.

## Phase 4: User Story 3 — correct own notes (P2)

- [ ] T011 [US3] Contract test `backend/tests/contract/case-notes-correction.test.ts`: correct own fresh note `200` + `{changed:['body']}`; void then absent, row kept; `409 note_voided`; `409 correction_window_closed` after 24 h; another person's note `404` (MP included); wrong matter `404`. **See it fail.**
- [ ] T012 [US3] Correction and void paths.

## Phase 5: User Story 5 — activity (P2)

- [ ] T013 [US5] Contract test `backend/tests/contract/case-activity.test.ts`: after status change, team assign/unassign, document upload/category/withdraw/restore, event create/update/cancel and note create/correct/void through the API, the feed lists each, newest first, actor position, document file name; carries no metadata value (no status ids, no note text) — asserted over the whole JSON; excludes `case.read`, previews, downloads, `note.list_read` and `time_entry.*`; other matters' activity absent; month filter; `400` malformed month; reading it writes no audit row; SA `200`, BM `403`; and an unassignment written by the membership-revocation cascade (006/FR-012a) — assert whether it carries `metadata.caseId` and so whether it appears, and record the answer (analyze M1). **See it fail.**
- [ ] T014 [US5] `activity.repository.ts`, `activity.controller.ts`.
- [ ] T015 Isolation test `backend/tests/integration/isolation/notes-isolation.test.ts`: firm B never reads firm A's notes (lc_app); an AA taken off a matter loses its notes and activity on the next request; another firm's matter `404` on all five routes; add the five routes to `foreign-reference-oracle.test.ts`. **See it fail where new.**
- [ ] T016 Backend gates.

## Phase 6: Frontend

- [ ] T017 [P] Unit tests `frontend/tests/unit/notes/{month,schema,activity-copy}.test.ts` (month arithmetic in Mexico City; body bounds; one Spanish sentence per allow-listed action, none containing a value). **See them fail.**
- [ ] T018 `frontend/src/notes/*`; mirror rows 52–55 + sync fixture (test first) + matrix view labels.
- [ ] T019 [P] [US1] [US2] [US3] Component test `frontend/tests/component/notas/NotesView.test.tsx`: grouped by month, composer refuses blank/long before sending, correct/void only when `correctableUntil`, BM/SA see no-access copy and nothing is requested. **See it fail.**
- [ ] T020 [P] [US5] Component test `frontend/tests/component/actividad/ActivityView.test.tsx`: sentences per action, month selector requests that month, empty state, truncated notice. **See it fail.**
- [ ] T021 Pages `notas` and `actividad`; links in `CaseDetailPanel.tsx` gated by `can()` (component test first in `CaseDetailPanel.test.tsx`).
- [ ] T022 Spanish-copy additions.

## Phase 7: Demo seed, e2e, polish

- [ ] T023 [P] Unit test `backend/tests/unit/demo-notes.test.ts`: deterministic, date-free keys, authors only people on the matter (never BM/SA), Spanish text, bounds, a few within 24 h of the seed day. **See it fail.** Then `backend/drizzle/demo/notes.ts`, `seed-demo.ts` (upsert, no audit row), `demo-seed.test.ts` additions.
- [ ] T024 e2e `frontend/tests/e2e/notas.spec.ts` (demo-session helper): write, correct, void a note; open Actividad and see the three entries with no note text; BM sees no case at all.
- [ ] T025 Frontend gates; colour literals; `quickstart-results.md`; `registro-specs-mvp.md` and `plan-paralelo-2026-09.md` rows.

## Dependencies

Phase 2 blocks all. T010 before T011/T013/T015. Frontend after T016. T023 independent of Phase 6.
**T024 needs `frontend/tests/e2e/demo-session.ts`**, which arrives with `fix-stale-e2e` (stage 3): rebase
this branch on `main` once that merges, before writing T024 (analyze H1).
