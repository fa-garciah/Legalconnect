# Feature Specification: Identity, Membership & Invitation

**Feature Branch**: `002-identity-membership`

**Created**: 2026-08-21 · **Revised**: 2026-08-21 (both open questions closed)

**Status**: Draft — no `[NEEDS CLARIFICATION]` open. Ready for `/plan`.

**Epic**: EP12-AccountSecurity, plus `US16-EP00-FND-SeedFirstAdministrator`

**Constitution**: v1.4.0

**Tier Classification**: Cross-cutting — not tier-restricted. Membership is the
subject that later tier checks are applied to; it is never itself gated.

**Input**: The seam slice 001 left open. `001/FR-021` to `001/FR-024` decided that a
person may hold access to more than one tenant, that identity and membership are
distinct, and that an archetype is a property of a membership. Slice 001 built the
tenant-context mechanism against that contract but supplied identity and membership
through test fixtures. This slice replaces the fixtures with real data and with the
flow that creates it: invitation, acceptance, and the resolution of a live membership.

> **Citation convention.** Requirements of slice 001 are cited as `001/FR-0NN`.
> Bare `FR-0NN` refers to this document.

## Why This Slice Is Next

Every guarantee slice 001 proved is currently proved against
`backend/tests/fixtures/identity.ts`. The isolation suite is green, the audit log is
immutable, and the tenant-context interceptor fails closed — but no real person can
reach any of it, and the membership those guarantees hinge on does not exist as data.
Nothing else in the product can be built on top of a fixture.

This slice is deliberately **authentication-free**. It defines who a person is and
what access they hold; it does not define how they prove they are that person. Login,
MFA enrollment, the second-factor challenge and backup codes are slice 003; session
lifetime, sign-out, step-up and revocation propagation are slice 005. The boundary is
exact: this slice receives an authenticated subject identifier and decides what it
may reach.

## Traceability — three catalog stories were added for this slice

Principle I is explicit: a user story absent from `master-user-story-catalog.md` does
not exist, and a PR without a traceable story ID is rejected. Drafting this spec
surfaced that the catalog had no story for three of its central capabilities. All
three are now registered:

| ID | Archetype | Capability | Why it was missing |
|---|---|---|---|
| `US18-EP12-ASC-AcceptInvitation` | System User | Accept a valid invitation and obtain membership | `US01-EP12-ASC-InviteUser` covered *issuing* an invitation; nothing covered the invited person *acting* on it — the moment an identity and a membership come into existence |
| `US19-EP12-ASC-SelectActiveTenant` | System User | Choose which tenant is active when holding more than one membership | `001/FR-022` requires the active tenant to be explicit and membership-verified; for an identity with several memberships, nothing described who chooses |
| `US16-EP00-FND-SeedFirstAdministrator` | PO (CC Platform Operator) | Issue the first System Administrator invitation for a tenant that has no members yet | Surfaced by closing Open Question 2 below: the permission matrix correctly denies `PO` every membership capability, which left a freshly provisioned tenant with nobody able to invite anyone |

EP12 moves from 17 to 19 stories, EP00 from 15 to 16, and the catalog total from 169
to 172. This is the same class of correction that created EP00 — the mechanism was
decided in a plan before the backlog described it.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Resolve and activate a membership from real data (Priority: P1)

*`US19-EP12-ASC-SelectActiveTenant`* — delivers `001/FR-021`, `001/FR-022`, `001/FR-024`

An authenticated person names the firm they intend to work in. The system confirms
they genuinely hold live access to that firm, and only then does that firm's data
become reachable for the duration of the request. If they hold access to several
firms, each is reached separately and neither is aware of the other.

**Why this priority**: Slice 001's entire isolation guarantee currently rests on
fixtures. Until membership resolution reads real data, the walking skeleton proves a
mechanism against invented inputs. Every other story here creates the data this one
consumes, so this is specified first and is the acceptance bar for the slice.

**Independent Test**: Seed two tenants and one identity holding a live membership in
each, directly in the data store with no invitation flow. Re-run the existing
cross-tenant isolation suite against the real adapter rather than the fixture and
assert it passes unchanged.

**Acceptance Scenarios**:

