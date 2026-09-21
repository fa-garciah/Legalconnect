# Feature Specification: Session Lifecycle — Expiry, Sign-Out, Revocation & Step-Up MFA

**Feature Branch**: `005-session-lifecycle`

**Created**: 2026-09-21

**Status**: Implemented. D3 confirmed 2026-09-21 (Option A). D4 — a gap found during implementation,
not anticipated by this draft — confirmed the same day. See Resolved Decisions.

**Input**: User description: "Own everything `003-authentication-mfa` deliberately left open about how long
access lives once it's granted: idle and absolute session expiry by role class, explicit sign-out
that invalidates a session server-side, revocation of access on tenant deactivation, and step-up
MFA for a closed set of sensitive operations. Extend the session and refresh-token mechanism `003`
already emits — do not replace it. Session inventory and individual session revocation
(`US09`, `US10`) are IT2 and out of scope."

---

## Pre-Specification Decisions

No live `/speckit-clarify` session backs this draft. The three items that would otherwise surface
as `[NEEDS CLARIFICATION]` markers were resolved ahead of writing, against authoritative sources
already in the repository, and are recorded below rather than left open — per this project's own
guidance to prefer an informed default over a blocking marker. Full reasoning for all three lives in
`005-session-lifecycle-research-draft.md` (project knowledge).

| # | Item | Resolution | Basis |
|---|---|---|---|
| D1 | Session expiry values by role class | Three classes, six fixed numbers — **not open**, a citation | `.specify/memory/constitution.md`, § Sessions |
| D2 | Which capabilities require step-up | The five capability-registry rows already marked `stepUp: true` — **not open**, a citation | `backend/src/common/authz/capability.ts`, enforced by `registry-shape.test.ts` |
| D3 | Session handling on tenant deactivation | **Confirmed 2026-09-21 — Option A.** Rely on existing refusal-at-activation. No new revocation mechanism added to `session`/`refresh_token` | `001/research.md` D13; `003/FR-037`; confirmed as a technical-shape decision, not escalated |

D3 was the one item in this spec that was a judgement call rather than a fact when this draft was
written. It is now confirmed — see Resolved Decisions and Named Risks for the rationale and the one
unverified-but-not-blocking caveat it carries.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sign out and have it mean something (Priority: P1)

*`US08-EP12-ASC-SignOut`*

A signed-in person chooses to end their session. From that moment, the credential they were using
is dead — not just discarded client-side, but refused by the server if presented again, including
by someone who captured it before the person signed out.

**Why this priority**: The product currently has no way to sign out at all — `003` emits a session
and can only end it by expiry. This is the single most demo-blocking gap for Discovery: it is the
first thing anyone from Felipe's firm will try. It is also the smallest, most self-contained story
in this slice — no role-class table, no cross-tenant reasoning — which makes it the correct P1 by
the same "narrowest independently-testable slice first" logic `003` used for its own P1.

**Independent Test**: Sign in to obtain a live session and refresh token. Call sign-out. Assert the
session is refused on the very next request, that the refresh token cannot renew it, and that a
second sign-out call against the same (now-dead) session is refused cleanly rather than erroring.

**Acceptance Scenarios**:

1. **Given** a live session, **When** the person signs out, **Then** the session is refused on the
   next request that presents it.
2. **Given** a session that has just been signed out, **When** its refresh token is presented,
   **Then** renewal is refused and no new access token is issued.
3. **Given** a signed-out session's entire refresh-token family, **When** any token in that family
   is presented, **Then** it is refused — sign-out ends the family, not only the current token.
4. **Given** an already-expired or already-revoked session, **When** sign-out is called against it,
   **Then** it succeeds idempotently and discloses nothing about why the session was already dead.
5. **Given** a completed sign-out, **When** the audit log is inspected, **Then** exactly one entry
   records it, identifying the signing-out identity.
6. **Given** one identity holding sessions from two different devices, **When** one is signed out,
   **Then** the other is unaffected — sign-out acts on the session presented, not on the identity.

---

### User Story 2 - Fresh proof of identity before a sensitive operation (Priority: P2)

*`US12-EP12-ASC-StepUpForSensitiveOperation`*

