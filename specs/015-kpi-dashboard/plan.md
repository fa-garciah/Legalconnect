# Implementation Plan: The Firm's KPIs

**Branch**: `015-kpi-dashboard` (on `023-firm-documents`) | **Date**: 2026-09-25 | **Spec**: [spec.md](./spec.md)

## Summary

One migration, one new module, one new page. `0047` adds a four-value `outcome` to `case_file`
and the `case.outcome_declared` audit action. `GET /tenant/kpis` computes active matters, average
resolution time, success rate, load per attorney, success rate by matter type and a six-quarter
trend — each with the sample size it came from. `/kpis` renders them as tiles and charts, each
chart with an equivalent table.

Revenue and the *Financiero* tab are **not built**: nothing in the schema can produce them
(spec Decision 2). `022`'s demo seed is amended to declare outcomes, closing the forward
dependency `022` recorded.

## Technical Context

| | |
|---|---|
| Backend | NestJS 11, raw `sql` template aggregates through `currentTx()`, PostgreSQL 16 under RLS |
| Frontend | Next.js 16, React Query 5, **`recharts@^3.10.1` already installed**, `components/ui/chart.tsx` already wrapping it |
| Migration | **`0047_case_outcome.sql`** — the next number after `0046`, inside the `0040–0059` range reserved for this lane |
| Testing | Vitest (backend contract, frontend unit/component), Playwright e2e against `022`'s demo firm |
| New dependencies | **None** — `no-new-dependency.test.ts` holds an exact baseline |

## Constitution Check

| Principle | How this slice meets it |
|---|---|
| I — spec → plan → tasks, story IDs | This document; `US01`–`US04-EP06-KPI`, three promoted in this PR |
| II — tenant isolation | No new table. `case_file` is already RLS-policied and the new column rides that policy; the aggregate queries name no `tenant_id`, as every other repository does. The subtler risk is an aggregate *summarising* rows a caller cannot read — answered by Decision 4's grant rather than by a scoped variant |
| III — firm-agnostic | The four outcome values are fixed and argued (Decision 1); status, matter type and venue remain per-tenant catalogs, untouched |
| IV — deny by default | One capability, `kpi.read`, `tenant` scope, MP/CM/SA. `BM` refused with reasoning. The outcome route reuses `case.change_status` rather than inventing a permission that could be granted apart from it |
| V — audit | `case.outcome_declared` on the mutation, in `0047`'s re-issued `CHECK`. The read is unaudited on the `calendar.read` precedent |
| VI — minimisation | The workload chart carries membership ids and display labels, never identities or emails; no personal data enters an aggregate |
| `020` tokens | Chart colours become tokens with a recorded contrast table; zero literals |
| TDD | Every task below is test-first, including the migration, which gets a contract test before it is written |

## The migration — `0047_case_outcome.sql`

```sql
CREATE TYPE case_outcome AS ENUM ('favorable', 'desfavorable', 'convenio', 'sin_resolucion');

ALTER TABLE case_file ADD COLUMN outcome case_outcome;

-- An outcome is a statement about how a matter ENDED, so it may exist only on one that has.
-- Without this the column would drift into a second, informal status.
ALTER TABLE case_file ADD CONSTRAINT case_file_outcome_requires_closed
  CHECK (outcome IS NULL OR closed_on IS NOT NULL);
```

Plus the `audit_event_action_known` `CHECK`, dropped and re-created **in full** with
`case.outcome_declared` added — the shape `0046` uses, because that constraint enumerates every
action across every slice and cannot be extended in place.

`lc_app` already holds `UPDATE` on `case_file`; no grant changes.

**What the migration deliberately does not do**: backfill. Every existing closed matter keeps
`outcome IS NULL`, which is the honest state — "not declared" is not *Sin resolución* (spec
Decision 1), and inventing outcomes for a firm's history is the one thing this slice must not do.

## Backend

