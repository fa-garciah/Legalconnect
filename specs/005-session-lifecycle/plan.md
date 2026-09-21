# Implementation Plan: Session Lifecycle — Expiry, Sign-Out, Revocation & Step-Up MFA

**Branch**: `005-session-lifecycle` | **Date**: 2026-09-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-session-lifecycle/spec.md`

**Status**: Phase 0 and Phase 1 complete. Ready for `/speckit-tasks`. Not ready for
`/speckit-implement` — one blocking item below (Assumption D3's sign-off, carried from `spec.md`
unresolved) and one non-blocking design default (`research.md` D3's identity-only fallback) need a
name attached before merge.

## Summary

Close the four things `003-authentication-mfa` deliberately deferred: idle/absolute session expiry
by role class, explicit server-side sign-out, revocation of access on tenant deactivation, and
step-up MFA for five already-shipped, already-withheld capabilities — `US07`, `US08`, `US11`, `US12`.

The single fact this plan turns on, found in Phase 0 and not visible from `spec.md` or `003/data-
model.md` alone: **a "session" as a person experiences it is not one `session` row.** `003`'s
`rotate_refresh()` mints a fresh `session` row on every access-token renewal (every ~15 minutes of
use), and only `refresh_token.family_id` stays constant across that renewal chain. Every mechanism
this slice adds — idle tracking, absolute tracking, sign-out — has to operate on the *family*, not on
whichever row happens to be current, or it silently does the wrong thing (an absolute limit read off
`session.created_at` would never fire; a sign-out that revoked only the presented row would leave
the rest of the family, and its still-valid refresh tokens, alive). `research.md` D1 and D5 are this
plan's two load-bearing decisions; everything else follows from getting those two right.

**Four decisions carry this slice** —

- **Idle and absolute clocks are two new columns on `session`, written on two different schedules**
  ([D1](./research.md#d1--idle-and-absolute-state-live-on-session-itself-as-two-new-columns-not-a-new-entity),
  [D2](./research.md#d2--the-write-path-is-a-new-narrow-function-called-only-after-the-limit-check-passes)) —
  `family_created_at` copied forward unchanged at every rotation; `last_seen_at` written only after a
  request has already cleared the idle/absolute check, never before, so a refused presentation can
  never extend the clock it was refused against.
- **Sign-out is `rotate_refresh()`'s own reuse-revocation branch, triggered on purpose instead of on
  detected anomaly**
  ([D5](./research.md#d5--sign-out-is-rotate_refreshs-reuse-revocation-branch-deliberately-triggered)) —
  no new revocation logic, the existing one called a second way.
- **Step-up is a database-backed, single-use, two-minute elevation — not a signed token**
  ([D6](./research.md#d6--step-up-is-a-new-short-lived-single-use-database-backed-elevation--not-a-token-the-caller-mints)),
  for the same reason `003` refused a stateless JWT for the session itself: the constitution prohibits
  a credential whose sole authority is its own signature.
- **Enforcement is one more early check inside `004`'s existing `AuthorizationInterceptor`, not a new
  interceptor**
  ([D4](./research.md#d4--enforcement-is-one-more-early-check-inside-authorizationinterceptor-not-a-new-interceptor)) —
  the same single-choke-point argument `004/research.md` D2 already made for why entitlement lives
  there rather than in a Guard, applied a second time.

**One item resolves to "already true," not "needs building":** tenant deactivation's effect on
sessions ([D7](./research.md#d7--tenant-deactivation-specs-d3-needs-no-new-code--confirmed-not-assumed)).
`001`'s refusal-at-activation already reads `tenant.status` fresh on every request; this slice adds
zero lines of production code for `US11` and confirms the two facts spec.md's D3 depended on rather
than assuming them.

## Technical Context

Values marked **fixed by constitution** cannot change without a formal amendment. This slice inherits
the stack of `001`–`004` in full — no new dependency, no new package.

**Language/Version**: TypeScript — **fixed**. Node.js LTS, unchanged.

**Primary Dependencies**: NestJS 11 + Drizzle 0.44, unchanged. This slice adds **zero** new npm
dependencies — the TOTP verification it reuses for step-up (`otplib` via `common/auth/totp.ts`) is
already a `003` dependency, called through the exact same `KeyProvider` + `verifyCode()` pair
`sign-in.service.ts` already uses.

**Storage**: PostgreSQL on RDS with RLS — **fixed**, unchanged role discipline. Two columns added to
`session` (no grant change), one new table (`step_up_elevation`, `lc_app`-ungranted like `003`'s
material tables), four new or widened functions (`touch_session`, `sign_out`, `issue_step_up`,
`consume_step_up`; `resolve_session` widened, still read-only), one function edited in place
(`rotate_refresh`, one line). **No table this slice adds or touches carries `tenant_id`** — the same
documented exception `003/data-model.md` states for identity and session material, extended here for
the same reason: a step-up elevation authenticates a person for one operation, not a tenant.

**Testing**: Vitest, Testcontainers, real PostgreSQL exercised as the real non-owner roles — same
discipline as `001`–`004`. This slice's non-negotiable coverage, per the constitution's Testing
discipline section naming "authentication and sessions" a blocking path:

- Idle and absolute expiry, all three role classes, both directions — 6 cases (SC-002 to SC-004).
- Sign-out kills the whole family and is idempotent (SC-001, FR-005).
- All five step-up-gated capabilities, individually, both refused-without and succeeded-with
  (SC-005, SC-006).
- Zero audit entries for idle/absolute expiry and for tenant-deactivation's session effect; exactly
  one each for sign-out and step-up verification (SC-008).

No new frontend test tier — see Project Structure; this slice ships no screen.

**Target Platform**: AWS ECS Fargate, `mx-central-1` — unchanged.

**Project Type**: Web application, modular monolith, **backend only**. Unlike `003`, this slice adds
no UI — `spec.md`'s own Out of Scope excludes "any user interface beyond what's needed to exercise
sign-out and the step-up challenge," and both are exercised over the existing `/auth` surface. A
frontend caller (sign-out button, step-up retry-with-header flow) is `014`'s concern or a small
follow-up PR against `016a`'s shell, not this slice.

**Performance Goals**: One new read per request (idle/absolute check, D4) and one new conditional
write (`touch_session()`, D2) — both already inside the transaction `AuthorizationInterceptor`
already participates in via `TenantContextInterceptor`'s wrapping, so this is not an added round
trip, the same "the read is free" argument `004/research.md` D7 made for its own widened query.

**Constraints**:

- Every constraint `001`–`004` stated still applies.
- **No step-up elevation, once issued, may be usable for more than one operation or reused after
  consumption** (FR-019, User Story 2 scenario 5) — enforced at the database statement level
  (`consume_step_up()`'s atomic check-and-set), not by application-layer discipline.
- **No mechanism may exist to disable idle/absolute expiry or step-up** — not stated as an FR the way
  `003/FR-007` states it for MFA enrollment, but implemented the same way regardless: the six numbers
  and the five gated capabilities are compile-time constants, not environment variables.

**Scale/Scope**: One entity added (`step_up_elevation`), two entities extended (`session`,
`refresh_token`), zero entities for `US11` (confirmed pre-existing), two new routes
(`/auth/sign-out`, `/auth/step-up`), one cross-cutting refusal (idle/absolute) reachable from every
existing authenticated route, three new audit actions, three migrations.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluated against constitution **v1.5.0**, committed to `main` at `0901b08` (unlike `003`, which
evaluated against an uncommitted working-tree amendment — that blocking item is closed by the time
this plan was written).

### Initial gate — before Phase 0

| # | Principle | Verdict | Basis |
|---|---|---|---|
| I | Spec-First Delivery (NON-NEGOTIABLE) | ✅ PASS | `spec.md` precedes this plan, zero open `[NEEDS CLARIFICATION]` markers. All four stories — `US07`, `US08`, `US11`, `US12` — already present in `master-user-story-catalog.md` under `EP12-AccountSecurity`, marked FND. No catalog amendment needed. |
| II | Tenant Isolation is Absolute (NON-NEGOTIABLE) | ✅ PASS, by the same stated exception `003` already used | `session`, `refresh_token`, and the new `step_up_elevation` carry no `tenant_id` and no RLS policy — the constitution's own documented exception for identity/session-adjacent material, not a new carve-out this slice invents. Isolation is unaffected: this slice adds no path that reads or writes tenant-scoped data differently than `004` already governs. |
| III | Product Core vs. Tenant Customization | ✅ PASS | The six idle/absolute numbers and the five step-up capabilities are fixed, identical for every tenant, compile-time constants. No per-tenant override exists or is requested by spec.md. |
| IV | Least Privilege by Default | ✅ PASS | `lc_app` gains `EXECUTE` on exactly two new functions (`touch_session`, `consume_step_up`) and zero new table grants. `step_up_elevation` follows `identity_factor`'s exact shape: `lc_app` none, `lc_auth` full. |
| V | Auditable by Construction | ✅ PASS | FR-006 and FR-021 name the two mutating events this slice adds (sign-out, step-up verification) and both get exactly one entry each, added to the exhaustive `TARGET_ENTITY_BY_ACTION` registry `001` already enforces at compile time. FR-011 and FR-015 name, as a requirement rather than a gap, the two passive events that deliberately get none — both already-established registry disciplines, not new ones. |
| VI | Compliance-by-Design | ✅ PASS | No new personal data category. `step_up_elevation` holds no more than `session` already does (an opaque digest, an identity reference, a capability name) — no email, no code, no secret. |

**Additional gates.** Strict TDD ✅ — migrations exempt under exemption 1, everything else test-first.
The non-negotiable coverage list's "authentication and sessions" entry directly covers this slice;
Testing above names the blocking suites individually, matching `003`'s own convention rather than an
aggregate pass. English throughout ✅; no UI copy in this slice (no exemption 4 needed — there's no
UI). MVP prohibitions respected ✅ — no new identity provider, no new infrastructure.

**Gate result: PASSED.** No procedural blocker — unlike `003`, the constitution version this plan
cites is already on `main`.

### Re-check — after Phase 1 design

No principle moved. Three things the design surfaced:

- **This slice edits a file `004` owns** (`AuthorizationInterceptor`, `research.md` D4). Not a
  principle violation — `004/research.md` D2 already established this interceptor as the single
  choke point for exactly this kind of cross-cutting check, and this slice is the second consumer of
  that design, not a deviation from it. Named explicitly in Complexity Tracking below because editing
  another slice's file, even one built for this, is worth a reviewer's deliberate attention rather
  than a silent diff.
- **A DB-level vocabulary constraint, not just the TypeScript registry, gates new audit actions.**
  `audit_event_action_known` (`0036_auth_audit_actions.sql`) is a `CHECK` constraint enumerating every
  known action; `session.signed_out`, `stepup.verified`, `stepup.failed` need a migration extending it,
  the same two-migration split (`0030` decides who may write, a separate migration decides the
  vocabulary) `001`, `002`, `003` already established and `0036`'s own header names explicitly.
- **Two migrations, not one, for the schema half.** `session`'s new columns and functions
  (`0040`) are independent of `step_up_elevation`'s new table (`0041`) — nothing in one depends on the
  other existing, so they're kept separate rather than bundled, matching the granularity `003`'s own
  seven migrations (`0030`–`0036`) already used per concern rather than per slice.

## Project Structure

### Documentation (this feature)

```text
specs/005-session-lifecycle/
├── spec.md                       # Complete — 0 [NEEDS CLARIFICATION], D3 flagged as pending
├── checklists/requirements.md    # 17 of 18 — D3's sign-off is the one open item
├── plan.md                       # This file
├── research.md                   # Phase 0 — 8 decisions
├── data-model.md                 # Phase 1 — 2 modified entities, 1 new, 4 new/widened functions
├── contracts/
│   └── session-lifecycle.md      # Sign-out, idle/absolute refusal, step-up issuance + consumption
├── quickstart.md                 # Phase 1 — validation scenarios
└── tasks.md                      # Phase 2 — /speckit-tasks, not this command
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── common/
│   │   ├── auth/
│   │   │   ├── session.guard.ts          # MODIFIED: keeps id/last_seen_at/family_created_at too
│   │   │   ├── session.port.ts           # MODIFIED: resolveSession() widened return; +signOut()
│   │   │   ├── session-lifecycle.ts      # NEW — roleClassFor(), SESSION_LIMITS (research D3)
│   │   │   └── totp.ts                   # UNCHANGED — reused as-is by step-up
│   │   ├── authz/
│   │   │   └── interceptor.ts            # MODIFIED: idle/absolute check + step-up consumption (D4, D6)
│   │   ├── audit/
│   │   │   └── actions.ts                # MODIFIED: +3 actions (session.signed_out, stepup.*)
│   │   └── db/
│   │       └── schema.ts                 # MODIFIED: +2 session columns; +step_up_elevation table
│   └── modules/
│       └── auth/
│           ├── sign-out.controller.ts    # NEW
│           ├── sign-out.service.ts       # NEW — calls sign_out(), writes session.signed_out
│           ├── step-up.controller.ts     # NEW
│           ├── step-up.service.ts        # NEW — reuses verifyCode()/KeyProvider exactly as sign-in does
│           └── auth.module.ts            # MODIFIED: +2 routes
├── drizzle/
│   ├── 0040_session_lifecycle_columns.sql  # session +2 cols; resolve_session widened; +touch_session();
│   │                                        # rotate_refresh() one-line change; +sign_out()
│   ├── 0041_step_up_elevation.sql          # +table; +issue_step_up(); +consume_step_up(); grants
│   └── 0042_session_lifecycle_audit_actions.sql  # audit_event_action_known +3 actions
└── tests/
    ├── contract/
    │   └── session-lifecycle.test.ts       # sign-out + step-up route shapes
    └── integration/
        ├── sign-out.test.ts                 # SC-001, US1 — BLOCKING
        ├── idle-absolute-expiry.test.ts      # SC-002..004, US3 — BLOCKING, 6-case matrix
        ├── step-up.test.ts                   # SC-005..006, US2 — BLOCKING, all 5 capabilities
        ├── tenant-deactivation-session.test.ts  # SC-007, US4 — confirms 001, not new mechanism
        ├── pre-existing-session-migration.test.ts  # FR-025, SC-009
        └── unit/
            └── session-lifecycle.test.ts     # roleClassFor(), SESSION_LIMITS — no DB, pure function