Certain operations are sensitive enough that the constitution requires proof of identity regardless
of how recently the person authenticated — an ordinary session, however new, is not sufficient on
its own. Before completing one of these operations, the person is challenged for their second
factor again, immediately, and the operation proceeds only once that fresh challenge is satisfied.

**Why this priority**: Five capabilities are already built, tested, and merged in `002` and `004`,
and are sitting withheld from production for exactly one reason — this mechanism doesn't exist yet.
Shipping this story is the single highest-leverage item in the slice: it doesn't just add a new
capability, it turns on five that already exist. It sits below sign-out only because it depends on
nothing sign-out doesn't already establish, while sign-out depends on nothing at all beyond `003`.

**Independent Test**: Take an identity with a live, ordinary session — not freshly authenticated —
and attempt one of the five gated capabilities. Assert it is refused pending a fresh second-factor
challenge. Complete that challenge and assert the operation now proceeds. Assert the person's
ordinary session expiry is unaffected by having completed it.

**Acceptance Scenarios**:

1. **Given** a live session of any age, **When** one of the five step-up-gated capabilities is
   attempted, **Then** the operation is refused pending a fresh second-factor verification.
2. **Given** that pending verification, **When** a valid current second-factor code is presented,
   **Then** the operation proceeds and completes normally.
3. **Given** that pending verification, **When** an invalid code is presented, **Then** the
   operation is refused with the same uniform refusal `003` already uses for a failed challenge.
4. **Given** a completed step-up verification, **When** the person's ordinary session idle and
   absolute timers are inspected, **Then** neither has been extended or reset *beyond the ordinary
   idle-activity credit any authenticated request already earns under FR-007* — see FR-019.
5. **Given** a step-up verification tied to one operation, **When** a second, different
   step-up-gated operation is attempted immediately afterward, **Then** a fresh verification is
   required again — one verification does not cover two operations.
6. **Given** a step-up verification, succeeded or failed, **When** the audit log is inspected,
   **Then** exactly one entry records it, identifying the identity and the capability it gated.
7. **Given** the five gated capabilities (`invitation.issue`, `invitation.revoke`,
   `membership.revoke`, `membership.change_archetype`, `invitation.issue_seed`), **When** each is
   exercised in production for the first time after this slice ships, **Then** all five are reachable
   — none remains withheld by non-exposure.

---

### User Story 3 - Idle and absolute session limits by role class (Priority: P3)

*`US07-EP12-ASC-ExpireIdleSession`*

A session that sits unused too long, or has simply existed too long regardless of activity, stops
working — automatically, with no administrative action, and at a limit that depends on how sensitive
the role is. A System Administrator's session is held to a tighter leash than an ordinary internal
user's, and a portal user's is looser than either, reflecting how much damage each can do if left
open on an unattended screen.

**Why this priority**: This is a passive, baseline control rather than something anyone will notice
missing in a demo the way sign-out's absence is noticed — which is exactly why it's P3 rather than
P1, even though it is arguably the more foundational security control of the two. It depends on
nothing this slice's other stories don't already need (the session/refresh-token mechanism `003`
emits).

**Independent Test**: For each of the three role classes, create a session, advance time past its
idle limit without activity and assert refusal; separately, create a session, keep it active past its
absolute limit and assert refusal despite the activity. Repeat for all three classes and both timers
— six cases.

**Acceptance Scenarios**:

1. **Given** an internal-archetype session (`MP`, `AA`, `PL`, `CM`, `BM`) idle for 8 hours, **When**
   the next request is made, **Then** it is refused.
2. **Given** an internal-archetype session kept continuously active past 12 hours from emission,
   **When** the next request is made, **Then** it is refused regardless of recent activity.
3. **Given** an `SA` session idle for 30 minutes, **When** the next request is made, **Then** it is
   refused.
4. **Given** an `SA` session kept continuously active past 8 hours from emission, **When** the next
   request is made, **Then** it is refused.
5. **Given** a portal-archetype session idle for 2 hours, **When** the next request is made,
   **Then** it is refused.
6. **Given** a portal-archetype session kept continuously active past 24 hours from emission,
   **When** the next request is made, **Then** it is refused.
7. **Given** a session inside both its idle and absolute limits, **When** any request is made,
   **Then** it is not refused on timing grounds.