```text
backend/src/modules/
├── case-core/
│   ├── case.controller.ts        # + PATCH /tenant/cases/:caseId/outcome
│   ├── case.service.ts           # + declareOutcome(): closed-only, validated
│   └── case.repository.ts        # + updateOutcome()
└── kpi/                          # NEW — the shape calendar/ established
    ├── kpi.module.ts
    ├── kpi.controller.ts         # GET /tenant/kpis, @Capability('kpi.read'), no @Audited
    ├── kpi.service.ts            # period arithmetic, the FR-009 floor, delta rules
    ├── kpi.repository.ts         # the aggregate SQL
    └── period.ts                 # month/quarter/year windows in America/Mexico_City
```

**Why a new module rather than more of `case-core`**: `case-core` owns a domain and its CRUD;
this is a read model over it, with its own capability and its own period arithmetic. `013`'s
`calendar/` is the precedent for a small module with one controller, one service, one repository
and a validation file.

**The aggregates**, all derived from `case_file` joined to `case_status` (for `is_closing`),
`case_assignment` (for the lead) and `matter_type`:

| Figure | How |
|---|---|
| Active matters | `count(*) WHERE NOT cs.is_closing` |
| Average resolution | `avg(closed_on − opened_on)` over matters closed **in the period**, expressed in months, with the count |
| Success rate | `count(outcome IN ('favorable','convenio')) / count(outcome IS NOT NULL)` over matters closed in the period, **null below five** |
| Per attorney | `count(*)` grouped by the live `lead` assignment's membership, plus a `null` group for matters with none |
| By matter type | success rate grouped by `matter_type_id`, plus a `null` group |
| Quarterly trend | average resolution per quarter for six quarters, `null` for a quarter with nothing closed |

*Convenio counts as a success.* A negotiated settlement is a matter resolved in the client's
interest, and a firm that settles well would otherwise show a falling success rate. Stated here
because it is a judgement, and it is one line to change.

## Frontend

```text
frontend/src/
├── app/globals.css               # + --chart-1, --chart-2, --chart-positive (Decision 5, amended)
├── kpi/
│   ├── api.ts                    # listKpis(period)
│   └── format.ts                 # months, percentages, signed deltas, "Sin datos"
└── app/kpis/
    ├── page.tsx                  # server: resolve archetype, as /clientes does
    ├── KpiDashboard.tsx          # period selector + tiles + tabs
    ├── StatTile.tsx              # one figure, its delta, its sample size
    ├── WorkloadChart.tsx         # horizontal bars + table
    ├── SuccessByTypeChart.tsx    # vertical bars + table
    ├── ResolutionTrendChart.tsx  # line + table
    └── ChartTable.tsx            # the shared accessible table (FR-011)
```

Composition follows `019`/`023`: `<section aria-labelledby>`, heading row, `QueryBoundary`,
Spanish copy, tokens only.

**`ChartTable` is one component, not three.** Every chart owes the same thing — the same numbers,
reachable without seeing the chart — and three copies is three chances for one to drift or be
forgotten.

## Risks

- **A fabricated number is the failure mode.** Every other risk here is cosmetic; this one
  destroys the screen's purpose. Mitigations: SC-002 recomputes every figure independently in
  SQL; FR-008 forbids `0` for missing; FR-009 refuses a thin success rate; FR-010 forbids a delta
  against nothing.
- **`avg` over an empty set is `NULL`, not `0`** — which is correct and must survive the whole
  way to the screen rather than being coalesced in a presenter. A `?? 0` anywhere on this path is
  a defect.
- **Quarter boundaries.** Computed in `America/Mexico_City` (`013`'s precedent). A UTC boundary
  puts matters closed in the evening of the last day of a quarter into the next one.
- **`chart.tsx` emits a `.dark` selector** in its injected `<style>`, while `020`/D1 removed the
  dark theme and `theme-tokens.test.tsx` fails if `.dark` reappears **in `globals.css`**. The
  chart's output is not that file, so the test is not tripped — but the emitted rules are dead.
  Noted, not fixed: editing a vendored component is `020`/D2's scoped decision, not this slice's.
- **Charts in jsdom.** `recharts` needs a size to render; `ui-smoke.test.tsx` already mounts the
  chart primitives, so the pattern exists — component tests assert the **table**, which is the
  accessible contract, and the chart's presence, not its pixels.
- **Touching `022`'s seed** (FR-018) puts a shipped command in this diff. It is additive — one
  column on rows it already writes — and `022`'s own idempotency test is the regression check.
