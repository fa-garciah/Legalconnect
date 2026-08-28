# Feature Specification: Authorization & Tier Entitlements

**Feature Branch**: `004-authorization-entitlements`

**Created**: 2026-08-26

**Status**: **Approved for `/plan` — 0 open clarifications.** Q1 resolved
2026-08-21 (Decision 4). Q2 resolved 2026-08-26 (Decision 6).

**Epic**: EP00-PlatformFoundation — `US11-EP00-FND-EnforceDenyByDefault` and
`US14-EP00-FND-EnforceEntitlementByTier`. `US12-EP00-FND-DefineRole` is **retired** from
the catalogue as a duplicate of `US13` (Decision 4). `US13-EP00-FND-AssignRoleToUser` and
`US15-EP00-FND-AuditPermissionChange` are built by slice 002 and now claimed by its
Principle I entry — see Decision 5.

**Constitution**: v1.4.0

**Tier Classification**: **Cross-cutting.** The entitlement mechanism belongs to no tier
and is never removed. Which capability belongs to which tier is configuration and may
change at any time, including to everything enabled for a single tenant.

**Input**: Constitution Technical Debt item 11 — *"The 004 archetype matrix does not
exist yet. Today only SA is ever granted anything, and no entitlement check exists at
all — `plan.entitlements` is written and read by nothing."* Principle IV's own note
assigns this slice the completion of the global role matrix.

> **Citation convention.** Requirements of slices 001 and 002 are cited as `001/FR-0NN`
> and `002/FR-0NN`. Bare `FR-0NN` refers to this document.

---

## Why This Slice Matters More Than Its Position Suggests

Two consequences follow from Technical Debt item 11:

1. **It is the only foundation slice with no external blocker.** The matrix derives from
   the story catalogue and the constitution, not from AWS, not from the PAC, not from a
   client decision. Its two open questions are ours to answer.
2. **Every domain and UI slice downstream is shaped by it.** Navigation, screens and
   endpoints are projections of this module. Written after it, they are correct; written
   before it, they are rewritten. `registro-specs-mvp.md` already records this: slice
   006's Definition of Done requires 004's matrix implemented and tested, and slice 014
   must *consume* the mechanism rather than reimplement it.

---

## What Is Actually Built Today, and Where This Matrix Departs From It

This section exists because the slice was scoped against the story catalogue rather than
against the repository, and the two disagree in four places. Each is a decision this spec
must take deliberately rather than discover during `/plan`.

**Verified against `backend/src` on 2026-08-26.**

### 1. Enforcement today is an archetype allow-list per endpoint, not a capability matrix

`@RequireArchetypes(...)` attaches a list of archetype codes to a route, and the
tenant-context interceptor compares the resolved principal's archetype against it after
membership resolution. There is no capability, no scope and no entitlement anywhere in
that path. It is a seam, and its own source comment says so.

### 2. Deny-by-default is asserted in a comment but not implemented

The permissions module states *"Deny by default: an endpoint with no declaration is
unreachable, not open."* The enforcement reads, in substance, *if a declaration exists and
does not include the caller's archetype, refuse.* When a route carries **no** declaration,
the check is skipped — the route is reachable by **every live membership of the tenant**,
including every portal archetype.

Today no tenant-scoped route is undeclared, so nothing leaks. But `US11-EP00-FND` is the
requirement that this be a **property** rather than a currently-true coincidence, and it
is not one yet. FR-002 and FR-019 close it.

### 3. `PO` holds seven platform capabilities, not two

The claim that provisioning and plan assignment are *"the whole vendor surface"*
understates what 001 and 002 shipped by five. The complete set — all at `none` scope, all
audited, none tenant-scoped:

| PO capability | Shipped by |
|---|---|
| Provision a tenant | 001 |
| Deactivate a tenant | 001 |
| Read the tenant registry | 001 |
| Read the platform audit log | 001 |
| Change a tenant's plan | 001 |
| Configure a plan's limits | 001 |
| Issue the seed `SA` invitation for a tenant with zero live memberships | 002 (`002/FR-035`) |

FR-008 is unaffected — none of these reads a firm's case files, and the seed invitation
grants the operator nothing and extinguishes itself. But the matrix must enumerate all
seven, because a matrix that omits a shipped capability *refuses* it under FR-002.

### 4. The proposed matrix silently removes capability from `MP`

Slice 002 shipped `MP` alongside `SA` on issuing an invitation, revoking an invitation,
reading pending invitations, and revoking a membership. It shipped `SA` alone on reading
the audit log and on changing an archetype. `002`'s permission matrix records the
reasoning: *"MP may invite but may not change an existing member's archetype."*

The matrix as drafted for this slice grants `MP` the audit log — which `MP` does not hold
today — and withholds invitation and membership revocation — which `MP` does hold today.
`002`'s spec anticipated the possibility: *"Slice 004 owns the global archetype matrix…
where the two disagree later, 004 governs and this spec is amended."* So it is permitted.
It is not obviously intended. **Decision 6 settles it: it does not.** `MP` keeps the four capabilities 002 shipped
it and does not gain the audit-log read. The matrix below records what runs.

Three further capabilities shipped by 002 appeared in no draft row at all — reading
pending invitations, reading the tenant's memberships, and the two identity-surface
self-service capabilities. Under FR-002 an omitted row is a refusal, so they are added to
the matrix below as a matter of completeness rather than of judgement.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reject anything not explicitly permitted (Priority: P1)

