# Contract — Directory & Position Catalog API

**Feature**: `017-firm-directory` | **Constitution**: v1.4.0

> Refusals across every endpoint below follow `004/contracts/refusal.md` in full — the
> four-reason order, the wire mapping, the non-disclosure rules. This document adds only
> what is specific to these five routes: their shapes and the one new refusal FR-010
> introduces.

---

## 1. Position catalog

### `POST /tenant/directory/positions` — create a position

**Capability**: `directory.manage_catalog` · **Audit**: `position.created`

```json
// Request
{ "name": "Asociado Senior" }
```

```json
// 201
{ "id": "…", "name": "Asociado Senior", "status": "active", "createdAt": "…" }
```

`409 position_already_exists` (research.md D6) when an *active* position with the same
trimmed, case-insensitive name already exists in the tenant's catalog. This is a
same-tenant business refusal, not a 004 authorization refusal — it never fires for a
caller who already failed `directory.manage_catalog`, since that refusal is reached
first (004's ordering).

### `PATCH /tenant/directory/positions/:id/retire` — retire a position

**Capability**: `directory.manage_catalog` · **Audit**: `position.retired`

```json
// 200
{ "id": "…", "name": "Asociado Senior", "status": "retired", "retiredAt": "…" }
```

A `:id` naming another tenant's position, or no position at all, answers `404
not_found` — RLS makes a foreign position invisible before any business logic runs
(data-model.md's RLS section), so this is the same generic not-found every other
cross-tenant reach in this system uses.

A `:id` already retired answers `409 already_retired` (same shape as 001's
`AlreadyDeactivated`/002's `AlreadyRevoked` — idempotent-mutation-on-an-already-final-
state is refused, not silently accepted).

### `GET /tenant/directory/positions` — list the catalog

**Capability**: `directory.read`

```json
// 200
{ "items": [ { "id": "…", "name": "Socio", "status": "active" }, … ] }
```

Includes retired positions (labelled), so a screen rendering an existing assignment can
show *what it says*, distinct from what a NEW assignment may choose from (FR-008).
Unpaginated: a tenant's own catalog is bounded by how many ranks a firm actually has,
not by the record volume `001/FR-013`'s pagination convention was built for (audit
history, and — via this contract — the membership listing below).

---

## 2. Directory

### `PATCH /tenant/directory/entries/:membershipId/position` — assign a position

**Capability**: `directory.assign_position` · **Audit**: `directory.position_assigned`

```json
// Request — positionId: null clears the assignment (FR-002, "MAY be unset")
{ "positionId": "…" }
```

```json
// 200
{ "membershipId": "…", "positionId": "…", "positionName": "Asociado Senior" }
```

`404 not_found` when `:membershipId` names another tenant's membership (or none) — the
existing cross-tenant-refusal shape, per Story 1 scenario 3. **`422
position_not_in_catalog`** (FR-010) when `positionId` does not resolve to an *active or
retired* position in the caller's own tenant — this is the one refusal this slice
introduces beyond 004's four reasons and 001/002's existing ones, because it names a
business rule ("choose from the catalog") that is neither a permission, scope,
entitlement nor tenant-existence question. It fires only after 004's four checks have
already passed — a caller who fails `directory.assign_position` never learns whether the
named position id was valid at all, preserving 004/FR-023's non-disclosure ordering
inside this slice's own added refusal.

An **active** position may be assigned; a **retired** one may not be *newly* assigned
(FR-008) — attempting to assign a retired `positionId` also answers `422
position_not_in_catalog`, the same code as a nonexistent one, so a caller cannot use the
error response to distinguish "retired" from "never existed" for a position in their own
catalog either.

### `GET /tenant/directory` — read the directory

**Capability**: `directory.read`

```json
// 200
{
  "items": [
    { "membershipId": "…", "archetype": "AA", "positionId": "…", "positionName": "Asociado Senior" },
    { "membershipId": "…", "archetype": "MP", "positionId": null, "positionName": null }
  ],
  "nextCursor": "…" | null
}
```

Paginated via `common/http/pagination.ts` verbatim (FR-013, SC-010) — same cursor shape,
same `limit`/`cursor` query parameters the audit read already uses. Only **live**
memberships appear (Story 3 scenario 2); a revoked membership's `directory_entry` row
is untouched in storage but excluded from this listing by the same `membership.status =
'live'` filter every other membership-scoped read already applies.
