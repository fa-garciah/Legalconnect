---

description: "Task list for 016a-frontend-shell"
---

# Tasks: Frontend Application Shell

**Input**: Design documents from `/specs/016a-frontend-shell/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/feedback-states.md](./contracts/feedback-states.md), [quickstart.md](./quickstart.md)

**Tests**: **Included and mandatory.** Constitution v1.4.0 makes strict TDD non-negotiable
for everything except configuration, tool-generated code, disposable spikes, and purely
visual work (styles/copy/layout with no logic) — TDD exemption 4. The archetype filter,
the tenant switch, and the three feedback states' logic do not qualify for that
exemption. Every test task below must be written, run, and **seen to fail** before the
implementation task(s) under it begin.

**Organization**: Grouped by user story so each can be implemented, tested and delivered
independently, following `spec.md`'s own priority order (P1–P5). The one deliberate
exception: `QueryBoundary` and its three feedback-state primitives ship in Foundational,
not in User Story 3/4/5 alone, because `spec.md`'s own User Story 2 acceptance scenario
(FR-012) says "refused through the same generic error state any other refusal uses (see
Story 4)" — the mechanism must exist before Story 2 is independently testable. Stories 3,
4 and 5 each **refine** what Foundational ships, the same pattern `004-authorization-
entitlements` used for its `decide.ts`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story the task belongs to (US1–US5)
- Exact file paths are included in every task

## Path Conventions

Web application, frontend only for this slice (no backend changes — every read this
slice performs already exists). Paths follow the structure decision in
[plan.md](./plan.md): `frontend/src/`, `frontend/tests/`. `frontend/` does not exist yet;
Phase 1 creates it.

## TDD exemptions in force

Constitution exemption 4 covers **purely visual adjustments without logic**:
`frontend/tailwind.config.ts`, the Tailwind class lists inside components, and the
Spanish copy string literals themselves. Configuration files (exemption 1) cover
`vitest.config.ts`, `playwright.config.ts`, `tsconfig.json`, `.eslintrc`. No other
exemption is claimed — in particular `refusal-bucket.ts`, `capability-matrix.ts`,
`navigation-items.ts`'s filter function, `active-tenant.ts` and `QueryBoundary`'s state
selection are logic, each with a test written before it.

---

## Phase 1: Setup (Project Initialization)

**Purpose**: Stand up `frontend/` as its own Node project, sibling to `backend/`. No
later slice screen exists yet, so this is scaffolding only.

- [X] T001 Create `frontend/` at the repository root; initialize a Next.js 14+ (App
      Router) + TypeScript + Tailwind project (`package.json`, `tsconfig.json`,
      `next.config.js`, `tailwind.config.ts`) — no monorepo tool, matching `backend/`'s
      own standalone `package.json` (plan.md, Structure Decision)
- [X] T002 [P] Add `@tanstack/react-query` and `@tanstack/eslint-plugin-query` to
      `frontend/package.json`
- [X] T003 [P] Configure Vitest + React Testing Library in `frontend/vitest.config.ts`
      and `frontend/tests/setup.ts` *(TDD exemption 1: configuration)*
- [X] T004 [P] Configure Playwright in `frontend/playwright.config.ts`, with `desktop`
      and `mobile` projects for SC-011 *(TDD exemption 1)*
- [X] T005 [P] Configure ESLint (`frontend/eslint.config.mjs`) with
      `@tanstack/eslint-plugin-query`'s recommended rules — the unstable-query-key lint
      contracts/feedback-states.md §4 names — and Prettier, matching `backend/`'s tooling
      shape *(TDD exemption 1)*
- [X] T006 [P] Add `frontend/` to the repository root `.gitignore` entries for
      `node_modules/`, `.next/`, `test-results/`, `playwright-report/`

**Checkpoint**: `frontend/` builds and runs (`npm run dev`) with an empty root page. No
shell, no navigation, no data fetching yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The session seam, the active-tenant seam, the API client, and the three
feedback-state primitives every user story either consumes or refines. No user story
acceptance scenario is asserted yet — this phase builds what makes them assertable.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete. In
particular, US2's FR-012 and every later story's error-handling scenarios depend on
`QueryBoundary`/`ErrorState`/`refusal-bucket.ts` existing here, even though their full
distinguishable-bucket behaviour is completed by US4.

### The session and tenant seams

- [X] T007 [P] Write `frontend/tests/unit/principal.test.ts` — `getPrincipal()` returns
      the fixture's identity and memberships unchanged; the shape matches `Principal`
      (data-model.md). **Run it; see it fail.**
- [X] T008 Implement `frontend/src/session/principal.ts` and
      `frontend/src/session/principal.fixture.json` (research.md D5) — one function, one
      return shape, replaceable wholesale by slice 003
- [X] T009 [P] Write `frontend/tests/unit/active-tenant.test.ts` — reading with no cookie
      set returns `{ status: 'none' }`; writing then reading round-trips a tenant id;
      writing is visible to a fresh read (no in-memory-only cache). **Run it; see it
      fail.**
- [X] T010 Implement `frontend/src/session/active-tenant.ts` (research.md D2,
      data-model.md `ActiveTenant`) — cookie read/write, server- and client-readable

### The refusal vocabulary and the feedback-state primitives

- [X] T011 [P] Write `frontend/tests/unit/refusal-bucket.test.ts` — `404 not_found` and
      `403 mfa_enrollment_required` both classify `opaque`; a network failure (no
      response) classifies `opaque` with no capability/limit fields; `403 not_authorized`
      classifies `role`. *(US4 adds the `entitlement-*` cases — see T029.)* **Run it; see
      it fail.**
- [X] T012 Implement `frontend/src/feedback/refusal-bucket.ts` (research.md D3,
      data-model.md `RefusalBucket`/`ClassifiedRefusal`) — the `opaque`/`role` cases only
      at this phase; a code comment names research.md D3 for the `mfa_enrollment_required`
      override and the not-yet-reachable `scope` bucket
- [X] T013 [P] Write `frontend/tests/unit/api-client.test.ts` — every request attaches
      `x-identity-id` and, when an active tenant exists, `x-tenant-id`; a failed response
      is surfaced as `{ status, code, body }`, never thrown as an opaque `Error` losing
      the wire shape `refusal-bucket.ts` needs. **Run it; see it fail.**
- [X] T014 Implement `frontend/src/lib/api-client.ts` — the fetch wrapper contracts/
      feedback-states.md's `QueryBoundary` sits on top of, reading `getPrincipal()` and
      `active-tenant.ts` for the two headers
- [X] T015 [P] Write `frontend/tests/component/QueryBoundary.test.tsx` — a `pending`
      query with `data-model.md`'s 120ms minimum display duration not yet elapsed renders
      nothing; past it, renders `LoadingState`; an `error` result renders `ErrorState`
      with the classified bucket; a `success` result with `isEmpty(data)` true renders
      `EmptyState`; a `success` result with `isEmpty` false (or omitted) renders children;
      exactly one of the four, never two (FR-019). **Run it; see it fail.**
- [X] T016 Implement `frontend/src/feedback/QueryBoundary.tsx`,
      `frontend/src/feedback/LoadingState.tsx`, `frontend/src/feedback/EmptyState.tsx` and
      `frontend/src/feedback/ErrorState.tsx` (contracts/feedback-states.md §1–§3,
      research.md D4's two timers) — `ErrorState` renders only the `opaque`/`role` copy
      table rows at this phase
- [X] T017 Wire `QueryClientProvider` (`@tanstack/react-query`) into
      `frontend/src/app/layout.tsx`, with the 10-second request timeout (research.md D4)
      configured as the client's default

### The navigation registry and capability matrix mirror

- [X] T018 [P] Write `frontend/tests/unit/capability-matrix-sync.test.ts` — a
      hand-transcribed fixture of `004/spec.md`'s Capability Matrix table compared row by
      row against `capability-matrix.ts`; deliberately mutate one row in the test's own
      local copy and assert the test fails, naming the row. **Run it; see it fail.**
- [X] T019 Implement `frontend/src/authz/capability-matrix.ts` (research.md D1) — the
      rows this shell's own navigation items reference, initially none (Phase 3 adds the
      first)
- [X] T020 [P] Write `frontend/tests/unit/navigation-items.test.ts` — filtering a fixed
      `NavigationItem[]` by a given archetype returns items with no `requiredArchetypes`
      plus items whose list includes that archetype, and no others. **Run it; see it
      fail.**
- [X] T021 Implement `frontend/src/shell/navigation-items.ts` (data-model.md
      `NavigationItem`) and its filter function — the registry array starts empty; US1
      adds no real screens either (out of scope), so this phase ships the mechanism, not
      content

**Checkpoint**: The session seam, the active-tenant seam, the API client, `QueryBoundary`
and its three primitives (opaque/role-only error copy), and the navigation registry
mechanism all exist and are tested. Nothing renders a screen yet.

---

## Phase 3: User Story 1 - Move between modules through one consistent shell (Priority: P1) 🎯 MVP

**Goal**: A header and menu are present on every screen, filtered by archetype, and
selecting an item changes only the content region.

**Independent Test**: Render the shell with a mocked principal and a small fixed set of
navigation items, some archetype-gated. Assert the permitted items render, the others
don't, and selecting a permitted item swaps the content region without leaving the shell.

### Tests for User Story 1 ⚠️

> **NOTE: Write these FIRST, run them, and see them FAIL before implementation.**

- [X] T022 [P] [US1] Write `frontend/tests/component/NavigationMenu.test.tsx` — an item
      with no `requiredArchetypes` renders for every archetype tested; an item requiring
      `['SA']` renders only when the active membership's archetype is `SA`; SC-001/SC-002
      asserted across a small archetype/item matrix, not a single pair
- [X] T023 [P] [US1] Write `frontend/tests/component/Shell.test.tsx` — header and menu
      are present on render; selecting a visible item changes the content region while
      the header and menu DOM nodes are unchanged (assert by reference/identity, not
      re-render); with `ActiveTenant.status === 'none'`, zero navigation items render and
      a directive to establish a tenant renders instead (FR-007)
- [X] T024 [P] [US1] Write `frontend/tests/e2e/shell-render.spec.ts` — the full shell
      renders in a real browser with a fixture principal; a navigation item selection
      updates the URL and the content region

### Implementation for User Story 1

- [X] T025 [US1] Implement `frontend/src/shell/NavigationMenu.tsx` — reads
      `navigation-items.ts`, filters via `T021`'s function against the active
      membership's archetype (FR-002 to FR-004)
- [X] T026 [US1] Implement `frontend/src/shell/Header.tsx` — minimal at this phase (no
      tenant name/switch yet — US2 extends it); present on every screen
- [X] T027 [US1] Wire `NavigationMenu` and `Header` into
      `frontend/src/app/layout.tsx`, around `{children}` as the content region (FR-001,
      FR-006)
- [X] T028 [US1] Implement the no-active-tenant directive in
      `frontend/src/app/page.tsx` — with `ActiveTenant.status === 'none'`, render the
      "establish a tenant" state instead of the menu (FR-007); redirect into the active
      tenant's default landing otherwise

**Checkpoint**: The shell renders, filters by archetype, and selection swaps only the
content region. This is a genuinely shippable increment — every later screen renders
inside what this phase built.

---

## Phase 4: User Story 2 - Know the active firm, and switch it when holding more than one (Priority: P2)

**Goal**: The header names the active tenant; a switch control appears only when the
identity holds more than one live membership; switching invokes 002's own per-request
verification rather than a client-side shortcut.

**Independent Test**: Seed a mocked identity with two live memberships, render the
shell, assert the header names the active one, switch, and assert the header and content
both update with zero records from the previous tenant visible.

### Tests for User Story 2 ⚠️

- [X] T029 [P] [US2] Write `frontend/tests/component/TenantSwitcher.test.tsx` — a
      principal with 2 memberships renders a switch control listing both tenant names; a
      principal with exactly 1 renders no control (FR-010, SC-008); selecting a tenant
      calls the active-tenant write and invalidates every non-`principal` query key
      (contracts/feedback-states.md §5). **Run it; see it fail.**
- [X] T030 [P] [US2] Write `frontend/tests/component/Header.test.tsx` — the header names
      the active tenant whenever `ActiveTenant.status === 'active'` (FR-008). **Run it;
      see it fail.**
- [X] T031 [P] [US2] Write `frontend/tests/e2e/tenant-switch.spec.ts` — switching
      reflects in the header and a tenant-scoped content region within 2 seconds
      (SC-007), with 0 records from the previous tenant visible; attempting (by direct
      API call, bypassing the UI list) a tenant id the identity holds no membership in
      renders the opaque bucket (SC-009), byte-identical to Scenario 4's not-found case

### Implementation for User Story 2

- [X] T032 [US2] Implement `frontend/src/shell/TenantSwitcher.tsx` — lists
      `getPrincipal().memberships`, writes the selection via `active-tenant.ts`,
      invalidates queries per contracts/feedback-states.md §5 (research.md D2)
- [X] T033 [US2] Extend `frontend/src/shell/Header.tsx` (built in US1, T026) to display
      the active tenant's name and mount `TenantSwitcher` only when
      `memberships.length > 1` (FR-008 to FR-010). **MODIFIES a file US1 owns.**
- [X] T034 [US2] Ensure every tenant-scoped query built so far includes the active
      tenant id in its query key, per contracts/feedback-states.md §5's obligation — audit
      `api-client.ts` call sites added in this phase

**Checkpoint**: The header always shows the active tenant, offers a switch only when
meaningful, and a switch fully replaces tenant-scoped content. An invalid selection
refuses through the same opaque bucket Phase 2 already built.

---

## Phase 5: User Story 3 - See that content is loading, not stuck (Priority: P3)

**Goal**: Prove the loading half of `QueryBoundary` (built in Foundational) thoroughly:
no flash on the fast path, no indefinite spinner on the slow path, independent regions
don't hold each other back.

**Independent Test**: Simulate a delayed response for a region; assert a loading
indicator appears before the response arrives and is replaced once it does, never left
standing.

**Note on scope**: `QueryBoundary`'s loading branch and research.md D4's two timers
already exist (T016, T017). This phase is predominantly **proof**, the same shape
004's own User Story 2 took against its already-wired matrix.

### Tests for User Story 3 ⚠️

- [X] T035 [P] [US3] Write `frontend/tests/component/loading-thresholds.test.tsx` — a
      query resolving in <120ms never mounts `LoadingState`; one resolving in 2s shows it
      for the duration and replaces it exactly once; one still `pending` at 10s
      transitions to `ErrorState` (opaque bucket). **Run it; see it fail — this exercises
      timing paths T016 did not yet have a dedicated test for.**
- [X] T036 [P] [US3] Write `frontend/tests/component/independent-regions.test.tsx` — two
      `QueryBoundary`-wrapped regions on one screen, one resolving before the other; the
      resolved region shows its own state while the other still shows loading. **Run it;
      see it fail.**

### Implementation for User Story 3

- [X] T037 [US3] If either test above finds a gap in `QueryBoundary`'s timer wiring
      (T016), fix it here. **Expected: no implementation change — this phase is proof
      that Foundational's mechanism already satisfies US3.**

**Checkpoint**: Loading behaves correctly under both the fast-path and slow-path timing
constraints, independently per region.

---

## Phase 6: User Story 4 - Say what can safely be said, and nothing else, when a request fails (Priority: P4)

**Goal**: Complete the error-state copy table — `role` already ships from Foundational;
this phase adds the two `entitlement-*` buckets and proves retry and freshness.

**Independent Test**: Simulate, for the same region: (a) a not-found and a cross-tenant
refusal, assert identical rendering; (b) permission/scope/entitlement refusals, assert
distinct remedy-specific copy; (c) an `mfa_not_enrolled` refusal, assert it renders in
the opaque bucket.

### Tests for User Story 4 ⚠️

- [X] T038 [P] [US4] Extend `frontend/tests/unit/refusal-bucket.test.ts` (T011) —
      `403 entitlement_required` classifies `entitlement-feature` and carries the
      `capability` field from the body; `403 limit_reached` classifies `entitlement-limit`
      and carries `{ key, value }`; the two are distinguishable from `role` and from each
      other. **Run it; see it fail.**
- [X] T039 [P] [US4] Write `frontend/tests/component/ErrorState.test.tsx` — each of the
      four buckets' example copy (contracts/feedback-states.md §3) renders distinctly;
      `not_found` and a simulated cross-tenant refusal (same wire shape) render
      byte-identical output (SC-005); retry calls the query's own `refetch` (spy),
      never a newly constructed request (contracts/feedback-states.md §4). **Run it; see
      it fail.**
- [X] T040 [P] [US4] Write `frontend/tests/e2e/error-freshness.spec.ts` — an errored
      region, when the person navigates away and back, issues a fresh request rather than
      redisplaying the stale error (spec.md User Story 4, scenario 9)

### Implementation for User Story 4

- [X] T041 [US4] Extend `frontend/src/feedback/refusal-bucket.ts` (T012) with the
      `entitlement-feature` and `entitlement-limit` cases. **MODIFIES a file Foundational
      owns.**
- [X] T042 [US4] Extend `frontend/src/feedback/ErrorState.tsx` (T016) with the two
      `entitlement-*` copy rows from contracts/feedback-states.md §3. **MODIFIES a file
      Foundational owns.**
- [X] T043 [US4] Confirm `QueryBoundary`'s query-key scoping (React Query's own
      per-key cache) already gives fresh-on-remount for free; if T040 finds otherwise, fix
      `QueryBoundary.tsx`'s stale-time configuration

**Checkpoint**: All four error buckets render distinct, correct copy; retry and
navigate-away freshness both hold. The one bucket this phase does **not** complete is
`scope` — research.md D3 records why, and it remains a documented gap, not a task here.

---

## Phase 7: User Story 5 - See a clear empty state when there's simply nothing there yet (Priority: P5)

**Goal**: Complete `EmptyState`'s guidance-text behaviour and prove visual
distinguishability from loading and error.

**Independent Test**: Simulate a successful response carrying zero records; assert the
empty state renders, is visually distinguishable from loading and error, and offers
guidance when a next action exists.

### Tests for User Story 5 ⚠️

- [X] T044 [P] [US5] Write `frontend/tests/component/EmptyState.test.tsx` — a
      `guidance` prop renders its text; its absence renders no fabricated call-to-action
      (FR-018); a filtered-view caller can pass guidance reflecting the filter rather than
      an unqualified "no data" claim (spec.md scenario 5). **Run it; see it fail.**
- [X] T045 [P] [US5] Write `frontend/tests/e2e/three-states-distinguishable.spec.ts` —
      screenshot-diff (or DOM-structure assertion) proving loading, error and empty are
      visually distinguishable from one another for the same region (SC-006, SC-012)

### Implementation for User Story 5

- [X] T046 [US5] Extend `frontend/src/feedback/EmptyState.tsx` (T016) with the
      `guidance` prop contracts/feedback-states.md §2 and data-model.md's `RegionState`
      already specify. **MODIFIES a file Foundational owns.**

**Checkpoint**: All five user stories are independently functional. Every feedback state
is complete.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: The catalogue addition, the capability-matrix build gate verified by hand,
the responsive proof, the cosmetic-hide guarantee, and the documentation this slice's
planning surfaced.

- [X] T047 Add `US17-EP00-FND-NavigateApplicationShell`, `US18-EP00-FND-SeeLoadingState`,
      `US19-EP00-FND-SeeErrorState` and `US20-EP00-FND-SeeEmptyState` to
      `specs/master-user-story-catalog.md`'s EP00 table (Principle I) — spec.md's
      Approval Checklist flags the exact resulting count as needing reconciliation
      against the catalogue's actual current state, not the spec's own possibly-stale
      arithmetic
- [X] T048 [P] Write `frontend/tests/e2e/hidden-item-still-refused.spec.ts` (SC-014,
      FR-027) — a principal lacking the archetype for a navigation item does not see it
      rendered; a direct API call to that item's underlying route (bypassing the UI
      entirely) is refused by 004's decision function, identically to an unhidden item
- [X] T049 [P] Write `frontend/tests/e2e/responsive.spec.ts` (SC-011) — every control in
      the shell is reachable and usable at both the `desktop` and `mobile` Playwright
      projects configured in T004
- [X] T050 [P] Write `frontend/tests/component/spanish-copy.test.tsx` (SC-010) — every
      string literal rendered by `Header`, `NavigationMenu`, `LoadingState`,
      `ErrorState` and `EmptyState` is asserted against a small allow-list of expected
      Spanish strings; the test fails on any string outside it, catching an accidental
      English fallback
- [X] T051 Run `npx tsc --noEmit` in `frontend/`; fix any error before this slice closes
- [X] T052 [P] Execute every scenario in [quickstart.md](./quickstart.md) end to end and
      record the results in `specs/016a-frontend-shell/quickstart-results.md`, following
      004's format
- [X] T053 [P] Update `specs/016a-frontend-shell/spec.md`'s Approval Checklist — tick
      *No implementation or technology detail in this document* (it is a spec, plan.md
      carries the stack) and *Every requirement is test-verifiable* once T052 passes,
      leaving *Approved by Cosmic Chimps technical lead* for the lead
- [X] T054 Flag, for the CC technical lead, `004`'s Out of Scope note naming "a separate
      frontend slice (014)" for permission-derived navigation, per this slice's own
      Revision Note and spec.md's Approval Checklist — no file change, a reviewer-routed
      item exactly like 004's own Decision 5 was before it was actioned

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately
- **Foundational (Phase 2)**: depends on Setup — **BLOCKS every user story**
- **US1 (Phase 3)**: depends on Foundational only
- **US2 (Phase 4)**: depends on US1 for `Header.tsx` to extend (T033 modifies T026)
- **US3 (Phase 5)**: depends on Foundational's `QueryBoundary` (T016) — independent of
  US1/US2 otherwise
- **US4 (Phase 6)**: depends on Foundational's `refusal-bucket.ts`/`ErrorState.tsx`
  (T012, T016) — independent of US1/US2/US3 otherwise
- **US5 (Phase 7)**: depends on Foundational's `EmptyState.tsx` (T016) — independent of
  US1–US4 otherwise
- **Polish (Phase 8)**: depends on all five stories

### User Story Dependencies

```
Setup ──> Foundational ──┬──> US1 (P1) ──> US2 (P2)
                         ├──> US3 (P3)  ────────────────> (independent of US1/US2)
                         ├──> US4 (P4)  ────────────────> (independent of US1/US2/US3)
                         └──> US5 (P5)  ────────────────> (independent of US1–US4)
