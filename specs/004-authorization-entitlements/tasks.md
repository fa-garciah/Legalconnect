---

description: "Task list for 004-authorization-entitlements"
---

# Tasks: Authorization & Tier Entitlements

**Input**: Design documents from `/specs/004-authorization-entitlements/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/refusal.md](./contracts/refusal.md), [quickstart.md](./quickstart.md)

**Tests**: **Included and mandatory.** Constitution v1.4.0 makes strict TDD non-negotiable, and this slice's own FR-011, FR-012 and SC-016 make refusal-path coverage blocking in CI at the standing of tenant isolation. Every test task below must be written, run, and **seen to fail** before the implementation task(s) under it begin.

**Organization**: Grouped by user story so each can be implemented, tested and delivered independently. Story numbers (`US1`–`US6`) follow `spec.md`'s own numbering, not the catalogue IDs — mapping: US1 = `US11-EP00-FND-EnforceDenyByDefault`, US3 = `US14-EP00-FND-EnforceEntitlementByTier`. US2, US5 and US6 carry no catalogue ID of their own (US2 completes Principle IV's incremental matrix; US6 extends `US15`'s vocabulary, which 002 delivered). US4's catalogue ID `US12` was **retired** — Decision 4 — so US4 adds only the last-`SA` constraint and the no-editing-archetypes boundary to capability 002 already built.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story the task belongs to (US1–US6)
- Exact file paths are included in every task

## Path Conventions

Web application, backend only for this slice (no `frontend/`). Paths follow the
structure decision in [plan.md](./plan.md): `backend/src/`, `backend/drizzle/`,
`backend/tests/`. This slice modifies files slices 001 and 002 own
(`backend/src/common/tenant/*`, `backend/src/common/permissions/*`, and nine
controllers) — each such task says so explicitly.

## TDD exemptions in force

Constitution exemption 1 covers **configuration files and declarative migrations**, so
`backend/vitest.config.ts` (T003) and `backend/drizzle/0019_*.sql` (T050) carry no
preceding test of their own. Both are verified by test tasks that assert their effects —
T003 by the coverage gate itself, T050 by T048.

No other exemption is claimed. In particular `capability.ts` and `matrix.ts` are data
but **not** configuration: they are the substance of Principle IV, and each has a
shape test written before it (T004, T006).

## What CI already enforces, and needs no new task

Verified against `.github/workflows/ci.yml` at `dd7755f`:

- **`npm run typecheck` (`tsc --noEmit`) is already a blocking CI step.** Once `MATRIX`
  is typed as a total `Record<CapabilityId, …>`, FR-021's build gate — *a capability
  reaching `main` without a matrix row fails the build* — is enforced by a step that
  already exists. No workflow change is required, only T007's typing.
- **`npm test -- --coverage` is already blocking**, with per-directory thresholds in
  `vitest.config.ts`. SC-016 needs one threshold entry (T003), not a new gate.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Directory scaffolding and the coverage gate. This slice reuses 001's and
002's entire toolchain — **no new runtime dependency, no new test runner configuration.**

- [ ] T001 Create the new module directory `backend/src/common/authz/` per [plan.md](./plan.md)'s structure decision — it holds `capability.ts`, `matrix.ts`, `decide.ts`, `scope.ts`, `entitlement.ts`, `refusal.ts`, `declare.ts` and `interceptor.ts`
- [ ] T002 [P] Confirm no dependency is added: `backend/package.json` must be byte-identical at the close of this slice — record the assertion in `backend/tests/integration/no-new-dependency.test.ts` comparing `dependencies` against the committed baseline
- [ ] T003 [P] Add the blocking coverage threshold for `src/common/authz/**` (statements, branches, functions, lines all 100) to the `test.coverage.thresholds` block of `backend/vitest.config.ts`, alongside the existing `src/common/tenant/**` and `src/common/audit/**` entries — FR-012, SC-016 *(TDD exemption 1: configuration)*

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The registry, the matrix, the refusal vocabulary, the scope port, the
`@Capability` declaration, and the two seam widenings that put the plan on the hot path.
No decision is taken in this phase — it builds the data and the types every story reads.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete. T013 in
particular gates US3 entirely: without the plan on `ActivePrincipal` there is nothing for
an entitlement check to read.

### The registry and the matrix

- [ ] T004 [P] Write `backend/tests/unit/registry-shape.test.ts` — every capability declares exactly one `scope` from `tenant|self|assigned|none`; ids are unique and match `module.verb`; the registry holds exactly the 21 rows of [data-model.md](./data-model.md); the five step-up rows (2, 3, 6, 7, 17) carry `stepUp: true`. **Run it; see it fail.** FR-013, FR-018
- [ ] T005 Implement `backend/src/common/authz/capability.ts` — `ScopeKind`, `CapabilityDef`, the `CAPABILITIES` const with all 21 rows, and `CapabilityId = keyof typeof CAPABILITIES`. **No import from `@nestjs/*`, `drizzle-orm` or `node:*`** — this file must be loadable without a framework or a container (research.md D1)
- [ ] T006 [P] Write `backend/tests/unit/matrix-shape.test.ts` — `MATRIX` has a row for every `CapabilityId` and no key that is not one; every subject is one of the eleven codes; rows 18–21 are empty sets; rows 11–17 are exactly `{PO}`; no `tenant`-scoped row contains `PO` (FR-008). **Run it; see it fail.**
- [ ] T007 Implement `backend/src/common/authz/matrix.ts` — the `Subject = Archetype | 'PO'` type and the `MATRIX` constant with the rows as resolved in [data-model.md](./data-model.md). Type it as `Readonly<Record<CapabilityId, ReadonlySet<Subject>>>` — the totality is what makes a missing row a compile error under the CI typecheck step that already exists (FR-021)

### The refusal vocabulary

- [ ] T008 [P] Write `backend/tests/unit/refusal-mapping.test.ts` — `REFUSAL_ORDER` is exactly `['mfa_not_enrolled','permission','scope','entitlement']` in that order; each class maps to the status and `error.code` of [contracts/refusal.md](./contracts/refusal.md) §2; the limit shape carries `limit: { key, value }` and the feature shape carries `capability`. **Run it; see it fail.** FR-006, FR-017, FR-022, FR-024
- [ ] T009 Implement `backend/src/common/authz/refusal.ts` — `RefusalClass`, the `REFUSAL_ORDER` constant, the `Decision` type of [data-model.md](./data-model.md), and the projection to the `ErrorBody` shape `backend/src/common/http/errors.ts` already establishes. The `assigned`-kind status is behind a single named constant so Open Item 3 is a one-line change (research.md D6)
- [ ] T010 Add `EntitlementRequired` and `LimitReached` to `backend/src/common/http/errors.ts`, following the existing class shape — `MODIFIES a file slice 001 owns`; add nothing else and change no existing class

### The scope port

- [ ] T011 [P] Write `backend/tests/unit/scope-resolvers.test.ts` — the `tenant` resolver answers true inside the caller's own tenant and false otherwise; `self` answers true only when the target is the caller's own record; `none` always answers true; `resolverFor` returns undefined for an unregistered kind. **Run it; see it fail.** FR-013, FR-014
- [ ] T012 Implement `backend/src/common/authz/scope.ts` — `ScopeRequest`, `ScopeResolver`, the `SCOPE_RESOLVERS` multi-provider token, `resolverFor(kind)`, and the three resolvers this slice owns. The `assigned` kind is deliberately left with **no** resolver (FR-015, research.md D3)

### The seam widenings — the plan reaches the hot path

- [ ] T013 [P] Write `backend/tests/integration/membership-plan-join.test.ts` (Testcontainers) — `DbMembershipPort.find()` returns `planEntitlements` and `planLimits` for the tenant's plan **in one round trip** (assert by query count, not by timing); `resolvePrincipal` surfaces them on `ActivePrincipal.plan`; `InMemoryMembershipPort` fixtures still return `plan: null` and every 001 test using them still passes. **Run it; see it fail.** FR-027, research.md D7
- [ ] T014 Widen `MembershipRecord` with optional `planEntitlements` and `planLimits` in `backend/src/common/tenant/membership.ts`, and add the two joins — `tenant` on `membership.tenant_id`, `plan` on `tenant.plan_id` — to `DbMembershipPort.find()`'s existing single `SELECT`. **MODIFIES a file slice 002 owns.** Add no second query and no new grant: `GRANT SELECT ON tenant` and `GRANT SELECT ON plan` to `lc_app` already exist in `backend/drizzle/0006_grants.sql`
- [ ] T015 Add `plan` to `ActivePrincipal` in `backend/src/common/tenant/principal.ts` and populate it in `backend/src/common/tenant/resolve.ts`, defaulting to `null` when the port supplied nothing. **MODIFIES two files slice 001 owns.** Do **not** extend `RefusalReason` — authorization refusals are a separate vocabulary (data-model.md)

### The declaration

- [ ] T016 [P] Write `backend/tests/unit/capability-decorator.test.ts` — `@Capability('id')` sets metadata a `Reflector` reads back from both handler and class; the parameter is typed `CapabilityId` so an unknown id is a compile error. **Run it; see it fail.** FR-019
- [ ] T017 Implement `backend/src/common/authz/declare.ts` — the `CAPABILITY` metadata key and the `@Capability()` decorator. **No rule is authored here**: the decorator declares which capability a route exposes and decides nothing (Principle IV re-check, plan.md)

**Checkpoint**: The registry, matrix, refusal vocabulary, scope port and plan seam exist and are tested. Nothing decides anything yet — every route still runs under 002's `@RequireArchetypes`, unchanged and green.

---

## Phase 3: User Story 1 - Reject anything not explicitly permitted (Priority: P1) 🎯 MVP

**Goal**: The absence of a rule is a refusal, never a gap. A capability with no matrix
row is refused for every archetype; a route with no declaration is unreachable; a scope
kind with no resolver refuses rather than defaults open.

**Independent Test**: Enumerate the registry and the eleven archetype codes, invoke the
decision function for every pair, and assert the outcome equals the matrix. Then add a
capability with no matrix row and assert all eleven are refused. **No HTTP layer, no
database, no tenant.** Separately, add an undeclared route and assert it is unreachable.

**Why this is the MVP**: every other story is a refinement of a decision function that
must first be *closed*. This phase also closes the fail-open path `spec.md` §2 describes —
today a route carrying no declaration is reachable by **every live membership of the
tenant**, including every portal archetype.

### Tests for User Story 1 ⚠️

> **NOTE: Write these FIRST, run them, and see them FAIL before T026.**

- [ ] T018 [P] [US1] Write `backend/tests/unit/deny-by-default.test.ts` — a capability with no matrix row is refused for all 11 subjects; `capability: null` is refused before any other evaluation; a capability whose scope kind has no registered resolver is refused on scope, never permitted. FR-002, FR-019, SC-002, US5 scenario 6
- [ ] T019 [P] [US1] Write `backend/tests/unit/portal-archetypes-empty.test.ts` — each of `CC`, `IC`, `CB`, `EL` is asserted **individually** against every `tenant`-scoped capability and holds exactly zero. FR-020, SC-004. Read FR-020 as *zero tenant-scoped capability* per research.md D8, and carry that reading in a comment naming the decision
- [ ] T020 [P] [US1] Write `backend/tests/contract/capability-declared-everywhere.test.ts` — walk the Nest router; **0 routes** carry no `@Capability`; the 15 declared routes plus the 6 registry rows with no endpoint account for all 21 capabilities; **0 routes** carry both `@PlatformSurface()` and a `tenant`-scoped capability. SC-013, FR-008
- [ ] T021 [P] [US1] Write `backend/tests/contract/undeclared-route-unreachable.test.ts` — register a deliberately undeclared route in an isolated test module and assert it answers `404` with the generic body, for a caller holding a live membership. SC-013, FR-019, FR-023

### Implementation for User Story 1

- [ ] T022 [US1] Implement `backend/src/common/authz/decide.ts` — the pure function over `DecisionInput` returning `Decision`, walking `REFUSAL_ORDER`. This phase implements the closed default only: `capability: null` refuses; no matrix row refuses `permission`; a scope kind with no resolver refuses `scope`. The entitlement step returns permitted for now and is completed by T045
- [ ] T023 [US1] Implement `backend/src/common/authz/interceptor.ts` — `AuthorizationInterceptor` reads `@Capability` via `Reflector`, derives the subject per surface (tenant: `currentPrincipal().archetype`; platform: `PO`; identity: no archetype — research.md D8, D9), builds the `ScopeRequest`, awaits `decide()`, and throws the mapped refusal
- [ ] T024 [US1] Register `AuthorizationInterceptor` in `backend/src/app.module.ts` **after** `TenantContextInterceptor` and `PlatformContextInterceptor` and **before** `AuditInterceptor` — order is load-bearing (research.md D2); update the ordering comment that file already carries. **MODIFIES a file slice 001 owns**
- [ ] T025 [P] [US1] Declare `@Capability` on the tenant-surface audit route in `backend/src/modules/audit/audit.controller.ts` — `GET /audit/events` → `audit.read_own_tenant`
- [ ] T026 [P] [US1] Declare `@Capability` on the three routes of `backend/src/modules/invitation/invitation.controller.ts` — `POST /tenant/invitations` → `invitation.issue`; `POST :id/revoke` → `invitation.revoke`; `GET /tenant/invitations` → `invitation.read_pending`
- [ ] T027 [P] [US1] Declare `@Capability` on the two routes of `backend/src/modules/membership/membership.controller.ts` — `PATCH :id/revoke` → `membership.revoke`; `PATCH :id/archetype` → `membership.change_archetype`
- [ ] T028 [P] [US1] Declare `@Capability` on the two identity-surface routes — `POST :reference/accept` → `invitation.accept_own` in `backend/src/modules/identity/accept-invitation.controller.ts`, and `GET /identity/memberships` → `membership.read_own` in `backend/src/modules/identity/memberships.controller.ts`. **These routes have never carried any declaration**; both resolve at `self` scope and neither is archetype-decided (research.md D8)
- [ ] T029 [P] [US1] Declare `@Capability` on the three routes of `backend/src/modules/tenant/platform.controller.ts` — `POST` → `tenant.provision`; `POST :id/deactivate` → `tenant.deactivate`; `GET :id` → `tenant.read_registry`. **Never carried a declaration**
- [ ] T030 [P] [US1] Declare `@Capability` on `backend/src/modules/tenant/seed.controller.ts` (`POST :tenantId/seed-administrator` → `invitation.issue_seed`) and on `backend/src/modules/audit/platform-audit.controller.ts` (`GET /internal/platform/audit` → `audit.read_platform`). **Neither carried a declaration**
- [ ] T031 [P] [US1] Declare `@Capability` on the two routes of `backend/src/modules/plan/plan.controller.ts` — `PATCH tenants/:tenantId/plan` → `tenant.change_plan`; `PATCH plans/:planCode/limits` → `plan.configure_limits`. **Never carried a declaration**
- [ ] T032 [US1] Delete `RequireArchetypes` and `REQUIRED_ARCHETYPES` from `backend/src/common/permissions/guard.ts`, keeping `PlatformSurface` and `IdentitySurface` untouched. **MODIFIES a file slices 001/002 own.** Two mechanisms deciding one rule is how they diverge (plan.md Complexity Tracking)
- [ ] T033 [US1] Remove the archetype-enforcement block from `TenantContextInterceptor.activate()` in `backend/src/common/tenant/middleware.ts` and update the comment that explains why the check lived there. **MODIFIES a file slice 001 owns.** The rule now lives in `matrix.ts`; the interceptor keeps resolving the principal and nothing else

**Checkpoint**: The default is closed on all three surfaces. Every route declares a capability, an undeclared route is unreachable, and `@RequireArchetypes` is gone. 002's suite must still be green — if it is not, the matrix rows and the declarations disagree and T007 or T025–T031 is wrong.

---

## Phase 4: User Story 2 - Enforce the archetype matrix server-side (Priority: P2)

**Goal**: The server decides. What a client renders, hides or omits has no bearing on
what the server permits, and a caller who bypasses the client reaches the same decision.

**Independent Test**: For each of the six internal archetypes, invoke every capability
against the decision function and compare the full outcome vector to the matrix.
Separately, drive the same capabilities through HTTP with a caller whose client would not
have offered them, and assert the outcomes are identical.

**Note on scope**: T022 already made the matrix load-bearing, so this phase is
predominantly **proof** rather than new mechanism. That is deliberate and is the honest
consequence of a closed default — a matrix that is not consulted cannot close anything.

### Tests for User Story 2 ⚠️

- [ ] T034 [P] [US2] Write `backend/tests/unit/matrix-exhaustive.test.ts` — iterate `Object.keys(CAPABILITIES)` (never a hand-written list, FR-018) across the eleven subjects and assert every outcome against [data-model.md](./data-model.md)'s resolved rows. **0 pairs unasserted.** Rows 9–10 are asserted archetype-**independent** rather than per-subject, with a comment naming research.md D8. SC-001
- [ ] T035 [P] [US2] Write `backend/tests/integration/po-refused-everything.test.ts` — `PO` is refused **100%** of the 8 `tenant`-scoped capabilities and permitted **exactly** the 7 platform capabilities, no more and no fewer. FR-008, SC-003
- [ ] T036 [P] [US2] Write `backend/tests/contract/decision-equals-endpoint.test.ts` — for a sampled set of pairs, the outcome through HTTP equals `decide()`'s (SC-010); a caller presenting a contradicting archetype header or token claim is decided by the stored membership (FR-003, FR-004 — 002's V19 must not regress)
- [ ] T037 [P] [US2] Write `backend/tests/integration/archetype-change-live.test.ts` — an `SA` demotes a live `MP` to `AA`; the demoted member's **very next** request to an `MP` capability is refused. **0 requests** decided under the previous archetype. SC-011, US2 scenario 6

### Implementation for User Story 2

- [ ] T038 [US2] Refine `decide()` in `backend/src/common/authz/decide.ts` so the matrix is consulted for `tenant` and `none` scope kinds and **skipped** for `self` kinds, where the resolver is the whole constraint (research.md D8). Carry the decision in a comment naming D8 and plan.md Open Item 2
- [ ] T039 [US2] Reconcile the two registry rows with no route — `membership.read_tenant` and `plan.read_own_tenant` — asserting in `backend/tests/contract/capability-declared-everywhere.test.ts` that they are inert: registered, decidable, and claimed by no route. Add no endpoint; the slice that adds one adds a row, not a rule (data-model.md)
- [ ] T040 [US2] Verify no route regressed: run `npm run test:contract` and confirm 002's `backend/tests/contract/membership-revoke-and-archetype.test.ts`, `backend/tests/contract/invite-user.test.ts`, `backend/tests/contract/list-invitations.test.ts` and `backend/tests/contract/revoke-invitation.test.ts` pass **unedited**. Decision 6 kept `MP` exactly as 002 shipped it, so a failure here means `backend/src/common/authz/matrix.ts` narrowed something it should not have (SC-017)

**Checkpoint**: Every (archetype × capability) pair is asserted, `PO` is provably confined to the platform surface, and the endpoint-driven outcomes match the function-driven ones.

---

## Phase 5: User Story 3 - Enforce tier entitlements independently of archetype (Priority: P3)

**Goal**: An archetype may hold a capability the tenant's plan does not include. Both
must pass, and the two refusals lead to different remedies, so the caller can tell them
apart.

**Independent Test**: Hold archetype and capability fixed and vary only the plan; assert
the outcome flips and the refusal names entitlement rather than permission. Change the
mapping in configuration, issue the next request, and assert the new mapping applies with
no restart and no deployment.

### Tests for User Story 3 ⚠️

- [ ] T041 [P] [US3] Write `backend/tests/unit/entitlement.test.ts` — a capability whose `tier` key is `false` in `plan.entitlements` is refused `entitlement`, independent of archetype; a capability with **no** `tier` key is included in every plan (research.md D4); the limit shape refuses when usage meets the ceiling and **names the limit** as `{ key, value }`; a `null` plan refuses any capability carrying a `tier` key, fail-closed. FR-005, FR-024, SC-008
- [ ] T042 [P] [US3] Write `backend/tests/unit/refusal-ordering.test.ts` — a request tripping all four reasons returns **exactly one**, and it is the earliest in `REFUSAL_ORDER`; assert each of the six adjacent pairs independently so the ordering cannot pass by coincidence. FR-022, SC-005
- [ ] T043 [P] [US3] Write `backend/tests/integration/entitlement-no-deploy.test.ts` — flip `plan.entitlements[key]` to `false`, issue the next request, assert refusal; flip it back, assert permission — **0 restarts, 0 deployments, and no sleep or cache-warm step anywhere in the test**; change the tenant's `plan_id` outright and assert the next request is evaluated against the new plan. FR-007, FR-027, SC-007
- [ ] T044 [P] [US3] Write `backend/tests/contract/refusal-shapes.test.ts` — every refusal class projects to the status and `error.code` of [contracts/refusal.md](./contracts/refusal.md) §2; a permission refusal and an entitlement refusal are distinguishable (FR-006); **0 refusal bodies disclose the existence or shape of the refused resource** (FR-023, SC-006)

### Implementation for User Story 3

- [ ] T045 [US3] Implement `backend/src/common/authz/entitlement.ts` — the feature-flag evaluation against `plan.entitlements` and the quantitative evaluation against `plan.limits`, returning the two `Decision` shapes of [data-model.md](./data-model.md). **No cache, no TTL, no memoisation** (research.md D7): the plan arrives on `ActivePrincipal` from the query T014 already widened
- [ ] T046 [US3] Complete the entitlement step in `backend/src/common/authz/decide.ts`, replacing T022's permitted stub. It runs **last** of the four, so it is only ever reached by a caller who passed permission and scope — which is what makes FR-006's distinction safe under FR-023
- [ ] T047 [US3] Record in `backend/src/common/authz/capability.ts` that **no capability carries a `tier` key at launch**, with a comment naming plan.md Open Item 4 — the mechanism is built and tested, and the mapping is a commercial decision awaiting an owner. Do not invent a mapping

**Checkpoint**: Entitlement is enforced independently of archetype, changes without deployment, and its refusal is distinguishable from a permission refusal without disclosing anything.

---

## Phase 6: User Story 4 - Assign a member's archetype within a tenant (Priority: P4)

**Goal**: An `SA` decides which archetype each member holds. They do not decide what an
archetype *means*, and they cannot strand their own tenant.

**Independent Test**: Drive an archetype change through the shipped capability, then
assert the next request for that member is decided under the new archetype. Separately,
reduce a tenant to a single live `SA` and assert every path that would remove the last
one is refused.

**Note on scope**: slice 002 built and tested the assignment capability itself. This
phase adds only the last-`SA` constraint and the no-inventing-capability boundary
(spec.md, Out of Scope).

### Tests for User Story 4 ⚠️

- [ ] T048 [P] [US4] Write `backend/tests/integration/last-sa-protected.test.ts` — with one live `SA`, changing their archetype is refused **and** revoking their membership is refused, **by the same rule**; with two `SA`s, **two concurrent demotions leave exactly one succeeding** (the second blocks on `FOR UPDATE`, re-reads, and is refused); an `SA` who is last in tenant A but not in tenant B acts freely in B. FR-010, SC-009. **The concurrent case is the one that matters** — an application-level check passes the first two and fails this one (research.md D5)
- [ ] T049 [P] [US4] Write `backend/tests/contract/archetype-no-invention.test.ts` — there is no route, body field or parameter through which an `SA` can grant an archetype a capability the product does not define; the archetype-change endpoint accepts only the ten enum values and refuses anything else; `archetype.redefine` is held by nobody, `SA` included. US4 scenario 2, matrix row 21

### Implementation for User Story 4

- [ ] T050 [US4] Write `backend/drizzle/0019_membership_retain_one_sa.sql` — the `BEFORE UPDATE` trigger of research.md D5, firing only on the transition out of live-`SA`, taking `FOR UPDATE` on sibling live `SA` rows of the same `tenant_id`, and raising `SQLSTATE 23001`. **Adds no table, no grant, no role and no policy** — it only ever refuses *(TDD exemption 1: declarative migration; verified by T048)*
- [ ] T051 [US4] Add `LastAdministratorProtected` to `backend/src/common/http/errors.ts` following the existing class shape. **MODIFIES a file slice 001 owns**
- [ ] T052 [US4] Map `SQLSTATE 23001` to `LastAdministratorProtected` in both `revoke()` and `changeArchetype()` of `backend/src/modules/membership/membership.service.ts` — match on the **`code` property, never the message**, so a reworded exception does not break the mapping. **MODIFIES a file slice 002 owns**
- [ ] T053 [US4] Extend `backend/tests/contract/membership-revoke-and-archetype.test.ts` with the refusal case: the `membership.archetype_changed` entry still carries actor, subject, previous value and new value after T052's error path is added, and a **refused** change writes no entry at all. US4 scenario 1, SC-014

**Checkpoint**: A tenant can never be left without an administrator, under concurrency as well as in sequence, and no surface exists through which an archetype's meaning can be edited.

---

## Phase 7: User Story 5 - Decide scope over the entity (Priority: P5)

**Goal**: Holding a capability is not the same as holding it over a particular thing.
This phase ships the port and proves it fails closed; the `assigned` resolver arrives
with the slice that introduces the case team.

**Independent Test**: Exercise the decision function with a stub `assigned` resolver that
answers yes and no on demand, and assert the outcome tracks the resolver rather than the
archetype. Assert a client-supplied claim of assignment changes nothing.

### Tests for User Story 5 ⚠️

- [ ] T054 [P] [US5] Write `backend/tests/unit/scope-port.test.ts` — with a stub `assigned` resolver the outcome tracks the resolver, not the archetype; a caller-supplied claim of assignment is **ignored** and scope is resolved from stored relationships (FR-014); a `self`-scope capability targeting another person's record is refused on scope; losing an assignment governs the next request with no grace period (FR-016); with the resolver **unregistered**, an `assigned` capability is refused and never permitted (US5 scenario 6). Assert the `Decision`'s reason is `scope`, distinguishable from `permission` and `entitlement` (FR-017)
- [ ] T055 [P] [US5] Write `backend/tests/unit/scope-port-extensibility.test.ts` — a fixture module registers an `assigned` resolver through the `SCOPE_RESOLVERS` multi-provider **without any file under `backend/src/common/authz/` being edited**, and `decide()` picks it up. FR-015

### Implementation for User Story 5

- [ ] T056 [US5] Wire the scope step of `backend/src/common/authz/decide.ts` to `resolverFor(kind)`, refusing `scope` when the lookup returns undefined. Document in a comment that the `assigned` kind ships with **no** resolver by design and that a missing resolver is a missing rule
- [ ] T057 [US5] Document the registration contract for downstream slices in [contracts/refusal.md](./contracts/refusal.md) §6 — confirm §6 matches the `SCOPE_RESOLVERS` token name and provider shape as shipped in `backend/src/common/authz/scope.ts`, and correct the contract if T012 diverged from it

**Checkpoint**: The port is real before its first consumer exists, and declaring `assigned` today opens nothing.

---

## Phase 8: User Story 6 - Audit every permission decision that matters (Priority: P6)

**Goal**: The change events exist and are tested by 002. What is missing is the refusal
side: a refused attempt reaching across tenants must be visible, and an in-tenant refusal
must not be able to inflate the log.

**Independent Test**: Provoke each class of refusal and assert exactly one audit entry
where the vocabulary requires one, and none where it does not.

### Tests for User Story 6 ⚠️

- [ ] T058 [P] [US6] Write `backend/tests/integration/refusal-audit-vocabulary.test.ts` — a refused attempt reaching across tenants emits **exactly one** `tenant.cross_access_attempted` (FR-025, SC-015); a refused attempt **within** the caller's own tenant emits **none**, so a member cannot inflate their firm's log by looping a forbidden endpoint (contracts/refusal.md §4); no entry carries personal data of the firm's end clients (Principle VI, US6 scenario 3)
- [ ] T059 [P] [US6] Write `backend/tests/unit/audit-vocabulary-unchanged.test.ts` — `AUDIT_ACTIONS` still holds exactly the 16 actions of slices 001 and 002. This slice adds none

### Implementation for User Story 6

- [ ] T060 [US6] Confirm `backend/src/common/audit/actions.ts` is **unmodified** and that the cross-tenant path in `backend/src/common/tenant/record-attempt.ts` is reached from `resolvePrincipal` **before** `AuthorizationInterceptor` runs — so the event is emitted by the mechanism 001 built, not re-emitted here. Change no file; the task is the verification and its recorded result

**Checkpoint**: All six stories are independently functional.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: The grant audit, the inherited-suite guarantee, and the three documentation
items this slice's planning surfaced.

- [ ] T061 Run the grant audit of research.md D10 over `tenant` and `plan` for `lc_app` — extend `backend/tests/integration/grants-lockdown.test.ts` with assertions that neither role holds more than `SELECT` on either table. **Expected finding: none**
- [ ] T062 If and only if T061 finds a gap, write `backend/drizzle/0020_authz_grant_verification.sql` narrowing it. **If T061 finds nothing, this task closes by deleting the reserved migration number from the branch** and recording that in the PR description — a migration that does nothing must not reach `main`
- [ ] T063 Run the full inherited suite — `npm run test:isolation`, `npm run test:rls`, `npm run verify:role`, `npm run test:contract` — and assert **0 test files modified, 0 failures, 0 grants or policies weakened**. `git diff --stat backend/drizzle/0006_grants.sql` must be empty. SC-017
- [ ] T064 Verify FR-021's build gate by hand once: add a key to `CAPABILITIES` in `backend/src/common/authz/capability.ts` without its row in `backend/src/common/authz/matrix.ts`, run `npm run typecheck`, and confirm the error names the missing property. Revert. Record the observed message in [quickstart.md](./quickstart.md) Scenario 1
- [ ] T065 Run `npm test -- --coverage` from `backend/` and confirm the `src/common/authz/**` threshold added to `backend/vitest.config.ts` by T003 reaches 100% on all four metrics, and that the build fails when it drops. FR-012, SC-016
- [ ] T066 [P] Execute every scenario in [quickstart.md](./quickstart.md) end to end and record the results in `specs/004-authorization-entitlements/quickstart-results.md`, following 002's format — including any deviation found, as 002's deviation 5 did
- [ ] T067 [P] Open the catalogue tidy-up PR for plan.md Open Item 1 — move `US12`'s retirement note from the **EP01** block to the **EP00** block in `specs/master-user-story-catalog.md`, and correct EP00's summary line, which still reads *"US11–US15 → slice 004"* when `US13`/`US15` belong to 002 and `US12` is retired
- [ ] T068 [P] Open the constitution amendment PR for plan.md's first Complexity Tracking row — correct the *Tier entitlement → Global guard* row of `.specify/memory/constitution.md`'s NestJS table to **Global interceptor**, in the same shape as the existing v1.4.0 correction note directly beneath it, and bump to v1.4.1 with an Amendment History entry
- [ ] T069 [P] Update `specs/004-authorization-entitlements/spec.md`'s Approval Checklist — tick *Every requirement is test-verifiable* once T065 passes, leaving *Approved by Cosmic Chimps technical lead* for the lead
- [ ] T070 Confirm the five step-up-gated capabilities (rows 2, 3, 6, 7, 17) carry `stepUp: true` in `backend/src/common/authz/capability.ts` and remain **withheld from production** until slice 005 lands — inherited from 002 unchanged, now machine-readable rather than a note in prose. plan.md Open Item 6

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately
- **Foundational (Phase 2)**: depends on Setup — **BLOCKS every user story**
- **US1 (Phase 3)**: depends on Foundational. **Blocks US2, US3 and US5**, because all three refine `decide.ts` and the interceptor that US1 creates
- **US2 (Phase 4)**: depends on US1
- **US3 (Phase 5)**: depends on US1 for `decide.ts`, and on **T014/T015** for the plan on the hot path
- **US4 (Phase 6)**: depends on Foundational only — **independent of US1, US2, US3 and US5.** Its trigger and error mapping touch the database and `membership.service.ts`, neither of which the decision function owns
- **US5 (Phase 7)**: depends on US1 for `decide.ts`'s scope step
- **US6 (Phase 8)**: depends on US1 — it needs refusals to exist before it can assert what they do and do not log
- **Polish (Phase 9)**: depends on all desired stories

### User Story Dependencies

```
Setup ──> Foundational ──┬──> US1 (P1) ──┬──> US2 (P2)
                         │               ├──> US3 (P3)
                         │               ├──> US5 (P5)
                         │               └──> US6 (P6)
                         └──> US4 (P4)   ────────────────> (independent)
```

**US4 is the one genuinely parallel story.** Everything else refines one file,
`decide.ts`, and serialises on it.

### Within Each User Story

- Tests MUST be written and **seen to fail** before implementation — constitution, strict TDD
- Types and data before the functions that read them
- Pure functions before the interceptor that calls them
- The interceptor before the route declarations it reads

### Parallel Opportunities

- **T002, T003** — different files, both trivial
- **T004, T006, T008, T011, T013, T016** — six independent test files, the whole
  test-first half of Foundational, writable simultaneously
- **T018–T021** — US1's four test files
- **T025–T031** — the seven route-declaration tasks, one per controller file, no shared
  file between them. The largest parallel block in the slice
- **T034–T037**, **T041–T044**, **T048/T049**, **T054/T055**, **T058/T059** — each story's
  test files
- **T066–T069** — four independent documents

**Not parallel, despite appearances**: T022, T038, T046 and T056 all edit
`backend/src/common/authz/decide.ts`. They are the spine of the slice and must run in
that order.

---

## Parallel Example: User Story 1

```bash
# Write all four US1 test files together, then run them and watch them fail:
Task: "Write backend/tests/unit/deny-by-default.test.ts"
Task: "Write backend/tests/unit/portal-archetypes-empty.test.ts"
Task: "Write backend/tests/contract/capability-declared-everywhere.test.ts"
Task: "Write backend/tests/contract/undeclared-route-unreachable.test.ts"

npm run test:unit && npm run test:contract     # expect failures; that is the gate

# After T022-T024, declare capabilities on all nine controllers together:
Task: "Declare @Capability in backend/src/modules/audit/audit.controller.ts"
Task: "Declare @Capability in backend/src/modules/invitation/invitation.controller.ts"
Task: "Declare @Capability in backend/src/modules/membership/membership.controller.ts"
Task: "Declare @Capability on both identity controllers"
Task: "Declare @Capability in backend/src/modules/tenant/platform.controller.ts"
Task: "Declare @Capability on seed.controller.ts and platform-audit.controller.ts"
Task: "Declare @Capability in backend/src/modules/plan/plan.controller.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1: Setup — T001–T003
2. Phase 2: Foundational — T004–T017 **(CRITICAL, blocks everything)**
3. Phase 3: User Story 1 — T018–T033
4. **STOP and VALIDATE**: the default is closed on all three surfaces, every route
   declares a capability, an undeclared route is unreachable, and 002's suite is green
   **unedited**
5. This is a genuinely shippable increment: it strictly *narrows* what the system permits
   and adds no surface

### Incremental Delivery

1. Setup + Foundational → the registry, matrix, refusal vocabulary and plan seam exist
2. **US1** → the default is closed **(MVP)**
3. **US2** → the matrix is proved exhaustively and end to end
4. **US3** → tier entitlement, changeable without deployment
5. **US4** → a tenant can never be stranded *(can be done any time after Foundational)*
6. **US5** → the scope port, proved fail-closed with a stub
7. **US6** → the refusal side of the audit vocabulary
8. Polish → grant audit, inherited-suite guarantee, the three documentation PRs

### Parallel Team Strategy

With two developers, after Foundational:

- **Developer A**: US1 → US2 → US3 → US5 → US6 — the `decide.ts` spine, serialised
- **Developer B**: US4 (trigger, migration, error mapping) then T061–T065 of Polish

US4 shares no file with the spine, so B never blocks on A. A third developer adds little
until US1 lands, because everything else reads `decide.ts`.

---

## Notes

- `[P]` tasks = different files, no dependencies
- `[Story]` label maps each task to a spec.md user story for traceability
- **Verify tests fail before implementing** — the constitution requires the PR history to
  evidence it, not merely the final state
- Commit after each task or logical group
- **Two files carry disproportionate risk**: `matrix.ts`, because Decision 4 makes it a
  constant and revisiting that decision turns it into a repository and reshapes every
  test in `tests/unit/`; and `decide.ts`, because four tasks across four phases edit it
  in sequence
- Three tasks are **verification-only and change no file** — T040, T060, T070. They are
  tasks rather than notes because their result must be recorded before the slice closes
- Open Items 2 and 3 of [plan.md](./plan.md) are carried in code comments (T038, T009)
  rather than resolved here. Neither blocks any task in this list
