# Feature Specification: Authentication & Multi-Factor Enrollment

**Feature Branch**: `003-authentication-mfa`

**Created**: 2026-09-08

**Status**: Draft — **0 `[NEEDS CLARIFICATION]` open.** All three closed 2026-09-09, plus
the credential-establishment assumption and the code acceptance window. Ready for
`/plan` once Constitution v1.5.0 is committed to `main` (see Assumptions).

**Epic**: EP12-AccountSecurity — `US02-EP12-ASC-EnrollMFAFactor`,
`US03-EP12-ASC-ReceiveBackupCodes`, `US06-EP12-ASC-AuthenticateWithMFA`,
`US13-EP12-ASC-RecoverWithBackupCode`

**Constitution**: v1.5.0

**Tier Classification**: **Cross-cutting — not tier-restricted.** Authentication is
the precondition of every tier's capabilities and is never itself gated, reduced or
removed by a plan. No entitlement may make a second factor optional (Constitution
v1.5.0 *Authentication*).

**Input**: The seam this slice closes, in two directions.

1. **Backend.** `002-identity-membership` is built and tested, but every HTTP surface
   it added — invitation issue/revoke/list, accept, enumerate-own-memberships,
   membership revoke/archetype-change, and the seed endpoint — remains off the
   network, bound to loopback and trusted only behind header stand-ins
   (`x-identity-id`, `x-tenant-id`, `x-subject`, `x-email`), per `002/research.md`
   D10. That posture was explicitly conditional on this slice: "Real verification
   does not exist until slice 003." This slice supplies the verification that lets
   those routes come onto the network.
2. **Frontend.** `016a-frontend-shell` ships `frontend/src/session/principal.ts` —
   one function, `getPrincipal()`, backed by a checked-in fixture and documented as
   replaceable wholesale by this slice (`016a/research.md` D5). Every consumer
   depends only on that function's shape, never on the fixture. This slice replaces
   that one file with a real session read.

> **Citation convention.** Requirements of earlier slices are cited as `001/FR-0NN`,
> `002/FR-0NN`, `004/FR-0NN`, `016a/FR-0NN`. Bare `FR-0NN` refers to this document.
> Constitution references are to v1.5.0 unless stated otherwise.

---

## Why This Slice Is Next

**The gate `002` built cannot currently be satisfied by anything.** `002/FR-026`
requires that a membership grant no access to tenant data until second-factor
enrollment has completed, and that requirement is live in code: the identity record
carries an enrollment timestamp, and per-request membership resolution refuses with
`mfa_not_enrolled` while it is absent. `004` then fixed that refusal as position 1 of
its Refusal Ordering, ahead of permission, scope and entitlement, and its own
Dependencies table records that it needs nothing from this slice because the
precondition is already enforced. Three merged slices therefore depend on a state
that no shipped capability can produce. Every one of them is correct, and together
they describe a product that no real person can enter.

**The frontend fixture is no longer a two-slice dependency, and that is the change
since `016a` shipped.** When `016a` merged, one slice stood on `getPrincipal()`.
`006-client-case-core`, `007-document-management`, `017-firm-directory`,
`018-frontend-clients` and `019-frontend-cases` have all since shipped on top of it,
and every one of them reaches identity through that same single function. The
replacement surface is still exactly one file — `016a`'s D5 design guaranteed that,
and the guarantee has held — but the surface *exercised through* it has grown with
each merge. `getPrincipal()` is now referenced from 18 files: four production
consumers (`layout.tsx`, `lib/api-client.ts`, `clientes/page.tsx`,
`expedientes/page.tsx`) plus its own module, and 13 test files across the `clientes`
and `expedientes` component suites, the Spanish-copy suite, and the api-client and
principal unit suites.

The fixture was cheap to carry when only `016a` stood on it. It is not cheap now.
Two screens of real domain functionality, their entire component test suites, and
every request `api-client.ts` makes are all built and green against an identity that
has never once been proved. Nothing is wrong with any of that work — `016a`'s seam
did exactly its job — but each additional slice merged on the fixture widens the set
of behaviour whose first contact with a real principal is deferred, and every one of
those deferrals lands here. This slice is the point at which that debt stops
accruing.

**This slice is deliberately narrow in one direction.** It establishes who a person
is and proves it. It does not decide how long the resulting access lives, how it ends,
or when it must be proved again — that is `005-session-lifecycle`. The boundary is
exact: this slice emits one initial session on successful authentication using the
constitution's fixed values, and `005` extends that mechanism rather than replacing
it. This is the same fixture-then-extend pattern `001` used into `002`.

---

## Traceability

Principle I requires that every capability trace to a registered story. All four
stories this slice closes are already present in `master-user-story-catalog.md` under
EP12-AccountSecurity, all four marked FND:

| ID | Archetype | Capability |
|---|---|---|
| `US02-EP12-ASC-EnrollMFAFactor` | System User | Mandatory second factor at enrollment |
| `US03-EP12-ASC-ReceiveBackupCodes` | System User | Single-use backup codes |
| `US06-EP12-ASC-AuthenticateWithMFA` | System User | Second factor on every sign-in |
| `US13-EP12-ASC-RecoverWithBackupCode` | System User | Recover and re-enroll a factor |

**No catalog amendment is required by this slice.** Unlike `002`, which had to
register three missing stories before it could be specified, this slice's capability
set was fully anticipated when EP12 was rewritten. The catalog is not modified and
the story IDs are not renumbered.

Four EP12 stories deliberately remain unclosed here and are named in Out of Scope:
`US07` (idle/absolute expiry), `US08` (sign-out), `US11` (revocation on
deactivation) and `US12` (step-up) belong to `005`. `US09`, `US10` and `US14`–`US17`
are IT2.

---

## Clarifications

### Session 2026-09-09

- Q: When a newly invited person first sets their password, does that happen while they are accepting the invitation, or in a separate setup step afterwards? → A: Acceptance establishes the credential — identity, membership and credential material are created in one atomic operation, with the invitation reference serving as the proof of email control. TOTP enrollment then follows before any tenant data is reachable.
- Q: How many backup codes should be issued at enrollment, and should they stop working after a period of time or only once they are used up? → A: Exactly 10 codes, expiring only by consumption or by replacement of the set — no time-based expiry.
- Q: After how many consecutive wrong second-factor codes should the account be temporarily locked, and how long should that lock last? → A: 5 consecutive failures, 15-minute lockout, counter reset on success. Backup-code attempts count toward the same counter, and the same threshold governs the credential step (FR-005).
- Q: Should re-issuing a person's backup codes require a fresh second-factor check, given that step-up does not exist until slice 005? → A: Split by case. Re-issuance inside the recovery flow requires no step-up, because the recovery has just proved two factors, and it ships with this slice. Standalone proactive re-issuance is deferred by non-exposure until 005.
- Q: How much clock drift should be tolerated when checking an authenticator code? → A: A 30-second time step accepting previous, current and next step — a 90-second window. The replay guard of FR-020 covers the full window, not only the current step.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sign in with a credential and a second factor (Priority: P1)

