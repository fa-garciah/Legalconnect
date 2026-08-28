# Contract — Case Catalogs API

**Feature**: `006-client-case-core` | **Constitution**: v1.4.0

Three catalogs — `case-statuses`, `matter-types`, `venues` — behind one route shape,
parameterised by a path segment. All `tenant`-scoped; refusals follow
`004/contracts/refusal.md`.

This is 017's position-catalog surface repeated three times, deliberately. The only
structural difference is that 017 had one catalog and gave it its own paths, while these
three share a shape and share **one** capability pair (rows 34–35), so they share a
controller. Spec Decision 1 put them here; research D7 records why they seed the way they
do.

`{catalog}` below is one of `case-statuses` | `matter-types` | `venues`. Any other value
is `404 not_found` — the same generic response an unknown route already gives, so probing
the segment reveals nothing.

---

## 1. `GET /tenant/case-catalogs/{catalog}` — list one catalog

**Capability**: `case_catalog.read` (row 34) · **Audit**: none

Held by every internal archetype, including `BM`. A catalog is the firm's own vocabulary —
matter types and courts are not case content, and `BM` needs matter type to categorise
what it bills.

```json
// 200 — case-statuses carry one field the other two do not
{
  "items": [
    { "id": "…", "name": "En Proceso", "status": "active", "isClosing": false },
    { "id": "…", "name": "En Espera",  "status": "active", "isClosing": false },
    { "id": "…", "name": "Concluido",  "status": "active", "isClosing": true },
    { "id": "…", "name": "Archivado",  "status": "retired", "retiredAt": "…", "isClosing": true }
  ]
}
```

`isClosing` appears only on `case-statuses` (FR-008a) — it is the firm's declaration that
a case holding this status is closed, and it is what stamps a case's closing date
([case-api.md](./case-api.md) §4). `matter-types` and `venues` have no use for it and do
not carry it.

Retired entries **are** returned, so a UI can render the retired value a case still
carries (FR-020). A caller building a picker for a *new* case filters to `active`
client-side; the list read does not do it for them, because the same list serves both
purposes and hiding retired entries here would make an existing case's status
unresolvable.

Not paginated. A firm's catalogs are tens of rows, not thousands — 017's position catalog
read made the same call, and the case *list* (which does grow) is the paginated one.

## 2. `POST /tenant/case-catalogs/{catalog}` — add an entry

**Capability**: `case_catalog.manage` (row 35) · **Audit**:
`case_catalog.entry_created`

Held by `MP` and `SA` only — matching 017's row 23 exactly rather than inventing a
different rule for a structurally identical catalog.

```json
// Request — matter-types and venues
{ "name": "Amparo Directo" }
```

```json
// Request — case-statuses may also declare that they end a matter
{ "name": "En Apelación", "isClosing": false }   // optional, defaults to false
```

```json
// 201
{ "id": "…", "name": "En Apelación", "status": "active", "isClosing": false, "createdAt": "…" }
```

`isClosing` on a `matter-types` or `venues` request is `400 validation_failed` — silently
ignoring it would let a firm believe they had marked something they had not.

A tenant may mark **more than one** status closing, or **none at all**. Both are legal: a
firm that distinguishes *Concluido* from *Archivado* wants both to close a matter, and a
firm still deciding its vocabulary should not be blocked from using the system. FR-008a
requires the product to take the firm's answer, not to have an opinion.

`409 catalog_entry_already_exists` when an **active** entry with the same trimmed,
case-insensitive name exists in that tenant's catalog. Backed by the partial unique index
(data-model.md), which is the backstop; this refusal is the primary path, the same
division 001's RFC uniqueness and 017's `PositionAlreadyExists` already use.

A name matching a **retired** entry succeeds and creates a new row — the retire-then-
recreate pattern the partial index exists to permit, 017's D4/D6 unchanged.

`400 validation_failed` for an empty name after trimming.

## 2b. `PATCH /tenant/case-catalogs/case-statuses/:id` — change whether a status closes a matter

**Capability**: `case_catalog.manage` (row 35) · **Audit**:
`case_catalog.entry_updated`

```json
// Request
{ "isClosing": true }
```

```json
// 200
{ "id": "…", "name": "Concluido", "status": "active", "isClosing": true }
```

The only mutable field on any catalog entry. Names are **not** editable — 017 established
that for `position` (retire and recreate instead), and nothing here justifies diverging.
`isClosing` is different in kind: it is a declaration about meaning, not the meaning
itself, and a firm that mislabels it needs a correction rather than a new row that would
orphan every case already pointing at the old one.

