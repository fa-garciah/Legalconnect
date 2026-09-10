# Implementation Plan: Authentication & Multi-Factor Enrollment

**Branch**: `003-authentication-mfa` | **Date**: 2026-09-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-authentication-mfa/spec.md`

**Status**: Phase 0, Phase 1 and [tasks.md](./tasks.md) complete — 102 tasks. Ready for
`/speckit-implement` once constitution v1.5.0 is committed to `main`, which remains the
single blocking item. Four non-blocking items for the CC technical lead stand below.

**Amended 2026-09-09.** Generating `tasks.md` surfaced a contradiction between
`data-model.md` and `contracts/authentication.md` over how `lc_auth` is reached. Resolved
in favour of a `LOGIN` role with its own connection — `lc_app` now holds no grant on any
of the five tables, which is stricter than the reading it replaces. `spec.md` is
unaffected: no requirement and no success criterion changed. See
[D3's amendment](./research.md#d3--authentication-material-lives-in-tables-lc_app-cannot-reach-verified-inside-security-definer-functions).

## Summary

Give the product a front door. Verify a credential, challenge a second factor on every
sign-in, issue and consume backup codes, and emit one session — closing
`US02`, `US03`, `US06` and `US13-EP12-ASC`. In doing so, satisfy the enrollment
precondition `002` built and `004` ordered first, bring `002`'s HTTP surfaces onto the
network, and replace `016a`'s principal fixture with a real session read.

The technical approach follows the discipline `001` and `002` established: the guarantee
lives at the data layer, not in application-code diligence. Four decisions carry this
slice —

- **Authentication material lives where the application role cannot reach it.** All five
  new tables grant `lc_app` nothing at all, and it holds `EXECUTE` on exactly one
  function, `resolve_session()`. A new `LOGIN` role `lc_auth`, used by
  `backend/src/modules/auth/` and by nothing else, is the only connection with any grant
  on the material; `SECURITY DEFINER` functions carry the operations that must be atomic
  under concurrency ([D3](./research.md#d3--authentication-material-lives-in-tables-lc_app-cannot-reach-verified-inside-security-definer-functions),
  as amended 2026-09-09 — verification cannot happen inside the database, because Argon2id
  and the envelope key both live in the application).
  This matters more than it looks: `identity` already carries a self-row `SELECT` policy
  for `lc_app`, so putting a TOTP secret there would have made it readable by its owner
  through an existing, correct, already-tested policy.
- **The access credential is opaque, not a signed JWT**
  ([D2](./research.md#d2--the-access-credential-is-an-opaque-high-entropy-token-not-a-signed-jwt)) —
  because a JWT invites a future handler to verify a signature, read `exp`, and skip the
  session lookup, which is the stateless JWT the constitution prohibits, arrived at by
  accident.
- **NextAuth is the browser's transport, not an authority**
  ([D1](./research.md#d1--nextauth-is-the-browsers-session-transport-the-apis-session-table-is-the-sole-authority)).
  No NextAuth adapter tables, no NextAuth session strategy on the API side.
- **Credential establishment extends `accept_invitation()`** rather than adding a second
  privileged path into `identity`
  ([D4](./research.md#d4--credential-establishment-extends-accept_invitation-it-does-not-add-a-second-path)).

`spec.md` closed five questions before this plan was written, so the counts are fixed
facts here rather than plan decisions: 10 backup codes, consumption-only; 5 failed
attempts then a 15-minute lockout; a 90-second code acceptance window; credential
established at acceptance; and re-issuance split so the recovery path ships while
standalone re-issuance waits for `005`. What this plan adds is the mechanism, and the two
choices `spec.md` deliberately refused to make — D1 and D2.

**One schema gap surfaced during Phase 0 that is not in `spec.md`:** `identity.email`
carries no unique constraint. Cognito's user pool enforced that; nothing does now. Sign-in
resolves an identity by email, so this slice adds the unique index and the duplicate check
its migration implies ([D9](./research.md#d9--identityemail-gains-a-unique-index-on-a-normalized-form-and-subject-becomes-a-product-generated-opaque-value)).

## Technical Context

Values marked **fixed by constitution** cannot change without a formal amendment. This
slice inherits the stack of `001`, `002` and `016a` in full; only what is new is
elaborated.

**Language/Version**: TypeScript — **fixed**. Node.js LTS, unchanged. Frontend is Next.js
16.3.3 / React 19.2.8, unchanged from `016a`.

**Primary Dependencies**: NestJS 11 + Drizzle 0.44 on the API, unchanged. Three additions,
all **named or implied by the constitution** and all pinned exactly, since the constitution
places `otplib` and the credential verifier inside Principle II's blast radius and requires
their upgrades to be reviewed as security changes rather than dependency bumps:

- `otplib` — **fixed by constitution**, TOTP generation and verification.
- `@node-rs/argon2` — Argon2id for credentials and backup codes
  ([D6](./research.md#d6--argon2id-via-node-rsargon2-for-both-credentials-and-backup-codes-with-two-parameter-profiles)).
  Prebuilt binaries, no `node-gyp` in the build.
- `next-auth` — frontend only, confined to D1's transport role.
- An AWS KMS client for the production `KeyProvider`
  ([D5](./research.md#d5--totp-secrets-use-envelope-encryption-behind-a-keyprovider-port-kms-in-production-and-a-local-key-in-devci)). The `@aws-sdk` family is already a dependency.

`input-otp` is **already** a frontend dependency from `016a`'s shadcn/ui set, so the
challenge screen's code entry needs no new package.

**Storage**: PostgreSQL on RDS with RLS — **fixed**, unchanged role discipline. Five new
tables (`identity_credential`, `identity_factor`, `backup_code`, `session`,
`refresh_token`), one new role (`lc_auth`), one modified table (`identity`: unique email
index, D9), and one replaced function (`accept_invitation`, D4). **All five new tables are
tenant-global and carry no `tenant_id` and no RLS policy** — the documented exception the
constitution states for identity and session data, extended to the material that hangs off
an identity. The RLS catalogue CI test checks tables that *carry* `tenant_id`, so these
pass it rather than needing an exemption.

**Testing**: Vitest, Testcontainers, real PostgreSQL exercised as the real non-owner roles
— same discipline as `001`/`002`. Frontend keeps `016a`'s three-tier split (unit,
component, Playwright e2e). This slice's blocking suites are named individually because
SC-029 requires that rather than an aggregate figure:

- MFA enforcement — an unenrolled identity reaches nothing; a challenge is issued on every
  sign-in; **no configuration value alters either** (SC-004, exhaustive rather than sampled).
- Backup code issuance and consumption (SC-010 to SC-016, SC-031, SC-033).
- TOTP secret encryption, decryption and verification (SC-006 to SC-009, SC-034).

Plus concurrency suites for the races D8 and D11 name, and re-running `016a`'s and the five
dependent frontend slices' suites unchanged against the real principal (SC-024).

**Target Platform**: AWS ECS Fargate, `mx-central-1` — unchanged. D5's `KeyProvider` port
is what keeps the slice buildable while the account `[PENDING]` is unresolved.

**Project Type**: Web application, modular monolith. **Both** halves this time — unlike
`002`, this slice ships backend and frontend together, because the four screens are the
only way to exercise the flows and because replacing `principal.ts` is half the slice's
purpose.

**Performance Goals**: None newly introduced as a target, one new per-request cost
accepted: D2's session lookup, a single-row read by digest, resolving ahead of the
membership resolution `002` already performs. Argon2id verification is deliberately slow
and occurs only on sign-in and enrollment, never on the per-request path.

**Constraints**:

- Every constraint `001` and `002` stated still applies (TLS, encryption at rest, non-owner
  application role, secrets discipline, no personal data in logs).
- **No credential, factor secret or backup code may appear in any log, error payload,
  trace, or audit entry** (FR-002, FR-014, FR-025). The existing `assertNoSensitiveData`
  audit sanitiser already refuses keys matching `email`, `token`, `credential`; this slice
  extends its deny-list rather than adding a second mechanism.
- Argon2id digests are computed in the application, never in SQL, so no plaintext
  credential reaches a query parameter or `pg_stat_statements` (D4).
- **No mechanism may exist that disables enrollment or the challenge** (FR-007). This is a
  constraint on what may be *written*, not configured — verified by SC-004's exhaustive
  configuration inspection.

**Scale/Scope**: Five owned entities, four user stories, twelve audit actions, four
screens, one replaced frontend file, five new migrations plus one function replacement.

**Open at constitution level, not resolvable in this slice**: the AWS account blockage
scope `[PENDING]` (shaped D5); PAC selection `[PENDING]` (no effect here).

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

Evaluated against constitution **v1.5.0** — present in the working tree, **not yet
committed to `main`**. See the blocking item below.

### Initial gate — before Phase 0

| # | Principle | Verdict | Basis |
|---|---|---|---|
| I | Spec-First Delivery (NON-NEGOTIABLE) | ✅ PASS | `spec.md` precedes this plan and is clarified to zero open markers. All four stories — `US02`, `US03`, `US06`, `US13-EP12-ASC` — are already in `master-user-story-catalog.md`; **no catalog amendment is needed**, unlike `002`, which had to register three. |
| II | Tenant Isolation is Absolute (NON-NEGOTIABLE) | ✅ PASS, by exception the constitution itself states | None of the five new tables is tenant-scoped, and the constitution states directly that identity and session data "are tenant-global by design and therefore carry no `tenant_id` and no RLS policy of their own." This slice adds no tenant-scoped column to any of them, so it does not touch that decision. Isolation is *strengthened* in one respect: authentication precedes tenant selection, and D10 makes the identity un-spoofable where a header previously asserted it. |
| III | Product Core vs. Tenant Customization | ✅ PASS | No tenant-specific behaviour. Enrollment is mandatory identically for every tenant, and FR-007 forbids any per-tenant setting that could vary it. |
| IV | Least Privilege by Default | ✅ PASS | `spec.md` declares the permission matrix, including two rows that describe *absences* rather than denials. Deny-by-default is enforced by grants: `lc_app` holds nothing on the three material tables, so no application bug can read a secret it was never granted (D3). |
| V | Auditable by Construction | ✅ PASS | FR-042's twelve actions write inside the mutation's own transaction, including inside the `SECURITY DEFINER` functions, extending `001`'s pattern ([D12](./research.md#d12--twelve-audit-actions-written-in-transaction-attributed-to-no-tenant-where-none-exists)). |
| VI | Compliance-by-Design | ✅ PASS | The material this slice adds is the minimum the constitution requires it to hold, in the form it requires: credentials and backup codes as memory-hard digests only, TOTP secrets under a key the database does not hold, none of it in logs or the audit log, none of it readable by any archetype. |

**Additional gates.** Strict TDD ✅ (migrations exempt under exemption 1; Tailwind/copy
under exemption 4, per `016a`'s D6 reading). The non-negotiable coverage list now names
**MFA enforcement**, **backup code issuance and consumption** and **TOTP secret
encryption/decryption/verification** explicitly and at tenant-isolation level — SC-029
carries all three as individually blocking. English throughout ✅; Spanish UI copy required
by FR-049 ✅. MVP prohibitions respected ✅ (no SMS, no email OTP, no enterprise SSO, no
device-remembering, no second IdP).

**Gate result: PASSED**, with one procedural blocker recorded below that is not a
principle violation.

### Re-check — after Phase 1 design

No principle moved. Four things the design surfaced:

- **`identity`'s existing self-row policy is why D3 exists.** The natural design — TOTP
  ciphertext as a column on `identity` — would have been readable by its own owner through
  the correct, already-tested `identity_self_row` policy, disclosing exactly what FR-015
  forbids. The separate ungranted tables are not defence in depth; they are the difference
  between the requirement holding and not holding.
- **A pre-existing gap was found, not introduced.** `identity.email` is non-unique today
  (D9). Two identities can already share an email, and a credential sign-in against that
  state would be ambiguous. The migration adds the index *and* must handle any duplicates
  already present.
- **One refusal deliberately fails closed in a way callers cannot distinguish.** FR-017
  requires key-unavailability to be indistinguishable from a wrong code. That means a total
  key outage presents as universal wrong-code refusal — correct for secrecy, and a genuine
  operability hazard, so it needs a monitoring signal that is not a caller-visible one.
  Recorded as non-blocking item 3.
- **Per-origin throttling is not authoritative and the plan says so** (D7). Shared-instance
  memory cannot be authoritative across ECS tasks and there is no Redis in the stack. The
  per-identity lockout is the security control; the origin limiter is noise suppression.

### Blocking item — procedural, not a principle violation

**Constitution v1.5.0 is not committed to `main`.** `main` at `0901b08` carries v1.4.1,
which names Amazon Cognito as the live identity provider and mentions neither NextAuth nor
`otplib`. The v1.5.0 amendment exists complete but uncommitted. Every citation in `spec.md`
and in this plan is therefore against the working tree, at the author's explicit direction.

This does not block `/speckit-tasks`. It blocks merge, and it should be closed before
`/speckit-implement`, because a reviewer asked to approve an authentication slice cannot
verify its governing decisions against repository history.

## Project Structure

### Documentation (this feature)

```text
specs/003-authentication-mfa/
├── spec.md                       # Complete — 0 [NEEDS CLARIFICATION], 5 clarifications recorded
├── plan.md                       # This file
├── research.md                   # Phase 0 — 12 decisions
├── data-model.md                 # Phase 1 — 5 owned entities, grants, functions
├── contracts/
│   ├── README.md                 # Surfaces, conventions, the ungated-route rule
│   ├── authentication.md         # Sign-in: credential step, challenge step, session emission
│   ├── enrollment.md             # Secret issuance, confirmation, backup code issuance
│   └── recovery.md               # Backup-code challenge, forced re-enrollment, re-issuance
├── quickstart.md                 # Phase 1 — validation scenarios
└── tasks.md                      # Phase 2 — /speckit-tasks, not this command
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── common/
│   │   ├── auth/                       # NEW — the authentication layer
│   │   │   ├── session.guard.ts        # resolves identity from the session (D8, D10)
│   │   │   ├── session.port.ts         # resolve / rotate / revoke, over the definer fns
│   │   │   ├── key-provider.ts         # KeyProvider port + KMS and local impls (D5)
│   │   │   ├── argon2.ts               # the two parameter profiles (D6)
│   │   │   ├── totp.ts                 # otplib wrapper; 30s step, ±1 window (FR-056)
│   │   │   └── origin-throttle.ts      # best-effort, explicitly not authoritative (D7)
│   │   ├── identity/
│   │   │   └── context.ts              # MODIFIED: identity now from session, not header
│   │   ├── tenant/
│   │   │   └── middleware.ts           # MODIFIED: identity from session; x-tenant-id stays
│   │   ├── audit/
│   │   │   └── sanitiser                # MODIFIED: deny-list extended (secret, code, digest)
│   │   └── db/
│   │       └── schema.ts               # MODIFIED: + 5 tables; identity email index
│   └── modules/
│       ├── auth/                       # NEW — the four flows' surfaces
│       │   ├── sign-in.controller.ts   # credential step + challenge step
│       │   ├── sign-in.service.ts
│       │   ├── enrollment.controller.ts
│       │   ├── enrollment.service.ts
│       │   ├── recovery.controller.ts
│       │   ├── recovery.service.ts
│       │   ├── backup-codes.ts         # generation, verify-all (D11)
│       │   └── auth.module.ts
│       └── identity/
│           └── accept-invitation.service.ts  # MODIFIED: passes credential digest (D4)
├── drizzle/
│   ├── 0030_lc_auth_role.sql           # role, schema usage, audit-action grants (D3, D12)
│   ├── 0031_identity_credential.sql    # table, no lc_app grant
│   ├── 0032_identity_factor.sql        # ciphertext + key ref + lockout counters (D5, D7)
│   ├── 0033_backup_code.sql            # table, no lc_app grant
│   ├── 0034_session_and_refresh.sql    # session + refresh_token + families (D8)
│   ├── 0035_identity_email_unique.sql  # D9 — index + duplicate handling
│   └── 0036_accept_invitation_v2.sql   # DROP 4-arg, CREATE 5-arg (D4)
└── tests/
    ├── contract/
    │   ├── sign-in.test.ts
    │   ├── enrollment.test.ts
    │   └── recovery.test.ts
    ├── integration/
    │   ├── mfa-enforcement.test.ts         # SC-001..004 — BLOCKING
    │   ├── mfa-no-disable-path.test.ts     # SC-004 — exhaustive config inspection
    │   ├── backup-codes.test.ts            # SC-010..016, SC-031, SC-033 — BLOCKING
    │   ├── totp-secret-custody.test.ts     # SC-006..009, SC-034 — BLOCKING
    │   ├── session-rotation-family.test.ts # SC-019 — reuse revokes the family
    │   ├── lockout.test.ts                 # SC-032
    │   ├── concurrency/
    │   │   ├── challenge-replay.test.ts    # SC-018 + the same-code race
    │   │   └── last-backup-code.test.ts    # D11's race
    │   ├── credential-at-acceptance.test.ts # FR-053 atomicity
    │   └── stand-ins-removed.test.ts       # SC-030
    └── unit/
        ├── argon2-profiles.test.ts
        ├── totp-window.test.ts             # FR-056 — 90s accept, outside reject
        └── backup-code-generation.test.ts