1. **Given** an authenticated identity holding a live membership in an active tenant, **When** it names that tenant, **Then** that tenant is activated for the request and its archetype for that tenant governs what it may do.
2. **Given** an authenticated identity holding no membership in the named tenant, **When** it names that tenant, **Then** the request is refused, the response is indistinguishable from the tenant not existing, and the attempt is recorded as a cross-tenant access attempt.
3. **Given** an authenticated identity whose membership in the named tenant is revoked, **When** it names that tenant, **Then** the outcome is identical to scenario 2 in every observable respect.
4. **Given** an authenticated identity holding a live membership in a **deactivated** tenant, **When** it names that tenant, **Then** access is refused and the tenant's records remain intact.
5. **Given** an authenticated identity holding live memberships in tenant A and tenant B, **When** it operates with A active, **Then** nothing in any response reveals that the B membership exists.
6. **Given** a request that names no tenant at all, **When** it is processed, **Then** no tenant is activated and the request is refused rather than defaulting to any tenant.
7. **Given** an authenticated identity holding zero live memberships, **When** it makes any tenant-scoped request, **Then** every such request is refused while the identity itself remains valid.
8. **Given** an identity enumerating its own access, **When** the enumeration returns, **Then** it lists every tenant it holds a live membership in, and that enumeration is not reachable from inside any tenant session.
9. **Given** a token presenting a tenant or archetype as a claim, **When** the request is processed, **Then** that claim is ignored and both values are resolved from stored membership instead.

---

### User Story 2 - Invite a person into a tenant with a target archetype (Priority: P2)

*`US01-EP12-ASC-InviteUser`*

An authorized person at a firm invites a colleague by email, naming the archetype
that colleague will hold in that firm. The invitation is single-use and expires.

**Why this priority**: The only specified way a membership comes into existence for
an established tenant. Direct creation of memberships is deliberately excluded — see
Out of Scope.

**Independent Test**: Issue an invitation as an authorized archetype, assert exactly
one invitation exists carrying tenant, archetype, invited email and expiry, and that
exactly one audit entry records its issuance.

**Acceptance Scenarios**:

1. **Given** an authorized archetype in an active tenant, **When** it invites an email with a target archetype, **Then** a single-use invitation expiring in 7 days exists for that tenant and that entry appears in the audit log.
2. **Given** an archetype without the invite capability, **When** it attempts to invite, **Then** the attempt is refused and no invitation is created.
3. **Given** an authorized archetype, **When** it attempts to invite into a tenant other than the active one, **Then** the attempt is refused and recorded as a cross-tenant access attempt.
4. **Given** an authorized archetype, **When** it invites with a target archetype it is not permitted to grant, **Then** the attempt is refused. Nobody may grant an archetype broader than their own.
5. **Given** an invitation that has not yet been accepted, **When** the issuer revokes it, **Then** it can no longer be accepted and the revocation appears in the audit log.
6. **Given** a deactivated tenant, **When** an invitation into it is attempted, **Then** the attempt is refused.
7. **Given** any invitation message, **When** its content is inspected, **Then** it carries only the firm's name and an opaque invitation reference — no case data, no client name and no matter reference.

---

### User Story 3 - Accept an invitation and obtain access (Priority: P3)

*`US18-EP12-ASC-AcceptInvitation`*

An invited person acts on their invitation and, from that moment, holds access to
that one firm with the archetype they were invited as. If they already hold access to
another firm, they now hold both, as one person, without either firm knowing.

**Why this priority**: This is where identity and membership actually come into
existence. It depends on Story 2 having issued something to accept.

**Independent Test**: Accept a valid invitation with a subject identifier that has no
existing identity; assert exactly one identity and exactly one live membership exist
afterwards, that the invitation can no longer be used, and that the whole thing either
completed or left nothing behind.

**Acceptance Scenarios**:

