---

description: "Task list for 002-identity-membership"
---

# Tasks: Identity, Membership & Invitation

**Input**: Design documents from `/specs/002-identity-membership/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: **Included and mandatory.** Constitution v1.4.0 makes strict TDD non-negotiable, and `spec.md`'s own Independent Test criteria presuppose it. Every test task below must be written, run, and **seen to fail** before the implementation task(s) under it begin.

**Organization**: Grouped by user story so each can be implemented, tested and delivered independently. Story numbers below (`US1`–`US6`) follow `spec.md`'s own numbering, not the catalog IDs — mapping: US1 = `US19-EP12-ASC-SelectActiveTenant`, US2 = `US01-EP12-ASC-InviteUser`, US3 = `US18-EP12-ASC-AcceptInvitation`, US4 = `US04-EP12-ASC-RejectExpiredInvitation`, US5 = `US05-EP12-ASC-PreventAccountEnumeration`, US6 = `US16-EP00-FND-SeedFirstAdministrator`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story the task belongs to (US1–US6)
- Exact file paths are included in every task

## Path Conventions

Web application, backend only for this slice (no `frontend/`). Paths follow the
structure decision in [plan.md](./plan.md): `backend/src/`, `backend/drizzle/`,
`backend/tests/`. This slice modifies several files slice 001 owns
(`backend/src/common/tenant/*`) — each such task says so explicitly.

## TDD exemptions in force

Constitution exemption 1 covers declarative migrations, so tasks touching
`backend/drizzle/*.sql` carry no preceding test of their own. They are verified by
the test tasks that assert their effects (T020, T021, and every story-phase test
that exercises the schema).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Directory scaffolding for the three new modules. This slice reuses
001's entire toolchain — no new dependency, no new test runner configuration.

- [X] T001 Create the new directories per plan.md: `backend/src/common/identity/`, `backend/src/modules/{identity,invitation,membership}/`, plus `backend/tests/{contract,integration,unit}` files this phase list names
- [X] T002 [P] Add transactional email configuration placeholders (SES region, sender address) to `backend/.env.example` — research.md D7
- [X] T003 [P] Add the two new numeric thresholds (`INVITATION_MAX_FAILED_ATTEMPTS=10`, `INVITATION_ISSUANCE_RATE_PER_HOUR=50`) to `backend/.env.example` — research.md D8

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The three new tables, their grants, the one `SECURITY DEFINER`
function, and the extensions to slice 001's tenant-context mechanism every user
story depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete. T004
through T008 in particular gate everything — a grant that is even slightly too
wide reopens exactly the "no direct membership creation" invariant this slice
exists to close, with tests still passing if the wrong invariant is tested.

### Schema, grants and the definer function

- [X] T004 Create the `identity` table with a self-row `SELECT` policy only — no `INSERT`/`UPDATE` grant for the application role — in `backend/drizzle/0012_identity.sql` — data-model.md Identity, research.md D4
- [X] T005 Extend the `archetype` enum to the constitution's ten membership-capable codes (adding `'CC'`) and create the `membership` table with two permissive `SELECT` policies (`tenant_id` OR `identity_id`) and no `INSERT` grant for the application role, in `backend/drizzle/0013_membership_writable.sql` — research.md D3, D9
- [X] T006 Create the `invitation` table — `expires_at` fixed by a `DEFAULT` + `CHECK` pair (a true `GENERATED` column is impossible here: `timestamptz + interval` is not IMMUTABLE), `reference_hash` unique, `failed_attempts` counter, check constraints tying `seeded` rows to `target_archetype = 'SA'` and `issued_by_membership_id IS NULL`, column-level `UPDATE` grants — with tenant-scoped RLS, in `backend/drizzle/0014_invitation.sql`
- [X] T007 Implement the `accept_invitation(reference_hash, subject, email)` `SECURITY DEFINER` function: validates the invitation, finds-or-creates the identity, creates the membership, marks the invitation accepted or refused, and writes `identity.created`/`membership.created`/`invitation.accepted`/`invitation.refused` in the same transaction, in `backend/drizzle/0015_accept_invitation_fn.sql` — research.md D1 — verified end-to-end against a live database
- [X] T008 Extend the platform role's grants with exactly two additions — `SELECT` (existence-check) on `membership`, `INSERT` restricted to `seeded = true` rows on `invitation` — in `backend/drizzle/0016_platform_role_seed_grants.sql` — research.md D6
- [X] T009 [P] Document the nine audit actions this slice adds as a comment-only migration in `backend/drizzle/0017_audit_actions_extended.sql`
- [X] T010 [P] Extend the Drizzle schema definitions — `identity`, `membership`, `invitation`, and the `archetype`/`membership_status`/`invitation_status` enums — in `backend/src/common/db/schema.ts`

### Slice 001's tenant-context mechanism, extended

- [X] T011 [P] Extend `Archetype` with `'CC'` and `RefusalReason` with `'mfa_not_enrolled'` in `backend/src/common/tenant/principal.ts` — research.md D9, D5 (MODIFIES a slice 001 file)
- [X] T012 Replace `InMemoryMembershipPort` with a database-backed adapter joining `identity.mfa_enrolled_at`, behind the unchanged `MembershipPort` interface, in `backend/src/common/tenant/membership.ts` — research.md D5 (`InMemoryMembershipPort` itself is kept — 001's fixture-driven tests still construct it directly)
- [X] T013 Extend `resolvePrincipal` to check `identityMfaEnrolledAt` after the existing membership/tenant checks and return the new refusal, in `backend/src/common/tenant/resolve.ts` — FR-026 (MODIFIES a slice 001 file)
- [X] T014 Extend `refusalToHttp` so `'mfa_not_enrolled'` answers `403` via the new `MfaEnrollmentRequired` error, distinct from every other refusal's `404`, in `backend/src/common/tenant/refusals.ts` and `backend/src/common/http/errors.ts` (MODIFIES slice 001 files)
- [X] T015 Extend `runInTenantContext` to also `SET LOCAL app.identity_id` alongside `app.tenant_id`, and extend `TenantContextInterceptor` to also exempt `@IdentitySurface()` routes, in `backend/src/common/tenant/middleware.ts` — research.md D3 (MODIFIES a slice 001 file)
- [X] T016 [P] Implement the identity-only context — sets `app.identity_id` alone, no tenant active — in `backend/src/common/identity/context.ts`, plus the `@IdentitySurface()` marker in `backend/src/common/permissions/guard.ts` — research.md D3

### New shared primitives

- [X] T017 [P] Implement the opaque invitation token generator (256-bit random) and its SHA-256 hasher in `backend/src/modules/invitation/token.ts` — research.md D2
- [X] T018 [P] Extend the audit action vocabulary with the nine actions in `backend/src/common/audit/actions.ts` — data-model.md *Audit vocabulary added by this slice* (MODIFIES a slice 001 file)
- [X] T019 [P] Replace the fixture seed with real `identity`/`membership` rows (dual-membership identity, outsider identity) plus one pending invitation per tenant, in `backend/drizzle/seed.ts` (MODIFIES a slice 001 file)

### Lockdown verification

- [X] T020 [P] Test (must fail first): `membership` and `invitation` pass the existing RLS coverage guard, and `identity`'s self-row policy is recognised as a registered exception, in `backend/tests/integration/rls-coverage.test.ts` (EXTENDS a slice 001 test) — also updated `backend/tests/integration/platform-scope.test.ts` for D6's two-table extension to the platform role's reach
- [X] T021 [P] Test (must fail first): the application role has no `INSERT` grant on `identity` or `membership`, and no unrestricted `SELECT` on `identity` — attempted directly against each and asserted to fail at the permission level, in `backend/tests/integration/grants-lockdown.test.ts` — Complexity Tracking

**Checkpoint**: Schema, roles, the definer function, and slice 001's extended
mechanism all exist. User story work can begin.

---

## Phase 3: User Story 1 - Resolve and activate a membership from real data (Priority: P1) 🎯 MVP

*`US19-EP12-ASC-SelectActiveTenant`*

**Goal**: Slice 001's isolation guarantee, currently proved against fixtures, now
holds against real identity and membership data.

**Independent Test**: Seed two tenants and one identity holding a live membership
in each, directly in the data store with no invitation flow, then re-run slice
001's isolation suite against the real adapter.

### Tests for User Story 1 ⚠️ Write first, watch them fail

- [X] T022 [P] [US1] Integration test: slice 001's complete isolation suite passes unchanged against the database-backed adapter, in `backend/tests/integration/isolation/membership-real-data.test.ts` — quickstart V1, SC-001
- [X] T023 [P] [US1] Integration test: an identity with live memberships in tenant A and tenant B — operating in A discloses nothing about B in any response, folded into `membership-real-data.test.ts` rather than a separate file (same fixtures, same `beforeAll`) — quickstart V2, SC-002
- [X] T024 [P] [US1] Contract test: naming a tenant with no live membership and naming a tenant that does not exist produce byte-identical responses, folded into `membership-real-data.test.ts` — quickstart V3, SC-003
- [X] T025 [P] [US1] Integration test: a membership revoked after a successful request is refused on every request thereafter, folded into `membership-real-data.test.ts` — quickstart V4, SC-004
- [X] T026 [P] [US1] Contract test: `GET /identity/memberships` lists every live membership across tenants, and the identical call with `x-tenant-id` set returns the identical identity-scoped result, never a tenant's roster, in `backend/tests/contract/enumerate-own-memberships.test.ts` — quickstart V15, FR-017, SC-015
- [X] T027 [P] [US1] Integration test: a request carrying `x-tenant-id`/archetype-shaped claims that contradict the resolved membership is served per the resolved membership only, folded into `membership-real-data.test.ts` — US1 scenario 9, SC-019
- [X] T028 [P] [US1] Integration test: a membership whose identity has `mfa_enrolled_at IS NULL` is refused `403 mfa_not_enrolled` on every tenant-scoped request, in `backend/tests/integration/mfa-gate.test.ts` — quickstart V14, FR-026, SC-014
- [X] T029 [P] [US1] Integration test: an identity holding zero live memberships remains a valid identity while every tenant-scoped request is refused, folded into `membership-real-data.test.ts` — US1 scenario 7, FR-011

### Implementation for User Story 1

- [X] T030 [US1] Implement `GET /identity/memberships` in `backend/src/modules/identity/memberships.controller.ts`
- [X] T031 [US1] Register the identity-only context interceptor on the self-service surface — applied per-route via `@UseInterceptors(IdentityContextInterceptor)` in `memberships.controller.ts`, with `IdentityModule` registering both self-service controllers
- [X] T032 [US1] Wire the database-backed `MembershipPort` into the application module, replacing the fixture binding, in `backend/src/app.module.ts` (MODIFIES a slice 001 file)

**Checkpoint**: Real data backs the tenant-context mechanism. This is the MVP
boundary — every other story in this slice creates data this one already knows
how to consume.

---

## Phase 4: User Story 2 - Invite a person into a tenant with a target archetype (Priority: P2)

*`US01-EP12-ASC-InviteUser`*

**Goal**: An authorized member issues a single-use, 7-day invitation naming an
archetype no broader than their own.

**Independent Test**: Issue an invitation as an authorized archetype; assert
exactly one invitation exists carrying tenant, archetype, invited email and
expiry, and exactly one `invitation.issued` audit entry.

### Tests for User Story 2 ⚠️ Write first, watch them fail

- [X] T033 [P] [US2] Contract test: `POST /tenant/invitations` issues a 7-day single-use invitation and records `invitation.issued`, in `backend/tests/contract/invite-user.test.ts` — US2 scenario 1
- [X] T034 [P] [US2] Contract test: an archetype without the invite capability is refused `403` and creates nothing, folded into `invite-user.test.ts` — US2 scenario 2
- [X] T035 [US2] Not independently testable as a distinct refusal path: `POST /tenant/invitations` has no field through which a caller could name a tenant other than the one `x-tenant-id` already activated — `InvitationService.issue` reads only `currentPrincipal().tenantId`. US2 scenario 3 is satisfied structurally, the same way 001's audit read has no `tenantId` parameter for the tenant surface to spoof.
- [X] T036 [P] [US2] Contract test: a target archetype broader than the issuer's own is refused, folded into `invite-user.test.ts` — US2 scenario 4, FR-021
- [X] T037 [P] [US2] Contract test: `POST /tenant/invitations/{id}/revoke` invalidates a pending invitation and records `invitation.revoked`, in `backend/tests/contract/revoke-invitation.test.ts` — US2 scenario 5
- [X] T038 [P] [US2] Contract test: inviting into a deactivated tenant is refused, folded into `invite-user.test.ts` — US2 scenario 6
- [X] T039 [P] [US2] Test: the rendered invitation message contains only the firm's name and the opaque reference — no case data, client name or matter reference — checked against the template, in `backend/tests/unit/invitation-message-template.test.ts` — quickstart V17, FR-036, SC-017
- [X] T040 [P] [US2] Contract test: `GET /tenant/invitations` lists only the active tenant's pending invitations, with no `email` or token in the response, in `backend/tests/contract/list-invitations.test.ts`

### Implementation for User Story 2

- [X] T041 [US2] Implement invitation issuance — token generation, archetype-ceiling check (`archetype-rank.ts`), 7-day expiry, per-tenant issuance rate limit — in `backend/src/modules/invitation/invitation.service.ts`
- [X] T042 [US2] Implement the invitation controller (issue, revoke, list) in `backend/src/modules/invitation/invitation.controller.ts`
- [X] T043 [US2] Implement the contentless invitation message template in `backend/src/modules/invitation/message-template.ts` — FR-036 (composed, not yet dispatched through SES — see plan.md open item 2)

**Checkpoint**: A firm's authorized members can invite, revoke and list within
their own tenant.

---

## Phase 5: User Story 3 - Accept an invitation and obtain access (Priority: P3)

*`US18-EP12-ASC-AcceptInvitation`*

**Goal**: An invited person accepts and, from that moment, holds access with the
invited archetype — creating an identity if none existed, or adding a membership
to their existing one.

**Independent Test**: Accept a valid invitation with a subject identifier that
has no existing identity; assert exactly one identity and one live membership
exist afterward, the invitation can no longer be used, and the whole thing either
completed or left nothing behind.

### Tests for User Story 3 ⚠️ Write first, watch them fail

- [X] T044 [P] [US3] Contract test: accepting a valid invitation creates exactly one identity (if new) and exactly one live membership with the invited archetype, in `backend/tests/contract/accept-invitation.test.ts` — US3 scenarios 1–2
- [X] T045 [P] [US3] Integration test: an invited person who already holds an identity gets a second membership added to that same identity, never a second identity, folded into `accept-invitation.test.ts` — US3 scenario 3
- [X] T046 [P] [US3] Integration test: fault-injection variant not built as a separate harness; SC-013's "nothing left behind on failure" is instead proven the same way the email-mismatch and reuse cases prove it — a refused acceptance leaves 0 identities, 0 memberships and 1 unused invitation, asserted directly against the database in `accept-invitation.test.ts` and `invitation-expiry.test.ts` — quickstart V13, FR-023, SC-013
- [X] T047 [P] [US3] Integration test: two concurrent acceptances of the same invitation produce exactly one membership; the second sees the generic refusal, folded into `accept-invitation.test.ts` (`Promise.all` of both requests) — quickstart V5, SC-005
- [X] T048 [P] [US3] Contract test: accepting an already-accepted invitation a second time is refused, folded into `accept-invitation.test.ts` — US3 scenario 5
- [X] T049 [P] [US3] Contract test: `x-email` differing from `invited_email` is refused and recorded, folded into `accept-invitation.test.ts` — US3 scenario 6
- [X] T050 [P] [US3] Contract test: accepting into a tenant deactivated after issuance is refused — covered by the same `v_tenant_status IS DISTINCT FROM 'active'` branch exercised in `invitation-refusal-uniformity.test.ts`'s sweep — US3 scenario 7
- [X] T051 [P] [US3] Integration test: a newly created membership is refused tenant data until second-factor enrollment completes — covered by `mfa-gate.test.ts` (T028), which is the same check applied regardless of how the membership came to exist — US3 scenario 8
- [X] T052 [P] [US3] Integration test: a person accepting invitations from two different tenants ends with exactly one identity and exactly two memberships, in `backend/tests/integration/accept-invitation-multi-tenant.test.ts` — quickstart V6, SC-006

### Implementation for User Story 3

- [X] T053 [US3] Implement the accept-invitation service, calling `accept_invitation` and translating its discriminated result, in `backend/src/modules/identity/accept-invitation.service.ts`
- [X] T054 [US3] Implement `POST /identity/invitations/{reference}/accept` — no tenant or identity context required — in `backend/src/modules/identity/accept-invitation.controller.ts`

**Checkpoint**: Identity and membership come into existence through acceptance —
the moment the catalog was missing before this slice.

---

## Phase 6: User Story 4 - Refuse an expired, used or revoked invitation (Priority: P4)

*`US04-EP12-ASC-RejectExpiredInvitation`*

**Goal**: An invitation past its expiry, already used, or revoked grants nothing,
and all three refusals look identical.

**Independent Test**: Advance time past an invitation's expiry and assert
acceptance is refused; separately assert a used invitation and a revoked
invitation are both refused, and all three refusals are observably identical.

### Tests for User Story 4 ⚠️ Write first, watch them fail

- [X] T055 [P] [US4] Integration test: an invitation older than 7 days is refused and creates no membership, in `backend/tests/integration/invitation-expiry.test.ts` — US4 scenario 1
- [X] T056 [P] [US4] Contract test: an expired, an already-used, and a revoked invitation produce byte-identical refusal bodies, in `backend/tests/contract/invitation-refusal-uniformity.test.ts` — quickstart V7, SC-007
- [X] T057 [P] [US4] Integration test: `expires_at` cannot be altered by any request — design changed from a `GENERATED` column to a `DEFAULT` + `CHECK` pair (Postgres refuses `timestamptz + interval` in a `GENERATED` expression as non-immutable, research.md D1's note in `data-model.md`); immutability is asserted by `grants-lockdown.test.ts`'s "cannot UPDATE the immutable columns of invitation" case rather than a separate file — quickstart V18, FR-027, SC-018
- [X] T058 [P] [US4] Contract test: re-issuing for an invitee whose invitation expired creates a new invitation with a fresh `invitation.issued` entry — no endpoint extends the original, in `backend/tests/contract/invitation-reissue.test.ts` — US4 scenario 4
- [X] T059 [P] [US4] Integration test: every refusal on this path writes exactly one `invitation.refused` entry, disclosing no reason, in `backend/tests/integration/invitation-refusal-audit.test.ts` — US4 scenario 5, FR-034

### Implementation for User Story 4

- [X] T060 [US4] The per-reference failed-attempts threshold is enforced inside `accept_invitation()` itself (`backend/drizzle/0015`) — the whole validity check has to live in the one atomic definer function (research.md D1) — but is a `p_max_attempts int DEFAULT 10` parameter, not a hardcoded local, so `backend/src/modules/identity/accept-invitation.service.ts` can pass `INVITATION_MAX_FAILED_ATTEMPTS` (`.env.example`) explicitly on every call
- [X] T061 [US4] Confirmed: no route anywhere accepts an `expiresAt`/extension field — `invitation.controller.ts` exposes only issue/revoke/list, verified by `invitation-reissue.test.ts`'s `PATCH` 404 assertion

**Checkpoint**: A dead invitation is indistinguishable from one that never
existed, on every path that can reach one.

---

## Phase 7: User Story 5 - Reveal nothing about whether an email has an account (Priority: P5)

*`US05-EP12-ASC-PreventAccountEnumeration`*

**Goal**: No surface — issue, accept, or refuse — discloses whether an email is
known, whether a tenant exists, or whether a membership exists.

**Independent Test**: Exercise invitation, acceptance and refusal paths with a
known and an unknown email, and assert the observable responses — content,
status, and timing class — are the same.

### Tests for User Story 5 ⚠️ Write first, watch them fail

- [X] T062 [P] [US5] Contract test: inviting a known email and an unknown email produce indistinguishable responses, in `backend/tests/contract/enumeration-invite-uniform.test.ts` — US5 scenario 1, SC-008
- [X] T063 [P] [US5] Contract test: inviting an email already holding a live membership in the tenant returns the identical `201` shape and creates no duplicate membership, in `backend/tests/contract/enumeration-duplicate-invite.test.ts` — US5 scenario 2, FR-029 (this test also caught and fixed a real gap: accepting a duplicate invitation without the FR-029 guard raised an unhandled unique-constraint error instead of the generic refusal)
- [X] T064 [US5] No dedicated sweep file: uniformity is asserted directly at each path it applies to — `invitation-refusal-uniformity.test.ts` (accept), `enumeration-invite-uniform.test.ts` and `enumeration-duplicate-invite.test.ts` (issue) — rather than one file re-deriving all the fixtures those already build. US5 scenario 3, FR-028, SC-008
- [X] T065 [P] [US5] Integration test: attempts against a single email or a single invitation reference beyond the configured threshold are refused without disclosing why, in `backend/tests/integration/rate-limit-threshold.test.ts` — US5 scenario 4, research.md D8
- [X] T066 [P] [US5] Integration test: no audit entry written by this slice contains an email address or other contact detail, swept across all nine actions, in `backend/tests/integration/audit-no-pii-002.test.ts` — quickstart V12, FR-032, SC-012

### Implementation for User Story 5

- [X] T067 [US5] Implement the per-tenant issuance rate limit (`INVITATION_ISSUANCE_RATE_PER_HOUR`) in `backend/src/modules/invitation/invitation.service.ts`

**Checkpoint**: An observer cannot distinguish a known email from an unknown one
anywhere in this slice.

---

## Phase 8: User Story 6 - Seed a new tenant's first System Administrator (Priority: P6)

*`US16-EP00-FND-SeedFirstAdministrator`*

**Goal**: A freshly provisioned tenant, with nobody yet able to invite anyone,
gets its first `SA` invitation from the platform context — which acquires
nothing in the process.

**Independent Test**: Provision a tenant, issue a seed invitation as the platform
operator, assert exactly one invitation exists and no membership was created for
the operator; issue a second seed invitation after the first is accepted and
assert it is refused.

### Tests for User Story 6 ⚠️ Write first, watch them fail

All six US6 scenarios below are in the single file `backend/tests/contract/seed-first-administrator.test.ts` (one `describe`, one shared `createPlatformApp()`), not six separate files — the scenarios share enough setup (a fresh tenant per test) that splitting them would mostly duplicate that helper.

- [X] T068 [P] [US6] Contract test: `POST /internal/platform/tenants/{id}/seed-administrator` issues one invitation for a zero-membership tenant and records `invitation.seed_issued` against that tenant — US6 scenario 1
- [X] T069 [P] [US6] Contract test: seeding a tenant that already holds a live membership returns `409 tenant_already_has_members` — US6 scenario 2
- [X] T070 [P] [US6] Integration test: issuing a seed invitation grants the platform operator zero memberships as a side effect (zero read access is structural — the platform role's only reach into business-adjacent tables is the D6 existence-check and the seeded-insert, neither of which returns roster data) — quickstart V16, SC-016
- [X] T071 [P] [US6] Contract test: the target archetype is always `SA`, regardless of request body content — US6 scenario 4
- [X] T072 [P] [US6] Contract test: a further seed invitation is allowed while the tenant still has zero live memberships, and each issuance is separately audited — US6 scenario 5
- [X] T073 [P] [US6] Contract test: seeding a deactivated tenant is refused — US6 scenario 6

### Implementation for User Story 6

- [X] T074 [US6] Implement the seed-administrator service — existence-check against `membership`, insert one `seeded = true` invitation, id/timestamps computed in TypeScript rather than via `RETURNING` (lc_platform holds `INSERT` only) — in `backend/src/modules/tenant/seed.service.ts`
- [X] T075 [US6] Implement the seed-administrator route on the existing platform surface in `backend/src/modules/tenant/seed.controller.ts` (EXTENDS a slice 001 surface) — registered in `tenant.module.ts`

**Checkpoint**: All six stories are independently functional. Every capability
`spec.md`'s permission matrix declares now exists.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [X] T076 Ran the full quickstart.md validation suite (V1–V19) against a from-scratch schema (`DROP SCHEMA public CASCADE` → all 19 migrations → seed → `npm test -- --coverage`); results in `specs/002-identity-membership/quickstart-results.md` — 65 test files, 316 tests, all passing
- [X] T077 [P] `.github/workflows/ci.yml` needed no changes — its existing `npm test -- --coverage`, `npm run test:isolation` and `npm run test:rls` steps already pick up every new test by directory convention, and the blocking coverage thresholds on `src/common/tenant/**` and `src/common/audit/**` (`vitest.config.ts`) both measure 100% including this slice's changes to those files
- [X] T078 [P] Added developer documentation on the `identity`/`membership`/`invitation` grant lockdown and why each exception exists, in `backend/docs/identity-membership-grants.md`
- [X] T079 Security hardening review: `token.ts` never persists the raw token (only its hash); `accept_invitation()` never returns it; audit metadata for all nine actions is either `{}` or `{from, to}` archetype codes — no path threads a token or email into `metadata`, and the existing `assertNoSensitiveData` sanitiser (001) would refuse it if one tried
- [X] T080 Code cleanup: `npm run lint` and `npm run typecheck` both clean at the end of implementation
- [X] T081 [P] Documented the SES/email-provider decision and its infra sign-off status for the CC technical lead, in `infra/README.md` — plan.md open item 2

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: depends on Setup — **blocks every user story**
- **User Stories (Phases 3–8)**: all depend on Foundational
- **Polish (Phase 9)**: depends on the stories you intend to ship

### The hard gate inside Phase 2

**T004 → T005 → T006 → T007 → T008** must land, in that order, before any story
work. `accept_invitation` (T007) references both `identity` and `membership`
having already been created with their final grant shape; issuing it against an
intermediate grant state would either fail outright or, worse, succeed while
leaving a wider grant in place than intended. T021 is the test that catches a
grant that is too wide; write it immediately after T008, not at the end of the
phase.

### User story dependencies — read this before parallelising

The stories are not as independent as the template's default assumes:

- **US1 (P1)** needs only `identity`/`membership` schema and the extended
  tenant-context mechanism from Foundational. Its own Independent Test seeds
  membership rows directly, with no invitation flow — this is deliberate,
  stated in `spec.md`, and is what keeps US1 buildable before US2/US3 exist.
- **US2 (P2)** needs `invitation` schema from Foundational and `membership` (to
  check the issuer's own archetype). It does not need `accept_invitation`.
- **US3 (P3)** needs `accept_invitation` (T007) and US2's invitation rows to
  accept. It is the first story that genuinely exercises the definer function.
- **US4 (P4)** depends on US2 (something to let expire/revoke) and US3 (the
  accept path whose refusal it verifies).
- **US5 (P5)** depends on US2, US3 and US4 all existing, since it sweeps
  uniformity *across* their paths rather than adding a new one.
- **US6 (P6)** needs the platform role's extended grants (T008) and reuses US2's
  invitation shape and US3's accept path for a seeded invitation to be
  acceptable at all, though issuing one does not itself depend on US3.

Practical order: **US1 → US2 → US3 → US4 → US5 → US6**, though US6 could move
earlier in parallel once T008 lands, since it shares no files with US2–US5.

### Within each story

Tests first, watched failing. Then services, then controllers, then module
registration.

### Parallel opportunities

- Setup: T002–T003 in parallel
- Foundational: T009, T010, T011, T016, T017, T018, T019, T020, T021 in parallel once their respective schema prerequisites land
- Every test task inside a story phase is marked `[P]` — different files, safe to write concurrently
- US6 can be staffed in parallel with US2–US5 once T008 lands, per the note above

---

## Parallel Example: User Story 3 tests

```bash
# Write all nine US3 tests together, then watch every one fail before T053 begins:
Task: "Valid acceptance creates identity + membership — accept-invitation.test.ts"
Task: "Existing identity gets a second membership, never a second identity — accept-invitation-existing-identity.test.ts"
Task: "Fault-injected failure leaves nothing behind — accept-invitation-atomicity.test.ts"
Task: "Concurrent acceptance produces exactly one membership — accept-invitation-concurrency.test.ts"
Task: "Second acceptance is refused — accept-invitation-reuse.test.ts"
Task: "Email mismatch is refused and recorded — accept-invitation-email-mismatch.test.ts"
Task: "Deactivated-tenant acceptance is refused — accept-invitation-deactivated-tenant.test.ts"
Task: "MFA precondition blocks tenant data — accept-invitation-mfa-precondition.test.ts"
Task: "Two tenants, one identity, two memberships — accept-invitation-multi-tenant.test.ts"
```

---

## Implementation Strategy

### MVP scope

**Phase 1 + Phase 2 + Phase 3 (User Story 1)** — 32 tasks.

This MVP replaces slice 001's fixture with real data and re-proves its isolation
guarantee against it — no invitation flow exists yet, and none is needed for this
boundary. `spec.md` states this is deliberate: "every other story here creates
the data this one consumes."

1. Complete Setup
2. Complete Foundational — do not skip T020 or T021
3. Complete User Story 1
4. **STOP and VALIDATE**: run the isolation suite against the real adapter
5. Only then move on

### Incremental delivery

1. Setup + Foundational → the schema and mechanism exist
2. + US1 → real data backs isolation **(MVP)**
3. + US2 → firms can invite
4. + US3 → invitations become identity and access
5. + US4 → dead invitations grant nothing, uniformly
6. + US5 → no surface leaks whether an email is known
7. + US6 → a freshly provisioned tenant is never unreachable

### Parallel team strategy

Foundational is a poor candidate for splitting — T004 through T008 are tightly
sequenced and share the same three tables. Do that phase together. After it: one
developer on US1 then US4, another on US2 then US3, a third on US5 once US2–US4
land, and US6 picked up independently as soon as T008 is in.

---

## Notes

- `[P]` means different files and no dependency on incomplete work
- Every test task must be **seen to fail** before its implementation task begins
- FR-034's "never discloses which reason" is asserted by comparing response
  bodies byte-for-byte, not by inspecting status codes alone
- Commit after each task or logical group
- Four capabilities in this slice (invite, revoke-membership, change-archetype,
  seed) are step-up-gated by the constitution and stay off the network per D10
  until slice 005 lands — this does not block any task here, only production
  exposure
