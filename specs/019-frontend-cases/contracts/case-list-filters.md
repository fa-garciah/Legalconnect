# Contract — Three Filters on `GET /tenant/cases`

**Feature**: `019-frontend-cases` | **Amends**: [`006/contracts/case-api.md`](../../006-client-case-core/contracts/case-api.md) §1
**Constitution**: v1.4.0

> This is the **only** backend change in slice `019`. It adds three query parameters and
> three predicates. No table, no column, no migration, no capability, no scope kind, no
> refusal shape, no audit action.
>
> When it merges, `006`'s own §1 is amended to match. This document exists so the change can
> be reviewed against a statement of intent rather than against a diff.

---

## 1. What changes

`GET /tenant/cases` accepts three further query parameters, all optional.

| Parameter | Meaning |
|---|---|
| `q` | Case-insensitive substring of **the file number or the client's legal name**. Trimmed; an empty or whitespace-only value is treated as absent, not as a filter matching nothing. |
| `matterTypeId` | Restrict to one matter type. |
| `venueId` | Restrict to one venue. |

Unchanged: `limit`, `cursor`, the capability (`case.read_list`, row 29, `tenant` scope), the
response shape, the absence of an audit entry, and the rule that the result set is bounded by
assignment.

**`q` covers two fields, and not a third.** The reference design's placeholder reads
"Buscar por número, cliente o descripción". **A case has no description in `006`.** The
placeholder is corrected; the schema is not extended.

---

## 2. Where the predicates go, and why it is stated so precisely

They are appended to the `conditions: SQL[]` array that `CaseRepository.list` already builds,
and joined into the same `WHERE` with `AND`, before the same `LIMIT`.

```
WHERE  EXISTS (assignment …)                          ← unchanged, unless MP/SA
  AND  (cursor predicate)                             ← unchanged, when paging
  AND  (file_number ILIKE … OR legal_name ILIKE …)    ← new, PARENTHESISED
  AND  matter_type_id = …                             ← new
  AND  venue_id = …                                   ← new
ORDER BY … LIMIT n+1
```

**The parentheses around the `q` predicate are a correctness requirement, not formatting.**
`AND` binds tighter than `OR`. An unparenthesised

```
EXISTS(assignment) AND file_number ILIKE x OR legal_name ILIKE x
```

parses as `(EXISTS(assignment) AND file_number ILIKE x) OR (legal_name ILIKE x)` — and the
second branch has no assignment predicate at all. Every case in the tenant whose client name
matches is returned, to a caller assigned to none of them. That is not a filtering bug; it is
a scope-isolation failure, and it returns a *superset*, so every test that checks "the right
rows came back" still passes.

`case-filter-scoping.test.ts` exists for this and is written first.

**Before `LIMIT`, for the reason `006` already documented** for this same method: filtering
after the fetch turns a page of 50 into a page of 7 while `nextCursor` goes on claiming there
are 50 more.

---

## 3. What the filters may not do

- **They may not widen the result set.** For any caller and any combination of values, the
  cases returned are a subset of those returned with no filters at all. A filter narrows the
  caller's own register; it is never a route to someone else's.
- **They may not apply to `MP`/`SA` differently.** Those archetypes have no assignment
  predicate to begin with (`006` Decision 2); the filters compose with its absence exactly as
  they compose with its presence.
- **They may not change the empty case.** A caller with no assignments still receives
  `200 { "items": [], "nextCursor": null }`, filtered or not — never a refusal.

---

## 4. Refusals

No new refusal. Two notes on what does *not* happen:

- **An unknown `matterTypeId` or `venueId` is not an error.** It matches nothing and returns
  an empty page. Refusing would let a caller probe which catalog ids exist in their tenant by
  the difference between `422` and `200`, and the id is not the caller's to know unless it is
  already on a case they can see.
- **A malformed uuid in either parameter is `400 validation_failed`**, from the existing
  parameter validation. This is a shape error, not a lookup, and it discloses nothing.

---

## 5. Examples

```
GET /tenant/cases?q=torres&limit=50
GET /tenant/cases?matterTypeId=…&venueId=…
GET /tenant/cases?q=EXP-2026&matterTypeId=…&cursor=…
```

```json
// 200 — an AA assigned to two matters, filtered to one
{
  "items": [
    { "id": "…", "fileNumber": "EXP-2026-0042",
      "client": { "id": "…", "legalName": "Grupo Torres, S.A. de C.V." },
      "status": { "id": "…", "name": "En Proceso" },
      "matterType": { "id": "…", "name": "Mercantil" },
      "venue": null, "venueCaseReference": null,
      "openedOn": "2026-03-04", "closedOn": null }
  ],
  "nextCursor": null
}
```

```json
// 200 — the same AA, searching for a matter they are not assigned to. Not a refusal.
{ "items": [], "nextCursor": null }
```

That second response is the one worth reading twice. It is identical to the response for a
term that matches nothing at all — which is the point. A filter must not reveal, by refusing
or by behaving differently, that a matching case exists somewhere the caller cannot see.

---

## 6. Tests this contract requires

| Test | Tier | Asserts |
|---|---|---|
| `case-list-filters.test.ts` | contract | each parameter filters; `q` matches both fields; whitespace-only `q` is absent; filters compose; an unknown catalog id returns an empty page rather than a refusal |
| `case-filter-scoping.test.ts` | integration | **no value of any filter, in any combination, returns a matter the caller is not assigned to** — research D7's eight cases |
| existing `case-list-scoping.test.ts` | integration | still passes unchanged: the unfiltered register is still bounded by assignment, and the empty case is still `200` |
| existing pagination tests | contract | still pass: a filtered page is a full page while more remain |