*`US11-EP00-FND-EnforceDenyByDefault`*

A capability the product has not deliberately granted to an archetype cannot be exercised
by that archetype. This holds for capabilities nobody thought about, for capabilities
added tomorrow, and for capabilities whose grant was forgotten. The absence of a rule is a
refusal, never a gap.

**Why this priority**: Every other story in this slice is a refinement of a decision
function that must first be *closed*. If the default is anything other than refusal, the
matrix describes the permitted set but not the forbidden one, and Principle IV is an
intention rather than a property. This is also the story that closes the fail-open path
described in §2 above.

**Independent Test**: Enumerate the capability registry and the eleven archetype codes,
invoke the decision function for every pair, and assert the outcome equals the matrix.
Then add a capability to the registry with no matrix row and assert all eleven archetypes
are refused. No HTTP layer, no database, no tenant.

**Acceptance Scenarios**:

1. **Given** a capability with no explicit grant for the caller's archetype, **When** it is invoked, **Then** it is refused — regardless of endpoint, tenant or tier.
2. **Given** a capability newly added to the registry with no matrix row, **When** it is invoked by any of the eleven archetypes, **Then** every one of them is refused.
3. **Given** a capability that declares no scope kind, **When** it is invoked by an archetype the matrix permits, **Then** it is refused, because an undeclared scope is an unenumerated rule.
4. **Given** an endpoint that exposes a capability without declaring which capability it exposes, **When** it is invoked by any caller, **Then** it is unreachable — the omission fails closed rather than passing through.
5. **Given** any refusal from this module, **When** the response is composed, **Then** it discloses neither the existence nor the shape of the refused resource.
6. **Given** the four portal archetypes `CC`, `IC`, `CB` and `EL`, **When** every capability in the registry is invoked by each, **Then** every invocation is refused, and each archetype holds exactly zero capabilities.

---

### User Story 2 - Enforce the archetype matrix server-side (Priority: P2)

*Completes Principle IV's incremental matrix; delivers the permission half of the walking
skeleton's item 4*

The server decides. What a client renders, hides, greys out or omits has no bearing on
what the server permits, and a caller who bypasses the client entirely reaches exactly the
same decision.

**Why this priority**: The matrix is the substance of the slice, but it is only meaningful
once the default is closed — hence P2 rather than P1. Principle IV states that the hidden
control is never the enforcement.

**Independent Test**: For each of the six internal archetypes, invoke every capability in
the registry against the decision function and compare the full outcome vector to the
matrix. Separately, drive the same capabilities through the HTTP surface with a caller
whose client would not have offered them, and assert the outcomes are identical.

**Acceptance Scenarios**:

1. **Given** each of the six internal archetypes (`MP`, `AA`, `PL`, `CM`, `BM`, `SA`), **When** each capability in the registry is invoked, **Then** the outcome matches the matrix exactly, with no pair unasserted.
2. **Given** a caller whose client hides a control, **When** the underlying endpoint is invoked directly, **Then** the outcome is the server's decision and is unchanged by the client's behaviour.
3. **Given** `PO`, **When** any tenant-scoped capability is invoked, **Then** it is refused and the attempt is audited.
4. **Given** `PO`, **When** any of the seven platform capabilities enumerated above is invoked, **Then** it is permitted — the operator provisions tenants and never reads a firm's case files.
5. **Given** a caller presenting an archetype as a token claim or a request header that contradicts their stored membership, **When** the decision is taken, **Then** the stored membership governs and the claim is ignored.
6. **Given** a member whose archetype is changed while they hold a live session, **When** their next request arrives, **Then** the new archetype governs it, with no wait for token expiry.

---

### User Story 3 - Enforce tier entitlements independently of archetype (Priority: P3)

*`US14-EP00-FND-EnforceEntitlementByTier`*

An archetype may hold a capability that the tenant's plan does not include. Both must
pass. The two refusals are different facts about the world and lead to different remedies,
so the caller can tell them apart.

**Why this priority**: This is the billing mechanic of the iguala, and the constitution
requires it architected from day one. It sits below the matrix because entitlement is only
ever evaluated on a capability the archetype already holds.

**Independent Test**: Hold archetype and capability fixed and vary only the plan; assert
the outcome flips and that the refusal reason names entitlement rather than permission.
Change the entitlement mapping in configuration, issue the next request, and assert the
new mapping applies with no restart and no deployment.

**Acceptance Scenarios**:

1. **Given** an archetype permitted a capability and a tenant whose plan does not include it, **When** it is invoked, **Then** it is refused, and the refusal is distinguishable from a permission refusal.
2. **Given** a plan's entitlement mapping is changed in configuration, **When** the next request arrives, **Then** the new mapping applies, with no deployment and no restart.
3. **Given** a tenant that has reached a quantitative limit, **When** the capability that would create another of that thing is invoked, **Then** it is refused and the refusal names the limit reached.
4. **Given** a tenant whose plan is changed, **When** the next request arrives, **Then** it is evaluated against the new plan, because the plan is read per request rather than cached in the session.
5. **Given** a capability permitted by archetype, in scope, and excluded by the plan, **When** it is invoked by a caller who also fails an earlier check, **Then** exactly one refusal reason is returned and it is the earliest in the fixed order.

---

### User Story 4 - Assign a member's archetype within a tenant (Priority: P4)

*`US12-EP00-FND-DefineRole`, subject to Q1 — see Decision 4*