8. **Given** a session's role class, **When** its membership's archetype changes mid-session
   (`membership.change_archetype`), **Then** the new class's limits apply from that point — a
   session does not keep operating under a class the person no longer holds. The *absolute* clock
   is not reset by the change: it keeps counting from the session's original `created_at`, now
   measured against the new class's absolute limit (see FR-010).

---

### User Story 4 - Access ends when a tenant is deactivated (Priority: P4)

*`US11-EP12-ASC-RevokeSessionsOnDeactivation`*

When a tenant is deactivated, nobody who belonged to it can reach its data anymore — immediately,
not after their session happens to expire on its own. A person who belongs to more than one tenant
keeps working normally in the tenants that were not deactivated.

**Why this priority**: Lowest priority because, per D3, the bulk of what this story requires is
already built and tested by `001` — the effect this story specifies is largely a confirmation and an
acceptance-scenario exercise of an existing mechanism, not new construction. It is sequenced last
because it is the one item in this slice resting on an assumption (D3) that should be confirmed, not
assumed, before it is treated as done.

**Independent Test**: Seed an identity with live memberships in two tenants. Deactivate one. Assert
the very next request against the deactivated tenant is refused, and that a request against the
other tenant, using the same underlying session, succeeds unchanged.

**Acceptance Scenarios**:

1. **Given** a live session and a live membership in Tenant A, **When** Tenant A is deactivated,
   **Then** the next request activating Tenant A's context is refused.
2. **Given** the same identity also holding a live membership in Tenant B, **When** Tenant A is
   deactivated, **Then** requests activating Tenant B's context continue to succeed, unaffected.
3. **Given** a tenant deactivated mid-request, **When** a request that was already past context
   activation completes, **Then** no requirement in this slice reopens or interrupts a request
   already in flight — the refusal applies from the next request, matching `001`'s existing
   behaviour.
4. **Given** a deactivated tenant, **When** its deactivation is inspected in the audit log, **Then**
   the existing `tenant.deactivated` entry from `001` is sufficient — this slice does not require a
   second, session-specific audit entry per affected session.

---

### Edge Cases

- What happens when a person's idle and absolute timers both lapse in the same request? Refused
  once, not twice — the refusal doesn't need to distinguish which timer fired.
- What happens when someone signs out of a session that a concurrent request is using at that exact
  moment? The concurrent request may complete or may be refused depending on ordering, but no
  request after the sign-out completes may succeed — no permanent inconsistent state.
- What happens when step-up is requested for a capability the identity doesn't hold in the first
  place (e.g., an `AA` attempting `membership.change_archetype`)? The ordinary permission refusal
  applies first — step-up is never reached for an operation the identity couldn't perform anyway.
- What happens to a pending step-up verification if the person's session itself expires (idle or
  absolute) before they complete it? The verification is void; a fresh sign-in is required, then a
  fresh step-up.
- What happens when a tenant is deactivated and reactivated (if that ever becomes possible)? Out of
  scope — `001/FR-006` makes deactivation one-way; this slice inherits that, not a new question.
- What happens to a session that predates this slice shipping? See FR-025 — this is now a binding
  requirement, not just an edge case.

---

## Requirements *(mandatory)*

### Functional Requirements

**Sign-out**

- **FR-001**: The system MUST provide a way for a signed-in person to end their own current session.
- **FR-002**: Sign-out MUST immediately mark the session invalid server-side, so any subsequent
  request presenting it is refused.
- **FR-003**: Sign-out MUST revoke the entire refresh-token family descended from that session, not
  only the current access token.
- **FR-004**: Sign-out MUST be self-scoped in this slice — no archetype may sign out a session other
  than its own. Ending another identity's session is `US10`, IT2.
- **FR-005**: Sign-out MUST succeed idempotently against an already-expired or already-revoked
  session, without disclosing why it was already dead.
- **FR-006**: Every completed sign-out MUST be recorded in the audit log, identifying the identity.

**Idle and absolute expiry**

- **FR-007**: The system MUST refuse a session that has been idle longer than its role class's idle
  limit: 8 hours (internal: `MP`, `AA`, `PL`, `CM`, `BM`), 30 minutes (`SA`), 2 hours (portal: `CC`,
  `IC`, `CB`, `EL`, third parties).
