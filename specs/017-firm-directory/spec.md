# Feature Specification: Firm Directory — Position & Configurable Catalogs

**Feature Branch**: `017-firm-directory`

**Created**: 2026-08-26

**Status**: Draft, rev. 2 — 0 open clarifications. Q1 and Q2 resolved 2026-08-26; three
new catalog stories proposed

**Epic**: EP10-SystemConfiguration (CFG) — new stories US11–US13, orthogonal to
US01–US03's archetype/permission overlap with EP00/EP12

**Constitution**: v1.4.0

**Tier Classification**: Cross-cutting — every tenant needs a directory regardless of
iguala tier; not removed at any tier.

**Input**: `estado-specs.md`: *"Directorio del despacho — puesto de cada persona +
catálogos configurables."* Named explicitly by `004/spec.md`'s Decision 2: *"Seniority
is not an archetype... Seniority belongs to the firm directory; this slice reads
archetype and nothing else."*

> **Citation convention.** Requirements of slices 001, 002 and 004 are cited as
> `001/FR-0NN`, `002/FR-0NN` and `004/FR-0NN`. Bare `FR-0NN` refers to this document.

---

## Why This Slice Exists

004 drew a line it deliberately did not own: *"The firm's hierarchy (partner, senior
associate, associate, trainee) drives billing rate and org chart; the archetype drives
permission. They change independently, and a trainee who administers the system is a
real case."* 004 built the second axis — archetype, fixed, compile-time, product-wide.
This slice builds the first — position, free-form, tenant-defined, and read by nobody's
authorization decision.

Three domain slices already name this one as a dependency in `estado-specs.md` —
006-client-case-core (case team), 007-document-management, 013-calendar-core — for the
same reason: none of them wants to render a bare membership ID when assigning a case
team or a calendar attendee. They want a name and a position. This slice is what stands
between "a live membership exists" (002) and "a person a colleague can actually pick
from a list."

It has no external blocker. 001, 002 and 004 are built; nothing here waits on AWS, the
PAC, or a client decision — only on the two judgment calls in Open Questions, neither of
which blocks drafting `plan.md`'s Phase 0.

## The Deliberate Asymmetry With 004

004's Decision 4 fixed the archetype matrix as a compile-time constant, identical for
every tenant, and gave the reason: fixed archetypes are what make the authorization
matrix exhaustively testable, and Principle III forbids a tenant from inventing its own
permission semantics.

Position is the mirror image, on purpose. A law firm's own hierarchy is exactly the kind
of thing Principle III assigns to configuration, not to the product core: one firm has
"Of Counsel," another doesn't; "Socio Fundador" and "Socio" are the same rank at some
firms and different ranks at others. Making position a fixed enum would be imposing this
product's opinion of a law firm's org chart onto every law firm that buys it. Making
archetype tenant-configurable, symmetrically, would let a tenant invent a permission the
product never tested. Each axis is deliberately built the way the other one deliberately
isn't.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Set which position a firm member holds (Priority: P1)

*`US11-EP10-CFG-AssignMemberPosition` — new catalog story*

A managing partner or system administrator records which position — partner, senior
associate, associate, paralegal, whatever the firm calls its own ranks — a given member
of their firm holds. This is independent of, and never substitutes for, the archetype
004 already governs: a trainee may administer the system, and a name partner may hold no
elevated system permission at all.

**Why this priority**: Nothing else in this slice has anywhere to point until a member
can hold a position. It is also the story 006's case-team screen is waiting on: an
assignment UI that can only show membership IDs is not a UI a firm's partners will use.

**Independent Test**: Seed a live membership with no position assigned; assign one from
the tenant's own catalog; assert exactly one directory entry now names that position,
and that the change is audited with actor, subject, previous and new value.

**Acceptance Scenarios**:

1. **Given** an MP or SA of a tenant, **When** they assign a position to a live membership of that same tenant, **Then** the directory entry for that membership carries the new position and the change is audited with actor, subject, previous value and new value.
2. **Given** a position name that does not exist in the tenant's own catalog, **When** an assignment naming it is attempted, **Then** it is refused — a position must be chosen from the tenant's catalog, never typed freely at assignment time.
3. **Given** an MP or SA of tenant A, **When** they attempt to assign a position to a membership of tenant B, **Then** the attempt is refused and recorded as a cross-tenant access attempt, per `001/FR-008`.
4. **Given** a membership with no position ever assigned, **When** its directory entry is read, **Then** it is distinguishable from a membership holding an assigned-but-retired position (see Story 2, scenario 3) — "never assigned" and "assigned to something since retired" are different facts.
5. **Given** an archetype other than MP or SA, **When** it attempts to assign any position, **Then** it is refused.
6. **Given** a membership whose archetype changes independently (`004/FR-009`), **When** its position is inspected afterward, **Then** the position is unchanged — the two axes move independently, by design.

---

### User Story 2 - Define the firm's own set of positions (Priority: P2)

*`US12-EP10-CFG-DefinePositionCatalog` — new catalog story*

A managing partner or system administrator maintains the list of positions their own
firm actually uses. Unlike the archetype list, this catalog is the firm's own words for
its own hierarchy, and two firms' catalogs never look alike.

**Why this priority**: Story 1 cannot assign a position that does not yet exist in the
catalog, so the catalog comes first in dependency even though a newly provisioned tenant
starts with one already (see Resolved Decisions).

**Independent Test**: Add a position to a tenant's catalog; assign it to a member (Story
1); retire it; assert the existing assignment still reads correctly and the retired
position can no longer be newly assigned.

**Acceptance Scenarios**:

1. **Given** an MP or SA of a tenant, **When** they add a new position to their own catalog, **Then** it becomes available for assignment (Story 1) in that tenant only.
2. **Given** a tenant's catalog, **When** a member of a different tenant reads or writes it, **Then** the attempt is refused and recorded as a cross-tenant access attempt.
3. **Given** a position currently held by one or more members, **When** it is retired, **Then** existing directory entries continue to display it, marked retired, and it becomes unavailable for new assignments — it is never hard-deleted.
4. **Given** a freshly provisioned tenant, **When** its catalog is first read, **Then** it already contains the firm-agnostic default seed (see Resolved Decisions), immediately editable.
5. **Given** an archetype other than MP or SA, **When** it attempts to add, edit or retire a catalog entry, **Then** it is refused.

---

### User Story 3 - Browse the firm's own directory (Priority: P3)

*`US13-EP10-CFG-ViewFirmDirectory` — new catalog story*

Any member of the firm can see who else is in the firm and what position they hold, so
that assigning a case team, inviting an attendee, or sharing a document names a real
colleague rather than an opaque identifier.

**Why this priority**: Depends on Stories 1 and 2 having something to show, and is the
read path 006, 007 and 013 actually consume. Ranked below the writes because a directory
with nothing in it is a defect only once there's meant to be something there.

**Independent Test**: Seed two tenants with distinct members and positions; read the
directory as a member of tenant A; assert every entry belongs to tenant A and none to
tenant B.

**Acceptance Scenarios**:

1. **Given** any of the six internal archetypes, **When** the directory is read, **Then** every live membership of that tenant appears with its position (or "no position assigned"), and no membership of any other tenant appears.
2. **Given** a membership that has been revoked, **When** the directory is read, **Then** it does not appear in the active listing — revocation removes it from view without hard-deleting the underlying record, consistent with `002/FR-009`.
3. **Given** any of the four portal archetypes, **When** directory access is attempted, **Then** it is refused — `004/FR-020` already asserts they hold zero capabilities, and this slice grants them none.
4. **Given** `PO`, **When** directory access to any tenant is attempted, **Then** it is refused — this is tenant-scoped data and `PO` holds no tenant-scoped capability, per `004/FR-008`.
5. **Given** a large firm's directory, **When** it is read, **Then** results are returned in bounded portions rather than in full, consistent with the pagination convention `001/FR-013` already established for the audit log.