An `SA` decides which archetype each member of their firm holds. They do not decide what
an archetype *means*: archetypes are fixed by the constitution, and their capability
distribution is product, not tenant configuration.

**Why this priority**: The assignment capability itself is built and tested in slice 002.
What this slice adds is the constraint that the assignment cannot strand the tenant, and
the boundary that an `SA` cannot invent capability. Both are refinements of existing
behaviour rather than new surface.

**Independent Test**: Drive an archetype change through the shipped capability, then assert
the next request for that member is decided under the new archetype. Separately, reduce a
tenant to a single live `SA` and assert every path that would remove the last one is
refused.

**Acceptance Scenarios**:

1. **Given** an `SA` of a tenant, **When** a member's archetype is changed, **Then** it governs that member's subsequent requests, and the change is audited with actor, subject, previous value and new value.
2. **Given** an `SA`, **When** they attempt to grant an archetype a capability the product does not define, **Then** it is refused — there is no surface through which an archetype's meaning can be edited.
3. **Given** the last live `SA` of a tenant, **When** their own archetype is changed to anything else, **Then** it is refused, and the tenant retains at least one live `SA`.
4. **Given** the last live `SA` of a tenant, **When** their membership is revoked, **Then** it is refused for the same reason and by the same rule.
5. **Given** an `SA` of tenant A, **When** they attempt to change the archetype of a member of tenant B, **Then** the request is refused and recorded as a cross-tenant access attempt.

---

### User Story 5 - Decide scope over the entity, not only over the archetype (Priority: P5)

*Delivers Decision 1 — the scope resolver port*

Holding a capability is not the same as holding it over a particular thing. An associate
attorney may read the cases they are assigned to and not every case in the firm. This
slice ships the mechanism and the resolvers for the entities that exist today; the resolver
for case assignment arrives with the slice that introduces the case team.

**Why this priority**: No capability in this slice's own matrix resolves at `assigned`
scope, so nothing here fails without it. It is P5 because it is the piece that cannot be
retrofitted — a decision function that ships without scope means revisiting every
capability, every test and every downstream projection when the first ethical wall is
required.

**Independent Test**: Exercise the decision function with a stub `assigned` resolver that
answers yes and no on demand, and assert the outcome tracks the resolver rather than the
archetype. Assert that a client-supplied claim of assignment changes nothing.

**Acceptance Scenarios**:

1. **Given** a capability declared at `tenant` scope and a caller acting inside their own tenant, **When** it is invoked, **Then** scope is satisfied.
2. **Given** a capability declared at `self` scope and a caller targeting another person's record, **When** it is invoked, **Then** it is refused on scope.
3. **Given** a capability declared at `assigned` scope and a caller holding no live assignment to the target, **When** it is invoked, **Then** it is refused on scope, and that refusal is distinguishable from a permission refusal and from an entitlement refusal **in the audit trail and in the `Decision` type — not on the wire**, where it is byte-identical to a `404` for a nonexistent resource *(amended 2026-08-27 by slice `006-client-case-core`, FR-017 above)*.
4. **Given** a caller who supplies a claim of assignment in the request, **When** the decision is taken, **Then** the claim is ignored and scope is resolved from stored relationships.
5. **Given** a caller who loses an assignment, **When** their next request against that entity arrives, **Then** it is refused, with no grace period and nothing carried over from the session.
6. **Given** a capability declared at `assigned` scope and no resolver registered for it, **When** it is invoked, **Then** it is refused rather than defaulting to permitted.

---

### User Story 6 - Audit every permission decision that matters (Priority: P6)

*`US15-EP00-FND-AuditPermissionChange` — already delivered by slice 002; this story
extends its vocabulary rather than re-specifying it*

**Why this priority**: The change events exist and are tested. What is missing is the
refusal side: a refused attempt that reaches across tenants must be visible, and Principle
V's log is the only detection net available while the authentication factor remains
phishable.

**Independent Test**: Provoke each class of refusal and assert exactly one audit entry
where the vocabulary requires one, and none where it does not.

**Acceptance Scenarios**:

1. **Given** any archetype assignment or plan change, **When** it commits, **Then** exactly one audit entry records actor, subject, previous value and new value.
2. **Given** a refused attempt that involves reaching across tenants, **When** it is refused, **Then** a `tenant.cross_access_attempted` event is emitted, per `US10-EP00-FND` and `001/FR-008`.
3. **Given** a refused attempt within the caller's own tenant, **When** it is refused, **Then** no personal data of the firm's end clients appears in the entry, per Principle VI.
4. **Given** a high volume of automated refusals, **When** they are recorded, **Then** the log is not inflated without bound, consistent with the channel gate of `001/FR-025`.

---

### Edge Cases