```

**US2 is the one story with a real predecessor** — it extends `Header.tsx`, which US1
creates. US3, US4 and US5 each refine a Foundational file directly and do not depend on
US1's or US2's own files.

### Within Each User Story

- Tests MUST be written and **seen to fail** before implementation — constitution, strict
  TDD
- Types and data before the functions that read them
- Pure functions (`refusal-bucket.ts`, filter functions) before the components that call
  them

### Parallel Opportunities

- **T002–T006** — Setup, five independent configuration tasks
- **T007, T009, T011, T013, T015, T018, T020** — seven independent test files, the
  whole test-first half of Foundational, writable simultaneously
- **T022–T024** — US1's three test files
- **T029–T031** — US2's three test files
- **T035, T036** — US3's two test files
- **T038–T040** — US4's three test files
- **T044, T045** — US5's two test files
- **T048–T050, T052, T053** — five independent Polish tasks

**Not parallel, despite appearances**: T026 → T033 both edit `Header.tsx`; T012 → T041
both edit `refusal-bucket.ts`; T016 → T042/T046 both edit `ErrorState.tsx`/
`EmptyState.tsx`. Each pair must run in that order.

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1: Setup — T001–T006
2. Phase 2: Foundational — T007–T021 **(CRITICAL, blocks everything)**
3. Phase 3: User Story 1 — T022–T028
4. **STOP and VALIDATE**: the shell renders on every route, filters by archetype, and
   selecting an item changes only the content region
5. This is a genuinely shippable increment: every later slice's screen has somewhere to
   render, even before US2–US5 land

### Incremental Delivery

1. Setup + Foundational → the session/tenant seams, the API client, and the three
   feedback-state primitives (opaque/role-only) exist
2. **US1** → the shell itself **(MVP)**
3. **US2** → tenant context and switching
4. **US3** → loading proven under both timing constraints
5. **US4** → the full error-copy table, retry and freshness proven
6. **US5** → empty-state guidance and visual distinguishability proven
7. Polish → catalogue entry, responsive proof, cosmetic-hide guarantee, documentation

### Parallel Team Strategy

With two developers, after Foundational:

- **Developer A**: US1 → US2 — the shell/tenant spine, serialised (US2 extends US1's
  `Header.tsx`)
- **Developer B**: US3 → US4 → US5 — the feedback-state refinements, each touching a
  different Foundational file, none touching `Header.tsx`

Neither developer blocks the other after Foundational completes.

---

## Notes

- `[P]` tasks = different files, no dependencies
- `[Story]` label maps each task to a spec.md user story for traceability
- **Verify tests fail before implementing** — the constitution requires the PR history to
  evidence it, not merely the final state
- Commit after each task or logical group
- **One file carries disproportionate risk**: `ErrorState.tsx` / `refusal-bucket.ts`,
  because three tasks across three phases (T012/T016, T041/T042) edit them in sequence,
  and because research.md D3 already documents a real, unresolved gap (the `scope`
  bucket) that a future reader could mistake for an oversight rather than a recorded
  decision
- T037 and T043 are **verification-only and may change no file** — like 004's T040/T060,
  they are tasks rather than notes because their result (Foundational's mechanism already
  satisfies the later story, or it doesn't) must be recorded before the slice closes