*`US06-EP12-ASC-AuthenticateWithMFA`* — closes both seams named in Input

A person opens the product, proves who they are with something they know, is then
challenged for a second factor they hold, and only after both succeed does the
product consider them signed in and hand them access. This happens on every sign-in,
without exception and without any way to be remembered.

**Why this priority**: This is the acceptance bar for the slice. It is the story that
brings `002`'s routes onto the network and the story that replaces
`frontend/src/session/principal.ts`. Stories 2 and 3 create the enrollment state this
one consumes; this one is what the rest of the product has been waiting for, so it is
specified first — the same structure `002` used, where its P1 consumed data its later
stories created.

**Independent Test**: Seed one identity with a verified second factor and a live
membership directly in the data store, with no enrollment flow involved — exactly the
way `002`'s own P1 seeded memberships directly with no invitation flow. Then drive a
complete sign-in and assert that the second factor is demanded before any session
exists, that a session exists only after both steps succeed, and that a correct
credential with a missing or wrong second factor yields no session and no access.

**Acceptance Scenarios**:

1. **Given** an identity with a verified second factor, **When** it presents a valid credential, **Then** no session is emitted yet and a second factor is demanded.
2. **Given** that pending challenge, **When** a valid current second-factor code is presented, **Then** exactly one session is emitted and the person is signed in.
3. **Given** a valid credential, **When** an invalid second-factor code is presented, **Then** no session is emitted, no access is granted, and the failure is recorded.
4. **Given** an invalid credential, **When** sign-in is attempted, **Then** no second-factor challenge is issued and the refusal is observably identical to a credential presented for an email that has no identity.
5. **Given** a completed sign-in, **When** the same person signs in again from the same device and browser, **Then** the second factor is demanded again in full — there is no remembered device, no trusted-device option offered, and no suppression of the challenge.
6. **Given** a second-factor code that was already used successfully, **When** it is replayed within its own validity window, **Then** it is refused.
7. **Given** an identity with **no** verified second factor, **When** it presents a valid credential, **Then** it is routed to enrollment and reaches no authenticated capability, in accordance with `002/FR-026`.
8. **Given** a signed-in person, **When** the frontend reads the current principal, **Then** it obtains the identity and its live memberships from real session state rather than from a checked-in fixture, and every existing consumer continues to work against the unchanged shape of that read.
9. **Given** a signed-in person, **When** any tenant-scoped request is made, **Then** the tenant and archetype are resolved from stored membership and no value presented by the caller or carried in the session is trusted as their source, per `002/FR-016`.
10. **Given** a session, **When** each subsequent request is made, **Then** validity is determined by this product's own stored session state rather than by the presented token's own claimed expiry alone.
11. **Given** a sign-in that fails at any step, **When** the response is inspected, **Then** it does not disclose whether the email is known, whether a factor is enrolled, or which of the two steps failed beyond what the flow's own stage already reveals.
12. **Given** four consecutive failed second-factor attempts, **When** a valid code is presented, **Then** it succeeds and the failure counter returns to zero.
13. **Given** five consecutive failed second-factor attempts, **When** a sixth attempt is made — with a valid code, an invalid code, or a backup code — **Then** it is refused for 15 minutes, the refusal discloses neither that a lockout is in effect nor how many attempts remain, and the lockout lifts on its own without administrative action.

---

### User Story 2 - Establish a mandatory second factor (Priority: P2)

*`US02-EP12-ASC-EnrollMFAFactor`*

A person who has accepted an invitation and has not yet enrolled is required to set up
an authenticator before they can reach anything. They are shown a secret to register
in their authenticator app, and they confirm it by returning a code it generates. Only
a confirmed code completes enrollment.

**Why this priority**: This is what makes Story 1's precondition reachable and what
makes `002/FR-026` satisfiable at all. It is P2 rather than P1 only because Story 1
can be tested against a seeded factor, which makes Story 1 the narrower acceptance
bar. In delivery order this necessarily precedes Story 1 for any real person.

**Independent Test**: Take an identity with a live membership and no verified factor.
Assert it is refused every tenant-scoped capability. Complete enrollment by returning
a valid code derived from the issued secret. Assert enrollment is now recorded, and
that the same previously refused request now succeeds without any other change.

**Acceptance Scenarios**:

1. **Given** an identity with no verified second factor, **When** it attempts any tenant-scoped capability, **Then** the request is refused with the enrollment remedy and no tenant data is returned.
2. **Given** an unenrolled identity beginning enrollment, **When** the secret is issued, **Then** it is presented once for registration in an authenticator app and enrollment is not yet complete.
3. **Given** an issued secret, **When** a valid code derived from it is returned, **Then** enrollment completes, the moment of enrollment is recorded, and the identity may thereafter reach capabilities its membership permits.
4. **Given** an issued secret, **When** an invalid code is returned, **Then** enrollment does not complete, the identity remains unenrolled, and the attempt is recorded.
5. **Given** an issued but unconfirmed secret, **When** the person abandons enrollment and begins again, **Then** the earlier unconfirmed secret cannot be used to complete enrollment.
6. **Given** an identity that has completed enrollment, **When** enrollment is attempted again, **Then** it is refused — replacing a factor is the recovery path of Story 4, not a repeat of enrollment.
7. **Given** any configuration of the system — settings, environment, plan or tenant — **When** enrollment is examined, **Then** no value exists anywhere that makes enrollment optional, skippable or disabled for any identity, any tenant or any archetype.
8. **Given** an enrolled factor, **When** any archetype including the platform operator and a System Administrator attempts to read its secret, **Then** no surface returns it, in plaintext or otherwise.
9. **Given** an enrollment, **When** logs, error payloads, traces and the audit log are inspected, **Then** the secret appears in none of them, while the fact that enrollment occurred is audited by identity reference.
10. **Given** a stored factor secret, **When** the database contents alone are examined without the application's key, **Then** the material obtained is not sufficient to derive a working second factor.
11. **Given** enrollment, **When** the offered factor types are inspected, **Then** an authenticator app is the only enrollable factor and no SMS option exists on any surface.

---

