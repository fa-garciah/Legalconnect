# Feature Specification: The Case Register

**Feature Branch**: `019-frontend-cases`
**Created**: 2026-08-28
**Status**: Draft
**Input**: A reference design supplied by the product owner — the *Expedientes* screen — plus
`006`'s already-shipped case API, `018`'s design system, and `016a`'s shell.

> **Citation convention.** Requirements of slices 004, 006, 016a and 018 are cited as
> `004/FR-0NN`, `006/FR-0NN`, `016a/FR-0NN` and `018/FR-0NN`. Bare `FR-0NN` refers to this
> document.

---

## Why this slice matters beyond the screen

A firm's cases are the thing the product exists to hold. `006` built all of it — the record,
the team, the catalogs, the status transitions — nine months of API with **no way for anyone
to see it**. This slice is the first surface.

It is also the first screen in the product to sit on the `assigned` scope kind. `004`
declared that kind; `006` implemented it and, with it, the rule that a case you are not on
must be indistinguishable from a case that does not exist — not `403`, `404`, byte for byte.
Every test of that rule so far has been a test of a response body. This slice is where a
person finds out whether it reads correctly to a human being, which is the only question a
test cannot answer.

---

## What `006` actually returns, checked rather than assumed

The reference design has seven columns and three filter controls. `006`'s list endpoint was
read before this spec was written, and it supports five of the seven columns and none of the
three filters.

| Design element | `GET /tenant/cases` provides |
|---|---|
| Número | `fileNumber` ✅ |
| Cliente | `client.legalName` ✅ |
| Tipo | `matterType.name` ✅, nullable |
| Juzgado | `venue.name` ✅, nullable |
| Fecha Inicio | `openedOn` ✅ |
| Estado | `status.name` ✅ |
| **Abogado** | ❌ **absent from the list item** |
| **Buscar por número, cliente o descripción** | ❌ endpoint accepts `limit` and `cursor` only |
| **Todos los tipos** (matter-type filter) | ❌ same |
| **Todos los juzgados** (venue filter) | ❌ same |

**The Abogado gap is not a small one, and it has a second floor.** The case team lives on
`GET /tenant/cases/:caseId`, and that route is `assigned`-scoped *and* writes a `case.read`
audit entry on every interactive read (`006/FR-023`). Filling the column by fetching each row
would be fifty requests and **fifty audit entries per page view** — inflating the very log
Principle V requires be trustworthy. There is no version of per-row fetching that is
acceptable.

Extending the list item would solve that, and still not produce the column the design shows.
**No slice in this product stores a person's name.** Checked against the live schema:
`identity` carries `subject`, `email` and an MFA timestamp; `membership` carries an archetype;
`017`'s `directory_entry` carries a position and nothing else. The most human-readable
identifier available today is an email address. A column that renders `legal@despacho.mx`
where the design renders *A. Méndez* is not the design, and closing that gap is slice `003`'s
work, not this slice's.

**The filter gap has a precedent that forbids the easy fix.** `018/FR-003` established that
this application never re-filters a response it has already received: the server filters
before the page boundary, so filtering again shortens pages while the cursor still promises
more — quietly breaking a guarantee the server tested. That rule applies here unchanged, so
the three filter controls cannot be built client-side.

**The Estado badge has a subtler problem.** The design shows four colours — *En proceso*,
*Urgente*, *En espera*, *Concluido*. But case statuses are a **per-tenant catalog** of
arbitrary names, and the only meaning the catalog carries is `isClosing`, the firm's own
declaration that a status ends a matter (`006/FR-008a`). The product must not infer urgency,
or anything else, from the string "Urgente" — a firm is free to call it something else, or
to have no such status at all. *Urgente* is a real product concept (`US05-EP02-CSM`), and
`006` has nowhere to put it.

