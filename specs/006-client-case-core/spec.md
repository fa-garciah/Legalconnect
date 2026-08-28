# Feature Specification: Clients, Cases & Case Teams

**Feature Branch**: `006-client-case-core`

**Created**: 2026-08-27

**Status**: Draft, rev. 2 — **0 open clarifications**. Q1 resolved 2026-08-27. Four
decisions carried with recommendations, awaiting sign-off before `/speckit-plan`.

**Slice**: `006-client-case-core` — the number is identity, not execution order. This
slice is specified after 017 and ships after it.

**Epic**: EP02-CaseManagement (CSM) and EP03-ClientManagement (CLM), plus new stories
per Decision 1.

**Constitution**: v1.4.0

**Tier Classification**: Cross-cutting — a firm without clients and cases has no
product. Not removed at any iguala tier. No capability in this slice carries a `tier`
or `limit` key at launch, matching every capability shipped so far (`004/plan.md` Open
Item 4).

**Stories**: `US02-EP03-CLM-SearchAndFilterClients`, `US03-EP03-CLM-AddOrUpdateClientProfile`,
`US04-EP03-CLM-ViewAndManageClientCases`, `US01-EP02-CSM-CreateNewCase`,
`US03-EP02-CSM-ViewCaseList`, `US08-EP02-CSM-ViewAssignedAttorney`,
`US09-EP02-CSM-ViewUpcomingDeadlines`, `US10-EP02-CSM-ViewAssociatedTasks`, plus new
stories per Decision 1 and the Catalog Amendments section.

**Input**: The domain root. Every other domain slice attaches to `Case`: documents
(`007`), calendar entries (`013`), time entries, notes (`008`). Also the slice that
supplies the first `assigned`-scope resolver, which `004` shipped as a port with no
implementation behind it.

> **Citation convention.** Requirements of slices 001, 002, 004 and 017 are cited as
> `001/FR-0NN`, `002/FR-0NN`, `004/FR-0NN` and `017/FR-0NN`. Bare `FR-0NN` refers to
> this document.

---

## Why This Slice Matters More Than Its Position Suggests

Every other domain slice hangs off what this one creates. Documents attach to a case.
Calendar entries attach to a case. Time entries attach to a case. Notes attach to a
case. None of those can be specified in a way that survives contact with real data
until `Case` exists — this is the root, not one branch among several.

It is also the first slice to exercise the `assigned` scope kind. That kind is declared
today and resolves to nothing: `ScopeKind` admits `'assigned'`, the resolver lookup
returns nothing for it, and the decision function treats an unregistered kind as a
refusal rather than a default permit. Every one of the 24 capabilities in the registry
resolves at `tenant`, `self` or `none`. The port is real, the fail-closed behaviour is
tested, and nothing reaches it. This slice is where that closes — with a registered
resolver and real capabilities behind it, not by declaration.

Closing it also forces three questions that prior slices each deferred to "the
clients-and-cases slice" by name:

| Deferred by | What was deferred | Where it is answered here |
|---|---|---|
| `004/plan.md` Open Item 3 | Is an `assigned`-scope refusal a 403 or a 404? | Decision 4 — 404, and `004/FR-017` amended in the same PR |
| `004/research.md` D6 | The wire mapping for `assigned`, "first observable in the slice that ships the first `assigned` capability" | FR-016, FR-017 |
| `016a/research.md` D3 | The `scope` refusal bucket, unreachable because "no capability in 004's registry resolves at `assigned` scope today" | FR-017; 016a's own deferred scenarios become testable |

---

## The One Thing 004's Port Cannot Do, and What This Slice Does Instead

This must be stated before the requirements, because it changes one row of the matrix
from what a first reading would suggest.

The decision function returns a boolean per request. A scope resolver answers yes or no
about a single named target; there is no third outcome meaning *"permit, but return
fewer rows."* A scope refusal is total.

That is exactly right for reading **one** case. It cannot express reading **the list**.
Two of this slice's own acceptance scenarios prove why: a member with no assignments
must see an **empty list**, not an error, while the same member asking for one specific
case they are not on must be refused **opaquely**. A single `assigned`-scoped list
capability would produce a refusal in the first situation — the wrong answer — and would
leak nothing useful in exchange.

So the list read declares `tenant` scope and filters its **result set** by assignment
(FR-014). The single-case read declares `assigned` and refuses (FR-016). The same
underlying fact — who is on the team — is enforced at two different layers because the
two reads have genuinely different shapes. Recorded here so a later reader does not
"fix" the list row to `assigned` and silently break the empty-list contract.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Register and maintain a client (Priority: P1)

An `SA`, `MP`, `BM` or `PL` registers a party the firm will represent and keeps its
record current; withdrawing one is narrower, and `PL` does not (Q1). This is the first
thing a firm does with an empty system, and nothing else in the domain can happen until
it has happened once.

**Why this priority**: A case cannot exist without a client to attach it to (FR-005).
This is the only story in the slice with no upstream dependency inside the slice.

**Independent Test**: Register a client, read it back, find it by a fragment of its name,
update it, deactivate it, and confirm a second tenant sees none of it. Confirm a `PL` may
do all but the deactivation, and is refused that. Delivers a working, searchable client
register with no case functionality present at all.

