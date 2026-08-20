# Specification Quality Checklist: Tenant Foundation & Audit Log

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-19
**Updated**: 2026-08-19 — iteration 3: catalog traceability closed, FR-014 amended to seven events, FR-025 and FR-026 added, RLS predicates aligned to Constitution v1.3.0
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

**16 of 16 pass.** The spec is complete for planning purposes.

### Iteration 2 — how the three failures were closed

Both blocking decisions were taken by the CC technical lead on 2026-08-19.

**Decision 1 — a person may hold access to more than one tenant.** Identity and
membership become separate concepts; an archetype is a property of a membership.
This closes Constitution Technical Debt item 8, which required the question settled
before the first `/plan`.

Spec changes: FR-021 replaced by FR-021 through FR-024; User Story 1 gained
acceptance scenarios 6 and 7; SC-014 added; two boundary entities named in Key
Entities as owned by slice 002; the Permission Matrix gained a note that every
archetype column describes a membership rather than an identity.

FR-023 was added as a consequence rather than being asked for. If one identity can
belong to two firms, then the *set* of firms it belongs to is itself information one
firm must not be able to read about another — in this domain, learning that a given
firm is adjacent to a given matter can be privileged on its own.

**Decision 2 — 24 months retention.** Spec changes: FR-019 fixed at 24 months with a
deletion routine the application cannot invoke; User Story 4 gained acceptance
scenario 5; SC-013 added.

**Third failure resolved by the first two.** `Requirements are testable and
unambiguous` and `All functional requirements have clear acceptance criteria` both
failed solely because FR-019 and FR-021 carried markers. With those closed, every
requirement states an observable outcome backed by an acceptance scenario or a
success criterion.

### Constitution deviations found while writing this spec

Recorded here rather than silently corrected. The first four are closed; the last two
are carried forward.

- **Closed.** The source draft cited Constitution v1.1.0. The ratified document is now **v1.3.0**, and this spec targets it. (It was v1.2.0 when the spec was first written; v1.3.0 added the null-safe RLS predicate rule, which the plan artifacts have been brought into line with.)
- **Closed.** The source draft carried **no permission matrix**. Principle IV states a `spec.md` without one *"does not pass the Discovery approval gate"*. One was added and is now an approval-checklist item.
- **Closed.** The source draft carried **no tier classification**. Declared cross-cutting, as the Tier Entitlements section requires.
- **Closed.** The source draft listed **AWS region** as a question of this spec. It is already a constitution-level `[PENDING]` under Data Residency; recorded as a dependency instead. Naming a cloud provider would also have violated this spec's own no-technology rule.
- **Carried forward.** `CC` is overloaded — the draft uses it for Cosmic Chimps, while the constitution also lists `CC` among portal archetypes in Principle IV and under Sessions. This spec writes "Platform Operator (Cosmic Chimps)" and "corporate client" explicitly. The constitution should be amended to disambiguate before slice 004.
- **Carried forward.** Constitution Technical Debt item 8 is closed by Decision 1 and should be struck at the next amendment.

### Iteration 3 — traceability closed, and it corrected the spec

`specs/master-user-story-catalog.md` is now present (169 stories, EP00–EP16, with
EP00-PlatformFoundation at 15), so Principle I is satisfied and PRs against this spec
can carry an acceptable reference.

Checking the spec against it found **two wrong story IDs**. The spec claimed
`US04-EP00-FND-WriteAuditEvent` and `US05-EP00-FND-QueryAuditLog`; the catalog assigns
US04 to DeactivateTenant and US05 to ConfigureTenantLimits, and puts audit writing at
US06, immutability at US07, log query at US08 and cross-tenant logging at US10. Both
IDs were corrected.

The same check showed the spec **under-claimed its coverage**: it delivers nine catalog
stories, not five. Deactivation, limit configuration, audit immutability and
cross-tenant attempt logging were already specified — in FR-006, FR-016, FR-011 and
FR-008 respectively — without being credited to their stories. Coverage is now stated
explicitly under Dependencies.

Three further amendments were applied, all closing gaps the spec had previously only
flagged: FR-014 now enumerates **seven** audited events, adding plan limit and
entitlement changes and platform reads of the tenant registry; new **FR-025**
restricts the audit-query event to interactive reads so automated reads cannot inflate
the log without bound (SC-015); and new **FR-026** extends that same channel gate to
registry reads, which had been the one read left untraced. The plan artifacts were
also brought into line with Constitution v1.3.0's null-safe RLS predicate rule.

**Numbering note.** FR-026 was requested as "FR-025" and its test as "V15". Both were
already taken — FR-025 by the channel rule that the new requirement itself cites, and
V15 by the no-tenant-context case Constitution v1.3.0 requires. Renumbered to FR-026,
and the assertion went into V13 rather than a new scenario, since V13 was still only a
table row.