- **FR-008**: The system MUST refuse a session older than its role class's absolute limit,
  regardless of activity: 12 hours (internal), 8 hours (`SA`), 24 hours (portal). The absolute limit
  is always measured from the session's original `created_at` — no event in this slice (sign-in
  activity, step-up, or an archetype change under FR-010) resets or extends it.
- **FR-009**: Idle and absolute validity MUST be evaluated against server-stored session state on
  every request, never inferred from a client-supplied value — the same posture `003/FR-034`
  already establishes for the session mechanism this slice extends.
- **FR-010**: A session's applicable role class MUST be read from the identity's current membership
  archetype at request time, not fixed at the moment the session was emitted — if the archetype
  changes mid-session, the new class's idle and absolute *limits* apply immediately. Changing class
  does not reset either *clock*: idle continues to be measured from the session's last recorded
  activity, and absolute continues to be measured from the session's original `created_at` (FR-008)
  — only which limit each clock is checked against changes.
- **FR-011**: Idle and absolute expiry, on their own, are not required to produce a dedicated audit
  entry — they are passive lifecycle events, not actions taken by or against a person, unlike
  sign-out and step-up.

**Revocation on tenant deactivation**

- **FR-012**: Deactivating a tenant MUST cause every subsequent request attempting to activate that
  tenant's context to be refused, immediately — no idle or absolute grace period applies.
- **FR-013**: A person's access to a tenant that was **not** deactivated MUST be unaffected by the
  deactivation of a different tenant they also belong to.
- **FR-014**: *(Assumption D3 — see Resolved Decisions)* This slice satisfies `US11` by extending the
  refusal-at-activation mechanism `001` already built and tested (`001/research.md` D13), rather than
  by mutating session or refresh-token rows on deactivation. It does not add a tenant or membership
  reference to `session` or `refresh_token` — doing so would reopen `003/FR-037`'s deliberate,
  shipped design that a session carries no tenant authority.
- **FR-015**: The existing `tenant.deactivated` audit entry (`001`) is sufficient; this slice does
  not require an additional, session-specific audit entry per affected session.

**Step-up MFA**

- **FR-016**: For a defined, closed set of capabilities, the system MUST demand a freshly completed
  second-factor verification immediately before performing the operation, regardless of the
  session's age or how recently the person last authenticated.
- **FR-017**: The capabilities gated by step-up in this slice are exactly the five already declared
  `stepUp: true` in the capability registry: `invitation.issue`, `invitation.revoke`,
  `membership.revoke`, `membership.change_archetype`, `invitation.issue_seed`. This slice adds no
  new step-up-gated capability of its own.
- **FR-018**: Completing this slice MUST make those five capabilities exercisable in production —
  they are withheld today solely by this mechanism's absence (`002/research.md` D10,
  `004/plan.md` Open Item 6).
- **FR-019**: A step-up verification MUST be scoped to one sensitive operation (or a short, bounded
  window around it) and MUST NOT itself extend, reset, or otherwise grant special treatment to the
  person's ordinary idle or absolute session limits, beyond the effect any other authenticated
  request already has. Concretely: the request that *triggers* a step-up challenge is an ordinary
  authenticated request and counts as idle-timer activity like any other under FR-007, exactly as it
  would if step-up did not exist; but neither attempting nor completing step-up resets the absolute
  clock (FR-008), and completing step-up grants no additional idle-timer credit beyond that one
  request.
- **FR-020**: A failed step-up verification MUST refuse the operation using the same uniform-refusal
  posture `003` already applies to a failed ordinary challenge — no disclosure of which specific
  check failed.
- **FR-021**: Every step-up verification, succeeded or failed, MUST be recorded in the audit log,
  identifying the identity and the capability it gated.
- **FR-022**: The step-up mechanism MUST be built so that a future slice can mark an additional
  capability `stepUp: true` in the registry and have it enforced without modifying this slice's own
  code — the same extensibility discipline `004`'s registry already applies to ordinary capabilities.

**Cross-cutting**

- **FR-023**: This slice MUST NOT alter the token formats, digests, or columns `003` already emits
  on `session` and `refresh_token` — it extends that mechanism, it does not replace it
  (`003/FR-038`).