1. **Given** a valid, unexpired, unused invitation, **When** the invited person accepts it, **Then** exactly one live membership exists joining their identity to that tenant with the invited archetype.
2. **Given** an invited person with no prior identity, **When** they accept, **Then** exactly one identity is created for them and no second identity is created for the same subject identifier.
3. **Given** an invited person who **already** holds an identity from a membership in another tenant, **When** they accept, **Then** a second membership is added to the same identity and no second identity is created.
4. **Given** an acceptance that fails partway, **When** it terminates, **Then** no identity exists in a partially created state, no membership was granted, and the invitation remains unused.
5. **Given** an accepted invitation, **When** acceptance is attempted a second time, **Then** it is refused.
6. **Given** an invitation issued to one email, **When** a person authenticated as a different email attempts to accept it, **Then** the attempt is refused and recorded.
7. **Given** an invitation whose tenant was deactivated after issuance, **When** acceptance is attempted, **Then** it is refused.
8. **Given** a newly created membership, **When** the person attempts to reach tenant data before completing second-factor enrollment, **Then** access is refused until enrollment completes.

---

### User Story 4 - Refuse an expired, used or revoked invitation (Priority: P4)

*`US04-EP12-ASC-RejectExpiredInvitation`*

An invitation is not a permanent key. Once it expires, is used, or is revoked, it
grants nothing.

**Why this priority**: Separated from Story 3 because it is a distinct guarantee with
its own failure mode: an invitation link that never dies is a standing grant of access
to privileged material, sitting in an inbox — and under the constitution's email
constraints that inbox is reached through a provider outside the hosting region.

**Independent Test**: Advance time past an invitation's expiry and assert acceptance
is refused; separately assert that a used invitation and a revoked invitation are both
refused, and that all three refusals are observably identical.

**Acceptance Scenarios**:

1. **Given** an invitation older than 7 days, **When** acceptance is attempted, **Then** it is refused and no membership is created.
2. **Given** an expired, an already-used, and a revoked invitation, **When** each is attempted, **Then** all three responses are indistinguishable from one another and from an invitation that never existed.
3. **Given** an invitation, **When** its expiry is inspected, **Then** it is exactly 7 days from issuance; no invitation is open-ended and no expiry is chosen per invitation.
4. **Given** an expired invitation whose invitee still needs access, **When** the issuer acts, **Then** a new invitation is issued rather than the existing one extended, producing a fresh issuer and a fresh audit entry.
5. **Given** an invitation refused for any reason, **When** the refusal occurs, **Then** it is recorded in the audit log.

---

### User Story 5 - Reveal nothing about whether an email has an account (Priority: P5)

*`US05-EP12-ASC-PreventAccountEnumeration`*

No surface of the system tells an outsider — or a firm — whether a given email
address corresponds to a person known to the platform.

**Why this priority**: Lowest as a build order, non-negotiable as a property. In this
product the fact that a person is known is itself sensitive: learning that a
particular attorney holds access at a particular firm is information about a
representation, and firm A must not be able to discover that its member also works
with firm B (`001/FR-023`).

**Independent Test**: Exercise invitation, acceptance and refusal paths with an email
known to the system and an email unknown to it, and assert the observable responses —
content, status and timing class — are the same.

**Acceptance Scenarios**:

1. **Given** an email that already has an identity and one that does not, **When** each is invited, **Then** the responses are indistinguishable.
2. **Given** an email that already holds a live membership in the inviting tenant, **When** it is invited again, **Then** the response is indistinguishable from a valid new invitation and no duplicate membership is created.
3. **Given** any refusal on any path in this slice, **When** it is returned, **Then** it discloses neither whether the email is known, nor whether the tenant exists, nor whether a membership exists.
4. **Given** repeated attempts against a single email or invitation reference, **When** they exceed a defined threshold, **Then** further attempts are refused without disclosing why.

---

### User Story 6 - Seed a new tenant's first System Administrator (Priority: P6)

*`US16-EP00-FND-SeedFirstAdministrator`* — **new catalog story**, closing Open
Question 2

A freshly provisioned firm has no members, so nobody inside it can invite anyone.
The platform operator names the firm's first System Administrator, and one invitation
is issued to them. The operator never holds access to the firm's data.

**Why this priority**: Last in build order because every other story here must exist
before it means anything, but it is a precondition for the product being usable at
all. It is deliberately the narrowest possible concession to the bootstrap problem.

