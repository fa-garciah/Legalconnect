# Specification Quality Checklist: Authentication & Multi-Factor Enrollment

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-08
**Last re-validated**: 2026-09-09, after the clarification session
**Feature**: [spec.md](../spec.md)

**Review Ownership**: This checklist is a reviewer-owned requirements-quality review artifact. Mark an item `[x]` only when the reviewer determines the requirements-quality criterion is satisfied.
**Marker Semantics**: `[x]` means the criterion has been reviewed and satisfied for requirements quality. It does not mean implementation work is complete.

## Content Quality

- [ ] No implementation details (languages, frameworks, APIs)
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
- [ ] No implementation details leak into specification

## Project-Specific Gates

- [x] Every capability traces to a registered story in `master-user-story-catalog.md` (Principle I) — all four EP12 stories present, no amendment required
- [x] Permission matrix declared (Principle IV)
- [x] Audit events enumerated per operation (Principle V) — FR-042
- [x] Tier classification declared
- [x] Language rule observed — spec in English, UI copy required to be Spanish by FR-049 (Merge Rules)
- [x] Constitutional decisions cited rather than reopened as spec decisions
- [x] The three constitutionally blocking coverage paths asserted individually — SC-029
- [ ] Constitution version cited is verifiable in `main`

## Validation Findings

**Status: 21 of 24 items passing** (was 20 of 24 before the 2026-09-09 clarification
session). Three remain unchecked; one is a hard blocker, two are a single reviewer
judgement call recorded in duplicate.

### Resolved on 2026-09-09 — clarification session

**All `[NEEDS CLARIFICATION]` markers are closed.** Five questions were asked and
answered; the spec carries zero markers. Beyond the three originally marked
requirements, the session closed two further items that had been recorded as an
Assumption and an Edge Case:

| # | Item | Outcome |
|---|---|---|
| 1 | Backup code count and expiry (FR-031) | 10 codes, consumption-only expiry |
| 2 | Failed-attempt threshold and lockout (FR-021) | 5 failures, 15 minutes, counter reset on success, backup codes counted |
| 3 | Step-up on re-issuance (FR-032) | Split by case — recovery-path ships, standalone deferred to `005` |
| 4 | Credential establishment (FR-053, FR-054) | At invitation acceptance, extending `002`'s acceptance operation in code |
| 5 | Code acceptance window (FR-056) | 30-second step, ±1 step, 90-second window |

Two of these tightened requirements that had not been flagged at all: FR-005's
credential threshold was aligned to FR-021's rather than left as "a defined threshold",
and FR-020's replay guard was widened to cover the full acceptance window rather than
the current step alone. FR-055 and FR-056 were added to hold consequences the answers
implied. Full reasoning is preserved in the spec's Open Questions table.

### 1. Constitution version is not verifiable in `main` — blocking for approval

Unchanged by the clarification session and still the one hard blocker. The spec cites
Constitution v1.5.0 throughout. `main` at `0901b08` carries v1.4.1, which names Amazon
Cognito as the live identity provider 23 times and mentions neither NextAuth nor
`otplib`. The v1.5.0 amendment exists as a complete but **uncommitted** modification to
`.specify/memory/constitution.md`. Drafting proceeded against the working tree at the
author's explicit direction, and the condition is recorded as the first Assumption and
the first Approval Checklist item. Committing the amendment closes this item and
nothing else is needed.

### 2. "No implementation detail" — reviewer judgement, recorded against two items

This is one finding that both the Content Quality and Feature Readiness checklists ask
about, so it is left unchecked in both rather than being marked satisfied in one place
and not the other.

The functional requirements, success criteria and acceptance scenarios are
technology-neutral throughout: "a memory-hard hash", "an authenticator-app time-based
factor", "an application-held key separate from the database" — never a library or
algorithm choice. The clarification session added concrete numbers (10 codes, 5
attempts, 15 minutes, a 90-second window) which are behavioural parameters rather than
technology, so they do not change this assessment. Two places do name technology, both
deliberately:

- **Assumptions and Dependencies** name the identity and factor libraries as
  constraints inherited from the constitution, not as choices made here. This is the
  same posture `002`'s own Approval Checklist flagged for the same reason, carried
  forward for consistency rather than silently resolved differently.
- **Key Entities** names the RLS exception for the identity and session tables, because
  the constitution requires that exception to be documented wherever a slice touches
  those tables.

One near-miss worth a reviewer's eye: FR-056's rationale cites RFC 6238 by name. That is
a protocol specification rather than an implementation choice — the requirement states
the window in seconds and would read identically without the citation — but a strict
reading of Principle I could object.

Both genuinely open design choices — token shape, and the identity library's own session
handling — remain explicitly pushed to `plan.md`/`research.md` in the spec's Open
Questions section rather than being decided here. A reviewer should confirm this reading
is acceptable under Principle I.

## Notes

- Items marked incomplete require spec updates before `/speckit-plan`
- The two "no implementation detail" items are a single reviewer judgement call, not two independent defects
- Mark items `[x]` only after review confirms the requirement-quality criterion is satisfied
