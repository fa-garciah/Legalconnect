# Implementation Plan: The Case Register

**Branch**: `019-frontend-cases` | **Date**: 2026-08-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/019-frontend-cases/spec.md`

---

## Summary

Build the *Expedientes* screen — the first surface for `006`'s case API — and extend that
API's list endpoint with the three filters the design requires.

Four stories, in priority order: see the register (P1), open one case and its team (P2),
record a new matter (P3), change a case's status (P4). Stories 3 and 4 are droppable without
touching 1 and 2.

**The technical shape is almost entirely frontend.** The one backend change is three query
parameters on `GET /tenant/cases` and three predicates in the query behind it. That query is
already written in exactly the form the change needs — a `conditions: SQL[]` array joined
with `AND` inside the `WHERE`, before `LIMIT` — and `006`'s own client list already does the
same thing with the same helpers. The change is a copy of a tested pattern eight files away.

**And it is still the riskiest thing here**, because the array it appends to already holds
the predicate that bounds the result set by assignment. A filter written as anything other
than a further `AND` inside that same `WHERE` does not produce a filtering bug — it produces
a scope-isolation failure, an associate reading a matter they are not on. Research D1 fixes
the shape; research D7 gives it a test that fails if the shape is ever broken.

---

## Technical Context

**Language/Version**: TypeScript 5.9. Backend Node 22 / NestJS 11; frontend Next.js 16 App
Router, React 19.2.

**Primary Dependencies**: Backend — Drizzle 0.44, `pg`. Frontend — TanStack Query 5,
`react-hook-form` + `zod` 4, the vendored component library and theme `018` established,
`lucide-react`.

**Storage**: PostgreSQL 16 with Row-Level Security. **No schema change in this slice** — no
table, no column, no migration. The tables read are `case_file`, `case_assignment`, `client`,
`case_status`, `matter_type` and `venue`, all shipped by `006`.

**Testing**: Backend — Vitest with Testcontainers against a real PostgreSQL, so RLS is
exercised rather than mocked. Frontend — Vitest + Testing Library for unit and component
tiers, Playwright for end-to-end at desktop and mobile viewports.

**Target Platform**: Modern browsers, desktop and mobile viewports. Server on Linux.

**Project Type**: Web application — an existing `backend/` and `frontend/` in one repository.

**Performance Goals**: A register page renders within `016a`'s existing loading thresholds.
Typing in the search box settles into **one** request, not one per keystroke. Listing fifty
cases costs **one** request to the case list plus at most three catalog reads, and **zero**
per row.

**Constraints**:
- Listing cases MUST write zero audit entries; opening one MUST write exactly one.
- No client-side filtering, sorting or re-paging of a response (`018/FR-003`).
- No colour literal in any new file (`018`'s design-system rule).
- No horizontal scrolling of the page body at either viewport.

**Scale/Scope**: One new route with a detail panel and two dialogs; roughly six new frontend
modules and three new frontend test files; one backend controller signature, one repository
method and one contract document amended.

---

## Constitution Check

*GATE: must pass before Phase 0. Re-checked after Phase 1 — see the bottom of this file.*

| # | Principle | Status | Why |
|---|---|---|---|
| I | Spec-First Delivery | ⚠️ **ACTION** | The spec exists and is clarified. The catalog amendment is outstanding and MUST land before any PR: this slice claims `US03-EP02-CSM` (the register), `US02` (filtering), `US04` (case details), `US07` (status) and `US08` (case team), and shares `US01` (create) with `006`. Task T001 does it, and nothing else starts until it has. |
| II | Tenant Isolation is Absolute | ⚠️ **THE RISK** | This slice adds a predicate to the one query in the product whose result set is bounded by *assignment* as well as tenant. RLS still scopes both sides of the sub-select, so a filter cannot cross a tenant boundary — but it can cross an **assignment** boundary within a tenant if written as an `OR`, or as a replacement for the `EXISTS` rather than an addition to it. Constitution's "non-negotiable critical coverage" names tenant isolation explicitly; research D1 and D7 are the response. |
| III | Product Core vs Tenant Customization | ✅ PASS | Statuses, matter types and venues are per-tenant catalogs. This slice **reads** them and never infers meaning from their names — Q3's resolution exists precisely to keep that true. The one semantic the product may rely on, `isClosing`, is the firm's own declaration. |
| IV | Least Privilege by Default | ✅ PASS | **No capability is declared.** The permission surface is a mirror of `006`'s rows 29-34, checked against the spec by the sync test `018` already ships. Three query parameters add no authority: a filter narrows the caller's own register (FR-033). |
| V | Auditable by Construction | ⚠️ **ACTION** | `006` audits the single-case read and deliberately does not audit the list. This slice must not change either. The design pressure is real — an Abogado column or a hover preview would have made the register audited fifty times over — and Q2's resolution removes that pressure. FR-011 and SC-005 hold the line, and research D4 states the prohibition the implementation must respect. |
| VI | Compliance-by-Design | ✅ PASS | A case is matter *content*, which is where Principle VI draws its line — `BM` holds nothing on rows 29-33 and this screen offers them nothing. No new personal data is collected or displayed; no case content is logged. |

### Testing discipline

**No exemption is claimed.** Every line this slice writes is its own — the vendored
components `018` claimed exemption 2 for are consumed here, not modified. The backend change
is a query predicate with behaviour, not configuration, so exemption 1 does not reach it
either.

`tasks.md` orders every test before its implementation, and the isolation test of research
D7 is written and observed to fail before the filter predicate exists.

---

## Project Structure

### Documentation (this feature)

```text
specs/019-frontend-cases/
├── plan.md              # This file
├── research.md          # Phase 0 — the seven decisions
├── data-model.md        # Phase 1 — wire shapes, view model, control map
├── quickstart.md        # Phase 1 — the validation guide
├── contracts/
│   ├── case-screens.md      # What the four screens do
│   └── case-list-filters.md # The amendment to 006's list endpoint
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 — NOT created by /speckit-plan
```

### Source Code (repository root)

```text
backend/src/modules/case-core/
├── case.controller.ts        # MODIFIED — parse q, matterTypeId, venueId
├── case.service.ts           # MODIFIED — pass them through
└── case.repository.ts        # MODIFIED — three predicates in the existing conditions array