- **FR-024**: Every timing evaluation in this slice (idle, absolute, step-up window) MUST use the
  same authoritative time source already required for audit timestamps (`001/FR-020`), never a
  caller-supplied value.
- **FR-025**: A session that predates this slice's deployment — one with no step-up-aware code path
  in its history — MUST be treated as fully valid under its pre-existing `expires_at`/refresh cycle
  until that cycle would naturally require renewal, at which point this slice's idle/absolute limits
  apply going forward. Deploying this slice MUST NOT force a mass sign-out of sessions live at
  deploy time.

---

## Key Entities *(data involved)*

- **Session** *(extended, not redefined)*: `003` already emits this entity carrying
  `device_metadata`, `revoked_at`, and `created_at`, precisely so this slice could extend rather than
  replace it (`003/FR-038`). This slice is the first to give `revoked_at` a real writer (sign-out,
  `FR-002`) and the first to need a notion of the session's ongoing activity, for idle-limit
  evaluation, alongside the moment it was first emitted, for absolute-limit evaluation.
- **Step-up verification**: A freshly completed second-factor check, distinct from the one performed
  at ordinary sign-in, scoped to a single sensitive operation rather than to the session as a whole.
  Not a general property of the session — a session does not become "stepped-up" in general, it is
  a single operation that was stepped-up into.
- **Refresh token family**: Already owned by `003` (`family_id`, rotation on use, reuse revokes the
  family). This slice's only addition is that sign-out is a second, deliberate path — alongside
  `003`'s reuse-detection — that revokes an entire family at once.

`001` owns **Tenant**, **Plan**, and **AuditEvent**. `002` owns **Identity**, **Membership**, and
**Invitation**. `003` owns **Session**, **Refresh token**, **Credential material**, **Second
factor**, and **Backup code set**. This slice extends **Session** and **Refresh token** and
introduces no entity of its own.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of sign-out calls result in the presented session being refused on the very next
  request that uses it, verified by automated test.
- **SC-002**: An internal-archetype session is refused after 8 hours idle or 12 hours absolute,
  whichever comes first, for all five internal archetypes.
- **SC-003**: An `SA` session is refused after 30 minutes idle or 8 hours absolute, whichever comes
  first.
- **SC-004**: A portal-archetype session is refused after 2 hours idle or 24 hours absolute,
  whichever comes first.
- **SC-005**: All five step-up-gated capabilities are exercisable in production immediately after
  this slice ships, none remaining withheld by non-exposure.
- **SC-006**: Zero of the five step-up-gated capabilities can be completed without a fresh
  second-factor verification immediately preceding the call, verified for all five.
- **SC-007**: A person holding live memberships in two tenants retains unaffected access to the
  tenant that was not deactivated, with zero regression, when the other is deactivated.
- **SC-008**: Every sign-out and every step-up verification, succeeded or failed, produces exactly
  one corresponding audit entry identifying the actor — zero missing, zero duplicated.
- **SC-009**: Zero sessions live at this slice's deploy time are force-signed-out by the deploy
  itself; each continues to be evaluated under its pre-existing cycle until due for renewal
  (FR-025).

---

## Assumptions

- **D1 — session expiry values are a citation, not a choice.** `.specify/memory/constitution.md`
  fixes three role classes and six numbers exactly. This spec implements them; it does not derive or
  re-justify them.
- **D2 — the step-up-gated capability set is a citation, not a choice.** The five rows already marked
  `stepUp: true` in `backend/src/common/authz/capability.ts` are the closed set this slice's
  mechanism must enforce. `case.manage_team` is explicitly **not** in this set — nothing in the
  constitution or the registry places it there, and case-team assignment is not in the same risk
  class as an identity or permission-matrix operation. Standalone backup-code re-issuance
  (`003/contracts/recovery.md`) is a real sixth item awaiting this mechanism, but registering its
  capability row and building its route is **out of scope here** — it is `003`'s domain, to be
  delivered as a small follow-up amendment that consumes this slice's mechanism once it exists, the
  same dependency shape `002`'s four capabilities already have on `005`.
