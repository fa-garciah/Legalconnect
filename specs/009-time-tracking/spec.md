# Feature Specification: Recording Time

**Feature Branch**: `009-time-tracking`
**Created**: 2026-10-08
**Status**: Ratified — eleven decisions taken by Claude 2026-10-08, **all ratified by Jero 2026-10-09**
**Input**: `registro-specs-mvp.md` row for `009-time-tracking` (EP08 US01/02/04/05/10/11, blocked on
scope conflict 4), `plan-paralelo-2026-09.md` §4 ("Lo que ningún carril puede tomar"), the
`horas` entry `016a` left in the navigation, and the MVP-closing brief of 2026-10-08, which asks
for this slice to be written with every open point of conflict 4 turned into a numbered Decision.

> **Citation convention.** Requirements of slices 004, 006, 007, 013, 014, 015, 016a, 020, 022 and
> 023 are cited as `006/FR-0NN` etc. Bare `FR-0NN` refers to this document. Code is cited as
> `path:line`, read on 2026-10-08 at `main` `9f4a1ad`, the commit this branch starts from.
>
> **Authorship.** Written by Claude (Opus 5.5) on 2026-10-08, end to end. **Scope conflict 4 is
> still open with the client**: nobody outside CC has said how this firm wants to record time.
> Every point that conflict leaves open is therefore resolved here as a numbered Decision with the
> options considered, and each is marked *"Decided by Claude 2026-10-08 — pending ratification by
> Jero"*. **All eleven were ratified by Jero on 2026-10-09.** If the client answers conflict 4 differently, the Decision it
> contradicts is the one to reopen, and the rest of the spec says what moves with it.

---

## Why this slice matters

A Mexican law firm sells two things: outcomes, and hours. Even firms that bill flat fees track
hours, because hours are how a partner knows whether a flat fee was a good price and how an
associate's year is judged. Today LegalConnect has no record of time anywhere — `015` had to
remove the whole *Financiero* tab of its dashboard for exactly that reason (`015`/Decision 2), and
the navigation has carried **Registro de Horas** as an inert row since `016a`.

This slice is the record. It is deliberately **not** billing: no rate, no amount, no invoice, no
approval. A firm can start recording hours the day it ships, and `010-billing-core` — whenever its
scope is settled — inherits a clean, auditable ledger of minutes rather than a migration from
spreadsheets.

It is also the slice in the product with the sharpest edge on Principle V's "fee and billable-hour
calculation", which the constitution puts on the **blocking** critical-coverage list
(`.specify/memory/constitution.md:732`). The one calculation this slice performs — turning a
running timer into a number of minutes — is therefore isolated in one pure function and held to
100% coverage (FR-020).

---

## What the code actually does, checked against the code rather than the catalog

`navigation-items.ts`, `matrix.ts`, `capability.ts`, `interceptor.ts`, `scope.ts`,
`assigned-scope.resolver.ts`, `case.repository.ts`, the whole of `modules/calendar/`,
`common/audit/actions.ts`, migrations `0046` and `0047`, `tenant-scoped-tables.ts`, `seed.ts`,
`seed-demo.ts` and `drizzle/demo/*`, `vitest.config.ts`, `frontend/src/app/calendario/*` and
`frontend/src/app/kpis/KpiDashboard.tsx` were read before this spec was written. Eleven findings
shape it.