### User Story 3 - Receive single-use backup codes at enrollment (Priority: P3)

*`US03-EP12-ASC-ReceiveBackupCodes`*

At the moment a person finishes setting up their authenticator, they are given a set
of one-time codes to keep somewhere safe. Each works once. They are shown exactly
once and cannot be retrieved afterwards by anyone, including the person themselves and
anyone administering the system.

**Why this priority**: Enrollment is not complete without them — the constitution
makes backup codes mandatory and issued at enrollment, and without them Story 4 has
nothing to consume, leaving a lost authenticator as permanent loss of access. It sits
below Story 2 because it is a distinct, separately testable obligation attached to the
same moment.

**Independent Test**: Complete an enrollment and assert that a set of codes is
returned exactly once, that the stored form of each is not the code itself and is not
reversible, that consuming one invalidates that one and leaves the rest usable, and
that no surface anywhere returns the set again.

**Acceptance Scenarios**:

1. **Given** an enrollment being completed, **When** it completes, **Then** a set of exactly 10 backup codes is issued and displayed once, and issuance is audited.
2. **Given** an issued set, **When** the person navigates away or returns later, **Then** no surface re-displays the codes and no capability retrieves them.
3. **Given** a stored set, **When** storage is inspected, **Then** each code is held only as a hash produced by a memory-hard function, never in recoverable form.
4. **Given** an issued set, **When** logs, error messages and the audit log are inspected, **Then** no code appears in any of them, while issuance itself is recorded by identity reference.
5. **Given** an unused backup code, **When** it is consumed, **Then** it is thereafter invalid, the remaining codes stay valid, and the consumption is audited.
6. **Given** a consumed backup code, **When** it is presented a second time, **Then** it is refused identically to a code that never existed.
7. **Given** an identity's codes, **When** any other identity or any archetype including a System Administrator or the platform operator attempts to read them, **Then** no surface returns them.
8. **Given** a set being re-issued, **When** re-issuance completes, **Then** the entire previous set is invalidated and replaced rather than topped up, and the re-issuance is audited.
9. **Given** the last remaining unused code, **When** it is consumed, **Then** exhaustion is audited as a distinct event.

---

### User Story 4 - Recover with a backup code and re-enroll (Priority: P4)

*`US13-EP12-ASC-RecoverWithBackupCode`*

A person who no longer has their authenticator — lost phone, wiped device, deleted app
— signs in with their credential, uses one of the backup codes they were given
instead of a generated code, and is then required to set up a new authenticator before
continuing.

**Why this priority**: It is the only recovery path that exists in this slice, and
without it a lost device is unrecoverable. It is last because it depends on all three
stories above having produced a credential, a factor and a set of codes.

**Independent Test**: Seed an enrolled identity with a known set of codes. Sign in
with a valid credential, present one code in place of a generated one, and assert the
person is admitted, that the consumed code cannot be reused, and that a new factor
must be confirmed before any tenant-scoped capability is reachable.

**Acceptance Scenarios**:

1. **Given** an enrolled identity at a second-factor challenge, **When** a valid unused backup code is presented instead of a generated code, **Then** the challenge is satisfied and that code is consumed.
2. **Given** a satisfied challenge by backup code, **When** the person proceeds, **Then** re-enrollment of a factor is required before any tenant-scoped capability is reachable.
3. **Given** required re-enrollment, **When** a new factor is confirmed, **Then** the previous factor is replaced and no longer satisfies a challenge.
4. **Given** required re-enrollment, **When** the person abandons it, **Then** they hold no access to any tenant-scoped capability and remain in the unenrolled state.
5. **Given** an invalid, already-consumed or nonexistent backup code, **When** it is presented at a challenge, **Then** all three refusals are observably identical to one another.
6. **Given** an identity whose codes are all consumed, **When** it attempts recovery, **Then** it is refused and no alternative self-service recovery path is offered — see Named Risks.
7. **Given** a recovery, **When** the audit log is inspected, **Then** the consumption, the replacement of the factor and the re-issuance of codes are each recorded by identity reference, with the authorising party identified.
8. **Given** a completed recovery, **When** the previous backup code set is examined, **Then** it has been replaced in its entirety.

---

### Edge Cases

- What happens when a device's clock has drifted beyond FR-056's 90-second window, so every code it generates is rejected — is the person given anything that distinguishes this from a wrong code, given FR-022 forbids disclosing why, and does the resulting run of failures put them into FR-021's lockout?
- What happens when two sign-ins for the same identity reach the second-factor step concurrently and both present the same valid code?
- What happens when two recoveries consume the same last remaining backup code in the same instant?
- What happens when a person completes enrollment but their membership is revoked between enrollment and their first tenant-scoped request?
- What happens when a person holds memberships in several tenants and one of those tenants is deactivated between credential verification and the second-factor step?
- What happens when the application-held encryption key is unavailable at verification time — does sign-in fail closed for everyone, and is that distinguishable from a wrong code?
- What happens when the key is rotated while enrolled factors exist?
- What happens when a person abandons enrollment after the secret is issued but before confirmation, leaving an unconfirmed secret at rest?
- What happens when a person's authenticator is restored from a backup onto a second device, so two devices generate valid codes — is that detectable, and is it a defect?
- What happens when a backup code is consumed by someone who has obtained both the credential and the code?
- What happens when an identity that never enrolls lingers indefinitely, holding a live membership that grants nothing? (`002` raised this same case and left it open.)
- What happens when the frontend holds a session the backend has already invalidated — which of the two states the person sees, and whether the shell's generic error state or a return to sign-in is correct.
- Under which tenant is an authentication event audited, given that an identity holds no tenant and sign-in precedes the naming of one?

---

## Requirements *(mandatory)*

### Functional Requirements

**Credential verification**

- **FR-001**: The system MUST verify a presented credential against stored verification material for the identity, and MUST hold that material only as a hash produced by a memory-hard function, never in recoverable form.
- **FR-002**: A credential MUST NEVER appear in logs, error messages, exception payloads, traces or the audit log.
- **FR-003**: Successful credential verification alone MUST NOT emit a session, grant any access, or satisfy any authenticated capability. It MUST only advance the sign-in to a second-factor challenge.
- **FR-004**: A failed credential verification MUST be observably indistinguishable from a credential presented for an email that has no identity, satisfying `002/FR-028`.
- **FR-005**: Repeated failed credential attempts against one identity or from one origin MUST be refused beyond a threshold without disclosing the reason, extending `002/FR-030` to this slice's surfaces. That threshold MUST be the same as FR-021's — 5 consecutive failures, 15-minute lockout, counter reset on success — so that neither step of the sign-in is throttled more loosely than the other.
- **FR-053**: Credential material MUST be established at invitation acceptance, in the same atomic operation that creates the identity and the membership. The invitation reference MUST be the sole proof of email control accepted for that establishment, and a failure MUST leave no identity, no membership, no credential and an unused invitation, preserving `002/FR-023`. An identity MUST NOT exist in a state where a membership has been granted but no credential has been established.
- **FR-054**: Establishing credential material MUST NOT, by itself, grant access to any tenant-scoped capability. Second-factor enrollment remains required before any such access, per FR-006 and `002/FR-026`.

