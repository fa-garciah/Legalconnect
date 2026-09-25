# Feature Specification: The Firm's KPIs

**Feature Branch**: `015-kpi-dashboard` (stacked on `023-firm-documents`)
**Created**: 2026-09-25
**Status**: Decided — nine decisions taken by Claude 2026-09-25, pending ratification by Jero
**Input**: `/kpis` has been in the navigation, marked unavailable, since `016a`. The mockup shows
four tiles and four charts. Half of what it shows cannot be computed from anything this product
stores, and the honest slice is the one that says which half.

> **Citation convention.** Requirements of slices 004, 006, 013, 016a, 019, 020, 022 and 023 are
> cited as `006/FR-0NN` etc. Bare `FR-0NN` refers to this document. Code is cited as `path:line`,
> read on 2026-09-25 at the commit this branch starts from.
>
> **Authorship.** Written by Claude (Opus 5) on 2026-09-25, end to end. Every open point is
> resolved as a numbered Decision; each is marked *"Decided by Claude 2026-09-25 — pending
> ratification by Jero"*. Nothing here is approved.

---

## Why this slice matters, and where it has to stop

A managing partner's first question about their own firm is *how are we doing?* — and today the
product cannot answer any part of it. `/kpis` renders as inert text in the navigation.

The mockup this slice is built against shows four stat tiles — **Asuntos Activos**, **Tiempo
Promedio de Resolución**, **Tasa de Éxito**, **Ingresos** — and tabs for *Rendimiento*, *Asuntos*
and *Financiero*. Checked against the schema, they divide cleanly in two:

| Shown in the mockup | Can it be computed? |
|---|---|
| Active matters | **Yes** — `case_file` joined to `case_status.is_closing` |
| Average resolution time | **Yes** — `closed_on − opened_on`, both real columns |
| Matters per attorney | **Yes** — `case_assignment` where `role_on_case = 'lead'` |
| Quarterly resolution trend | **Yes** — `opened_on` / `closed_on` grouped by quarter |
| **Success rate** | **No.** Nothing in this product records how a matter ended → **Decision 1** |
| **Success rate by matter type** | **No**, for the same reason |
| **Revenue, and the whole Financiero tab** | **No, and not fixably here.** There is no invoice, no payment and no time entry anywhere in the schema; `010-billing-core` does not exist → **Decision 2** |

So this slice does three things: it computes what the data supports, it **adds the one column**
that makes success rate real rather than invented, and it **removes** from the screen what cannot
be honest. A dashboard that shows a made-up number is worse than one that shows fewer.

---

## What the code actually does, checked against the code rather than the mockup