| # | What a timesheet would assume | What the code does | Consequence |
|---|---|---|---|
| 1 | Somewhere, time is stored | **Nowhere.** No table, column or type in any of the 48 migrations records a duration of work; `KpiDashboard.tsx:5` says so in a comment, and `015`/Decision 2 removed a tab because of it | The entity is new → **FR-001**, migration `0048` |
| 2 | The `horas` nav entry is ready to switch on | It carries `requiredArchetypes: INTERNAL` — **which includes `BM` and `SA`** — and `available: false` (`navigation-items.ts:152`, `INTERNAL` at `:67`) | The same latent defect `023` fixed for `documentos` and `015` for `kpis`: switching it on unchanged would draw a link to archetypes this slice refuses → **FR-017**, Decisions 2 and 10 |
| 3 | "Log only on cases you can reach" needs new code | It does not. `006`'s `AssignedScopeResolver` answers exactly "does the caller hold a live assignment to this case", with `MP` and `SA` exempt before any query (`assigned-scope.resolver.ts:57`) | Every write that names a case reuses it, unchanged → **FR-005**, Decision 9 |
| 4 | That resolver can guard any route | Only a route whose **URL** carries the case: `@ScopeTarget` reads `request.params` synchronously and has no async lookup (`interceptor.ts:275`) | Writes are nested under `/tenant/cases/:caseId/…`; reads, which name no case, are `tenant`-scoped with the predicate in the query — `case.read_list`'s shape → Decision 9 |
| 5 | A list can be `assigned`-scoped | It cannot. A resolver returns a boolean, so an `assigned` list could only *refuse* a person with no assignments; `capability.ts` warns against "tidying" row 29 for this reason, and `case-list-scoping.test.ts` exists to stop it | The timesheet read is `tenant`-scoped and narrowed inside the query, list **and** totals under one predicate → **FR-009**, FR-010 |
| 6 | Mexico City day boundaries need deciding | Already decided twice: `013` stores all-day dates as dates and computes ranges in `America/Mexico_City` (`calendar.repository.ts:16`); `015`/Decision 7 follows it | `work_date` is a `date` in Mexico City; a timer's day is the Mexico City day it **started** → **FR-003**, Decision 6 |
| 7 | Adding an audit action is a code change | It is a **migration**: `audit_event_action_known` is a `CHECK` re-issued whole by every slice that extends it (`0047_case_outcome.sql:39-122`) | `0048` carries the six new actions → **FR-014** |
| 8 | A person's name is available to label entries | **No slice stores a person's name** — `identity` holds `subject`, `email` and nothing else (`015`/Decision 10) | Harmless here, and that is part of why the MVP view is **one's own** hours only: nobody's entries are shown to anybody else (Decision 2, Out of Scope) |
| 9 | Rates belong in the time module | Rates appear **twice** in the catalog: `US10-EP08-TTK-ConfigureBillableRates` (SA, MVP) and `US03-EP15-QTE-SetCaseHourlyRate` (BM, MVP) (`master-user-story-catalog.md:416`, `:611`); `014`/Decision 2 already deferred the third rate story, `US04-EP10`, to `010` | Building either here creates a rate with no consumer and a second place for the same number → Decision 4 |
| 10 | Per-tenant permission editing is a configuration screen | `004`/Decision 4 made the matrix a compile-time constant, and `014`/Decision 1 satisfied `US03-EP10-CFG-ConfigurePermissions` as a **read-only** matrix view that already renders every capability by prefix (`frontend/src/configuracion/matrix-view-model.ts`) | `US11-EP08` is satisfied by four fixed rows that `/configuracion` will display without new UI → Decision 5 |
| 11 | The isolation suite will notice a new table by itself | It will — and fail. `no-context.test.ts` sweeps every entry of `TENANT_SCOPED_TABLES` and needs each one non-empty for a tenant, which is why `013` added a fixture event to `seed.ts` (`seed.ts:448-477`) | `seed.ts` gains one fixture entry per tenant, and `022`'s demo seed gains a realistic volume → **FR-021**, FR-022 |

Two further facts constrain the plan:

- **The resolver's `MP`/`SA` exemption is inherited, not chosen here.** `006`/Decision 2 lets a
  managing partner reach every matter, and the same exemption therefore lets an `MP` log time on
  any matter of the firm. That is correct for a partner (they supervise everything) and is
  recorded so nobody reads it as a gap. `SA` holds no time capability at all (Decision 10), so for
  `SA` the exemption is moot.
- **Adding a capability costs two test edits, by design.** `matrix-exhaustive.test.ts` and the
  frontend's `capability-matrix-sync.test.ts` each transcribe the matrix independently; a new row
  without both assertions fails the build. Four rows are added (48–51).

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Time a piece of work as it happens (Priority: P1) 🎯 MVP

An associate opens a matter's file to draft a brief. They start the timer on that matter, work, and
stop it; the time is on their timesheet without them typing a number.

**Catalog**: `US01-EP08-TTK-StartStopTimer` (MVP), and `US05-EP08-TTK-LogParalegalHours` (MVP) for a
paralegal doing the same.

**Why this priority**: a timer is the capture method that loses the least time — work that is
reconstructed at the end of the week is systematically under-recorded.

**Independent Test**: as the demo firm's associate, open `/horas`, pick a matter, start the timer,
wait, stop it with a description; the entry appears under today with the elapsed minutes.

**Acceptance Scenarios**:

1. **Given** an `MP`, `AA`, `PL` or `CM` with no timer running, **When** they choose a matter they
   can reach and press "Iniciar cronómetro", **Then** a timer starts, shows the matter's file
   number and the elapsed time, and survives a page reload (it lives on the server, not the tab).
2. **Given** a running timer, **When** they press "Detener y registrar" with a description, **Then**
   an ordinary time entry is recorded for that matter, dated the Mexico City day the timer
   **started**, for the elapsed whole minutes (Decision 6), and the timer is gone.
3. **Given** a running timer, **When** they try to start a second one, **Then** it is refused with
   "Ya tienes un cronómetro en marcha" — one timer per person (**FR-006**).
4. **Given** a timer started by mistake, **When** they press "Descartar", **Then** it is discarded,
   nothing is recorded on the timesheet, and the discard is audited.
5. **Given** a timer left running for more than 24 hours, **When** they try to stop it, **Then** it
   is refused ("El cronómetro lleva más de 24 horas; descártalo y registra el tiempo a mano") — a
   forgotten timer never becomes a three-day entry (**FR-007**).
6. **Given** the matter selector, **Then** it offers only matters the person can reach — the
   already-narrowed `GET /tenant/cases` — so an unreachable matter is never offered, then refused.
7. **Given** the person is taken off the matter while its timer runs, **Then** the timer shows
   "El expediente de este cronómetro ya no está disponible" with only "Descartar"; stopping it is
   refused with the same `404` an unknown matter produces (**FR-008**).

---

### User Story 2 — Record time after the fact (Priority: P1) 🎯 MVP

A partner spent an hour on a call from the car. Back at the desk, they record it.

**Catalog**: `US02-EP08-TTK-LogManualHours` (MVP), and `US05-EP08-TTK-LogParalegalHours` (MVP).

**Acceptance Scenarios**:

1. **Given** someone holding `time.log`, **When** they press "Registrar horas" and give a
   matter, a date, hours and minutes, and a description, **Then** the entry is recorded and appears
   on their timesheet under that date.
2. **Given** a date after today in Mexico City, **Then** it is refused before sending and by the
   server (`400`) — time is recorded for work done, not planned.
3. **Given** a duration of zero, or more than 24 hours, or a missing description, **Then** it is
   refused before sending and by the server (`400`).
4. **Given** a matter the person cannot reach (named by a crafted request), **Then** the answer is
   `404`, byte-identical to a matter that does not exist (`006`/FR-016).
5. **Given** a manual entry and a timer entry for the same work, **Then** both are ordinary time
   entries of the same kind on the timesheet, distinguished only by a "Cronómetro" / "Manual"
   label — one entity, not two (Decision 1).

---

### User Story 3 — See my own timesheet (Priority: P2)

At the end of the week, an associate checks what they recorded.

**Catalog**: `US04-EP08-TTK-ViewMyTimesheet` (MVP).

**Acceptance Scenarios**:

1. **Given** someone holding `time.read_own`, **When** they open `/horas`, **Then** they see
   this week's entries (Monday to Sunday, Mexico City), grouped by day, newest day first, each
   showing the matter's file number, the description, the duration as "1 h 30 min" and its source.
2. **Given** the range controls ("Esta semana", "Semana anterior", "Este mes", or a from/to pair of
   dates), **When** one is chosen, **Then** only that range is requested; a range longer than 62
   days is refused before sending and by the server.
3. **Given** the range, **Then** a total for the range and a total per day are shown, and both are
   computed by the server from **exactly** the entries listed (**FR-010**).
4. **Given** an entry on a matter the person has since been taken off, **Then** it is absent from
   the list **and** from the totals — the timesheet follows `006`'s ethical wall exactly as the
   calendar does (`013`/FR-006).
5. **Given** a range with no entries, **Then** `016a`'s empty state appears with "Registrar horas"
   when the person holds `time.log`.
6. **Given** a `BM` or an `SA`, **Then** there is no "Registro de Horas" in their navigation and
   every endpoint refuses them (Decisions 2 and 10).

---

### User Story 4 — Fix a mistake while it is fresh (Priority: P2)

An associate typed 3 h instead of 30 min. They correct it the same afternoon.

**Catalog**: `US03-EP08-TTK-EditTimeEntries` — **narrow version promoted IT2 → MVP** in this
slice's PR (Decision 3).

**Acceptance Scenarios**:

1. **Given** one of their own recorded entries, logged less than 24 hours ago, **When** they choose
   "Corregir" and change the date, the duration or the description, **Then** it is saved, and the
   audit entry names the fields that changed — never their values (**FR-013**).
2. **Given** the same entry, **When** they choose "Eliminar" and confirm, **Then** it leaves the
   timesheet and the totals; the row is kept, marked voided, never deleted (**FR-012**).
3. **Given** an entry logged more than 24 hours ago, **Then** neither control is drawn, and the
   server refuses either request with `409 correction_window_closed`.
4. **Given** the server, not the browser, decides the window, **Then** each listed entry carries
   `correctableUntil` (or `null`), and the screen draws the controls from it.
5. **Given** anybody else's entry — including a partner trying to correct an associate's —
   **Then** the answer is `404`: in this slice nobody reads or touches anybody else's time.
6. **Given** a correction would move an entry to a different matter, **Then** that is not offered:
   the matter of an entry is fixed; a wrong matter is corrected by deleting and recording again.

---

### Edge Cases

- **A timer running across midnight**: it belongs to the day it started (Decision 6); a timer
  started 23:30 and stopped 00:45 is a 75-minute entry on the earlier day.
- **Two tabs, one timer**: the timer is server state, so the second tab shows the same timer and
  a second "Iniciar" is refused (`409 timer_running`). Two simultaneous starts are serialised by a
  partial unique index — one wins, one gets `409` (**FR-006**).
- **Stopping a timer twice** (double-click, two tabs): the second stop finds no running timer and
  answers `409 no_running_timer`; exactly one entry and one audit row exist.
- **A timer stopped after 20 seconds**: rounds to the nearest whole minute, with a floor of one —
  a stopped timer always records at least one minute (Decision 6).
- **More than 24 hours in one day across several entries**: not refused. Each entry is bounded to
  24 h; a per-day ceiling would need the person's other entries inside the write's transaction and
  is a rule (`US10-EP10-CFG-ConfigureTimeTrackingRules`, IT3) this slice does not invent.
- **The correction window and an edit of the date**: the window runs from when the entry was
  *logged*, not from its work date, so back-dating an entry to last week does not shut its own
  correction window.
- **A matter that closes**: entries stay; a closed matter can still receive time (closing paperwork
  is work), because `006` does not withdraw a closed matter from its team.
- **Daylight saving**: Mexico abolished it in 2022 and `America/Mexico_City` is fixed at UTC−6 in the
  tz database, but the code computes with the zone name, never with a hard-coded offset.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A `time_entry` belongs to one firm (`tenant_id`, RLS as every tenant table, registered
  in `TENANT_SCOPED_TABLES`), to exactly one of its matters (`case_id`, required), and to exactly
  one membership — the person whose time it is, always the caller who created it.