**Acceptance Scenarios**:

1. **Given** a tenant with no clients, **When** one is created with a legal name and a
   kind (`organization` or `person`), **Then** it is available for case creation in that
   tenant and in no other.
2. **Given** a client with no RFC yet, **When** it is created, **Then** it is accepted —
   RFC is nullable, and fiscal completeness is a billing-slice concern, not this one's.
3. **Given** a client referenced by a live case, **When** deactivation is requested,
   **Then** it is deactivated, never hard-deleted, and every case still resolves it.
4. **Given** two tenants, **When** each registers a client bearing the same legal name,
   **Then** the two remain distinct records — uniqueness, where it applies, is per tenant.
5. **Given** a deactivated client, **When** a new case is opened against it, **Then** the
   attempt is refused; deactivation withdraws the client from future use without touching
   the past.
5a. **Given** a client deactivated in error, **When** the same archetype that withdrew it
   restores it, **Then** it is active again and available for new cases, and both the
   withdrawal and the restoration stand in the audit trail as separate events (FR-004a).
6. **Given** a client of tenant A, **When** any member of tenant B attempts to read or
   write it, **Then** the attempt is refused and recorded as a cross-tenant access
   attempt, per `001/FR-011`.
7. **Given** a `PL`, **When** they create a client and later correct its legal name,
   **Then** both succeed; **When** they attempt to deactivate it, **Then** they are
   refused (Q1, resolved — matrix rows 26–28).
8. **Given** a tenant with more clients than fit one page, **When** the list is read with a
   name filter, **Then** only matching clients are returned, matched case-insensitively on
   any substring of the legal name, and a full page holds a full portion of *matching*
   clients rather than being silently shortened (FR-002a).
9. **Given** the same tenant, **When** the list is read filtered to `inactive`, **Then**
   only deactivated clients are returned — the filter is a view, not a permission.

---

### User Story 2 - Open a case (Priority: P2)

A `CM`, `MP` or `SA` opens a matter against a registered client.

**Why this priority**: The root entity of the entire domain. Depends on US1 and on
nothing else.

**Independent Test**: Open a case against a client from US1, read it back, and confirm
its file number, its status drawn from the tenant's own catalog, and its optional venue
and matter type. Delivers a working case register with no team functionality present.

**Acceptance Scenarios**:

1. **Given** a registered, active client, **When** a case is opened against them,
   **Then** it receives a file number unique within the tenant and a status drawn from
   the tenant's own case-status catalog.
2. **Given** a matter with no court proceeding — a purely consultative engagement —
   **When** the case is created, **Then** venue is absent and the case is valid.
3. **Given** a case, **When** it is created, **Then** the court's own case number is
   recorded in a field distinct from the firm's internal file number. The prototype had
   one field and could not express both.
4. **Given** a client deactivated after a case was opened against them, **When** that
   case is read, **Then** it is unaffected — the client's deactivation does not cascade.
5. **Given** a file number already in use within the tenant, **When** a second case is
   created bearing it, **Then** the attempt is refused and names the collision (see
   Assumptions — file numbers are supplied, not generated).
6. **Given** a case-status, matter-type or venue id belonging to another tenant's
   catalog, **When** a case is created naming it, **Then** the attempt is refused; a
   case may only reference its own tenant's catalog entries.
7. **Given** a newly provisioned tenant, **When** its case-status catalog is read before
   any manual setup, **Then** it is already populated with a firm-agnostic default seed
   and is immediately editable (Decision 1, following `017/FR-009`).
8. **Given** a case-status the firm has marked as ending a matter, **When** a case is moved
   to it, **Then** the case records its closing date without the caller supplying one; and
   **When** the case is later moved back to a non-ending status, **Then** that date is
   cleared (FR-008a).
9. **Given** a firm that retires its ending status and marks a different one instead,
   **When** a case is moved to the new one, **Then** closure follows the firm's current
   catalog, not any status name this product chose.

---

### User Story 3 - Assign a case team (Priority: P3)

An `MP`, `CM` or `SA` puts named members on a matter, and takes them off it. This is the
story the prototype could not express at all — it stored one attorney as a free-text
string on the case.

**Why this priority**: The story that closes 004's open seam. It depends on US2 and
delivers the authorization behaviour three earlier slices deferred.

**Independent Test**: Assign two members to a case, confirm each resolves as holding
scope over it, unassign one, and confirm the refusal takes effect on their very next
request while the other is unaffected. Delivers working assignment-based scope.

**Acceptance Scenarios**:

1. **Given** a case, **When** a member is assigned to it with a role on the case
   (`lead`, `collaborator` or `support`), **Then** they subsequently resolve as holding
   scope over that case for every `assigned`-scoped capability.
2. **Given** a member unassigned from a case, **When** their next request for that case
   arrives, **Then** scope is refused. No grace period, no cached decision — the same
   immediacy `004/SC-011` already proves for archetype changes.
3. **Given** a case with more than one assigned member, **When** any one of them is
   unassigned, **Then** the others' assignments are unaffected.