Changing it does **not** retroactively re-date existing cases. A case's closing date was
stamped by the status change that set it ([case-api.md](./case-api.md) §4); revisiting
every case when the catalog changes would rewrite history the audit trail already records.
Cases re-date when they next move status, and not before.

`404 not_found` on any catalog other than `case-statuses`, or another tenant's entry.

---

## 3. `PATCH /tenant/case-catalogs/{catalog}/:id/retire` — retire an entry

**Capability**: `case_catalog.manage` (row 35) · **Audit**:
`case_catalog.entry_retired`

```json
// 200
{ "id": "…", "name": "Archivado", "status": "retired", "retiredAt": "…" }
```

Succeeds **regardless of how many cases reference the entry** (FR-020, spec Edge Cases).
Every referencing case keeps resolving it and renders it marked retired
([case-api.md](./case-api.md) §3's `catalogStatus`); it is offered for no new case
([case-api.md](./case-api.md) §2's `catalog_entry_not_available`).

There is **no delete route**, and no `DELETE` grant on any of the three tables for any
role. FR-019's "never hard-deleted" is the absent grant, not a rule someone must remember.

- `409 already_retired` — the same shape 001's `AlreadyDeactivated`, 002's
  `AlreadyRevoked` and 017's `PositionAlreadyRetired` already use.
- `404 not_found` — another tenant's entry, or none. RLS makes a foreign entry invisible
  before any business logic runs.

**Retiring the last active `case_status` is permitted.** It would leave a tenant unable to
open a new case until they add one, which is recoverable in one request and visible
immediately. A "must retain one" invariant would be the `LastAdministratorProtected`
pattern, and 004 introduced that only where the failure is *unrecoverable* — locking a
tenant out of its own administration. This is not that, and inventing the guard here would
be a requirement the spec does not contain.

---

## 4. Audit actions introduced here

| Action | `target_entity` | Channel-gated | Metadata |
|---|---|---|---|
| `case_catalog.entry_created` | `case_status` \| `matter_type` \| `venue` | no | — |
| `case_catalog.entry_updated` | `case_status` | no | `{ from, to }` on `isClosing` |
| `case_catalog.entry_retired` | `case_status` \| `matter_type` \| `venue` | no | — |

**Three actions for three catalogs**, with `target_entity` naming which one — research D8.
Nine actions would be vocabulary growth with no read that benefits: the audit surface
already filters by `target_entity`, so `case_catalog.entry_retired` + `target_entity =
venue` answers "who retired a court" without a dedicated action.

`case_catalog.entry_updated` only ever carries `case_status`, since §2b is the only update
route and it exists only for that catalog.

---

## 5. Provisioning

A tenant created through `POST /internal/platform/tenants` receives all three catalogs on
the same transaction that already writes its position catalog (FR-021, research D7). No
manual setup, and no partially provisioned state — a provisioning that fails partway
leaves no tenant and no catalog.

| Catalog | Default seed |
|---|---|
| `case_status` | En Proceso, En Espera, **Concluido** *(seeded with `isClosing: true`)* |
| `matter_type` | Civil, Mercantil, Laboral, Familiar, Penal, Amparo |
| `venue` | *(empty)* |

Seeding *Concluido* as closing means a firm that changes nothing still gets correct closing
dates from day one (FR-008a, SC-008b). It is a starting convenience like every other seed
value, and §2b makes it as changeable as the name is not.

**Venue seeds empty on purpose.** A firm's courts depend on its jurisdiction, and any list
this product shipped would be wrong for most firms and a statement about where they
practise. `venue` is optional on a case, so a firm opens matters from day one without
touching it. Research D7 records the reasoning; Principle III is the reason.

Every seeded entry is renamable and retirable the moment it exists.

---

## 6. Refusal summary

| Situation | Status | Code |
|---|---|---|
| Archetype lacks the capability (anyone but `MP`/`SA` writing) | 403 | `not_authorized` |
| Unknown `{catalog}` segment | 404 | `not_found` |
| Another tenant's entry, or none | 404 | `not_found` |
| Duplicate active name | 409 | `catalog_entry_already_exists` |
| Already retired | 409 | `already_retired` |
| Empty name, or `isClosing` on a non-status catalog | 400 | `validation_failed` |

Two new error classes: `CatalogEntryAlreadyExists` (409) and `CatalogEntryAlreadyRetired`
(409). 017's `PositionAlreadyExists` and `PositionAlreadyRetired` are not reused — their
messages name positions, and generalising them would make 017's own contract text wrong.
