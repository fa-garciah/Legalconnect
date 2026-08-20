---

description: "Task list for 001-tenant-foundation"
---

# Tasks: Tenant Foundation & Audit Log

**Input**: Design documents from `/specs/001-tenant-foundation/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: **Included and mandatory.** Constitution v1.3.0 makes strict TDD non-negotiable — *"No production code is written without a failing test waiting for it"* — and requires that *"`tasks.md` orders test tasks before implementation tasks."* Tenant isolation is additionally on the blocking critical-coverage list. Every test task below must be written, run, and **seen to fail** before the implementation tasks under it begin.

**Organization**: Grouped by user story so each can be implemented, tested and delivered independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story the task belongs to (US1–US5)
- Exact file paths are included in every task

## Path Conventions

Web application, backend only for this slice (no `frontend/` — `spec.md` assumes no UI). Paths follow the structure decision in [plan.md](./plan.md): `backend/src/`, `backend/drizzle/`, `backend/tests/`, `infra/`, `.github/workflows/`.

## TDD exemptions in force

Constitution exemption 1 covers declarative migrations and infrastructure manifests, so tasks touching `backend/drizzle/*.sql` and `infra/` carry no preceding test of their own. They are still *verified* by the test tasks that assert their effects (T014, T022, T038, T039).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and toolchain

- [X] T001 Create the backend directory structure per plan.md: `backend/src/common/{tenant,audit,permissions,db,http}/`, `backend/src/modules/{tenant,plan,audit}/`, `backend/drizzle/`, `backend/tests/{contract,integration/isolation,unit,fixtures}/`, `infra/`, `.github/workflows/`
- [X] T002 Initialize the TypeScript project and NestJS dependencies in `backend/package.json` and `backend/tsconfig.json`
- [X] T003 [P] Add Drizzle ORM and the `pg` driver to `backend/package.json` — Prisma is prohibited by the constitution
- [X] T004 [P] Add Vitest, Testcontainers and Supertest to `backend/package.json`
- [X] T005 [P] Configure ESLint and Prettier in `backend/eslint.config.mjs` and `backend/.prettierrc`
- [X] T006 [P] Configure Vitest in `backend/vitest.config.ts` with separate projects for `unit`, `contract`, `integration` and `integration/isolation`
- [X] T007 Add the npm scripts quickstart.md documents (`db:up`, `db:migrate`, `db:seed`, `dev`, `test`, `test:isolation`, `test:rls`, `verify:role`) to `backend/package.json`
- [X] T008 [P] Add local PostgreSQL for development in `backend/docker-compose.yml`
- [X] T009 [P] Add `backend/.env.example` declaring two separate connection strings — migration/owner role and application role
- [X] T010 [P] Add `backend/.gitignore` for `.env`, build output and coverage

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The database roles, tables, isolation policies and cross-cutting mechanisms every user story depends on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete. T011 and T015 in particular gate everything — a wrong database role leaves every policy written and the isolation nonexistent, with tests still passing.

### Database roles and clients

- [X] T011 Create the migration/owner role and a separate application role that is not superuser, owns no tables and lacks `BYPASSRLS`, in `backend/drizzle/0000_roles.sql`
- [X] T012 [P] Test (must fail first): the connected application role is not superuser, owns zero tables and lacks `BYPASSRLS`, in `backend/tests/integration/verify-role.test.ts` — quickstart V1
- [X] T013 Implement the Drizzle client bound to the application role in `backend/src/common/db/client.ts`
- [X] T014 Implement the startup assertion that reads the connected role's actual attributes and refuses to boot on failure, in `backend/src/main.ts`
- [X] T015 [P] Implement the second Drizzle client bound to the platform administration role in `backend/src/common/db/platform-client.ts` — research.md D9

### Schema

- [X] T016 [P] Create the `plan` table with `code`, `name`, `limits` and `entitlements` in `backend/drizzle/0001_plan.sql`
- [X] T017 [P] Create the `tenant` table with unique `rfc`, `status` enum, and the check constraint tying `deactivated_at` to `status`, in `backend/drizzle/0002_tenant.sql`
- [X] T018 Create the `audit_event` table range-partitioned monthly on `occurred_at`, primary key `(occurred_at, id)`, with a database-generated timestamp default, in `backend/drizzle/0003_audit_event.sql`
- [X] T019 Add the monthly partition creation helper and the initial partition set in `backend/drizzle/0004_audit_partitions.sql`
- [X] T020 Enable and FORCE row level security on `tenant` and `audit_event`, with the **null-safe predicate required by Constitution v1.3.0** in both `USING` and `WITH CHECK`, in `backend/drizzle/0005_rls.sql`
- [X] T021 Grant `INSERT` and `SELECT` only on `audit_event` to the application role — no `UPDATE`, no `DELETE` — and restrict `tenant`/`plan` mutation to the platform role, in `backend/drizzle/0006_grants.sql`
- [X] T022 Create the narrowly-scoped `SECURITY DEFINER` function whose only capability is appending an audit row outside the active tenant, in `backend/drizzle/0007_audit_append_fn.sql` — research.md D8
- [X] T023 [P] Implement the Drizzle schema definitions for Tenant, Plan and AuditEvent in `backend/src/common/db/schema.ts`

### Isolation coverage guard

- [X] T024 Implement the explicit registry of tenant-scoped tables, which must include the `tenant` table whose policy filters on `id` rather than `tenant_id`, in `backend/src/common/db/tenant-scoped-tables.ts`
- [X] T025 [P] Test (must fail first): every table carrying `tenant_id` **plus** every registered exception has row security enabled and an active policy, and a newly added table without one fails the check, in `backend/tests/integration/rls-coverage.test.ts` — quickstart V2

### Cross-cutting mechanisms

- [X] T026 [P] Implement identity and membership fixtures standing in for slice 002, including one identity holding live membership in two tenants, in `backend/tests/fixtures/identity.ts`
- [X] T027 [P] Implement the shared error body and the `404`-never-`403` helper for cross-tenant reach in `backend/src/common/http/errors.ts`
- [X] T028 [P] Implement the opaque forward cursor pagination helper (default 50, maximum 200) in `backend/src/common/http/pagination.ts`
- [X] T029 Implement the audit append primitive — same-transaction insert, database-generated timestamp, definer-function path for foreign-tenant writes — in `backend/src/common/audit/append.ts`
- [X] T030 Implement the audit action vocabulary and `source`/`metadata` builders for the seven actions in `backend/src/common/audit/actions.ts`
- [X] T031 Implement the global permission guard shell resolving the active membership's archetype in `backend/src/common/permissions/guard.ts` — **contingent on plan.md open item 1**; implements the recommended option (a), SA-only, with the full matrix left to slice 004
- [X] T032 [P] Implement the seed script — three plans, two tenants, and the dual-membership identity — in `backend/drizzle/seed.ts`
- [X] T033 [P] Add the CI workflow with secret scanning, dependency scanning, blocking coverage, RLS coverage and the no-context case, in `.github/workflows/ci.yml`
- [X] T034 [P] Add the Terraform/CDK skeleton declaring infrastructure as code in `infra/README.md` and `infra/main.tf`

**Checkpoint**: Roles, schema, policies and the append primitive exist. User story work can begin.

---

## Phase 3: User Story 1 - Guarantee data isolation between tenants (Priority: P1) 🎯 MVP

*US03-EP00-FND-EnforceTenantIsolation, US10-EP00-FND-LogCrossTenantAttempt*

**Goal**: A firm's data is unreachable from any other firm, enforced by the data layer rather than by application code, so a developer who forgets to narrow a query receives nothing.

**Independent Test**: Seed two tenants, open a session bound to tenant A, run a read carrying no tenant condition, and assert all of A's rows and none of B's. Requires no provisioning flow and no UI.

### Tests for User Story 1 ⚠️ Write first, watch them fail

- [X] T035 [P] [US1] Integration test: an unfiltered read returns **all of the active tenant's rows and zero foreign rows** in `backend/tests/integration/isolation/unfiltered-read.test.ts` — quickstart V3, SC-001
- [X] T036 [P] [US1] Integration test: **no tenant context active → zero rows and no error**, for every tenant-scoped table, in `backend/tests/integration/isolation/no-context.test.ts` — quickstart V15, Constitution v1.3.0
- [X] T037 [P] [US1] Integration test: a write carrying no explicit tenant value is attributed to the active tenant and cannot be attributed to another, in `backend/tests/integration/isolation/write-attribution.test.ts` — US1 scenario 3
- [X] T038 [P] [US1] Contract test: a cross-tenant request answers `404` with the generic body, never `403` and never `200`, in `backend/tests/contract/cross-tenant-404.test.ts` — quickstart V4, AS-02, SC-003
- [X] T039 [P] [US1] Integration test: the cross-tenant attempt is recorded against the **targeted** tenant and the entry **does not name the actor's home tenant**, in `backend/tests/integration/isolation/cross-attempt-record.test.ts` — quickstart V4, FR-023
- [X] T040 [P] [US1] Integration test: a request naming a tenant the identity holds no live membership in is refused and recorded as a cross-tenant attempt, in `backend/tests/integration/isolation/membership-refusal.test.ts` — US1 scenario 7, FR-022
- [X] T041 [P] [US1] Integration test: an identity with membership in two tenants sees only the active one, and no response reveals the other membership's existence or count, in `backend/tests/integration/isolation/multi-membership.test.ts` — quickstart V10, SC-014
- [X] T042 [P] [US1] Integration test: an asynchronous job carrying its tenant in the message envelope is isolated exactly as a request is, in `backend/tests/integration/isolation/async-job.test.ts` — quickstart V12, FR-005
- [X] T043 [P] [US1] Integration test: a cache read that omits the tenant prefix misses rather than returning a foreign entry, in `backend/tests/integration/isolation/cache-prefix.test.ts` — FR-005
- [X] T044 [P] [US1] Integration test: activating a deactivated tenant is refused and its records remain intact, in `backend/tests/integration/isolation/deactivated-refusal.test.ts` — quickstart V11, research.md D13

### Implementation for User Story 1

- [X] T045 [US1] Implement the tenant context resolver — verify a live membership joins identity and requested tenant, and that the tenant is active — in `backend/src/common/tenant/resolve.ts`
- [X] T046 [US1] Implement the global middleware that opens the request transaction and issues `SET LOCAL app.tenant_id` on that same connection before any business query, in `backend/src/common/tenant/middleware.ts`
- [X] T047 [US1] Implement the refusal paths — no identity, no tenant named, no live membership, revoked membership, deactivated tenant — in `backend/src/common/tenant/refusals.ts`
- [X] T048 [US1] Wire cross-tenant attempt recording through the definer function, omitting the actor's home tenant from the entry, in `backend/src/common/tenant/record-attempt.ts`
- [X] T049 [US1] Implement the async worker activation path reusing the identical membership verification and `SET LOCAL` sequence, in `backend/src/common/tenant/job-context.ts`
- [X] T050 [US1] Implement tenant-prefixed cache keys that miss rather than fall back, in `backend/src/common/tenant/cache-keys.ts`
- [X] T051 [US1] Register the middleware globally and confirm no business query filters tenant by hand, in `backend/src/app.module.ts`

**Checkpoint**: Isolation is enforced and provably fail-closed. This is the MVP boundary.

---

## Phase 4: User Story 2 - Record every mutation in an append-only log (Priority: P2)

*US06-EP00-FND-WriteAuditEvent, US07-EP00-FND-EnforceAuditImmutability*

**Goal**: Every change is recorded once, automatically, in a log normal operation can add to but never alter or erase.

**Independent Test**: Trigger any one mutation, assert exactly one entry carrying all six required fields, then attempt to modify and to delete that entry through the application and assert both fail at the data permission level.

### Tests for User Story 2 ⚠️ Write first, watch them fail

- [X] T052 [P] [US2] Integration test: `UPDATE` and `DELETE` against an existing audit entry both fail with a **permission error**, not a missing method, in `backend/tests/integration/audit-immutability.test.ts` — quickstart V5, AS-04, SC-005
- [X] T053 [P] [US2] Integration test: a mutation whose audit append fails leaves **zero observable effects**, in `backend/tests/integration/audit-atomicity.test.ts` — quickstart V6, FR-017, SC-012
- [X] T054 [P] [US2] Integration test: each audited action produces exactly one entry carrying actor, action, target entity, timestamp, source and tenant, in `backend/tests/integration/audit-fields.test.ts` — quickstart V13, SC-004
- [X] T055 [P] [US2] Integration test: two mutations in the same instant produce two distinct, individually addressable entries, in `backend/tests/integration/audit-distinctness.test.ts` — FR-018
- [X] T056 [P] [US2] Integration test: timestamps come from the database and a caller-supplied timestamp is rejected, in `backend/tests/integration/audit-timestamp.test.ts` — FR-020, research.md D10
- [X] T057 [P] [US2] Integration test: no entry contains end-client personal data, secrets or authentication factors, checked against a deny-list of shapes, in `backend/tests/integration/audit-no-pii.test.ts` — quickstart V14, FR-012, SC-006
- [X] T058 [P] [US2] Integration test: the definer function can append an audit row and **can do nothing else**, in `backend/tests/integration/audit-definer-scope.test.ts` — research.md D8

### Implementation for User Story 2

- [X] T059 [US2] Implement the global interceptor that appends the audit entry inside the mutation's own transaction, in `backend/src/common/audit/interceptor.ts`
- [X] T060 [US2] Register the interceptor globally over every mutation, so omitting it is an explicit act rather than an oversight, in `backend/src/app.module.ts`
- [X] T061 [US2] Implement the actor resolver mapping the active membership to `actor_identity_id` and `actor_membership_id`, with null for system and platform actors, in `backend/src/common/audit/actor.ts`
- [X] T062 [US2] Implement the `source` builder recording channel, coarse network origin and client class without personal data, in `backend/src/common/audit/source.ts`
- [X] T063 [US2] Implement the metadata sanitiser enforcing the no-personal-data, no-secrets rule at write time, in `backend/src/common/audit/sanitise.ts`

**Checkpoint**: Every mutation is recorded, atomically, in a log the application cannot rewrite.

---

## Phase 5: User Story 3 - Provision a new firm as an isolated tenant (Priority: P3)

*US01-EP00-FND-ProvisionTenant, US04-EP00-FND-DeactivateTenant*

**Goal**: An operator creates a contracted firm as a tenant with its commercial identity and plan, and can deactivate it without erasing anything.

**Independent Test**: Provision a tenant with name, RFC and plan; assert it exists, is active, is reachable only in its own scope, and that exactly one creation entry appears in the audit log.

### Tests for User Story 3 ⚠️ Write first, watch them fail

- [X] T064 [P] [US3] Contract test: `POST /internal/platform/tenants` returns `201` with the tenant body and records one `tenant.provisioned` entry, in `backend/tests/contract/provision-tenant.test.ts` — AS-01
- [X] T065 [P] [US3] Contract test: a duplicate RFC returns `409 rfc_already_registered` and leaves **no partial tenant**, raised by the unique constraint rather than a read-then-write check, in `backend/tests/contract/provision-duplicate-rfc.test.ts` — quickstart V7, US3 scenarios 2 & 5
- [X] T066 [P] [US3] Contract test: two concurrent provisionings with the same RFC produce exactly one tenant, in `backend/tests/contract/provision-concurrent-rfc.test.ts` — spec.md edge case
- [X] T067 [P] [US3] Contract test: `400 validation_failed` for empty name and for a malformed RFC, in `backend/tests/contract/provision-validation.test.ts` — FR-007
- [X] T068 [P] [US3] Contract test: `POST .../deactivate` returns `200`, records `tenant.deactivated`, and a second call returns `409 already_deactivated`, in `backend/tests/contract/deactivate-tenant.test.ts` — US3 scenario 3
- [X] T069 [P] [US3] Integration test: no capability anywhere hard-deletes a tenant, in `backend/tests/integration/no-hard-delete.test.ts` — FR-006, SC-011
- [X] T070 [P] [US3] Contract test: an **interactive** registry read records exactly one `tenant.registry_read` entry and an **automated** read records none, in `backend/tests/contract/registry-read-channel.test.ts` — quickstart V13, FR-026
- [X] T071 [P] [US3] Integration test: the platform administration path never traverses the tenant middleware and reaches only the `tenant`, `plan` and `audit_event` tables — never a business table, in `backend/tests/integration/platform-scope.test.ts` — FR-009, research.md D9

### Implementation for User Story 3

- [X] T072 [US3] Implement the tenant repository against the platform client in `backend/src/modules/tenant/tenant.repository.ts`
- [X] T073 [US3] Implement provisioning as a single transaction in `backend/src/modules/tenant/provision.service.ts`
- [X] T074 [US3] Implement deactivation as the one-way `active → deactivated` transition in `backend/src/modules/tenant/deactivate.service.ts`
- [X] T075 [US3] Implement RFC validation (12 or 13 characters, uppercase, valid shape) in `backend/src/modules/tenant/rfc.ts`
- [X] T076 [US3] Implement the platform administration controller for provision, deactivate and registry read in `backend/src/modules/tenant/platform.controller.ts`
- [X] T077 [US3] Apply the interactive-only channel gate to the registry read in `backend/src/modules/tenant/platform.controller.ts`
- [X] T078 [US3] Bind the platform surface to localhost only, since this slice authenticates nothing, in `backend/src/main.ts` — contracts/README.md

**Checkpoint**: Tenants can be created and deactivated, and every such act is traced.

---

## Phase 6: User Story 4 - Query the audit log scoped to own tenant (Priority: P4)

*US08-EP00-FND-QueryAuditLog*

**Goal**: An authorized person at a firm can read that firm's own audit history, and only that firm's.

**Independent Test**: With entries seeded for two tenants, query as an authorized member of tenant A and assert every returned event belongs to A and none to B.

### Tests for User Story 4 ⚠️ Write first, watch them fail

- [ ] T079 [P] [US4] Contract test: `GET /audit/events` returns only the caller's own tenant's events — zero foreign events across scenarios, in `backend/tests/contract/audit-query-scope.test.ts` — quickstart V9, SC-007
- [ ] T080 [P] [US4] Contract test: a caller whose membership archetype does not permit the read gets `403 not_authorized`, in `backend/tests/contract/audit-query-authz.test.ts` — FR-013
- [ ] T081 [P] [US4] Contract test: an **interactive** read adds exactly one `audit.queried` entry and an **automated** read adds none, asserted in both directions, in `backend/tests/contract/audit-query-channel.test.ts` — quickstart V9, FR-025, SC-015
- [ ] T082 [P] [US4] Contract test: `from`/`to` are clamped to 24 months, the response reports the window actually served, and no entry older than the window is returned, in `backend/tests/contract/audit-query-retention.test.ts` — US4 scenario 5, FR-019, SC-013
- [ ] T083 [P] [US4] Contract test: results are returned in bounded portions with a working forward cursor, and `limit` beyond the maximum is rejected, in `backend/tests/contract/audit-query-pagination.test.ts` — FR-013, US4 scenario 4
- [ ] T084 [P] [US4] Contract test: `GET /internal/platform/audit` may span tenants and accepts `tenantId` as an explicit filter, in `backend/tests/contract/platform-audit-query.test.ts` — contracts/platform-admin.md
- [ ] T085 [P] [US4] Integration test: the retention routine drops partitions past 24 months and the application role cannot invoke it, in `backend/tests/integration/audit-retention.test.ts` — FR-019

### Implementation for User Story 4

- [ ] T086 [US4] Implement the audit query repository with time-bounded, partition-pruning reads in `backend/src/modules/audit/audit.repository.ts`
- [ ] T087 [US4] Implement the retention window clamp and the `servedWindow` field in `backend/src/modules/audit/window.ts`
- [ ] T088 [US4] Implement the tenant-facing audit controller in `backend/src/modules/audit/audit.controller.ts`
- [ ] T089 [US4] Apply the interactive-only channel gate to `audit.queried` in `backend/src/modules/audit/audit.controller.ts`
- [ ] T090 [US4] Implement the platform-scope audit controller accepting `tenantId` in `backend/src/modules/audit/platform-audit.controller.ts`
- [ ] T091 [US4] Implement the retention job — detach and drop partitions past 24 months under a role the application does not hold — in `backend/drizzle/retention.sql` and `infra/retention-schedule.tf`
- [ ] T092 [US4] Implement rolling monthly partition creation ahead of need in `backend/src/modules/audit/partition-maintenance.ts`

**Checkpoint**: A firm can read its own history, bounded and traced, and the log prunes itself.

---

## Phase 7: User Story 5 - Assign and change a tenant's iguala plan (Priority: P5)

*US02-EP00-FND-AssignTenantPlan, US05-EP00-FND-ConfigureTenantLimits*

**Goal**: An operator assigns a tier at provisioning and changes it afterwards, and adjusts a tier's quantitative limits, without waiting for a software release.

**Independent Test**: Assign a plan, change it to another tier, and adjust that tier's limits — asserting each takes effect and is recorded, with zero deployments performed.

### Tests for User Story 5 ⚠️ Write first, watch them fail

- [ ] T093 [P] [US5] Contract test: `PATCH .../plan` changes the tier, records `tenant.plan_changed` with previous and new values, and performs no deployment, in `backend/tests/contract/plan-change.test.ts` — US5 scenario 1, SC-008
- [ ] T094 [P] [US5] Contract test: a change to a tier whose limits the tenant exceeds returns `409 limits_exceeded` **naming which limits**, and succeeds when re-sent with acknowledgement, in `backend/tests/contract/plan-limits-exceeded.test.ts` — US5 scenario 4
- [ ] T095 [P] [US5] Contract test: changing to the tier already in effect returns `422 same_plan`, and exactly one of the three tiers is ever in effect, in `backend/tests/contract/plan-invariants.test.ts` — US5 scenario 3
- [ ] T096 [P] [US5] Contract test: `PATCH .../plans/{code}/limits` adjusts limits with no deployment and records `plan.limits_changed`, in `backend/tests/contract/plan-limits-config.test.ts` — FR-016, FR-014
- [ ] T097 [P] [US5] Contract test: negative or non-integer limits return `400 validation_failed`, in `backend/tests/contract/plan-limits-validation.test.ts`

### Implementation for User Story 5

- [ ] T098 [US5] Implement the plan repository against the platform client in `backend/src/modules/plan/plan.repository.ts`
- [ ] T099 [US5] Implement the tier change service, including the exceeded-limits report and the acknowledgement path, in `backend/src/modules/plan/change-plan.service.ts`
- [ ] T100 [US5] Implement limits and entitlements configuration in `backend/src/modules/plan/configure-limits.service.ts`
- [ ] T101 [US5] Implement the plan controller in `backend/src/modules/plan/plan.controller.ts`
- [ ] T102 [US5] Document explicitly in `backend/src/modules/plan/README.md` that nothing in this slice **enforces** limits — enforcement is slice 004, and the `409` is an operator warning gate, not a technical constraint

**Checkpoint**: All five stories are independently functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T103 Run the full quickstart.md validation suite (V1–V15) and record the results in `specs/001-tenant-foundation/quickstart-results.md`
- [ ] T104 Verify SC-010 — first page of an audit query over the full retained history under 3 seconds — in `backend/tests/integration/audit-latency.test.ts`
- [ ] T105 [P] Verify blocking coverage on tenant isolation meets the constitution's critical-coverage requirement, in `.github/workflows/ci.yml`
- [ ] T106 [P] Add the operator runbook for provisioning, deactivation and plan changes in `docs/runbook-platform-admin.md`
- [ ] T107 [P] Add developer documentation on why no business query filters tenant by hand in `docs/tenant-isolation.md`
- [ ] T108 Security hardening review: confirm no secret reaches the repository, logs or error messages, in `backend/src/common/http/errors.ts` and `.github/workflows/ci.yml`
- [ ] T109 Code cleanup and refactoring pass across `backend/src/common/`
- [ ] T110 Confirm the walking skeleton items this slice owns (2, 3 and part of 6) are demonstrably standing, and record the gap list for slices 002–004 in `specs/001-tenant-foundation/skeleton-status.md`

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: depends on Setup — **blocks every user story**
- **User Stories (Phases 3–7)**: all depend on Foundational
- **Polish (Phase 8)**: depends on the stories you intend to ship

### Two hard gates inside Phase 2

- **T011 → T012 → T014** must land before any isolation work. If the application connects as owner or superuser, every policy is still written and there is no isolation, and the test suite will not tell you.
- **T020** carries the null-safe predicate. Without it a request with no active tenant context fails loudly instead of failing closed, and the difference is invisible in local development. T036 is the test that catches it.

### User story dependencies — read this before parallelising

The stories are **not** as independent as the template's default assumes, and pretending otherwise would produce a broken plan:

- **US1 (P1)** needs the audit append primitive (T029) and the definer function (T022) from Foundational, because AS-02 requires a cross-tenant attempt to be *recorded*. Those live in Phase 2 precisely so US1 stays independently testable.
- **US2 (P2)** generalises that primitive into the global interceptor. It does not depend on US1's middleware, but its atomicity test is more meaningful once US1 exists.
- **US3 (P3)** genuinely depends on US1 and US2: provisioning must land inside the isolation boundary and emit an audit entry.
- **US4 (P4)** depends on US2 having written entries.
- **US5 (P5)** depends on US3 for a tenant to change the plan of.

Practical order: **US1 → US2 → US3 → {US4, US5 in parallel}**.

### Within each story

Tests first, watched failing. Then schema, then repositories, then services, then controllers, then global registration.

### Parallel opportunities

- Setup: T003–T006 and T008–T010 in parallel
- Foundational: T016 and T017 in parallel; T023, T026, T027, T028, T032, T033, T034 in parallel
- Every test task inside a story phase is marked `[P]` — they touch different files and can be written concurrently
- Once US1 and US2 are done, US4 and US5 can be staffed in parallel with US3's tail

---

## Parallel Example: User Story 1 tests

```bash
# Write all ten US1 tests together, then watch every one fail before T045 begins:
Task: "Unfiltered read returns own rows and zero foreign rows — isolation/unfiltered-read.test.ts"
Task: "No tenant context → zero rows and no error — isolation/no-context.test.ts"
Task: "Write attribution cannot cross tenants — isolation/write-attribution.test.ts"
Task: "Cross-tenant request answers 404 — contract/cross-tenant-404.test.ts"
Task: "Attempt recorded against target, actor's home tenant absent — isolation/cross-attempt-record.test.ts"
Task: "Request naming a non-member tenant is refused — isolation/membership-refusal.test.ts"
Task: "Dual membership leaks neither way — isolation/multi-membership.test.ts"
Task: "Async job isolation — isolation/async-job.test.ts"
Task: "Cache prefix miss — isolation/cache-prefix.test.ts"
Task: "Deactivated tenant refuses activation — isolation/deactivated-refusal.test.ts"
```

---

## Implementation Strategy

### MVP scope

**Phase 1 + Phase 2 + Phase 3 (User Story 1)** — 51 tasks.

Stated plainly: this MVP is a **technical foundation, not a demoable business feature**. What it delivers is the guarantee that privileged data cannot cross between firms, proven by tests, before any privileged data exists. `spec.md` says as much — no business feature can be specified or built before tenant separation exists.

1. Complete Setup
2. Complete Foundational — do not skip T012 or T036
3. Complete User Story 1
4. **STOP and VALIDATE**: run `test:isolation` and `verify:role`
5. Only then move on

### Incremental delivery

1. Setup + Foundational → the boundary exists
2. + US1 → isolation is enforced and fail-closed **(MVP)**
3. + US2 → every mutation is traced, atomically
4. + US3 → firms can be created and deactivated
5. + US4 → firms can read their own history
6. + US5 → tiers and limits are operable

### Parallel team strategy

Foundational is a poor candidate for splitting — T011 through T022 are tightly coupled and one wrong role setting invalidates the rest. Do that phase together. After it: one developer on US1 then US3, another on US2 then US4, a third picking up US5 once US3 lands.

---

## Notes

- `[P]` means different files and no dependency on incomplete work
- Every test task must be **seen to fail** before its implementation task begins — the constitution requires the PR history to evidence it
- The two channel-gated audit actions (`audit.queried`, `tenant.registry_read`) are asserted in **both** directions; one direction alone passes against an implementation that records nothing
- Commit after each task or logical group
- **T031 is contingent** on plan.md open item 1 — if the lead chooses option (b), delete T031 and move T079–T089 to slice 004
- The two still-open items in plan.md do not block any task here
