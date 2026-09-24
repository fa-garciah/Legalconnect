---
description: "Task list for 013-calendar-core"
---

# Tasks: The Firm's Calendar

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [contracts/calendar-api.md](./contracts/calendar-api.md)
**Tests**: mandatory, strict TDD — each test task is run and **seen to fail** first.

## Phase 1: Backend foundations

- [x] T001 Unit test `backend/tests/unit/calendar-input.test.ts`: the write body — required type and
      title, trimmed lengths, all-day vs timed shape, end ≥ start, the five reminder values, unknown
      fields ignored. **See it fail.**
- [x] T002 `backend/src/modules/calendar/calendar-input.ts`.
- [x] T003 Unit test `backend/tests/unit/calendar-audit-actions.test.ts` (three actions, target
      `calendar_event`, none channel-gated) and bump the pinned vocabulary counts (55 → 58).
      **See it fail.**
- [x] T004 Migration `0046_calendar_event.sql` (table, enums, CHECKs, RLS, grants, indexes, audit
      CHECK) and `TENANT_SCOPED_TABLES`; `AUDIT_ACTIONS`; run `test:rls`.
- [x] T005 Capability rows 44–45 in `matrix.ts` and `capability.ts`; update
      `capability-declared-everywhere.test.ts`'s count only once routes exist (T008).

## Phase 2: Backend routes

- [x] T006 Isolation test `backend/tests/integration/isolation/calendar-isolation.test.ts`: firm B
      never reads firm A's events (as `lc_app`, both settings); an AA not on a case never receives
      that case's events through the API, and does receive the firm's case-free events and those of
      a case they are on. **See it fail.**
- [x] T007 Contract test `backend/tests/contract/calendar-events.test.ts`: list by range (overlap,
      62-day cap, cancelled hidden by default), create timed and all-day, `404` for an unreachable
      case, edit (audit metadata lists field names only), cancel (no delete, `409` twice), BM `403`
      on every route, reminders window. **See it fail.**
- [x] T008 `calendar.repository.ts`, `calendar.service.ts`, `calendar.controller.ts`,
      `calendar.module.ts`, registration in `AppModule`.
- [x] T009 Full backend gates: lint, typecheck, `check:env`, `npm test -- --coverage`, isolation /
      rls / role.

## Phase 3: Frontend

- [x] T010 [P] Unit tests `frontend/tests/unit/calendar/month-grid.test.ts` (weeks start Monday; days
      of the previous/next month padded; an event spanning midnight lands on both days; all-day
      dates never shift with the browser zone) and `schema.test.ts`. **See them fail.**
- [x] T011 `frontend/src/calendar/{types,api,month-grid,format,schema}.ts`; capability mirror rows
      44–45 and the sync fixture.
- [x] T012 [P] Component test `CalendarView.test.tsx`: month grid with events, today marked, day
      list in time order, month navigation requests only that range, a case-linked event links to
      its documents, cancelled struck through, BM sees the refusal. **See it fail.**
- [x] T013 [P] Component test `EventDialog.test.tsx`: create timed and all-day, case offered from
      the caller's cases, end-before-start refused before sending, edit sends only changed fields,
      cancel confirms. **See it fail.**
- [x] T014 [P] Component test `RemindersPanel.test.tsx` and the navigation badge. **See it fail.**
- [x] T015 Implement `/calendario` (page, view, grid, day list, dialog, reminders) and flip the
      `calendario` navigation item for MP/AA/PL/CM/SA.
- [x] T016 Spanish-copy and wire-vocabulary (`hearing`, `deadline`, `meeting`, `scheduled`,
      `cancelled`) additions.

## Phase 4: Polish

- [x] T017 e2e `frontend/tests/e2e/calendario.spec.ts`: create a hearing linked to a case → it shows
      on its day → edit its time → cancel it; an all-day deadline with a reminder shows in
      "Recordatorios".
- [x] T018 Frontend gates (test, typecheck, lint, build) and colour literals.
- [x] T019 `quickstart.md`, `quickstart-results.md`; catalog amendment (US02/US03-EP05 → MVP by 013);
      `registro-specs-mvp.md` row for 013.

## Summary

- **Total**: 19 tasks · **Done**: 19
- **Deviation**: FR-013's navigation badge deferred (T014/T015); the count is on `/calendario`.
