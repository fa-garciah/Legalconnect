---
description: "Task list for 015-kpi-dashboard"
---

# Tasks: The Firm's KPIs

**Input**: [spec.md](./spec.md), [plan.md](./plan.md)

**Tests**: mandatory, strict TDD — every test task is run and **seen to fail** before the task
under it starts.

## Format: `[ID] [P?] [Story] Description`

Stories: **US1** the firm's figures · **US2** workload · **US3** outcomes · **US4** the trend.

---

## Phase 1: The data model (BLOCKS everything — success rate is uncomputable without it)

- [ ] T001 Contract test `backend/tests/contract/case-outcome.test.ts`: `PATCH
      /tenant/cases/:caseId/outcome` accepts each of the four values on a **closed** matter;
      refuses `400` on an open one; refuses `400` for a value outside the four; is refused for an
      archetype without `case.change_status` (`PL`, `BM`); answers `404` for a matter the caller
      cannot reach; and writes exactly one `case.outcome_declared` audit row. **See it fail.**
- [ ] T002 `backend/drizzle/0047_case_outcome.sql` — the `case_outcome` enum, the nullable column,
      the `outcome IS NULL OR closed_on IS NOT NULL` check, and `audit_event_action_known`
      re-issued **in full** with `case.outcome_declared` (the constraint enumerates every action
      across every slice; it cannot be extended in place).
- [ ] T003 `AUDIT_ACTIONS` + `TARGET_ENTITY_BY_ACTION` in `common/audit/actions.ts` gain
      `case.outcome_declared` → `case`. Move the census in
      `tests/unit/document-audit-actions.test.ts` and `directory-audit-actions.test.ts`
      (both assert an exact action count, by design).
- [ ] T004 `case.repository.ts#updateOutcome`, `case.service.ts#declareOutcome` (closed-only,
      value validated against the four), and the route on `case.controller.ts` with
      `@Capability('case.change_status')`, `@ScopeTarget('caseId')` and
      `@Audited({ action: 'case.outcome_declared', targetEntity: 'case' })`.
- [ ] T005 Integration test `backend/tests/integration/case-outcome-constraint.test.ts`: the
      database itself refuses an outcome on an open matter, and refuses a value outside the enum
      — so the guarantee survives a future caller that bypasses the service. **See it fail** (the
      constraint does not exist until T002 runs).
- [ ] T005a **FR-002b — the case read must carry the outcome.** Extend
      `backend/tests/contract/case-crud.test.ts` (or a sibling): `GET /tenant/cases/:caseId`
      returns `outcome: null` for an undeclared matter and the declared value afterwards. Then add
      it to `case.controller.ts`'s presenter and `case.repository.ts`'s `SELECT_CASE`.
      **See it fail.** (Found by `/speckit-analyze` as HIGH: the panel cannot offer to change a
      value it cannot read, so US3 scenario 2 was unimplementable as written.)
- [ ] T005b **FR-002c — the control that makes US3 reachable.** Component test
      `frontend/tests/component/expedientes/CaseOutcome.test.tsx`: choosing a closing status in
      `CaseDetailPanel` prompts for the outcome; an already-closed matter shows its declared
      outcome and allows changing it; an archetype without `case.change_status` sees no control;
      the four options are Spanish. **See it fail**, then add the control beside the existing
      "Cambiar estado" (`CaseDetailPanel.tsx:271`) and the `declareOutcome` call to
      `frontend/src/cases/api.ts`. (Found by `/speckit-analyze` as HIGH: T004 built the endpoint
      and nothing reached it — the story would have shipped as dead code.)

## Phase 2: The aggregates (US1, US2, US3, US4)

- [ ] T006 [P] Unit test `backend/tests/unit/kpi-period.test.ts`: `periodWindow('month'|'quarter'|
      'year', asOf)` returns the current window and the immediately preceding one of the same
      length, computed in `America/Mexico_City`; a quarter boundary at 23:00 Mexico City on the
      last day lands in the closing quarter, not the next; six quarter starts come back oldest
      first. **See it fail.**