`case.repository.ts`, `case.service.ts`, `0023_case_core.sql`, `0024_case_core_catalogs.sql`,
`schema.ts`, `calendar.*` (as the newest module's shape), `frontend/package.json`,
`src/components/ui/chart.tsx`, `globals.css` and `navigation-items.ts` were read before this spec
was written. Ten findings shape it.

| # | What the mockup assumes | What the code does | Consequence |
|---|---|---|---|
| 1 | A matter records how it ended | **It does not.** `case_file` has `opened_on` and `closed_on` and no outcome of any kind (`0023_case_core.sql:58-77`) | Success rate is uncomputable without a schema change → **Decision 1**, migration `0047` |
| 2 | "Closed" is a property of the matter | It is a property of the firm's **own catalog**: `closed_on` is stamped only when the target `case_status.is_closing` is true (`case.service.ts:226`, `case.repository.ts:252-256`), and a tenant may mark several statuses closing or none (`0024:20-24`) | Every aggregate must read `is_closing`, never a status *name* → **FR-003** |
| 3 | A matter has a responsible attorney | **There is no such column.** The lead is a row: `case_assignment` with `role_on_case = 'lead'` and `unassigned_at IS NULL` (`0023:91-105`) | "Matters per attorney" is a join, and a matter with no live lead belongs to nobody → **FR-006** |
| 4 | Every matter has a type | `matter_type_id` is **nullable** (`schema.ts:401`) | A by-type chart must account for untyped matters instead of silently dropping them → **FR-007** |
| 5 | Revenue is somewhere | **Nowhere.** No invoice, payment, quote or time-entry table exists in any of the 46 migrations; the only matches for "billing" in the whole schema are two comments explaining that `rfc` is nullable | Revenue and the Financiero tab are not deferred features, they are unbacked → **Decision 2** |
| 6 | Charts need a charting library | `recharts@^3.10.1` is **already installed** and `src/components/ui/chart.tsx` wraps it (`ChartContainer`, `ChartTooltip`, `ChartLegend`), imported and working | No new dependency → **FR-014** |
| 7 | Chart colours come from the design system | **`globals.css` defines no chart token at all** — no `--chart-1…5`, no categorical scale | Without new tokens a chart needs colour literals, which `020`/FR-009 forbids and a test greps for → **Decision 5** |
| 8 | A read endpoint is audited like the rest | The newest read route, `GET /tenant/calendar/events`, carries `@Capability` and **no** `@Audited` (`calendar.controller.ts:22-26`) | An aggregate read follows that precedent → **Decision 6** |
| 9 | The nav entry is consistent with the matrix | `kpis` carries `requiredArchetypes: INTERNAL`, which includes `BM` — and `available: false` (`navigation-items.ts:128`) | The same latent defect `023` just corrected for `documentos`; switching it on requires narrowing it → **FR-013** |
| 10 | Adding an audit action is a code change | It is a **migration**: `audit_event_action_known` is a `CHECK` constraint re-issued in full by each slice that extends it (`0046_calendar_event.sql:82-157`) | Declaring an outcome is an audited mutation, so `0047` carries the action list too → **FR-004** |

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — A partner sees how the firm is doing (Priority: P1) 🎯 MVP

A managing partner opens `/kpis` and sees, for the current quarter, how many matters are active,
how long matters are taking to resolve, and how that compares with the quarter before.

**Catalog**: `US01-EP06-KPI-ViewOverallKPIs` (MVP).

**Why this priority**: it is the screen. Everything else is a cut of the same data.

**Independent Test**: as the demo firm's `MP`, open `/kpis`, see four figures with a delta on each
computable one, and change the period to see them all change.

**Acceptance Scenarios**:

1. **Given** an `MP`, `CM` or `SA`, **When** they open `/kpis`, **Then** they see active matters,
   average resolution time and success rate for the selected period.
2. **Given** the period selector, **When** month, quarter or year is chosen, **Then** every figure
   and every chart recomputes for that window, and the choice is reflected in the page.
3. **Given** a previous period with data, **Then** each tile shows the change against it, signed
   and rendered as a difference a person can read ("+5.2%", "−0.5 m").
4. **Given** a previous period with **no** data, **Then** the tile shows the figure and **no**
   delta — never "+100%" or "∞" (**FR-010**).
5. **Given** an `AA`, `PL` or `BM`, **Then** `/kpis` is not in their navigation and the endpoint
   refuses them (**FR-011**, Decision 4).
6. **Given** a firm with no matters at all, **Then** every tile reads "Sin datos" rather than 0,
   and no chart renders an empty axis.

---

### User Story 2 — Workload across the firm (Priority: P2)

A case manager looks at how matters are distributed between the attorneys.

**Catalog**: `US02-EP06-KPI-MonitorWorkloadDistribution` — **promoted IT2 → MVP** in this PR.

**Acceptance Scenarios**:

1. **Given** the *Rendimiento* tab, **Then** a horizontal bar per attorney shows how many active
   matters they lead, longest bar first.
2. **Given** a matter with no live `lead` assignment, **Then** it is counted in a named
   "Sin responsable" row rather than dropped (**FR-006**) — because a matter nobody leads is the
   thing a case manager most needs to see.
3. **Given** the chart, **Then** an equivalent data table carries the same numbers for anyone not
   reading the chart (**FR-012**).

---

### User Story 3 — Outcomes, once the firm records them (Priority: P3)

A partner closes a matter, declares how it ended, and the success rate becomes real.

**Catalog**: `US03-EP06-KPI-TrackSuccessRateByType` — **promoted IT3 → MVP** in this PR.

**Acceptance Scenarios**:

1. **Given** a matter moving to a closing status, **When** it closes, **Then** the person is asked
   to declare the outcome: *Favorable*, *Desfavorable*, *Convenio* or *Sin resolución*
   (**FR-002**).
2. **Given** a matter already closed without one, **When** an `MP`, `CM` or `SA` opens it, **Then**
   they can declare the outcome then — otherwise `022`'s eleven closed matters, and every matter
   any firm closed before this slice, could never have one (**FR-002a**).
3. **Given** fewer than five closed matters with a declared outcome in the period, **Then** the
   success-rate tile reads "Datos insuficientes" and names how many are undeclared, rather than
   printing a percentage computed from two matters (**FR-009**).
4. **Given** declared outcomes, **Then** the *Asuntos* tab shows success rate by matter type, with
   untyped matters grouped as "Sin tipo" (**FR-007**).
5. **Given** an outcome is declared, **Then** it is audited as `case.outcome_declared` (**FR-004**).

---

### User Story 4 — Resolution time over quarters (Priority: P4)

A case manager sees whether matters are resolving faster than they were.

**Catalog**: `US04-EP06-KPI-AnalyzeResolutionTimeTrends` — **promoted IT3 → MVP** in this PR.

**Acceptance Scenarios**:

1. **Given** the *Rendimiento* tab, **Then** a line shows average resolution time per quarter for
   the last six quarters.
2. **Given** a quarter in which nothing closed, **Then** the line has a gap at that quarter rather
   than a zero, which would read as "resolved instantly" (**FR-008**).
3. **Given** the chart, **Then** an equivalent table carries the same numbers (**FR-012**).

---

### Edge Cases

- **A matter closed on the day it opened**: resolution time is 0 days, not null. It counts.
- **A matter whose `closed_on` precedes `opened_on`**: impossible through the product (the service
  stamps `closed_on` as today), but possible in imported data. Such a matter is excluded from the
  average and counted in a "datos inconsistentes" figure rather than dragging the mean negative.
- **A status un-marked as closing after matters closed under it**: those matters keep `closed_on`
  (`006` never clears it), so they stay closed for these aggregates. Correct: the firm's own
  history is not rewritten by a catalog edit.
- **An attorney who has left**: their `case_assignment` rows carry `unassigned_at`, so they drop
  out of the workload chart. A matter that loses its only lead becomes "Sin responsable".
- **A period with one matter**: every average is that matter. FR-009's floor applies to the
  success rate only; a resolution-time average over one matter is reported with its own count so
  the reader can judge it.
- **Two matters closed in different quarters of the same month range**: the quarter buckets are
  computed in `America/Mexico_City`, as `013` does for its own day boundaries.
- **The firm has 40 matters and 25 clients** (`022`'s demo firm): every chart has real shape.
  That is the data this slice is judged against.

---

## Requirements *(mandatory)*

### Functional Requirements

**The data model**

- **FR-001**: `case_file` gains a nullable `outcome` column constrained to
  `favorable | desfavorable | convenio | sin_resolucion`, plus a constraint that an outcome may
  exist only on a closed matter. Migration `0047`.
- **FR-002**: An outcome is declared through `PATCH /tenant/cases/:caseId/outcome`, valid only
  when the matter is closed, under `case.change_status` (Decision 3).
- **FR-002a**: A matter closed before this slice can be given an outcome by the same route —
  the column is nullable and "not yet declared" is a real, visible state, distinct from
  *Sin resolución*, which is a declaration.
- **FR-002b**: `GET /tenant/cases/:caseId` returns the matter's `outcome` (null when undeclared),
  so a screen can show what was declared and pre-select it. Found by `/speckit-analyze`: without
  it US3 scenario 2 is unimplementable — a control cannot offer to change a value it cannot read.
- **FR-003**: Every aggregate reads "closed" from `case_status.is_closing`, never from a status
  name, and never from `closed_on` alone. Asserted against a firm whose closing status is **not**
  called `Concluido`, since every fixture uses the default name and code matching the literal
  would otherwise pass.
- **FR-002c**: The matter's own screen is where an outcome is declared — `019`'s case detail
  panel, which already owns "Cambiar estado" (`CaseDetailPanel.tsx:271`). Choosing a closing
  status prompts for the outcome, and an already-closed matter can be given one at any time.
  Found by `/speckit-analyze`: the endpoint alone leaves `US3` unreachable, which is a story that
  ships as dead code.
- **FR-004**: Declaring an outcome writes `case.outcome_declared`, added to the audit vocabulary
  in the same migration.

**The endpoint**

- **FR-005**: `GET /tenant/kpis?period=month|quarter|year` returns, for the selected period and
  the one before it: active matters, average resolution time in months, success rate, matters per
  attorney, success rate by matter type, and average resolution time per quarter for six quarters.
- **FR-006**: "Matters per attorney" counts **live `lead` assignments**; matters with no live lead
  are reported under an explicit "Sin responsable" entry, never dropped.
- **FR-007**: "By matter type" groups untyped matters under an explicit "Sin tipo" entry, never
  dropped.
- **FR-008**: A bucket with no data is reported as `null`, never as `0` — a quarter in which
  nothing closed is missing data, not instant resolution.
- **FR-009**: Success rate is reported only when at least five closed matters in the period carry
  a declared outcome; below that the response says so and names the undeclared count.
- **FR-010**: A delta is reported only when the previous period has a comparable figure; there is
  no delta against zero and no infinite percentage.
- **FR-011**: The endpoint declares a new `kpi.read` capability at `tenant` scope, granted to
  `MP`, `CM` and `SA` — and **not** to `AA`, `PL` or `BM` (Decision 4).

**The screen**

- **FR-012**: Every chart is accompanied by a table carrying the same numbers, reachable without
  seeing the chart.
- **FR-013**: `navigation-items.ts`'s `kpis` entry flips to `available: true` **and** narrows
  `requiredArchetypes` to `['MP','CM','SA']`, correcting the same `INTERNAL`-includes-`BM`
  inconsistency `023` corrected for `documentos`.
- **FR-014**: No new dependency. Charts use the installed `recharts` through the existing
  `components/ui/chart.tsx`.
- **FR-015**: Chart colours come from new design tokens in `globals.css`; no colour literal
  appears in any file this slice writes (`020`/FR-009).
- **FR-016**: The *Financiero* tab and the *Ingresos* tile are **not built** (Decision 2). The
  screen carries two tabs, *Rendimiento* and *Asuntos*.
- **FR-017**: All copy is Spanish; the new components join `spanish-copy.test.tsx`.
- **FR-018**: `022`'s demo seed is amended in this slice to declare outcomes on its closed
  matters, so the success rate has data to compute from (`022` Decision 7).

### Capability Matrix *(Principle IV — one new row)*

| # | Capability | Scope | MP | AA | PL | CM | BM | SA |
|---|---|---|---|---|---|---|---|---|
| **new** | **`kpi.read`** | **tenant** | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ |
| 30 | `case.change_status` (reused for FR-002) | assigned | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ |

`case.change_status`'s row is reproduced from `matrix.ts` unchanged; this slice adds no grant to
it. `kpi.read` is `tenant`-scoped and needs no per-row narrowing, because the three archetypes
that hold it are precisely the three that already see every matter in the firm — which is
Decision 4's whole argument.

### Key Entities

- **Case outcome** — a firm's declaration of how a matter ended. One nullable column on
  `case_file`, four values, meaningful only on a closed matter. Not a catalog: unlike status and
  matter type, these four are not a firm's vocabulary but the categories a success rate is defined
  over (Decision 1).

---

## Success Criteria *(mandatory)*

- **SC-001**: An `MP` opens `/kpis` and reads active matters, average resolution time and workload
  distribution for the current quarter without configuring anything.
- **SC-002**: Every figure on the screen is derivable from `case_file`, `case_status`,
  `case_assignment` and `matter_type` — no number is invented, estimated or hardcoded, asserted by
  a test that computes the same figures independently in SQL.
- **SC-003**: A period whose previous period is empty shows no delta, and the page renders without
  a division-by-zero artefact anywhere.
- **SC-004**: With fewer than five declared outcomes, the success-rate tile says so and names the
  undeclared count; it never prints a percentage.
- **SC-005**: An `AA`, `PL` or `BM` sees no `/kpis` navigation entry and receives a refusal from
  the endpoint.
- **SC-006**: Every chart's numbers are available as a table.
- **SC-007**: Zero colour literals in the new files; every chart colour resolves to a token.
- **SC-008**: `grep` for revenue, invoicing or billing in this slice's files returns nothing —
  the absence is deliberate and checkable.
- **SC-009**: After `npm run db:seed:demo`, the success rate on `/kpis` is computed from real
  declared outcomes rather than reading "Datos insuficientes" (FR-018).

---

## Decisions

Every decision below was taken rather than deferred. **Decided by Claude 2026-09-25 — pending
ratification by Jero.**

### Decision 1 — Success rate needs a column, and this slice adds it

**Taken**: a nullable `outcome` on `case_file`, constrained to four values
(`favorable`, `desfavorable`, `convenio`, `sin_resolucion`), declarable only on a closed matter.
**Why a column rather than a catalog**, given that `006` made status, matter type and venue all
per-tenant catalogs: those three are a firm's own *vocabulary*, and the product deliberately holds
no opinion about them. An outcome is different in kind — it is the set of categories a **success
rate** is defined over, and a firm that renamed or removed one would make the KPI meaningless
rather than firm-specific. Four fixed values keep the metric comparable and keep Principle III
intact, because nothing here is specific to any one firm.
**Why nullable**: `022`'s demo firm has eleven closed matters and any real firm adopting the
product has a history of them. A `NOT NULL` column would either be unfillable or would force a
fabricated default, and *Sin resolución* is a **declaration**, not a synonym for "we do not know".
The difference between "undeclared" and "ended without a ruling" is exactly what FR-009's floor
protects.
**Rejected**: inferring the outcome from the closing status's name (a firm that calls it
"Concluido" has said nothing about winning); a per-tenant outcome catalog (incomparable metrics,
and a firm could delete "Desfavorable"); shipping success rate as "not available" (the mockup's
most prominent tile, and the question a partner actually asks).

### Decision 2 — Revenue and the *Financiero* tab are removed, not stubbed

**Taken**: the *Ingresos* tile and the whole *Financiero* tab do not appear. Two tabs ship:
*Rendimiento* and *Asuntos*.
**Why**: there is no invoice, payment, quote or time-entry table in any of the 46 migrations, and
`010-billing-core` is unwritten — `plan-paralelo-2026-09.md` lists it as blocked on a decision
about where the payment record lives. Revenue is not "not yet wired up"; there is nothing to wire.
**Why removing beats a placeholder**: `016a` already settled the analogous question and its
reasoning is the precedent — *"a menu item that 404s is worse than one that is honestly marked as
not built."* A tile reading "$0" or "Próximamente" in the most prominent position on a dashboard
invites exactly one interpretation: the firm billed nothing.
**Rejected**: a disabled tile with a tooltip (same misreading, more code); hardcoding the
mockup's `$1.2M` (a fabricated number on a screen whose entire purpose is to be trusted).
**When it returns**: `010` builds it, and `US05-EP06-KPI-MonitorRevenueGrowth` stays IT2 for it.

### Decision 3 — Declaring the outcome is `case.change_status`, on its own route

**Taken**: `PATCH /tenant/cases/:caseId/outcome`, declaring the existing
`@Capability('case.change_status')`, valid only on a closed matter.
**Why its own route rather than a field on the status change**: `PATCH …/status` has a shipped
contract and its own tests, and an outcome must also be declarable on matters closed *before* this
slice (FR-002a) — which a field on the closing request cannot reach. One route serves both the
"close, then declare" flow and the backfill.
**Why no new capability**: closing a matter and saying how it ended are one act split across two
requests for contract-compatibility reasons. A separate `case.declare_outcome` could be granted to
somebody who cannot close a matter, which is meaningless, or withheld from somebody who can, which
leaves matters closeable but never measurable. Principle IV asks for explicit permissions, not for
a permission per endpoint.
**Rejected**: a required `outcome` on the status change (breaks a shipped contract, unreachable
for history); a nightly job inferring it (inventing data, which is this slice's one prohibition).

### Decision 4 — `kpi.read` is `MP`, `CM` and `SA` — and **not** `BM`

**Taken**: granted to `MP`, `CM`, `SA`. Refused to `AA`, `PL`, `BM`.
**Why not `AA`/`PL`**: these are firm-wide aggregates over every matter, and an associate's whole
relationship to the case register is that they see the matters they are assigned to (`006`/FR-014,
and `023` was careful that even a *count* not exceed that). A firm-wide average is a summary of
matters they may not open; there is no scoped version of "the firm's success rate" that would mean
anything.
**Why not `BM`, which the brief left to me to decide**: the tempting argument is that a billing
manager is exactly who reads a dashboard. But every figure this slice ships is about **matters** —
counts, resolution times, outcomes — and `BM` holds no case capability at all (`matrix.ts`: no
`case.read_list`, no `case.read`). Granting `kpi.read` would hand them aggregate matter data they
cannot see in detail, which is precisely what Principle VI's minimisation forbids and what
Principle IV's deny-by-default resolves against. The figures that *would* be `BM`'s — revenue,
billed hours — are the ones Decision 2 removes for want of data. **If `010` lands and the
Financiero tab returns, `BM` is the first archetype to reconsider**, and this decision should be
re-read then rather than inherited.
**Rejected**: granting all six internal archetypes (hands an `AA` the firm's aggregate); a
`self`-scoped variant showing an attorney only their own numbers (a different feature —
`US06-EP06` territory — and not what the mockup or the story asks for).

### Decision 5 — Chart colours become design tokens

**Taken**: five categorical tokens (`--chart-1` … `--chart-5`) and two semantic ones
(`--chart-positive`, `--chart-negative`) added to `globals.css`, derived from `020`'s existing
brand and warm-accent families; every chart reads them through `ChartConfig`.
**Why**: `globals.css` currently defines **no** chart colour of any kind, `chart.tsx` takes colours
from its `ChartConfig`, and `020`/FR-009 forbids a colour literal in application code — a rule a
test greps for. Without tokens the only way to draw a coloured bar is the thing the design system
prohibits.
**Why semantic ones as well as categorical**: a success-rate chart has a natural good/bad axis, and
reusing a categorical hue for "favorable" would make the palette say something it does not mean.
**Contrast is checked, not assumed**: each token is measured against the surface it is drawn on and
recorded in this slice's own contrast note, the practice `020` established
(`specs/020-design-language/contrast.md`).
**Rejected**: recharts' default palette (arrives as literals, unthemed, and ignores `020`
entirely); reusing `--color-primary` for every series (indistinguishable bars).

### Decision 6 — The KPI read is not audited

**Taken**: no `@Audited` on `GET /tenant/kpis`, and no new audit action for reading.
**Why**: the newest read route in the product, `GET /tenant/calendar/events`, carries none
(`calendar.controller.ts:22-26`), nor do the client, case or document lists. Principle V requires
recording access to cases and documents; an aggregate exposes no matter — it is a count. The
audited mutation this slice *does* add is `case.outcome_declared` (FR-004), which is a change to a
matter's record and belongs in the log.
**Consequence**: the only migration this slice needs is `0047`, for the column and the action.

### Decision 7 — Period means calendar month, quarter or year, in Mexico City

**Taken**: three fixed windows ending today, computed in `America/Mexico_City`; the comparison is
the immediately preceding window of the same length.
**Why fixed rather than a date range**: `US07-EP06-KPI-FilterKPIsByDateRange` is a separate IT2
story, and a range picker makes the delta ambiguous (compared against what?). Three named periods
make "vs. periodo anterior" mean exactly one thing.
**Why Mexico City**: `013` already sets that precedent for day boundaries
(`calendar.repository.ts:122-123`), and a quarter that starts at 18:00 the previous day would put
matters in the wrong bucket for every firm this product serves.

### Decision 8 — An average is reported with its sample size, and a thin one is refused

**Taken**: every aggregate carries the count it was computed from; a success rate over fewer than
five declared outcomes is not reported at all, and the response says how many are undeclared.
**Why a floor at all**: "Tasa de Éxito 100%" from one matter is not a small sample, it is a
misleading claim on a screen designed to be trusted — and it is exactly what `022`'s demo firm
would produce on day one before outcomes are declared.
**Why five**: low enough that a small firm sees a number within a quarter or two, high enough that
one matter cannot move it by 100 points. It is a judgement, recorded as one, and it is one
constant to change.
**Why not the same floor on resolution time**: an average of one resolution time is still that
matter's true duration — misleading to extrapolate, but not invented. It is reported with its
count so the reader can judge, which is the honest middle.

### Decision 9 — `022`'s demo seed learns to declare outcomes

**Taken**: this slice amends `drizzle/demo/matters.ts` to assign an outcome to every closed matter,
and extends `seed-demo.ts` to write it — closing the forward dependency `022` Decision 7 recorded.
**Why it belongs here**: the column does not exist until this migration, so `022` could not have
written it. `022`'s spec says so explicitly and names this slice as the one that finishes it.
**Why it matters beyond tidiness**: without it the demo firm shows "Datos insuficientes" on the
most prominent tile, and the slice cannot be demonstrated — which is the exact problem `022` was
built to solve. The distribution is deliberately uneven across matter types, so the by-type chart
has shape rather than five equal bars.

---

## Assumptions

- `022`'s demo firm is the data this screen is judged against: 40 matters, 11 closed, six quarters,
  two associates with different loads.
- `recharts` and `components/ui/chart.tsx` work as `ui-smoke.test.tsx` already asserts.
- No firm has more matters than a single aggregate query can handle at MVP scale; these are
  `count` and `avg` over a few thousand rows.
- `023`'s branch is the base, so `document.read_list` and the `documentos` nav fix are present.

## Dependencies

- `006-client-case-core` — `case_file`, `case_status.is_closing`, `case_assignment`,
  `matter_type`. The slice's entire data source, and the schema it amends.
- `004-authorization-entitlements` — the capability registry and the two matrix tests.
- `020-design-language` — the token contract this slice extends with chart colours.
- `016a-frontend-shell` — the shell, the feedback states and the navigation registry.
- `022-demo-firm-seed` — not a build dependency, but the data without which this screen cannot be
  judged, and the seed this slice amends.

## Out of Scope

- **Revenue, billing and the Financiero tab** — Decision 2. `US05-EP06` stays IT2 behind `010`.
- **`US09-EP06-KPI-ViewAdministrativeDashboard`** (billing, hour costs, monthly summary) — the same
  missing data, doubled.
- **`EP01` Dashboard Principal.** `/` remains `016a`'s placeholder. This slice builds `/kpis`
  only, as the brief states.
- **Custom date ranges** (`US07-EP06`, IT2) — Decision 7.
- **KPI alerts** (`US06-EP06`, IT3) and **PDF export** (`US08-EP06`, IT3).
- **Per-attorney self-service KPIs.** Decision 4 refuses `AA`/`PL` the firm-wide screen and does
  not build a scoped alternative; that is a separate story.
- **Backfilling outcomes for real firms.** The route exists (FR-002a); no bulk tool is built.

## Approval Checklist

- [ ] Decision 1 — a fixed four-value `outcome` column, nullable — *Decided by Claude 2026-09-25, pending ratification by Jero*
- [ ] Decision 2 — revenue and the Financiero tab removed rather than stubbed — *Decided by Claude 2026-09-25, pending ratification by Jero*
- [ ] Decision 3 — its own route, under `case.change_status` — *Decided by Claude 2026-09-25, pending ratification by Jero*
- [ ] Decision 4 — `kpi.read` for MP/CM/SA, **not BM** — *Decided by Claude 2026-09-25, pending ratification by Jero*
- [ ] Decision 5 — chart colours as design tokens, contrast recorded — *Decided by Claude 2026-09-25, pending ratification by Jero*
- [ ] Decision 6 — the KPI read is not audited — *Decided by Claude 2026-09-25, pending ratification by Jero*
- [ ] Decision 7 — month/quarter/year in America/Mexico_City — *Decided by Claude 2026-09-25, pending ratification by Jero*
- [ ] Decision 8 — sample sizes reported, success rate floored at five — *Decided by Claude 2026-09-25, pending ratification by Jero*
- [ ] Decision 9 — `022`'s demo seed declares outcomes — *Decided by Claude 2026-09-25, pending ratification by Jero*
- [x] Checked against the code, not the mockup — ten findings recorded above
- [x] `US02`, `US03`, `US04-EP06` promoted to MVP in this slice's PR
- [x] Permission matrix declares the one new row and reproduces the reused one unchanged
- [x] Zero `[NEEDS CLARIFICATION]` markers