---

### Edge Cases

- What happens when the position referenced by an existing directory entry is retired — does the entry keep displaying it (yes, per Story 2 scenario 3), and does the UI need to say so explicitly?
- What happens when a membership is revoked and later a new invitation is accepted by the same person into the same tenant (002 permits re-inviting) — does the new membership inherit the old directory entry, or start with none?
- What happens when two SA/MP sessions assign different positions to the same member concurrently?
- What happens when a tenant's catalog is emptied of every position (all retired) — can a brand-new member still be given "no position assigned," and does the catalog need at least one active entry at all times?
- What happens when a membership's archetype is revoked entirely while it still holds an assigned position — does the directory entry persist for historical/audit purposes, or disappear alongside the membership? (Mirrors 002's own revocation-not-deletion answer; this slice inherits it rather than re-deciding it.)
- How does the system behave when the same position name is added twice to one tenant's catalog — case-insensitive collision, or two distinct entries that happen to read the same?

---

## Requirements *(mandatory)*

### Functional Requirements

**Directory entry**

- **FR-001**: A directory entry MUST extend exactly one live membership (`002/FR-006`), never an identity directly — the same person MAY hold a different position in each tenant they hold membership in, exactly as they may hold a different archetype in each (`002/FR-024`).
- **FR-002**: A directory entry MUST carry at most one position at a time, which MAY be unset.
- **FR-003**: Assigning or changing a directory entry's position MUST be audited with actor, subject, previous value and new value, following `004/FR-009`'s pattern for the analogous archetype change.
- **FR-004**: A directory entry MUST NOT be hard-deleted. When its underlying membership is revoked, it MUST stop appearing in the active directory listing (US3) while its historical record remains intact.
- **FR-005**: Changing a membership's position MUST NOT alter its archetype, and changing its archetype MUST NOT alter its position. The two are read and written independently.

**Position catalog**

- **FR-006**: Each tenant MUST have its own position catalog, isolated from every other tenant's, enforced by the same mechanism as every other tenant-scoped store (`001/FR-003`).
- **FR-007**: A position MUST carry a name and an active-or-retired status. It MUST NOT be hard-deleted.
- **FR-008**: A retired position MUST remain valid on every directory entry that already references it, and MUST NOT be selectable for new assignments.
- **FR-009**: A newly provisioned tenant's catalog MUST begin populated with a firm-agnostic default seed (see Resolved Decisions), immediately editable, rather than empty.
- **FR-010**: An assignment (FR-001–FR-003) naming a position absent from the tenant's own catalog, or belonging to another tenant's catalog, MUST be refused.

**Read access**

- **FR-011**: Reading a tenant's own directory MUST be available to all six internal archetypes (`MP`, `AA`, `PL`, `CM`, `BM`, `SA`) and MUST return only that tenant's own live memberships.
- **FR-012**: The four portal archetypes and `PO` MUST hold no capability defined by this slice, consistent with `004/FR-020` and `004/FR-008`.
- **FR-013**: A directory read MUST be returned in bounded portions for large results, following the pagination convention of `001/FR-013`.

**Boundaries with what is already built**

- **FR-014**: This slice MUST NOT alter 002's membership schema or its archetype semantics. Position is additive data extending membership behind its own seam, not a modification of 002's tables.
- **FR-015**: This slice MUST NOT weaken any database grant or Row-Level Security policy established by slices 001, 002 or 004 (mirrors `004/FR-026`).
- **FR-016**: This slice's three new capabilities (Capability Matrix rows 22–24 below) MUST be added to 004's Capability Matrix and registry in the same change, per `004/FR-021` — this slice does not define its own, parallel authorization mechanism.
- **FR-017**: This slice defines no billing rate. A position is a label a later slice's rate configuration (e.g., `US10-EP08-TTK-ConfigureBillableRates`) MAY key off of; this slice supplies the label and nothing about money.