- [ ] T007 [P] `backend/src/modules/kpi/period.ts`.
- [ ] T008 Contract test `backend/tests/contract/kpis.test.ts` — **the honesty test.** Against a
      purpose-built firm (`makeCaseFirm`) with known matters, **whose closing status is renamed
      away from the default `Concluido`** so that code matching a status name rather than
      `is_closing` fails here (FR-003, found by `/speckit-analyze`): active count excludes matters in a
      closing status; average resolution equals the value computed independently in SQL by the
      test; a quarter with nothing closed is `null`, **never `0`**; a period whose predecessor is
      empty carries **no** delta; success rate is `null` with fewer than five declared outcomes
      and names the undeclared count; `MP`, `CM`, `SA` are served and `AA`, `PL`, `BM` refused.
      **See it fail.**
- [ ] T009 `backend/src/modules/kpi/` — module, controller (`@Capability('kpi.read')`, no
      `@Audited`), service and repository.
- [ ] T010 Capability: `'kpi.read': { scope: 'tenant' }` in `capability.ts`,
      `new Set(['MP','CM','SA'])` in `matrix.ts`, the assertion in `matrix-exhaustive.test.ts`'s
      independently transcribed table, and the FOUR census counts that move with it: `registry-shape.test.ts` (46→47),
      `portal-archetypes-empty.test.ts` (24→25), `capability-declared-everywhere.test.ts`
      (46→47) and `matrix-exhaustive.test.ts`s own `asserted.size` (46→47). `023` moved the
      same four; a task saying "three" is how the fourth is discovered by a red build.
- [ ] T011 Contract test `backend/tests/contract/kpis-grouping.test.ts`: a matter with **no live
      lead** appears under an explicit "no responsable" group rather than vanishing; a matter with
      **no matter type** appears under an explicit "no type" group; both counts add up to the
      firm's total. **See it fail**, then make it pass.

## Phase 3: The screen (US1–US4)

- [ ] T012 `frontend/src/app/globals.css` — `--chart-1…5`, `--chart-positive`,
      `--chart-negative`, derived from `020`'s brand and warm-accent families, plus their
      `@theme inline` `--color-chart-*` mappings. Record each pair's contrast in
      `specs/015-kpi-dashboard/contrast.md`, as `020` did.
- [ ] T013 [P] Unit test `frontend/tests/unit/kpi-format.test.ts`: months render as "8.3 m";
      a null figure renders "Sin datos", never "0"; a delta renders signed with its unit and is
      **absent** when null; a percentage renders with no decimals. **See it fail.**
- [ ] T014 [P] `frontend/src/kpi/format.ts` and `frontend/src/kpi/api.ts`.
- [ ] T015 Component test `frontend/tests/component/kpis/KpiDashboard.test.tsx`: the four tiles,
      the period selector changing the query, a tile with a null figure reading "Sin datos", a
      tile with no delta showing none, and the success-rate tile reading "Datos insuficientes"
      with its undeclared count. **See it fail.**
- [ ] T016 `frontend/src/app/kpis/page.tsx` (server, resolving archetype as `/clientes` does),
      `KpiDashboard.tsx` and `StatTile.tsx`.
- [ ] T017 Component test for the charts: each renders **and** an equivalent table carries the
      same numbers (FR-012); a missing quarter is a gap in the table, not a zero. **See it fail.**
- [ ] T018 `WorkloadChart.tsx`, `SuccessByTypeChart.tsx`, `ResolutionTrendChart.tsx` and the
      shared `ChartTable.tsx`.
- [ ] T019 Tabs: *Rendimiento* and *Asuntos* only. Assert in the component test that **no**
      "Financiero" tab and **no** "Ingresos" tile exist (spec Decision 2) — an absence worth
      pinning, because the mockup shows both and a future reader will assume they were forgotten.

