# Specification Quality Checklist: The Firm's Documents

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-25
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
      — *Qualified.* The spec names `GET /tenant/documents`, `ILIKE`, and specific files. That is
      required here rather than leaked: four of the eight decisions are about *where* behaviour
      goes (a flat route in a codebase whose own comment forbids flat document routes; a predicate
      in a query rather than in the interceptor), and none can be stated without naming the
      mechanism. The nine-finding table exists precisely to argue from code.
- [x] Focused on user value and business needs — "where is the dictamen?" is the whole slice
- [x] Written for non-technical stakeholders — *Why this slice matters* asks three questions a
      lawyer would ask and shows the product cannot answer any of them
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain — zero; eight numbered Decisions instead
- [x] Requirements are testable and unambiguous — 17 FRs, each with at least one scenario or SC
- [x] Success criteria are measurable — SC-001…SC-008, including two (SC-003, SC-005) that are
      assertions a test can run rather than judgements
- [x] Success criteria are technology-agnostic — *Qualified*: SC-006 and SC-008 name modules and
      test files, because "no second implementation" and "the matrix stays consistent" are claims
      about code structure and cannot be observed from outside it
- [x] All acceptance scenarios are defined — 6 + 5 + 5 + 5 across four stories
- [x] Edge cases are identified — seven, including one that uncovered a latent defect (`%` and
      `_` unescaped in the two existing searches)
- [x] Scope is clearly bounded — six Out of Scope entries, two of them recording debt this slice
      deliberately does not spread
- [x] Dependencies and assumptions identified — five dependencies, four assumptions

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows — find, narrow, read, upload
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification — see the two qualifications above

## Constitution-specific gates

- [x] **Principle I** — `US15-EP04-DOC-LinkDocumentsToCaseFile` and
      `US05-EP04-DOC-SearchDocumentsByKeyword`; US05 promoted IT2 → MVP in this slice's PR, and
      US15's phrasing annotated rather than silently reinterpreted
- [x] **Principle II** — no new table and no new policy. The one risk is a *quantitative* leak
      rather than a row leak: a count computed without the assignment predicate would tell an `AA`
      how many documents the firm holds. FR-005, FR-007 and SC-003 exist for that, and the spec
      states it twice on purpose
- [x] **Principle III** — nothing firm-specific; categories and matters stay per-tenant data
- [x] **Principle IV** — one new capability declared with its full row, rows 36–43 reproduced
      unchanged, and `BM`'s absence from the nav corrected to match the matrix (finding #7)
- [x] **Principle V** — Decision 6 argues the list is not an access and records why `021`/FR-002
      (a single-resource `case.read`) is not a counter-precedent
- [x] **Principle VI** — the client's name is deliberately **not** returned by the list, on
      minimisation grounds, even though the join makes it free
- [x] No migration, no audit action, no dependency — stated as FR-017 so the plan cannot quietly
      add one

## Notes

- Decision 2 is the one most worth a reviewer's attention: it declines full-text search in a
  codebase whose constitution mentions it by name. The spec argues it on three grounds and records
  exactly what content search would additionally require, so the decision can be reversed on
  evidence rather than re-litigated on principle.
- The `%`/`_` escaping requirement (FR-008) is a defect found in `006`'s and `018`'s existing
  searches while writing this spec. This slice does not inherit it and does not fix it elsewhere —
  recorded in Edge Cases so it is not lost.