**Independent Test**: Provision a tenant, issue a seed invitation to one email as the
platform operator, assert exactly one invitation exists and no membership was created
for the operator; then issue a second seed invitation for the same tenant after the
first has been accepted, and assert it is refused.

**Acceptance Scenarios**:

1. **Given** a provisioned tenant with zero live memberships, **When** the platform operator issues a seed invitation naming an email and the `SA` archetype, **Then** exactly one invitation exists for that tenant and the event is recorded in the audit log against that tenant.
2. **Given** a tenant that already has at least one live membership, **When** a seed invitation is attempted, **Then** it is refused. The capability is unavailable the moment the tenant can invite for itself.
3. **Given** a seed invitation, **When** it is issued, **Then** the platform operator acquires no membership, no archetype and no ability to read that tenant's data as a consequence.
4. **Given** a seed invitation, **When** the target archetype is inspected, **Then** it is `SA` and no other archetype can be seeded.
5. **Given** a seed invitation that expires unaccepted, **When** the tenant still has zero live memberships, **Then** a further seed invitation may be issued, and each issuance is separately audited.
6. **Given** a deactivated tenant, **When** a seed invitation is attempted, **Then** it is refused.

---

### Edge Cases

- What happens when the external IdP reports the same subject identifier with a different email than the one on record?
- What happens when a person is invited under an email they control, then changes that email at the IdP — is the membership still theirs? (Interacts with `US02-EP11-PMG` and Constitution Technical Debt item 6.)
- What happens when two acceptances of the same invitation arrive in the same instant?
- What happens when a membership is revoked while that person is mid-request?
- What happens when a membership is revoked while that person holds a live session? (Deferred: sessions are slice 005; research D13 records this as open.)
- What happens when the last remaining `SA` membership in a tenant is revoked — does the seed capability become available again, or is the tenant unadministrable?
- What happens when an identity is deactivated at the IdP while it still holds live memberships in several tenants?
- What happens when an invitation is issued to an email that is also a portal-archetype invitee of the same tenant?
- Under which tenant is an identity's creation audited, given that an identity holds no tenant?
- What happens when a person accepts an invitation but never enrolls a second factor — does the membership linger indefinitely?
- What happens when the transactional email provider fails to deliver an invitation — is the invitation still valid, and does the issuer learn that delivery failed?

## Requirements *(mandatory)*

### Functional Requirements

**Identity**

- **FR-001**: An identity MUST represent one person as recognised by the external IdP, keyed by the IdP's subject identifier, and MUST hold no tenant.
- **FR-002**: The system MUST store no password and no authentication factor. The sole exception is hashed backup code material, permitted by the named exception in Constitution v1.4.0 *Authentication* and owned by slice 003 — not by this slice.
- **FR-003**: The same subject identifier MUST resolve to exactly one identity. A subject identifier arriving with an email that differs from the one on record MUST NOT silently merge into, or overwrite, an existing identity keyed by that email.
- **FR-004**: No tenant session MUST be able to enumerate identities, read an identity that holds no membership in the active tenant, or observe how many identities exist.
- **FR-005**: When an identity ceases to be valid at the IdP, its memberships MUST stop granting access without requiring per-tenant action.

**Membership**

- **FR-006**: A membership MUST join exactly one identity to exactly one tenant, and MUST carry that tenant's archetype for that person and a live or revoked status.
- **FR-007**: An identity MUST hold at most one membership per tenant.
- **FR-008**: Membership MUST be tenant-scoped data, so that a tenant observes only its own memberships. This is what delivers `001/FR-023`.
- **FR-009**: Memberships MUST NOT be hard-deleted. Withdrawal of access is revocation, and the record persists.
- **FR-010**: Revoking a membership MUST take effect on the next request that attempts to use it. Terminating an already-established session is explicitly **not** delivered by this slice; it is slice 005.
- **FR-011**: An identity holding zero live memberships MUST remain a valid identity while reaching no tenant data.
- **FR-012**: Changing a membership's archetype MUST be possible without destroying and recreating the membership, and MUST be audited.

**Membership resolution — the contract slice 001 depends on**