- **Archetype changed mid-session.** Re-evaluated per request, never cached in the session. A revoked partner keeping partner powers until their token expires is not acceptable. Already built this way by 002 — see Decision 3.
- **Membership revoked while a request is in flight.** The request that already resolved a live membership completes; the next one is refused. Terminating an established session is slice 005, per `002/FR-010`.
- **Tenant deactivated while members hold live sessions.** Membership resolution already refuses on an inactive tenant (`002/FR-013`); this module never sees the request.
- **Four refusal reasons trip at once.** Enrollment missing, archetype does not hold it, no relationship to the entity, plan excludes it. Exactly one is returned, and it is the earliest in the fixed order below.
- **A capability permitted by archetype and in scope, on a tenant at its quantitative limit.** Refused on entitlement, naming the limit.
- **An `assigned`-scope capability whose resolver has not yet been supplied.** Refused, not permitted. A missing resolver is a missing rule.
- **The last `SA` of a tenant.** Cannot be downgraded and cannot be revoked. A tenant with no administrator cannot be recovered without operator intervention, and operator intervention into a tenant is what Principle II forbids.
- **An `SA` who is the last `SA` in tenant A but not in tenant B.** The constraint is per membership, not per person; their tenant B membership is unaffected.
- **A capability whose archetype grant is empty for every archetype.** Legal and meaningful — `002` already has three such rows (read the identity registry, hard-delete an identity or membership, create a membership without an invitation). Nobody holds them, including `PO` and `SA`.

---

## Requirements *(mandatory)*

### Functional Requirements

**The decision**

- **FR-001**: Authorization MUST be decided by a single policy module. No endpoint may author its own rule.
- **FR-002**: The default MUST be refusal. A capability with no matrix entry for the caller's archetype is refused, and so is a capability with no matrix entry at all.
- **FR-003**: Every decision MUST be taken server-side. No client state, and nothing the caller supplies, may influence it.
- **FR-004**: Archetype MUST be read from the caller's live membership on every request, never from a client-supplied value and never from a cached session claim.
- **FR-005**: Permission, scope and entitlement MUST each be evaluated, and all three MUST pass. Entitlement MUST be evaluated independently of archetype — neither implies the other.
- **FR-006**: A permission refusal and an entitlement refusal MUST be distinguishable to the caller, because the remedies differ: one is a role change, the other an upgrade.
- **FR-007**: The entitlement mapping MUST be changeable without a code deployment, per the constitution's *Tier Entitlements* section, and MUST take effect on the next request.
- **FR-008**: `PO` MUST hold no tenant-scoped capability — not read, not write, not aggregate. Its platform capabilities are enumerated in the matrix and all resolve at `none` scope.
- **FR-009**: Changing a member's archetype MUST be restricted to `SA` of the same tenant and MUST be audited with actor, subject, previous value and new value. *(Built by slice 002; restated because this slice's matrix governs it.)*
- **FR-010**: A tenant MUST always retain at least one live `SA`. Every path that would reduce the count to zero — archetype change and membership revocation alike — MUST be refused.
- **FR-011**: The module MUST be exercisable without an HTTP request: a decision function over (archetype, capability, scope, plan) whose matrix is verified exhaustively rather than sampled through endpoints.
- **FR-012**: Coverage of the refusal paths MUST be complete and blocking in CI, at the same standing as tenant isolation, per the constitution's *Non-negotiable critical coverage*.

**Scope**

- **FR-013**: Every capability MUST declare a scope kind — `tenant`, `self`, `assigned` or `none`. A capability declaring none is refused, per FR-002.
- **FR-014**: Scope MUST be resolved server-side from stored relationships. A caller-supplied claim of assignment MUST be ignored.
- **FR-015**: Scope resolution MUST be pluggable. This slice owns the port and the resolvers for `tenant`, `self` and `none`; the `assigned` resolver is supplied by the slice that owns the assignment, in the same PR that introduces it.
- **FR-016**: Losing an assignment MUST take effect on the next request. Scope MUST NOT be cached in the session, for the same reason as FR-004.
- **FR-017**: A scope refusal MUST be distinguishable from a permission refusal and from an entitlement refusal. Three distinct remedies: get assigned, change role, upgrade plan.
  - **Amended 2026-08-27 by slice `006-client-case-core` (its Decision 4).** For scope kind
    `assigned` the distinction is drawn in the audit trail and in this module's internal
    `Decision` type, **not on the wire**. An `assigned` scope refusal is byte-identical to
    a `404 not_found` for a resource that does not exist. This was `plan.md` Open Item 3's
    own recommendation and it names this amendment as the cost of taking it: a 403 saying
    "you are not assigned to this" confirms the matter exists, which in a firm running an
    ethical wall is the leak the wall was built to prevent. Kinds `self` and `none` are
    unaffected — FR-017 stands unchanged for them.

**Closing the default**

- **FR-018**: Every capability the product exposes MUST be named in a single enumerable registry, so the exhaustive matrix test can be written over the registry rather than over a hand-maintained list that can drift from it.
- **FR-019**: An endpoint that exposes a capability MUST declare which capability it exposes, and an endpoint that declares none MUST be unreachable. *(This closes the fail-open path described in §2: today an undeclared route passes straight through.)*
- **FR-020**: The four portal archetypes `CC`, `IC`, `CB` and `EL` MUST hold zero capabilities, and this MUST be asserted rather than assumed. `SA` can already issue an invitation naming a portal archetype, so such a membership can already exist; the day the portal epic is specified, granting it anything must be a deliberate act rather than a discovery.
- **FR-021**: Adding a capability to the product MUST require adding its matrix row and its scope kind in the same change. A capability that reaches `main` without both is refused at runtime by FR-002 and MUST also fail the build.

**Refusal**