**Second-factor enrollment**

- **FR-006**: Enrollment MUST be required of every identity, internal and external, before it reaches any authenticated capability. The unenrolled state MUST resolve to enrollment or to refusal, never to access.
- **FR-007**: There MUST NOT exist any configuration flag, environment variable, plan entitlement, per-tenant setting or feature flag that disables, skips, defers or relaxes enrollment or the second-factor challenge, for any identity, tenant or archetype. No such mechanism may exist to be misconfigured.
- **FR-008**: An authenticator-app time-based factor MUST be the only enrollable factor type. SMS MUST NOT be offered, accepted or reachable as a primary factor or as a fallback. Email-delivered one-time codes MUST NOT be offered.
- **FR-009**: Enrollment MUST issue a factor secret for registration, MUST present it only during the enrollment exchange, and MUST NOT complete until a valid code derived from that secret is returned.
- **FR-010**: An issued but unconfirmed secret MUST NOT satisfy a later challenge, and beginning enrollment again MUST invalidate any prior unconfirmed secret.
- **FR-011**: The system MUST record the moment enrollment completed, and that record MUST be what `002/FR-026`'s existing precondition reads.
- **FR-012**: Re-running enrollment against an already-enrolled identity MUST be refused. Replacing a factor is reached only through the recovery path of FR-027.

**Custody of factor secrets**

- **FR-013**: A factor secret MUST be encrypted at rest under an application-held key that is separate from the database. Read access to the stored data alone — including a dump or a restored backup — MUST NOT be sufficient to derive a working second factor.
- **FR-014**: A factor secret MUST NEVER appear, in plaintext or ciphertext, in logs, error messages, exception payloads, traces or the audit log. The audit log records that enrollment or verification occurred, by identity reference, never the material.
- **FR-015**: No archetype MUST be able to read a factor secret, including a System Administrator and the platform operator. No surface may return one. Reset MUST mean re-enrollment, never disclosure.
- **FR-016**: Access to the encryption key MUST be restricted and audited to the standard this project sets for PAC/CSD credentials.
- **FR-017**: Failure to access the key at verification time MUST fail closed — refusing the sign-in — and MUST NOT be reported to the caller in a way that distinguishes it from an incorrect code.

**Second-factor challenge**

- **FR-018**: A second factor MUST be challenged on every sign-in, for every archetype, with no exception.
- **FR-019**: No device-remembering, trusted-device, or challenge-suppression mechanism MUST be built or offered, and no device credential may be substituted for the challenge. The capability MUST NOT exist, irrespective of what any underlying library offers.
- **FR-020**: A successfully used code MUST NOT be accepted again anywhere within the full acceptance window of FR-056, not merely within the step it was generated from. A replay guard covering only the current step would leave a used code reusable from the neighbouring steps it was accepted from.
- **FR-056**: Code verification MUST use a 30-second time step and MUST accept a code from the previous, current and next step — a **90-second acceptance window**. It MUST NOT accept a code from any step outside that window. *Rationale: one step either side is RFC 6238's recommendation and what authenticator apps expect. It absorbs ordinary phone-clock drift without materially extending the usefulness of a relayed code — which matters because, with FR-021's five-attempt lockout, an over-narrow window would convert routine drift into a lockout.*
- **FR-021**: **5** consecutive failed second-factor attempts MUST result in a temporary lockout of **15 minutes** for that identity. A successful verification MUST reset the counter to zero. Attempts that present a backup code MUST count toward the same counter, so that the recovery path is not an unthrottled way around the limit. *Rationale: five attempts per fifteen minutes reduces guessing to roughly twenty attempts an hour against odds near three in a million, while a fifteen-minute window keeps a malicious lockout an annoyance rather than a denial of access to a live matter.*
- **FR-055**: A lockout under FR-021 MUST refuse the challenge without disclosing that a lockout is in effect, whether the identity exists, or how many attempts remain, per FR-022. It MUST expire on its own without requiring administrative action, since no archetype holds a reset capability.
- **FR-022**: A refusal at the challenge step MUST NOT disclose whether the identity exists, whether a factor is enrolled, or whether the presented value was a generated code or a backup code.

**Backup codes**

- **FR-023**: A set of backup codes MUST be issued as part of completing enrollment, and enrollment MUST NOT be considered complete without it.
- **FR-024**: The set MUST be displayed exactly once, at issuance. No surface MUST re-display or retrieve it afterwards, for anyone.
- **FR-025**: Each code MUST be stored only as a hash produced by a memory-hard function, never in recoverable form, never in logs, never in error messages and never in an audit entry.
- **FR-026**: Each code MUST be single-use. Consuming one MUST invalidate that code and leave the remainder valid.
- **FR-027**: A backup code MUST satisfy a second-factor challenge in place of a generated code, and doing so MUST require enrollment of a replacement factor before any tenant-scoped capability becomes reachable.
- **FR-028**: Re-issuance MUST replace the entire set rather than topping it up, invalidating every previously issued code.
- **FR-029**: No archetype MUST be able to read any backup code, including a System Administrator and the platform operator, and no identity may read another's.
- **FR-030**: An invalid code, an already-consumed code and a code that never existed MUST produce observably identical refusals.
- **FR-031**: The system MUST issue exactly **10** backup codes at enrollment. Codes MUST NOT expire with the passage of time and MUST cease to be valid only by being consumed or by the set being replaced under FR-028. *Rationale: a time limit would lock out a person whose codes were stored safely and never used, creating a second route into the terminal dead end named under Named Risks, which assisted reset does not close until IT2. The accepted tradeoff is that a captured list stays valid until used or replaced.*
- **FR-032**: Re-issuance MUST be governed by freshness, and the two cases MUST be treated differently:
  - **As part of the recovery flow** (FR-027, immediately following a satisfied challenge and a confirmed replacement factor), re-issuance MUST proceed without a separate step-up check. The recovery has just established possession of two factors, which is the freshness a step-up check would otherwise establish. This path MUST be available on delivery of this slice, because FR-028 and US4 scenario 8 require recovery to replace the set, and recovery cannot complete otherwise.
  - **As a standalone, proactive act** on an established session, re-issuance MUST NOT be exposed in production until `005` supplies step-up MFA. Until then the capability is deferred by non-exposure, the same posture `002/research.md` D10 takes toward its four step-up-gated capabilities — satisfied by non-exposure in the interim, not bypassed.