### Capability Matrix extension *(required by Principle IV; extends 004's registry per 004/FR-021)*

Deny by default. Rows continue 004's numbering (1–21 already declared there).

| # | Capability | Scope | MP | AA | PL | CM | BM | SA | PO |
|---|---|---|---|---|---|---|---|---|---|
| 22 | Assign a member's position | `tenant` | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| 23 | Define the position catalog | `tenant` | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| 24 | Read own tenant's directory | `tenant` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |

Notes on this extension:

- `MP` holds rows 22–23 alongside `SA`, unlike 004's own row 7 (assign a member's
  archetype, `SA` only). The distinction is deliberate: archetype is a system-permission
  decision 004 reserved narrowly; position is an organizational fact about the firm's own
  hierarchy that its managing partner should not need `SA` support to record. This is
  this slice's own judgment call, not an amendment to 004's row 7 — see Open Question 1.
- Row 24 is the only row every internal archetype holds. Everyone in the firm needs to
  know who else is in it.
- Rows 22–24 all resolve at `tenant` scope, none at `assigned` — nothing in this slice
  concerns a specific case or document, only the firm's own membership and catalog.
- Per `004/FR-023`, a refusal on any of these three rows discloses nothing about the
  target membership's or catalog entry's existence beyond what the caller's own
  archetype already permits.

### Key Entities

- **DirectoryEntry**: Extends exactly one live membership (002) with a position
  reference, which MAY be unset. Tenant-scoped. Never hard-deleted; stops appearing in
  the active listing when its membership is revoked (FR-004).
- **Position**: A tenant-defined catalog entry carrying a name and an active-or-retired
  status. Tenant-scoped. Never hard-deleted (FR-007).

This slice adds two new tables and no change to any table owned by 001, 002 or 004.

---

## Success Criteria *(mandatory)*

- **SC-001**: 100% of position assignments and catalog changes produce exactly 1 audit entry carrying actor, subject, previous value and new value.
- **SC-002**: 0 assignments succeed naming a position absent from the acting tenant's own catalog.
- **SC-003**: 100% of cross-tenant assignment or catalog-write attempts are refused and recorded as cross-tenant access attempts; 0 succeed.
- **SC-004**: A retired position remains readable on 100% of directory entries that already reference it, and is offered for 0% of new assignments.
- **SC-005**: A directory read for tenant A returns entries belonging to tenant A in 100% of cases and 0 entries belonging to any other tenant.
- **SC-006**: A revoked membership is absent from the active directory listing in 100% of trials, while its historical directory entry remains intact and is not hard-deleted.
- **SC-007**: Each of the four portal archetypes and `PO` is refused all three of this slice's capabilities (rows 22–24), asserted individually rather than inferred, mirroring `004/SC-004`'s method.
- **SC-008**: A newly provisioned tenant's catalog contains the default seed and is immediately editable, with 0 manual setup steps required before the first assignment.
- **SC-009**: Changing a membership's position leaves its archetype unchanged, and changing its archetype leaves its position unchanged, in 100% of trials — the two axes never move together unless each is changed independently.
- **SC-010**: A directory read over a large tenant returns its first bounded portion in a time comparable to `001/SC-010`'s audit-query bound, rather than the full set at once.

## Resolved Decisions

- **Default seed catalog.** A newly provisioned tenant's position catalog begins with a
  small, firm-agnostic seed — e.g. Socio, Asociado Senior, Asociado, Pasante, Paralegal —
  editable immediately (FR-009, SC-008). Firm-agnostic per Principle III: the seed is a
  starting convenience, not an opinion imposed on any one firm's structure, and every
  entry in it can be renamed or retired on day one.