- **FR-022**: When more than one refusal reason applies, exactly one MUST be returned, and it MUST be the earliest in the fixed order declared below. The order MUST be deterministic and MUST NOT vary by endpoint.
- **FR-023**: A refusal MUST disclose neither the existence nor the shape of the refused resource. The distinctions FR-006 and FR-017 require are only ever drawn for a caller who has already passed the earlier check, so no distinction is visible to a caller whose archetype could not have reached the entity at all.
- **FR-024**: An entitlement refusal caused by a quantitative limit MUST name the limit reached.
- **FR-025**: A refused attempt that reaches across tenants MUST emit `tenant.cross_access_attempted`, per `US10-EP00-FND` and `001/FR-008`.

**Boundaries with what is already built**

- **FR-026**: This slice MUST NOT weaken any database grant or Row-Level Security policy established by slices 001 and 002. A capability that a grant can deny SHOULD be denied by the grant; this module handles what grants cannot cheaply express, which is precisely scope and entitlement.
- **FR-027**: The tenant's plan and its entitlement mapping MUST be read per request from live data, never from a session claim, for the same reason as FR-004.
- **FR-028**: Where this slice's matrix differs from the permission matrix declared in `002`, this slice governs and `002` is amended in the same PR, per the deference `002` already recorded. Every such difference MUST be enumerated, never applied silently.

### Capability Matrix *(required by Principle IV)*

Deny by default. **An archetype absent from a row holds nothing on that row**, and a
capability absent from this table holds nothing for anybody. The four portal archetypes
`CC`, `IC`, `CB` and `EL` are deliberately given no columns: they hold zero capabilities,
asserted by FR-020.

Scope of this slice: the mechanism, plus the rows for capabilities that already exist.
Domain capabilities are added by their own slices, each extending this table in the same
PR that introduces the capability (FR-021).

| # | Capability | Scope | MP | AA | PL | CM | BM | SA | PO |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Read own tenant's audit log | `tenant` | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| 2 | Issue an invitation | `tenant` | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| 3 | Revoke an invitation | `tenant` | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| 4 | Read own tenant's pending invitations | `tenant` | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| 5 | Read own tenant's memberships | `tenant` | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| 6 | Revoke a membership | `tenant` | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| 7 | Assign a member's archetype | `tenant` | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| 8 | Read own tenant's plan and limits | `tenant` | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| 9 | Accept own invitation | `self` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| 10 | Read own memberships | `self` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| 11 | Provision a tenant | `none` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| 12 | Deactivate a tenant | `none` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| 13 | Read the tenant registry | `none` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| 14 | Read the platform audit log | `none` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| 15 | Change a tenant's plan | `none` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| 16 | Configure a plan's limits | `none` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| 17 | Issue the seed `SA` invitation | `none` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ ¹ |
| 18 | Read the identity registry | `none` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 19 | Hard-delete an identity or a membership | — | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 20 | Create a membership without an invitation | — | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 21 | Edit what an archetype means | — | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

**Rows 1–6, column `MP`, record Decision 6** (resolved 2026-08-26): `MP` keeps every
capability slice 002 shipped it — rows 2, 3, 4, 5 and 6 — and does not gain the
audit-log read of row 1, which stays reserved to `SA`. This slice therefore neither
narrows nor widens 002, and FR-028's enumeration of differences is empty. See Decision 6.

¹ Available only while the target tenant holds **zero live memberships**, per
`002/FR-035`. It creates no membership for the operator and grants no read access to the
tenant's data. The condition is self-extinguishing: it requires no revocation.

**Rows 18 through 21 are held by nobody, and that is the point.** They exist in the table
so the exhaustive test asserts them rather than inferring them from silence. Rows 19, 20
and 21 carry no scope kind because no scope could make them permitted.

**Rows 9 and 10 are identity-surface capabilities** — the caller holds no active tenant
when exercising them, and `self` scope is the whole of the constraint.

**Rows 1 through 8 resolve at `tenant` scope, and rows 11 through 17 at `none`.** No row in
this slice exercises the `assigned` resolver. Capabilities that do — reading a case,
uploading a document to it, logging time against it — are added by their own slices, each
declaring its scope kind alongside its archetype row.

**Every "own tenant" restriction is enforced by the mechanism of slice 001**, not by a
check inside these endpoints. Per `001/FR-024`, each column is a **membership**, not a
person: the same human may be `SA` in one tenant and hold a portal archetype in another,
evaluated independently, neither able to observe the other. `PO` is not a membership at
all.

**Step-up dependency.** The constitution makes step-up MFA mandatory for changes to the
permission matrix, for creating or deactivating users, and for full case export. Rows 2, 3,
6 and 7 fall inside that rule, as does row 17 for the platform context. The mechanism is
slice 005; until it lands, those capabilities MUST NOT be exposed in production. This slice
does not change that constraint — it inherits it from `002`.

### Refusal Ordering

Four independent refusal reasons exist, and one request can trip several. The response MUST
be deterministic (FR-022):

| Order | Reason | Question it answers | Remedy |
|---|---|---|---|
| 1 | `mfa_not_enrolled` | Has this identity completed second-factor enrollment? | Enroll |
| 2 | Permission | Does this archetype hold this capability at all? | Change role |
| 3 | Scope | Does this caller hold it over *this* entity? | Get assigned |
| 4 | Entitlement | Does the tenant's plan include it, and is it within limits? | Upgrade plan |

Earliest match wins. The ordering is deliberate rather than arbitrary: it never reveals
that an entity exists to a caller whose archetype could not have touched it anyway. Reason
1 is already shipped by slice 002 (`002/FR-026`) and refuses every tenant-scoped request
ahead of everything below; this slice must not reorder it.