- **FR-013**: Given an authenticated identity and an explicitly named tenant, the system MUST verify that a live membership joins them **and** that the tenant's status is active, before activating any tenant context.
- **FR-014**: A named tenant for which no live membership exists MUST be treated as a cross-tenant access attempt under `001/FR-008`, producing a response indistinguishable from the tenant not existing.
- **FR-015**: Absence of a live membership, absence of a named tenant, and an inactive tenant MUST all fail closed — no tenant context is activated and the request is refused.
- **FR-016**: The resolved membership MUST be the only source of the acting archetype for the request. No archetype and no tenant may be derived from an identity provider token claim, from a request parameter, or from any caller-supplied value.
- **FR-017**: An identity MUST be able to enumerate its own live memberships. That enumeration MUST NOT be reachable from within a tenant session, and MUST NOT be exposable to any tenant.
- **FR-018**: Resolution MUST NOT depend on data supplied by the caller beyond the authenticated subject identifier and the named tenant.

**Invitation**

- **FR-019**: An invitation MUST carry the target tenant, the target archetype, the invited email, an expiry and a single-use marker.
- **FR-020**: Only an archetype holding the invite capability may issue an invitation, and only into the tenant active for that request. The sole exception is the seed invitation of FR-035.
- **FR-021**: No issuer may grant a target archetype broader than the one they themselves hold.
- **FR-022**: An expired, already-used, or revoked invitation MUST be refused, and all three refusals MUST be observably identical to one another and to a nonexistent invitation.
- **FR-023**: Acceptance MUST create, in a single atomic operation, the identity if it does not exist and exactly one live membership. A failure MUST leave no identity, no membership and an unused invitation.
- **FR-024**: Acceptance by an identity whose authenticated email differs from the invited email MUST be refused and recorded.
- **FR-025**: Acceptance MUST add a membership to an existing identity when one already exists for the accepting subject identifier, and MUST NOT create a second identity for the same person.
- **FR-026**: A membership MUST NOT grant access to tenant data until second-factor enrollment has completed for that identity. The enrollment mechanism is slice 003; this slice requires the precondition to be enforced, not to be built here.
- **FR-027**: Invitation validity MUST be **7 days** from issuance, applied uniformly and not selectable per invitation. An invitation MUST NOT be extendable; continuing access for an unaccepted invitee requires issuing a new one.
- **FR-036**: An invitation message MUST carry only the firm's name and an opaque invitation reference. It MUST NOT contain case data, a client name, a matter reference, or the target archetype in readable form.
  *Rationale:* Constitution v1.4.0 records that SES is unavailable in `mx-central-1`, so transactional email transits another jurisdiction. Keeping the message contentless bounds what leaves the region to a recipient address and a firm name.

**Bootstrap**

- **FR-035**: The platform administration context MUST be able to issue exactly one kind of invitation — target archetype `SA`, into a tenant with **zero live memberships**. This capability MUST become unavailable the moment the tenant holds any live membership, MUST NOT create a membership for the platform operator, MUST NOT grant the operator any read access to that tenant's data, and MUST be audited against the target tenant.

**Enumeration resistance**

- **FR-028**: No surface in this slice MUST disclose whether an email corresponds to an existing identity, whether a named tenant exists, or whether a membership exists. This applies to success and failure paths alike.
- **FR-029**: Inviting an email that already holds a live membership in the inviting tenant MUST produce the same observable outcome as a valid new invitation, and MUST NOT create a second membership.
- **FR-030**: Repeated attempts against a single email address or invitation reference MUST be refused beyond a defined threshold, without disclosing the reason.

**Audit** — extends `001/FR-014`'s vocabulary under the same mechanism

- **FR-031**: This slice MUST add these audited actions: identity created, membership created, membership revoked, membership archetype changed, invitation issued, seed invitation issued, invitation revoked, invitation accepted, and invitation refused.
- **FR-032**: Audit entries for this slice MUST identify people by identity or membership reference, never by email address or any other contact detail, satisfying Principle VI minimisation and `001/FR-012`.
- **FR-033**: Creation of an identity MUST be audited against the tenant whose invitation caused it, since an identity holds no tenant of its own and an unattributed audit entry has no reader.
- **FR-034**: A refused acceptance MUST be audited without disclosing, in the entry itself, whether the invited email was known to the system.