- **D3 — tenant-deactivation handling: confirmed, Option A.** This spec adopts Option A: rely on
  `001`'s existing refusal-at-activation rather than building new per-membership revocation on
  `session`/`refresh_token`. Confirmed 2026-09-21. Rationale: Option B (explicit per-membership
  revocation) would require giving those tables a tenant or membership dimension they were
  deliberately built without (`003/FR-037`), for a difference no caller can observe — the tenant is
  unreachable on the next request either way. Treated as a technical-shape decision, closed at the
  implementation level rather than escalated further. **One caveat, unverified and not blocking**: if
  CC's commercial material or the contract with Felipe's firm represents tenant deactivation as
  literally invalidating every session as a verifiable security property, Option A does not satisfy
  that literally — the session row still exists, merely inert for that tenant. Worth a quick check
  against anything already represented externally; see Named Risks.
- **D4 — `invitation.issue_seed`'s step-up gate: confirmed, deferred by non-exposure.** Found during
  implementation, not anticipated by this draft. `invitation.issue_seed` is one of the five
  `stepUp: true` capabilities, but it is reachable only from the platform-admin surface
  (`001/contracts/platform-admin.md`), which has no `PO` session and no identity — nothing for a
  step-up challenge to run against. The gate skips identity-less callers for this one capability,
  leaving it exactly as reachable as it was before this slice. This is the same "deferred by
  non-exposure" posture already applied to five other `stepUp: true` capabilities that aren't
  reachable yet (`002/research.md` D10; `003/contracts/recovery.md`) — not a new kind of exception.
  Confirmed 2026-09-21, closed by: a code comment at the gate citing this posture
  (`common/authz/interceptor.ts`), and a regression test
  (`capability-declared-everywhere.test.ts`) asserting exactly one `stepUp: true` capability is
  platform-surfaced today, so a future addition can't inherit the exemption silently. New technical
  debt recorded, not resolved here: whichever future slice network-exposes the platform-admin surface
  owns building real `PO` authentication and step-up for it — none of that surface's other rows carry
  `stepUp: true` today either.
- **`PO` (platform operator) is out of scope for session-class purposes.** The platform-admin surface
  remains not network-exposed (`001/contracts/platform-admin.md`), so `PO` has no authenticated
  session for this slice to govern yet.
- **Step-up verification state is not persisted beyond its bounding operation/window.** How exactly
  that's implemented (a short-lived elevation token, a timestamp check, or otherwise) is a `plan.md`
  decision, not a spec-level one.

---

## Dependencies

| On | For | Blocking |
|---|---|---|
| `001-tenant-foundation` | The refusal-at-activation mechanism `US11`/D3 relies on (`research.md` D13); the audit mechanism and authoritative time source | No — built and merged |
| `002-identity-membership` | Membership archetype and status, multi-tenant membership model that makes `FR-013` a real requirement rather than a hypothetical | No — built and merged |
| `003-authentication-mfa` | The `session` and `refresh_token` entities this slice extends; the second-factor challenge mechanism this slice's step-up reuses rather than duplicates | No — built and merged. This is the slice `005` was always going to extend, not replace |
| `004-authorization-entitlements` | The capability registry and its five `stepUp: true` rows; the `AuthorizationInterceptor` this slice's step-up check runs alongside | No — built and merged |
| `master-user-story-catalog.md` | `US07`, `US08`, `US11`, `US12` — all four present, marked FND, no amendment required | No |

---

## Out of Scope

**IT2, already declared in the catalog:** session inventory and viewing active sessions (`US09`),
individually revoking a session other than your own (`US10`), assisted MFA reset when backup codes
are exhausted (`US14`–`US17`), tenant-wide MFA coverage review (`US17`).

**Deferred to a follow-up in `003`'s domain:** registering standalone backup-code re-issuance as a
capability and building its route — this slice supplies the mechanism it will consume, not the
capability itself.

**Deferred to later slices, mechanism-only here:** step-up gating of PAC/CSD credential upload
(`011-cfdi-stamping`, not yet built) and of full case export (`US14-EP04-DOC`, IT3, flagged in
`007/spec.md`). `FR-022` requires this slice's mechanism to be generic enough for either to register
against it later without changes here.