Reasons 2, 3 and 4 are distinguishable to the caller (FR-006, FR-017) without violating
FR-023, because each is only ever reached by a caller who passed the reason above it.

### Tier Entitlements

**Cross-cutting.** The mechanism belongs to no tier and is never removed. Which capability
belongs to which tier is configuration and may change at any time, including to everything
enabled for a single tenant.

Two things are already in place and currently read by nothing: a per-plan map of capability
to boolean, and a per-plan set of quantitative limits carrying user count, storage bytes
and monthly CFDI count. This slice is what gives them a reader. Which capability sits in
which of the three tiers (Esencial / Profesional / Premium) is configuration data, not a
requirement of this spec, and is set outside it.

### Relationship to Slice 002's Database Grants

Slice 002 enforced its matrix **primarily at the data layer** — the ordinary application
role holds no insert grant on membership, no general grant on identity, and the platform
role can insert only seeded invitations. Its `plan.md` states why: an application-layer
check in every endpoint is exactly the *developer forgets the filter* failure mode
Principle II exists to make impossible rather than merely unlikely.

This slice adds an application-layer module and must not weaken any of that (FR-026):

| Enforced by | What it can express | Examples |
|---|---|---|
| Database grants and RLS (001 and 002, unchanged) | Absolute prohibitions and tenant boundaries | No direct membership insert; no identity enumeration; no cross-tenant read |
| Policy module (this slice) | Conditional decisions a grant cannot cheaply express | Assignment scope; tier entitlement; quantitative limits; the last-`SA` constraint |

### Key Entities *(include if feature involves data)*

- **Capability**: A named thing the product can be asked to do. Carries exactly one scope kind. Enumerable as a set, so the matrix can be tested exhaustively rather than sampled. **Not a table** — it is a property of the product, identical for every tenant.
- **Authorization decision**: The outcome of evaluating (archetype, capability, scope, plan) — permitted, or refused with exactly one reason. Not persisted; derived per request.
- **Scope resolver**: Answers whether a given membership holds a relationship to a given target that satisfies a given scope kind. This slice supplies the resolvers for `tenant`, `self` and `none`; `assigned` is supplied later through the same port.

**This slice adds no new tables** unless Q1 resolves to option (b), which would introduce a
per-tenant capability override table and turn the matrix from a constant into a per-tenant
lookup. Otherwise it reads the membership's archetype (002), the plan's entitlements and
limits (001), and writes audit events (001).

The absence of new tables is the point: this slice is a decision function and a set of
tests, which is why it can be implemented immediately now that 002 is built.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every (archetype × capability) pair is covered by a passing assertion — 11 archetype codes × every capability in the registry, with 0 pairs unasserted.
- **SC-002**: A capability added to the registry with no matrix row is refused for 11 of 11 archetypes — 0 exceptions.
- **SC-003**: `PO` is refused 100% of tenant-scoped capabilities and permitted exactly the 7 platform capabilities enumerated in the matrix — no more, no fewer.
- **SC-004**: Each of the 4 portal archetypes holds exactly 0 capabilities, asserted individually rather than inferred.
- **SC-005**: For a request tripping more than one refusal reason, the reason returned is the earliest in the fixed order in 100% of cases, and exactly 1 reason is returned.
- **SC-006**: Permission, scope and entitlement refusals are distinguishable from one another in 100% of cases, while 0 refusal responses disclose the existence or the shape of the refused resource.
- **SC-007**: The entitlement mapping is changed and takes effect on the next request with 0 deployments and 0 restarts, demonstrated end to end.
- **SC-008**: A tenant reaching a quantitative limit is refused the creating capability, and the refusal names the limit in 100% of cases.
- **SC-009**: 0 sequences of archetype changes and membership revocations leave a tenant with 0 live `SA`.
- **SC-010**: 100% of the matrix is exercised through the decision function with 0 HTTP requests, and the outcomes match the endpoint-driven results for every pair also sampled through HTTP.
- **SC-011**: An archetype change governs the member's very next request — 0 requests are decided under the previous archetype after the change commits.
- **SC-012**: An assignment loss governs the next request — 0 requests succeed on the strength of a lost assignment.
- **SC-013**: 0 endpoints are reachable without a declared capability, verified by a test that adds an undeclared endpoint and asserts it refuses.
- **SC-014**: 100% of archetype assignments and plan changes produce exactly 1 audit entry carrying actor, subject, previous value and new value.
- **SC-015**: 100% of cross-tenant refusals emit `tenant.cross_access_attempted`.
- **SC-016**: Refusal-path coverage is 100% and blocking in CI; the build fails when it drops.
- **SC-017**: The complete cross-tenant isolation suite from slices 001 and 002 passes unchanged after this slice lands — 0 test modifications, 0 failures, 0 grants or policies weakened.

---

## Assumptions

