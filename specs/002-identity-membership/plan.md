# Implementation Plan: Identity, Membership & Invitation

**Branch**: `002-identity-membership` | **Date**: 2026-08-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-identity-membership/spec.md`

**Status**: Phase 0 and Phase 1 complete. Ready for `/speckit-tasks`, with four
non-blocking items listed for the CC technical lead.

## Summary

Replace slice 001's `MembershipPort` fixture adapter with real data, and build the
one specified path onto it: invitation, acceptance, and a bootstrap seed for a
tenant's first System Administrator. Delivers `US01`, `US04`, `US05`, `US18`,
`US19-EP12-ASC` and `US16-EP00-FND-SeedFirstAdministrator` — six catalog stories.

The technical approach follows the same discipline slice 001 established: every
guarantee is enforced at the data layer, not by application-code discipline. Three
new database roles-worth of narrowing decide the shape of this slice —

- `identity` is unreachable by the ordinary application role at all, except a
  self-row read ([D4](./research.md#d4--the-identity-table-has-no-general-grant-for-the-application-role)).
- `membership` gains no direct `INSERT` for that role either — the only way a row
  comes into existence is through one narrowly-scoped `SECURITY DEFINER` function
  that also creates the identity if needed, atomically
  ([D1](./research.md#d1--accepting-an-invitation-is-one-security-definer-function)).
- The platform role's cross-tenant reach, deliberately narrowed in slice 001 to
  `tenant`/`plan`/`audit_event`, is extended by exactly two grants —
  read-only existence-check on `membership`, insert-only on seeded rows of
  `invitation` — for the one bootstrap capability nothing else can perform
  ([D6](./research.md#d6--the-seed-capability-narrowly-extends-the-platform-roles-reach)).

Two things were genuinely open in `spec.md` and are already closed there: invitation
validity is **7 days**, and the bootstrap gap is a **seed invitation** from the
platform context. What this plan adds is how those are implemented — the token
shape, the atomicity mechanism, the email provider, and the concrete thresholds
`spec.md` left as "a defined threshold."

## Technical Context

Values marked **fixed by constitution** cannot be changed without a formal
amendment. This slice inherits slice 001's stack in full; only what is new or
decided here is elaborated.

**Language/Version**: TypeScript — **fixed by constitution**. Same Node.js LTS as
slice 001.

**Primary Dependencies**: NestJS + Drizzle ORM — **fixed**, unchanged from slice
001. No Cognito SDK is introduced by this slice: verifying a Cognito token is slice
003's authentication mechanism, and this slice — like 001 — receives an
already-authenticated subject rather than validating one
([D10](./research.md#d10--this-slices-http-surfaces-stay-off-the-network-the-same-way-001s-did)).
A transactional email dependency is added — see D7.

**Storage**: PostgreSQL on RDS with Row-Level Security — **fixed**, unchanged
connection and role discipline from slice 001. Three new tables (`identity`,
`membership`, `invitation`), one extended role grant (the platform role, D6), and
one new session variable (`app.identity_id`, alongside the existing
`app.tenant_id`).

**Testing**: Same discipline as slice 001 — Vitest, Testcontainers, real PostgreSQL
as the real (non-owner) application role and the real platform role. This slice adds
its own blocking suite: concurrent-acceptance atomicity (SC-005), the three
identical-refusal paths (SC-007), and re-running slice 001's full isolation suite
unchanged against the database-backed adapter (SC-001) — the acceptance bar stated
in `spec.md`.

**Target Platform**: AWS ECS Fargate — unchanged. The new email dependency reaches
outside `mx-central-1` (D7); nothing else does.

**Project Type**: Web application, same modular monolith. Backend and
infrastructure only; no UI, per `spec.md` Out of Scope.

**Performance Goals**: None newly introduced. Membership resolution remains on the
per-request hot path slice 001 already budgets for; this slice adds one join
(`identity.mfa_enrolled_at`) to that existing lookup, not a new query stage.

**Constraints**:
- Every constraint slice 001 stated still applies unchanged (TLS, encryption at
  rest, non-owner application role, secrets discipline, no personal data in logs).
- Additionally: no invitation message may carry case data, a client name or a
  matter reference (FR-036) — enforced by the message template itself carrying no
  such field, not by a runtime filter.
- The audit metadata sanitiser already in place (`assertNoSensitiveData`) refuses
  any key matching `email`, `token`, `credential`, etc. This slice relies on that
  existing mechanism for FR-032/FR-034 rather than adding a second one.

**Scale/Scope**: Three owned entities, six user stories, nine audit actions (two
more than `spec.md`'s FR-031 count of nine already includes the extension over
001's seven), no UI.

**Open at constitution level, not resolvable in this slice**:
- **PAC selection** `[PENDING]` — no effect here; blocks slice 011 only.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluated against constitution **v1.4.0**.

### Initial gate — before Phase 0

| # | Principle | Verdict | Basis |
|---|---|---|---|
| I | Spec-First Delivery (NON-NEGOTIABLE) | ✅ PASS | `spec.md` precedes this plan. `master-user-story-catalog.md` v1.2 carries `US18-EP12-ASC-AcceptInvitation`, `US19-EP12-ASC-SelectActiveTenant` and `US16-EP00-FND-SeedFirstAdministrator`; every story this slice delivers is traceable. |
| II | Tenant Isolation is Absolute (NON-NEGOTIABLE) | ✅ PASS, three documented exceptions | `membership` and `invitation` carry the same null-safe `tenant_id` predicate as every 001 table. Three deliberate narrowings — the `accept_invitation` definer function, the platform role's two extra grants, and `identity`'s no-general-grant posture — are named and justified in Complexity Tracking, the same discipline 001 used for its two exceptions. |
| III | Product Core vs. Tenant Customization | ✅ PASS | No tenant-specific logic. Archetype and tier are untouched by this slice. |
| IV | Least Privilege by Default | ✅ PASS | `spec.md` declares the permission matrix, including the one-capability, self-extinguishing `PO` row. Deny-by-default is enforced by the database grants themselves (D1, D4, D6) — a bug in application code cannot create a membership outside the definer function, because the ordinary role holds no `INSERT` grant to misuse. |
| V | Auditable by Construction | ✅ PASS | FR-031's nine actions all write inside the mutation's own transaction, extending 001's D6 pattern into the definer function itself (D1). |
| VI | Compliance-by-Design | ✅ PASS | `identity` stores only a subject identifier, an email for correlation, and an MFA-enrollment timestamp — no password, no factor (FR-002). Invitation email is contentless by template (FR-036, D7). Backup codes remain explicitly out of scope — slice 003's named exception, not this slice's. |

**Additional gates**: strict TDD ✅ (migrations exempt, same as 001); the
non-negotiable coverage list ("authentication and sessions, tenant isolation...")
does not name membership creation explicitly, so this plan adds it to this slice's
own Definition of Done rather than treating it as already covered — see Testing
above; English throughout ✅; MVP prohibitions respected ✅ (no second IdP, no
enterprise SSO, both newly listed in v1.4.0).

**Gate result: PASSED.**

### Re-check — after Phase 1 design

No principle moved. Two things the design surfaced:

- **One refusal deliberately breaks the tenant-context "always 404" convention.**
  `mfa_not_enrolled` (FR-026) answers `403`, not `404`. Every other refusal in
  slice 001's tenant-context mechanism answers `404` because the caller might be
  probing for a tenant's existence. This one does not carry that risk: the caller
  already holds a genuine, live membership — the system has already confirmed the
  tenant exists and they belong to it. Telling them to finish enrollment discloses
  nothing they do not already legitimately know. See
  [D5](./research.md#d5--fr-026-extends-the-existing-refusal-vocabulary-rather-than-adding-a-second-port).
- **Principle II's "enforced at the data layer" is now true of membership
  *creation*, not only membership *reads*.** 001 already enforced isolation on
  every read and write inside an active tenant. This slice closes the remaining
  gap FR-009/SC-009 name: the ordinary application role cannot create a membership
  row through any path other than the one definer function, regardless of what
  application code does or fails to do.

### Correction carried over from the constitution's v1.4.0 amendment

The blocked first revision of this spec named the identity provider and hosting
region as open pendings this plan would have to resolve. Constitution v1.4.0 closed
both before this plan was written — Amazon Cognito, `mx-central-1` — so this plan
inherits them as fixed facts rather than deciding them. What this plan **does**
decide, because the constitution left it to `plan.md` explicitly, is the
transactional email provider (D7), since SES is unavailable in `mx-central-1`.

## Project Structure

### Documentation (this feature)

```text
specs/002-identity-membership/
├── spec.md                       # Complete — no [NEEDS CLARIFICATION] open
├── plan.md                       # This file
├── research.md                   # Phase 0 — 10 decisions
├── data-model.md                 # Phase 1 — 3 owned entities, RLS design
├── contracts/
│   ├── README.md                 # Surfaces, conventions
│   ├── tenant-invitations.md     # Issue/revoke/list invitations, revoke membership, change archetype
│   ├── self-service.md           # Accept invitation, enumerate own memberships
│   └── platform-seed.md          # The one PO capability: seed invitation
├── quickstart.md                 # Phase 1 — validation scenarios
└── tasks.md                      # Phase 2 — /speckit-tasks, not this command
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── common/
│   │   ├── tenant/
│   │   │   ├── membership.ts          # MODIFIED: DbMembershipPort replaces InMemoryMembershipPort
│   │   │   ├── principal.ts           # MODIFIED: Archetype gains 'CC'; RefusalReason gains 'mfa_not_enrolled'
│   │   │   ├── resolve.ts             # MODIFIED: joins identity.mfa_enrolled_at; new refusal branch
│   │   │   ├── refusals.ts            # MODIFIED: mfa_not_enrolled -> 403, not 404
│   │   │   └── middleware.ts          # MODIFIED: also sets app.identity_id alongside app.tenant_id
│   │   ├── identity/                  # NEW — the identity-only context (no tenant active)
│   │   │   └── context.ts             # sets app.identity_id alone; backs self-service reads
│   │   └── db/
│   │       └── schema.ts              # MODIFIED: + identity, membership, invitation tables
│   └── modules/
│       ├── identity/                  # NEW — accept-invitation, enumerate-own-memberships
│       │   ├── accept-invitation.service.ts
│       │   ├── memberships.controller.ts
│       │   └── identity.module.ts
│       ├── invitation/                # NEW — issue/revoke/list, tenant-scoped
│       │   ├── invitation.service.ts
│       │   ├── invitation.controller.ts
│       │   ├── token.ts               # opaque reference generation + hashing (D2)
│       │   └── invitation.module.ts
│       ├── membership/                # NEW — revoke, change-archetype, tenant-scoped
│       │   ├── membership.service.ts
│       │   ├── membership.controller.ts
│       │   └── membership.module.ts
│       └── tenant/
│           └── seed.controller.ts     # NEW — platform surface, FR-035
├── drizzle/
│   ├── 0012_identity.sql              # table, self-row RLS, no general grant
│   ├── 0013_membership_writable.sql   # tenant + self-row RLS, INSERT revoked from app role
│   ├── 0014_invitation.sql            # table, tenant-scoped RLS
│   ├── 0015_accept_invitation_fn.sql  # SECURITY DEFINER function (D1)
│   ├── 0016_platform_role_seed_grants.sql  # D6's two narrow grants
│   └── 0017_audit_actions_extended.sql     # no-op DDL; documents the 9-action vocabulary
└── tests/
    ├── contract/
    │   ├── invite-user.test.ts
    │   ├── accept-invitation.test.ts
    │   ├── seed-first-administrator.test.ts
    │   └── enumerate-own-memberships.test.ts
    ├── integration/
    │   ├── isolation/
    │   │   └── membership-real-data.test.ts   # SC-001 — 001's suite, real adapter
    │   ├── accept-invitation-atomicity.test.ts # SC-005, SC-013 — concurrency + partial failure
    │   ├── invitation-refusal-uniformity.test.ts # SC-007 — byte-identical refusals
    │   ├── seed-self-extinguishing.test.ts     # SC-016
    │   └── mfa-gate.test.ts                    # SC-014
    └── unit/
        └── token.test.ts

