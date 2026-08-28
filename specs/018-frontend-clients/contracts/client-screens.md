# Contract — Client Screens

**Feature**: `018-frontend-clients` | **Constitution**: v1.4.0

Three screens, five calls, one navigation entry. Everything here consumes `006`'s
[client-api.md](../../006-client-case-core/contracts/client-api.md) and `016a`'s shell;
nothing here defines a new wire shape.

> **The rule that governs every call below.** Requests go through `apiFetch`
> (`src/lib/api-client.ts`) and nothing else. It is the only place the active tenant and
> identity headers are attached, so a screen that built its own request would drop the one
> seam that guarantees they are present. There is no exception in this slice.

---

## 0. What is shared by all three screens

**Refusals.** Every failed call is classified by `classifyRefusal` and rendered by
`ErrorState`, both `016a`'s and both unmodified (research D6). No screen inspects a status
code to decide *copy*; it may inspect one to decide *placement* — see §2.4.

**Feedback states.** Loading, error and the two empty variants come from `016a`'s
components. This slice adds no fifth state.

**Copy.** Spanish throughout (FR-023). `016a`'s `spanish-copy.test.tsx` is extended with
this slice's components rather than duplicated.

**Controls.** Each is gated on a capability id read from the mirror, never on an archetype
list — data-model.md's control map. Hiding is cosmetic (FR-015): the server refuses the
underlying request identically whether or not the control rendered.

**One route.** `/clientes`, and nothing below it. A client's record is a **dialog** over the
directory (FR-027), so the filter, cursor and scroll position survive opening and closing
one. The prototype's `clientes/[id]` route is deliberately not ported. The accepted cost is
that no individual client has a shareable link; the accepted consequence is that the browser
back button leaves the directory rather than closing a dialog.

**Accessibility.** WCAG 2.1 AA across all three screens (FR-025, FR-026). Concretely, and
these are the four that a dialogs-and-forms slice gets wrong:

- Every control reachable and operable by keyboard, with a visible focus indicator.
- A dialog moves focus into itself on open, keeps it there while open, and **returns focus
  to whatever opened it on close** — including on Escape.
- Every input has a programmatically associated label.
- A validation error is announced to assistive technology and associated with its input.
  Red text beside a field is not an error a screen-reader user receives.

The ported components implement most of this already. The requirement exists because a
wrapper is the easy place to throw it away — a `<div onClick>` around a `<Button>`, a label
rendered as a sibling rather than associated.

---

## 1. `/clientes` — the directory (US1)

**Capability**: `client.read` · **Navigation**: the registry's first entry

### Calls

`GET /tenant/clients` with `limit`, and with `q`, `status`, `cursor` when present.

### Layout

A table with four columns — razón social, tipo, RFC, estado — and a row action opening the
record. Above it: the search field, the status filter, and the "Nuevo cliente" button
(hidden without `client.create`).

### States

| Condition | Renders |
|---|---|
| Request pending past `016a`'s threshold | `LoadingState` |
| `ok: false` | `ErrorState`, classified |
| 0 items, **no filter** | `EmptyState` — "Este despacho aún no tiene clientes", guidance toward creating the first |
| 0 items, **filter applied** | `EmptyState` — names what was searched, offers a control to clear it |
| Items present | The table, plus "Cargar más" when `nextCursor` is non-null |

The two empty states must read differently (FR-004, SC-005). Same component, different
`guidance`.

### Filtering

`q` matches any part of the legal name, case-insensitively — served by `006/FR-002a`.
Whitespace-only is treated as absent, so clearing the box restores the full directory.

The field **debounces** rather than issuing a request per keystroke — a request per
character multiplies load and makes results flicker as they are overtaken by later ones.

**The response is rendered as received.** No client-side re-filtering, ever (FR-003).
`006` filters before the page boundary so a page is a full page of matches; filtering again
here would shorten pages while `nextCursor` still promised more, defeating a guarantee
`006` tested (its SC-007a) from the one place `006` cannot observe.

Changing a filter resets the cursor.

### Paging

Forward only, via the opaque `nextCursor`. Passed back verbatim, never parsed. No page
numbers and no total count — `006` returns neither, and inventing them would mean counting
client-side over a filtered, paged set.

### Audit

None. `006` audits the *single-case* read, not the client list, and nothing here changes
that.

---

## 2. The client form (US2)

**Capabilities**: `client.create` (row 26) to open it empty; `client.update` (row 27) to
open it on an existing record.

One component for both. The difference is which call it makes and whether `kind` is
editable — not two forms that drift apart.

### 2.1 Create

`POST /tenant/clients`

```json
{ "kind": "person", "legalName": "Juan Pérez", "rfc": null }
```