- **Archetype codes are the eleven fixed by Constitution v1.4.0 Principle IV** — `PO` plus the ten membership-capable codes. The ten are already a database enum; `PO` is not a membership and never appears in one.
- **Seniority is not an archetype and is out of this slice entirely** — Decision 2, adopted as recommended. The firm's hierarchy (partner, senior associate, associate, trainee) drives billing rate and org chart; the archetype drives permission. They change independently, and a trainee who administers the system is a real case. Seniority belongs to the firm directory; this slice reads archetype and nothing else.
- **The prototype's five roles were never a count mismatch.** It already carries both axes in separate columns (`cargo` and `rol`) and derives hourly rates from the first. Two concepts, one name.
- **The prototype cannot inform Decision 1.** It stores a single responsible attorney as a string on the case, so it cannot express a case team at all.
- **The capability set of this slice is bounded by what 001 and 002 shipped.** Domain capabilities do not exist yet and are not invented here.
- **Which capability belongs to which tier is configuration set outside this spec.** This spec requires the mechanism, the independence of the two checks, and that the mapping changes without deployment — not any particular mapping.
- **The existing per-plan entitlement map is assumed adequate as the mapping's home.** It already exists and is already changeable without deployment. Whether it stays there is a `plan.md` decision.
- **Step-up MFA remains slice 005's**, and the four step-up-gated capabilities inherited from 002 stay withheld from production until it lands. This slice does not change that.
- **The `assigned` resolver's absence is not a blocker.** No capability in this slice's matrix uses it; a capability that declares `assigned` with no registered resolver is refused (US5 scenario 6), which is the fail-closed behaviour the port is designed for.

---

## Dependencies

| On | For | Blocking |
|---|---|---|
| `001-tenant-foundation` | Tenant, plan entitlements and limits, audit, RLS, the platform surface | **No — built and merged** |
| `002-identity-membership` | Membership archetype, per-request membership resolution, the archetype-declaration seam, `mfa_not_enrolled` | **No — built and merged.** Ten-value enum, per-request resolution proven by its V19 |
| Constitution v1.4.0 | Archetype codes (Principle IV), the tier entitlement mechanism, blocking coverage | No |
| `master-user-story-catalog.md` | `US11`, `US12`, `US14` — all present | No |
| Case team entity | The `assigned` resolver | **No** — supplied later through the port. See Decision 1 |
| `003-authentication-mfa` | Nothing this slice needs. `mfa_not_enrolled` is already enforced by 002 as a precondition | No |
| `005-session-lifecycle` | Step-up MFA for four inherited capabilities | Not for this slice; it gates their **production exposure**, as it already does for 002 |
| `002`'s Principle I traceability record | Amendment claiming `US13` and `US15` — Decision 5 | No, but it is a condition of this slice's Approval Checklist |

---

## Out of Scope

Domain capabilities — each domain slice extends the matrix in its own PR, per FR-021.
Portal archetype capabilities — the portal epic (EP13) is unvalidated (Constitution
Technical Debt item 2), and FR-020 asserts they hold zero rather than granting them
anything. Seniority and the firm directory (Decision 2). The `assigned` resolver itself, as
distinct from the port that receives it. Step-up MFA (slice 005). Session termination on
revocation (slice 005). Re-specifying the archetype-assignment capability, which slice 002
built and tested — this slice governs its matrix row and adds the last-`SA` constraint,
nothing more. Which capability belongs to which tier, which is configuration data. Any user
interface: permission-derived navigation is a separate frontend slice (014) and is a
projection of this module, never an authority.

---

## Decisions

### Resolved

#### Decision 1 — Per-case scope applies *(resolved 2026-08-21)*

Authorization is decided over **(archetype, capability, scope, plan)**, not over archetype
alone. An associate attorney may read the cases they are assigned to, not every case in the
firm.

**Rationale.** This is a law firm. Access control in a firm is frequently per matter, not
per role — ethical walls and conflict-of-interest screens are implemented exactly here. A
partner does not necessarily need to see every matter in the firm; sometimes the
requirement is that they *must not*. Retrofitting scope into a decision function that
shipped without it means revisiting every capability, every test and every downstream
projection.

**How the circular dependency is avoided.** The case team entity does not exist yet, and
this slice must not wait for it. This slice ships the port, the decision function and the
resolvers for the entities that exist today; the clients-and-cases slice supplies the case
resolver when it introduces the case team, in the same PR. The mechanism ships now, the
case-specific resolver arrives with cases, and neither slice blocks the other.

| Scope kind | Meaning | Resolver owned by |
|---|---|---|
| `tenant` | Anything within the caller's own tenant | This slice |
| `self` | The caller's own record only | This slice |
| `assigned` | Entities the caller holds a live assignment to | Clients-and-cases slice |
| `none` | Platform-level, no tenant scope | This slice |

#### Decision 2 — Seniority stays out of this slice *(adopted as recommended)*

The firm's hierarchy is not an archetype. It belongs to the firm directory. Recorded in
Assumptions above.

#### Decision 3 — The archetype is re-read per request *(resolved — already built this way)*

Slice 002 shipped it: its V19 proves a resolved membership governs the request and a
contradicting header claim never does, and membership resolution is a per-request read.
Nothing to decide; this slice must not regress it by caching. FR-004, FR-016 and FR-027 are
the guard rails.

#### Decision 5 — Traceability gap in what 002 already shipped *(actionable now)*

Slice 002 implements *change a membership's archetype* — its matrix row, its endpoint, and
the `membership.archetype_changed` audit action — but its `plan.md` claims only `US18`,
`US19` and `US16` against Principle I. So `US13-EP00-FND-AssignRoleToUser` and
`US15-EP00-FND-AuditPermissionChange` are **built but claimed by no slice**.

Two consequences. This slice must not re-specify capability that exists and is tested —
User Story 4 deliberately adds only the last-`SA` constraint and the no-editing-archetypes
boundary. And the traceability record needs correcting: **amend `002`'s Principle I entry to
claim `US13` and `US15`**, scoping this slice to `US11`, `US14` and whatever survives of
`US12`. It is an Approval Checklist item below.