**Not this slice:** `PO` session handling (platform surface not network-exposed). Reactivating a
deactivated tenant (`001/FR-006` makes it one-way). Any user interface beyond what's needed to
exercise sign-out and the step-up challenge — administrative UI is `014`.

---

## Named Risks

**D3 is confirmed (2026-09-21), closed as a technical-shape decision.** Option A was adopted:
extending `001`'s existing refusal-at-activation, no new revocation machinery on
`session`/`refresh_token`. **One caveat remains open, unverified and explicitly not blocking**:
whether CC's commercial material or the contract with Felipe's firm represents tenant deactivation as
literally invalidating every session as a verifiable security property. Option A does not satisfy
that literally — the session row still exists, merely inert for that tenant, until it separately
expires or is signed out. Worth a quick check against anything already represented externally; not
something this spec or its implementation can verify from inside the repository.

**`US11`'s title reads as stronger than what this spec delivers under D3.** "Deactivation revokes all
sessions" suggests a positive action on the session table; what's actually specified is that access
is refused, not that the session row changes. `FR-014` states this explicitly rather than leaving the
gap implicit, and the Acceptance Scenarios under User Story 4 are worded around "the next request is
refused" for the same reason.

**A session that outlives a tenant's deactivation is not visibly distinguishable from a live one
until `US09`/`US10` (session inventory, IT2) exists.** Under D3, a person's session row is not marked
dead when their tenant is deactivated — it simply stops working against that tenant. Whoever builds
session inventory later needs to derive "is this session still meaningful" from membership status,
not from the session row alone. Recorded here so it isn't rediscovered as a surprise then.

**D4 is confirmed (2026-09-21), closed as deferred-by-non-exposure.** `invitation.issue_seed`'s
step-up gate is not enforceable against `PO` (no identity exists to hold an elevation), so the gate
skips identity-less callers for this one capability. Recorded as new technical debt, not resolved
here: whichever future slice network-exposes the platform-admin surface owns building real `PO`
authentication and step-up for it. A regression test
(`capability-declared-everywhere.test.ts`) keeps this exemption from silently spreading to a future
platform-surfaced `stepUp: true` capability.

---

## Resolved Decisions

| # | Question | Decision | Where it lands |
|---|---|---|---|
| D1 | What are the idle/absolute expiry values per role class? | Three classes, six fixed values, taken verbatim from the constitution — not derived here. | FR-007, FR-008, SC-002–004 |
| D2 | Which capabilities require step-up? | Exactly the five capability-registry rows already marked `stepUp: true`. `case.manage_team` explicitly excluded. Standalone backup-code re-issuance is real but out of scope for this slice's own PR. | FR-017, FR-018, SC-005, SC-006 |
| D3 | How does tenant deactivation affect live sessions? | **Confirmed 2026-09-21.** Option A — extend `001`'s existing refusal-at-activation. No new revocation machinery on `session`/`refresh_token`, because sessions are deliberately tenant-global (`003/FR-037`). One unverified, non-blocking caveat against external commercial material — see Named Risks. | FR-012–FR-015, SC-007, Named Risks |
| D4 | Does `invitation.issue_seed`'s step-up gate apply to `PO`, who has no identity? | **Confirmed 2026-09-21 — no.** Deferred by non-exposure, the same posture already applied to five other not-yet-reachable `stepUp: true` capabilities. Found during implementation, not anticipated by this draft. | `common/authz/interceptor.ts`, `capability-declared-everywhere.test.ts`, Named Risks |

---

## Traceability

Principle I requires every capability trace to a registered story. All four stories this slice closes
are already present in `master-user-story-catalog.md` under EP12-AccountSecurity, all four marked
FND — no catalog amendment required, matching `003`'s own traceability posture:

| ID | Archetype | Capability |
|---|---|---|
| `US07-EP12-ASC-ExpireIdleSession` | `MP` | Idle and absolute expiry by role class |
| `US08-EP12-ASC-SignOut` | System User | Immediate invalidation, server-side |
| `US11-EP12-ASC-RevokeSessionsOnDeactivation` | `SA` | Deactivation revokes all sessions |
| `US12-EP12-ASC-StepUpForSensitiveOperation` | `MP` | Fresh factor regardless of session age |

`US09`, `US10`, `US14`–`US17` remain IT2, as the catalog already declares.
