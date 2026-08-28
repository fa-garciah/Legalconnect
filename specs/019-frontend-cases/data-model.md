# Data Model — The Case Register

**Feature**: `019-frontend-cases` | **Date**: 2026-08-28
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Research**: [research.md](./research.md)

**This slice persists nothing.** No table, no column, no migration. `006` owns the data and
every rule about it. What follows is the view model: the wire shapes these screens read, the
form model they edit, the validation the browser performs, and the map from control to
capability.

---

## Wire shapes, transcribed from `006`

`src/cases/types.ts`. Transcribed by hand from
[`006/contracts/case-api.md`](../006-client-case-core/contracts/case-api.md) and this slice's
own [case-list-filters.md](./contracts/case-list-filters.md) — never inferred from a live
response. A shape read off one payload holds until the second payload differs.

```ts
/** A catalog entry as it appears embedded in a case. */
interface CatalogRef {
  readonly id: string;
  readonly name: string;
}

/** One case, as the register receives it. */
interface CaseListItem {
  readonly id: string;
  readonly fileNumber: string;
  readonly client: { readonly id: string; readonly legalName: string };
  readonly status: CatalogRef;
  /** Null for a matter the firm has not typed. */
  readonly matterType: CatalogRef | null;
  /** Null for a consultative matter, which is heard nowhere. */
  readonly venue: CatalogRef | null;
  /** The court's own number. Independent of `venue`; either may be present without the other. */
  readonly venueCaseReference: string | null;
  /** Calendar days, `YYYY-MM-DD`. Never parsed into a Date — research D5. */
  readonly openedOn: string;
  readonly closedOn: string | null;
}
```

**`status` carries no `isClosing` here.** That flag lives on the catalog, and the register
joins it in — research D2.

```ts
/** An opened case. The list item, plus catalog retirement marks, plus the team. */
interface CaseDetail extends Omit<CaseListItem, 'client' | 'status' | 'matterType'> {
  readonly client: { readonly id: string; readonly legalName: string; readonly status: 'active' | 'inactive' };
  readonly status: CatalogRef & { readonly catalogStatus: 'active' | 'retired' };
  readonly matterType: (CatalogRef & { readonly catalogStatus: 'active' | 'retired' }) | null;
  readonly team: readonly CaseTeamMember[];
}

interface CaseTeamMember {
  readonly membershipId: string;
  readonly roleOnCase: string;
  readonly assignedAt: string;
}
```

**`team` is live assignments only.** History persists in `006`'s table and no route exposes
it; a member whose firm membership was revoked is absent, because revocation closed their
assignments in the same transaction.

**`membershipId` is all there is.** There is no name — see spec Q2. The panel renders the
role and an identifier, and the column that would have shown a person is not built.

```ts
interface CaseListQuery {
  /** Matches file number OR client legal name. Trimmed; whitespace-only is absent. */
  readonly q?: string;
  readonly matterTypeId?: string;
  readonly venueId?: string;
  readonly limit?: number;
  /** Opaque. Passed back verbatim; never parsed or constructed. */
  readonly cursor?: string;
}

interface CaseListResponse {
  readonly items: readonly CaseListItem[];
  readonly nextCursor: string | null;
}

/** A catalog entry as the catalog endpoint returns it. */
interface CatalogEntry {
  readonly id: string;
  readonly name: string;
  readonly status: 'active' | 'retired';
  readonly retiredAt?: string | null;
  /** `case-statuses` only. The firm's declaration that this status ends a matter. */
  readonly isClosing?: boolean;
}
```

---

## The register's view model

What a row needs, after the catalog join:

| Column | Source | When absent |
|---|---|---|
| Número | `fileNumber` | never — required by `006` |
| Cliente | `client.legalName` | never |
| Tipo | `matterType.name` | `—` |
| Juzgado | `venue.name` | `—` |
| Fecha Inicio | `openedOn`, split not parsed | never |
| Estado | `status.name`, styled by the joined `isClosing` | never |

**Six columns.** The design's seventh, Abogado, is not built — spec Decision 2.

**The dash is load-bearing.** A matter with no type and a matter whose type failed to render
must not look the same (FR-004). `—` says the record is like that; blank says the page is.

### Badge treatment

| Joined `isClosing` | Treatment |
|---|---|
| `true` | The closed treatment |
| `false` | The open treatment |
| unknown — catalog read failed | The neutral treatment; the register still renders (research D2) |

Two treatments and a fallback. Not four, and never keyed to a name.

---

## The create form model

`CaseFormValues` — deliberately not `CaseListItem`:

| Field | Type | Notes |
|---|---|---|
| `clientId` | `string` | chosen from a searching combobox, not typed |
| `fileNumber` | `string` | the firm's own number, unique within the firm |
| `caseStatusId` | `string` | required; the status the matter starts in |
| `matterTypeId` | `string` | optional — empty string in the form, omitted on the wire |
| `venueId` | `string` | optional — same |
| `venueCaseReference` | `string` | optional — the court's number, free text |
| `openedOn` | `string` | optional; `006` defaults it to today |

**No `closedOn`.** It is derived by the server from the status (`006/FR-008a`), and a form
field for it would create a second way for the two to disagree. `006` refuses a request
carrying it.

**No team.** Creation assigns nobody, deliberately (`006` Decision 3).

### Boundary conversions

Written once, in `src/cases/api.ts`, because a conversion done twice will disagree with
itself.

| Direction | Rule |
|---|---|
| Form → wire | `fileNumber` and `venueCaseReference` trimmed; an empty optional becomes **omitted**, not `null`, not `''` |
| Form → wire | `openedOn` omitted when blank, so `006` applies its own default rather than receiving an empty string |
| Wire → screen | dates split, never parsed (research D5) |
| Query → wire | `q` trimmed; whitespace-only omitted entirely |

---

## Validation, and the line it does not cross

`src/cases/schema.ts`.

| Field | Assertion | Message (Spanish, FR-020) |
|---|---|---|
| `clientId` | present | "Selecciona el cliente." |
| `fileNumber` | non-empty after trimming | "Ingresa el número de expediente." |
| `fileNumber` | ≤ 100 characters | "El número de expediente es demasiado largo." |
| `caseStatusId` | present | "Selecciona el estado inicial." |
| `openedOn` | if present, a real calendar date | "Ingresa una fecha válida." |

### What the browser does not assert, and why

| Not asserted | Whose knowledge it needs |
|---|---|
| Whether the file number is already used | The server's. `006` refuses on the database's unique violation rather than a prior check, because a read-then-write passes a sequential test and still lets two concurrent callers both succeed |
| Whether the client is still available | The server's. A client can be withdrawn between the picker loading and the form saving |
| Whether a catalog entry is still active | The server's, for the same reason |
| Whether the caller may create at all | `004`'s. Hiding a control is not enforcement |

**When browser and server disagree, the server wins**, and its refusal renders against the
form with what was typed preserved (FR-038). That is the normal arrival path for facts the
browser cannot know — not an error case.

---

## Control → capability map

`FR-017`. Read from `018`'s mirror, never from an inline list of roles.

| Control | Capability (006 row) | Rendered for |
|---|---|---|
| The register, and the navigation entry | `case.read_list` (29) | MP · AA · PL · CM · SA |
| A row opening its record | `case.read` (30) | MP · AA · PL · CM · SA |
| "Nuevo Expediente", and the create form | `case.create` (31) | MP · CM · SA |
| The status control on an opened case | `case.change_status` (32) | MP · AA · CM · SA |
| The filter selects' catalog reads | `case.read_catalog` (34) | all six |

**`BM` holds none of rows 29-33.** Billing sees the client register (`018`) and not the
caseload. The navigation entry is therefore not drawn for them, and the server refuses
regardless.

**`PL` reads and opens, and changes nothing.** They hold `case.read_list` and `case.read`
and neither `case.create` nor `case.change_status`.

**The mirror rows to add** to `frontend/src/authz/capability-matrix.ts`, and to `018`'s
hand-transcribed fixture in the same change:

```ts
'case.read_list':     new Set(['MP', 'AA', 'PL', 'CM', 'SA']),
'case.read':          new Set(['MP', 'AA', 'PL', 'CM', 'SA']),
'case.create':        new Set(['MP', 'CM', 'SA']),
'case.change_status': new Set(['MP', 'AA', 'CM', 'SA']),
'case.read_catalog':  new Set(['MP', 'AA', 'PL', 'CM', 'BM', 'SA']),
```

**A note the mirror cannot express.** `case.read` and `case.change_status` are
`assigned`-scoped. The mirror answers "may this archetype ever", which is the only question a
control needs to decide whether to draw itself. Whether *this* caller may reach *this* case
is the server's, and it answers `404`. A control drawn for an `AA` who turns out not to be on
the case is correct behaviour, and the refusal it earns is indistinguishable from a case that
does not exist (FR-010).

---

## Key entities

- **Case** — a matter. A file number unique within the firm, a client, a status, and
  optionally a type, a venue and the court's own reference. Opening date given; closing date
  derived.
- **Case team** — live assignments, each with a role. On the opened case only.
- **Catalog** — the firm's own statuses, matter types and venues. Per tenant. Entries retire
  rather than disappear; a retired entry still resolves on records that reference it and is
  not offered for new ones. Only a status declares `isClosing`.