- **Retirement, never deletion.** A position follows the same convention 001, 002 and 004
  already established for tenants, memberships and invitations: withdrawal is a status
  change, and the record persists (FR-007, FR-008). This extends an existing pattern
  rather than deciding a new one.
- **Position is a membership property, not an identity property.** Mirrors `002/FR-024`'s
  treatment of archetype exactly, for the same reason: the same person may hold different
  positions at different firms (FR-001).

## Decisions

### Decision 1 — Position writes are MP + SA, as drafted *(resolved 2026-08-26)*

**Resolved: option (a).** Assigning a position and defining the position catalog are
granted to `MP` alongside `SA`, exactly as drafted in the Capability Matrix extension
above — no row changes.

**Rationale.** A firm's own organizational hierarchy is a partner-level business fact,
not a system-administration task. Matches how 002 already grants `MP` several
membership-adjacent capabilities alongside `SA` (invite, revoke invitation, read pending
invitations, revoke membership) for the same leadership-act reasoning. The rejected
alternative (SA-only, matching 004's row 7 exactly) would have treated an organizational
label the same as a system-permission change, which this slice's own Deliberate
Asymmetry section argues against on principle, not only on convenience.

### Decision 2 — Position-only catalog for MVP *(resolved 2026-08-26)*

**Resolved: option (a).** This slice's MVP scope ends at one catalog (position). No
second catalog is specified here. `estado-specs.md`'s plural *"catálogos configurables"*
is read as anticipating that more configurable catalogs may exist eventually, not as a
requirement that a second one ship in this slice.

**Rationale.** No second catalog has surfaced in the April 2026 prioritization document,
the epic catalog, or any slice's stated dependency on this one. Inventing a second
catalog without a named consumer would be speculative scope, the same failure mode 004
avoided by not inventing domain capabilities it had no registry entry for yet. A future
slice that needs a second configurable catalog (practice areas, offices, or anything
else) specifies it — and its own consumer — when that need is real.

Consequence carried into `plan.md`: two tables only (`DirectoryEntry`, `Position`); no
generic "catalog" abstraction is built to anticipate a second catalog that has no named
consumer today.

## Dependencies

- **Slice 001 (built)**: tenant isolation and audit mechanism this slice's two new
  tables and its audited actions rely on.
- **Slice 002 (built)**: the membership a directory entry extends 1:1, behind its own
  seam (FR-001, FR-014) — this slice does not touch 002's tables.
- **Slice 004 (built and tested)**: this slice's three capabilities (rows 22–24) extend
  its Capability Matrix per `004/FR-021`; enforcement of all three is 004's decision
  function, never a check this slice writes itself (FR-016).
- **Slice 006-client-case-core, 007-document-management, 013-calendar-core** each depend
  on this slice's read capability (US13) to name real colleagues rather than bare
  membership IDs in their own screens, per `estado-specs.md`.
- **Slice 014-admin-ui** is assumed to be where any screen for editing the catalog or
  assigning positions actually renders, consuming this slice's capabilities exactly as
  it is already specified to consume 004's mechanism rather than reimplementing it. This
  slice ships no user interface of its own.
- **Slice 009-time-tracking** (blocked on a separate scope conflict, per
  `estado-specs.md`) MAY eventually key billable rates off position (per 004's own note
  that the prototype "derives hourly rates from" the position-equivalent column); this
  slice supplies the label and defines no rate itself (FR-017).
- **Principle I traceability**: three catalog stories are proposed as additions —
  `US11-EP10-CFG-AssignMemberPosition`, `US12-EP10-CFG-DefinePositionCatalog`,
  `US13-EP10-CFG-ViewFirmDirectory` — raising EP10-CFG from 10 to 13 stories. The
  resulting catalog-wide total should be reconciled against
  `master-user-story-catalog.md`'s actual state at merge time rather than computed from
  this document, since 004's Decision 4 (retiring `US12-EP00-FND`) and Decision 5
  (reassigning `US13`/`US15-EP00-FND`'s claim to slice 002) already moved the
  pre-existing total by an amount this spec has not independently verified.

## Out of Scope

Billing or hourly rates of any kind (slice 009's own capability, per FR-017). Any user
interface for browsing the directory or editing the catalog — slice 014 renders it,
consuming this slice's capabilities. The archetype-to-action matrix itself and its
enforcement mechanism (slice 004 owns both; this slice only extends its registry, per
FR-016). Practice areas, office locations, or any configurable catalog beyond position,
pending Open Question 2. Seniority-based authorization of any kind — Decision 2 of 004
is explicit that position never drives a permission decision, and this slice does not
reopen that. Self-service editing of one's own position (assignment is MP/SA only, per
Story 1) — this is not an extension of EP11-PMG's self-service profile fields. Import or
bulk-provisioning of a firm's existing org chart from an external source.

## Approval Checklist

- [x] Both `[NEEDS CLARIFICATION]` items closed — Decision 1 (MP + SA) and Decision 2 (position-only MVP), 2026-08-26
- [x] No implementation or technology detail in this document
- [x] Every requirement is test-verifiable — ticked 2026-08-26 on T030: 98 files / 786 tests / 0 failures, blocking coverage (`tenant`, `audit`, `authz`) 100% on all four measures. Evidence in [quickstart-results.md](./quickstart-results.md). **Approval itself remains for the technical lead.**
- [x] Cross-tenant leak test defined and accepted (Principle II) — Story 1 scenario 3, Story 2 scenario 2, Story 3 scenario 1, SC-003 and SC-005
- [x] Audit events enumerated per operation (Principle V) — FR-003, SC-001
- [x] Capability Matrix extension declared and added to 004's registry in the same change (Principle IV, FR-016, `004/FR-021`)
- [x] Tier classification declared (Tier Entitlements) — cross-cutting
- [x] US11–US13-EP10-CFG added to `master-user-story-catalog.md` (Principle I), and the catalog-wide total reconciled against the file itself rather than this document's arithmetic — done 2026-08-26 on T028. `EP10-CFG` 10 → 13. The catalogue-wide total was **counted from the epic tables** rather than carried forward: 168, not the 172 the header claimed. The 7-row gap predates this slice (`EP00` lists 16 and holds 15 after 004's Decision 4; `EP02` 13/10; `EP06` 9/8; `EP12` 19/17) and is recorded as a reconciliation note in the catalogue itself — this slice corrected only the total and its own `EP10` row, leaving the four stale per-epic figures for the slices that own them.

## Implementation notes (2026-08-26)

Two findings from building this slice are recorded in
[quickstart-results.md](./quickstart-results.md) rather than changing any requirement
here:

- **`GET /tenant/directory` needed one explicit tenant predicate**, because 002's
  second, identity-scoped SELECT policy on `membership` ORs with the tenant-scoped one
  and would otherwise have shown a dual-tenant reader their own row from another firm.
  Found and fixed during implementation; SC-005 holds.
- **FR-009 is closed on both paths** (T033–T037). The first pass seeded the catalog in
  the dev/CI seed only, leaving a tenant provisioned through
  `POST /internal/platform/tenants` empty and SC-008 unmet on the path a real firm is
  actually created by. Closed by following research.md D2 literally — the catalog is now
  written on the same platform transaction as the tenant row — and by the narrow
  platform extension 002 had already established in `0016`: one `FOR INSERT` policy with
  a restricting `WITH CHECK`, one `GRANT INSERT`, and nothing else. The platform role can
  seed a catalog and still cannot read, edit or delete one, nor touch `directory_entry`
  at all. `platform-scope.test.ts` — the lockdown that freezes that reach — grew from
  five tables to six and now asserts the new extension's narrowness directly.
