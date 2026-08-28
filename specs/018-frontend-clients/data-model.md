# Data Model — Client Screens & the Design System They Need

**Feature**: `018-frontend-clients` | **Date**: 2026-08-28
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Research**: [research.md](./research.md)

**This slice persists nothing.** There is no table, no migration and no schema change —
`006` owns the data and every rule about it. What follows is the *view* model: the wire
shapes these screens read, the form model they edit, the validation the browser performs,
and the map from control to capability.

---

## Wire shapes, transcribed from `006`

`src/clients/types.ts`. Transcribed by hand from
[`006/contracts/client-api.md`](../006-client-case-core/contracts/client-api.md), never
inferred from a response — the same discipline `016a`'s capability mirror uses, and for the
same reason: a shape guessed from one payload is a shape that breaks on the second.

```ts
type ClientKind = 'organization' | 'person';
type ClientStatus = 'active' | 'inactive';

interface Client {
  readonly id: string;
  readonly kind: ClientKind;
  readonly legalName: string;
  readonly rfc: string | null;
  readonly status: ClientStatus;
}

interface ClientListResponse {
  readonly items: readonly Client[];
  /** Opaque. Passed back verbatim; never parsed or constructed. */
  readonly nextCursor: string | null;
}
```

**`nextCursor` is opaque and stays opaque.** `001` encodes it and `006` returns it; the
browser's only legitimate operations are "pass it back" and "check whether it is null". A
screen that decoded it would couple to an encoding neither slice promised.

**Field notes that shape the UI:**

- `rfc` is `null`, not `''`, when absent. The directory shows a dash rather than an empty
  cell, so "not collected" is visibly different from a rendering fault.
- `status: 'inactive'` means withdrawn. The word "inactive" never reaches the screen —
  Spanish copy, and *retirado* is the domain's term.
- `kind` is fixed at creation (`006/FR-010`). It renders as read-only on the edit form
  rather than as a disabled control, so nothing implies it might become editable.

---

## The form model

`ClientFormValues` — what the form holds, which is deliberately not `Client`:

| Field | Type | Create | Edit |
|---|---|---|---|
| `kind` | `ClientKind` | chosen | **absent from the payload** |
| `legalName` | `string` | required | editable |
| `rfc` | `string` | optional, empty string when blank | editable |

Two differences from the wire shape, both deliberate:

- **`rfc` is `string`, not `string | null`.** Controlled inputs need a string; `null` would
  make React switch the field between controlled and uncontrolled mid-life. The empty
  string is converted back to `null` at the boundary — see *Boundary conversions*.
- **`id` and `status` are absent.** Neither is editable through this form. `status` moves
  only through the withdraw and restore routes (US3), and giving the form a field for it
  would invite a control that sends it.

### Boundary conversions

Written once, in `src/clients/api.ts`, because a conversion done in two places is a
conversion that will disagree with itself.

| Direction | Rule |
|---|---|
| Form → wire, on create | `rfc: values.rfc.trim() || null`; `legalName` trimmed |
| Form → wire, on edit | The same, and **`kind` is omitted entirely** — `006` refuses a `PATCH` naming it, so sending it unchanged would be refused rather than ignored |
| Wire → form | `rfc: client.rfc ?? ''` |

The edit rule is the one worth a test of its own: the natural implementation spreads the
whole client into the payload, which sends `kind` and earns a `400`.

---

## Validation, and the line it does not cross

`src/clients/schema.ts`. Research D4 fixes the rules; this states them as a contract.

| Field | Assertion | Message (Spanish, FR-006) |
|---|---|---|
| `legalName` | non-empty after trimming | "Ingresa la razón social." |
| `legalName` | ≤ 250 characters | "La razón social es demasiado larga." |
| `kind` | one of the two | "Selecciona el tipo de cliente." |
| `rfc` | if present, ≤ 13 characters after trimming | "El RFC es demasiado largo." |

**Messages say what to do, not what failed** (FR-006). "Ingresa la razón social" rather
than "legalName is required".

### What the browser does not assert, and why

| Not asserted | Whose knowledge it needs |
|---|---|
| RFC *format* | Nobody's — **`006` deliberately does not validate it either**, so a browser that did would refuse records the server accepts. Research D4. |
| Whether a name already exists | The server's. `006` permits duplicates within one tenant, on purpose. |
| Whether the client may still be used | The server's — status can change between load and submit. |
| Whether the caller may perform this | `004`'s. FR-015: hiding a control is not enforcement. |

**When browser and server disagree, the server wins** and its refusal renders against the
form (FR-009). That path is the normal way facts the browser cannot know arrive — not an
error case.

---

## Control → capability map

`FR-014` hides a control the caller's archetype does not hold. This is the map, and it is
read from `016a`'s mirror rather than from an archetype list.

| Control | Capability (004 row) | Rendered for |
|---|---|---|
| The directory itself, and a client's record | `client.read` (25) | MP · AA · PL · CM · BM · SA |
| "Nuevo cliente" button, and the create form | `client.create` (26) | MP · PL · BM · SA |
| "Editar" control, and the edit form | `client.update` (27) | MP · PL · BM · SA |
| "Retirar" control | `client.deactivate` (28) | MP · BM · SA |
| "Restaurar" control | `client.deactivate` (28) — **the same row** | MP · BM · SA |

