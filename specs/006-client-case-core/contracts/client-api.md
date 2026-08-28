# Contract — Client API

**Feature**: `006-client-case-core` | **Constitution**: v1.4.0

> Refusals follow `004/contracts/refusal.md` in full — the four-reason order, the wire
> mapping, the non-disclosure rules. This document adds only what is specific to these
> five routes.

Every route below is tenant-scoped and carries no `@ScopeTarget` — all four client
capabilities declare `tenant` scope, which RLS already confines to the caller's own firm.
Five routes, four capabilities: deactivate and reactivate share row 28 (FR-004a).

---

## 1. `GET /tenant/clients` — list clients

**Capability**: `client.read` (row 25) · **Audit**: none

Held by every internal archetype including `BM` — billing needs the party (Principle VI's
line is drawn at case *content*, not at the client record).

Query parameters `limit` and `cursor` — the `common/http/pagination.ts` primitive
unchanged, with `Cursor.occurredAt` carrying `created_at` — plus two filters (FR-002a):

| Parameter | Meaning |
|---|---|
| `q` | Case-insensitive substring of the legal name. Trimmed; an empty or whitespace-only value is treated as absent, not as a match-nothing filter. |
| `status` | `active` or `inactive`. Any other value is `400 validation_failed`. |

Both filters apply **inside the query, before the page boundary** — the same discipline
the case list uses for assignment filtering. A page of 50 is 50 matching clients, and
`nextCursor` refers to the next page of matches, not of all clients.

`GET /tenant/clients?q=torres&status=active` — this is
`US02-EP03-CLM-SearchAndFilterClients`, which the spec claims and therefore delivers.

```json
// 200
{
  "items": [
    { "id": "…", "kind": "organization", "legalName": "Grupo Torres, S.A. de C.V.",
      "rfc": "GTO120315AB1", "status": "active" },
    { "id": "…", "kind": "person", "legalName": "Juan Pérez",
      "rfc": null, "status": "inactive" }
  ],
  "nextCursor": null
}
```

Inactive clients **are** returned. Deactivation withdraws a client from new case creation
(FR-004); it does not hide the record from a firm that still has open matters against it.

## 2. `POST /tenant/clients` — register a client

**Capability**: `client.create` (row 26) · **Audit**: `client.created`

Held by `MP`, `BM`, `SA` and — per Q1 — `PL`.

```json
// Request
{ "kind": "person", "legalName": "Juan Pérez", "rfc": null }
```

```json
// 201
{ "id": "…", "kind": "person", "legalName": "Juan Pérez", "rfc": null,
  "status": "active", "createdAt": "…" }
```

`rfc` may be omitted or `null` (FR-002). No RFC format validation here — `001`'s
`normaliseRfc` is for *tenant* RFCs, where the value identifies the firm being billed. A
client's RFC becomes load-bearing when CFDI ships, and validating it now would refuse
legitimate records the firm has not finished collecting.

`400 validation_failed` when `legalName` is empty after trimming, or `kind` is not one of
`organization` / `person`.

**No uniqueness refusal.** Two clients may share a legal name within a tenant — see
data-model.md. This is deliberate and is asserted by a test, so a future reader does not
add a constraint believing one was forgotten.

## 3. `PATCH /tenant/clients/:id` — update a client

**Capability**: `client.update` (row 27) · **Audit**: `client.updated`, carrying previous
and new values

Held by `MP`, `BM`, `SA`, `PL` — the same set as create, per Q1.

```json
// Request — every field optional; omitted fields are unchanged
{ "legalName": "Juan Pérez Hernández", "rfc": "PEHJ850612XY3" }
```

```json
// 200 — the updated record
{ "id": "…", "kind": "person", "legalName": "Juan Pérez Hernández",
  "rfc": "PEHJ850612XY3", "status": "active", "updatedAt": "…" }
```

`kind` is **not** updatable. An organization does not become a person; a request naming
it is `400 validation_failed`. Changing it would silently invalidate whatever a future
billing slice inferred from it.

`404 not_found` for another tenant's client or none at all — RLS makes a foreign client
invisible before any business logic runs, so this is the same generic not-found every
cross-tenant reach in this system returns.

`409 already_deactivated` when the target is inactive. An inactive client's record is
frozen; correcting it means restoring it first, via §5 (FR-004a).

## 4. `POST /tenant/clients/:id/deactivate` — withdraw a client

**Capability**: `client.deactivate` (row 28) · **Audit**: `client.deactivated`

Held by `MP`, `BM`, `SA`. **Not `PL`** — Q1's split.

```json
// 200
{ "id": "…", "status": "inactive", "deactivatedAt": "…" }
```

Succeeds regardless of how many live cases reference the client (FR-003, US1 scenario 3).
Every one of those cases keeps resolving it (FR-008). What deactivation prevents is
*future* case creation — enforced at `POST /tenant/cases`, see
[case-api.md](./case-api.md) §2.

`409 already_deactivated` when it already is — the same shape `001`'s tenant deactivation
and `002`'s membership revocation already use. An idempotent-looking mutation onto a final
state is refused, so the audit log never gains a second deactivation of one client.

`404 not_found` for another tenant's client.

## 5. `POST /tenant/clients/:id/reactivate` — restore a withdrawn client

**Capability**: `client.deactivate` (row 28 — **the same row**) · **Audit**:
`client.reactivated`

FR-004a. Whoever may withdraw a client may restore one, so this adds no matrix row and no
new permission question. `PL` therefore cannot reactivate, for the same reason Q1 denies
them deactivation.

```json
// 200
{ "id": "…", "status": "active", "deactivatedAt": null }
```

The client is immediately available for new case creation again. Its cases were never
affected either way (FR-008).

`409 already_active` when the client is not withdrawn — the mirror of `deactivate`'s own
`409`, and refused rather than silently accepted so the audit trail never gains a
restoration that restored nothing.

**Why this exists at all.** Without it, a mis-click permanently bars a party from ever
having another matter opened against them, and the only remedy is a duplicate record —
which this slice explicitly will not merge. The clarification session of 2026-08-27 took
this as the cheaper half of that trade.

---

## 6. Audit actions introduced here

| Action | `target_entity` | Channel-gated | Metadata |
|---|---|---|---|
| `client.created` | `client` | no | — |
| `client.updated` | `client` | no | `{ from, to }` per changed field, `004/FR-009`'s shape |
| `client.deactivated` | `client` | no | — |
| `client.reactivated` | `client` | no | — |

`client.reactivated` is its own action rather than a `client.updated` with a status field:
FR-004a requires the round trip to be legible in the trail, and a status change buried in
an update's metadata is not.

No audit on the list read, filtered or not. A client list is not one of the entities
Principle V enumerates for access logging, and it discloses no matter content.

---

## 7. Refusal summary

| Situation | Status | Code |
|---|---|---|
| Archetype lacks the capability | 403 | `not_authorized` |
| Another tenant's client, or none | 404 | `not_found` |
| Empty name, bad `kind`, `kind` in a patch, bad `status` filter | 400 | `validation_failed` |
| Update or deactivate an inactive client | 409 | `already_deactivated` |
| Reactivate an active client | 409 | `already_active` |

Two new error classes: `ClientAlreadyDeactivated` and `ClientAlreadyActive`. `001`'s
existing `AlreadyDeactivated` is **not** reused — its message ("The tenant is already
deactivated.") is correct for tenants, and rewording it would make that slice's own
contract text wrong.