- **FR-002**: An entry has a **source** (`timer` or `manual`) and a **status** (`running`, `logged`,
  `voided`). A running entry is a timer that has not stopped; only `logged` entries are time.
  The database enforces the shape: a `manual` entry is never `running`; a `running` entry has a
  start instant and no minutes; a `logged` entry has minutes and a description; a `voided` entry has
  a void instant.
- **FR-003**: Duration is stored as **integer minutes, 1 to 1440**. The work day is a `date` in
  `America/Mexico_City`; for a timer it is the Mexico City date of the instant it started.
- **FR-004**: New capabilities, all four held by `MP`, `AA`, `PL`, `CM` and by nobody else
  (Decisions 2, 3, 10): `time.log` (start or stop one's timer; record manual time),
  `time.read_own` (one's own timesheet and running timer), `time.correct_own` (correct
  or void one's own recent entries), `time.discard_timer` (discard one's own running timer).
- **FR-005**: Every write that names a matter is routed under `/tenant/cases/:caseId/…`, declares an
  `assigned`-scoped capability and `@ScopeTarget('caseId')`, so `006`'s resolver decides reach —
  `MP` (and `SA`, were it ever granted) unrestricted, everybody else only on a matter with a live
  assignment. An unreachable or unknown matter answers `404` (`006`/FR-016).
- **FR-006**: A person has **at most one** running timer, enforced by a partial unique index on
  `(membership_id) WHERE status = 'running'`. Starting a second answers `409 timer_running`.
- **FR-007**: Stopping a timer records `round(elapsed seconds / 60)` minutes with a floor of 1 (the
  single calculation of FR-020). A timer whose elapsed time exceeds 1440 minutes cannot be stopped
  (`409 timer_too_long`); it can be discarded.
- **FR-008**: A running timer can be **discarded** by its owner at any time, on a flat route that
  names no matter and declares the `tenant`-scoped `time.discard_timer`, whether or not the
  matter is still reachable; discarding voids it. Stopping one
  requires the matter to be reachable (FR-005). The running-timer read returns the matter only when
  it is reachable, and otherwise `case: null` with `caseAvailable: false`.
- **FR-009**: `GET /tenant/time-entries?from&to` returns the caller's own `logged` entries whose work
  day falls in `[from, to)`, newest day first. The range is required and at most 62 days. For every
  archetype but `MP` (`SA` holds no read), an entry is returned only while the caller holds a live
  assignment on its matter — one parenthesised predicate inside the query, the shape of
  `calendar.repository.ts`'s `visibleTo()`.
- **FR-010**: The same response carries `totalMinutes` and per-day totals, computed from **the same
  predicate and the same rows** as the items, so no total can include an entry the list hides.
- **FR-011**: A manual entry requires a matter, a work date not after today in Mexico City, minutes
  in `[1, 1440]` and a description; a stopped timer requires a description (given at start, at stop,
  or both — the one at stop wins). Descriptions are trimmed and 1–1000 characters.
- **FR-012**: An entry is **never deleted**. "Eliminar" sets `status = voided` and `voided_at`; `lc_app`
  holds no `DELETE` on the table. Voided entries appear in no list and no total.
- **FR-013**: A correction changes only `workDate`, `minutes` and `description` of one's **own
  `logged`** entry, and only before `logged_at + 24 h` (server clock); after that,
  `409 correction_window_closed`. A voided entry answers `409 entry_voided`. Somebody else's entry
  answers `404`. The matter of an entry cannot be changed.
- **FR-014**: Six audit actions, one per mutation and exactly one row each:
  `time_entry.timer_started`, `time_entry.timer_stopped`, `time_entry.timer_discarded`,
  `time_entry.logged` (manual), `time_entry.corrected` (metadata: the **names** of the fields that
  changed), `time_entry.voided`. None carries a description, a duration or a date in its metadata;
  none is channel-gated. Reading is not audited (Decision 8).
- **FR-015**: Each listed entry carries `correctableUntil` — the instant the window closes while it
  is open, else `null` — computed by the server; the screen never infers the window from the
  browser's clock.
- **FR-016**: `/horas` renders, inside `016a`'s shell with `020`'s tokens: the timer card, a
  "Registrar horas" action, the range controls, the range total, and the timesheet grouped by day;
  loading, error and empty states are `016a`'s; dialogs reuse the `ui/` primitives `018` and `013`
  already use. No colour literal is introduced.
- **FR-017**: `navigation-items.ts`'s `horas` entry flips to `available: true` and narrows
  `requiredArchetypes` to `['MP','AA','PL','CM']` — removing `BM` and `SA` — in the same edit.
- **FR-018**: Every control is drawn from `can()` against the frontend mirror; the four rows join
  `frontend/src/authz/capability-matrix.ts`, `capability-matrix-sync.test.ts`'s independent
  transcription, and `/configuracion`'s read-only matrix view with Spanish labels.
- **FR-019**: All copy is Spanish; the new components join `spanish-copy.test.tsx`; the wire
  vocabulary (`timer`, `manual`, `running`, `logged`, `voided`) never reaches the screen untranslated.
- **FR-020**: Converting an elapsed interval to minutes, and summing minutes into totals and
  "N h M min" labels, live in pure functions with **100% statement, branch, function and line
  coverage, blocking in CI** — the constitution's "fee and billable-hour calculation" entry.
- **FR-021**: `drizzle/seed.ts` writes one fixture time entry per seeded tenant, so
  `no-context.test.ts` sweeps a non-empty table.
- **FR-022**: `022`'s demo seed writes a deterministic, idempotent history of logged entries for the
  demo firm's `MP`, two `AA`s, `PL` and `CM`, only on matters each is assigned to, over the last six
  weeks of working days — **deliberately uneven** between people (one heavy, one light associate) —
  and none for `BM` or `SA`.

### Capability Matrix *(Principle IV — four rows added, 48 to 51)*

| # | Capability | Scope | MP | AA | PL | CM | BM | SA | PO | Portal |
|---|---|---|---|---|---|---|---|---|---|---|
| **48** | **`time.log`** — start or stop one's timer; record manual time | **assigned** (`@ScopeTarget('caseId')`) | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **49** | **`time.read_own`** — one's own timesheet, totals and running timer | **tenant** (narrowed to own entries on reachable matters inside the query, FR-009) | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **50** | **`time.correct_own`** — correct or void one's own entry within 24 h | **assigned** (`@ScopeTarget('caseId')`, plus own-and-in-window in the service) | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **51** | **`time.discard_timer`** — discard one's own running timer | **tenant** (names no matter; the service touches only the caller's own running row, FR-008) | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

Row 49 is `tenant`, not `assigned` or `self`, for row 29's reason: a resolver returns a boolean, and
a person with no assignments must receive an empty timesheet, not a refusal. Row 51 exists because
a capability has exactly one scope (`capability.ts`, `CapabilityDef.scope`): discarding must work
when the matter is **not** reachable (FR-008), so it cannot share row 48's `assigned` scope, and
`scope-target-declared.test.ts` refuses an `assigned` route with no case in its URL. None of the
four is step-up gated; none carries a tier key (cross-cutting — Tier
Entitlements: every plan records time).

**What each archetype may read, write, delete and export** (Principle IV's four verbs):

| | Read | Write | Delete | Export |
|---|---|---|---|---|
| MP, AA, PL, CM | own entries on reachable matters | own entries on reachable matters | **void** own entries < 24 h old; never physical | nothing — no export route exists (`US07-EP08`, IT2) |
| BM, SA, PO, portal | nothing | nothing | nothing | nothing |

### Key Entities

- **Time entry**: the matter, the person (membership), the work day, the minutes, the description,
  the source (timer or manual), the status (running, logged, voided), and the instants it started,
  stopped, was logged and was voided.

---

## Exposed Read Contracts

Other slices may depend on the following, and on nothing else:

- **`time_entry` is the single store of recorded time.** A future billing slice reads `logged`
  entries; it never reads `running` or `voided` ones, and it never writes this table except through
  routes this slice or its successor specifies.
- **Units are integer minutes; the work day is a Mexico City `date`.** No rounding has been applied
  beyond FR-007's whole-minute conversion of timers. Rounding to billing increments is a billing
  rule (`US10-EP10`, IT3), applied when time is *priced*, never written back here.
- **No firm-wide read exists.** The only read is one's own (row 49). A slice that wants hours across
  people — `US08-EP08-TTK-ViewTeamHours` (IT3), `US12-EP08` utilization (IT3), the `EP01` home page,
  `010` billing — declares its own capability and its own scope rule; it does not widen row 49.

---

## Success Criteria *(mandatory)*

- **SC-001**: An associate goes from opening `/horas` to a running timer on a matter in under 10
  seconds, and from a stopped timer to a recorded entry without typing a number.
- **SC-002**: A person's timesheet and its totals include **no** entry on a matter they are not
  assigned to — asserted against the live database, not only through the controller.
- **SC-003**: The range total equals the sum of the listed entries' minutes for every range and
  every person, and each day total equals the sum of that day's entries — asserted, not assumed.
- **SC-004**: No time entry is ever physically deleted, and every start, stop, discard, manual log,
  correction and void writes exactly one audit row whose metadata contains no description, duration
  or date.
- **SC-005**: A timer started at 23:30 Mexico City time is recorded on that day in any browser
  time zone.
- **SC-006**: A `BM` and an `SA` see no "Registro de Horas" entry and are refused by every endpoint.
- **SC-007**: The minutes calculation and the total/label functions have 100% coverage, blocking.
- **SC-008**: On the demo firm, the five timekeepers' six-week totals differ visibly from each other
  (the heaviest is at least twice the lightest), so the screen can be judged against real shape.
- **SC-009**: Zero colour literals and zero English strings in the new frontend files.

---

## Decisions

Every decision below was taken rather than deferred, because the client has not answered scope
conflict 4. **Decided by Claude 2026-10-08 — ratified by Jero 2026-10-09.** Scope conflict 4 remains
unanswered by the client; if the client answers it differently, the contradicted Decision is reopened.

### Decision 1 — Both capture methods, one entity

*Ratified by Jero 2026-10-09.*

**Options**: (A) timer only; (B) manual only; (C) both, as two entities (a `timer` table that is
converted into entries); (D) both, as **one** entity whose running state is a status.
**Taken: D.** A timer is a time entry that has not stopped yet. `status = running` while it runs;
stopping it sets `minutes`, `logged_at` and `status = logged`, and from that moment it is
indistinguishable from a manual entry except for its `source` label.
**Why both**: `US01` and `US02` are both MVP rows, and they serve different people — the timer
loses least time for desk work, manual entry is the only option for a call taken in a car or a
hearing that ran all morning. A firm that only gets one will keep a spreadsheet for the other.
**Why one entity**: everything downstream — the timesheet, its totals, corrections, voids, a
future invoice — wants "time recorded", and should not need to know how it was captured. Two
tables would mean two audit vocabularies, two isolation tests and a conversion step that can fail
half-way.
**Cost accepted**: the table carries columns only timers use (`started_at`, `stopped_at`), and its
CHECK constraints are more involved. They are written once, in `0048`, and tested.

### Decision 2 — Who records, against what, and why `BM` sees nothing

*Ratified by Jero 2026-10-09.*

**Taken**: `MP`, `AA`, `PL` and `CM` record their own time, only on matters they can reach —
`006`'s resolver, unchanged, with its `MP` exemption (`006`/Decision 2). Every person sees **only
their own** entries, and only on matters they still reach. `BM` holds none of the four rows.
**Why `CM` records**: a case manager's coordination time is real work on a matter; the catalog's
`US08-EP08` already treats `CM` as part of the time picture.
**Why own-only, even for `MP`**: the only people-across-people view is `US08-EP08-TTK-ViewTeamHours`,
which is IT3, and building a partner's view of an associate's hours now would mean deciding,
without the client, how a firm supervises its people. Recorded as Out of Scope rather than
half-built.
**Why `BM` gets nothing**: a billing manager's interest in hours is pricing them, and there is no
price, no invoice and no billing slice. Hours on a matter tell you what the matter required, which
is matter content — `BM` holds no case capability at all (`matrix.ts`), on Principle VI's
minimisation. Granting `BM` a read now would hand them data no screen of theirs uses. **When `010`
lands, `BM` is the first archetype to reconsider**, through a capability of `010`'s own (see
Exposed Read Contracts), not by widening row 49.
**Rejected**: `BM` read-only on every entry (no consumer, and a privacy widening); a partner team
view (IT3, and a supervision policy nobody has stated).

### Decision 3 — A narrow correction is promoted to MVP

*Ratified by Jero 2026-10-09.*

**Options**: (A) keep `US03-EP08` at IT2, ship no correction; (B) promote `US03` whole; (C) promote
a **narrow** version: own entries, 24-hour window, date / duration / description only, void rather
than delete.
**Taken: C**, with `US03-EP08-TTK-EditTimeEntries` amended in the catalog to read "MVP (narrow, 009
Decision 3)".
**Why**: an MVP in which "3 h" typed for "30 min" can never be fixed is not a smaller product, it is
a defective one — the wrong number stays on the person's record and, later, on an invoice. The
catalog's own wording ("edit/delete within 24 h") already contains the narrow version; nothing is
invented. The 24-hour bound keeps the record trustworthy: once a day has passed, the entry is the
firm's record, and changing it belongs to an approval flow (`US06-EP08`, IT2) that does not exist.
**Why a separate capability (row 50)**: if this Decision is not ratified, withdrawing it is an edit
of one matrix row to the empty set — no route removed, no migration.
**Why void rather than delete**: Principle V. A time entry is evidence a firm may one day bill on;
"deleted" must mean "withdrawn, with a record of when", as cancelling a calendar event does
(`013`/FR-008).
**Rejected**: A (ships a known defect); B (unbounded edits of a billing record with no approval).

### Decision 4 — `US10-EP08-TTK-ConfigureBillableRates` is deferred to `010`

*Ratified by Jero 2026-10-09.*

**Taken**: no rate of any kind in this slice; `US10-EP08` is amended in the catalog from "MVP" to
"→ 010", alongside `US03-EP15-QTE-SetCaseHourlyRate`.
**Why**: a rate has exactly one consumer — pricing hours into an amount — and that consumer is
`010`, which is not specified and whose very scope is in question
(`specs/decision-billing-scope.md`, queued). A rate stored now is a number nothing reads,
configured by an archetype (`SA`) who has no business setting prices, in a second place from where
`US03-EP15` would set the same number. Two homes for one number is exactly the ledger divergence
`registro-specs-mvp.md` §4 #6 warns about for payments.
**Precedent**: `014`/Decision 2 deferred `US04-EP10-CFG-ConfigureBillingParameters` to `010` for the
same reason, approved by the CC technical lead on 2026-09-23.
**Consequence**: this slice records time without value. That is the honest state of the product.

### Decision 5 — `US11-EP08-TTK-ManageTimeTrackingPermissions` is satisfied by fixed rows, read-only

*Ratified by Jero 2026-10-09.*

**Taken**: the four capabilities are fixed matrix rows (48–51), identical for every firm, and
`/configuracion`'s existing read-only matrix view displays them under "Registro de horas". No
per-tenant grant/revoke screen is built. The catalog row is amended to read "MVP — satisfied by
fixed rows 48–51 (009 Decision 5; 014 Decision 1)".
**Why**: `004`/Decision 4 made the matrix a compile-time constant — no per-tenant override table
exists, and that is what makes the exhaustive test possible and Principle III honest. `014`/Decision
1, **approved by the CC technical lead on 2026-09-23**, resolved the identical conflict for
`US03-EP10-CFG-ConfigurePermissions` the same way. Two of the three rights `US11` names ("approve,
export") belong to IT2 stories that do not exist yet; the third ("log") is rows 48 and 51.
**Rejected**: a per-tenant override for time rights only (reopens `004`/Decision 4 for one module).

### Decision 6 — Minutes, whole; the day, Mexico City's; no rounding rules

*Ratified by Jero 2026-10-09.*

**Taken**: integer minutes in `[1, 1440]`; a timer records its elapsed time rounded to the nearest
whole minute, never fewer than one; the work day is a Mexico City `date`, and a timer belongs to the
day it started.
**Why integers**: minutes are the unit people think in and the unit a future increment rule would
round from; integers sum exactly, where fractional hours accumulate floating-point error in exactly
the column that becomes money.
**Why "nearest, floor of one"** rather than truncating: truncation turns a 50-second timer into a
zero-minute entry, which the column rightly refuses; rounding up always would add, on average, half
a minute to every entry in the firm's favour. Nearest is neutral; the floor of one exists only so a
stopped timer never silently records nothing.
**Why no increments**: rounding to 6- or 15-minute blocks is `US10-EP10-CFG-ConfigureTimeTrackingRules`
(IT3) and is a pricing policy. Applying it here would destroy information a firm cannot recover.
**Why Mexico City**: `013` (`calendar.repository.ts:16`) and `015`/Decision 7 already fixed the
firm's day to that zone; a 23:30 timer filed on the next day would be wrong for every firm this
product serves.
**Why the start day**: a timer across midnight is one sitting of work; splitting it in two entries
would invent a second act the person never performed.

### Decision 7 — Hours are internal; the client does not see them

*Ratified by Jero 2026-10-09.*

**Taken**: no portal archetype holds any row; `US13-EP08-TTK-ViewClientHoursPortal` stays TBD behind
`EP13`.
**Why**: `EP13` is unvalidated (Recognised Technical Debt item 2) and has no onboarding flow (item
3). Descriptions are written by attorneys for themselves and may carry privileged strategy; showing
them to a client is a publication decision per entry, the same question `008`'s note visibility
raises, and it is not this slice's to take.

### Decision 8 — Reading one's own timesheet is not audited

*Ratified by Jero 2026-10-09.*

**Options**: (A) audit every timesheet read; (B) audit none.
**Taken: B.** The list routes write no audit entry; every mutation writes exactly one.
**Why, given Principle V names time entries**: Principle V asks for a record of *access to* time
entries because the record is evidence of who looked at whose work. Here the only reader of an
entry is the person who recorded it, and the list discloses nothing they did not write. The product
is consistent on this: every **list** is unaudited (`006`'s case list, `007`/FR-021's document list,
`013`'s calendar, `023`'s firm-wide documents), and the audited reads are single-resource opens of
matter content (`006`/FR-023 `case.read`, `007`'s preview and download). A range control that
re-reads on every click would bury the log in a person reading their own week.
**When this changes**: the first route that lets one person read **another's** time (a team view, a
billing export) is an access in Principle V's full sense and must be audited — Exposed Read
Contracts says so to whoever builds it.

### Decision 9 — Writes are nested under the matter; reads are flat

*Ratified by Jero 2026-10-09.*

**Taken**: `POST /tenant/cases/:caseId/time-entries` (manual), `POST …/time-entries/timer` (start),
`POST …/time-entries/timer/stop`, `PATCH …/time-entries/:id`, `POST …/time-entries/:id/void` —
all `assigned`, all `@ScopeTarget('caseId')`. Flat: `GET /tenant/time-entries`, `GET
/tenant/time-entries/timer`, `POST /tenant/time-entries/timer/discard` (row 51, `tenant`).
**Why nest**: the constitution wants permission and scope applied by the global mechanism, "never per
endpoint" — `006`'s resolver is that mechanism, and it can only see a case in the URL (finding #4).
`013` checks case reach inside its service instead (`calendar.service.ts`, `assertCaseReachable`),
which works but is exactly the manual application the constitution calls a design violation; this
slice takes the stricter precedent `007` set.
**Why discard is flat**: it is the one write that must work when the matter is **not** reachable
(FR-008) — a person taken off a matter mid-timer must be able to clear it, or they can never start
another. It touches only the caller's own running row, reveals nothing about the matter, and
records nothing on it.
**Rejected**: every route flat with service checks (`013`'s shape; weaker by the constitution's own
standard); stopping an unreachable timer (records time on a matter the person is walled from).

### Decision 10 — `SA` holds none of the four rows

*Ratified by Jero 2026-10-09.*

**Taken**: `SA` is excluded from 48–51 and from the `horas` navigation entry.
**Why**: a system administrator configures the firm's tool; they are not a timekeeper, and no
catalog story gives `SA` any time of their own (`US10` and `US11` give `SA` *configuration* rights,
which Decisions 4 and 5 resolve without a grant). Least privilege: a capability nobody in the role
needs is a capability not granted. `SA` still sees the four rows, read-only, in `/configuracion`.
**Cost accepted**: a one-person firm whose partner is also its administrator signs in under the `MP`
membership to record time — which is already how archetypes work (one per membership, `001`/FR-021).

### Decision 11 — `022`'s demo firm gets hours, unevenly

*Ratified by Jero 2026-10-09.*

**Taken**: a deterministic generator in `drizzle/demo/time-entries.ts`, seeded from `022`'s single
RNG, writes six weeks of working-day entries for the five timekeepers, only on matters each is
assigned to, with deliberately different weekly loads (the senior associate heaviest, the junior
associate lightest, the partner modest and mostly manual, the paralegal steady, the case manager
short coordination entries), a realistic mix of timer and manual sources, and descriptions a
Mexican litigator would write. Idempotent on a deterministic id.
**Why**: `022` exists so screens can be judged against data rather than guessed at
(`022`/FR-017); a timesheet with five identical rows says nothing. Uneven loads are also what make
SC-002's scope contrast visible in the demo.

---

## Assumptions

- `006`'s `case_assignment` (live rows, `unassigned_at IS NULL`) is the single source of "on the
  matter", for writes (the resolver) and reads (the query) alike.
- Every firm in the MVP keeps `America/Mexico_City` as its day (`013`, `015`).
- `GET /tenant/cases` is a suitable matter selector at MVP scale (it is what `013` and `023` use).
- A person records a modest number of entries; a 62-day range returns at most a few hundred rows,
  so the timesheet read is range-capped rather than cursor-paginated — `013`'s choice for the same
  reason.
- Docker is available on the implementing machine (it is on 2026-10-08), so the isolation, RLS and
  role suites run here rather than being cited.

## Dependencies

- `006-client-case-core` — `case_file`, `case_assignment` and the `assigned` resolver.
- `004-authorization-entitlements` — the registry, the matrix and both matrix tests.
- `001-tenant-foundation` — RLS, `TENANT_SCOPED_TABLES`, the audit interceptor and the
  no-context sweep.
- `016a` / `020` — the shell, feedback states, navigation registry and tokens.
- `013-calendar-core` — the newest domain module, whose shape (input module, repository with a
  visibility predicate, Mexico City ranges) this slice follows.
- `014-admin-ui` — the read-only matrix view that satisfies `US11` (Decision 5).
- `022-demo-firm-seed` — the seed this slice extends (Decision 11).

## Out of Scope

- **Rates, amounts and anything priced** (`US10-EP08` → `010`, Decision 4; `US03-EP15`).
- **Approval** (`US06-EP08`, IT2) and **export to invoicing** (`US07-EP08`, IT2).
- **Anybody else's hours**: team view (`US08-EP08`, IT3), utilization (`US12-EP08`, IT3), and the
  `015` KPI screen, which this slice does not touch.
- **Alerts for missing timesheets** (`US09-EP08`, IT3) and **increment / rounding rules**
  (`US10-EP10`, IT3).
- **Client visibility** (`US13-EP08`, TBD behind `EP13`, Decision 7).
- **Changing an entry's matter**, and corrections after 24 hours.
- **A timer on the matter's own page.** `/horas` is the one place; a per-matter shortcut is
  presentation a later slice may add without touching the API.
- **Non-matter time** (training, administration). Every entry belongs to a matter; firm-internal
  time is a different product question.

## Approval Checklist

- [x] Decision 1 — both capture methods, one entity — *Decided by Claude 2026-10-08; **ratified by Jero 2026-10-09***
- [x] Decision 2 — MP/AA/PL/CM record their own time on reachable matters; own-only reads; BM nothing — *Decided by Claude 2026-10-08; **ratified by Jero 2026-10-09***
- [x] Decision 3 — narrow correction (own, 24 h, void not delete) promoted to MVP — *Decided by Claude 2026-10-08; **ratified by Jero 2026-10-09***
- [x] Decision 4 — `US10-EP08` rates deferred to `010` — *Decided by Claude 2026-10-08; **ratified by Jero 2026-10-09***
- [x] Decision 5 — `US11-EP08` satisfied by fixed rows, read-only — *Decided by Claude 2026-10-08; **ratified by Jero 2026-10-09***
- [x] Decision 6 — integer minutes, nearest-minute timers, Mexico City day, no rounding rules — *Decided by Claude 2026-10-08; **ratified by Jero 2026-10-09***
- [x] Decision 7 — hours internal; `US13` stays TBD behind EP13 — *Decided by Claude 2026-10-08; **ratified by Jero 2026-10-09***
- [x] Decision 8 — reading one's own timesheet is not audited — *Decided by Claude 2026-10-08; **ratified by Jero 2026-10-09***
- [x] Decision 9 — writes nested under the matter, reads and discard flat — *Decided by Claude 2026-10-08; **ratified by Jero 2026-10-09***
- [x] Decision 10 — `SA` holds no time capability — *Decided by Claude 2026-10-08; **ratified by Jero 2026-10-09***
- [x] Decision 11 — demo firm gets six uneven weeks of hours — *Decided by Claude 2026-10-08; **ratified by Jero 2026-10-09***
- [x] Checked against the code, not the catalog — eleven findings recorded above
- [x] Permission matrix declared (rows 48–51) with Principle IV's four verbs and scope reasoning
- [x] `master-user-story-catalog.md` amended in this PR: EP08 header, `US03` → MVP (narrow), `US10` → 010, `US11` → fixed rows, still-open item 7
- [x] Zero `[NEEDS CLARIFICATION]` markers
