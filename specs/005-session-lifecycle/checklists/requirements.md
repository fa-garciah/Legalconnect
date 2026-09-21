# Specification Quality Checklist: Session Lifecycle — Expiry, Sign-Out, Revocation & Step-Up MFA

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-21
**Feature**: [spec.md](../spec.md)

**Review Ownership**: This checklist is a reviewer-owned requirements-quality review artifact —
generated here as a first pass, not a substitute for a CC-technical review before `/speckit-plan`.

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No `[NEEDS CLARIFICATION]` markers remain — all three pre-specification items resolved as
      citations (D1, D2) or an explicit, flagged Assumption (D3), per Pre-Specification Decisions
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

## Project-Specific Gates

- [x] Every capability traces to a registered story in `master-user-story-catalog.md` (Principle I)
      — all four EP12 stories present, marked FND, no amendment required. Verified directly against
      `specs/master-user-story-catalog.md` line 445+: `US07`, `US08`, `US11`, `US12` all present
      under `EP12-AccountSecurity`, all FND, explicitly mapped to slice `005`.
- [x] Constitutional decisions cited rather than reopened as spec decisions — D1 and D2. Verified
      directly against source: `.specify/memory/constitution.md` lines 395-407 (§ Sessions) match
      D1's six numbers exactly; `backend/src/common/authz/capability.ts` lines 39-54 match D2's five
      `stepUp: true` rows exactly, enforced by `backend/tests/unit/registry-shape.test.ts`.
- [x] Audit events enumerated per operation (Principle V) — FR-006, FR-021; FR-011 and FR-015
      explicitly state which lifecycle events do *not* get a dedicated entry, and why
- [ ] **D3 confirmed by whoever owns this decision at CC.** This is the one gate this pass cannot
      close on its own — it's a judgement call standing in for a decision, not a citable fact. See
      spec.md Named Risks. Technical premise re-verified directly against schema: `backend/src/
      common/db/schema.ts` lines 614-658 confirm `session`/`refresh_token` carry no tenant or
      membership FK (`003/FR-037` is real, not just asserted), so Option A remains a defensible
      default — but the decision itself still needs a named owner's sign-off, not just technical
      plausibility.
- [x] Constitution version cited (`v1.5.0`, assumed current per `003`/`004`'s own citations) is still
      the version on `main` at the time this spec is approved. Verified: `.specify/memory/
      constitution.md` line 950 — `**Version:** 1.5.0 | **Ratified:** 2026-08-14 | **Last Amended:**
      2026-09-04`. Matches.

## Notes

**17 of 18 pass on this pass**, up from 16/18 on the first draft. Every citation in this spec (D1,
D2, `003/FR-034`, `003/FR-037`, `003/FR-038`, `001/research.md` D13, `001/FR-006`, the catalog
entries, and the `session`/`refresh_token` schema) was independently re-verified against the live
repository on 2026-09-21 and found to match exactly — no drift. `specs/005-session-lifecycle/` did
not exist prior to this pass; this is a fresh draft, not stale prior work, consistent with `003/
FR-038` and `004`'s capability rows explicitly deferring to `005`.

Two ambiguities identified during this pass were folded directly into spec.md rather than left as
review-only notes, since they were the kind of gap an implementer would otherwise have had to guess
at during `/speckit-plan` or `/speckit-tasks`:

- **FR-010 / FR-008**: it was previously unstated whether the *absolute* timer restarts when a
  session's role class changes mid-session (e.g. an archetype change). Resolved: the absolute clock
  always counts from the session's original `created_at`; only the limit it's checked against
  changes. Reflected in FR-008, FR-010, and User Story 3's acceptance scenario 8.
- **FR-019**: it was previously unstated whether the request that *triggers* a step-up challenge
  counts as ordinary idle-timer activity under FR-007. Resolved: yes, exactly as it would for any
  other authenticated request — step-up changes nothing about that. Only the absolute clock, and any
  *additional* credit beyond that one request, remain untouched. Reflected in FR-019 and User Story
  2's acceptance scenario 4.
- **FR-025** (new): the pre-existing-session migration guarantee — no forced mass sign-out on
  deploy — was previously an Edge Case note only, with no FR or SC backing it, inconsistent with
  this project's convention that every binding guarantee gets an FR with acceptance criteria. Now a
  full FR-025, backed by SC-009.

The one remaining open item is D3's sign-off — a genuine decision, not a fact this pass can close by
re-reading the repo. Recommend treating it as the Approval Checklist's job, not blocking
`/speckit-plan` from starting, since `/speckit-plan` can proceed on the stated Assumption and D3 only
needs to close before implementation begins.
