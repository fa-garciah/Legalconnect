# Contract — Case & Case Team API

**Feature**: `006-client-case-core` | **Constitution**: v1.4.0

> Refusals follow `004/contracts/refusal.md` in full. This document adds what is specific
> to these six routes — and one thing no prior contract in this system has had to state:
> **the first `assigned`-scoped refusals**, and why two of the routes below answer `404`
> where a reader would expect `403`.

---

## 0. The rule that governs this whole document

Four of the six routes declare `assigned` scope. For those routes:

> A caller who is not on the case team receives **`404 not_found`**, byte-identical to the
> response for a case that does not exist. Not `403`. There is no field, no message, no
> status and no timing difference by which the two can be told apart.

This is spec FR-016/FR-017 and Decision 4, and it is already implemented: `refusalToHttp`
maps `scope` + `assigned` to `ResourceNotFound`
([refusal.ts:41](../../../backend/src/common/authz/refusal.ts#L41)), and the frontend
classifier already maps `not_found` to its opaque bucket. This slice writes no new
refusal plumbing.

**`MP` and `SA` never see these refusals** — they satisfy the `assigned` resolver
unconditionally (Decision 2).

Each `assigned`-scoped route declares `@ScopeTarget('caseId')` alongside its
`@Capability()`, which is what puts the case id on `ScopeRequest.targetId`. A route that
declares `assigned` scope without it fails the build (research D2).

---

## 1. `GET /tenant/cases` — list cases

**Capability**: `case.read_list` (row 29, **`tenant` scope**) · **Audit**: none

**This route declares `tenant`, not `assigned`, and that is load-bearing.** The scope
check permits the call; the *result set* is filtered by assignment inside the query.
Research D3 explains why the alternative cannot work: an `assigned`-scoped list would
refuse a caller with no assignments, and the spec requires them to see an empty list.

Held by `MP`, `AA`, `PL`, `CM`, `SA`. Not `BM`.

Query parameters `limit` and `cursor` — `common/http/pagination.ts` unchanged — plus three
filters added by [`019-frontend-cases`](../../019-frontend-cases/contracts/case-list-filters.md):

| Parameter | Meaning |
|---|---|
| `q` | Case-insensitive substring of the **file number or the client's legal name**. Trimmed; an empty or whitespace-only value is absent, not a filter matching nothing. |
| `matterTypeId` | Restrict to one matter type. |
| `venueId` | Restrict to one venue. |

All three are applied **inside the query, before the page boundary**, exactly as the
assignment predicate is — so a page of 50 is 50 matching cases the caller may see, and
`nextCursor` refers to the next page of those.

**An unknown or foreign catalog id returns an empty page, not a refusal.** Refusing would let
a caller probe which catalog ids exist in their tenant by the difference between `422` and
`200`. A malformed uuid is `400 validation_failed` — a shape error, which discloses nothing.

> **The `q` predicate is one parenthesised condition containing its own `OR`.** `AND` binds
> tighter, so an unparenthesised version parses as
> `(EXISTS(assignment) AND file_number ILIKE x) OR (legal_name ILIKE x)` — and that second
> branch carries no assignment predicate, handing every matching case in the tenant to a
> caller assigned to none of them. It returns a *superset*, so the filtering tests still pass.
> `tests/integration/case-filter-scoping.test.ts` is what catches it.

```json
// 200 — an AA assigned to two matters
{
  "items": [
    { "id": "…", "fileNumber": "EXP-2026-0042",
      "client": { "id": "…", "legalName": "Grupo Torres, S.A. de C.V." },
      "status": { "id": "…", "name": "En Proceso" },
      "matterType": { "id": "…", "name": "Mercantil" },
      "venue": null,
      "venueCaseReference": null,
      "openedOn": "2026-03-04", "closedOn": null }
  ],
  "nextCursor": null
}
```

```json
// 200 — a PL assigned to nothing. Not an error.
{ "items": [], "nextCursor": null }
```

The empty case is spec US3 scenario 5, and it renders through 016a's **empty-state**
contract, never its error state. `case-list-scoping.test.ts` asserts `200` with zero
items, explicitly distinguishing it from any refusal.

Filtering happens before the page boundary, so a page of 50 is 50 visible cases and
`nextCursor` means what it says (data-model.md, "The list query's filter").

## 2. `POST /tenant/cases` — open a case

**Capability**: `case.create` (row 31, **`tenant` scope**) · **Audit**: `case.created`

`tenant`, not `assigned` — there is no case to be assigned to at the moment of creation.
Spec FR-015 names this exception explicitly.

Held by `MP`, `CM`, `SA`.

```json
// Request
{
  "clientId": "…",
  "fileNumber": "EXP-2026-0042",
  "caseStatusId": "…",
  "matterTypeId": "…",          // optional
  "venueId": null,              // optional — a consultative matter has none
  "venueCaseReference": null,   // optional — the court's own number, distinct field
  "openedOn": "2026-03-04"      // optional, defaults to today
}
```

```json
// 201 — same shape as a list item
{ "id": "…", "fileNumber": "EXP-2026-0042", "client": { … }, "status": { … },
  "matterType": { … }, "venue": null, "venueCaseReference": null,
  "openedOn": "2026-03-04", "closedOn": null }
```

Creation does **not** assign anyone. A freshly created case has zero assignments and is
readable only by `MP`/`SA` until someone is put on it — spec Decision 3, and a legitimate
transient state rather than an error.

**Refusals specific to this route:**

- `409 file_number_already_used` — a case in this tenant already carries that file number,
  compared trimmed and case-insensitively. Mapped from the database unique violation, not
  from a prior existence check: a read-then-write passes a sequential test and still lets
  two concurrent callers both succeed (`ProvisionService`'s own precedent for RFC).
- `422 client_not_available` — the named client is inactive (FR-004), or belongs to
  another tenant, or does not exist. **Deliberately the same refusal for all three**, on
  `PositionNotInCatalog`'s precedent: a caller must not be able to distinguish them.
- `422 catalog_entry_not_available` — a named `caseStatusId`, `matterTypeId` or `venueId`
  is retired, foreign, or absent. Again one refusal for all three causes, and it does not
  say *which* of the three ids was the problem.
- `400 validation_failed` — empty `fileNumber`, malformed date, missing `caseStatusId`.

## 3. `GET /tenant/cases/:caseId` — read one case

**Capability**: `case.read` (row 30, **`assigned` scope**) · **`@ScopeTarget('caseId')`**
· **Audit**: `case.read`, **channel-gated**

Held by `MP`, `AA`, `PL`, `CM`, `SA`. Not `BM`.

```json
// 200 — the list item shape, plus the team
{
  "id": "…", "fileNumber": "EXP-2026-0042",
  "client": { "id": "…", "legalName": "Grupo Torres, S.A. de C.V.", "status": "active" },
  "status": { "id": "…", "name": "En Proceso", "catalogStatus": "active" },
  "matterType": { "id": "…", "name": "Mercantil", "catalogStatus": "retired" },
  "venue": null,
  "venueCaseReference": "1234/2026",
  "openedOn": "2026-03-04", "closedOn": null,
  "team": [
    { "membershipId": "…", "roleOnCase": "lead", "assignedAt": "…" },
    { "membershipId": "…", "roleOnCase": "support", "assignedAt": "…" }
  ]
}
```

`catalogStatus` on the status and matter-type objects is how FR-020's "a retired entry
stays resolvable, marked retired" reaches the wire. 017's directory read does the same for
retired positions.

`team` lists **live** assignments only (FR-012 — history persists in the table, and no
route in this slice exposes it). A member whose firm membership has been revoked is
therefore absent: revocation closed their assignments in the same transaction (FR-012a), so
no join to `membership` is needed here and none is performed.

**`404 not_found`** for: a case in another tenant, a case that does not exist, **and a
case in this tenant the caller is not assigned to**. Section 0 above is the whole of the
reasoning. `assigned-scope-opacity.test.ts` asserts the three responses are byte-identical.

**Audit.** Exactly one `case.read` entry per interactive read, zero for
`x-channel: automated` (FR-023, SC-006). Principle V requires recording access to cases;
the gate exists so a monitoring job cannot inflate the log it watches, the same reasoning
001 applies to `audit.queried`.

## 4. `PATCH /tenant/cases/:caseId/status` — change a case's status

**Capability**: `case.change_status` (row 32, **`assigned` scope**) ·
**`@ScopeTarget('caseId')`** · **Audit**: `case.status_changed` with previous and new

Held by `MP`, `AA`, `CM`, `SA`. Not `PL`, not `BM`.

```json
// Request — the status, and nothing else
{ "caseStatusId": "…" }
```

```json
// 200
{ "id": "…", "status": { "id": "…", "name": "Concluido" }, "closedOn": "2026-08-27" }
```

**`closedOn` is derived, never supplied** (FR-008a). Moving to a status the firm has marked
as ending a matter stamps today's date; moving to any other status clears it. A request
carrying `closedOn` is `400 validation_failed` — the field is output-only, and accepting it
would create a second way for the two to disagree.

Which statuses end a matter is the firm's own declaration, held on its `case_status`
catalog entries ([catalog-api.md](./catalog-api.md) §2). The product never infers it from a
name: the catalog is per tenant, so *Concluido* means nothing to the product that
*Archivado* does not.

- `422 catalog_entry_not_available` — the named status is retired, foreign, or absent.
- `422 same_status` — the case already holds it. Refused rather than silently accepted, so
  the audit log never gains a no-op status change.
- `404 not_found` — foreign, absent, **or not assigned**. Section 0.

## 5. `POST /tenant/cases/:caseId/team` — assign a member

**Capability**: `case.manage_team` (row 33, **`assigned` scope**) ·
**`@ScopeTarget('caseId')`** · **Audit**: `case.team_member_assigned`

Held by `MP`, `CM`, `SA`.

```json
// Request
{ "membershipId": "…", "roleOnCase": "collaborator" }
```

```json
// 201
{ "caseId": "…", "membershipId": "…", "roleOnCase": "collaborator", "assignedAt": "…" }
```

The audit entry's **subject is the membership**, not the case — matching 017's
`directory.position_assigned`, which records the membership whose position changed.

- `422 membership_not_available` — the named membership is revoked, belongs to another
  tenant, or does not exist. One refusal for all three.
- `409 already_assigned` — a live assignment already exists for this pair. Backed by the
  partial unique index (data-model.md D5), so two concurrent callers cannot both win.
- `404 not_found` — the acting caller is not on the case. Section 0. Note the shape this
  produces: a `CM` who is not on a case cannot add themselves to it. That is intended —
  `MP` and `SA` are the archetypes with tenant-wide reach, and staffing a matter you are
  not on is their act, not a `CM`'s.

## 6. `DELETE /tenant/cases/:caseId/team/:membershipId` — unassign a member

**Capability**: `case.manage_team` (row 33, **`assigned` scope**) ·
**`@ScopeTarget('caseId')`** · **Audit**: `case.team_member_unassigned`

```json
// 200
{ "caseId": "…", "membershipId": "…", "unassignedAt": "…" }
```

`DELETE` on the wire; **`UPDATE` in the database**. It sets `unassigned_at` and deletes
nothing — there is no `DELETE` grant on `case_assignment` for any role (FR-012). The verb
describes the caller's intent, not the storage.

**FR-011's immediacy is this route's whole point.** The unassigned member's very next
request for that case is refused, with no grace period and nothing to invalidate: the
resolver queries inside each request's own transaction, so there is no cached decision
that could survive. `assigned-scope-resolver.test.ts` asserts this under concurrent
interleaving, not just sequentially.

Unassigning one member leaves every other assignment untouched (US3 scenario 3).

- `409 not_assigned` — no live assignment for that pair.
- `404 not_found` — the acting caller is not on the case. Section 0.

---

## 7. Audit actions introduced here

| Action | `target_entity` | Channel-gated | Metadata |
|---|---|---|---|
| `case.created` | `case_file` | no | — |
| `case.read` | `case_file` | **yes** | — |
| `case.status_changed` | `case_file` | no | `{ from, to }` |
| `case.team_member_assigned` | `membership` | no | `{ caseId, roleOnCase }` |
| `case.team_member_unassigned` | `membership` | no | `{ caseId }` |

Plus the four client actions ([client-api.md](./client-api.md) §6) and the three catalog
actions ([catalog-api.md](./catalog-api.md) §4) — **twelve** in total, all added to
`AUDIT_ACTIONS` and to `audit_event_action_known` in migration 0025. Eleven are mutations;
`case.read` is the one access record.

`case.read` is the only one joining `CHANNEL_GATED_ACTIONS`, alongside 001's
`audit.queried` and `tenant.registry_read`.

---

## 8. New error classes

Six, all in `common/http/errors.ts` alongside 017's `PositionNotInCatalog`:

| Class | Status | Code | Note |
|---|---|---|---|
| `FileNumberAlreadyUsed` | 409 | `file_number_already_used` | Names its cause plainly — the caller is a member of this tenant and could list its own cases anyway |
| `ClientNotAvailable` | 422 | `client_not_available` | One refusal for inactive / foreign / absent |
| `CatalogEntryNotAvailable` | 422 | `catalog_entry_not_available` | One refusal for retired / foreign / absent, and does not say which id |
| `MembershipNotAvailable` | 422 | `membership_not_available` | One refusal for revoked / foreign / absent |
| `AlreadyAssigned` | 409 | `already_assigned` | |
| `NotAssigned` | 409 | `not_assigned` | |

Plus `SameStatus` (422, `same_status`) — or reuse of 001's `SamePlan` shape, which is
identical in structure. **Recommend a distinct class**: `SamePlan`'s message names plans.

**None of these six is reachable by a caller who failed authorization first** — 004's
refusal ordering puts permission and scope ahead of every business refusal, so a `403` or
an opaque `404` is always returned before any of these can fire. That ordering is what
lets them name their causes plainly without leaking anything.
