# Specification Quality Checklist: Clients, Cases & Case Teams

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-27
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain — Q1 resolved 2026-08-27
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

## Project-Specific Gates *(from Constitution v1.4.0)*

- [x] **Principle I** — every cited story ID exists in `master-user-story-catalog.md`,
      verified by lookup rather than assumed. Gaps found are listed as required catalog
      amendments rather than silently imported.
- [x] **Principle III** — the three catalogs are per-tenant and firm-agnostic; no
      hardcoded firm-specific value enters the core (FR-019).
- [x] **Principle IV** — permission matrix present, deny by default, every archetype
      column shown including `PO`, portal archetypes explicitly zeroed. Exactly one scope
      kind per row.
- [x] **Principle V** — every mutation carries an audit requirement (FR-022), and case
      *access* is audited too (FR-023), which Principle V requires and which the source
      draft omitted.
- [x] **Principle VI** — `BM` is denied case content on minimisation grounds, stated in
      the matrix notes.

## Validation Findings

Five iterations were run. The following were found and corrected in the spec before it
was finalised. All are corrections against **verified** repository state, not stylistic
preference.

### Iteration 1 — corrected

1. **A matrix row declared two scope kinds.** The source draft's case-list row read
   *"`tenant` for MP/SA; `assigned` for others."* `004/FR-013` requires exactly one scope
   kind per capability, and the shipped registry enforces this structurally — a capability
   definition carries a single `scope` field. Corrected: every row now declares one kind.

2. **The case-list row declared the wrong kind, and the error was load-bearing.** A scope
   resolver returns a boolean; there is no outcome meaning "permit but return fewer rows."
   An `assigned`-scoped list capability would *refuse* a member with no assignments, but
   the draft's own acceptance scenario requires them to receive an **empty list**. The two
   cannot both hold. Corrected: the list read declares `tenant` and filters its result set
   (FR-014), the single-case read declares `assigned` and refuses (FR-016). A dedicated
   section explains why, so the row is not "fixed" back later.

3. **Story IDs were truncated.** The catalog uses `US<NN>-EP<NN>-<Module>-<Action>`; the
   draft cited `US02-EP03-CLM` without the action segment. Corrected to full IDs, each
   verified present in the catalog.

### Iteration 2 — corrected

4. **A missing capability.** `US03-EP03-CLM-AddOrUpdateClientProfile` requires *editing* a
   client. The draft's matrix had "Create / deactivate" and no update row at all, so an
   imported story had no capability behind it. Added as row 27.

5. **Principle V's access clause was unmet.** Principle V requires recording every
   *access* to cases, not only modification. The draft audited mutations only. Added
   FR-023, channel-gated to interactive reads following the gate `001` already applies to
   its own log reads, with the list-read exemption stated as a named reading of Principle
   V rather than left silent.

6. **An inherited obligation was dropped.** `004/plan.md` Open Item 3 states that if the
   404 mapping is taken, `004/FR-017` and `004`'s US5 scenario 3 must be amended **in the
   same PR**. The draft adopted 404 without carrying the amendment. Added to FR-017,
   Decision 4, and the Approval Checklist.

### Iteration 3 — corrected

7. **An approval-checklist item was already satisfiable and was left open.** The draft
   asked to confirm the `assigned` resolver contract against `004`'s shipped port. Checked
   directly: the port is keyed by scope kind, exposes a documented registration seam, and
   its request object already carries the resolved principal — so Decision 2's `MP`/`SA`
   exemption needs no change to `004`. Marked confirmed with the reasoning recorded.

8. **A conflict with the authoritative catalog, unresolvable without a human.** The
   catalog lists `US03-EP03-CLM-AddOrUpdateClientProfile` as a **`PL`** story; the draft's
   matrix denies `PL` client writes. Principle I makes the catalog authoritative;
   Principle IV says deny by default. Raised as **Q1**.

### Iteration 4 — Q1 resolved (2026-08-27)

`PL` holds matrix rows 26 (create) and 27 (update), and does **not** hold row 28
(deactivate). The catalog story covers intake — adding a client and correcting the record
— while deactivation withdraws a client from future case creation, which is a decision
about engagements rather than data hygiene. This is the narrowest widening that satisfies
Principle I, and it requires no catalog amendment for that row. Spec updated: matrix rows
26–27, a new US1 acceptance scenario 7 asserting the split, the US1 lead paragraph and
independent test, a matrix note recording the reasoning, and the Catalog Amendments table
(the Q1 row removed, since no amendment is needed).

### Iteration 5 — clarification session (2026-08-27), run after plan and tasks

`/speckit-clarify` normally precedes `/speckit-plan`; this session ran after both, so each
answer required propagation into `plan.md`, `research.md`, `data-model.md`, all three
contracts, `quickstart.md` and `tasks.md` rather than into the spec alone. All five gaps
were **Partial** or **Missing** categories, none was a re-litigation of a settled decision.

| # | Gap | Resolution | Spec artifacts added |
|---|---|---|---|
| 1 | `US02-EP03-CLM-SearchAndFilterClients` claimed in the Stories header with no requirement, scenario or route behind it — a Principle I traceability defect | Client search ships here: case-insensitive name substring plus a status filter, applied before the page boundary | FR-002a, US1 scenarios 8–9, SC-007a |
| 2 | Nothing said what a case team read returns for a member whose firm membership was revoked; as designed it listed them as still on the matter | Revocation closes the member's live assignments in the same transaction | FR-012a, US3 scenario 7a, SC-008a |
| 3 | The Key Entities line promised a closing date with no rule for setting it; the design had to invent one and flagged it as a narrowing | Each case-status catalog entry carries a firm-settable "ends a matter" indication; the date is derived, never supplied | FR-008a, US2 scenarios 8–9, SC-008b |
| 4 | Concurrent edits — the taxonomy's "conflict resolution" category was **Missing** entirely | Last-write-wins, accepted deliberately, with FR-022's previous/new values as the detection mechanism | Assumptions, Edge Cases |
| 5 | Deactivation had no inverse; a mis-click permanently barred a party, and merging duplicates is out of scope | Restoration under the same capability that withdraws — no new matrix row | FR-004a, US1 scenario 5a, SC-007b |

**Checklist impact: 21/21 → 21/21.** No item changed state. Gap 3's resolution was checked
specifically against "No implementation details" — FR-008a and Key Entities describe the
firm-settable indication in behavioural terms, and the `is_closing` column name appears
only in `data-model.md` and the contracts, where it belongs.

**Spec growth:** 26 → 30 functional requirements, 14 → 18 success criteria. Capability
matrix unchanged at 11 rows: the two new routes reuse rows 28 and 35. Audit vocabulary
grew 10 → 12. Task count grew 64 → 72.

## Notes

- **All checklist items pass.** No `[NEEDS CLARIFICATION]` markers remain.
- Four decisions carry recommendations and await sign-off. They are not
  `[NEEDS CLARIFICATION]` markers: each has a defensible default with its rationale and
  its cost recorded. Decision 4 in particular should be signed off by someone who can
  speak to the professional-privilege consequence, per `004/plan.md` Open Item 3's own
  stated condition.
