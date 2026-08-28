# Contract — The Case Screens

**Feature**: `019-frontend-cases` | **Constitution**: v1.4.0

One route, one detail panel, two dialogs. Everything here consumes `006`'s API and `018`'s
design system; nothing here defines a wire shape except the three filters in
[case-list-filters.md](./case-list-filters.md).

> **The rule that governs every call below.** Requests go through `apiFetch` and nothing
> else. It is the only place the tenant and identity headers are attached, so a call that
> built its own request would reach the server as nobody, from nowhere. No exception.

---

## 0. What is shared by all four screens

**Refusals.** Classified by `classifyRefusal` and rendered by `ErrorState`, both `016a`'s,
both unmodified. No screen inspects a status code to choose *copy*. Two screens inspect one
to choose *placement* — §3.4 and §4.3 — and both are recorded there.

**Feedback states.** Loading, error and empty come from `016a`. This slice adds no fifth.

**Copy.** Spanish throughout (FR-020), and the firm's vocabulary rather than the wire's:
a matter is an *expediente*, its number an *número*, its court a *juzgado*.

**Controls.** Each gated on a capability id from `018`'s mirror, never an archetype list.
Hiding is cosmetic (FR-018).

**Dates.** Split, never parsed (research D5). A `YYYY-MM-DD` promoted to a `Date` renders a
day early for every user west of Greenwich.

**Accessibility.** WCAG 2.1 AA. The four that a dense table and two dialogs actually lose:

- Column headers associated with their cells, so a screen reader announces which column a
  value is in.
- Every row action names its case — "Abrir EXP-2026-0042", not the fifteenth "Abrir".
- A dialog or panel traps focus while open and **returns it to whatever opened it on close,
  including on Escape**. `018`'s `useDialogAnchor` exists for this and also restores the
  scroll position, without which opening a matter from row forty loses the reader's place.
- Every validation error announced and associated with its input, not merely placed beside
  it.

---

## 1. `/expedientes` — the register (US1)

**Capability**: `case.read_list` · **Navigation**: the registry's `expedientes` entry, flipped
from unavailable to available in this slice.

### Calls

`GET /tenant/cases` with `limit`, and with `q`, `matterTypeId`, `venueId`, `cursor` when
present. Plus one read each of `matter-types`, `venues` and `case-statuses` — the first two
for the filter selects, the third for the badge join (research D2).

### Layout

Title, and a "Nuevo Expediente" button hidden without `case.create`. Below it the filter row:
a search box, a matter-type select, a venue select. Below that a six-column table — Número,
Cliente, Tipo, Juzgado, Fecha Inicio, Estado — and "Cargar más" while `nextCursor` is
non-null.

**Six columns.** The design's Abogado is not built (spec Decision 2).

**No filter icon button.** The design has one beside the selects. Both filters this screen
has are already visible; a button that opens nothing would be a control that lies.

### States

| Condition | Renders |
|---|---|
| Pending past `016a`'s threshold | `LoadingState` |
| `ok: false` | `ErrorState`, classified |
| 0 items, **no filter**, caller has assignments elsewhere | `EmptyState` — the firm has no matters yet |
| 0 items, **no filter**, caller assigned to nothing | `EmptyState` — **different text**: you have no matters assigned |
| 0 items, **filter applied** | `EmptyState` — names what was searched, offers to clear |
| Items present | The table |

**Three empty states, and they must read differently.** The third is `018`'s pattern. The
first two are new and are the ones worth care: "this firm has no matters" and "you are on
none of this firm's matters" are different situations with different next actions, and a
`PL` told the firm has no cases would reasonably conclude the product is broken.

> **How the screen tells them apart.** It cannot, from the list alone — both are
> `{ items: [] }`. It distinguishes them by the caller's archetype: `MP` and `SA` see every
> matter, so an empty register genuinely means the firm has none. For the other three it
> means either. The copy for those says *no tienes expedientes asignados* and points at who
> to ask, which is true in both cases and useful in both.

### Filtering

Server-side, always (FR-029). The search box **debounces** — one request per question asked,
not one per keystroke. Changing any filter resets the cursor.

**The response is rendered as received.** No client-side re-filtering, ever (FR-003). Given N
items, render N.

### Paging

Forward only, cursor passed back verbatim. No page numbers, no total — `006` returns neither.

### Audit

**None, and it must stay none.** The register does not fetch a case record for any reason:
no per-row fetch, no prefetch on hover, no cache warming. Research D4 states the prohibition
and SC-005 tests it.

---

## 2. The opened case (US2)

**Capability**: `case.read` (`assigned` scope) · **Audited**: one entry per open.

### Calls

`GET /tenant/cases/:caseId`, once, when a row is opened.

### Presentation

A panel over the register, not a route — `018`'s decision for `018`'s reason: the reader's
filter, page and scroll position survive it. The accepted cost is that a matter has no
shareable link.