```

**Structure Decision**: Same modular-monolith layout `001`–`004` already established, no new module.
`session-lifecycle.ts` sits in `common/auth/` because it is a pure extension of `003`'s session
concept, not an authorization concern — `common/authz/interceptor.ts` *imports* it but does not own
it, mirroring how `004`'s own interceptor already imports `capability.ts` without owning capability
definitions itself. `sign-out` and `step-up` join `modules/auth/` rather than becoming their own
module, for the same reason `003`'s four flows share one module: both run on `lc_auth`'s connection
and both need the same pending-state discipline `003`'s sign-in/challenge pair already established.

No frontend directory listed — this slice ships no screen (Technical Context, Project Type).

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified

One deliberate deviation, continuing the discipline `001`–`004` established. Not a principle
violation — flagged because it touches a file another slice owns, which is the kind of change this
project's own Merge Rules ("one slice per directory... the files two people genuinely contend over")
asks to be named rather than left as an implicit diff.

| Change | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| **`common/authz/interceptor.ts` (owned by `004`) gains the idle/absolute check and step-up consumption, ahead of its existing `decide()` call** ([D4](./research.md#d4--enforcement-is-one-more-early-check-inside-authorizationinterceptor-not-a-new-interceptor)) | `AuthorizationInterceptor` is already the one interceptor that runs on every non-auth-surface route on all three surfaces and already has `caller.identityId` and `caller.principal` in scope — the exact two facts (which session, which archetype) idle/absolute and step-up both need. `004/research.md` D2 already rejected a Guard for the identical reason (a Guard runs before the principal exists) and this slice's need is structurally the same one, one layer later. | A new, fourth-and-a-half interceptor was considered and rejected: it would duplicate `resolveCaller()`'s work (or require threading its result through a second traversal), and `004`'s own D2 already argued against exactly this shape of duplication for its own entitlement check. Putting the check inside `common/auth/` instead, as a Guard, was also rejected — Guards run before `TenantContextInterceptor`, so no archetype would be available for the tenant-scoped case, the same structural fact D2 established. |

Narrow, named, carries the tests `research.md` and `quickstart.md` both name.

## Open Items for the CC technical lead

**Blocking:**

1. **`spec.md`'s Assumption D3 needs an explicit owner's sign-off**, carried unresolved from spec.md
   into this plan rather than closed here. `research.md` D7 confirms the *technical* premise Option A
   depends on (sessions really are tenant-global in the shipped schema, `001`'s refusal-at-activation
   really is per-request with no cache) — but confirming the premise is not the same as confirming the
   decision. If Option B is preferred once this premise is understood, `FR-012`–`FR-015`, `SC-007`,
   and this plan's D7 all need revisiting before `/speckit-implement`, not after.

**Non-blocking:**

2. **The identity-only-route fallback (tightest class, `SA`'s numbers) is a plan-level default, not a
   spec-cited fact** (`research.md` D3). It affects exactly two routes — accept own invitation, read
   own memberships (`004` D8's `self`-scope rows) — both narrow and low-risk by `004`'s own reasoning.
   Flagged so it's a recorded choice rather than a default nobody decided.
3. **Step-up has no lockout of its own** (`research.md` D6, "Rejected" note). A wrong step-up code
   does not count toward `003/FR-021`'s 5-attempt lockout, because doing so would mean this slice's
   new route reads and writes `identity_factor`'s lockout columns directly. Left open rather than
   silently absent — worth a small follow-up once someone confirms whether unlimited step-up attempts
   is an acceptable gap or needs its own counter.
4. **Two minutes for a step-up elevation's lifetime is this plan's own number, not spec.md's or the
   constitution's** (`research.md` D6). `spec.md`'s Assumptions explicitly leave the mechanism to
   `plan.md`; this is that decision, recorded so a future reader doesn't go looking for it in the
   constitution and not find it.
