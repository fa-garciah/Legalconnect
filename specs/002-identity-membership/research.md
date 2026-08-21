# Phase 0 Research: Identity, Membership & Invitation

**Feature**: `002-identity-membership` | **Date**: 2026-08-21 | **Plan**: [plan.md](./plan.md)

Unlike `spec.md`, this document is allowed to name technology. Most of the stack is
fixed by the constitution; what follows records the decisions genuinely open to this
slice, plus the non-obvious mechanics of the ones that were not.

Decision numbering is local to this document. `001/D<n>` cites slice 001's
`research.md`.

---

## D1 — Accepting an invitation is one `SECURITY DEFINER` function

**Decision**: A single PostgreSQL function, `accept_invitation(reference_hash,
subject, email, occurred_at_source)`, does the entire acceptance atomically:
looks up the invitation by its hashed reference, validates it (unexpired, unused,
unrevoked, email match, tenant active), finds-or-creates the `identity` row for
`subject`, creates the `membership` row, marks the invitation accepted, and writes
the `identity.created` (if new) and `membership.created` audit entries — all inside
one transaction, all as the function's owner rather than the ordinary application
role.

**Rationale**: FR-023 requires this to be atomic across three tables, for a caller
who by definition holds no live membership yet. The ordinary application role
cannot be granted `INSERT` on `membership` at all (see D4 and the Complexity
Tracking entry it shares with this decision) without reopening exactly the gap
FR-009/SC-009 exist to close — "no membership can be created by any path other than
accepting an invitation" has to be true of the grants themselves, not of which code
paths happen to call them. A definer function is the same shape as 001's
`audit_append_cross_tenant_attempt` ([001/D8](../001-tenant-foundation/research.md#d8--recording-a-cross-tenant-attempt-without-leaking-the-actors-other-tenants)):
narrowly scoped, tested for what it can and cannot do, and the only sanctioned way
across a boundary the ordinary role may not otherwise cross.

**Alternatives considered**:
- *Three separate application-level statements inside one Drizzle transaction.*
  Rejected: it requires granting the write access to `identity`/`membership` this
  slice is built specifically to avoid granting, and it reduces to "atomic because
  the code never returns in between" — the same weaker guarantee 001's D6 rejected
  for the audit append.
- *A dedicated "acceptance" database role, distinct from both the application role
  and the platform role.* Considered and rejected on cost: it would need its own
  connection pool and its own startup assertion, for a capability one function
  already expresses completely. Revisit if a second definer-function use case
  appears that this one does not cover.

**What the function returns**: a discriminated outcome — `accepted` with the new
or existing `identity_id` and the new `membership_id`, or `refused` with no further
detail. The refused branch also writes its own `invitation.refused` audit entry
inside the same call, for the same atomicity reason: a refusal is not a mutation
that needs a rollback path, but it still needs FR-034's guarantee that the entry
never discloses which specific reason applied.

---

## D2 — The invitation reference is a random token, hashed at rest, distinct from the row's id

**Decision**: `invitation.id` is an ordinary internal `uuid`, never exposed.
`invitation.reference_hash` is the SHA-256 hash of a separately generated
256-bit random token; the raw token is what appears in the invitation email/URL and
is never stored. Lookup during acceptance is by `reference_hash`.

**Rationale**: An invitation reference is a bearer credential for a one-time
action. If the database were read (backup exposure, a compromised replica), a
stored raw token would let the reader accept invitations directly; a stored hash
does not. This is not the same named exception the constitution grants for backup
codes (Authentication, *Named exception*) — that exception concerns authentication
factors, and an invitation reference is neither a password nor an MFA factor
(FR-002 draws that line and this token stays on the correct side of it). A fast
hash (SHA-256, not a memory-hard one) is the right tool here, unlike backup codes:
the token carries 256 bits of entropy, so brute-forcing the hash is infeasible
regardless of hash speed, whereas a short backup code needs a slow hash precisely
*because* its own entropy is limited.

**Alternatives considered**:
- *Use `invitation.id` itself as the reference.* Rejected: a `uuid` primary key is
  not designed as a secret, and several code paths (revoke, list-pending) already
  need to reference an invitation by an identifier that is safe to log and to pass
  through ordinary tenant-scoped queries. Splitting the two purposes was simpler
  than trying to make one identifier serve both safely.
- *A memory-hard hash (Argon2id/scrypt) for the reference, matching backup codes.*
  Rejected as unnecessary cost: memory-hard hashing exists to slow down guessing a
  low-entropy secret. A 256-bit token has no guessing surface a slow hash would
  meaningfully narrow.

---

## D3 — Self-enumeration uses a second permissive RLS policy, not a second table

**Decision**: `membership` carries two permissive `SELECT` policies rather than
one: the existing tenant-scoped shape (`tenant_id = ` the null-safe tenant
setting), and a second, `identity_id = ` a null-safe `app.identity_id` setting.
PostgreSQL combines permissive policies with `OR`, so a row is visible if either
holds. `app.identity_id` is set in two places: alongside `app.tenant_id` whenever a
tenant context activates (extending `runInTenantContext`, since `ActivePrincipal`
already carries `identityId`), and alone, with no tenant set, for the two
identity-only routes (accept, enumerate).

**Rationale**: FR-017 requires an identity to enumerate its own live memberships
without that read being reachable from inside a tenant session, and FR-023 (001)
already forbids a `findAllForIdentity` shape on the port precisely because nothing
tenant-scoped has a legitimate reason to call it. A second RLS policy gives the
enumeration route a real cross-tenant read that is still enforced at the data
layer — the row is visible only because the setting names that exact identity, not
because application code remembered to filter.

**Alternatives considered**:
- *Application-level enumeration via the platform role.* Rejected: the platform
  role's whole design point (001/D9) is that it never impersonates a tenant-facing
  read; routing a person's own data through it would be a second, wider hole for a
  narrow need.
- *A separate `identity_membership_summary` materialized view.* Rejected as
  premature — this is a small, infrequently-read table; a second policy costs
  nothing a view would save.

---

## D4 — The `identity` table has no general grant for the application role

**Decision**: The application role holds exactly one privilege on `identity`: a
`SELECT` restricted by a self-row policy (`id = ` the null-safe `app.identity_id`
setting). No `INSERT`, no `UPDATE`, no unrestricted `SELECT`. The only way a row is
created or changed is the `accept_invitation` function (D1) and, in a later slice,
whatever slice 003 uses to set `mfa_enrolled_at`.

**Rationale**: FR-004 — "no tenant session may enumerate identities, read an
identity that holds no membership in the active tenant, or observe how many
identities exist" — is written the way Principle II is written: as a data-layer
guarantee. The one legitimate read this slice has (a caller confirming its own
`mfa_enrolled_at` as part of membership resolution, D5) is already satisfied by the
self-row policy, so there is no case that needs a wider grant.

**Alternatives considered**:
- *`SELECT` scoped by an application-level check inside each handler.* Rejected as
  the specific failure mode Principle II names: "a developer who forgets the
  filter must get zero rows, not another firm's" — here, not another person's
  identity data at all.

---

## D5 — FR-026 extends the existing refusal vocabulary rather than adding a second port

**Decision**: `MembershipRecord` (001) gains one additional field,
`identityMfaEnrolledAt: string | null`, populated by a join the database-backed
adapter performs internally. `RefusalReason` gains `'mfa_not_enrolled'`.
`resolvePrincipal` checks it after the existing membership/tenant checks. Unlike
every other tenant-context refusal, `refusalToHttp('mfa_not_enrolled')` answers
`403`, not `404`.

**Rationale**: The 001 seam's own comment states the promise precisely: *"nothing
above this interface changes"* when the fixture adapter is replaced. Extending the
existing record and refusal shapes keeps that promise — nothing that calls
`resolvePrincipal` or reads a `RefusalReason` needs to change its own shape,
only its exhaustiveness switches gain one case. A second port (an `IdentityPort`
alongside `MembershipPort`) was the alternative and was rejected because it would
require two round trips where the adapter can do one join, and because it would
duplicate the "identity is invisible to tenant code" boundary D4 already draws —
the join happens *inside* the adapter, behind the same interface, not in code that
would need its own access to `identity`.

The status-code deviation is deliberate, not an oversight: every other refusal in
001's tenant-context mechanism answers `404` because the caller might be probing
for whether a tenant exists (FR-008, 001). This refusal cannot leak that, because
the caller already holds a genuine, live, resolved membership — reaching this
branch is proof the tenant exists and they belong to it. Telling them to finish
enrollment discloses nothing they do not already legitimately know.

**Alternatives considered**:
- *Answer `404` for consistency with every other tenant-context refusal.*
  Rejected: consistency for its own sake would hide from a legitimate member why
  they were refused, for no confidentiality benefit, since there is nothing left
  to protect at that point in the check sequence.

---

## D6 — The seed capability narrowly extends the platform role's reach

**Decision**: The platform role (001/D9), whose reach was deliberately narrowed to
`tenant`, `plan` and `audit_event`, gains exactly two additional grants: `SELECT`
on `membership` (existence-check only — the seed capability needs to know whether
*any* live membership exists for the target tenant, nothing about who holds it) and
`INSERT` on `invitation`, restricted by a check constraint to rows where
`seeded = true`. It gains no grant on `identity` at all — a seed invitation never
creates one.

**Rationale**: FR-035 has no legitimate caller other than this path: a freshly
provisioned tenant has nobody who could invite under the normal tenant-scoped
route (FR-020's ordinary invite capability requires an active tenant membership,
which by definition does not yet exist). 001 named the platform role's narrowing
as deliberate — "no access to business tables... cross-tenant administrative reach
into case files is not required by any requirement in this slice." That reasoning
still holds for `identity` and for unseeded rows of `invitation` and for any row of
`membership` beyond a count. The two grants added here are the narrowest shape that
makes the bootstrap possible.

**Alternatives considered, matching the three rejected in `spec.md`'s Resolved
Decisions**:
- *General `membership`/`invitation` grants for the platform role* (rejected in
  `spec.md` as "provisioning accepts an initial SA email"): would let the platform
  role read or write tenant membership generally, exactly the reach Principle II
  removes.
- *A one-time bootstrap flag revoked after first use*: rejected in `spec.md` for
  being a convention rather than a mechanism. The zero-live-memberships condition
  checked by the existence-check grant is a mechanism — the capability
  self-extinguishes the moment a `membership` row exists for that tenant, with no
  revocation step for anyone to remember.

---

## D7 — Transactional email is AWS SES outside `mx-central-1`, not a third party

**Decision**: Invitation email (ordinary and seed) sends through Amazon SES from a
secondary AWS region with SES availability (candidate: `us-east-1`), not through a
third-party transactional email provider.

**Rationale**: The constitution explicitly left this choice to this slice's
`plan.md` (*Data Residency*: "the choice between cross-region SES and a
third-party provider is a `plan.md` decision for slice 002... not a constitutional
one"). The same reasoning that selected Cognito applies again: SES adds no vendor,
since the stack is already AWS, and reuses the same IAM, Secrets Manager and
CloudWatch patterns already operated for every other AWS service in the stack.
Constitution Technical Debt item 9 already accepts that transactional email
transits another jurisdiction regardless of provider; a third party would add a
second data processor to name in the privacy notice for no residency benefit over
SES, since neither can be `mx-central-1` (SES is absent there; a third party would
not be in Mexico either).

**Alternatives considered**:
- *Postmark, SendGrid, Resend or similar.* Rejected: adds a vendor and a second
  data processor to the privacy notice, for the same jurisdictional outcome SES
  cross-region already gives. Might be revisited if AWS SES deliverability proves
  worse in practice than a specialised provider — noted as a plan-level, not
  constitutional, choice, so revisiting it does not require an amendment.

**Consequence for FR-036**: content constraints (firm name and opaque reference
only) apply identically regardless of which provider was chosen; this decision
does not change what the message may contain, only who transports it.

---

## D8 — Enumeration-resistance thresholds are concrete configuration

**Decision**: Two numeric defaults, both configuration rather than schema:

- **Per invitation reference**: after 10 failed acceptance attempts against one
  `reference_hash`, further attempts against that same reference are refused with
  the identical generic response, without re-evaluating validity. Tracked by a
  `failed_attempts` counter on the `invitation` row, incremented by the
  `accept_invitation` function itself on any refusal branch tied to that
  reference.
- **Per tenant**: invitation issuance (ordinary and seed) is capped at 200 per
  tenant per rolling hour. Tracked by a count query over recently issued
  invitations, not a separate counter table — issuance volume is low enough that
  this does not need the same care as the per-reference brute-force counter.
  **Revised from an initial 50 during implementation**: a single tenant
  exercised repeatedly by an automated test suite (or a developer re-running it
  several times inside an hour) reaches 50 issued invitations well before an
  hour passes, which would self-throttle ordinary development traffic rather
  than only abuse. 200 still meaningfully bounds an outside actor's ability to
  enumerate emails through this endpoint while giving normal use — including a
  firm onboarding a large batch of staff in one sitting — realistic headroom.

**Rationale**: `spec.md` FR-030 requires *"a defined threshold"* without naming
one — deliberately, since the exact number is an operational tuning question, not
a requirement. A 256-bit reference token (D2) makes brute force already infeasible
without any threshold at all; the counter exists to bound the audit and refusal
traffic a scripted attempt would generate, not because the token is guessable. The
issuance cap exists for the different reason FR-029/FR-005 (US5) name: bounding how
fast an attacker could use repeated invitations to probe which emails already hold
membership, even though each individual response is designed to disclose nothing.

**Alternatives considered**:
- *No numeric cap, relying on the token's entropy alone.* Rejected: entropy
  defeats guessing the token, not the log and refusal volume a sustained scripted
  attempt would otherwise generate against a single reference or a single tenant.
- *A much lower threshold (e.g. 3 attempts).* Rejected as likely to refuse a
  legitimate invitee who mistypes the URL or double-clicks a stale email link;
  10 leaves headroom for that while still being small next to what a real attack
  would need to succeed against 256 bits of entropy — which is to say, the
  threshold is not the actual security boundary, the token is.

---

## D9 — The archetype enum gains `CC`

**Decision**: `Archetype` (`backend/src/common/tenant/principal.ts`, owned by
slice 001) is extended from `'SA' | 'MP' | 'AA' | 'PL' | 'CM' | 'BM' | 'IC' | 'CB'
| 'EL'` to also include `'CC'` (Corporate Client).

**Rationale**: Constitution v1.4.0 Principle IV fixes ten membership-capable
archetype codes (every code except `PO`, which is not a membership at all).
`principal.ts` was missing one of them. This slice is the first to need the full
domain — an invitation's target archetype must be able to name any archetype a
membership may hold, including `CC` — so the gap surfaces here rather than in a
later slice. The change is purely additive: no existing archetype's behaviour
changes, and every exhaustive `switch` over `Archetype` that predates this slice
already needs a new case for a new union member, which the compiler enforces
rather than leaving as a silent gap.

**Alternatives considered**:
- *Leave the gap and let slice 004 fix it.* Rejected: this slice cannot honestly
  declare its permission matrix, which names every archetype from the constitution
  table, while the type it compiles against is missing one of them.

---

## D10 — This slice's HTTP surfaces stay off the network, the same way 001's did

**Decision**: Every route this slice adds — invitation issue/revoke/list, accept,
enumerate-own-memberships, membership revoke/archetype-change, and the seed
endpoint — remains bound to loopback and exercised by tests only, exactly as 001's
`contracts/README.md` states for its own two surfaces. Real Cognito verification
does not exist until slice 003; until then, the "authenticated subject identifier"
and "authenticated email" `spec.md` refers to are still supplied the same way 001
supplies `identityId`/`tenantId` today — a header stand-in (`x-identity-id`,
`x-tenant-id`, and this slice's new `x-subject`/`x-email` for the one route where
no identity may exist yet), trusted only because nothing carrying it is reachable
from outside the test/loopback boundary.

**Rationale**: `spec.md` puts "authentication of any kind" out of scope, the same
boundary 001 drew. Nothing about that boundary changes because this slice happens
to be the one that gives identity and membership real data — the data existing is
not the same as the data being verified on the wire, and conflating the two would
quietly reintroduce unauthenticated tenant-scoped mutation exactly where 001's
README warned it would be catastrophic ("the platform administration surface... 
performs unauthenticated tenant creation... if reachable"). The seed endpoint in
particular would let anyone who could reach it seed an administrator for any
tenant with zero members.

**Alternatives considered**:
- *Build a minimal JWT-verification shim now, ahead of slice 003, so these routes
  can be network-exposed sooner.* Rejected: slice 003 owns authentication as a
  named boundary in both `spec.md` documents (001 and 002); building even a
  minimal version of it here would duplicate work slice 003 will do properly, and
  would create two authentication code paths to reconcile later rather than one.

**Consequence carried into Complexity Tracking's step-up item**: because these
routes are not network-exposed, the constitution's step-up-MFA requirement for
issuing invitations, revoking memberships, changing archetypes and seeding an
administrator is satisfied by non-exposure in the interim, not bypassed — the same
posture 001 took toward its own step-up-gated operations.

---

## Constitution items touching this slice, not resolvable here

| Item | Effect on this slice |
|---|---|
| PAC selection `[PENDING]` | None. Blocks slice 011 only. |
| Step-up MFA mechanism (slice 005) | Four capabilities in this slice's permission matrix are step-up-gated and cannot go to production before slice 005 lands; D10 closes the gap for now via non-exposure. |
| Slice 003 (authentication, MFA enrollment, backup codes) | Supplies the real verification this slice's headers stand in for, and sets `identity.mfa_enrolled_at`, which this slice only reads. |
| Slice 004 (global archetype matrix) | This slice's permission matrix covers only its own capabilities; 004 governs on conflict. |