Shows the list item's fields plus `venueCaseReference` and the team. A retired catalog entry
still resolves and is marked retired (FR-012).

**The team shows a role and an identifier.** There is no name in the system (spec Q2). An
empty team reads as *sin asignar* — a legitimate state for a newly opened matter, not an
error and not a blank.

### The refusal that must not look like a refusal

`404` for a matter in another tenant, a matter that does not exist, **and a matter in this
tenant the caller is not on**. The screen MUST render the three identically (FR-010).

Since `016a`'s classifier already maps `not_found` to its opaque bucket, this needs no new
code — which is the point, and is why the requirement is easy to break later by adding a
special case. The test asserts the rendered output is identical for a fabricated id and for a
real unassigned one.

### One open, one entry

The query disables refetch on window focus, on mount and on reconnect, with `staleTime`
`Infinity` for the panel's life (research D3). Alt-tabbing away and back must not write a
second access entry for a matter opened once.

---

## 3. Recording a new matter (US3)

**Capability**: `case.create` (`tenant` scope) · **Audit**: `case.created`.

`POST /tenant/cases`.

### The form

Client (a searching combobox over `018`'s client list — research D6), file number, initial
status, and optionally matter type, venue, the court's reference and an opening date.

**Only active clients and active catalog entries are offered** (FR-035). A retired entry
still resolves on an existing matter and must not be offered for a new one.

**No closing-date field.** Derived by the server.

### Validation, before anything is sent

Per data-model.md. Three properties this contract fixes:

- Nothing is sent for a form the browser already knows is invalid.
- Every problem appears together, not one per attempt.
- An untouched field shows no error.

### 3.4 Server refusals

Rendered against the form, preserving what was typed (FR-038).

| `006` returns | Placement | Copy source |
|---|---|---|
| `409 file_number_already_used` | Form-level, **against the file-number field** | Screen-level: the number is taken |
| `422 client_not_available` | Form-level, **against the client field**, and the picker is refreshed | Screen-level: the client is unavailable |
| `422 catalog_entry_not_available` | Form-level, and the catalogs are refreshed | Screen-level: an option is no longer available |
| `403` / `404` | Form-level, generic | `classifyRefusal`, unchanged |

The first three are the only screen-level interpretations in this slice, and all three are
placement and refresh rather than security copy. Putting them in `classifyRefusal` would make
a security module carry per-route knowledge — the line `016a` drew and `018` kept.

**`client_not_available` says one thing for three causes** — inactive, foreign, or absent —
because `006` deliberately returns one refusal for all three. The screen must not elaborate.

---

## 4. Changing a case's status (US4)

**Capability**: `case.change_status` (`assigned` scope) · **Audit**: `case.status_changed`.

`PATCH /tenant/cases/:caseId/status`, body `{ caseStatusId }` and nothing else.

### 4.1 The control

On the opened case, offering the firm's **active** statuses. Absent without the capability.

### 4.2 The closing date is watched, not sent

The request carries the status only. A response to a closing status carries a `closedOn` the
caller never supplied; the panel shows it. Moving away clears it. `006` refuses a request
carrying `closedOn` at all.

### 4.3 Refusals

| `006` returns | Rendered as |
|---|---|
| `422 same_status` | Told plainly — the change was refused, not silently accepted, so the audit log gains no no-op |
| `422 catalog_entry_not_available` | The status is no longer available; catalogs refreshed |
| `404 not_found` | Generic and opaque. §2's rule applies: it may mean not-assigned, and must not say so |

### 4.4 After a successful change

The opened case is re-read and the register invalidated, so both show what `006` holds rather
than what the browser assumed. That re-read is a deliberate access and is legitimately
audited — the one case where a second entry for one matter is correct.

---

## 5. What this slice adds to shared files

| File | Change |
|---|---|
| `frontend/src/authz/capability-matrix.ts` | five mirror rows (data-model.md) |
| `frontend/tests/unit/capability-matrix-sync.test.ts` | the same five, transcribed **by hand from `006/spec.md`**, not copied from the mirror |
| `frontend/src/shell/navigation-items.ts` | `expedientes` flipped to available; `requiredArchetypes` narrowed to the five that hold `case.read_list` — **`BM` is removed** |
| `frontend/tests/component/spanish-copy.test.tsx` | this slice's components appended |
| `frontend/tests/e2e/responsive.spec.ts` | `/expedientes` at both viewports |
| `backend/src/modules/case-core/{case.controller,case.service,case.repository}.ts` | the three filters |
| `006/contracts/case-api.md` §1 | amended to match, in the same change |

**Nothing else in `016a` or `018` is touched.** In particular `refusal-bucket.ts`,
`api-client.ts`, `QueryBoundary` and the feedback components are consumed unmodified.