### Resolved during planning, 2026-08-26

#### Decision 4 — What `US12-EP00-FND-DefineRole` means *(resolved 2026-08-21)*

The catalogue reads: *define roles as permission sets per tenant.* As written it is
unimplementable against what is already built and passing.

Slice 002 shipped archetype as a database enum of ten fixed values mirroring the
constitution. A tenant cannot define a role outside that enum, and Principle III forbids
tenant-specific logic in the product core. So one of three things is true:

- **(a)** US12 means *assign which archetype a member holds*. Then it duplicates `US13` and should be retired from the catalogue rather than specified. **Recommended.**
- **(b)** US12 means *adjust which capabilities an archetype holds, per tenant*. The enum survives; a per-tenant override table appears. Buildable — and the matrix stops being a constant. Every capability check gains a tenant-scoped lookup, and the exhaustive test becomes a test over defaults **plus** overrides.
- **(c)** US12 means genuinely custom per-tenant roles. The enum must go, 002's migrations change, and its passing suite is revisited. **Recommend against.**

Fixed archetypes are what make the matrix testable exhaustively and what keep Principle III
honest. If a firm needs a capability distribution the six internal archetypes cannot
express, that is product feedback, not tenant configuration.

**Resolved: option (a).** Archetypes are fixed by the constitution and `US12` is retired
from the catalogue as a duplicate of `US13`. There is no per-tenant capability override
table and no per-tenant role definition: the matrix is a compile-time constant, identical
for every tenant, which is what makes the exhaustive test of SC-001 possible and what
keeps Principle III honest. A capability distribution the six internal archetypes cannot
express is product feedback, not tenant configuration.

Consequences carried into `plan.md`: this slice claims `US11` and `US14` only; `matrix.ts`
is a constant rather than a repository; and no migration adds a table.

#### Decision 6 — This slice does not narrow `MP` *(resolved 2026-08-26)*

Slice 002 shipped `MP` with four capabilities this draft withholds — issuing an invitation,
revoking an invitation, reading pending invitations, revoking a membership — and withheld
the audit log, which this draft grants. `002` explicitly defers to this slice where the two
disagree, so either answer is permitted; neither is obviously intended, and the difference
lands on running, tested endpoints.

**Resolved: `MP` keeps what 002 shipped, and gains nothing.** Rows 2, 3, 4, 5 and 6 stay
`MP` + `SA`. Row 1, the own-tenant audit-log read, stays `SA` only. Row 7, archetype
assignment, stays `SA` only, as 002 already had it.

**Rationale.** Three reasons, in order of weight. First, the alternative withdraws
capability from running, tested endpoints: four routes would narrow to `SA`, and 002's
contract suite would be edited to expect the new refusals — which is exactly what
SC-017 (`0 test modifications`) exists to prevent, and the modification would be to the
suite that proves isolation. Second, a managing partner who cannot bring anyone into
their own firm is a worse product, not a safer one; the capability 002 withheld from
`MP` was the quieter one — changing an existing member's archetype — and that
distinction is preserved exactly. Third, granting `MP` the audit log is a widening, and
this slice's job is to close the default, not to open new surface; if firm oversight of
the log turns out to be wanted, it is a one-cell change to a constant with an exhaustive
test already standing behind it.

**Consequence for FR-028.** The enumeration of differences between this matrix and 002's
is empty. No route's `@RequireArchetypes` declaration changes, and 002's permission
matrix needs no amendment. `matrix.ts` codifies what already runs, which is the cheapest
possible way to acquire an exhaustive test of it.

---

## Approval Checklist

- [x] Decision 1 signed off — scope applies; resolver port defined (FR-013 to FR-017)
- [x] Decision 2 signed off — seniority out of scope, recorded in Assumptions
- [x] Decision 3 resolved — already built per-request by 002 (its V19); FR-004, FR-016, FR-027 prevent regression
- [x] **Q1 (Decision 4) signed off** — option (a): archetypes fixed, `US12` retired,
      the matrix is a constant
- [x] **Q2 (Decision 6) signed off** — `MP` keeps 002's four capabilities and gains
      no audit-log read; FR-028's difference list is empty
- [x] Decision 5 actioned — `002/plan.md` claims `US13`/`US15` (its Principle I row,
      corrected 2026-08-21) and `master-user-story-catalog.md` records `US12`'s retirement
- [x] Permission matrix declared with a scope kind on every row (Principle IV, FR-013)
- [x] Tier classification declared — cross-cutting (constitution, *Tier Entitlements*)
- [x] Portal archetypes asserted to hold zero capabilities rather than assumed (FR-020, SC-004)
- [x] Refusal ordering fixed and deterministic, `mfa_not_enrolled` first (FR-022)
- [x] `PO`'s full platform surface enumerated — seven capabilities, not two (FR-008, SC-003)
- [x] Audit events required per operation (Principle V) — User Story 6, FR-025
- [x] Blocking CI coverage of refusal paths required (FR-012, SC-016)
- [x] No weakening of 001/002 database grants or RLS (FR-026, SC-017)
- [x] Zero open clarifications — **0 remain**
- [x] Every requirement is test-verifiable — 665 tests, 0 failures, 100% coverage on
      `src/common/authz/**` (T065); see `quickstart-results.md`
- [ ] Approved by Cosmic Chimps technical lead