`201` closes the dialog and the new client appears in the directory **without a manual
reload** (FR-011) — the list query is invalidated, not refetched by hand.

### 2.2 Edit

`PATCH /tenant/clients/:id`

```json
{ "legalName": "Juan Pérez Hernández", "rfc": "PEHJ850612XY3" }
```

**`kind` is omitted from the payload entirely.** Not sent-unchanged — omitted. `006`
refuses a `PATCH` naming it with `400 validation_failed`, so spreading the whole record
into the body earns a refusal on every save. The form renders `kind` as read-only text, not
as a disabled control, so nothing suggests it might become editable (FR-010).

### 2.3 Validation, before anything is sent

Per data-model.md's schema. Three properties this contract fixes:

- **Nothing is sent for a form the browser already knows is invalid** (SC-003).
- **Every problem appears together**, not one per attempt (FR-005, SC-002).
- **An untouched field shows no error** (FR-007) — errors appear on blur or on submit.
- **Each error is announced and associated with its input** (FR-026), not merely rendered
  beside it.

RFC *format* is not validated. `006` does not validate it either, deliberately, and a
browser stricter than the server refuses records the server would accept (research D4).

### 2.4 Server refusals

Rendered **against the form**, preserving what was typed (FR-009). This is the normal
arrival path for facts the browser cannot know — not an error case.

| `006` returns | Placement | Copy source |
|---|---|---|
| `403 not_authorized` | Form-level | `classifyRefusal` → role bucket |
| `400 validation_failed` | Form-level | Classifier's generic copy |
| `409 already_deactivated` (editing a withdrawn client) | Form-level, **and the record is refreshed** | Screen-level: the record moved under the caller |
| `404 not_found` | Form-level, generic | Classifier → opaque, deliberately indistinguishable from a cross-tenant refusal |

The `409` row is the only screen-level interpretation in this slice, and it is placement
and refresh behaviour rather than security copy. Putting it in `classifyRefusal` would make
a security module carry per-route knowledge — the line `016a`'s research D3 drew and this
slice keeps (research D6).

---

## 3. Withdraw and restore (US3)

**Capability**: `client.deactivate` (row 28) for **both** — `006/FR-004a`, whoever may
withdraw may restore.

### 3.1 Withdraw

`POST /tenant/clients/:id/deactivate`

**Confirmation is required before anything is sent** (FR-012), and the confirmation states
the consequence in both directions:

> *Este cliente no podrá usarse en nuevos asuntos. Los asuntos existentes no se ven
> afectados.*

That second sentence matters. Withdrawal sounds destructive and is not — `006/FR-008`
guarantees existing matters are untouched — and a confirmation that omitted it would make
people hesitate over a reversible action.

### 3.2 Restore

`POST /tenant/clients/:id/reactivate`

Reachable from a withdrawn client's own record (FR-013). No confirmation: it is the
undo, and `006/FR-004a` exists precisely so a mis-click is cheap.

### 3.3 Refusals

| `006` returns | Rendered as |
|---|---|
| `409 already_deactivated` / `already_active` | The record moved under the caller — say so and refresh |
| `403 not_authorized` | Role bucket. Reachable only if the control was shown to someone who should not have it — which would be a defect in the mirror, and is why `control-visibility.test.tsx` exists |
| `404 not_found` | Generic |

---

## 4. What this slice adds to shared files

Four files, each a single-purpose addition, each in the same change as the screen that
needs it:

| File | Addition | Required by |
|---|---|---|
| `src/authz/capability-matrix.ts` | 4 mirror rows | `016a/FR-025`, FR-016 |
| `tests/unit/capability-matrix-sync.test.ts` | The same 4 rows in `016a`'s hand-transcribed fixture | The mirror is only a mirror if something checks it |
| `src/shell/navigation-items.ts` | 1 entry, `clientes` | `016a/FR-002`, FR-017 |
| `tests/component/spanish-copy.test.tsx` | This slice's components | FR-023, SC-009 |

Nothing else `016a` owns is modified. In particular `refusal-bucket.ts`, `api-client.ts`,
`Shell`, `Header`, `NavigationMenu` and `TenantSwitcher` are untouched — research D7 lists
what each would cost.

---

## 5. Refusal summary

| Situation | Status | Bucket | Placement |
|---|---|---|---|
| Archetype lacks the capability | 403 | role | Form or page level |
| Another tenant's client, or none | 404 | opaque | Generic |
| Shape the server rejects | 400 | opaque | Form level |
| Record already in the target state | 409 | opaque | Form level, with a refresh |
| Network failure | — | opaque | Page level, retry offered |

No new error code and no new bucket. The classifier handles all of these today.