Each of these three was a scope question rather than a design question. All three were put
to the product owner on 2026-08-28 and are resolved in [Clarifications](#clarifications):
**`006`'s list endpoint gains the three filters**, the Abogado column **waits for identity**,
and the status badge distinguishes **closing from open** and nothing else.

That first answer makes this a full-stack slice. It is the only one of the three that changes
a shipped contract, and the change is a copy of a pattern already tested in the same module —
`006`'s own client list applies a trimmed `q` and a filter inside the query, before the page
boundary.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See the firm's cases (Priority: P1) 🎯 MVP

`US03-EP02-CSM-ViewCaseList`. An internal member opens *Expedientes* and sees the matters
they are entitled to see, in a table whose columns are the ones they would ask for: the file
number, the client, what kind of matter it is, where it is being heard, when it opened, and
where it stands.

**Why this is P1**: it is the first sight anyone in the firm has of their own caseload
through this product. Every other story here is an operation performed on a row of this
table, so nothing else can be reached until it exists.

**Independent Test**: seed cases across two tenants, sign in as each internal archetype in
turn, and confirm the page shows that archetype's own view of the register — everything for
a managing partner, only assigned matters for an associate, and an empty state rather than
an error for someone assigned to nothing.

**Acceptance Scenarios**

1. **Given** a firm with cases, **When** an `MP` opens the screen, **Then** every case in the
   tenant is listed, with all supported columns populated.
2. **Given** an `AA` assigned to two of the firm's twelve cases, **When** they open the
   screen, **Then** exactly those two are listed, and nothing indicates that others exist.
3. **Given** a `PL` assigned to nothing, **When** they open the screen, **Then** they see an
   empty state that says the register is empty for them and what to do about it — **not** an
   error, and not a refusal (`006`'s US3 scenario 5).
4. **Given** a case with no matter type and no venue, **When** it is listed, **Then** those
   cells read as deliberately absent rather than as a rendering fault.
5. **Given** more cases than fit one page, **When** the reader reaches the end, **Then** they
   can load the next page, and it continues the same set.
5a. **Given** a register of two hundred matters, **When** the reader types part of a file
   number or a client's name, **Then** only matching cases are listed, and a **full** page of
   matches is returned while more remain — not a short one.
5b. **Given** a type and a venue are both chosen, **When** the register loads, **Then** it
   shows the intersection, and an empty intersection reads as "nothing matched" rather than
   as an error.
5c. **Given** the reader is on page three of a filtered register, **When** they change a
   filter, **Then** paging restarts within the new filter.
5d. **Given** an `AA` assigned to two matters, **When** they search for a term that matches a
   third they are not on, **Then** it is not returned — a filter narrows their own register
   and never reaches past it.
6. **Given** the server is unreachable, **When** the screen loads, **Then** it shows an error
   with a retry, implying nothing about permission or plan.
7. **Given** a `BM`, **When** they attempt to reach the screen, **Then** it is not offered in
   the navigation, and the server refuses the underlying request regardless.

---

### User Story 2 - Open one case (Priority: P2)

`US04-EP02-CSM-ViewCaseDetails`, and the story that makes the `assigned` scope visible. A
member opens a row and sees the full record — including the case team, which the list cannot
carry.

**Why this is P2**: the list is useful alone; the detail is what makes it actionable. It is
separated from P1 because it is the only place in this slice that triggers an audited read
and the only place the 404-opacity rule can be observed.

**Independent Test**: open a case you are on and see it; contrive a request for a case you
are not on and confirm the response is indistinguishable from one for a case that does not
exist.

**Acceptance Scenarios**

1. **Given** a member assigned to a case, **When** they open it, **Then** they see the record
   and the live case team with each member's role on it (`US08-EP02-CSM`).
2. **Given** a case the caller is not assigned to, **When** its record is requested by any
   means, **Then** the screen renders exactly what it renders for a case that does not
   exist — same words, same shape, no timing tell.
3. **Given** an `MP` or `SA`, **When** they open any case in the tenant, **Then** it opens,
   because those archetypes satisfy the assignment rule unconditionally.
4. **Given** a case whose matter type has since been retired from the catalog, **When** it is
   opened, **Then** the type still resolves and is marked retired rather than vanishing
   (`006/FR-020`).
5. **Given** a member opens a case, **When** the read completes, **Then** exactly one access
   entry is recorded — not zero, and not one per re-render.

---

### User Story 3 - Record a new matter (Priority: P3)

`US01-EP02-CSM-CreateNewCase`. A case manager records a new matter — the client it is for,
the firm's own file number, what kind of matter it is, where it is being heard, and the
status it starts in.

**Why this is P3**: the register is useful before anything can be added to it, and a firm's
existing matters arrive by other means. But the screen shows the button, so a register that
cannot be added to is a screen that visibly offers something it does not do.

**Independent Test**: open the form, submit it empty and see every problem at once, fill it
correctly, save, and find the new matter in the register without reloading.

**Acceptance Scenarios**

1. **Given** the form is opened, **When** nothing has been touched, **Then** no errors are
   shown.
2. **Given** an empty form, **When** it is submitted, **Then** every problem is reported
   together, in Spanish, and **nothing is sent**.
3. **Given** a valid matter, **When** it is saved, **Then** the form closes and the matter
   appears in the register with no manual reload.
4. **Given** a file number the firm already uses, **When** it is saved, **Then** the refusal is
   shown against the form with everything typed still in place.
5. **Given** a client that has been withdrawn, **When** it is chosen, **Then** the refusal
   explains that the client is unavailable — and says nothing about whether a client with that
   id exists in another firm.
6. **Given** a matter with no venue, **When** it is saved, **Then** it is accepted. A
   consultative matter is not heard anywhere.
7. **Given** a freshly created matter, **When** the register reloads, **Then** it appears with
   nobody assigned — a legitimate state, not an error.
8. **Given** an `AA` or `PL`, **When** they view the register, **Then** no create control is
   offered, and the server refuses the request if it is issued anyway.
9. **Given** the closing date, **When** the form is filled, **Then** there is no field for it.
   It is the server's to derive.

---

### User Story 4 - Move a case forward (Priority: P4)

`US07-EP02-CSM-MonitorCaseStatus`. A member changes a case's status, and the register
reflects it without a manual reload.

**Why this is P4**: it is the smallest useful write, and it is where the closing-date rule
becomes visible — moving to a status the firm has declared as ending a matter stamps the
closing date, and moving away clears it, without anyone typing a date.

**Independent Test**: change a case's status through the screen, confirm the register
updates, confirm the closing date appears only for a closing status, and confirm the change
is refused for an archetype that does not hold it.

**Acceptance Scenarios**

1. **Given** a member holding the capability, **When** they change a case's status, **Then**
   the register shows the new status without a manual reload.
2. **Given** a status the firm has marked as ending a matter, **When** it is applied, **Then**
   the case shows a closing date nobody supplied.
3. **Given** the case already holds the chosen status, **When** it is submitted, **Then** the
   request is refused and the reader is told, rather than the change appearing to succeed.
4. **Given** a `PL`, **When** they view a case, **Then** no status control is offered, and the
   server refuses the request if it is issued anyway.

---

### Edge Cases

- **A case whose client has been withdrawn.** The client keeps resolving (`006/FR-008`); the
  row renders normally. Withdrawal bars *new* cases, it does not disturb existing ones.
- **A retired matter type or venue on an existing case.** Still resolves, marked retired.
- **A case with an empty team.** Legitimate and transient — a freshly created case has none
  until someone is assigned (`006` Decision 3). Reads as "nobody assigned yet", not as an
  error, and not as an empty cell.
- **`venueCaseReference` present with no venue.** A matter can carry the court's own number
  without the venue being catalogued. The two are separate fields and neither implies the
  other.
- **A very long client name or file number.** Truncates within its column; the table never
  pushes the page sideways (`018/SC-010`).
- **The catalog read fails while the case list succeeds.** The register still renders. Any
  decoration derived from the catalog degrades to its neutral form rather than blocking the
  screen.
- **Two members change the same case's status concurrently.** The second gets the server's
  refusal against the control, with the record refreshed — the pattern `018` established.

---

## Requirements *(mandatory)*

### Functional Requirements

**The register**

- **FR-001**: The system MUST present the firm's cases at a dedicated route reached from the
  existing navigation, and MUST flip that navigation entry from unavailable to available in
  the same change.
- **FR-002**: The register MUST show, per case: file number, client, matter type, venue,
  opening date and status.
- **FR-003**: The register MUST render the result set exactly as received. It MUST NOT filter,
  sort or otherwise reduce it locally (`018/FR-003`'s rule, unchanged).
- **FR-004**: A field the record genuinely lacks — no matter type, no venue — MUST be shown as
  deliberately absent, visibly distinct from a value that failed to render.
- **FR-005**: Dates MUST be shown in the form a Mexican firm reads them, and MUST NOT expose a
  wire format.
- **FR-006**: The register MUST offer forward paging while the server reports more, passing
  the server's cursor back unchanged and never constructing or parsing one.
- **FR-007**: The register MUST distinguish five states — loading, error, empty-because-you-
  have-no-assignments, empty-because-the-firm-has-no-cases, and populated — using the
  existing feedback components and adding no new one.
- **FR-008**: An empty register MUST NOT be presented as an error or a refusal, whichever of
  the two empty causes applies.

**Opening a case**

- **FR-009**: A row MUST be openable, and opening it MUST show the record together with the
  live case team and each member's role on it.
- **FR-010**: A case the caller is not entitled to MUST be presented **identically** to a case
  that does not exist. The interface MUST NOT distinguish them in wording, layout, or the
  presence or absence of any control.
- **FR-011**: Opening a case MUST result in exactly one recorded access per deliberate open —
  not one per render, and not one per row of the list.
- **FR-012**: A retired catalog entry on an existing case MUST remain visible and MUST be
  marked as retired.

**Recording a new matter**

- **FR-034**: Where the caller holds it, the system MUST offer a way to record a new matter,
  capturing its client, file number, status, and optionally its matter type, venue, the
  court's own reference and an opening date.
- **FR-035**: The client and the three catalog choices MUST be chosen from what the firm
  actually holds — active clients and active catalog entries — rather than typed as free text.
- **FR-036**: The system MUST validate what the browser can know before sending: that a file
  number and a client and a status are present, and that a supplied date is a date. It MUST
  NOT validate anything that needs the server's knowledge — whether a file number is already
  used, whether a client is still available, whether a catalog entry is still active.
- **FR-037**: All problems the browser can see MUST be reported together, and nothing MUST be
  sent for a form already known to be invalid.
- **FR-038**: A refusal MUST be rendered against the form with everything typed preserved.
  This is the ordinary way facts the browser cannot know arrive, not an error case.
- **FR-039**: The system MUST NOT offer a field for the closing date. FR-014 applies at
  creation too.
- **FR-040**: A successful creation MUST place the matter in the register without a manual
  reload, and MUST show it as having nobody assigned rather than hiding it or marking it
  faulty.

**Changing status**

- **FR-013**: Where the caller holds it, the system MUST offer a status change drawn from the
  firm's own catalog of active statuses.
- **FR-014**: The system MUST NOT offer, accept or send a closing date. That date is the
  server's to derive.
- **FR-015**: A refused status change MUST be shown against the control that attempted it,
  with the record refreshed where the refusal indicates it moved underneath the caller.
- **FR-016**: A successful change MUST be reflected in the register without a manual reload.

**Permission at the surface**

- **FR-017**: Every control MUST be gated on a capability identifier read from the existing
  mirror, never on an inline list of roles.
- **FR-018**: Hiding a control MUST be understood as cosmetic. The system MUST NOT rely on it
  for enforcement, and the server MUST refuse the underlying request identically whether or
  not the control was drawn.
- **FR-019**: The navigation entry for this screen MUST be visible only to the archetypes that
  hold the list capability.

**Presentation**

- **FR-020**: All copy MUST be Spanish, and MUST use the firm's vocabulary rather than the
  wire's.
- **FR-021**: The screen MUST use the existing design system and MUST introduce no colour
  literal.
- **FR-022**: Any visual distinction applied to a status MUST derive from something the
  catalog actually declares. The system MUST NOT infer meaning from a status's name.
  Concretely: a status the firm has declared as ending a matter MUST be visually distinct
  from one that has not, and no further distinction MUST be drawn. A firm that calls its
  final status *Archivado* MUST get the same treatment as one that calls it *Concluido*.
- **FR-023**: The screen MUST be usable at both a desktop and a mobile viewport, with no
  horizontal scrolling of the page body.

**Accessibility**

> WCAG 2.1 AA. The two below are the ones a dense data table most often loses; meeting them
> is necessary rather than sufficient.

- **FR-024**: The table MUST convey its structure to assistive technology — column headers
  associated with their cells — and every row action MUST identify which case it acts on.
- **FR-025**: Every control MUST be reachable and operable by keyboard with a visible focus
  indicator, and anything that opens over the register MUST return focus to whatever opened
  it, including on Escape.

**Scope questions carried by the reference design**

- **FR-026**: The register MUST NOT carry an Abogado column. The system stores no person's
  name, and a column of email addresses is not the column the design asks for. The register
  therefore has **six** columns, and this requirement exists so that the seventh's absence is
  read as a decision rather than as an omission. The case team remains visible on an opened
  case (FR-009), which is where `006` actually puts it.
**Filtering** *(this slice extends `006`'s list endpoint; see Decision 1)*

- **FR-027**: The register MUST offer a free-text search that matches a case's file number or
  its client's legal name, case-insensitively and on any part of either.
- **FR-028**: The register MUST offer a matter-type filter and a venue filter, each drawn from
  the firm's own catalog of active entries.
- **FR-029**: Every filter MUST be applied by the server, inside the query, **before the page
  boundary** — so that a full page is a full page of matches and the cursor refers to the next
  page of matches. This is `006`'s own discipline for the client list, and `018/FR-003`'s
  reason for existing.
- **FR-030**: A search term that is empty or only whitespace MUST be treated as absent rather
  than as a filter matching nothing, so that clearing the box restores the register.
- **FR-031**: Changing any filter MUST reset paging. The system MUST NOT request a later page
  of a set the reader is no longer looking at.
- **FR-032**: Filters MUST compose. Applying a type and a venue together MUST narrow to the
  intersection, and the empty intersection MUST render as the no-matches empty state rather
  than as an error.
- **FR-033**: The filters MUST NOT widen what a caller can see. The result set MUST remain
  bounded by assignment exactly as it is without filters — a filter is a narrowing of the
  caller's own register, never a way to reach beyond it.

### Capability Matrix *(required by Principle IV)*

**This slice declares no capability.** It renders `006`'s rows 29-35, and its permission
surface is a mirror of them. Reproduced here so a reviewer can check the screen against the
matrix without opening another document.

| Row | Capability | Scope | MP | AA | PL | CM | BM | SA |
|---|---|---|---|---|---|---|---|---|
| 29 | `case.read_list` | `tenant` † | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| 30 | `case.read` | `assigned` | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| 31 | `case.create` | `tenant` | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ |
| 32 | `case.change_status` | `assigned` | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ |
| 33 | `case.manage_team` | `assigned` | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ |
| 34 | `case.read_catalog` | `tenant` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

† `tenant` scope permits the call; the **result set** is filtered by assignment inside the
query. An `assigned`-scoped list would refuse a caller with no assignments, and the
requirement is that they see an empty list.

**`BM` holds nothing here.** Billing sees the client register (`018`) and not the caseload —
Principle VI draws its line at matter *content*, and a case is content.

### Key Entities

- **Case** — a matter. Carries a file number unique within the firm, a client, a status, and
  optionally a matter type, a venue and the court's own reference. Its opening date is given;
  its closing date is derived from the status.
- **Case team** — the live assignments on a case, each with a role. Not carried by the
  register; only by an opened case.
- **Catalogs** — the firm's own lists of statuses, matter types and venues. Per tenant.
  Entries retire rather than disappear, and a retired entry still resolves on records that
  reference it. Only a status declares whether it ends a matter.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member of the firm can find a specific matter and see its current state
  without leaving the register.
- **SC-002**: An associate assigned to two matters sees exactly two, and nothing on the screen
  reveals that the firm has others.
- **SC-003**: A member assigned to nothing sees an empty register with a next step, and
  **zero** error or refusal wording.
- **SC-004**: A case the caller is not entitled to and a case that does not exist produce
  responses that a person cannot tell apart, and neither can an inspection of the page.
- **SC-005**: Opening one case records exactly one access entry; listing fifty cases records
  **zero**.
- **SC-006**: For each of the five internal archetypes that reach this screen, the controls
  offered match that archetype's row exactly — none shown that the server would refuse, none
  hidden that it would permit.
- **SC-007**: A status change is reflected in the register within two seconds and without a
  manual reload; a closing status shows a closing date nobody typed.
- **SC-007a**: A case manager can record a new matter in under two minutes from an intake
  conversation (`US01-EP02-CSM`'s own measure), and it appears in the register without a
  reload.
- **SC-007b**: A form the browser knows is invalid produces **zero** requests, and reports
  every problem in one pass rather than one per attempt.
- **SC-008**: Every string on the screen is Spanish.
- **SC-009**: The screen carries no horizontal page scrolling at either viewport.
- **SC-010**: Every control is reachable and operable by keyboard, and focus is never lost to
  the top of the document.
- **SC-011**: The existing frontend and backend suites pass unchanged.

---

## Decisions Requiring Sign-Off

### Decision 1 — This slice changes `006`, and says so up front

Q1 made this full-stack. `006`'s `GET /tenant/cases` gains three query parameters and the
query behind it gains three predicates. Nothing else about `006` moves: no table, no
capability, no scope kind, no refusal shape, no audit action.

**Why this is safe to do here rather than as its own slice.** The change has an exact
precedent one file away — `006`'s client list already accepts a trimmed `q` and a filter, and
applies both inside the query before the page boundary, with tests asserting a filtered page
is a full page. This is that pattern applied to a second list.

**Why it must be done carefully anyway.** The case list's result set is bounded by
*assignment*, not just by tenant. A filter predicate written in the wrong place in that query
widens what a caller sees, which is not a bug about filtering — it is a tenant-and-scope
isolation failure. FR-033 states the requirement and it needs a test that an associate cannot
reach an unassigned matter through any filter.

### Decision 2 — The register shows six columns, and the seventh's absence is deliberate

Q2. Recorded as a decision rather than a gap so that a future reader comparing screen to
design finds the reason instead of filing a bug. It returns when slice `003` gives people
names.

### Decision 3 — Creating a case is in this slice

The design's *Nuevo Expediente* button is the screen's only call to action, and `006`'s
create route needs no change to support it. Leaving it out would ship a register nobody can
add to, from a screen that visibly offers to.

It is priced honestly: the form needs a client picker and three catalog pickers, which is the
largest single piece of work here after the filters. It is **User Story 3**, so if the slice
runs long it is droppable without touching Stories 1 and 2 — that is what the priorities are
for.

### Decision 4 — Status change is in; team management is not

Both are `assigned`-scoped writes and both are shipped in `006`. Status change is one field
and one control on an opened case (User Story 4). Managing the team is a screen of its own —
it needs a member picker, a role concept and its own permission story — and it is where the
`assigned` scope's second property becomes interesting: you must be on a case to change who
else is. `US14-EP02-CSM` stays unclaimed.

---

## Assumptions

- **The reader is already in a tenant.** The shell establishes tenant context and this screen
  inherits it; no screen in this slice chooses a firm.
- **There is no authentication yet.** Identity comes from the existing fixture seam until
  slice `003`. Archetype is switched by editing it, which is how each permission row is
  exercised.
- **Sorting is not in this slice.** `US06-EP02-CSM-SortCases` is a separate catalog story, and
  sorting has the same server-side constraint the filters do — a locally sorted page is a
  page sorted within an arbitrary window.
- **Deadlines, tasks and activity are not in this slice.** `US09`–`US13-EP02-CSM` need
  entities no shipped slice owns.
- **Managing the case team is not in this slice.** `006` shipped the routes and
  `US14-EP02-CSM` claims them; this slice *displays* the team and does not edit it. Adding
  and removing members is a screen of its own, and it is where the `assigned` scope's second
  interesting property — that managing a team requires being on it — becomes visible.
- **Opening a case is a panel over the register, not a separate route**, following `018`'s
  decision for the same reason: the reader's place in a long list survives it. If a case ever
  needs a shareable link, that reverses, and the reasoning is recorded rather than assumed.
- **The catalog is read once per screen, not per row**, so that decorating statuses costs one
  request rather than one per case.

---

## Dependencies

- **`006-client-case-core`** — the entire API this screen renders, plus the catalogs and the
  `assigned` scope resolver. Shipped, **and modified by this slice**: its list endpoint gains
  three filter parameters (Decision 1). Its contract moves with the code.
- **`018-frontend-clients`** — the design system, the feedback primitives, the capability
  mirror and its sync test, and the `can()` gate. Shipped.
- **`016a-frontend-shell`** — the shell, the navigation registry and the refusal classifier.
  Shipped; this slice flips the `expedientes` entry and adds nothing to the classifier.
- **`004-authorization-entitlements`** — the capability registry and the refusal ordering that
  makes an `assigned` refusal a `404`. Shipped.

---

## Out of Scope

- **An Abogado column.** Decision 2. No person's name exists to put in it.
- **An urgency badge.** `US05-EP02-CSM` stays unclaimed; `006` has nowhere to hold urgency and
  deciding what it means is not this slice's call (Q3).
- **Editing a case's client, file number, matter type or venue.** `006` ships no update route
  for those; there is nothing to render.
- **Assigning and unassigning team members.** Decision 4. The team is *displayed* here.
- **Sorting.** `US06-EP02-CSM`. It has the same server-side constraint the filters had — a
  locally sorted page is a page sorted within an arbitrary window — so it needs the same kind
  of change, and it was not asked for.
- **Deadlines, tasks, the activity feed, the client-facing activity report.** `US09`–`US13`.
  They need entities no shipped slice owns.
- **Any backend change beyond the three list filters.** Decision 1 bounds it: three query
  parameters and three predicates. No schema, no capability, no new route.

---

## Clarifications

### Session 2026-08-28

- Q: The design has a search box and two filter selects; `006`'s list endpoint accepts only
  paging parameters, and filtering locally is forbidden. → A: **Extend `006` with `q`,
  matter-type and venue filters.** This slice is full-stack.
- Q: The Abogado column shows a person's name, and no slice stores one. → A: **Omit the
  column** until identity ships. Do not substitute an email address.
- Q: The design gives four statuses four colours; the catalog declares only `isClosing`. →
  A: **Derive the distinction from `isClosing`** — closing versus open, and nothing further.

### Q1 — Do the filters come from the server, or not at all? *(resolved 2026-08-28)*

**Resolved: extend `006`.** The endpoint gains a trimmed `q` matching file number or client
legal name, plus `matterTypeId` and `venueId`, all applied inside the query.

**Why this over shipping the list alone.** The catalog phases the list as MVP and filtering as
IT2, which would have justified deferring. Two things outweighed it. A case register is a
list that only grows: a firm at two hundred matters cannot use one without search, so the
screen would ship already needing its successor. And the change is not novel — `006`'s client
list already does exactly this, with the trimming rule, the before-the-page-boundary
discipline and the tests to match. Copying a tested pattern in the same module is a smaller
risk than most frontend work.

**What it costs.** This is no longer a frontend-only slice, so `006`'s contract, its list
query and its tests all move, and the catalog amendment must claim `US02-EP02-CSM`.

### Q2 — What goes in the Abogado column? *(resolved 2026-08-28)*

**Resolved: nothing. The column is omitted.**

The finding that settled it is in *What `006` actually returns*: checked against the live
schema, no table in this product holds a person's name. `identity` has an email, `membership`
has an archetype, `017`'s directory entry has a position. The best any change within this
slice could produce is a column of email addresses where the design shows *A. Méndez*.

Substituting the email was rejected as the worse of the two: it fills the column with
something nobody asked for, and it has to be undone when identity ships. Adding names to
`identity` was rejected as `003`'s decision to make, not this slice's.

The team is still reachable — `006` puts it on the opened case, and FR-009 renders it there.

### Q3 — What may a status badge signal? *(resolved 2026-08-28)*

**Resolved: whether the status closes the matter, and nothing else.**

`isClosing` is the only meaning the catalog carries, and it is the firm's own declaration
rather than the product's inference. Two visual treatments, derived from it, work for a firm
that calls its final status *Archivado* just as well as for one that calls it *Concluido*.

*Urgente* is a real product concept — `US05-EP02-CSM` claims it — and it has nowhere to live:
there is no urgency anywhere in `006`'s model. Adding an `isUrgent` flag was rejected here
because it is a product decision about what urgency means and who sets it, and it should not
be settled as a side effect of colouring a badge. `US05-EP02-CSM` stays unclaimed.

---

## Approval Checklist

- [x] **Q1 resolved** (2026-08-28) — `006`'s list endpoint gains `q`, matter-type and venue
      filters. This slice is full-stack; Decision 1 bounds the change
- [x] **Q2 resolved** (2026-08-28) — the Abogado column is omitted. No person's name exists in
      the system; verified against the live schema, not assumed
- [x] **Q3 resolved** (2026-08-28) — the status badge distinguishes closing from open, derived
      from the catalog's own `isClosing`, and signals nothing further
- [x] Creating a case is in scope (Decision 3), as User Story 3, droppable without touching
      Stories 1 and 2
- [ ] Decision 1 signed off — this slice changes a shipped contract
- [ ] Decision 2 signed off — six columns, deliberately
- [ ] Decision 3 signed off — case creation included
- [ ] Decision 4 signed off — status change in, team management out
- [ ] `006/contracts/case-api.md` §1 amended for the three filter parameters, in the same
      change that implements them
- [x] Permission matrix declared, and declared as a **mirror** — this slice adds no capability
      (Principle IV)
- [x] Checked against `006/contracts/case-api.md` by reading it: five of seven columns and
      none of three filters are supported by the shipped endpoint
- [x] Catalog stories identified: `US03-EP02-CSM` (MVP) is this slice's core; `US04`, `US07`
      and `US08-EP02-CSM` follow; `US02` and `US05-EP02-CSM` are the two the clarifications
      decide
- [ ] `master-user-story-catalog.md` amended for whichever stories this slice claims, before
      any PR opens (Principle I)