**Session emission — the boundary with 005**

- **FR-033**: On successful completion of both steps, the system MUST emit exactly one initial session for the identity.
- **FR-034**: Every subsequent request MUST be validated against this product's own stored session state. Validity MUST NOT be determined by a presented token's own signature and claimed expiry alone.
- **FR-035**: Access granted by the initial session MUST be valid for **15 minutes**, and MUST be renewable by a refresh credential that is persisted server-side with device metadata, is individually revocable, and is rotated on every use.
- **FR-036**: Detected reuse of an already-rotated refresh credential MUST revoke the entire family of credentials descended from that session.
- **FR-037**: The session MUST NOT carry tenant or archetype as an authority. Both MUST continue to be resolved per request from stored membership, per `002/FR-016`.
- **FR-038**: Idle and absolute expiry by role class, explicit sign-out semantics, revocation on tenant deactivation, session inventory and step-up MFA are **not** delivered here. This slice MUST emit the session in a form that `005` extends rather than replaces.

**Enforcement and refusal ordering**

- **FR-039**: The enrollment refusal MUST remain position 1 of the refusal ordering `004` fixed, ahead of permission, scope and entitlement, and this slice MUST NOT reorder it.
- **FR-040**: The surfaces this slice adds — credential verification, challenge, enrollment and recovery — MUST NOT be gated by an entitlement or capability check, because each is reached by definition before an authenticated, membership-resolved principal exists. An unentitled, ungated authentication route is the correct design here and MUST NOT be recorded later as a defect.
- **FR-041**: Completing this slice MUST allow `002`'s HTTP surfaces to be reached with a real verified principal in place of the header stand-ins `002/research.md` D10 describes, and those stand-ins MUST NOT remain accepted on any network-reachable surface once real verification exists.

**Audit** — extends the vocabulary of `001/FR-014` and `002/FR-031` under the same mechanism

- **FR-042**: This slice MUST add these audited actions: enrollment started, enrollment completed, enrollment failed, factor replaced, backup codes issued, backup code consumed, backup codes exhausted, backup codes re-issued, sign-in succeeded, sign-in failed, challenge failed, and account temporarily locked.
- **FR-043**: Audit entries MUST identify people by identity reference, never by email address or other contact detail, and MUST NOT contain a credential, a factor secret or a backup code, satisfying Principle VI and `002/FR-032`.
- **FR-044**: An authentication event MUST be audited even though no tenant is active at the time it occurs, and the entry MUST remain attributable and readable.
- **FR-045**: A refused sign-in MUST be audited without the entry itself disclosing whether the presented email was known to the system, following `002/FR-034`.

**Frontend**

- **FR-046**: The product MUST present screens for sign-in, enrollment (secret presentation and code confirmation), the second-factor challenge, and backup-code recovery, rendered inside the existing shell.
- **FR-047**: `getPrincipal()` MUST read the real session rather than a checked-in fixture, and MUST preserve its existing shape — an identity reference and the live memberships it holds — so that every existing consumer continues to work unchanged.
- **FR-048**: This slice MUST NOT modify any file in the shell, feedback or authorization-presentation modules, per `016a/research.md` D5's design contract. The replacement MUST remain confined to the session module.
- **FR-049**: All copy on these screens MUST be in Spanish, per the constitution's language rule for UI and `016a/FR-020`.
- **FR-050**: These screens MUST remain fully usable at both a desktop-sized and a mobile-sized viewport, per `016a/FR-021`.
- **FR-051**: A factor secret, a credential and a backup code MUST NOT be persisted by the frontend beyond the exchange that requires them, and MUST NOT be written to browser storage.
- **FR-052**: A person holding a session the backend has already invalidated MUST be returned to sign-in rather than shown a partially populated screen.

### Permission Matrix *(required by Principle IV)*

Deny by default. This matrix is unusual in one respect that is deliberate: every
capability below is reached **before** an authenticated, membership-resolved principal
exists, so its rows are not archetype-conditioned in the way `002`'s and `004`'s are.
What the matrix asserts here is the far stronger property that **no archetype holds
any capability over anyone's authentication factors**, including their own where the
constitution forbids reading them.

| Capability | Unauthenticated caller | Self (authenticated) | SA | MP | PO (platform context) |
|---|---|---|---|---|---|
| Present a credential for verification | Permitted — this is the entry point | N/A | N/A | N/A | N/A |
| Answer a second-factor challenge | Permitted, only for a challenge already begun | N/A | N/A | N/A | N/A |
| Begin and confirm enrollment | Permitted, only for an identity with no verified factor | N/A | N/A | N/A | N/A |
| Consume a backup code at a challenge | Permitted, only for a challenge already begun | N/A | N/A | N/A | N/A |
| Re-enroll a factor after recovery | Permitted, only immediately following a satisfied recovery | Self only | Deny | Deny | Deny |
| Read a factor secret | Deny | **Deny — nobody, ever** | Deny | Deny | Deny |
| Read a backup code | Deny | **Deny — nobody, ever, including its owner after issuance** | Deny | Deny | Deny |
| Re-issue own backup codes — within the recovery flow | Permitted, only immediately following a satisfied recovery | Self only — no step-up required (FR-032) | Deny | Deny | Deny |
| Re-issue own backup codes — standalone, on an established session | Deny | Self only — **withheld from production until `005`** (FR-032) | Deny | Deny | Deny |
| Reset another person's factor | Deny | N/A | **Deny — IT2, `US14`–`US17`** | Deny | Deny |
| Disable enrollment or the challenge | Deny | Deny | Deny | Deny | **Deny — no such capability exists** |
| Read another identity's enrollment state | Deny | Deny | Deny — IT2, `US17` | Deny | Deny |

Notes on this matrix:

- **The last two rows describe absences, not denials.** No surface, setting or
  operation implementing them may exist to be permitted. This is the difference
  between a capability that is denied to everyone and a capability that was never
  built, and the constitution requires the latter for disabling MFA.
- **"Permitted" in the unauthenticated column is bounded by state, not by archetype.**
  Each is reachable only in the specific pending state that precedes it — a challenge
  only for a sign-in already past credential verification, enrollment only for an
  identity with no verified factor, re-enrollment only immediately after a satisfied
  recovery. None is a general-purpose surface.