## Phase 4: Navigation, copy and the demo data

- [ ] T020 Unit test `frontend/tests/unit/kpi/navigation.test.ts`: `kpis` is `available: true`
      and its `requiredArchetypes` are exactly `['MP','CM','SA']`; the item is shown exactly to
      the archetypes holding `kpi.read`, derived from `can()` rather than restated. **See it
      fail**, then flip the flag and narrow the list in one edit (`023`'s precedent: `INTERNAL`
      includes `BM`).
- [ ] T021 Frontend capability mirror: `kpi.read` in `authz/capability-matrix.ts` **and** in
      `capability-matrix-sync.test.ts`'s fixture. **Check the mirror file afterwards** — `023`
      learned that the sync test passes with a missing mirror row, because it only checks
      mirror→fixture.
- [ ] T022 `/configuracion`'s permission matrix: a Spanish label for `kpi.read` in
      `matrix-view-model.ts`, or `matrix-view-model.test.ts` fails on an unlabelled row (`023`
      hit exactly this).
- [ ] T023 Extend `frontend/tests/component/spanish-copy.test.tsx` with the dashboard and a
      `KPI_WIRE_WORDS` regex (`favorable`, `outcome`, `quarter`, `rate`, `active`). **See it
      fail**, then fix any English.
- [ ] T024 **Spec Decision 9 / `022` Decision 7** — amend `backend/drizzle/demo/matters.ts` to
      give every closed matter an outcome, unevenly distributed across matter types, and
      `seed-demo.ts` to write it. Extend `022`'s `demo-matters.test.ts` and `demo-seed.test.ts`:
      every closed matter has one, no open matter does, and all four values appear. **See it
      fail.**
- [ ] T025 Grep the new files for colour literals; expect zero. **And for revenue** (SC-008):
      `grep -riE "ingreso|revenue|factura|invoice|billing"` over this slice s files returns
      nothing, so Decision 2 s absence is checkable rather than merely intended.

## Phase 5: Gates and closure

- [ ] T026 Backend gates: `typecheck`, `lint`, `test`, and with a database `test:rls`,
      `test:isolation`, `verify:role`, `test:auth-coverage`, `npm test -- --coverage`. Record the
      MinIO-dependent failures as `022`/`023` established them, and **never** claim a suite that
      did not run.
- [ ] T027 **`test:rls` deserves attention this time**, not a glance: this is the first slice
      since `013` to change a tenant-scoped table. Confirm `case_file`'s policy still covers the
      new column (it does — the policy is on the row) and that the catalog check still passes.
- [ ] T028 Frontend gates: `typecheck`, `lint`, `npm test`, `npm run build`.
- [ ] T029 e2e `frontend/tests/e2e/kpis.spec.ts` against `022`'s demo firm: sign in as the `MP`,
      open `/kpis`, read a figure, change the period and watch it change. Sign in **once** for
      the file — `023` learned that a per-test sign-in trips the origin throttle.
- [ ] T030 `specs/015-kpi-dashboard/quickstart.md` — how to see it, as `MP` and as an `AA` who
      cannot.
- [ ] T031 `specs/015-kpi-dashboard/quickstart-results.md` — verified and not verified, by name.
- [ ] T032 Leave the spec's nine Decision boxes **unticked** (pending Jero).

---

## Dependencies

- T001–T005 first: every aggregate in Phase 2 reads the column Phase 1 creates.
- T006–T007 block T008 (the contract test asserts period boundaries).
- T010 blocks T009's route being reachable at all.
- T012 blocks T018 (a chart without tokens needs a literal, which is forbidden).
- T024 depends on T002 (the column) and makes T029 meaningful — without declared outcomes the
  demo firm shows "Datos insuficientes" and the e2e asserts nothing about success rate.
- Phase 5 last.

## Parallel opportunities

`[P]`: T006/T007 (period) ‖ T013/T014 (formatting). The backend aggregate chain and the frontend
chart chain are independent once T014 exists.