**Why a capability id rather than an archetype list.** A component that took
`allowedArchetypes={['MP','SA']}` would be a second source of truth, drifting from `004`
the moment a row changes, with nothing to catch it.
`capability-matrix-sync.test.ts` already fails the build when the mirror and `004`
disagree — so a control keyed to a capability id inherits that check for free, and an
archetype list would not.

**`PL` holds create and update and not deactivate.** That is `006`'s Q1, resolved
2026-08-27. This slice renders it; it does not reinterpret it.

**Withdraw and restore share row 28** — `006/FR-004a`: whoever may withdraw may restore.

**The mirror rows to add** to `src/authz/capability-matrix.ts`, and to `016a`'s fixture in
the same change:

```ts
'client.read':       new Set(['MP', 'AA', 'PL', 'CM', 'BM', 'SA']),
'client.create':     new Set(['MP', 'PL', 'BM', 'SA']),
'client.update':     new Set(['MP', 'PL', 'BM', 'SA']),
'client.deactivate': new Set(['MP', 'BM', 'SA']),
```

---

## Navigation entry

One entry in `src/shell/navigation-items.ts`, added in the same change (`016a/FR-002`,
FR-017):

```ts
{ id: 'clientes', label: 'Clientes', href: '/clientes',
  requiredArchetypes: ['MP', 'AA', 'PL', 'CM', 'BM', 'SA'] }
```

Six internal archetypes, matching `client.read`. The four portal archetypes hold nothing
here and `PO` is not a membership, so neither appears — consistent with `004/FR-020` and
`004/FR-008`.

This is the first entry the registry has ever held; `016a` shipped it empty by design,
noting that "a domain slice adds its own item here, plus the matching row in
`authz/capability-matrix.ts`, in the same PR that adds its screen." This slice is that.

---

## Where a record is shown

FR-027. One route, `/clientes`; a record is a dialog over it.

| Consequence | Detail |
|---|---|
| Preserved across open/close | The filter, the cursor, and scroll position (SC-014) |
| Not available | A shareable URL for an individual client — accepted cost |
| Back button | Leaves the directory; it does not close a dialog. Named as a known consequence rather than a defect |
| Not ported | The prototype's `clientes/[id]` route |

**Focus, which is part of this decision rather than separate from it.** A dialog takes focus
on open, keeps it while open, and returns it to the control that opened it on close —
including on Escape (FR-025). Without that last part a keyboard user who edits the fourth
row of page three lands back at the top of the document, which for a paged, filtered
directory means losing their place entirely.

---

## Screen state

Each screen is one of five states. `016a` supplies four of them and this slice must not
invent a fifth.

| State | Source | Rendered by |
|---|---|---|
| Loading | request pending past `016a`'s threshold | `LoadingState` |
| Error | `apiFetch` returned `ok: false` | `ErrorState`, through `classifyRefusal` |
| Empty — no clients at all | `items.length === 0` **and no filter applied** | `EmptyState`, with guidance toward creating the first |
| Empty — nothing matched | `items.length === 0` **and a filter is applied** | `EmptyState`, with a control to clear the filter |
| Populated | `items.length > 0` | The directory table |

**The two empty states are genuinely different and must read differently** (FR-004,
SC-005). "This firm has no clients yet" invites the first one; "nothing matched *torres*"
invites clearing the filter. Rendering the same copy for both is the failure this row
exists to prevent, and `016a`'s `EmptyState` already takes the `guidance` prop that
distinguishes them.

---

## Filter state, and the rule it must not break

| Parameter | Type | Sent when |
|---|---|---|
| `q` | `string` | non-empty after trimming |
| `status` | `ClientStatus` | a status filter is chosen |
| `limit` | `number` | always |
| `cursor` | opaque string | paging beyond the first page |

**Filtering happens once, on the server** (FR-003). The response is rendered as received.

`006/FR-002a` filters before the page boundary precisely so a page of 50 is 50 *matching*
clients. A screen that filtered the response again would shorten pages while `nextCursor`
still promised more — undoing the guarantee `006` tested for (its SC-007a) from the one
place `006` cannot see.

**A whitespace-only `q` is treated as absent**, matching `006`'s own normalisation, so
clearing a search box returns the whole directory rather than an empty result (US1
scenario 4).

**Changing a filter resets the cursor.** A cursor is a position in one result set; carrying
it into a different filter would page from a meaningless offset.

---

## The theme contract

`src/app/globals.css`. Research D3 explains why these are *defined* here rather than copied.

| Token group | Contents |
|---|---|
| Brand | `--color-primary` `#3730A3`, its hover `#2D2582`, `--color-primary-foreground` |
| Neutrals | background, foreground `#1A1A1A`, muted `#6B7280`, card, popover, border, input, ring |
| Semantic | destructive, accent, secondary |
| Radius | `--radius`, and the `lg`/`md`/`sm` derivations the components reference |
| Keyframes | `accordion-down`, `accordion-up` — moved out of the prototype's JS config |

**The contract the 49 components depend on**: these token names, unchanged. The components
reference them as utilities (`bg-primary`, `border-input`) and will render unstyled if a
name is missing — which is what `ui-smoke.test.tsx` (research D5) exists to catch.

**No screen in this slice writes a colour literal.** The prototype does, fifty times; that
is the practice being replaced, not the one being copied. A `bg-[#3730A3]` appearing in a
new file is a defect, and `contracts/design-system.md` states it as one.