### Permission Matrix *(required by Principle IV)*

Deny by default. Any archetype not listed holds no access to any capability below.
Archetype codes are fixed by Constitution v1.4.0 Principle IV.

| Capability | PO (platform context) | SA | MP | AA / PL / CM / BM | Portal (CC, IC, CB, EL) |
|---|---|---|---|---|---|
| Issue seed invitation for first SA | Create — **only while the tenant has zero live memberships** | Deny | Deny | Deny | Deny |
| Issue invitation | Deny | Create (own tenant) | Create (own tenant) | Deny | Deny |
| Revoke invitation | Deny | Update (own tenant) | Update (own tenant) | Deny | Deny |
| Read tenant's pending invitations | Deny | Read (own tenant) | Read (own tenant) | Deny | Deny |
| Accept own invitation | N/A | Self only | Self only | Self only | Self only |
| Read own memberships | N/A | Self only | Self only | Self only | Self only |
| Read tenant's memberships | Deny | Read (own tenant) | Read (own tenant) | Deny | Deny |
| Revoke membership | Deny | Update (own tenant) | Update (own tenant) | Deny | Deny |
| Change membership archetype | Deny | Update (own tenant) | Deny | Deny | Deny |
| Read identity registry | Deny (no archetype holds it) | Deny | Deny | Deny | Deny |
| Hard-delete identity or membership | Deny (no archetype holds it) | Deny | Deny | Deny | Deny |
| Create membership directly, without invitation | Deny (no archetype holds it) | Deny | Deny | Deny | Deny |

Notes on this matrix:

- **`PO` holds exactly one capability, and it is self-extinguishing.** Its
  cross-tenant reach in slice 001 is confined to the tenant registry, the plan
  catalog and the audit log. The seed invitation is the narrowest extension that
  makes a provisioned tenant usable: one archetype, one target, available only while
  the tenant has nobody, and granting the operator nothing. The rejected
  alternatives are recorded in Resolved Decisions below.
- **MP may invite but may not change an existing member's archetype.** Widening
  someone's access after the fact is a different act from bringing someone in, and it
  is the quieter of the two. Reserved to `SA` until slice 004 settles the global
  matrix.
- **Nobody may create a membership directly.** Invitation is the only path, so every
  grant of access has an issuer, an invitee and an audit trail.
- **Every capability marked "own tenant" is enforced by the mechanism of slice 001**,
  not by a check inside these endpoints.
- Per `001/FR-024`, each column is a **membership**, not a person. The same human may
  be `SA` in one tenant and a portal archetype in another; the two are evaluated
  independently and neither can observe the other. `PO` is not a membership at all.
- **Step-up dependency:** the constitution makes step-up MFA mandatory for creating or
  deactivating users and for changes to the permission matrix. Issuing an invitation,
  revoking a membership and changing an archetype all fall inside that rule, and the
  step-up mechanism is slice 005. Until it exists, these three capabilities MUST NOT
  be exposed in production. The seed invitation is subject to the same rule for the
  platform context.

### Key Entities *(include if feature involves data)*

- **Identity**: One person as recognised by the external IdP, keyed by that provider's subject identifier. Holds no tenant, no password and no authentication factor. Never enumerable by a tenant.
- **Membership**: The access one identity holds within one tenant, carrying that tenant's archetype for that person and a live or revoked status. Tenant-scoped; at most one per identity per tenant; never hard-deleted.
- **Invitation**: A single-use grant, valid 7 days, to become a member of one tenant with one named archetype, issued to one email address. Tenant-scoped. Carries its own issued, accepted, revoked or expired state, and whether it was issued by a member or seeded by the platform context.

Slice 001 owns **Tenant**, **Plan** and **AuditEvent**; this slice adds to the audit
action vocabulary but does not alter that entity.

## Success Criteria *(mandatory)*