backend/tests/
├── contract/case-list-filters.test.ts       # NEW — the filters behave as documented
└── integration/case-filter-scoping.test.ts  # NEW — research D7, the isolation test

frontend/src/
├── cases/
│   ├── types.ts              # NEW — wire shapes, transcribed from the contract
│   ├── api.ts                # NEW — the five calls, all through apiFetch
│   └── schema.ts             # NEW — the create form's validation
└── app/expedientes/
    ├── page.tsx              # NEW — the route
    ├── CaseRegister.tsx      # NEW — filters, table, paging, states
    ├── CaseFilters.tsx       # NEW — search + two catalog selects
    ├── CaseRow.tsx           # NEW — one row, its badge and its actions
    ├── CaseDetailPanel.tsx   # NEW — the opened case and its team
    └── CaseFormDialog.tsx    # NEW — record a new matter

frontend/tests/
├── unit/case-api.test.ts
├── unit/case-schema.test.ts
├── component/expedientes/CaseRegister.test.tsx
├── component/expedientes/CaseDetailPanel.test.tsx
├── component/expedientes/CaseFormDialog.test.tsx
├── component/expedientes/control-visibility.test.tsx
└── e2e/case-register.spec.ts
```

**Structure Decision**: the existing two-project layout. The frontend does not import from
`backend/`; wire shapes are transcribed by hand from the contract, which is the discipline
`018` established and the reason its client types survived first contact with a real
response.

---

## Complexity Tracking

*No constitution violation requires justification.* One item is recorded because it is a
deliberate departure from how the previous frontend slice was scoped, not because it breaches
a principle:

| Item | Why it is here | Why the simpler alternative was rejected |
|---|---|---|
| This slice modifies a shipped contract | Q1. A case register without search stops being usable at a few hundred matters, so shipping the list alone would deliver a screen already needing its successor | Deferring the filters to a later slice was defensible — the catalog phases them as IT2 — but it splits one query change across two slices and leaves the screen visibly incomplete in the meantime |

---

## Constitution Re-Check *(after Phase 1 design)*

Re-evaluated against `research.md`, `data-model.md` and the two contracts.

| # | Principle | Status after design |
|---|---|---|
| I | Spec-First | ⚠️ unchanged — the catalog amendment is task T001 and gates everything |
| II | Tenant Isolation | ✅ **resolved by design.** D1 fixes the filters as three further entries in the same `conditions` array, ANDed inside the same `WHERE`, before the same `LIMIT`. D7 gives that shape a test that seeds a matter an associate is not on and asserts no filter value reaches it. The test is written first |
| III | Core vs Customization | ✅ unchanged. D2 derives the badge from `isClosing` and from nothing else |
| IV | Least Privilege | ✅ unchanged. No capability; the mirror gains no row |
| V | Auditable | ✅ **resolved by design.** D4 states the prohibition — no per-row fetch, no prefetch on hover, no refetch of an opened case on window focus — and D3 pins the query options that make one open equal one entry |
| VI | Compliance | ✅ unchanged |

**No principle is violated by this plan.** The one risk that mattered has a named shape and a
named test, and both precede the code.

---

## What this plan deliberately does not do

- **No schema change.** If a requirement here seems to need one, it has been misread.
- **No new capability, no new scope kind, no new refusal shape, no new audit action.**
- **No change to `016a`'s feedback primitives or refusal classifier.** `018` established that
  a screen's route-specific behaviour lives in the screen; this slice has two such cases —
  the `409` on a duplicate file number and the `422` on an unavailable client — and both are
  handled in the form, not in the classifier.
- **No sorting.** It carries the same server-side constraint the filters did and was not
  asked for.
