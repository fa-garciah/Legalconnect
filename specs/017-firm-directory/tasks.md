---

description: "Task list for 017-firm-directory"
---

# Tasks: Firm Directory — Position & Configurable Catalogs

**Input**: Design documents from `/specs/017-firm-directory/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/directory-api.md](./contracts/directory-api.md), [quickstart.md](./quickstart.md)

**Tests**: **Included and mandatory.** Constitution v1.4.0's strict TDD. Every test task
below must be written, run, and **seen to fail** before the implementation task(s)
under it begin.

**Organization**: Grouped by user story per `spec.md`'s priority order (P1–P3). The
Capability Matrix/audit-vocabulary extension (FR-016) is Foundational, not part of any
one story, because all three stories independently need their own row to exist before
they are testable at all — the same reason 004 put its own matrix and refusal
vocabulary in Foundational rather than inside User Story 1.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story the task belongs to (US1–US3)
- Exact file paths are included in every task

## Path Conventions

Backend only — `backend/src/modules/directory/`, `backend/drizzle/`, `backend/tests/`.
No frontend change (slice 014 renders any UI, per spec.md Out of Scope).

## TDD exemptions in force

Constitution exemption 1 covers **configuration files and declarative migrations**:
`backend/drizzle/0020_directory.sql` and `0021_directory_audit_actions.sql` carry no
preceding test of their own — both are verified by test tasks that assert their
effects (T010, T011, and the RLS/grants suite in Polish).

No other exemption is claimed. `capability.ts`/`matrix.ts`/`actions.ts` are data, not
configuration, per 004's own precedent — each addition has a test written before it.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Module scaffolding and the two new Drizzle table definitions. This slice
reuses 001/002/004's entire toolchain — no new dependency.

- [X] T001 Create `backend/src/modules/directory/` with `directory.module.ts` (empty
      providers/controllers arrays to start) and register it in
      `backend/src/app.module.ts`'s `imports`. **MODIFIES a file 001 owns.**
- [X] T002 [P] Add `positionStatus` enum, `position` and `directoryEntry` table
      definitions to `backend/src/common/db/schema.ts` (data-model.md) — the functional
      unique index (research.md D6) included. **MODIFIES a file 001/002/004 share.**

**Checkpoint**: The module exists and is wired into the app; the schema compiles.
Nothing is migrated or reachable yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The three capability rows, the three audit actions, the two migrations,
and the default-seed extension every user story depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### The Capability Matrix and audit vocabulary extension (FR-016)

- [X] T003 [P] Extend `backend/tests/unit/matrix-exhaustive.test.ts` (004) — add
      `directory.assign_position`, `directory.manage_catalog` and `directory.read` to
      the exhaustive suite's row tables (`TENANT_ROWS` gains the first and third at
      `{'MP','SA'}`/all-six-internal respectively; `directory.manage_catalog` at
      `{'MP','SA'}`), asserting 0 pairs unasserted across the now-24-row registry.
      **MODIFIES a file 004 owns. Run it; see it fail.**
- [X] T004 Add the three rows to `backend/src/common/authz/capability.ts` and
      `backend/src/common/authz/matrix.ts` (data-model.md). **MODIFIES two files 004
      owns.**
- [X] T005 [P] Write `backend/tests/unit/directory-audit-actions.test.ts` — asserts
      `AUDIT_ACTIONS` contains `position.created`, `position.retired` and
      `directory.position_assigned`, and that none is in `CHANNEL_GATED_ACTIONS`. **Run
      it; see it fail.**
- [X] T006 Add the three actions to `backend/src/common/audit/actions.ts`'s
      `AUDIT_ACTIONS` and `TARGET_ENTITY_BY_ACTION` (`position` for the first two,
      `membership` for the third — the entry mutated). **MODIFIES a file 001/002 own.**

### Migrations

- [X] T007 [P] Write `backend/drizzle/0020_directory.sql` — `position` and
      `directory_entry` tables, `position_status` enum, RLS policies, grants
      (data-model.md), the functional unique index (research.md D6). Adds no column to
      any existing table. *(TDD exemption 1)*
- [X] T008 [P] Write `backend/drizzle/0021_directory_audit_actions.sql` — extends
      `audit_event_action_known` following 0017's exact `DROP`/`ADD CONSTRAINT`
      pattern, restating the full 19-action list. *(TDD exemption 1)*
- [X] T009 Run `npm run db:migrate`; confirm both apply cleanly against the existing
      schema.

### Default seed

- [X] T010 [P] Write `backend/tests/integration/directory-seed.test.ts` — a freshly
      seeded tenant's position catalog contains exactly the 5 default entries (research.md
      D2), all `active`. **Run it; see it fail.**
- [X] T011 Extend `backend/drizzle/seed.ts` to insert the 5-entry default catalog
      (Socio, Asociado Senior, Asociado, Pasante, Paralegal) for each seeded tenant.
      **MODIFIES a file 001 owns.**

**Checkpoint**: The registry, matrix, audit vocabulary and schema all carry this
slice's rows; the default seed is verified. No endpoint exists yet.

---

## Phase 3: User Story 1 - Set which position a firm member holds (Priority: P1) 🎯 MVP

**Goal**: MP/SA assigns a catalog position to a live membership; the two other
scenarios this story is graded on — cross-tenant refusal and catalog validation — hold.

**Independent Test**: Seed a live membership with no position; assign one from the
tenant's own catalog; assert exactly one directory entry now names it, audited with
actor, subject, previous and new value.

### Tests for User Story 1 ⚠️

> **NOTE: Write these FIRST, run them, and see them FAIL before implementation.**

- [ ] T012 [P] [US1] Write `backend/tests/contract/assign-position.test.ts` — the six
      acceptance scenarios of spec.md User Story 1: successful assignment + audit
      shape; refusal naming an absent catalog position (`422
      position_not_in_catalog`); cross-tenant refusal (`404`, recorded); "never
      assigned" vs. "assigned-then-retired" distinguishable on read; refusal for a
      non-MP/SA archetype (`403`); position unchanged after an unrelated archetype
      change (004). **Run it; see it fail.**
- [ ] T013 [P] [US1] Write `backend/tests/unit/directory-entry-independence.test.ts`
      (SC-009) — a pure test of the repository/service layer: changing position leaves
      a fixture archetype field untouched, and vice versa, without touching the
      database. **Run it; see it fail.**

### Implementation for User Story 1

- [ ] T014 [US1] Add `PositionNotInCatalog` (422) to `backend/src/common/http/errors.ts`,
      following the existing class shape. **MODIFIES a file 001 owns.**
- [ ] T015 [US1] Implement `backend/src/modules/directory/directory-entry.repository.ts`
      — upsert-on-first-assignment (research.md D1), and the position-validity check
      (FR-010): the named `positionId` must resolve under RLS to a row in the caller's
      own tenant's catalog (active or retired — retired is still "in the catalog," just
      not newly assignable, checked separately)
- [ ] T016 [US1] Implement `backend/src/modules/directory/directory-entry.service.ts` —
      FR-010's two-part check (exists in tenant's catalog; is `active` for a *new*
      assignment), throwing `PositionNotInCatalog` for either failure, and the
      before/after audit metadata (004/FR-009's pattern)
- [ ] T017 [US1] Implement `PATCH /tenant/directory/entries/:membershipId/position` in
      `backend/src/modules/directory/directory.controller.ts`, declaring
      `@Capability('directory.assign_position')` and
      `@Audited({ action: 'directory.position_assigned', targetEntity: 'membership' })`

**Checkpoint**: A position can be assigned, validated against the tenant's own catalog,
refused cross-tenant, and audited. This is independently shippable — 006's case-team
screen (once it exists) can already show a name and a position.

---

## Phase 4: User Story 2 - Define the firm's own set of positions (Priority: P2)

**Goal**: MP/SA adds and retires catalog entries; retirement never deletes; name
collisions among active entries are refused (research.md D6).

**Independent Test**: Add a position; assign it (Story 1); retire it; assert the
existing assignment still reads correctly and the retired position can no longer be
newly assigned.

### Tests for User Story 2 ⚠️

- [ ] T018 [P] [US2] Write `backend/tests/contract/position-catalog.test.ts` — the five
      acceptance scenarios of spec.md User Story 2, plus the two D6 collision cases
      from quickstart.md Scenario 2 (duplicate active name refused with `409`; the same
      name succeeds after the original is retired). **Run it; see it fail.**
- [ ] T019 [P] [US2] Write `backend/tests/unit/position-name-collision.test.ts` — the
      collision predicate in isolation: case- and whitespace-insensitive match against
      *active* entries only, never against retired ones. **Run it; see it fail.**

### Implementation for User Story 2

- [ ] T020 [US2] Add `PositionAlreadyExists` (409) and reuse the existing
      `AlreadyRevoked`-shaped pattern for an already-retired position
      (`PositionAlreadyRetired`, 409) to `backend/src/common/http/errors.ts`.
      **MODIFIES a file 001 owns.**
- [ ] T021 [US2] Implement `backend/src/modules/directory/position.repository.ts` —
      create, retire, list-including-retired, all RLS-scoped by construction (no
      hand-written tenant filter, per 001's own discipline)
- [ ] T022 [US2] Implement `backend/src/modules/directory/position.service.ts` —
      research.md D6's collision check ahead of insert (the unique index is the
      backstop, not the primary UX; a friendly `409` beats a raw constraint-violation
      500, the same pattern 001's RFC uniqueness uses)
- [ ] T023 [US2] Implement `POST /tenant/directory/positions`,
      `PATCH /tenant/directory/positions/:id/retire` and
      `GET /tenant/directory/positions` in `position.controller.ts`
      (`backend/src/modules/directory/`), declaring `@Capability('directory.
      manage_catalog')` on the first two and `@Capability('directory.read')` on the
      list route, with `@Audited` on the first two per T006's actions

**Checkpoint**: The catalog is fully CRUD-able (create/retire/list), isolated per
tenant, and Story 1's assignment now has a real catalog to validate against beyond the
seed.

---

## Phase 5: User Story 3 - Browse the firm's own directory (Priority: P3)

**Goal**: Every internal archetype reads their own tenant's live memberships with
position; portal archetypes and `PO` are refused; results are paginated.

**Independent Test**: Seed two tenants with distinct members and positions; read the
directory as a member of tenant A; assert every entry belongs to tenant A and none to
tenant B.

### Tests for User Story 3 ⚠️

- [ ] T024 [P] [US3] Write `backend/tests/contract/directory-read.test.ts` — the five
      acceptance scenarios of spec.md User Story 3: every internal archetype reads
      successfully with 0 foreign-tenant entries; a revoked membership absent from the
      listing; each of the four portal archetypes refused individually (mirroring
      004/SC-004's method); `PO` refused; pagination returns a bounded first page with
      a `nextCursor` over a seeded large tenant. **Run it; see it fail.**

### Implementation for User Story 3

- [ ] T025 [US3] Implement the `LEFT JOIN membership -> directory_entry -> position`
      query in `directory-entry.repository.ts` (extends T015), filtered to
      `membership.status = 'live'`, using `common/http/pagination.ts` verbatim (FR-013)
- [ ] T026 [US3] Implement `GET /tenant/directory` in `directory.controller.ts`,
      declaring `@Capability('directory.read')`

**Checkpoint**: All three user stories are independently functional. 006/007/013 have a
real read capability to consume.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: The grant audit extension, the inherited-suite guarantee, and the
documentation this slice's planning surfaced.

- [ ] T027 Extend `backend/tests/integration/grants-lockdown.test.ts` (004's T061
      pattern) with `position`/`directory_entry` assertions: `lc_app` holds exactly
      `SELECT, INSERT, UPDATE` on each, never `DELETE` (FR-004/FR-007's "never
      hard-deleted" as an absent grant)
- [ ] T028 Add `US11-EP10-CFG-AssignMemberPosition`, `US12-EP10-CFG-
      DefinePositionCatalog` and `US13-EP10-CFG-ViewFirmDirectory` to
      `specs/master-user-story-catalog.md`'s EP10-CFG table (Principle I) — reconcile
      the resulting EP10-CFG count against the catalogue's actual current state, per
      spec.md's own Approval Checklist note, not this document's arithmetic
- [ ] T029 Run `npm run test:isolation && npm run test:rls && npm run verify:role &&
      npm run test:contract` — confirm 001/002/004's suites pass unedited; `git diff
      --stat backend/drizzle/0006_grants.sql` empty
- [ ] T030 Run `npm test -- --coverage`; confirm `src/common/tenant/**`,
      `src/common/audit/**` and `src/common/authz/**` remain at 100%
- [ ] T031 [P] Execute every scenario in [quickstart.md](./quickstart.md) end to end and
      record results in `specs/017-firm-directory/quickstart-results.md`, following
      004's format
- [ ] T032 [P] Update `specs/017-firm-directory/spec.md`'s Approval Checklist — tick
      *Every requirement is test-verifiable* once T030 passes, leaving approval itself
      for the technical lead

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately
- **Foundational (Phase 2)**: depends on Setup — **BLOCKS every user story**
- **US1 (Phase 3)**: depends on Foundational only
- **US2 (Phase 4)**: depends on Foundational only — independent of US1, though its
  *quickstart* narrative (add → assign → retire) references US1 for a fuller story,
  its own acceptance scenarios do not require an assignment to exist first
- **US3 (Phase 5)**: depends on Foundational only for its own capability row; its read
  query naturally becomes more meaningful once US1/US2 exist, but is independently
  testable against directory entries seeded directly, per its own Independent Test
- **Polish (Phase 6)**: depends on all three stories

### User Story Dependencies

```
Setup ──> Foundational ──┬──> US1 (P1) ──────────────────> (independent)
                         ├──> US2 (P2) ──────────────────> (independent)
                         └──> US3 (P3) ──────────────────> (independent)
```

All three stories are genuinely parallel after Foundational — none edits a file another
one owns (US1 owns `directory-entry.*`, US2 owns `position.*`, US3 extends US1's
repository with one additional query method rather than a shared file both write to
concurrently — sequence US3 after US1 if worked by the same developer, in parallel
otherwise).

### Parallel Opportunities

- **T003, T005, T007, T008, T010** — five independent Foundational test/migration files
- **T012, T013** — US1's two test files
- **T018, T019** — US2's two test files
- **T027–T032** — Polish tasks, mostly independent

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1: Setup — T001–T002
2. Phase 2: Foundational — T003–T011 **(CRITICAL, blocks everything)**
3. Phase 3: User Story 1 — T012–T017
4. **STOP and VALIDATE**: a position can be assigned, validated, refused cross-tenant,
   and audited — the minimum 006 needs to stop rendering bare membership IDs
5. This increment needs Story 2's catalog to have *something* to assign beyond the
   seed, but the seed alone (Foundational) is enough to validate the mechanism

### Incremental Delivery

1. Setup + Foundational → registry, matrix, audit vocabulary, schema, seed all exist
2. **US1** → assignment works against the seeded catalog **(MVP)**
3. **US2** → the catalog becomes fully editable, not just seeded
4. **US3** → the read path 006/007/013 actually consume
5. Polish → grant audit, inherited-suite guarantee, catalogue entry

### Parallel Team Strategy

With three developers, after Foundational: one per story (US1, US2, US3) — none shares
a file with another, so all three proceed genuinely in parallel.

---

## Notes

- `[P]` tasks = different files, no dependencies
- `[Story]` label maps each task to a spec.md user story for traceability
- **Verify tests fail before implementing** — the constitution requires the PR history
  to evidence it
- Commit after each task or logical group
- T009 and T029/T030 are **verification-heavy** tasks whose primary output is a
  confirmed result, the same shape 004's T040/T060/T063 took