- **SC-001**: The complete cross-tenant isolation suite from slice 001 passes unchanged against the database-backed membership adapter — 0 test modifications required, 0 failures.
- **SC-002**: For an identity holding memberships in more than one tenant, 0 responses in any tenant reveal the existence, count or identity of its other memberships.
- **SC-003**: 100% of requests naming a tenant with no live membership are refused, and 0 of those responses distinguish "no membership" from "tenant does not exist".
- **SC-004**: A revoked membership is refused on 100% of subsequent requests.
- **SC-005**: Acceptance of one invitation produces exactly 1 membership — 0 duplicates under concurrent acceptance of the same invitation.
- **SC-006**: A person accepting invitations from two tenants ends with exactly 1 identity and exactly 2 memberships.
- **SC-007**: 0 expired, used or revoked invitations can be accepted, and the three refusal responses are byte-identical.
- **SC-008**: An observer cannot distinguish a known email from an unknown one on any surface of this slice, verified across 100% of invitation, acceptance and refusal paths.
- **SC-009**: 0 memberships can be created by any path other than accepting an invitation.
- **SC-010**: 0 identities or memberships can be hard-deleted through any available capability.
- **SC-011**: Each of the nine audited actions in FR-031 produces exactly 1 entry — 0 missing, 0 duplicated.
- **SC-012**: 0 audit entries from this slice contain an email address or other contact detail, verified by automated inspection.
- **SC-013**: A failed acceptance leaves 0 identities, 0 memberships and 1 still-unused invitation.
- **SC-014**: A membership whose identity has not completed second-factor enrollment grants access to 0 tenant-scoped resources.
- **SC-015**: An identity's enumeration of its own memberships is reachable from 0 tenant sessions.
- **SC-016**: 0 seed invitations succeed against a tenant holding at least one live membership, and issuing one grants the platform operator 0 memberships and 0 read access to that tenant's data.
- **SC-017**: 0 invitation messages contain case data, a client name or a matter reference, verified by automated inspection of rendered message content.
- **SC-018**: 100% of invitations expire at exactly 7 days, and 0 invitations can be extended.
- **SC-019**: A tenant or archetype presented as an identity provider token claim is honoured in 0 requests.

## Assumptions

- The external IdP is **Amazon Cognito user pools** (Constitution v1.4.0), one pool and one app client for the whole platform. This spec's requirements are written provider-neutrally on purpose: nothing here depends on a Cognito-specific behaviour, so the provider decision lands in `plan.md` rather than in these requirements.
- Cognito is assumed to supply a stable, unique subject identifier per person and to be the sole authority on authentication. It holds no tenancy and no archetype (Constitution v1.4.0, *Amazon Cognito*).
- The IdP is assumed to be the authority on the person's email address; this system holds it for correlation and contact, not as a credential.
- Invitation delivery is assumed to be by email through a transactional provider outside `mx-central-1`, since SES is unavailable in that region. Which provider, and whether cross-region SES or a third party, is a `plan.md` decision. Deliverability is assumed to be an operational concern rather than a requirement of this slice.
- Archetype values are assumed to be the codes fixed in Constitution v1.4.0 Principle IV. Which archetype may perform which action beyond this slice's own capabilities is slice 004's matrix, not this one's.
- A tenant is assumed to already exist, provisioned by slice 001, before any invitation into it.
- The platform administration context of `001/FR-009` is assumed to remain outside the membership mechanism entirely — it is not an identity and holds no membership, including when it issues a seed invitation.
- Time-based expiry is assumed to derive from the same authoritative source as audit timestamps (`001/FR-020`), not from a caller-supplied value.

## Dependencies