4. **Given** a member assigned to case A but not case B, **When** they request case B,
   **Then** the refusal is byte-identical to the refusal for a case that does not exist,
   and discloses nothing about whether case B exists.
5. **Given** a member holding a live membership but assigned to no case in the tenant,
   **When** they read the case list, **Then** they receive an empty result — not an
   error. This is `016a`'s empty-state contract, not its error state.
6. **Given** an `MP` or `SA`, **When** they read the case list or any single case,
   **Then** assignment does not restrict them — tenant-wide visibility is a deliberate
   exception with a named cost (Decision 2).
7. **Given** a member whose membership is revoked (`002/FR-009`) while assigned to a
   case, **When** their next request for that case arrives, **Then** it is refused at
   membership resolution, before scope is consulted at all.
7a. **Given** that same revoked member, **When** the case's team is read afterwards,
   **Then** they are absent from it — revocation closed their assignments in the same
   transaction (FR-012a) — while the historical assignment row remains intact.
8. **Given** a case, **When** its team is read, **Then** currently-assigned members are
   returned and previously-unassigned ones are not, while the historical assignment
   record remains intact and is not hard-deleted.

---

### Edge Cases

- **A case with zero assigned members.** Legal transiently — a matter opened and not yet
  staffed. Readable only by `MP` and `SA`. See Decision 3. Revoking the last member of a
  staffed case reaches this same state by a different route (FR-012a), and is equally
  legal — a matter does not close because the person on it left the firm.
- **An ethical wall between two cases of the same client.** This slice supplies the
  mechanism (assignment-based scope) and the opacity that makes it meaningful (FR-016).
  Using it to enforce a wall is a firm's own procedure. Decision 2 names precisely how
  far the platform guarantee extends and where it stops.
- **File number collision within a tenant.** Refused, per US2 scenario 5.
- **A case whose client is later found to be a duplicate.** Out of scope — no merge
  operation exists in this slice.
- **Reading the case list at scale.** Bounded portions with a cursor, reusing `001`'s
  existing primitive (`001/FR-013`), applied after assignment filtering so a page is
  never silently short.
- **A catalog entry retired while cases reference it.** Existing cases still resolve and
  display it, marked retired; it is offered for no new case. Follows `017/FR-007`
  exactly.
- **A member assigned to a case in tenant A and a case in tenant B.** Two memberships,
  two assignments, no interaction — assignment references a membership, never an
  identity, mirroring `017/FR-001`'s treatment of position.
- **The same member assigned to the same case twice.** Refused; one live assignment per
  member per case, though the historical record may hold several closed ones.
- **Two people editing one client or case at the same time.** The later write stands and
  the earlier one is lost, without an error. This is accepted deliberately — see
  Assumptions — and the audit trail is what makes it recoverable rather than invisible.

---

## Requirements *(mandatory)*

### Functional Requirements

**Clients**

- **FR-001**: A client MUST be tenant-scoped and MUST inherit row-level isolation in the
  shape `001` established (`001/FR-003`).
- **FR-002**: A client MUST carry a legal name and a kind (`organization` or `person`).
  RFC MUST be optional.
- **FR-002a**: The client list read MUST accept an optional name filter, matching a
  substring of the legal name case-insensitively, and an optional status filter. Both MUST
  compose with the existing bounded-portion read, and filtering MUST be applied before the
  page boundary so no page is silently short. This is `US02-EP03-CLM-SearchAndFilterClients`,
  which this slice claims and therefore must deliver.
- **FR-003**: A client MUST NOT be hard-deletable. Withdrawal is a status change, and
  the record persists — the convention `001`, `002`, `004` and `017` already established
  for tenants, memberships, invitations and positions.
- **FR-004**: A deactivated client MUST remain resolvable by every case referencing it,
  and MUST NOT be available for new case creation.
- **FR-004a**: A deactivated client MUST be restorable to active. Restoration MUST be
  governed by the same capability that withdraws one — whoever may withdraw a client may
  restore one — and MUST be audited as its own action, distinct from deactivation.

**Cases**

- **FR-005**: A case MUST reference exactly one client of its own tenant, exactly one
  status from its own tenant's case-status catalog, and optionally one matter type and
  one venue, each also from its own tenant's catalog.
- **FR-006**: A case's internal file number and its venue-assigned case reference MUST be
  stored as distinct fields. The venue-assigned reference MUST be optional.
- **FR-007**: A case's file number MUST be unique within its tenant, and a collision MUST
  be refused rather than silently resolved.
- **FR-008**: A client's deactivation MUST NOT cascade to any case referencing it.
- **FR-008a**: Each case-status catalog entry MUST carry a firm-settable indication of
  whether it ends a matter. Moving a case to such a status MUST record its closing date;
  moving it to any other status MUST clear that date. The product MUST NOT infer which
  statuses close a matter from their names — the catalog is per tenant (Principle III), so
  only the firm can say.

**Case teams**

- **FR-009**: Case assignment MUST be its own entity, supporting more than one member per
  case and more than one case per member, each assignment carrying a role on the case.