- **Resetting another person's factor is genuinely absent, not merely denied to these
  archetypes.** `US14`–`US17` are IT2. See Named Risks.
- **Step-up dependency:** the constitution makes step-up MFA mandatory for resetting
  another user's MFA. That capability is not built here, so the obligation does not
  bind this slice's surfaces — with the single possible exception of backup-code
  re-issuance, which FR-032 leaves open.

### Key Entities *(include if feature involves data)*

- **Credential material**: The verification material for one identity, held only as a memory-hard hash. Comes into existence at invitation acceptance, in the same atomic operation as the identity and the membership (FR-053). Never returned by any surface, never logged. Tenant-global, following the identity it belongs to.
- **Second factor**: The enrolled authenticator binding for one identity — its secret, encrypted at rest under an application-held key separate from the database, plus the moment enrollment completed. Readable by no archetype. Exactly one verified factor per identity in v1.0.
- **Backup code set**: The one-time codes issued to one identity at enrollment, each held only as a memory-hard hash, each single-use, the set replaced in its entirety on re-issuance. Readable by no archetype, including its owner after issuance.
- **Session**: The access emitted on successful authentication, against which every request is validated. Carries an identity reference and no tenancy or archetype. Tenant-global. `005` owns its lifetime, its expiry by role class and its revocation; this slice owns only its emission.
- **Refresh credential**: The server-side, individually revocable, rotated-on-use credential that renews access, persisted with device metadata and belonging to a family that reuse detection revokes as a whole.
- **Authentication attempt**: The record of a sign-in, enrollment or recovery attempt and its outcome, sufficient to enforce the thresholds of FR-005 and FR-021 and to audit under FR-042, holding no factor material.

`001` owns **Tenant**, **Plan** and **AuditEvent**; `002` owns **Identity**,
**Membership** and **Invitation**. This slice adds authentication material to the
identity `002` already defined, and adds to the audit action vocabulary without
altering that entity. Neither the identity nor the session carries a `tenant_id` or an
RLS policy of its own — they are tenant-global by design and are the documented
exception to the RLS catalogue check (Constitution v1.5.0, *Self-hosted identity*). A
slice that adds a tenant-scoped column to either is changing that decision and needs
an amendment.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of sign-ins demand a second factor. 0 sign-ins complete on a credential alone, across every archetype.
- **SC-002**: 0 sessions are emitted before both steps succeed.
- **SC-003**: An identity with no verified second factor reaches 0 tenant-scoped resources, and 100% of its attempts are refused with the enrollment remedy.
- **SC-004**: 0 configuration values — settings, environment, plan entitlement, tenant setting or feature flag — alter whether enrollment or the challenge occurs, verified by exhaustive inspection of configuration surfaces rather than by sampling.
- **SC-005**: A second sign-in from the same device and browser is challenged in 100% of cases. 0 surfaces offer to remember a device.
- **SC-006**: 0 factor secrets are readable through any capability by any archetype, including SA and PO.
- **SC-007**: 0 occurrences of a factor secret, a credential or a backup code appear in logs, error payloads, traces or the audit log, verified by automated inspection.
- **SC-008**: A database dump taken without the application key yields 0 working second factors.
- **SC-009**: 0 sign-ins succeed when the encryption key is unavailable, and those refusals are indistinguishable from an incorrect code.
- **SC-010**: A completed enrollment issues exactly 1 backup code set containing exactly 10 codes, displayed exactly 1 time. 0 surfaces re-display or retrieve it.
- **SC-031**: 0 backup codes become invalid through the passage of time alone — an unused code issued at enrollment remains valid until consumed or until the set is replaced.
- **SC-032**: The 6th consecutive failed second-factor attempt is refused in 100% of cases, including when it presents a valid code or a backup code; the lockout lifts after 15 minutes with 0 administrative actions required; and a success at or before the 5th attempt resets the counter in 100% of cases.
- **SC-033**: 100% of completed recoveries return the identity to a full set of 10 valid codes, with 0 step-up checks required inside the recovery flow; and standalone re-issuance is reachable from 0 production surfaces until `005` lands.
- **SC-034**: Codes from the previous, current and next 30-second step are accepted in 100% of cases; codes from any step outside that 90-second window are accepted in 0% of cases; and a code already used successfully is accepted on 0 replays from anywhere within that window.
- **SC-011**: 100% of stored backup codes are held as memory-hard hashes. 0 are recoverable.
- **SC-012**: Consuming 1 backup code invalidates exactly that 1 and leaves the remainder valid — 0 collateral invalidations.
- **SC-013**: A consumed backup code succeeds on 0 subsequent attempts.
- **SC-014**: Re-issuance leaves 0 codes from the previous set valid.
- **SC-015**: A recovery by backup code grants access to 0 tenant-scoped resources until a replacement factor is confirmed.
- **SC-016**: The refusals for an invalid, consumed and nonexistent backup code are byte-identical in 100% of comparisons.
- **SC-017**: The refusals for an unknown email and an incorrect credential are byte-identical in 100% of comparisons.
- **SC-018**: A successfully used second-factor code is accepted on 0 replays within its validity window.
- **SC-019**: Access from the initial session expires at exactly 15 minutes, and a refresh credential presented twice results in the revocation of 100% of its family.
- **SC-020**: 100% of requests validate against stored session state; 0 are admitted on a presented token's claimed expiry alone.
- **SC-021**: A tenant or archetype presented in the session or by the caller is honoured as their source in 0 requests.
- **SC-022**: Each of the twelve audited actions in FR-042 produces exactly 1 entry — 0 missing, 0 duplicated.
- **SC-023**: 0 audit entries from this slice contain an email address, other contact detail, or any factor material, verified by automated inspection.
- **SC-024**: `getPrincipal()` reads real session state, and 100% of its existing consumers — the four production consumers and the thirteen test files that reference it — continue to pass with 0 modifications to the function's shape.
- **SC-025**: 0 files under the shell, feedback and authorization-presentation modules are modified by this slice.
- **SC-026**: 100% of copy sampled across the four new screens is in Spanish; 0 instances of English user-facing copy.
- **SC-027**: The four new screens are fully usable at both a desktop-sized and a mobile-sized viewport, with 0 unreachable controls at either.
- **SC-028**: 0 credentials, factor secrets or backup codes are present in browser storage after any of the four flows completes.
- **SC-029**: Coverage of MFA enforcement, backup code issuance and consumption, and factor secret encryption, decryption and verification is complete and blocking in CI, on the same footing as tenant isolation — each of the three asserted individually rather than discharged by an aggregate authentication figure.
- **SC-030**: `002`'s HTTP surfaces are reachable with a real verified principal, and the header stand-ins `x-identity-id`, `x-tenant-id`, `x-subject` and `x-email` are accepted on 0 network-reachable surfaces.

