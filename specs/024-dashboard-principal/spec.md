# Feature Specification: Dashboard Principal

**Feature Branch**: `024-dashboard-principal` (stacked on `008-notes-and-activity`)
**Created**: 2026-10-09
**Status**: Decided — eight decisions taken by Claude 2026-10-09, pending ratification by Jero
**Input**: `master-user-story-catalog.md` EP01 (US01–US03 are MVP), `registro-specs-mvp.md` row
"015-dashboards" (EP01 US01–US03 · EP06 US01/09, "Resolver solape EP01 US01 vs. EP06 US01"), `015`'s
Out of Scope ("`/` remains `016a`'s placeholder"), and the MVP-closing brief of 2026-10-09: *only data
that exists, assigned scope, no revenue tiles*.

> **Citation convention.** Requirements of other slices are cited as `006/FR-0NN`; bare `FR-0NN` is
> this document. Code is cited as `path:line`, read on 2026-10-09 at `008-notes-and-activity`
> `9c8cfd5` (which is `main` `273e400` plus 008).
>
> **Authorship.** Written by Claude (Opus 5.5) on 2026-10-09, end to end. Every open point is a
> numbered Decision marked *"Decided by Claude 2026-10-09 — pending ratification by Jero"*. Nothing in
> this slice is merged to `main` before they are ratified, and it cannot be merged before `008`, on
> which it is stacked.
>
> **Numbering.** The registro's working title was `015-dashboards`; `015` went to the KPI screen, and
> `010`–`012` are reserved for billing, CFDI and quotes. `024` is the next free number.

---

## Why this slice matters

Everyone who signs in lands on `/`, and `/` says *"Bienvenido a LegalConnect MX."* and nothing else
(`frontend/src/app/page.tsx`). The first screen a partner sees every morning should answer three
questions without a click: **how much is open, what is due, and what moved** — and answer them only
from what the product actually records, about only the matters the person may see.

---

## What the code actually does, checked against the code rather than the catalog

| # | What the stories assume | What the code does | Consequence |
|---|---|---|---|
| 1 | "Today's KPI summary" (US01-EP01) is new | `015` already serves the firm's KPIs at `/kpis` (`US01-EP06`): active matters, resolution time, success rate — to `MP`, `CM`, `SA` only (`matrix.ts`, row 47) and over the whole firm | The overlap is real and must be resolved, not duplicated → **Decision 1** |
| 2 | Deadlines can be "overdue" (US02-EP01) | A `calendar_event` is `scheduled` or `cancelled` (`0046_calendar_event.sql:18`). **There is no "done".** A deadline met yesterday and one missed yesterday are the same row | The product cannot say "vencido" truthfully → **Decision 2** |
| 3 | A "team activity feed" (US03-EP01) needs its own store | `008` derives a matter's activity from `audit_event` by an explicit allow-list (`modules/notes/activity-actions.ts`), with no metadata values | The dashboard reuses that derivation across the matters the person reaches → **Decision 3** |
| 4 | A dashboard shows revenue | No slice records a price or an invoice (`010` is unwritten; `015` Decision 2; `decision-billing-scope.md`) | No revenue, billing or hour-cost tile → **Decision 6** |
| 5 | Everyone sees the same dashboard | Reach differs: `MP`/`SA` see every matter, `AA`/`PL`/`CM` only those with a live assignment (006 Decision 2); `BM` holds no case capability at all (006, Principle VI) | Every figure and list is narrowed in the query → **FR-004**, Decision 4 |
| 6 | The navigation entry must be "flipped" | `dashboard` is already `available: true`, `href: '/'`, for every internal archetype (`navigation-items.ts:70`) | No flag to flip; the slice replaces what `/` renders → **FR-012** |
| 7 | Hours belong on a dashboard | `009` records each person's own time; nobody sees anybody else's (009 Decision 2) | Only the caller's **own** minutes today, and only for timekeepers → **FR-006** |

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — See, on landing, what is open and what is on today (Priority: P1) 🎯 MVP