frontend/
├── src/
│   ├── app/
│   │   ├── (auth)/                     # NEW — the four screens, outside the shell chrome
│   │   │   ├── ingresar/page.tsx       # sign-in
│   │   │   ├── verificar/page.tsx      # second-factor challenge
│   │   │   ├── enrolar/page.tsx        # secret + confirmation
│   │   │   └── recuperar/page.tsx      # backup-code recovery
│   │   └── api/auth/[...nextauth]/route.ts  # NEW — D1's transport only
│   ├── session/
│   │   ├── principal.ts                # REPLACED — real session read (FR-047)
│   │   └── principal.fixture.json      # DELETED
│   └── middleware.ts                   # NEW — unauthenticated/unenrolled redirects
└── tests/
    ├── component/auth/                 # the four screens
    ├── unit/principal.test.ts          # MODIFIED — real read, same shape
    └── e2e/auth-flows.spec.ts          # full sign-in, enroll, challenge, recover

infra/                                  # KMS key + access policy for D5's production provider
```

**Structure Decision**: Same web-application layout as `016a` and `002`, extended on both
sides. `common/auth/` is new and is the identity-layer analogue of `common/tenant/` — it
must be reachable before any tenant or identity context exists, so it cannot live under
either. `modules/auth/` holds the four flows as one module rather than three, because they
share the pending-state machine between the credential step and the challenge step and
splitting them would put that state on a boundary.

On the frontend, the four screens sit in a `(auth)` route group deliberately **outside**
the shell's chrome: a person at the sign-in screen has no principal, so `Header`,
`NavigationMenu` and `TenantSwitcher` have nothing to render from. This is what lets
FR-048 hold — no file under `src/shell/`, `src/feedback/` or `src/authz/` is touched, and
`016a`'s module contract survives. Spanish route segments follow the convention `018` and
`019` already set (`clientes`, `expedientes`).

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified

Three deliberate deviations, continuing the discipline `001` and `002` established.
Undocumented, any one of them blocks the merge.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| **A new `LOGIN` role `lc_auth` owns five tables on which `lc_app` holds no grant at all, and a second application connection exists** ([D3](./research.md#d3--authentication-material-lives-in-tables-lc_app-cannot-reach-verified-inside-security-definer-functions) as amended, [D8](./research.md#d8--session-resolution-refresh-rotation-and-family-revocation-are-each-one-security-definer-function)) | FR-015 and FR-029 forbid *any* archetype reading a factor secret or backup code. `identity` already carries a self-row `SELECT` policy for `lc_app`, so the natural placement would make a TOTP secret readable by its owner through a correct existing policy. Session resolution additionally happens before `app.identity_id` exists, so no RLS policy could scope it. A second connection is what makes "no grant for `lc_app`" achievable at all, since Argon2id and the envelope key live in the application and no in-database function can verify anything without them. | Column-level privileges narrowing the existing self-row policy were rejected: RLS and column privileges interact subtly, and the narrowing would need re-verifying on every future migration touching `identity`. Application-layer "never select that column" was rejected as the forgotten-filter mode Principle II exists to eliminate. Keeping `lc_auth` `NOLOGIN` and verifying inside the functions was rejected as unbuildable — see D3's amendment for the three reasons. |
| **Five tables carry no `tenant_id` and no RLS policy** (data-model.md) | The constitution states this exception directly for identity and session data — a person exists before and across tenants — and this slice extends it only to material hanging off an identity (its credential, its factor, its codes, its refresh tokens), none of which is meaningful per tenant. | Adding `tenant_id` was rejected because it is false: one credential authenticates a person who may hold membership in several firms, and duplicating it per tenant would duplicate the human being — the same argument that prohibits a per-tenant identity namespace. Per the constitution, adding such a column would itself require an amendment. |
| **`accept_invitation()` is dropped and recreated with a fifth parameter** ([D4](./research.md#d4--credential-establishment-extends-accept_invitation-it-does-not-add-a-second-path)) | FR-053 requires credential establishment to be atomic with identity and membership creation, and this function is the only path that may insert an `identity` row. Adding a parameter creates a new signature, so the four-argument version must be dropped rather than left as an ambiguous overload. | A separate `establish_credential()` called immediately after acceptance was rejected: two transactions leave a real window in which a membership exists with no credential — the state FR-053 forbids. "Immediately after" is not atomicity. |

None of the three reaches a business table. Each is narrow, named, and carries a test
asserting its limits — the same shape `001` and `002` required of their own.

## Open items for the CC technical lead

**Blocking:**

1. **Commit constitution v1.5.0 to `main`.** See the Constitution Check blocking item. The
   amendment is written; it is uncommitted. Until it lands, every governing citation in this
   slice is unverifiable against history. Does not block `/speckit-tasks`; does block merge.

**Non-blocking:**

2. **`identity.email` duplicates must be checked before 0035 runs** ([D9](./research.md#d9--identityemail-gains-a-unique-index-on-a-normalized-form-and-subject-becomes-a-product-generated-opaque-value)).
   The unique index is correct and overdue, but if any environment already holds two
   identities sharing a normalized email, the migration fails there. Needs a pre-flight
   query against each environment, and a decision on remediation if it finds any.
3. **Key-unavailability needs a monitoring signal, because it deliberately has no
   caller-visible one.** FR-017 makes a key outage indistinguishable from a wrong code,
   which is right for secrecy and means a total outage looks like every user suddenly
   typing wrong codes. The metric and alert are an infra deliverable, not an application
   one, and are not in this slice's scope.
4. **The production `KeyProvider` implementation depends on the AWS account `[PENDING]`**
   ([D5](./research.md#d5--totp-secrets-use-envelope-encryption-behind-a-keyprovider-port-kms-in-production-and-a-local-key-in-devci)).
   The port makes this a configuration decision rather than a redesign, but somebody must
   confirm KMS in `mx-central-1` is reachable before `/speckit-implement`, and the startup
   assertion that refuses the local provider in a deployed environment must be part of the
   deployment review.
5. **`002`'s four step-up-gated capabilities remain withheld from production**, and this
   slice adds a fifth — standalone backup-code re-issuance (FR-032). Recovery-path
   re-issuance ships. `005` closes all five. Noted so the count is not lost between slices.