- **FR-010**: An assignment MUST reference a membership, never an identity — the same
  person at two firms holds two unrelated sets of assignments (`017/FR-001`'s precedent).
- **FR-011**: Losing an assignment MUST take effect on the very next request. Scope MUST
  NOT be cached in the session, matching `004/FR-016`'s requirement of its own port.
- **FR-012**: Unassignment MUST NOT hard-delete the assignment record. Reading current
  team membership is a read of current state, which does not require destroying past
  state (`017/FR-004`'s precedent).
- **FR-012a**: Revoking a membership (`002/FR-009`) MUST close every live case assignment
  that membership holds, in the same transaction as the revocation, so the two cannot come
  apart. Closure MUST use the same mechanism as an ordinary unassignment — the historical
  row persists and nothing is hard-deleted. A case team read MUST NOT list a member whose
  membership has been revoked.

**Scope, and the seam this slice closes**

- **FR-013**: This slice MUST supply the `assigned` resolver for `004`'s
  `ScopeResolverPort` and MUST register it through the existing extension seam, without
  editing `004`'s scope port or its decision function. This is the deliverable that closes
  `004`'s open seam, not a new mechanism, and it MUST NOT require any change to the port's
  shape as shipped. `AuthorizationInterceptor` MUST gain population of the scope request's
  target identifier, declared per route, since it supplies `null` unconditionally today and
  no `assigned` capability can resolve without it. *(Amended 2026-08-27 — the clause
  previously read "without editing `004`'s own files", which Phase 0 found could not hold:
  see plan.md Open Item 1.)*
- **FR-014**: Reading the **case list** MUST declare `tenant` scope and MUST filter its
  result set to the cases the caller is assigned to, except for the archetypes Decision 2
  exempts. It MUST NOT declare `assigned` scope — see *The One Thing 004's Port Cannot Do*
  above. A caller with no assignments MUST receive an empty result, never a refusal.
- **FR-015**: Every capability in this slice that reads or writes **one named case** MUST
  declare scope kind `assigned`, with the sole exception of case creation, which names no
  case yet and therefore declares `tenant`.
- **FR-016**: A scope refusal on an `assigned`-scope capability MUST be indistinguishable
  from the response for a case that does not exist — same status, same body, no field
  that differs. It MUST NOT confirm the case exists.
- **FR-017**: The refusal in FR-016 MUST classify into the **opaque** bucket end to end,
  reaching `016a`'s existing classifier as such. Adopting it MUST amend `004/FR-017` and
  `004`'s US5 scenario 3 in the same pull request, to record that the `assigned`
  distinction is drawn in the audit trail and in the internal decision type rather than
  on the wire — this is the amendment `004/plan.md` Open Item 3 names as the cost of
  taking its own recommendation. See Decision 4.
- **FR-018**: Case and client identifiers MUST NOT be enumerable in sequence, since a
  guessable identifier defeats FR-016's opacity regardless of what the refusal discloses.
  Both MUST use the same identifier shape `001` established for tenant.

**Catalogs** *(scope of this slice per Decision 1)*

- **FR-019**: The case-status, matter-type and venue catalogs MUST each be tenant-scoped,
  independently editable per tenant, and MUST follow `017`'s catalog pattern exactly:
  seeded with a firm-agnostic default at tenant provisioning (`017/FR-009`), immediately
  editable, and never hard-deleted once created (`017/FR-007`).
- **FR-020**: A catalog entry MUST carry an active-or-retired status. A retired entry
  MUST remain resolvable by every case already referencing it and MUST be offered for no
  new case.
- **FR-021**: Catalog seeding MUST occur on the same provisioning path `017` already
  extends, so a tenant provisioned after this slice ships receives all four catalogs
  through one provisioning operation, not two.

**Audit and registry discipline**

- **FR-022**: Every mutation in this slice — client created, updated, deactivated; case
  created, status changed; team member assigned, unassigned; catalog entry created,
  retired — MUST emit exactly one audit entry carrying actor, subject, and for a change,
  the previous and new values (Principle V, `017/FR-003`'s pattern).
- **FR-023**: Opening one named case for reading MUST be audited, since Principle V
  requires recording *access* to cases and not only their modification. It MUST be
  channel-gated to interactive reads only, following the gate `001` already applies to
  its own log reads, so automated traffic cannot inflate the log it is watching. Reading
  the case **list** MUST NOT be audited — see Resolved Decisions.
- **FR-024**: This slice's new audit actions MUST be added to the existing action
  vocabulary and its database constraint in the same change that introduces them,
  following the pattern each prior slice used.
- **FR-025**: This slice's new capabilities MUST be added to `004`'s capability registry
  and permission matrix in the same change, per `004/FR-021`. This slice MUST NOT define
  a parallel authorization mechanism.
- **FR-026**: A refusal on any capability in this slice MUST disclose nothing about the
  target's existence beyond what the caller's archetype already permits (`004/FR-023`).

### Capability Matrix *(required by Principle IV; extends 004's registry per 004/FR-021)*

Deny by default. Rows continue the registry's numbering — 1–21 declared by `004`, 22–24
by `017`. Every row declares **exactly one** scope kind, as `004/FR-013` requires and as
the registry's own shape enforces.

| # | Capability | Scope | MP | AA | PL | CM | BM | SA | PO |
|---|---|---|---|---|---|---|---|---|---|
| 25 | Read a client | `tenant` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| 26 | Create a client | `tenant` | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ |
| 27 | Update a client | `tenant` | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ |
| 28 | Deactivate a client | `tenant` | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| 29 | Read the case list | `tenant` † | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| 30 | Read one case | `assigned` ‡ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| 31 | Create a case | `tenant` | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ | ❌ |
| 32 | Change a case's status | `assigned` ‡ | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ | ❌ |
| 33 | Assign / unassign a case team member | `assigned` ‡ | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ | ❌ |
| 34 | Read the case-status / matter-type / venue catalogs | `tenant` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| 35 | Manage those three catalogs | `tenant` | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |

**† Row 29 is `tenant`, not `assigned`, and that is deliberate.** The scope check permits
the call; the *result set* is filtered by assignment (FR-014). A caller with no
assignments gets an empty list, which an `assigned`-scoped refusal could not produce. See
*The One Thing 004's Port Cannot Do* above.

**‡ Rows 30, 32 and 33 declare `assigned`, and `MP`/`SA` satisfy that resolver
unconditionally** (Decision 2). This is not a second scope kind and not a second question
asked at decision time — the resolver itself returns true for those two archetypes. The
mechanism stays singular and the authorization path is unchanged.

Notes on this extension:

- Rows 30, 32 and 33 are the **first three capabilities in the product to resolve at
  `assigned` scope**. Until this slice, the kind was declared and unreachable.
- `PL` holds rows 26 and 27 but not row 28 (Q1, resolved). A paralegal doing intake needs
  to add and correct a client record; withdrawing one from future use is a different act,
  and it stays with `MP`, `BM` and `SA`. This keeps the catalog's own
  `US03-EP03-CLM-AddOrUpdateClientProfile` — a `PL` story — satisfied without widening
  `PL` beyond what that story asks for.
- `BM` reads clients (billing needs the party) but holds no case row at all — case
  narrative is outside billing's need to know, per Principle VI's minimisation clause.
  A later billing slice needing a case *reference* rather than case *content* declares
  its own capability for that; it does not widen row 30.
- Row 35 is `MP` + `SA`, matching `017`'s row 23 exactly rather than inventing a
  different rule for a structurally identical catalog.
- Row 31 (create a case) is `tenant`, not `assigned`: there is no case to be assigned to
  at the moment of creation. FR-015 states this exception explicitly so it is not read as
  an oversight.
- The four portal archetypes (`CC`, `IC`, `CB`, `EL`) hold **zero** rows in this slice,
  per `004/FR-020`. Client-portal visibility of cases is EP13 and is out of scope.
- `PO` holds zero rows: no tenant-scoped capability, per `004/FR-008`.

### Key Entities

- **Client**: A party the firm represents. Carries a kind (`organization` or `person`),
  a legal name, an optional RFC and an active-or-inactive status that moves in both
  directions (FR-004a). Tenant-scoped. Never hard-deleted (FR-003).
- **Case**: A matter. References exactly one client, one case status, and optionally one
  matter type and one venue. Carries the firm's internal file number and, separately, the
  venue-assigned case reference (FR-006). Records when it opened, and when it closed — the
  latter derived from the status it holds rather than supplied by a caller (FR-008a).
  Tenant-scoped.
- **CaseAssignment**: One membership's place on one case, carrying a role on the case
  (`lead`, `collaborator`, `support`) and the window during which it held. Historical
  rows persist after unassignment (FR-012). This is the entity the `assigned` resolver
  reads, and the reason it can answer without a cache.
- **CaseStatus**, **MatterType**, **Venue**: Three tenant-scoped catalogs, each carrying
  a name and an active-or-retired status, each seeded at provisioning and independently
  editable (FR-019). Structurally identical to `017`'s `Position`, with one addition:
  **CaseStatus** also carries the firm-settable "ends a matter" indication (FR-008a),
  which the other two have no use for.

This slice adds six tables. It changes no table owned by 001, 002, 004 or 017. It extends
three shared registries — the capability registry, the permission matrix and the audit
action vocabulary — each in the same change that needs it, per FR-024 and FR-025.

---

## Success Criteria *(mandatory)*

- **SC-001**: A member unassigned from a case is refused that case on their very next
  request — 0 requests are decided under the previous assignment after the change
  commits, matching `004/SC-011`'s bar for archetype changes.
- **SC-002**: For an archetype not exempted by Decision 2, the response to reading a case
  they are not assigned to is byte-identical to the response for a case that does not
  exist, in 100% of trials.
- **SC-003**: A member with a live membership and no assignments reads the case list and
  receives an empty result in 100% of trials — 0 refusals, 0 errors.
- **SC-004**: A case list read by tenant A returns cases of tenant A in 100% of cases and
  0 cases belonging to any other tenant.
- **SC-005**: 100% of mutations in this slice produce exactly 1 audit entry carrying
  actor, subject and, where a value changed, both its previous and new value.
- **SC-006**: 100% of interactive single-case reads produce exactly 1 audit entry; 100%
  of automated single-case reads produce 0, per FR-023's channel gate.
- **SC-007**: A deactivated client remains resolvable by 100% of the cases referencing it
  and is accepted for 0% of new case creations.
- **SC-007a**: A name-filtered client list returns 100% of the tenant's clients whose legal
  name contains the given fragment in any letter case, and 0 clients that do not — with
  filtering applied before the page boundary, so no returned page is short of its bound
  while further matches remain.
- **SC-007b**: A client withdrawn and then restored is accepted for new case creation in
  100% of trials afterwards, with 2 distinct audit entries recording the round trip and 0
  duplicate client records required to achieve it.
- **SC-008**: A retired catalog entry remains resolvable on 100% of cases already
  referencing it and is offered for 0% of new cases.
- **SC-008a**: Revoking a membership closes 100% of that membership's live case
  assignments and leaves 0% of them readable as current team members, while 100% of the
  underlying historical rows survive.
- **SC-008b**: 100% of cases moved to a status the firm marks as ending a matter carry a
  closing date afterwards, and 0% of cases in any other status do — with 0 callers required
  to supply that date themselves.
- **SC-009**: A newly provisioned tenant has all three of this slice's catalogs populated
  and immediately editable, with 0 manual setup steps before the first case is opened.
- **SC-010**: Each of the four portal archetypes and `PO` is refused every one of this
  slice's eleven capabilities, asserted individually rather than inferred, mirroring
  `004/SC-004`'s method.
- **SC-011**: 100% of cross-tenant read or write attempts against a client, case,
  assignment or catalog entry are refused and recorded as cross-tenant access attempts;
  0 succeed.
- **SC-012**: A case list read over a large tenant returns its first bounded portion in a
  time comparable to `001/SC-010`'s audit-query bound, with assignment filtering applied
  before the page boundary so no page is silently short.
- **SC-013**: The `assigned` resolver is exercised by at least one real capability under
  test, closing `004`'s deferred US5 scenario 7 and making `016a`'s Scenario 4 and
  Scenario 6 testable for the first time.
- **SC-014**: The existing suites of 001, 002, 004 and 017 pass unchanged — 0 regressions.

---

## Clarifications

### Session 2026-08-27

- Q: Should this slice let a firm search or filter its client list, or is that deferred? (`US02-EP03-CLM`) → A: Deliver it — a case-insensitive name substring filter plus a status filter on the client list read (FR-002a).
- Q: When a membership is revoked while assigned to cases, are its assignments closed or left open? → A: Closed, in the same transaction as the revocation (FR-012a).
- Q: How is a case's closing date set, given that case statuses are per-tenant catalog rows? → A: Each case-status catalog entry carries a firm-settable "ends a matter" indication; moving to such a status stamps the date, moving away clears it (FR-008a).
- Q: If two people edit the same client or case at once, is the second save rejected or does it overwrite? → A: It overwrites — last-write-wins, accepted deliberately, with the audit trail as the detection mechanism (Assumptions).
- Q: Can a client deactivated by mistake be reactivated? → A: Yes, under the same capability that deactivates it — no new matrix row (FR-004a).

### Q1 — May a `PL` create and update clients? *(resolved 2026-08-27)*

**The conflict.** `US03-EP03-CLM-AddOrUpdateClientProfile` is in the authoritative catalog
as a **`PL`** story, MVP tier: *"Quick-add and edit client profiles."* This slice imports
that story. The draft matrix denied `PL` client writes entirely. Both could not stand:
Principle I makes the catalog authoritative and it says `PL`; Principle IV says deny by
default and every permission is explicit. No reading satisfies both without a choice.

**Resolution: the matrix widens, but only as far as the story asks.** `PL` holds rows 26
(create) and 27 (update). `PL` does **not** hold row 28 (deactivate).

**Rationale.** The catalog story is about intake — adding a client and correcting the
record. Deactivation is a different act: it withdraws the client from future case
creation (FR-004), which is a decision about the firm's engagements rather than about
data hygiene. Splitting the two satisfies the catalog exactly and widens `PL` by no more
than that, which is the narrowest reading that keeps Principle I whole. No catalog
amendment is required for this row.

---

## Resolved Decisions

- **Default seeds are firm-agnostic.** Each of the three catalogs begins with a small,
  neutral seed, editable on day one. `US07-EP02-CSM-MonitorCaseStatus` names *In Process /
  On Hold / Concluded*, which becomes the case-status seed rather than a hardcoded
  enumeration. Principle III: a seed is a starting convenience, never an opinion imposed
  on a firm's own structure.
- **Retirement, never deletion.** Clients, cases, assignments and catalog entries all
  follow the convention 001, 002, 004 and 017 already established: withdrawal is a status
  change and the record persists (FR-003, FR-012, FR-020).
- **Assignment is a membership property, not an identity property.** Mirrors `017/FR-001`
  and `002/FR-024` exactly, for the same reason: the same person may sit on matters at two
  different firms, and the two sets must never meet (FR-010).
- **The case list read is not audited; the single-case read is.** Principle V requires
  recording access to cases. A list read returns only rows the caller is already scoped
  to and discloses no matter's contents; opening one named matter is the access a firm
  needs evidence of. `001`'s own channel gate establishes the principle that what is
  recorded is *a person looked*, not *every row was enumerated*. FR-023 audits the
  single-case read, interactive only, and leaves the list read unaudited — stated here
  rather than left silent, because it is a reading of Principle V and not a derivation
  from it.

---

## Decisions Requiring Sign-Off

### Decision 1 — This slice owns the case-status, matter-type and venue catalogs

**Recommendation: accept as drafted.** The conceptual model assumed these lived in the
firm directory. `017` as actually built ships only the position catalog — `MatterType`,
`Venue` and `CaseStatus` were never implemented anywhere, and nobody owns them today.

They are consumed exclusively by `Case`, which this slice also owns. Splitting them into
a fourth dependency slice to satisfy a conceptual boundary nobody is otherwise relying on
would delay the root of the whole domain for a documentation-tidiness argument.
`007-document-management`'s `DocumentType` and `013-calendar-core`'s `EventType` face the
identical gap and should each resolve it the same way, independently — there is no shared
catalog module to coordinate through, and inventing one to hold three tables that no two
slices share would be the larger mistake.

Consequence if accepted: three tenant-scoped tables join this slice, each following
`017`'s pattern exactly (FR-019 to FR-021), and the catalog amendments below are required
before any PR opens.

### Decision 2 — `MP` and `SA` see every case in their tenant

**Recommendation: accept, for these two archetypes only.** A managing partner who cannot
see the firm's own caseload without being individually assigned to every matter is not a
workable product. `SA` needs it for the same operational reason `004` already grants `SA`
tenant-wide reads elsewhere.

Implemented as those two archetypes satisfying the `assigned` resolver unconditionally —
not as a second scope kind, not as a second question at decision time. The mechanism stays
singular. This is feasible without touching `004`: the scope request already carries the
resolved principal, and the principal already carries its archetype.

**The cost, named.** This is the exact tension `004/spec.md` Decision 1 flagged when scope
was first resolved: *"a partner does not necessarily need to see every matter in the firm;
sometimes the requirement is that they must not."* Granting `MP` blanket visibility trades
away ethical-wall enforcement at the platform level. If a firm needs that wall against its
own managing partner, this slice does not provide it — that becomes a firm procedure, and
the audit trail records what was opened rather than preventing it. Recording the trade-off
explicitly is the point; defaulting to blanket access without naming what it costs would
be the failure.

**What survives the trade-off:** the wall still holds against `AA`, `PL` and `CM`, which
is the majority of a firm's headcount, and FR-016's opacity means those archetypes learn
nothing about the existence of matters they are screened from.

### Decision 3 — A case may exist with zero assigned members

**Recommendation: accept.** Transiently legal. A matter just opened and not yet staffed is
a real state, not an error condition worth preventing at creation time. Such a case is
readable only by `MP` and `SA` until someone is assigned, which is a consequence of
Decision 2 rather than a separate rule.

### Decision 4 — An `assigned`-scope refusal is a 404, not a 403 *(inherited, and this is where it comes due)*

**Recommendation: accept — 404, byte-identical to a case that does not exist.**

This is not a new decision. `004/research.md` D6 recommended it, `004/plan.md` Open Item 3
carried it, and both said the same thing: it is *"first observable in the clients-and-cases
slice"* and it *"should be decided by someone who can speak to the professional-privilege
consequence rather than to the HTTP convention."* That slice is this one. That person is
not the author of this spec.

**The obligation that comes with accepting it**, stated because `004` stated it: taking
404 requires amending `004/FR-017` and `004`'s US5 scenario 3 **in the same pull request**,
to record that the `assigned` distinction is drawn in the audit trail and the internal
decision type, not on the wire. FR-017 carries this obligation and the Approval Checklist
tracks it. Shipping the 404 without the amendment leaves `004` asserting a
distinguishability requirement its own recommendation contradicts.

---

## Catalog Amendments Required Before Any PR Opens

Principle I: a story not in `master-user-story-catalog.md` does not exist. These
amendments land in the same PR as this spec.

`US03-EP03-CLM-AddOrUpdateClientProfile` needs **no** amendment — Q1 resolved by widening
the matrix to match the catalog rather than by changing the catalog.

| Amendment | Why |
|---|---|
| **New** — case-team assignment (write side), EP02-CSM | `US08-EP02-CSM-ViewAssignedAttorney` covers only the *read*, and only for a single attorney. Assigning and unassigning a team has no story at all. |
| **Amend** — `US08-EP02-CSM-ViewAssignedAttorney` title | Reads "Assigned attorney", singular. This slice makes it a team of many, with roles. Retitle, or supersede it with the new story above. |
| **Amend** — `US08-EP02-CSM-ViewAssignedAttorney` slice tier | Currently `IT3`. The read side of case teams ships in this slice, which is MVP. |
| **New** — case-status / matter-type / venue catalog management, EP10-CFG | Decision 1 gives this slice three catalogs. `017` set the precedent of proposing new EP10-CFG stories (US11–US13) for exactly this. |

---

## Assumptions

- **File numbers are supplied by the firm, not generated by the system.** US2 scenario 5
  and the "file number collision" edge case both presuppose a value that can collide,
  which a generated one would not. Firms carry existing numbering conventions and a
  system-imposed scheme would fight them. Uniqueness is enforced per tenant and a
  collision is refused (FR-007).
- **`role_on_case` is descriptive in this slice, not authorizing.** `lead`,
  `collaborator` and `support` are recorded and returned, but no capability in the matrix
  distinguishes them — being assigned is what grants scope, at any role. A later slice
  needing "only the lead may X" declares that then; building it now would be speculative.
- **Case status is a tenant catalog entry, not a fixed enumeration**, per Principle III
  and FR-019.
- **No capability in this slice is tier-gated or limit-gated at launch**, matching every
  capability shipped so far. `004/plan.md` Open Items 4 and 5 own that mapping and it is
  not this slice's to decide.
- **No capability in this slice requires step-up MFA.** Slice `005` supplies that
  mechanism; nothing here is marked for it.
- **Case visibility for the client themselves is out of scope.** The portal archetypes
  hold zero rows here; EP13 remains unvalidated.
- **Pagination reuses `001`'s cursor primitive** rather than introducing a second paging
  shape.
- **Concurrent edits are last-write-wins, and this is a named trade-off rather than an
  oversight.** Two callers editing one client or case in the same window both succeed, and
  the later write silently replaces the earlier. Nothing detects the collision at write
  time. What makes this recoverable instead of invisible is FR-022: every write records its
  previous and new values, so a lost update is reconstructable after the fact by anyone
  reading the trail. Optimistic concurrency was considered and rejected for this slice —
  it would touch every write route and every caller of them, for a failure mode that needs
  two people editing one record within seconds, and no slice shipped so far carries it. If
  a firm reports a real lost update, that is the signal to revisit, and the audit trail is
  what will let them report it.

---

## Dependencies

| On | For | Status |
|---|---|---|
| `001-tenant-foundation` | Tenant, row-level isolation, audit log, cursor pagination | Satisfied — built |
| `002-identity-membership` | `Membership`, which assignment references | Satisfied — built |
| `004-authorization-entitlements` | The decision function, the capability registry, the `ScopeResolverPort` this slice fills | Satisfied — built. Port shape confirmed sufficient: the scope request already carries the resolved principal, so Decision 2's archetype exemption needs no change to it |
| `017-firm-directory` | Catalog pattern precedent, provisioning seed path, matrix-extension precedent | Satisfied — built. **Not** a source of the three catalogs; see Decision 1 |
| `016a-frontend-shell` | Consumes this slice's first `assigned` capability to exercise its own deferred scenarios | Not blocking — 016a shipped; this slice unblocks *its* remaining gap |
| Sign-off on Decisions 1–4 | Scope of the slice, and its refusal wire mapping | **Outstanding** |

---

## Out of Scope

Billing, CFDI, hourly rates and any fee calculation. Document storage (`007`). Calendar
events and deadlines (`013`) — note that `US09-EP02-CSM-ViewUpcomingDeadlines` and
`US10-EP02-CSM-ViewAssociatedTasks` are cited here only for the case reference they hang
off; the deadlines and tasks themselves belong to their own slices. Notes (`008`, still
blocked on privilege). Client-portal visibility of any of this (EP13, unvalidated).
Merging duplicate clients — note that client restoration (FR-004a) is what removes the
main reason a firm would create a duplicate in the first place. Reassigning a case to a
different client after creation. **Case** search and filtering beyond the bounded list read
(`US02-EP02-CSM-FilterCases`, IT2) — *client* search ships here, per FR-002a.
Role-differentiated permissions within a case team. Step-up MFA on any row here.

---

## Approval Checklist

- [x] **Q1 answered** (2026-08-27) — `PL` holds rows 26–27, not row 28; catalog needs
      no amendment for this row
- [ ] Decision 1 signed off — the three catalogs land in this slice
- [ ] Decision 2 signed off — with its ethical-wall cost read and accepted, not skimmed
- [ ] Decision 3 signed off
- [ ] Decision 4 signed off **by someone who can speak to the professional-privilege
      consequence**, per `004/plan.md` Open Item 3's own condition
- [ ] `004/FR-017` and `004`'s US5 scenario 3 amendment drafted, to land in the same PR
      as Decision 4 (FR-017)
- [ ] Catalog Amendments table actioned in `master-user-story-catalog.md` before any PR
      opens (Principle I)
- [x] `assigned` resolver contract confirmed against `004`'s shipped `ScopeResolverPort`
      — verified unchanged and sufficient: the port is keyed by scope kind, registration
      goes through the documented extension seam, and the scope request already carries
      the principal that Decision 2's exemption reads
- [x] Permission matrix declared with exactly one scope kind per row (Principle IV,
      `004/FR-013`)
- [x] Every mutation carries an audit requirement (Principle V, FR-022); case *reads* too
      (FR-023)
- [x] Zero `[NEEDS CLARIFICATION]`