- **Slice 001** must be merged. This slice replaces its `MembershipPort` fixture adapter behind the existing seam and must not require changes above that interface.
- **Constitution v1.4.0** closes the identity provider and region pendings this spec's first revision was blocked on. Three constitutional constraints now bind this slice's plan rather than its requirements: one shared Cognito user pool with one app client (pool-per-tenant is prohibited), no trust in token claims for tenant or archetype, and no reliance on any Cognito capability for tenancy.
- **Transactional email egress.** SES is unavailable in `mx-central-1`, so invitation delivery leaves the region. FR-036 bounds the content; the provider choice and its data-processor status belong to `plan.md`. Recorded as Constitution Technical Debt item 9.
- **Slice 003** owns authentication, MFA enrollment and backup codes. FR-026 states a precondition this slice enforces but does not implement. Note that backup codes are built rather than bought, because Cognito provides none — Constitution Technical Debt item 8.
- **Slice 005** owns sessions, sign-out, step-up and revocation propagation. Two consequences: FR-010's revocation does not reach a live session, and the four step-up-gated capabilities in the permission matrix cannot be exposed in production until 005 lands.
- **Slice 004** owns the global archetype matrix. This slice declares the permission matrix for its own capabilities only; where the two disagree later, 004 governs and this spec is amended.
- **`master-user-story-catalog.md`** has been amended with `US18-EP12-ASC-AcceptInvitation`, `US19-EP12-ASC-SelectActiveTenant` and `US16-EP00-FND-SeedFirstAdministrator`. Principle I is satisfied.

## Out of Scope

Authentication of any kind. MFA enrollment, challenge, backup codes and recovery.
Session creation, lifetime, sign-out and step-up. The global archetype-to-action
matrix and entitlement enforcement. Self-service signup. Direct creation of
memberships without an invitation. Seeding any archetype other than `SA`. External
portal onboarding under EP13, which remains unvalidated. Profile editing, including
the email-change conflict recorded as Constitution Technical Debt item 6. Enterprise
SSO or federation to a firm's own identity provider, which Constitution v1.4.0 adds
to the MVP prohibitions. Any user interface beyond what is required to exercise the
capabilities in the permission matrix — the administrative UI is EP10, slice 014.

## Resolved Decisions

Both questions that blocked the first revision of this spec were closed on
2026-08-21.

| # | Question | Decision | Where it lands |
|---|---|---|---|
| 1 | Invitation validity period | **7 days**, uniform, non-extendable. Continuing access for an unaccepted invitee requires a new invitation, so every grant carries a fresh issuer and a fresh audit entry. | FR-027, US2 scenario 1, US4 scenarios 1/3/4, SC-018 |
| 2 | How does a tenant's first SA obtain access? | **Seed invitation from the platform context**, restricted to archetype `SA` and to tenants with zero live memberships. The operator names the first invitee and acquires nothing. | FR-035, User Story 6, SC-016, `US16-EP00-FND-SeedFirstAdministrator` |

**Alternatives rejected for question 2, recorded so the decision is not revisited
without new information:**

- *Provisioning accepts an initial SA email as part of the same operation.* Rejected on scope grounds rather than on principle: slice 001 is implemented and merged, and this would reopen its provisioning contract, its tests and its audit vocabulary. The seed invitation achieves the same outcome as a separate, independently testable capability that leaves 001 untouched.
- *A one-time bootstrap capability granted to the platform operator, revoked after first use.* Rejected: it puts a "grant myself access" path on the platform context permanently, and the revocation is a convention rather than a mechanism. FR-035's zero-live-memberships condition is a mechanism — it extinguishes itself with no action required by anyone.
- *Out-of-band self-registration by the firm's SA against a provisioning reference.* Rejected: it defers the problem to a surface that does not exist, and it needs its own enumeration-resistance analysis before it could be specified at all.

## Approval Checklist

- [x] No `[NEEDS CLARIFICATION]` left open
- [x] `US18-EP12-ASC-AcceptInvitation`, `US19-EP12-ASC-SelectActiveTenant` and `US16-EP00-FND-SeedFirstAdministrator` present in `master-user-story-catalog.md` (Principle I)
- [x] Permission matrix declared (Principle IV)
- [x] Audit events enumerated per operation (Principle V) — FR-031
- [x] Tier classification declared (Tier Entitlements)
- [x] Cross-tenant leak test defined and accepted (Principle II) — the slice 001 suite passing unchanged against real data, SC-001
- [ ] No implementation or technology detail in this document — *review needed: the Assumptions and Dependencies sections name the provider and the region. Both are stated as constraints inherited from the constitution rather than as design choices, but a reviewer should confirm that is acceptable under Principle I.*
- [ ] Every requirement is test-verifiable
- [ ] Step-up dependency on slice 005 accepted, with the four affected capabilities withheld from production until it lands
- [ ] Approved by Cosmic Chimps technical lead