`US01-EP01-DSH-ViewTodaysKPISummary`, as resolved by Decision 1.

**Independent Test**: sign in as an `AA` on two of five matters with one event today; `/` shows
"2 expedientes activos", today's event, and no figure about the other three matters.

**Acceptance Scenarios**:

1. **Given** a person who reaches N matters whose status does not close them, **Then** the
   "Expedientes activos" tile reads N — counted over exactly the matters `/expedientes` lists to them.
2. **Given** events today (Mexico City) on reachable matters or on no matter, **Then** they are
   listed soonest first, with their matter's file number when they have one.
3. **Given** a timekeeper (`MP`, `AA`, `PL`, `CM`) who logged time today, **Then** "Mis horas de hoy"
   shows their own total; **given** an `SA`, the tile is absent, not "0 h".
4. **Given** a person who holds `kpi.read`, **Then** a link "Ver indicadores del despacho" leads to
   `/kpis`; **given** one who does not, there is no link.

### User Story 2 — See which deadlines are coming and which just passed (Priority: P1) 🎯 MVP

`US02-EP01-DSH-ViewOverdueDeadlineAlerts`, as resolved by Decision 2.

1. **Given** `deadline` events in the next seven days on reachable matters, **Then** they are listed
   under "Plazos próximos", soonest first.
2. **Given** `deadline` events in the past seven days, not cancelled, **Then** they are listed under
   "Plazos de los últimos 7 días" with the sentence *"El sistema no registra si un plazo se cumplió;
   confirma que estos se atendieron."* — never with the word "vencido".
3. **Given** a cancelled deadline, **Then** it appears in neither list.

### User Story 3 — See what moved across one's matters (Priority: P2)

`US03-EP01-DSH-ReviewRecentActivityFeed`.

1. **Given** allow-listed changes (008/FR-013) on reachable matters in the last 30 days, **Then** the
   20 most recent are listed newest first, each as 008's Spanish sentence plus the matter's file
   number, linking to that matter's `/actividad`.
2. **Given** a change on a matter the person does not reach, **Then** it is absent.
3. **Given** no change in 30 days, **Then** the section says so.

### Edge Cases

- **A firm with no matters**: every tile reads its zero honestly ("0 expedientes activos"), lists show
  their empty state; nothing errors.
