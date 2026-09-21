---

description: "Task list for 005-session-lifecycle"
---

# Tasks: Session Lifecycle — Expiry, Sign-Out, Revocation & Step-Up MFA

**Input**: Design documents from `/specs/005-session-lifecycle/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: **Included and mandatory.** Constitution v1.5.0 makes strict TDD non-negotiable and names
"authentication and sessions" a blocking, non-negotiable coverage path. Every test task must be
written, run, and **seen to fail** before the implementation task(s) under it begin.

**Organization**: Grouped by user story. Story numbers follow `spec.md`'s own numbering — US1 =
`US08-EP12-ASC-SignOut` (P1), US2 = `US12-EP12-ASC-StepUpForSensitiveOperation` (P2), US3 =
`US07-EP12-ASC-ExpireIdleSession` (P3), US4 = `US11-EP12-ASC-RevokeSessionsOnDeactivation` (P4).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story the task belongs to (US1–US4)
- Exact file paths are included in every task

## Path Conventions

Backend only — `backend/src/`, `backend/drizzle/`, `backend/tests/`. No frontend directory: this
slice ships no screen (plan.md, Project Type). This slice modifies files owned by `003` and `004` —
each such task says so explicitly.

## TDD exemptions in force

Constitution exemption 1 covers declarative migrations, so tasks touching `backend/drizzle/*.sql`
carry no preceding test of their own; they are verified by the lockdown tasks at the end of Phase 2
and by every story-phase test that exercises the schema.

## Blocking item carried from plan.md — not resolvable by any task below

**`spec.md` Assumption D3 needs an explicit owner's sign-off before `/speckit-implement` completes.**
`research.md` D7 confirms the technical premise (sessions really are tenant-global, `001`'s
refusal-at-activation really is per-request); confirming the premise is not the same as confirming
the decision. No task in Phase 6 (US4) is blocked by this — they test what already exists — but the
plan as a whole should not be considered mergeable until this is closed. See plan.md, Open Items.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Directory scaffolding only. No new dependency, no new environment variable — this
slice reuses `001`–`004`'s toolchain entirely (plan.md, Technical Context).

- [X] T001 Create `backend/tests/integration/` files' parent directories if absent (none new — `integration/` and `unit/` already exist from prior slices); confirm `backend/tests/helpers/auth-seed.ts` and `backend/tests/helpers/tenants.ts` are importable as-is, since this slice's tests reuse both rather than adding new fixtures
- [X] T002 Confirm `backend/tests/integration/no-new-dependency.test.ts`'s `BASELINE_DEPENDENCIES` needs **no edit** — this slice adds zero npm packages (plan.md, Primary Dependencies) — and record that confirmation in the PR description rather than editing a passing test

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Two new `session` columns, one new table, five new-or-widened functions, three new
audit actions, and the two `common/auth/` file changes every story stands on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete. T003–T006 in particular
gate everything — a `last_seen_at` write that happens even one line too early (before the
idle/absolute check, not after) silently defeats the idle limit for good, per `research.md` D2.

### Schema, grants and the functions (TDD exemption 1)

- [X] T003 Add `last_seen_at timestamptz NOT NULL DEFAULT now()` and `family_created_at timestamptz NOT NULL DEFAULT now()` to `session`; widen `resolve_session()`'s return to `(id, identity_id, expires_at, last_seen_at, family_created_at)`, still `STABLE`, still read-only; add `touch_session(p_session_id uuid)` (`VOLATILE`, `UPDATE ... WHERE revoked_at IS NULL`, `EXECUTE` to `lc_auth, lc_app`); add `family_created_at` to `rotate_refresh()`'s `INSERT INTO session` column/select list, copied from the replaced row; add `sign_out(p_session_id uuid)` (finds `family_id` via the presented session's own `refresh_token` row, revokes every `refresh_token` and `session` row sharing it, `EXECUTE` to `lc_auth` only), in `backend/drizzle/0040_session_lifecycle_columns.sql` — data-model.md, [research.md D1](./research.md#d1--idle-and-absolute-state-live-on-session-itself-as-two-new-columns-not-a-new-entity), [D2](./research.md#d2--the-write-path-is-a-new-narrow-function-called-only-after-the-limit-check-passes), [D5](./research.md#d5--sign-out-is-rotate_refreshs-reuse-revocation-branch-deliberately-triggered)
- [X] T004 Create `step_up_elevation` (`id`, `identity_id` FK, `capability text`, `token_digest UNIQUE`, `expires_at`, `consumed_at`, `created_at`) with **zero grants to `lc_app`**, `INSERT`/`SELECT`/`UPDATE` for `lc_auth`; add `consume_step_up(p_token_digest, p_identity_id, p_capability)` (`SECURITY DEFINER`, atomic check-and-set `UPDATE ... RETURNING true`, `EXECUTE` to `lc_app`), in `backend/drizzle/0041_step_up_elevation.sql` — data-model.md `step_up_elevation`, [research.md D6](./research.md#d6--step-up-is-a-new-short-lived-single-use-database-backed-elevation--not-a-token-the-caller-mints)
- [X] T005 Extend `audit_event_action_known`'s `CHECK` constraint with `session.signed_out`, `stepup.verified`, `stepup.failed`, all attributable with `tenant_id NULL` (matching `0030`'s policy shape for `003`'s twelve auth actions), in `backend/drizzle/0042_session_lifecycle_audit_actions.sql` — [research.md D8](./research.md#d8--two-new-audit-actions-added-to-the-exhaustive-registry-the-existing-discipline-already-requires), plan.md Constitution Check re-check item 2

### Application-side registries

- [X] T006 [P] Extend the Drizzle schema with `session`'s two new columns and the `step_up_elevation` table in `backend/src/common/db/schema.ts` (MODIFIES a slice 003 file)
- [X] T007 [P] Add `session.signed_out`, `stepup.verified`, `stepup.failed` to `AUDIT_ACTIONS` **and a `TARGET_ENTITY_BY_ACTION` entry for each** — the record type requires exhaustiveness — deciding none is channel-gated, in `backend/src/common/audit/actions.ts` (MODIFIES a slice 001 file, depends on T005)
- [X] T008 [P] Record `step_up_elevation` as deliberately unregistered (no `tenant_id`) in `backend/src/common/db/tenant-scoped-tables.ts`, the same comment shape `identity`/`session` already use (MODIFIES a slice 001 file)

### The role-class module ⚠️ Write tests first, watch them fail

- [X] T009 [P] Unit test: `roleClassFor()` maps all five internal archetypes to `'internal'`, `SA` to `'sa'`, all four portal archetypes plus third parties to `'portal'`, and `null` to `'sa'` (the identity-only default); `SESSION_LIMITS` holds exactly the six numbers from constitution `.specify/memory/constitution.md` § Sessions, in `backend/tests/unit/session-lifecycle.test.ts` — [research.md D3](./research.md#d3--role-class-comes-from-currentprincipal-identity-only-requests-get-the-tightest-default)
- [X] T010 Implement `roleClassFor(archetype: Archetype | 'PO' | null): RoleClass` and `SESSION_LIMITS: Record<RoleClass, { idleMinutes: number; absoluteMinutes: number }>` — no NestJS or Drizzle import, matching `capability.ts`'s pure-data style — in `backend/src/common/auth/session-lifecycle.ts` (depends on T009)

### Slice 003 files, extended ⚠️ Write tests first

- [X] T011 [P] Integration test: `resolve_session()`'s widened return carries `id`, `last_seen_at`, `family_created_at` for a live session; `touch_session()` updates `last_seen_at` on a live session and is a no-op against a revoked one; **`lc_app` holds `EXECUTE` on `touch_session()` and `sign_out()`'s grant is `lc_auth`-only** (confirmed by permission-denied, not an empty result, when attempted as `lc_app`), in `backend/tests/integration/session-lifecycle-functions.test.ts` — data-model.md, [research.md D2](./research.md#d2--the-write-path-is-a-new-narrow-function-called-only-after-the-limit-check-passes)
- [X] T012 [P] Integration test: `rotate_refresh()` copies `family_created_at` forward unchanged across three successive rotations while `last_seen_at` resets to each rotation's own time, in `backend/tests/integration/session-rotation-family-created-at.test.ts` — [research.md D1](./research.md#d1--idle-and-absolute-state-live-on-session-itself-as-two-new-columns-not-a-new-entity)
- [X] T013 Widen `AuthenticatedRequest` with `sessionId`, `lastSeenAt`, `familyCreatedAt`, and update `canActivate()` to keep all fields from `resolve_session()`'s row rather than discarding everything but `identityId`, in `backend/src/common/auth/session.guard.ts` (MODIFIES a slice 003 file, depends on T003, T011)
- [X] T014 Add `signOut(tx, sessionId)` calling the `sign_out()` SQL function, and widen `resolveSession()`'s return type to match T003, in `backend/src/common/auth/session.port.ts` (MODIFIES a slice 003 file, depends on T003, T011)

### Lockdown verification — the hard gate

- [X] T015 Integration test: as the real `lc_app` role, `SELECT` on `step_up_elevation` is **permission denied, not an empty result**; `lc_app` holds `EXECUTE` on `touch_session()` and `consume_step_up()` and **no other new function**; `lc_app` gains **zero new table privilege** anywhere in this slice, in `backend/tests/integration/session-lifecycle-grants-lockdown.test.ts` — plan.md Constitution Check, Principle IV. Modelled on `003`'s `auth-grants-lockdown.test.ts`
- [X] T016 [P] Integration test: `lc_app` cannot insert `session.signed_out`, `stepup.verified` or `stepup.failed`; `lc_auth` can, with `tenant_id NULL`, in `backend/tests/integration/session-lifecycle-audit-actions.test.ts` — FR-006, FR-021, [research.md D8](./research.md#d8--two-new-audit-actions-added-to-the-exhaustive-registry-the-existing-discipline-already-requires)
- [X] T017 Run `npm run test:rls` and confirm it passes unchanged — `step_up_elevation` carries no `tenant_id`, so the catalogue admits it without an exemption (depends on T008)

**Checkpoint**: The data layer now tracks idle/absolute activity, can revoke a family on demand, and
can mint and consume a step-up elevation. No route reaches any of it yet.

---

## Phase 3: User Story 1 - Sign out and have it mean something (Priority: P1) 🎯 MVP

**Goal**: A signed-in person ends their session and it is dead everywhere — refused on the next
request, refused on refresh, refused for the whole family, unaffected on other devices.

**Independent Test**: Sign in for real tokens (reuses `003`'s flow). Call sign-out. Assert the
session is refused on the next request, the refresh token cannot renew it, a second sign-out call
succeeds idempotently, and a session from a different device for the same identity is untouched.

### Tests for User Story 1 ⚠️ Write first, watch them fail

- [X] T018 [P] [US1] Contract test `POST /auth/sign-out`: `200 { signedOut: true }` on a live session and, identically, on an already-revoked one — no field distinguishes them, in `backend/tests/contract/session-lifecycle.test.ts` — FR-005, contracts/session-lifecycle.md
- [X] T019 [P] [US1] Integration test: after sign-out, the presented access token is refused on the next request, and `POST /auth/refresh` against any refresh token from the same family is refused via `rotate_refresh()`'s existing revoked-row branch, in `backend/tests/integration/sign-out.test.ts` — SC-001, User Story 1 scenarios 1–2
- [X] T020 [P] [US1] Integration test: signing out one session leaves every `session`/`refresh_token` row sharing its `family_id` revoked, and a **second, independent family** for the same identity (a second device) untouched, in `backend/tests/integration/sign-out.test.ts` — FR-003, FR-004, User Story 1 scenarios 3, 6
- [X] T021 [P] [US1] Integration test: exactly one `session.signed_out` audit entry per completed sign-out call, identifying the identity, with a second call against the same session producing **no additional entry**, in `backend/tests/integration/sign-out.test.ts` — FR-006, SC-008, User Story 1 scenario 5

### Implementation for User Story 1

- [X] T022 [US1] Implement `sign-out.service.ts` — resolves `request.sessionId` (T013), calls `signOut()` (T014) and `appendAuditEntry()` with `session.signed_out` in the same transaction, in `backend/src/modules/auth/sign-out.service.ts` (depends on T014, T018–T021)
- [X] T023 [US1] Implement `POST /auth/sign-out` — no request body, always `200 { signedOut: true }`, in `backend/src/modules/auth/sign-out.controller.ts` (depends on T022)
- [X] T024 [US1] Register the sign-out route in `backend/src/modules/auth/auth.module.ts` (MODIFIES a slice 003 file, depends on T023)

**Checkpoint**: User Story 1 is fully functional and testable independently — a person can sign out
and it means something, with nothing from US2–US4 required.

---

## Phase 4: User Story 2 - Fresh proof of identity before a sensitive operation (Priority: P2)

**Goal**: The five already-shipped, already-withheld capabilities become reachable, gated by a fresh
second-factor check scoped to one operation.

**Independent Test**: Take a live, ordinary (not freshly authenticated) session and attempt one of
the five gated capabilities — assert refusal pending step-up. Complete step-up, retry with the
token, assert success. Assert a second, different gated capability with the same token is refused.

### Tests for User Story 2 ⚠️ Write first, watch them fail

- [X] T025 [P] [US2] Contract test `POST /auth/step-up`: `200 { stepUpToken, expiresAt }` on a valid code against one of the five gated capabilities; the same uniform `401` `003`'s `/auth/factor` already returns for a wrong or expired code; `404` for a `capability` value outside the five, in `backend/tests/contract/session-lifecycle.test.ts` — FR-020, contracts/session-lifecycle.md
- [X] T026 [P] [US2] **BLOCKING** Integration test: for all five `stepUp: true` capabilities individually, the gated route refuses with `step_up_required` absent a token, and succeeds once a matching, unconsumed, unexpired token is presented via `X-Step-Up-Token`, in `backend/tests/integration/step-up.test.ts` — SC-005, SC-006, User Story 2 scenarios 1–2, 7
- [X] T027 [P] [US2] Integration test: a consumed or wrong-capability token is refused with `step_up_required`; a token minted for `membership.revoke` does not satisfy `membership.change_archetype`, in `backend/tests/integration/step-up.test.ts` — FR-019, User Story 2 scenario 5
- [X] T028 [P] [US2] Integration test: an identity lacking the underlying permission for a gated capability (e.g. an `AA` attempting `membership.change_archetype`) is refused by the **ordinary** permission check, never reaching a step-up refusal, in `backend/tests/integration/step-up.test.ts` — Edge Cases, `spec.md`
- [X] T029 [P] [US2] Integration test: exactly one `stepup.verified`/`stepup.failed` audit entry per `POST /auth/step-up` call, identifying identity and capability; consuming the resulting token against the gated endpoint writes **no additional** step-up entry, in `backend/tests/integration/step-up.test.ts` — FR-021, SC-008, User Story 2 scenario 6

### Implementation for User Story 2

- [X] T030 [US2] Implement `step-up.service.ts` — validates `capability` against the five `stepUp: true` ids, calls `KeyProvider.unwrap()` + `verifyCode()` exactly as `sign-in.service.ts` does, mints a `step_up_elevation` row on success, writes `stepup.verified`/`stepup.failed` in the same transaction, in `backend/src/modules/auth/step-up.service.ts` (depends on T004, T025–T029)
- [X] T031 [US2] Implement `POST /auth/step-up` in `backend/src/modules/auth/step-up.controller.ts` (depends on T030)
- [X] T032 [US2] Register the step-up route in `backend/src/modules/auth/auth.module.ts` (MODIFIES a slice 003 file, depends on T031, T024)
- [X] T033 [US2] In `decideAndProceed()`, **after** the existing `decide()` call succeeds and when `capabilityDef(capabilityId).stepUp === true`: read `X-Step-Up-Token`, digest it, call `consume_step_up(digest, caller.identityId, capabilityId)`; refuse with `403 step_up_required` on `false`/no header, in `backend/src/common/authz/interceptor.ts` (MODIFIES a slice 004 file — see plan.md Complexity Tracking, depends on T004, T026–T028)

**Checkpoint**: User Stories 1 AND 2 both work independently. All five previously-withheld
capabilities are now reachable in production (SC-005).

---

## Phase 5: User Story 3 - Idle and absolute session limits by role class (Priority: P3)

**Goal**: A session idle too long, or simply old enough regardless of activity, stops working — at a
limit that depends on role class, re-evaluated fresh on every request.

**Independent Test**: For each of the three role classes, create a session, advance the stored
`last_seen_at`/`family_created_at` past its idle/absolute limit and assert refusal; confirm a session
inside both limits is never refused on timing grounds; confirm an archetype change applies its new
class's limits on the very next request.

### Tests for User Story 3 ⚠️ Write first, watch them fail

- [X] T034 [P] [US3] **BLOCKING** Integration test: the six-case matrix — internal/`SA`/portal, idle-triggered and absolute-triggered — each refused with the same `401 "No autenticado."` `SessionGuard` already returns for an unknown token, in `backend/tests/integration/idle-absolute-expiry.test.ts` — SC-002–004, User Story 3 scenarios 1–6
- [X] T035 [P] [US3] Integration test: a session inside both limits is never refused on timing grounds, across all three classes, in `backend/tests/integration/idle-absolute-expiry.test.ts` — User Story 3 scenario 7
- [X] T036 [P] [US3] Integration test: `membership.change_archetype` mid-session applies the new class's limits on the very next request — reusing `archetype-change-live.test.ts`'s fixture pattern — in `backend/tests/integration/idle-absolute-expiry.test.ts` — FR-010, User Story 3 scenario 8
- [X] T037 [P] [US3] Integration test: an idle- or absolute-expired presentation does **not** call `touch_session()` — `last_seen_at` is provably unchanged by the refused request — in `backend/tests/integration/idle-absolute-expiry.test.ts` — [research.md D2](./research.md#d2--the-write-path-is-a-new-narrow-function-called-only-after-the-limit-check-passes)
- [X] T038 [P] [US3] Integration test: zero audit entries are written for an idle or absolute refusal, in `backend/tests/integration/idle-absolute-expiry.test.ts` — FR-011, SC-008
- [X] T039 [P] [US3] Integration test: a request with no active tenant context (an identity-only route) is evaluated against the `SA` limits, in `backend/tests/integration/idle-absolute-expiry.test.ts` — [research.md D3](./research.md#d3--role-class-comes-from-currentprincipal-identity-only-requests-get-the-tightest-default), plan.md Open Item 2

### Implementation for User Story 3

- [X] T040 [US3] At the **top** of `decideAndProceed()` — ahead of both the existing `decide()` call and US2's step-up consumption block (T033) — compute `roleClassFor(caller.principal?.archetype ?? null)` (T010), compare `now() - request.lastSeenAt`/`request.familyCreatedAt` (T013) against `SESSION_LIMITS`, throw the same `UnauthorizedException('No autenticado.')` `SessionGuard` throws on refusal, otherwise call `touch_session(request.sessionId)`, in `backend/src/common/authz/interceptor.ts` (MODIFIES a slice 004 file, same file as T033 — sequential, not parallel; see plan.md Complexity Tracking, depends on T003, T010, T013, T034–T039)

**Checkpoint**: All user stories should now be independently functional. Every session-bearing
request on every surface is now subject to idle/absolute expiry.

---

## Phase 6: User Story 4 - Access ends when a tenant is deactivated (Priority: P4)

**Goal**: Confirm — not build — that `001`'s existing refusal-at-activation already delivers this
story (`research.md` D7).

**Independent Test**: Seed an identity with live memberships in two tenants. Deactivate one. Assert
the next request against the deactivated tenant is refused and a request against the other tenant,
same session, succeeds unchanged.

### Tests for User Story 4 (no implementation phase — confirming existing behavior)

- [X] T041 [US4] Integration test: with a live session and live memberships in Tenant A and Tenant B, deactivating Tenant A refuses the next request activating its context while Tenant B's context continues to succeed on the same session, in `backend/tests/integration/tenant-deactivation-session.test.ts` — SC-007, User Story 4 scenarios 1–2
- [X] T042 [P] [US4] Integration test: deactivating a tenant writes the existing `tenant.deactivated` entry and **no additional, session-specific** entry, in `backend/tests/integration/tenant-deactivation-session.test.ts` — FR-015, User Story 4 scenario 4
- [X] T043 [P] [US4] Integration test: `session` and `refresh_token` rows are **not mutated** by a tenant's deactivation — `revoked_at` stays NULL on a session that merely can no longer activate that tenant's context, confirming `research.md` D7's "access is refused, not that the session row changes," in `backend/tests/integration/tenant-deactivation-session.test.ts` — spec.md Named Risks

**Checkpoint**: All four user stories independently functional. This phase adds zero production code
— T041–T043 pass against `001`'s and this slice's existing code unchanged.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: The two guarantees that span every story rather than belonging to one.

- [X] T044 [P] Integration test: a session row seeded with no `last_seen_at`/`family_created_at` activity beyond its own defaults (simulating one that predates this slice) is not force-refused by deploying this slice — it remains valid under its existing `expires_at`/refresh cycle until due for renewal, in `backend/tests/integration/pre-existing-session-migration.test.ts` — FR-025, SC-009
- [X] T045 Run `npm run test:isolation` and confirm `001`'s isolation suite passes unchanged — this slice touches no tenant-scoped table
- [X] T046 Run all four `quickstart.md` scenario walkthroughs manually against a local stack and check every box in its Non-negotiable coverage checklist
- [X] T047 [P] Update `backend/tests/integration/audit-vocabulary-unchanged.test.ts`'s expected count if it asserts an exact total action count (MODIFIES a slice 001 file — confirm first whether it asserts a count or a subset, per `003`'s T017 precedent that this test "needs no edit" when it's subset-based)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories.
- **User Stories (Phase 3–6)**: All depend on Foundational. US1 (Phase 3) has no dependency on
  US2–US4 and is the MVP. US2 (Phase 4) and US3 (Phase 5) both edit
  `common/authz/interceptor.ts` — **sequential on that one file** (T033 before T040, matching
  spec priority order), independent everywhere else. US4 (Phase 6) depends only on Foundational
  and `001`'s pre-existing code.
- **Polish (Phase 7)**: Depends on all four stories being complete.

### Parallel Opportunities

- T006–T008 (registries) can run in parallel once T003–T005 (migrations) land.
- All tests within a story phase marked `[P]` target the same file in several cases
  (`idle-absolute-expiry.test.ts`, `step-up.test.ts`, `sign-out.test.ts`,
  `tenant-deactivation-session.test.ts`) — read `[P]` there as "independent test cases, written and
  run together," not "four separate files."
- US1 (Phase 3) can be fully implemented and merged before US2/US3 exist — it is the MVP slice.

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 (Setup) → Phase 2 (Foundational) → Phase 3 (US1, sign-out).
2. **STOP and VALIDATE**: `sign-out.test.ts` green, quickstart.md scenario 1 passes manually.
3. This alone closes the most demo-blocking gap named in spec.md's Why-this-priority for US1.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. US1 → test independently → mergeable (MVP).
3. US2 → test independently → all five withheld capabilities reachable (SC-005).
4. US3 → test independently → passive baseline control live.
5. US4 → confirmation tests only, no new risk.
6. Polish → pre-existing-session guarantee, full quickstart pass.
