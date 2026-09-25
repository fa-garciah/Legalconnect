# Specification Quality Checklist: The Firm's KPIs

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-25
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
      — *Qualified.* The spec names a column, a migration number, `recharts` and specific files.
      That is the substance here rather than a leak: the central finding is that **half the
      mockup cannot be computed from anything this product stores**, and that claim is only
      checkable against the schema. Decision 1 adds a column; a spec that declined to say so
      would be hiding its own largest change.
- [x] Focused on user value and business needs — "how are we doing?" is the question, and the
      spec is mostly about which parts of it can be answered honestly
- [x] Written for non-technical stakeholders — the *Why this slice matters* table is a
      two-column yes/no a partner can read
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain — zero; nine numbered Decisions instead
- [x] Requirements are testable and unambiguous — 18 FRs; the numeric ones (a floor of five, six
      quarters, four outcome values) are stated as numbers rather than adjectives
- [x] Success criteria are measurable — SC-002 in particular is falsifiable: every figure must be
      reproducible by an independent SQL computation
- [x] Success criteria are technology-agnostic — *Qualified*: SC-007 and SC-008 name a grep,
      because "no invented numbers" and "no colour literals" are properties of the source
- [x] All acceptance scenarios are defined — 6 + 3 + 5 + 3 across four stories
- [x] Edge cases are identified — seven, including two that change the arithmetic (a matter
      closed the day it opened; imported data with `closed_on` before `opened_on`)
- [x] Scope is clearly bounded — seven Out of Scope entries, two of them whole tabs of the mockup
- [x] Dependencies and assumptions identified — five dependencies, four assumptions

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows — read the figures, read the workload, declare an
      outcome, read the trend
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification — see the qualification above

## Constitution-specific gates

- [x] **Principle I** — `US01-EP06` plus `US02`/`US03`/`US04` promoted to MVP in this PR, and
      `US01`'s own row corrected: it promised revenue the product cannot produce
- [x] **Principle II** — no new table; the one new column is on an already tenant-scoped, RLS-
      policied table, and the aggregate endpoint adds no application-side `tenant_id` filter.
      The narrower risk is that an aggregate is a *summary* of rows a caller may not read
      individually — resolved by Decision 4 granting it only to the three archetypes that
      already see every matter, rather than by a scoped variant that would mean nothing
- [x] **Principle III** — the four outcome values are fixed rather than a per-tenant catalog, and
      Decision 1 argues why that is not a firm-specific opinion: they are the categories a
      success rate is *defined over*, not a firm's vocabulary
- [x] **Principle IV** — one new capability with its full row; the reused `case.change_status`
      reproduced unchanged; `BM` refused, with the reasoning written out and a named trigger for
      revisiting it
- [x] **Principle V** — the mutation (`case.outcome_declared`) is audited and needs the migration
      to say so; the read is not, on the `calendar.read` precedent (Decision 6)
- [x] **Principle VI** — minimisation is the substance of Decision 4, and no personal data enters
      the aggregates: the workload chart names memberships, never identities
- [x] **`020` token contract** — Decision 5 adds chart tokens rather than literals, with contrast
      measured and recorded as `020` established

## Notes

- The decision most worth a reviewer's attention is **Decision 2**: it deletes the most prominent
  tile of the mockup and a whole tab. The alternative was a fabricated number on the one screen
  whose entire purpose is to be trusted.
- **Decision 4** was explicitly delegated ("decide on BM under Principle VI"). It is decided —
  `BM` is refused — with the reasoning stated and the condition for reopening it named, so the
  decision can be reversed on evidence rather than re-argued from scratch.
- **Decision 8's floor of five** is a judgement, labelled as one, expressed as a single constant.