infra/                              # unchanged from 001; email provider config added (D7)
```

**Structure Decision**: Same web-application, backend-only layout as slice 001.
`common/identity/` is new and deliberately thin — it is the identity-only analogue
of `common/tenant/`, needed because two routes in this slice (accept, enumerate)
run with no tenant active at all. `modules/identity/`, `modules/invitation/` and
`modules/membership/` follow the three owned entities; `modules/tenant/` gains one
file rather than a new directory, since the seed capability is one route on the
existing platform surface, not a new one.

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified

Three deliberate deviations from a literal reading of Principle II, continuing the
discipline slice 001 established. Undocumented, any one of them blocks the merge.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| **A `SECURITY DEFINER` function creates `identity` and `membership` rows, bypassing the ordinary application role's grants on both** ([D1](./research.md#d1--accepting-an-invitation-is-one-security-definer-function)) | FR-023 requires one atomic operation across three tables (`identity`, `membership`, `invitation`) for a caller who, by definition, holds no live membership yet and so cannot open a normal tenant transaction. There is no legitimate caller of this path other than the function itself. | Granting the application role direct `INSERT` on `membership` was rejected: it is the exact grant FR-009/SC-009 require to not exist, since "no direct membership creation" must hold even against a bug in application code, not merely against a code-review rule. Performing the three writes as separate application-level statements was rejected for the same reason it was rejected in 001's D6 — an atomicity guarantee split across statements is not atomic. |
| **The platform role's reach, narrowed in 001 to `tenant`/`plan`/`audit_event`, gains two grants: read-only existence-check on `membership`, insert-only on seeded rows of `invitation`** ([D6](./research.md#d6--the-seed-capability-narrowly-extends-the-platform-roles-reach)) | FR-035's bootstrap has no other legitimate caller: a freshly provisioned tenant has nobody who could invite under the normal tenant-scoped path, and 001 deliberately gave the platform role no path into either table. | Granting the platform role general `membership`/`invitation` access was rejected — it would recreate exactly the cross-tenant reach into a firm's own administration Principle II removes, for a capability that needs only "does this tenant have any live member" and "insert one seeded row." Both grants are narrowed to that shape and nothing wider. |
| **`identity` carries no general grant for the application role at all — not even `SELECT` — beyond one self-row policy** ([D4](./research.md#d4--the-identity-table-has-no-general-grant-for-the-application-role)) | FR-004's "no tenant session may enumerate identities" is, per Principle II's own text, a data-layer guarantee, not an application-layer one. The only legitimate read is a caller confirming its own row (self-enumeration's identity-adjacent checks, and the FR-026 join), which the self-row policy already permits without any broader grant. | An application-layer check in every identity-touching endpoint was rejected as exactly the "a developer who forgets the filter" failure mode Principle II exists to make impossible rather than merely unlikely. |

None of the three exceptions reaches a business table. Each is narrow, named, and
carries a test asserting its limits, the same shape 001 required of its own two.

## Open items for the CC technical lead

None of these block `/speckit-tasks`.

1. **FR-030's numeric thresholds are this plan's defaults, not `spec.md`'s.** Ten
   failed attempts per invitation reference before further attempts on that
   reference are silently refused; 200 invitations issued per tenant per hour
   before issuance is throttled (revised up from an initial 50 once
   implementation showed 50 self-throttling ordinary repeated test/dev traffic
   against one tenant, not only abuse). Both are configuration, not schema, and
   both are named in [D8](./research.md#d8--enumeration-resistance-thresholds-are-concrete-configuration).
2. **Transactional email provider: AWS SES in a region other than `mx-central-1`,
   not a third party** ([D7](./research.md#d7--transactional-email-is-aws-ses-outside-mx-central-1-not-a-third-party)). This is the decision the constitution
   explicitly deferred to this plan. Needs infra sign-off on the specific
   secondary region before `/speckit-implement`.
3. **Whether `mfa_not_enrolled` should itself produce an audit entry.** This plan
   says no — it is a precondition failure by a legitimate member, not a security
   signal, unlike the two membership refusals 001 does audit. Slice 003, which owns
   MFA, may want its own vocabulary for enrollment events; this is noted so the
   decision is not lost between slices.
4. **Step-up MFA dependency on slice 005**, already stated in `spec.md`
   Dependencies: issuing an invitation, revoking a membership, changing an
   archetype and issuing a seed invitation are all step-up-gated by the
   constitution and MUST NOT be exposed in production until slice 005 lands. This
   plan builds them behind the same not-network-exposed posture as 001
   ([D10](./research.md#d10--this-slices-http-surfaces-stay-off-the-network-the-same-way-001s-did)), so the gap is closed by non-exposure in the interim, not
   ignored.
