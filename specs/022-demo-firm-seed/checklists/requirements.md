# Specification Quality Checklist: The Demo Firm Seed

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-25
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
      — *Qualified, and deliberately so.* This slice's deliverable **is** a developer command, so
      its requirements name the helpers it must not bypass (`hashCredential`, `resolveKeyProvider`,
      `ObjectStorePort.put`, `buildObjectKey`). Naming them is the requirement, not a leak: the
      whole finding table exists because the current seed bypasses exactly these seams. The user
      of this feature is a developer, and "written for stakeholders" resolves to them.
- [x] Focused on user value and business needs — a product that can be signed into and shown
- [x] Written for non-technical stakeholders — *"Why this slice matters"* is readable without code
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain — zero; nine numbered Decisions instead
- [x] Requirements are testable and unambiguous — every FR maps to at least one acceptance scenario
- [x] Success criteria are measurable — SC-001…SC-009 name counts, exit codes, checksums and suites
- [x] Success criteria are technology-agnostic — *Qualified*: SC-004 and SC-008 name suites and a
      column, because the observable outcome of a seeding command **is** database and store state.
      No SC names a framework.
- [x] All acceptance scenarios are defined — 5 + 5 + 5 + 4 across four stories
- [x] Edge cases are identified — seven, including the object store being unreachable, which is
      the live state of this machine on 2026-09-25
- [x] Scope is clearly bounded — seven explicit Out of Scope entries, three deferred by Decision
- [x] Dependencies and assumptions identified — five assumptions, four dependencies, all shipped

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows — sign in, read the data, open a document, be refused
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification — see the two qualifications above

## Constitution-specific gates

- [x] **Principle I** — `US22-EP00-FND-SeedDemoFirm` added to `master-user-story-catalog.md` in
      this slice's own PR
- [x] **Principle II** — no new table, no new RLS policy, no query that filters `tenant_id` in
      application code. The command writes on the migration connection, the standing
      `seedIdentitiesAndMemberships` already holds
- [x] **Principle III** — no firm-specific logic in the product core. Decision 6 places every
      demo-specific catalog row inside *that tenant's own* catalog
- [x] **Principle IV** — the Capability Matrix section states that the slice adds no capability,
      and declares what the demo data makes reachable per archetype
- [x] **Principle V** — the command writes no audit entries and needs none: it is fixture setup,
      not a user journey, and no `audit_event_action_known` value is added (so no migration)
- [x] **Principle VI** — Decision 2 addresses fixture credentials head-on and ties their
      defensibility to Decision 3's guard; FR-020 bars digests, wrapped secrets and connection
      strings from output
- [x] **MFA is not weakened** — FR-013 and SC-006 make the absence of any bypass a tested property

## Notes

- Decisions 1–9 are taken, not deferred, and every one is marked *"Decided by Claude 2026-09-25 —
  pending ratification by Jero"*. The Approval Checklist boxes stay **unticked** until he signs;
  the boxes ticked there are the verification items, not the approvals.
- Decision 7 creates a deliberate forward dependency: `015-kpi-dashboard` amends this command to
  fill case outcomes. `015`'s `tasks.md` must carry that task, and its spec must not read as
  though the data were already present.
