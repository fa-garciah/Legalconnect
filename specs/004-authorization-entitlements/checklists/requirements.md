# Specification Quality Checklist: Authorization & Tier Entitlements

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-26 | **Re-validated**: 2026-08-26, after Q1/Q2 resolution
**Feature**: [spec.md](../spec.md)

> **Status: 16 of 16 pass.** The three rows below that failed on 2026-08-26 did so
> for one root cause — Q1 and Q2 open — and all three closed when the spec was
> amended later the same day: Q1 as Decision 4 (archetypes fixed, `US12` retired) and
> Q2 as Decision 6 (`MP` keeps what 002 shipped). The original assessment is kept
> below unedited, as the record of what was true when it was written; the addendum
> at the foot records what changed.

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain — 0 remain as of the 2026-08-26 amendment
- [x] Requirements are testable and unambiguous — closed by Decisions 4 and 6
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria - closed by Decisions 4 and 6
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

**13 of 16 pass. Three fail, all for the same root cause: Q1 and Q2 are open.**

### The three failures

- **No [NEEDS CLARIFICATION] markers remain** — two remain, by design. Q1 (what
  `US12-EP00-FND-DefineRole` means) and Q2 (whether this slice's matrix narrows `MP`).
  Neither has a defensible default: Q1 is the difference between a constant matrix and a
  per-tenant lookup, and Q2 removes or preserves four capabilities that are shipped and
  tested today.
- **Requirements are testable and unambiguous** — fails only because rows 1–6 of the
  capability matrix carry an undecided `MP` cell (Q2), and because FR-021's build-time
  gate and the exhaustive matrix test have a different shape under Q1(b) than under
  Q1(a). Every other requirement states an observable outcome backed by an acceptance
  scenario or a success criterion.
- **All functional requirements have clear acceptance criteria** — same cause. FR-009 and
  FR-010 are backed by User Story 4, whose scope depends on Q1.

With Q1 and Q2 answered, all three close without further spec work: Q2 fills six table
cells, and Q1 either strikes US12 from the slice (option a), or adds a per-tenant override
entity plus its own requirements and success criteria (option b).

### Content quality — one judgement call, recorded rather than hidden

The section *What Is Actually Built Today* names `@RequireArchetypes`, an implementation
symbol, and describes how the shipped interceptor evaluates it. This is a deliberate
exception to the no-implementation-detail rule and follows the precedent 002's checklist
set for naming inherited constraints.

The reason: FR-019 exists **because** the shipped mechanism fails open on an undeclared
route, and that finding is not derivable from the story catalogue. Stating it as an
abstract requirement without the evidence would leave a reader unable to tell whether
FR-019 is a new guarantee or a restatement of an existing one. It is the former. The
finding is confined to that one section; no requirement, no success criterion and no
matrix row names a framework symbol.

### Four corrections applied to the input draft

Recorded here so they are visible to review rather than absorbed silently.

1. **`PO` holds seven platform capabilities, not two.** The draft's claim that
   provisioning and plan assignment are "the whole vendor surface" omits tenant
   deactivation, the tenant registry read, the platform audit read, plan-limit
   configuration, and the seed `SA` invitation from `002/FR-035` — all shipped, all
   audited. Under FR-002 a matrix that omits a shipped capability refuses it, so all
   seven are enumerated. FR-008 is unaffected: none is tenant-scoped.
2. **Five capabilities shipped by 002 had no row.** Reading pending invitations, reading
   the tenant's memberships, accepting one's own invitation, reading one's own
   memberships, and issuing the seed invitation. Added as rows 4, 5, 9, 10 and 17 —
   completeness, not judgement.
3. **Three capabilities held by nobody were added explicitly** (rows 18–21). `002`
   already denies them to every archetype including `PO` and `SA`; they are in the table
   so the exhaustive test asserts them rather than inferring them from silence.
4. **FR-012 was renumbered into sequence.** The draft listed it after FR-017.

### Requirements added beyond the input draft

FR-018 (a single enumerable capability registry, without which FR-011's exhaustive test
cannot be written), FR-019 (an endpoint declaring no capability is unreachable — the
fail-open closure), FR-020 (portal archetypes assert zero), FR-021 (matrix row and scope
kind land in the same change), FR-022 to FR-025 (refusal ordering, non-disclosure, named
limits, cross-tenant events), FR-026 to FR-028 (no weakening of 001/002 grants, per-request
plan reads, and enumerated divergence from `002`'s matrix).

FR-023 also resolves an internal tension the draft carried: FR-006 and FR-017 require
refusals to be distinguishable, while User Story 1 requires them to disclose nothing.
Both hold, because the refusal ordering guarantees each distinction is only ever drawn for
a caller who already passed the check above it.

### Constitution alignment

- Principle IV — permission matrix declared, with a scope kind on every row. Satisfied.
- Principle I — `US11`, `US12` and `US14` are present in `master-user-story-catalog.md`.
  `US13` and `US15` are built by 002 and claimed by no slice; Decision 5 requires 002's
  Principle I entry amended rather than this slice re-specifying them.
- Tier Entitlements — classification declared cross-cutting.
- Principle V — audit events required per operation, refusal side included.
- Non-negotiable critical coverage — FR-012 and SC-016 make refusal-path coverage
  blocking.
- Walking skeleton item 4 — this slice completes it. Item 11 of Recognised Technical Debt
  is struck when it lands.

### Items awaiting review rather than spec work

- **Every requirement is test-verifiable** and **technical lead approval** remain open on
  the spec's own Approval Checklist. Both are reviewer judgements, not authoring gaps.
- **Decision 5** requires a change to `002`'s `plan.md`, outside this slice directory.
  Under the constitution's Merge Rules a PR is scoped to a single slice directory, so this
  is flagged for the reviewer to route rather than actioned here.

---

## Addendum — 2026-08-26, after the spec amendment

The three failing rows closed exactly as this checklist predicted they would:
*"With Q1 and Q2 answered, all three close without further spec work."*

| Row | Was | Now |
|---|---|---|
| No `[NEEDS CLARIFICATION]` markers remain | 2 remained | **0** |
| Requirements are testable and unambiguous | 6 matrix cells undecided; FR-021 and the exhaustive test had two possible shapes | Cells filled; the matrix is a constant, so the test has one shape |
| No ambiguities | User Story 4's scope depended on Q1 | `US12` retired; US4 keeps only the last-`SA` constraint and the no-editing-archetypes boundary |

Q2 filled six cells and the answer was **keep what 002 shipped** — so FR-028's
enumeration of differences against 002 is empty, no route declaration changes, and
SC-017's *0 test modifications* holds literally rather than approximately.

The internal tension this checklist flagged between FR-006/FR-017 (refusals must be
distinguishable) and FR-023 (refusals must not disclose existence) survives for one
scope kind only, `assigned`, and is **not blocking**: no capability in this slice's
matrix resolves at that kind. It is carried as `plan.md` Open Item 3 and
`research.md` D6, to be settled by the slice that ships the first `assigned`
capability.