---

## Assumptions

- **The constitution this spec is drafted against is v1.5.0 as it exists in the working tree, not as committed.** `main` at `0901b08` carries v1.4.1, which names Amazon Cognito as the live identity provider 23 times and mentions neither NextAuth nor `otplib`. The v1.5.0 amendment — the self-hosted identity decision this entire spec rests on — is present and complete as an uncommitted modification to `.specify/memory/constitution.md`. Drafting proceeded on that basis at the author's explicit direction. **Committing that amendment is a precondition of this spec's approval**, because every constitutional citation here is otherwise unverifiable against repository history.
- **Credential material is established at invitation acceptance** (resolved 2026-09-09; FR-053). Nothing in `002` sets a credential and no shipped capability does, because under the retired provider a person signed up externally before accepting. This slice closes that gap at acceptance rather than beside it: the invitation reference is already single-use, opaque and 7-day-limited, which makes it the proof of email control a first credential-set requires, and acceptance is already the single atomic operation where identity and membership come into existence (`002/FR-023`). A second setup token was rejected as introducing an identity that briefly exists with no credential — a state FR-006 would refuse anyway. **This extends `002`'s acceptance operation in code; it does not amend `specs/002-identity-membership/`**, so Merge Rules' one-slice-per-directory scope is unaffected. `002/FR-023`'s atomicity guarantee must survive the extension.
- **The identity layer supplies a stable, unique subject identifier per person and remains the sole authority on authentication.** It holds no tenancy and no archetype (Constitution v1.5.0, *Self-hosted identity*). This is unchanged from `002`'s assumption; only the party supplying it has changed.
- **This slice emits one initial session and `005` extends that mechanism rather than replacing it.** The 15-minute access lifetime and the rotating, server-side, individually revocable refresh credential are fixed by the constitution, not chosen here, so `005` inherits a working mechanism and adds expiry by role class, sign-out, revocation propagation, session inventory and step-up. This is treated as an assumption rather than an open question because nothing in the four stories is unbuildable without `005` — the same fixture-then-extend relationship `001` had with `002`.
- **`004`'s authorization module is not on these routes and its absence there is correct.** `004` is built and tested, and its own Dependencies table already records that it needs nothing from this slice. Its refusal ordering places enrollment at position 1, which this slice satisfies rather than modifies.
- **The enrollment precondition `002` already enforces is the integration point, not a new mechanism.** The identity record already carries an enrollment timestamp and per-request membership resolution already refuses while it is absent. This slice makes that timestamp settable; it does not introduce a second enforcement path.
- **One verified factor per identity in v1.0.** Multiple concurrent authenticators are not specified, and replacing a factor proceeds through recovery. Passkeys are a later build inside this identity layer, per Constitution Technical Debt item 10, and are not enabled here.
- **Time-based expiry and validity windows derive from the same authoritative time source as audit timestamps** (`001/FR-020`), never from a caller-supplied value.
- **Both identity and session remain tenant-global, carrying no `tenant_id` and no RLS policy**, as the documented exception to the RLS catalogue check. The `membership` table remains the sole resolver from an identity to tenant data and remains policied normally.
- **The archetype codes are those fixed by Principle IV**, and the frontend's transcription of them in the session module is already in place from `016a`.
- **Invitation delivery, and any transactional email this slice might otherwise want, remain `002`'s concern.** Nothing here introduces a new outbound message: recovery is self-service by backup code, not by emailed link, and requesting one-time codes by email link is prohibited outright.

---

## Dependencies

| On | For | Blocking |
|---|---|---|
| **Constitution v1.5.0 committed to `main`** | Every provider, factor, custody and session citation in this document | **Yes — see Assumptions.** Present in the working tree, absent from history |
| `001-tenant-foundation` | Audit mechanism and timestamps, RLS, the tenant-context interceptor | No — built and merged |
| `002-identity-membership` | The identity record, its enrollment timestamp, membership resolution, the acceptance flow that creates an identity, and enumeration-resistance precedent | No — built and merged. This slice makes its `FR-026` precondition satisfiable, and **extends its acceptance operation** to establish credential material (FR-053), preserving that operation's atomicity |
| `004-authorization-entitlements` | Refusal ordering position 1, which this slice satisfies and must not reorder | No — built and merged, needs nothing from here |
| `016a-frontend-shell` | The shell the four screens render inside, and the `getPrincipal()` seam this slice replaces | No — built and merged. D5's one-file replacement contract is the interface |
| `006`, `007`, `017`, `018`, `019` | Nothing required, but all five consume `getPrincipal()` and all five are validated by SC-024 | No — their suites are the regression surface |
| `005-session-lifecycle` | Nothing this slice needs for delivery. It gates production exposure of standalone backup-code re-issuance, adding a fifth capability to the four it already gates for `002` | No for delivery — recovery-path re-issuance ships now (FR-032) |
| An application-held encryption key, separate from the database, with restricted and audited access | FR-013, FR-016 | **Yes.** No factor may be enrolled before this custody exists |
| `master-user-story-catalog.md` | `US02`, `US03`, `US06`, `US13` — all four present, no amendment required | No |

---

## Out of Scope

**Owned by `005-session-lifecycle`:** idle and absolute session expiry by role class;
explicit sign-out semantics beyond the emission this slice must perform; revocation of
sessions on tenant deactivation; step-up MFA. Where a requirement here touches that
boundary it is marked — FR-033 through FR-038 emit the session and stop; FR-032 is the
single point where a step-up obligation bears on this slice, and it is resolved by
splitting the case: re-issuance inside recovery ships, standalone re-issuance is
withheld from production until `005`.

**Owned by IT2:** assisted MFA reset when backup codes are exhausted (`US14`–`US17`).
The gap this leaves is named below rather than closed here. Session inventory and
individual session revocation (`US09`, `US10`). Tenant-wide MFA coverage review
(`US17`).

**Not this slice:** `004`'s capability matrix and any entitlement check — FR-040 states
positively that these routes are correctly ungated, so that an ungated authentication
route is not later filed as a defect. Passkeys and WebAuthn, a later build inside this
identity layer per Technical Debt item 10. SMS as a factor, prohibited outright. Email
one-time codes, deferred and not permitted, with the earliest sensible reinstatement
trigger being EP13's validation. Enterprise SSO or federation to a firm's own identity
provider, an MVP prohibition. Self-service signup: invitation remains the only path to
a membership, per `002/FR-020`. Password change and self-service password reset, which
`002` records as retired from the catalog and which no story in this slice's set
covers. Profile and email editing, including the email-change conflict of Technical
Debt item 6. EP13 external portal onboarding, unvalidated. Any administrative
interface beyond the four screens named in FR-046.

