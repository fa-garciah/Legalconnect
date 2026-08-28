# Contract — Case Documents & Document Categories API

**Feature**: `007-document-management` | **Constitution**: v1.4.1

> Refusals follow `004/contracts/refusal.md` in full. Six of the eight routes below
> declare `assigned` scope, resolved via `006`'s existing resolver through the
> document's case reference (research.md D6 / data-model.md), never a document-owned
> scope kind. Section 0 below is `006/contracts/case-api.md` §0, restated for this
> surface rather than re-derived, because the reasoning is identical.

---

## 0. The rule that governs the six `assigned`-scoped routes

> A caller who cannot reach the document's case receives **`404 not_found`**,
> byte-identical to the response for a document, or a case, that does not exist. Not
> `403`. There is no field, no message, no status and no timing difference by which
> the two can be told apart.

This is `spec.md` FR-007 and Decision — already-implemented plumbing: `refusalToHttp`
already maps `scope` + `assigned` to `ResourceNotFound`
([refusal.ts](../../../backend/src/common/authz/refusal.ts)); this slice writes no new
refusal mechanism. **`MP` and `SA` never see these refusals** — they satisfy the
`assigned` resolver unconditionally (`006`'s Decision 2, inherited per FR-008).

**Every document-specific route below is nested under its case**
(`/tenant/cases/:caseId/documents/:id/...`), never a flat `/tenant/documents/:id`
shape. This is not a style preference: `@ScopeTarget(paramName)`
(`common/authz/declare.ts`) reads a route parameter directly —
`AuthorizationInterceptor` has no async-lookup extension point, only
`request.params[paramName]` (`common/authz/interceptor.ts`'s `scopeTargetOf`). `006`
never needed one because every one of its `assigned`-scoped routes already carried
`:caseId` in its own path; this slice follows the identical shape rather than
extending a mechanism `004` owns. Every route below declares `@ScopeTarget('caseId')`
against the URL's own `:caseId` segment — the resolver never sees a document id at
all. The repository layer separately confirms the named `:id` actually belongs to the
named `:caseId` (an ordinary `WHERE id = :id AND case_id = :caseId` predicate, not a
second authorization mechanism) — a document id that exists but under a different
case answers the same generic `404` as one that does not exist, preserving FR-007's
opacity without inventing a lookup the interceptor cannot run.

---

## 1. `POST /tenant/cases/:caseId/documents` — upload a document

**Capability**: `document.upload` (row 36, **`assigned` scope**) · **Audit**:
`document.uploaded`

Held by `MP`, `AA`, `PL`, `CM`, `SA`. Not `BM`.

```json
// Request — multipart/form-data: the file itself, plus optional metadata
{ "categoryId": "…" }   // optional — omitted or null resolves to "unclassified" (FR-010)
```

```json
// 201
{
  "id": "…", "caseId": "…", "categoryId": "…", "categoryName": "Contrato",
  "originalFilename": "contrato-arrendamiento.pdf", "mimeType": "application/pdf",
  "sizeBytes": 482913, "uploadedByMembershipId": "…", "uploadedAt": "…", "status": "active"
}
```

Sequence (research.md D4 — reserve then commit): within one transaction, the scope
check runs, the storage-limit check runs against `current + sizeBytes` (research.md
D3), and — if both pass — the `document` row is inserted and `tenant.storage_bytes_used`
is incremented. Only after that transaction commits does the object reach S3, at the
namespaced key `tenant/{tenantId}/case/{caseId}/{id}` (research.md D6). A failed S3
write triggers a compensating rollback of the row and the counter — no partial or
orphaned reservation survives (`spec.md` Edge Cases).

**Refusals specific to this route:**

- `404 not_found` — the caller cannot reach `:caseId` (Section 0).
- `403 limit_reached`, naming the limit — **004's own existing `LimitReached` class**
  (`common/http/errors.ts`), thrown directly by `documents.service.ts` rather than
  through `decide()`'s `usage`/`limit` seam: that seam is populated by
  `AuthorizationInterceptor` before any request body is parsed, and "the size the
  completed upload would add" (FR-013) is only known once the file itself has
  arrived. This is the first quantitative limit whose check cannot run through the
  generic pipeline unchanged — the class and wire shape are still `004`'s own,
  reused verbatim, not a slice-specific error. Distinguishable from the scope refusal
  above: different fact (a plan ceiling, not team membership), different remedy
  (upgrade plan vs. get assigned) — `spec.md` FR-013, SC-003.
- `400 validation_failed` — no file attached, or a MIME type/extension outside the
  allowed list (`spec.md` Decision 3's retained floor — not malware scanning, ordinary
  input validation).
- `422 catalog_entry_not_available` — a named `categoryId` is retired, foreign, or
  absent (`006`'s `CatalogEntryNotAvailable` shape, reused verbatim — this is the same
  refusal 006 already defined for its own three catalogs, not a new class).

## 2. `GET /tenant/cases/:caseId/documents` — list a case's documents

**Capability**: `document.read` (row 37, **`assigned` scope**) · **Audit**: none

Held by `MP`, `AA`, `PL`, `CM`, `SA`. Not `BM`.

```json
// 200
{
  "items": [
    { "id": "…", "categoryId": "…", "categoryName": "Contrato", "categoryStatus": "active",
      "originalFilename": "contrato-arrendamiento.pdf", "mimeType": "application/pdf",
      "sizeBytes": 482913, "uploadedByMembershipId": "…", "uploadedAt": "…" }
  ]
}
```

**This is a single named case's documents, not `006`'s tenant-wide case list shape**
(`006/FR-014`) — a total `404` refusal is correct here, not an empty result, because
the caller named one case directly rather than asking for everything they are
entitled to (`spec.md` Story 2 scenario 2's own contrast with `006`'s
`case.read_list`). Section 0 applies in full.

`categoryStatus` on each item is how FR-012's "a retired category stays resolvable,
marked retired" reaches the wire — `006`'s `catalogStatus` field on case reads does
the same thing for retired statuses/matter-types.

Not paginated at case level: a case's own document count is bounded by what one matter
accumulates, not by tenant-wide volume — the same call `006`'s catalog reads already
made for a firm's vocabulary size.

## 3. `GET /tenant/cases/:caseId/documents/:id/preview` — preview a document inline

**Capability**: `document.read` (row 37, **`assigned` scope**) ·
**`@ScopeTarget('caseId')`** · **Audit**: `document.previewed`, **channel-gated**

Held by `MP`, `AA`, `PL`, `CM`, `SA`. Not `BM`.

```json
// 200 — for PDF/image families (research.md D5): a short-lived, single-object URL
{ "previewUrl": "https://…", "expiresAt": "…", "renderAs": "pdf" | "image" }
```

```json
// 200 — for Office formats after server-side conversion (research.md D5)
{ "previewUrl": "https://…", "expiresAt": "…", "renderAs": "converted-pdf" }
```

```json
// 200 — no supported inline preview (spec.md Story 2 scenario 4)
{ "previewUrl": null, "renderAs": "unsupported", "downloadAvailable": true }
```

The pre-signed URL is issued **only after** this route's own scope check has already
passed (research.md D6) — never a substitute for it, always a consequence of it. Every
call re-runs the check; nothing about a prior successful preview is cached
(`spec.md` FR-014's live-read discipline, applied here to scope rather than
entitlement).

**Audit.** Exactly one `document.previewed` entry per interactive preview, zero for
`x-channel: automated` (`spec.md` FR-020, SC-009) — the same gate `006` already applies
to `case.read`.

- `404 not_found` — the caller cannot reach `:caseId` (Section 0), or `:id` names a
  document that does not exist or belongs to a different case.

## 4. `GET /tenant/cases/:caseId/documents/:id/download` — download a document

**Capability**: `document.download` (row 38, **`assigned` scope**) ·
**`@ScopeTarget('caseId')`** · **Audit**: `document.downloaded`, **channel-gated**

Held by `MP`, `AA`, `PL`, `CM`, `SA` — identical to row 37 (Decision 2). Not `BM`.

```json
// 200
{ "downloadUrl": "https://…", "expiresAt": "…", "filename": "contrato-arrendamiento.pdf" }
```

Same pre-signed-URL discipline as §3. Audited as its **own** distinct interactive
access (`spec.md` FR-020, Story 2 scenario 5) — a download and a preview of the same
document produce two separate audit entries, never one conflated action.

- `404 not_found` — the caller cannot reach `:caseId`, or `:id` belongs to a different
  case or does not exist (Section 0).

## 5. `PATCH /tenant/cases/:caseId/documents/:id/category` — change a document's category

**Capability**: `document.change_category` (row 39, **`assigned` scope**) ·
**`@ScopeTarget('caseId')`** · **Audit**: `document.category_changed` with previous
and new

Held by `MP`, `CM`, `SA`. Not `AA`, not `PL`, not `BM`.

```json
// Request
{ "categoryId": "…" }
```

```json
// 200
{ "id": "…", "categoryId": "…", "categoryName": "Correspondencia" }
```

- `422 catalog_entry_not_available` — the named category is retired, foreign, or
  absent. `006`'s `CatalogEntryNotAvailable` shape, reused verbatim (FR-011).
- `404 not_found` — the caller cannot reach `:caseId`, or `:id` belongs to a different
  case or does not exist (Section 0).

## 6. `PATCH /tenant/cases/:caseId/documents/:id/withdraw` — withdraw a document

**Capability**: `document.withdraw` (row 40, **`assigned` scope**) ·
**`@ScopeTarget('caseId')`** · **Audit**: `document.withdrawn`

Held by `MP`, `SA` only — narrower than reading or organizing (`spec.md` FR-017,
mirroring `006`'s own create/update-vs-deactivate split for clients).

```json
// 200
{ "id": "…", "status": "withdrawn", "withdrawnAt": "…" }
```

Sets `status = 'withdrawn'` and `withdrawnAt`; deletes nothing — there is no `DELETE`
grant on `document` for any role (FR-004). The content stays in S3, and
`tenant.storage_bytes_used` is **not** decremented (research.md D3, `spec.md` FR-015)
— a withdraw-then-reupload cycle must not be usable to evade the storage check.

- `409 already_withdrawn` — the same shape `006`'s `AlreadyRetired`-family classes use.
- `404 not_found` — the caller cannot reach `:caseId`, or `:id` belongs to a different
  case or does not exist (Section 0).

## 7. `PATCH /tenant/cases/:caseId/documents/:id/restore` — restore a withdrawn document

**Capability**: `document.restore` (row 41, **`assigned` scope**) ·
**`@ScopeTarget('caseId')`** · **Audit**: `document.restored`

Held by `MP`, `SA` only.

```json
// 200
{ "id": "…", "status": "active", "withdrawnAt": null }
```

Withdrawal and restoration are two **separate** audit entries (`spec.md` Story 4
scenario 2, SC-007) — never inferred from one toggle's before/after value.

- `409 not_withdrawn` — the document is already active.
- `404 not_found` — the caller cannot reach `:caseId`, or `:id` belongs to a different
  case or does not exist (Section 0).

---

## 8. `GET /tenant/document-categories` — list the catalog

**Capability**: `document.read_catalog` (row 42, **`tenant` scope`**) · **Audit**:
none

Held by `MP`, `AA`, `PL`, `CM`, `SA` — matching `006`'s inclusion of every internal
archetype but `BM` for case-adjacent reads. Not paginated — a firm's category catalog
is tens of rows, following `017`'s position catalog and `006`'s three catalogs.

```json
// 200
{
  "items": [
    { "id": "…", "name": "Contrato", "status": "active" },
    { "id": "…", "name": "Unclassified", "status": "active" },
    { "id": "…", "name": "Borrador Antiguo", "status": "retired", "retiredAt": "…" }
  ]
}
```

Retired entries are returned, so a document already carrying one still resolves it
(FR-012).

## 9. `POST /tenant/document-categories` — add a category

**Capability**: `document.manage_catalog` (row 43, **`tenant` scope`**) · **Audit**:
`document_category.created`

Held by `MP`, `SA` only — matching `006`'s row 35 and `017`'s row 23 exactly for a
structurally identical catalog.

```json
// Request
{ "name": "Correspondencia" }
```

```json
// 201
{ "id": "…", "name": "Correspondencia", "status": "active", "createdAt": "…" }
```

- `409 catalog_entry_already_exists` — an **active** entry with the same trimmed,
  case-insensitive name exists (research.md D1's partial unique index is the
  backstop; this is the primary, friendly refusal — `006`'s own class, reused).
- `400 validation_failed` — empty name after trimming.

## 10. `PATCH /tenant/document-categories/:id/retire` — retire a category

**Capability**: `document.manage_catalog` (row 43, **`tenant` scope`**) · **Audit**:
`document_category.retired`

```json
// 200
{ "id": "…", "name": "Borrador Antiguo", "status": "retired", "retiredAt": "…" }
```

Succeeds regardless of how many documents reference it (FR-012) — every referencing
document keeps resolving it, marked retired; it is offered for no new upload or
category change (§1, §5's `catalog_entry_not_available`). No delete route exists, and
no `DELETE` grant exists on `document_category` for any role.

**Retiring "Unclassified" is permitted but not recommended** — doing so does not
change what a category-less upload receives (FR-010 still resolves to whichever row
the tenant currently designates as its default; a tenant that retires its only default
without designating another blocks its own future category-less uploads with
`catalog_entry_not_available`, a recoverable, visible state — the same reasoning
`006`'s catalog-api.md gives for permitting the last `case_status` to be retired).

- `409 already_retired`.
- `404 not_found` — another tenant's entry, or none.

---

## 11. Audit actions introduced here

| Action | `target_entity` | Channel-gated | Metadata |
|---|---|---|---|
| `document.uploaded` | `document` | no | — |
| `document.previewed` | `document` | **yes** | — |
| `document.downloaded` | `document` | **yes** | — |
| `document.category_changed` | `document` | no | `{ from, to }` |
| `document.withdrawn` | `document` | no | — |
| `document.restored` | `document` | no | — |
| `document_category.created` | `document_category` | no | — |
| `document_category.retired` | `document_category` | no | — |

Eight actions: six mutations and two access records (`document.previewed`,
`document.downloaded`), joining `CHANNEL_GATED_ACTIONS` alongside `006`'s `case.read`
and `001`'s `audit.queried`/`tenant.registry_read` (`spec.md` FR-020, SC-009).

Reading a case's document list (§2) and reading the category catalog (§8) are
deliberately absent — the same resolved reasoning `006` already applied to
`case.read_list` (`spec.md` FR-021).

---

## 12. New error classes

One new, in `common/http/errors.ts` alongside `006`'s catalog classes — the storage
limit reuses `004`'s existing `LimitReached` verbatim (see §1), not a new class:

| Class | Status | Code | Note |
|---|---|---|---|
| `AlreadyWithdrawn` | 409 | `already_withdrawn` | Same shape as `001`'s `AlreadyDeactivated`, `002`'s `AlreadyRevoked`, `017`'s `PositionAlreadyRetired` |

Plus `NotWithdrawn` (409, `not_withdrawn`) for §7's restore-when-active case.

**`006`'s `CatalogEntryNotAvailable` and `CatalogEntryAlreadyExists`/
`CatalogEntryAlreadyRetired` classes are reused verbatim** for document-category
refusals (§1, §5, §9, §10) — their messages are already generic across catalog kinds,
unlike `017`'s position-specific classes, so no new class is warranted here.

**None of these refusals is reachable by a caller who failed authorization or scope
first** — `004`'s refusal ordering puts permission and scope ahead of every business
refusal, so a `403` or an opaque `404` always returns before any of these can fire.
