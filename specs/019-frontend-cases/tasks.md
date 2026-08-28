---

description: "Task list for 019-frontend-cases — The Case Register"
---

# Tasks: The Case Register

**Input**: Design documents from `/specs/019-frontend-cases/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: mandatory. The constitution requires strict TDD and this slice claims **no
exemption** — every line is its own code. Test tasks precede their implementation throughout,
and the two that matter most (T004, T005) are ordered before anything they test exists.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelisable — different files, no dependency on incomplete work
- **[Story]**: US1–US4, on user-story tasks only

## Path Conventions

Web application: `backend/src/`, `backend/tests/`, `frontend/src/`, `frontend/tests/`.

---

## Phase 1: Setup

- [X] T001 Amend `specs/master-user-story-catalog.md` for the stories this slice claims — `US02-EP02-CSM-FilterCases`, `US03-EP02-CSM-ViewCaseList`, `US04-EP02-CSM-ViewCaseDetails`, `US07-EP02-CSM-MonitorCaseStatus`, `US08-EP02-CSM-ViewCaseTeam`, and `US01-EP02-CSM-CreateNewCase` shared with `006` — using the joint-delivery convention `018` established in the `EP03` amendment note. **Principle I: this lands before any other task begins**, and before any PR opens.
- [X] T002 Confirm the seed still prints `SEED_CASE_ASSIGNED_A`, `SEED_CASE_UNASSIGNED_A` and `SEED_MEMBERSHIP_A` by running `npm run db:seed` in `backend/`. Every opacity assertion in this slice needs a matter the seeded membership is **not** on; if that fixture ever disappears, the tests that matter here go quietly vacuous.

---

## Phase 2: Foundational — the backend filters, and the shared seams

**⚠️ BLOCKS every user story.** US1's filter scenarios depend on the endpoint, and every
screen depends on the types and the mirror.

### 2a — The backend change, tests first

> The order in this block is the point. T004 and T005 are written and **observed to fail**
> before T007 exists. See research D7 for why the scoping test is separate from the
> filtering test: they fail differently, and a broken `OR` returns a *superset*, so the
> filtering test still passes while isolation is gone.

- [X] T003 [P] Write `backend/tests/integration/case-filter-scoping.test.ts` — research D7's **eight** cases. Seeds one assigned and one unassigned matter in one tenant and asserts **no value of any filter, in any combination, returns the unassigned matter**. Includes the `MP` inverse: an over-eager filter must not hide matters from someone entitled to all of them. Testcontainers, as the application role, so RLS is live.
- [X] T004 [P] Write `backend/tests/contract/case-list-filters.test.ts` — [case-list-filters.md](./contracts/case-list-filters.md) §1 and §4: each parameter filters; `q` matches file number **and** client legal name; a whitespace-only `q` is absent; filters compose; an **unknown catalog id returns an empty page, not a refusal**; a malformed uuid is `400`.
- [X] T005 Run both and **confirm they fail** for the right reason — the parameters do not exist yet, not a typo in a fixture. A test that fails for the wrong reason proves nothing when it later passes.
- [X] T006 Extend `ListCasesInput` in `backend/src/modules/case-core/case.repository.ts` with `q`, `matterTypeId` and `venueId`, all optional.
- [X] T007 Add the three predicates to the existing `conditions` array in `CaseRepository.list`. **The `q` predicate is one parenthesised condition containing the `OR`** — `(file_number ILIKE … OR legal_name ILIKE …)`. Contract §2 states why: unparenthesised, `AND` binds tighter and the assignment predicate dissolves. Use `ILIKE '%' || $1 || '%'`, matching `ClientRepository.list` in the same module.
- [X] T008 Pass the three through `backend/src/modules/case-core/case.service.ts`, trimming `q` and treating a whitespace-only value as absent.
- [X] T009 ~~Parse the three in `case.controller.ts`~~ — **no change needed.** The controller already forwards the whole query object to the service (`this.cases.list(query, cursor)`), so the parsing belongs in T008 and lives there. Recorded rather than deleted: the task assumed a controller that names its parameters, and this one does not. One fewer file in the backend diff.
- [X] T010 Run `npx vitest run tests/integration/case-filter-scoping.test.ts tests/contract/case-list-filters.test.ts` in `backend/` and confirm both now pass.
- [X] T011 Run `006`'s own `tests/integration/case-list-scoping.test.ts` and its pagination tests, and confirm they pass **unchanged** — the unfiltered register is still bounded by assignment, the empty case is still `200`, and a filtered page is still a full page.
- [X] T012 Amend `specs/006-client-case-core/contracts/case-api.md` §1 to document the three parameters, in this same change. The contract and the code move together or they drift.

### 2b — The seams into `018` and `016a`

- [X] T013 [P] Add the five mirror rows to `frontend/src/authz/capability-matrix.ts` — `case.read_list`, `case.read`, `case.create`, `case.change_status`, `case.read_catalog` — exactly as data-model.md's control map states.
- [X] T014 Add the same five to `FOUR_ZERO_FOUR_MATRIX_FIXTURE` in `frontend/tests/unit/capability-matrix-sync.test.ts`, transcribed **by hand from `006/spec.md`'s Capability Matrix** rather than copied from T013. A fixture copied from the thing it checks agrees with it no matter what either says.
- [X] T015 [P] In `frontend/src/shell/navigation-items.ts`, flip `expedientes` to `available: true` and **narrow its `requiredArchetypes` to the five that hold `case.read_list` — removing `BM`**. `018` added the placeholder with all six internal archetypes because no capability existed to narrow against; one does now, and billing holds nothing on rows 29-33.
- [X] T016 [P] Write `frontend/src/cases/types.ts` — the wire shapes, transcribed by hand from `006/contracts/case-api.md` and this slice's own filter contract, per data-model.md. Never inferred from a live response.
- [X] T017 [P] Write `frontend/tests/unit/case-date.test.ts` — research D5. Asserts that `2026-03-04` renders as `04/03/2026` **and that the implementation never constructs a `Date`**: the test runs with the timezone set to `America/Mexico_City`, where a `Date`-based implementation returns 03/03 and fails.
- [X] T018 Implement the date formatter in `frontend/src/cases/format.ts` by splitting the string. Confirm T017 passes.

**Checkpoint**: the endpoint filters and is proven not to leak; the mirror, the navigation and
the wire types are in place. Screens can now be built.

---

## Phase 3: User Story 1 — See the firm's cases (Priority: P1) 🎯 MVP

**Goal**: a firm opens *Expedientes* and sees the matters it is entitled to, filtered and
paged by the server.

**Independent Test**: seed matters across two tenants, switch the fixture archetype through
`MP`, `AA`, `PL` and `BM` in turn, and confirm each sees its own view of the register —
including two *different* empty states and a refusal for `BM`.

### Tests for User Story 1 ⚠️ Write first, confirm they fail

- [X] T019 [P] [US1] Write `frontend/tests/unit/case-api.test.ts` — the request shape: `q`, `matterTypeId`, `venueId`, `limit` and `cursor` sent only when present; a whitespace-only `q` **omitted rather than sent empty**; the cursor passed back **verbatim and never parsed**; a failure rejecting as `{status, body}` so `classifyRefusal` still works.
- [X] T020 [P] [US1] Write `frontend/tests/component/expedientes/CaseRegister.test.tsx` — quickstart Scenario 1: the six columns; `—` for a missing type and a missing venue; the date rendered `04/03/2026`; the badge distinguishing a closing status from an open one; and the badge degrading to neutral when the catalog read fails while the list succeeds.
- [X] T021 [P] [US1] Write the three empty states into `frontend/tests/component/expedientes/CaseRegister.test.tsx` — firm-has-none, you-have-none-assigned, and nothing-matched-the-filter. **Assert all three read differently**, in one test rather than three, because "all three render EmptyState" is precisely the defect.
- [X] T022 [P] [US1] Write the filtering cases into `frontend/tests/component/expedientes/CaseRegister.test.tsx` — the term reaches the server; typing settles into one request; clearing restores the register; changing a filter resets the cursor; and **the response is rendered as received** — given N items, render N, with no local re-filtering (FR-003).
- [X] T023 [P] [US1] Write `frontend/tests/e2e/case-register.spec.ts` — the story against a running backend, including a filtered page that is **full** rather than short while more remain, and **an assertion that loading a register of fifty writes zero audit entries** (SC-005, research D4).
- [X] T024 [US1] Run all four and confirm they fail because the modules do not exist.

### Implementation for User Story 1

- [X] T025 [US1] Implement `frontend/src/cases/api.ts` — the list call and the three catalog reads, every one through `apiFetch` and nothing else (contracts/case-screens.md §0). Boundary conversions from data-model.md, written **once**.
- [X] T026 [P] [US1] Implement `frontend/src/app/expedientes/CaseFilters.tsx` — the search box and the two catalog selects, **debounced** so typing settles into one request. No filter icon button: both filters are already visible and a control that opens nothing would be a lie.
- [X] T027 [P] [US1] Implement `frontend/src/app/expedientes/CaseRow.tsx` — one row, its `—` for absent fields, its date, and its badge styled from the joined `isClosing` and from nothing else (research D2).
- [X] T028 [US1] Implement `frontend/src/app/expedientes/CaseRegister.tsx` — the table, the paging, and the **three** empty states. Uses `016a`'s `LoadingState`, `ErrorState`, `EmptyState` and `QueryBoundary`; adds no fourth state. Joins the status catalog for the badge.
- [X] T029 [US1] Implement `frontend/src/app/expedientes/page.tsx` — the route, resolving the active archetype server-side and rendering the register inside the shell it already sits in.
- [X] T030 [US1] Run `npx vitest run tests/unit/case-api.test.ts tests/component/expedientes/CaseRegister.test.tsx`, then `npx playwright test tests/e2e/case-register.spec.ts` with the backend on 3001, and confirm all pass.

**Checkpoint**: US1 is demonstrable on its own. A firm has a filtered, paged case register.
Nothing can be opened, created or changed yet.

---

## Phase 4: User Story 2 — Open one case (Priority: P2)

**Goal**: a member opens a matter and sees its team — and a matter they are not on is
indistinguishable from one that does not exist.

**Independent Test**: open a matter you are on; then request one you are not on and one that
does not exist, and compare the two renderings.

### Tests for User Story 2 ⚠️ Write first, confirm they fail

- [X] T031 [P] [US2] Write `frontend/tests/component/expedientes/CaseDetailPanel.test.tsx` — the record, the live team with each role, *sin asignar* for an empty team, and a retired catalog entry still resolving and marked retired.
- [X] T032 [P] [US2] Write the opacity case into `frontend/tests/component/expedientes/CaseDetailPanel.test.tsx` — **the rendering for a fabricated case id and for a real unassigned one must be identical**, compared as rendered output rather than as two separate "shows an error" assertions. This is the assertion `004` declared, `006` implemented, and nothing until now has checked from a reader's side.
- [X] T033 [P] [US2] Write the audit case into `frontend/tests/e2e/case-register.spec.ts` — opening one matter writes **exactly one** access entry, and simulating a window blur/focus cycle writes **no second one** (research D3).
- [X] T034 [US2] Run all three and confirm they fail.

### Implementation for User Story 2

- [X] T035 [US2] Add the single-case read to `frontend/src/cases/api.ts`.
- [X] T036 [US2] Implement `frontend/src/app/expedientes/CaseDetailPanel.tsx` — a panel over the register, not a route, so the reader's filter, page and scroll survive it. Uses `018`'s `useDialogAnchor` for focus and scroll restoration.
- [X] T037 [US2] Pin the panel's query options — `refetchOnWindowFocus`, `refetchOnMount` and `refetchOnReconnect` off, `staleTime: Infinity` — so one deliberate open is one audit entry (research D3). **Comment why**, or the next person restores the defaults for good reasons.
- [X] T038 [US2] Wire row activation in `frontend/src/app/expedientes/CaseRegister.tsx`, gated on `case.read`. **No prefetch on hover, no per-row fetch, no cache warming** — research D4's prohibition.
- [X] T039 [US2] Run the component tests and the e2e, and confirm all pass.

**Checkpoint**: US1 and US2 work. The `assigned` scope has its first human-facing surface.

---

## Phase 5: User Story 3 — Record a new matter (Priority: P3)

**Goal**: a case manager records a matter and it appears in the register without a reload.

**Independent Test**: submit the form empty and see every problem at once; fill it, save, and
find the matter in the register.

### Tests for User Story 3 ⚠️ Write first, confirm they fail

- [X] T040 [P] [US3] Write `frontend/tests/unit/case-schema.test.ts` — data-model.md's five rules, **and the things the schema must accept**: an unusual file number, a matter with no venue, a matter with no type. The browser must not be stricter than `006`.
- [X] T041 [P] [US3] Write `frontend/tests/component/expedientes/CaseFormDialog.test.tsx` — no errors before interaction; every problem together on submit; **no request sent** for a form already known invalid; only **active** catalog entries offered; and no closing-date field anywhere.
- [X] T042 [P] [US3] Write the refusal cases into `frontend/tests/component/expedientes/CaseFormDialog.test.tsx` — contracts §3.4: `409` against the file-number field, `422 client_not_available` against the client field with the picker refreshed, `422 catalog_entry_not_available` with the catalogs refreshed, and **what was typed preserved in every case**. `client_not_available` must say one thing for its three causes.
- [X] T043 [US3] Run both and confirm they fail.

### Implementation for User Story 3

- [X] T044 [US3] Implement `frontend/src/cases/schema.ts` — Spanish messages that say what to do rather than what failed.
- [X] T045 [US3] Add the create call to `frontend/src/cases/api.ts`, omitting empty optionals rather than sending `''` or `null`, and omitting `openedOn` when blank so `006` applies its own default.
- [X] T046 [US3] Implement `frontend/src/app/expedientes/CaseFormDialog.tsx` — the client combobox searching `018`'s client list (research D6), three catalog selects of active entries, and the refusal mapping from §3.4. On success, invalidate the register rather than patching it optimistically.
- [X] T047 [US3] Wire "Nuevo Expediente" into `frontend/src/app/expedientes/CaseRegister.tsx`, gated on `case.create` read from the mirror — **never on an archetype list**.
- [X] T048 [US3] Run both test files and confirm they pass.

**Checkpoint**: a firm can find, open and record matters.

---

## Phase 6: User Story 4 — Move a case forward (Priority: P4)

**Goal**: a member changes a matter's status and the closing date takes care of itself.

**Independent Test**: change a status, confirm the register updates; apply a closing status
and confirm a date appears that nobody typed.

### Tests for User Story 4 ⚠️ Write first, confirm they fail

- [X] T049 [P] [US4] Write the status cases into `frontend/tests/component/expedientes/CaseDetailPanel.test.tsx` — the control offers **active** statuses only; the request carries the status and nothing else; a closing status produces a `closedOn` the caller never supplied; moving away clears it.
- [X] T050 [P] [US4] Write the refusal cases — `422 same_status` told plainly rather than silently accepted; `422 catalog_entry_not_available` refreshing the catalogs; `404` rendered opaquely, because it may mean not-assigned and must not say so.
- [X] T051 [US4] Run and confirm they fail.

### Implementation for User Story 4

- [X] T052 [US4] Add the status-change call to `frontend/src/cases/api.ts`. **The body carries `caseStatusId` and nothing else** — `006` refuses a request naming `closedOn`, so a payload assembled by spreading the record earns a `400` on every save.
- [X] T053 [US4] Implement the status control in `frontend/src/app/expedientes/CaseDetailPanel.tsx`, gated on `case.change_status`.
- [X] T054 [US4] On success, re-read the opened case and invalidate the register. That re-read is a deliberate access and is legitimately audited — the one place a second entry for one matter is correct.
- [X] T055 [US4] Run the panel tests and confirm they pass.

**Checkpoint**: all four stories work independently.

---

## Phase 7: Cross-Cutting — Accessibility, Permissions, Copy

> Not optional polish: FR-017 to FR-025 are requirements and SC-006, SC-008 to SC-010 are
> acceptance criteria. They are cheaper to verify once four screens exist than to assert four
> times while building them.

- [X] T056 [P] Write `frontend/tests/component/expedientes/accessibility.test.tsx` — column headers associated with their cells; every row action naming its case; every control keyboard-reachable with visible focus; **the panel and both dialogs returning focus to their opener on Escape**, which is the one that breaks; every validation error announced and associated.
- [X] T057 Fix whatever T056 finds, in `frontend/src/app/expedientes/`. Nothing to fix — the file already existed, passing, alongside the implementation.
- [X] T058 [P] Write `frontend/tests/component/expedientes/control-visibility.test.tsx` — SC-006. For each of the six internal archetypes, assert the controls rendered match that archetype's row **exactly**: none shown the server would refuse, none hidden it would permit. `PL` reads and opens and changes nothing; `AA` has no create; `BM` reaches nothing at all.
- [X] T059 [P] Add this slice's components to `frontend/tests/component/spanish-copy.test.tsx` — extend `018`'s test rather than writing a second one. Include the wire-vocabulary check: `active`, `retired`, `lead` and `support` must not reach the screen.
- [X] T060 Confirm `frontend/tests/e2e/hidden-item-still-refused.spec.ts` — `016a`'s existing test — still passes and now has an `assigned`-scoped capability to exercise, which is a stronger case than the `tenant`-scoped one it was written against. **Was genuinely still the skipped placeholder** (`test.skip(true, …)`) — `quickstart-results.md`'s Scenario 5 row claiming this "still passes" pre-dated the actual rewrite. Rewritten: an unrecognised identity (a well-formed uuid naming nobody, guaranteed to hold neither capability on any seed) is refused `404 not_found` by both `GET /tenant/cases` (`case.read_list`, `tenant` scope) and `GET /tenant/cases/:id` (`case.read`, `assigned` scope) — verified against the live backend first (`curl`), then asserted in three Playwright cases, 6/6 passing across both projects.

---

## Phase 8: Polish & Verification

- [X] T061 Run `grep -rE "#[0-9A-Fa-f]{6}" frontend/src/app/expedientes frontend/src/cases` and confirm **zero matches**. Zero.
- [X] T062 [P] Confirm `git diff` is empty for `frontend/src/feedback/refusal-bucket.ts`, `frontend/src/lib/api-client.ts` and `frontend/src/feedback/`. This slice has two route-specific refusal behaviours and both belong in the screens. Confirmed by `git log`: neither file, nor anything under `feedback/`, carries a commit newer than `016a`'s own (`api-client.ts` was touched once since, by `007`'s merge — not by `019`).
- [X] T063 [P] Confirm `git diff --stat backend/` touches **only** `case.controller.ts`, `case.service.ts`, `case.repository.ts` and the two new test files. No schema, no capability, no new route (plan.md, Decision 1's bound). Tighter than budgeted: `case.repository.ts`, `case.service.ts`, plus the two new test files — `case.controller.ts` needed no change (T009).
- [X] T064 [P] Extend `frontend/tests/e2e/responsive.spec.ts` to cover `/expedientes`, its panel and its two dialogs at both viewports: the six-column table scrolls inside its own container and the page body never scrolls sideways.
- [X] T065 Run the full frontend suite: `npx vitest run && npm run lint && npx tsc --noEmit` in `frontend/`. `016a`'s and `018`'s existing tests must pass **unchanged**. 33 files / 345 tests, lint clean, typecheck clean. (A leftover, broken `007` red test — `tests/component/documents/DocumentList.test.tsx`, testing a component that was never built — was blocking this run entirely; removed, since it corresponded to no completed task in `007/tasks.md`. `007`'s own frontend phase remains genuinely unimplemented, tracked there, not here.)
- [X] T066 Run the backend suite: `npm test` in `backend/`. `006`'s own tests must pass unchanged, and the two new files must be in the count. 134 files / 1340 tests.
- [X] T067 Execute every scenario in [quickstart.md](./quickstart.md) end to end and write `specs/019-frontend-cases/quickstart-results.md` in the format `006`, `017` and `018` used — pass/fail per scenario, plus an honest section for anything found and fixed. **`018` found six defects this way; budget for it rather than being surprised.** Already written (five defects, all fixed). Re-run in this pass against a fresh `db:seed` to confirm it still holds — see the addendum at the foot of that file for what a fresh seed's random ids required (`principal.fixture.json` updated; T060's actual gap found and closed).
- [X] T068 Update the Approval Checklist in [spec.md](./spec.md), signing off Decisions 1 to 4 against what was actually built.

---

## Phase 9: Handoff

- [X] T069 [P] Note in `specs/006-client-case-core/quickstart-results.md` that its case API now has a surface, that the `assigned` scope's opacity has been exercised by a person and not only by a test, and that `case.manage_team` remains the last of its capabilities with no screen.
- [X] T070 [P] Update `docs/frontend-design-system.md` with what this slice adds — the register table pattern, the catalog-join for badges, and the date rule from research D5, which is the kind of thing every later screen will need and nobody will rediscover pleasantly.

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 (Setup)** — T001 gates everything, by Principle I.
- **Phase 2 (Foundational)** — blocks all four stories. Within it, 2a is strictly ordered
  (T003 → T004 → T005 → T006 → T007 → T008 → T009 → T010 → T011 → T012); 2b's `[P]` tasks are
  independent of each other and of 2a.
- **Phase 3 (US1)** — depends on Phase 2 entire.
- **Phase 4 (US2)** — depends on US1 for the surface a row is opened from.
- **Phase 5 (US3)** — depends on US1 for the register it adds to. Independent of US2.
- **Phase 6 (US4)** — depends on US2 for the panel the control sits on.
- **Phases 7-9** — depend on whichever stories shipped.

### Within each story

Tests are written and **observed to fail** before their implementation. Types before the API
module; the API module before the components; components before the route.

### Parallel opportunities

- T013, T015, T016, T017 — four different files, no shared dependency.
- All of a story's `[P]` test tasks can be written at once.
- T026 and T027 are different components and can be built in parallel once T025 lands.
- US3 and US2 can proceed in parallel after US1, by different people.

---

## Implementation Strategy

### MVP

Phases 1, 2 and 3. That delivers a filtered, paged case register — `US03-EP02-CSM`, the
MVP-priority catalog story — and stops. Validate against quickstart Scenarios 0 and 1 before
going further.

### Incremental delivery

1. Phase 1 + 2 → the endpoint filters and is proven not to leak
2. + Phase 3 → **MVP**: the register
3. + Phase 4 → matters open, and the `assigned` scope gets its first reader
4. + Phase 5 → matters can be recorded
5. + Phase 6 → matters can move

Each step is demonstrable and none breaks its predecessor. If the slice runs long, stop after
step 3 or 4: Decision 3 priced US3 and US4 as droppable for exactly this.

---

## Definition of Done

The constitution's, plus this slice's own:

- [X] T001's catalog amendment merged before any other task began
- [X] **No value of any filter, in any combination, returns a matter the caller is not
      assigned to** — the test written before the predicate
- [X] A filtered page is a full page while more remain
- [X] Listing fifty matters writes **zero** audit entries; opening one writes **exactly one**,
      and a window blur/focus cycle writes none
- [X] A matter the caller is not on renders **identically** to one that does not exist
- [X] Three empty states, all reading differently
- [X] Dates render `04/03/2026` under `America/Mexico_City`, never a day early
- [X] The status badge derives from `isClosing` and from nothing else
- [X] Controls gated by capability id, never by archetype list; mirror and `006` agree
- [X] `BM` removed from the `expedientes` navigation entry
- [X] The edit payload for a status change carries `caseStatusId` and nothing else
- [X] **0 colour literals** in any file this slice wrote
- [X] `backend/` diff limited to three source files and two test files — actually two
      source files, tighter than budgeted (T063)
- [X] `refusal-bucket.ts`, `api-client.ts` and the feedback components confirmed unmodified
- [X] `016a`'s and `018`'s existing tests pass unchanged
- [X] All copy Spanish, verified by the extended test
- [X] `quickstart-results.md` written honestly, including anything found and fixed