---

## Named Risks

**A person who loses their authenticator and has exhausted their backup codes has no
recovery path in this slice.** This is the direct, accepted consequence of `US14`–
`US17` being IT2 rather than MVP, and it is recorded here rather than remedied.

- The dead end is genuine and terminal for that identity: FR-015 forbids disclosing a
  factor secret to anyone, FR-029 forbids reading a backup code, no archetype
  including SA and PO holds a reset capability, and FR-006 refuses every authenticated
  capability to an unenrolled identity. There is no back door, by design.
- The remedy available at MVP is operational rather than technical, and it is outside
  this slice: an identity in that state must be replaced through `002`'s invitation
  flow, which produces a new identity and a new membership rather than recovering the
  existing one. Whether that is acceptable to a firm whose partner is locked out
  mid-matter is a product decision, not one this spec can make.
- The exposure is bounded by FR-031's ten codes, none of which expire with time, and by
  the fact that every recovery replaces the set in full (FR-032, first case), so a
  person who recovers arrives back at ten rather than counting down. Exhaustion
  therefore requires ten failed or abandoned recoveries in a row, which is remote.
  **What is not available until `005` is proactive top-up** on an established session
  (FR-032, second case), so a person who wants a fresh list without having lost
  anything must wait — an inconvenience, not a route into the dead end.
- **Review trigger:** the first real occurrence, or the start of IT2 planning,
  whichever comes first.

**Authentication is not phishing-resistant, and this slice does not make it so.** A
time-based code is vulnerable to real-time relay, and challenging on every sign-in
does not mitigate that vector. Claiming phishing resistance in commercial, sales or
compliance material is prohibited (Constitution Technical Debt item 1). The remedy is
passkeys, which item 10 records as a build rather than a configuration change since
2026-09-04.

**Three constructions that were previously a vendor's guarantee are now this
codebase's.** Mandatory enrollment, backup code custody and factor secret custody are
owned here — Technical Debt items 8, 10 and 11 — and a defect in any of them is an
authentication bypass rather than a bug. This is why SC-029 requires each of the three
to be asserted individually and blockingly rather than discharged by an aggregate
coverage figure.

---

## Open Questions

**None remain.** All three `[NEEDS CLARIFICATION]` markers closed on 2026-09-09, along
with two further items surfaced during the same session. Recorded below so the
reasoning survives, and so none is reopened without new information.

| # | Question | Decision | Where it lands |
|---|---|---|---|
| 1 | How many backup codes are issued at enrollment, and do they expire with time or only by consumption? | **10 codes, consumption-only.** No time-based expiry, because it would lock out a person whose codes were stored safely and never used, creating a second route into the terminal dead end that assisted reset does not close until IT2. Accepted tradeoff: a captured list stays valid until used or replaced | FR-031, US3 scenario 1, SC-010, SC-031 |
| 2 | How many consecutive failed second-factor attempts trigger temporary lockout, and for how long? | **5 failures, 15-minute lockout**, counter reset on success. Backup-code attempts count toward the same counter so recovery is not an unthrottled bypass, and FR-005 uses the same threshold so neither sign-in step is looser than the other | FR-005, FR-021, FR-055, US1 scenarios 12–13, SC-032 |
| 3 | Does backup-code re-issuance after a recovery require step-up MFA, given that `005` does not exist? | **Split by case.** Inside the recovery flow it needs no step-up — the recovery has just established possession of two factors — and it ships now, because FR-028 and US4 scenario 8 make recovery unable to complete without it. Standalone proactive re-issuance is deferred by non-exposure until `005` | FR-032, permission matrix, SC-033 |
| 4 | When is credential material established, given that nothing in `002` sets one? | **At invitation acceptance**, in the same atomic operation that creates the identity and membership, with the invitation reference as the proof of email control. Extends `002`'s acceptance operation in code, not its spec directory. A second setup token was rejected as producing an identity that briefly exists with no credential | FR-053, FR-054, Assumptions, Key Entities |
| 5 | How much clock drift is tolerated when verifying a code? | **30-second step, ±1 step accepted — a 90-second window.** RFC 6238's recommendation; narrower would convert routine drift into an FR-021 lockout. The FR-020 replay guard covers the whole window rather than the current step alone | FR-020, FR-056, SC-034 |

**Deliberately not resolved here, and not open questions.** Two design choices belong
in `plan.md` and `research.md` rather than in this document, per the Approval
Checklist's prohibition on implementation detail:

- Whether access is carried by a signed token holding a session pointer or by an
  opaque high-entropy token. Both satisfy FR-034's requirement that every request
  validate against stored session state, and the choice changes no requirement or
  success criterion here.
- How the identity library's own session handling is used, if at all, against this
  product's own session state being the sole authority on the API side.

---

## Approval Checklist

- [ ] **Constitution v1.5.0 committed to `main`** — every citation in this document depends on it, and `main` currently carries v1.4.1
- [x] Three `[NEEDS CLARIFICATION]` markers closed — FR-021, FR-031, FR-032 (clarified 2026-09-09; see Open Questions)
- [x] Credential establishment resolved — at invitation acceptance, extending `002`'s acceptance operation in code without amending its spec directory (FR-053, FR-054; clarified 2026-09-09)
- [x] `US02`, `US03`, `US06`, `US13` present in `master-user-story-catalog.md` (Principle I) — all four, no amendment required
- [x] Permission matrix declared (Principle IV) — including the two rows that describe absences rather than denials
- [x] Audit events enumerated per operation (Principle V) — FR-042
- [x] Tier classification declared — cross-cutting, never gated
- [x] Blocking coverage of the three constitutional authentication paths stated individually — SC-029
- [x] The boundary with `005` stated as an assumption with the emission requirements it implies — FR-033 to FR-038
- [x] The ungated status of this slice's routes stated positively so it is not later filed as a defect — FR-040
- [ ] No implementation or technology detail in this document — *review needed: Assumptions and Dependencies name the identity and factor libraries, and Key Entities names the RLS exception. All are stated as constraints inherited from the constitution rather than as design choices, following the same posture `002`'s checklist flagged for the same reason, but a reviewer should confirm that is acceptable under Principle I.*
- [ ] Every requirement is test-verifiable
- [ ] Approved by Cosmic Chimps technical lead