- **An `AA` with no assignments**: `200` with zeros and empty lists — never a refusal (row 29's reason).
- **`BM`**: `/` shows a welcome with links to what `BM` can use (`/clientes`), and **sends no request**
  to the dashboard route, which would refuse it (`403`).
- **Portal archetypes**: never reach the shell's `/` (016a); the route refuses them regardless.
- **An event spanning midnight**: "today" is the Mexico City day; an event overlapping it is today's
  (013/FR-005's overlap rule, reused).
- **Activity on a matter the person was taken off**: absent from the next request (live assignment).

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `GET /tenant/dashboard` returns one JSON document with every section of the dashboard,
  computed in one request transaction, so no section can disagree with another.
- **FR-002**: Capability `dashboard.read` (row 56), `tenant` scope, held by `MP`, `AA`, `PL`, `CM`,
  `SA`. `BM` and portal archetypes get `403`.
- **FR-003**: **Not audited** (Decision 5).
- **FR-004**: Every count and list is narrowed inside the query to matters the caller reaches: all of
  the firm's for `MP`/`SA`; those with a live `case_assignment` for everyone else — the predicate
  `006`'s list, `013`'s calendar and `009`'s timesheet already use. RLS confines everything to the firm.
- **FR-005**: `activeMatters` counts reachable matters whose status is not `is_closing` — `015`'s
  definition of active (`kpi.repository.ts`, `activeCaseCount`), narrowed by FR-004.
- **FR-006**: `myMinutesToday` is the caller's own `logged` minutes with `work_date` = today (Mexico
  City) on matters they still reach — `009`'s rule — or `null` when the caller does not hold
  `time.read_own`.
- **FR-007**: `todayEvents`: scheduled events overlapping today (Mexico City), case-linked ones only on
  reachable matters, soonest first, at most 10, with `id`, `type`, `title`, `allDay`, `startsAt`,
  `startsOn`, and `case { id, fileNumber } | null`.
- **FR-008**: `deadlines.upcoming`: scheduled `deadline` events starting in `[today, today + 7)`;
  `deadlines.recent`: scheduled `deadline` events starting in `[today − 7, today)`. Each at most 10,
  same shape as FR-007, narrowed by FR-004. Cancelled events never appear.
- **FR-009**: `recentActivity`: at most 20 audit entries of the last 30 days, of 008's allow-list
  (008/FR-013), belonging to reachable matters by 008/FR-012's rule, newest first; each carries 008's
  fields (`id`, `action`, `occurredAt`, `actor { membershipId, position } | null`, `fileName`) plus
  `case { id, fileNumber }`. No metadata value.
- **FR-010**: `today` (Mexico City date) is returned, so the client never computes "today" itself.
- **FR-011**: No figure about revenue, billing, invoices, rates or the cost of hours appears in the
  response or on the screen (Decision 6).
- **FR-012**: `/` renders the dashboard inside `016a`'s shell with `020`'s tokens, `016a`'s loading,
  error and empty states, Spanish copy, no colour literal, every control from `can()`. The
  `dashboard` navigation entry is unchanged.
- **FR-013**: The frontend mirror gains row 56 and its matrix-view label.

### Capability Matrix *(Principle IV — one row added, 56)*

| # | Capability | Scope | MP | AA | PL | CM | BM | SA | PO |
|---|---|---|---|---|---|---|---|---|---|
| 56 | `dashboard.read` | tenant (narrowed in query) | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |

### Key Entities

None new. The dashboard is a read over `case_file`, `case_status`, `case_assignment`,
`calendar_event`, `time_entry`, `audit_event`, `document`, `case_note`, `directory_entry` and
`position`. **No migration.**

---

## Success Criteria *(mandatory)*

- **SC-001**: For an `AA`, every number and row on `/` concerns only matters they are assigned to —
  asserted by an isolation test with a second, unassigned matter carrying events, hours and activity.
- **SC-002**: The response carries no metadata value and no revenue field — asserted over the whole
  JSON.
- **SC-003**: `/` renders for each of `MP`, `AA`, `PL`, `CM`, `SA` with the sections their row allows,
  and for `BM` without any request to `/tenant/dashboard`.
- **SC-004**: Reading the dashboard writes no audit row.

---

## Decisions

Every decision below was taken rather than deferred. **Decided by Claude 2026-10-09 — pending
ratification by Jero.**

### Decision 1 — EP01 US01 vs EP06 US01: the dashboard is "today, my matters"; the firm's KPIs stay on `/kpis`

**Options**: (A) repeat `/kpis`'s tiles on `/`; (B) move the KPIs to `/` and retire `/kpis`;
(C) **`/` shows operational, person-scoped figures — active matters reached, today's events, own
hours today — and links to `/kpis` for those who hold `kpi.read`**.
**Taken: C.** **Why**: `US01-EP06` is "the firm's KPIs" and `015` serves it, to three archetypes, over
the whole firm. `US01-EP01` is "today's summary" for the person who just signed in. Showing the same
four figures in two places would mean two definitions to keep equal and a firm-wide success rate
shown to an associate whom `015` Decision 4 deliberately refuses it. The one figure both share —
active matters — is computed by the same definition (FR-005), narrowed to what the person reaches.
**Rejected**: A (duplicates, and leaks firm-wide figures to `AA`/`PL`); B (undoes a shipped slice).

### Decision 2 — "Overdue" is not claimed; past deadlines are shown as past, with the reason

**Options**: (A) list every past scheduled deadline as *vencido*; (B) add a "done" state to
`calendar_event` in this slice; (C) **list upcoming deadlines, and those of the last seven days
under a heading that says the system does not record completion**.
**Taken: C.** **Why**: the product has no record of a deadline being met (finding 2). Calling every
past deadline *vencido* would raise an alarm for each one met on time — an alert that is wrong most
of the time is one people learn to ignore, which is worse than none for a deadline that matters.
Adding completion is a change to `013`'s entity, its screens and its audit vocabulary — its own
slice, recorded under Out of Scope.
**Rejected**: A (false alarms); B (scope of another slice, unratified).

### Decision 3 — The activity feed reuses 008's derivation across reachable matters

The same allow-list, the same membership-by-`metadata.caseId` rule, the same absence of values, the
same position label — across every matter the person reaches, 20 entries, 30 days. **Why**: a second
definition of "what counts as activity" would drift from the per-matter one; and because `008`
already decided what may be shown, this slice decides only how much.

### Decision 4 — One capability, `tenant` scope, narrowed in the query; `BM` excluded

`dashboard.read` (row 56). `tenant`, not `assigned`, for row 29's reason: a resolver returns a
boolean and a person with no assignments must get an empty dashboard, not a refusal. `BM` is excluded
for the reason it holds no case row (Principle VI): every section is about matters. `SA` holds it —
`SA` reaches every matter and every other section is already theirs (`case.read_list`,
`calendar.read`, `case.read_activity`); only own hours are absent (009 Decision 10).

### Decision 5 — Reading the dashboard is not audited

It shows counts, titles and file numbers the same people already read unaudited on `/expedientes`
and `/calendario`, and kinds of change (008 Decision 4). No note text and no document content.

### Decision 6 — No revenue, billing or hour-cost tile, and no placeholder for one

As `015` Decision 2: a tile reading "$0" or "Próximamente" in the most prominent position misleads.
`decision-billing-scope.md` records why the data does not exist.

### Decision 7 — "Today" and "the last seven days" are Mexico City days, computed by the server

As 009, 013 and 015. The server returns `today`; the browser never computes it.

### Decision 8 — `BM` lands on a welcome, not a refusal

`BM` reaches `/` like everyone (the navigation entry is for all internal archetypes). Rather than an
error state, `/` shows a short welcome and links to the sections `BM` uses, and makes no request.

---

## Assumptions

- `008` merges before this slice (it is stacked on it, and reuses its activity derivation).
- The demo firm (`022`, with `009`'s hours and `008`'s notes) is what the screen is judged against;
  its feed is empty until people act (008 Decision 5) — the e2e suite acts first.

## Dependencies

`006` (reach), `008` (activity), `009` (own hours), `013` (events), `015` (active-matter definition,
`/kpis`), `016a` (shell and states), `020` (tokens), `022` (demo data).

## Out of Scope

- A "done" state for deadlines, and alerts that depend on it (Decision 2 — its own slice).
- `US04`–`US11-EP01` (IT2, IT3, TBD).
- Revenue, billing, invoices, rates (Decision 6; `010`).
- Firm-wide KPIs on `/` (Decision 1).

## Approval Checklist

- [ ] Decision 1 — dashboard is "today, my matters"; KPIs stay on `/kpis` — *Decided by Claude 2026-10-09, pending ratification by Jero*
- [ ] Decision 2 — no "overdue" claim; past deadlines shown with the reason — *Decided by Claude 2026-10-09, pending ratification by Jero*
- [ ] Decision 3 — activity reuses 008 across reachable matters — *Decided by Claude 2026-10-09, pending ratification by Jero*
- [ ] Decision 4 — `dashboard.read`, tenant scope narrowed in query, `BM` excluded — *Decided by Claude 2026-10-09, pending ratification by Jero*
- [ ] Decision 5 — not audited — *Decided by Claude 2026-10-09, pending ratification by Jero*
- [ ] Decision 6 — no revenue tile — *Decided by Claude 2026-10-09, pending ratification by Jero*
- [ ] Decision 7 — Mexico City days, server-computed — *Decided by Claude 2026-10-09, pending ratification by Jero*
- [ ] Decision 8 — `BM` gets a welcome — *Decided by Claude 2026-10-09, pending ratification by Jero*
