---

description: "Task list for 007-document-management"
---

# Tasks: Case Documents

**Input**: Design documents from `/specs/007-document-management/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/document-api.md](./contracts/document-api.md), [quickstart.md](./quickstart.md)

**Tests**: **Included and mandatory.** Constitution v1.4.1's strict TDD. Every test task
below must be written, run, and **seen to fail** before the implementation task(s)
under it begin.

**Organization**: Grouped by user story per `spec.md`'s priority order (P1–P4). The
Capability Matrix/audit-vocabulary extension and the object-store module are
Foundational, not part of any one story — every story independently needs its own
capability row, audit action and storage chokepoint to exist before it is testable at
all, the same reason 017 and 006 put their own registry extensions in Foundational
rather than inside their first user story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story the task belongs to (US1–US4)
- Exact file paths are included in every task

## Path Conventions

Full stack — `backend/src/modules/documents/`, `backend/src/common/storage/`,
`backend/drizzle/`, `backend/tests/`, `frontend/src/app/documents/`. Frontend renders
inside `016a`'s already-established shell (`frontend/src/shell/`) and reuses its
feedback-state primitives (`frontend/src/feedback/`) — this slice adds screens, not
frontend infrastructure.

## TDD exemptions in force

Constitution exemption 1 covers **configuration files and declarative migrations**:
`backend/drizzle/0026_documents.sql`, `0027_document_audit_actions.sql` and (added
during implementation) `0028_document_category_platform_seed.sql` carry no preceding
test of their own — all three are verified by test tasks that assert their effects
(T012, T013, T015, and the RLS/grants suite in Polish).

No other exemption is claimed. `capability.ts`/`matrix.ts`/`actions.ts` are data, not
configuration, per 006/017's own precedent — each addition has a test written before
it. The object-store module (T009–T011) is genuinely new infrastructure and is tested
directly, not exempted as a "tool-generated" or "purely visual" case.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Module scaffolding and the new Drizzle table/column definitions. Reuses
001/002/004/006/017's entire toolchain — no new backend dependency beyond the AWS SDK
v3 S3 client (`plan.md` Primary Dependencies).

- [X] T001 Create `backend/src/modules/documents/` with `documents.module.ts` (empty
      providers/controllers arrays to start) and register it in
      `backend/src/app.module.ts`'s `imports`. **MODIFIES a file 001 owns.**
- [X] T002 [P] Create `backend/src/common/storage/object-store/` with an
      `ObjectStorePort` interface (`put`, `presignGet`, `delete`) and a
      `ObjectStoreModule` exporting it — no S3 SDK call yet, just the seam
      (research.md D6's chokepoint).
- [X] T003 [P] Add `documentStatus`/`documentCategoryStatus` enums, `document` and
      `documentCategory` table definitions to `backend/src/common/db/schema.ts`
      (data-model.md) — the functional unique index on `documentCategory` included.
      **MODIFIES a file 001/002/004/006/017 share.**
- [X] T004 [P] Add `storageBytesUsed` column to the existing `tenant` table definition
      in `backend/src/common/db/schema.ts` (data-model.md D3). **MODIFIES a file 001
      owns.**

**Checkpoint**: The modules exist and are wired into the app; the schema compiles.
Nothing is migrated, seeded or reachable yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The eight capability rows, the eight audit actions, the two migrations,
the default catalog seed, and the object-store S3 implementation every user story
depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### The Capability Matrix and audit vocabulary extension (FR-022)

- [X] T005 [P] Extend `backend/tests/unit/matrix-exhaustive.test.ts` (004) — add
      `document.upload`, `document.read`, `document.download`,
      `document.change_category`, `document.withdraw`, `document.restore`,
      `document.read_catalog` and `document.manage_catalog` to the exhaustive
      suite's row tables (assigned-scope rows use the same `resolverFor('assigned')`
      exercise 006 already added), asserting 0 pairs unasserted across the now-43-row
      registry. **MODIFIES a file 004 owns. Run it; see it fail.**
- [X] T006 Add the eight rows to `backend/src/common/authz/capability.ts` and
      `backend/src/common/authz/matrix.ts` (data-model.md). **MODIFIES two files 004
      owns.**
- [X] T007 [P] Write `backend/tests/unit/document-audit-actions.test.ts` — asserts
      `AUDIT_ACTIONS` contains all eight new actions, and that `document.previewed`
      and `document.downloaded` (and only those two) are in `CHANNEL_GATED_ACTIONS`.
      **Run it; see it fail.**
- [X] T008 Add the eight actions to `backend/src/common/audit/actions.ts`'s
      `AUDIT_ACTIONS`, `TARGET_ENTITY_BY_ACTION` and `CHANNEL_GATED_ACTIONS`
      (contracts/document-api.md §11). **MODIFIES a file 001/002/006/017 share.**

### Object store (research.md D6 — the chokepoint)

- [X] T009 [P] Write `backend/tests/unit/object-store-key-namespacing.test.ts` —
      asserts the key-builder function produces `tenant/{tenantId}/case/{caseId}/
      {documentId}` and rejects any input that would let a caller influence the
      tenant segment of the key. **Run it; see it fail.**
- [X] T010 Implement `backend/src/common/storage/object-store/s3-object-store.ts`
      (`S3ObjectStore implements ObjectStorePort`) using the AWS SDK v3 client —
      `put`, `presignGet` (short-lived, single-object), `delete` (used only for
      upload-failure rollback, research.md D4). No other module imports `@aws-sdk/*`
      (verified in Polish, T0XX).
- [X] T011 Wire `S3ObjectStore` as the `ObjectStorePort` provider in
      `documents.module.ts`, reading bucket/region config from environment
      (`mx-central-1`, Data Residency).

### Migrations

- [X] T012 [P] Write `backend/drizzle/0026_documents.sql` — `document` and
      `document_category` tables, `document_status`/`document_category_status`
      enums, RLS policies, grants (data-model.md), the functional unique index on
      `document_category`, and the `ALTER TABLE tenant ADD COLUMN
      storage_bytes_used`. Adds no column to `case_file`, `membership` or any table
      this slice does not own besides `tenant`'s new counter. *(TDD exemption 1)*
- [X] T013 [P] Write `backend/drizzle/0027_document_audit_actions.sql` — extends
      `audit_event_action_known` following 0025's exact `DROP`/`ADD CONSTRAINT`
      pattern (006's own precedent), restating the full action list. *(TDD exemption
      1)*
- [X] T014 Run `npm run db:migrate`; confirm both apply cleanly against the existing
      schema.

### Default seed

- [X] T015 [P] Write `backend/tests/integration/document-category-seed.test.ts` — a
      freshly seeded tenant's document-category catalog contains the default seed
      (research.md D1), including "Unclassified," all `active`. **Run it; see it
      fail.**
- [X] T016 Extend `backend/drizzle/seed.ts` to insert the default document-category
      catalog for each seeded tenant, following the exact pattern already used for
      006's three catalogs and 017's position catalog. **MODIFIES a file 001 owns.**
      **Discovered during implementation**: production provisioning (not just the dev
      seed) needed wiring too, matching 017/006's own precedent exactly — added
      `backend/src/modules/documents/categories/document-category.seed.ts` (the
      shared list + insert function both `ProvisionService` and `seed.ts` call, per
      research.md D1's "one seam, not two provisioning mechanisms"), a new migration
      `0028_document_category_platform_seed.sql` granting `lc_platform` a narrow,
      seed-only INSERT on `document_category` (017 needed the identical retrofit as
      its own migration 0022, after its first catalog migration missed it the same
      way this slice's 0026 did), and one new call in `provision.service.ts`.
- [X] T016b (unplanned, folded into T016 above) Wire
      `seedDefaultDocumentCategories` into `ProvisionService.provision()` and add
      `0028_document_category_platform_seed.sql`, so `spec.md` FR-009/SC-010 ("0
      manual setup steps") hold for a tenant provisioned through the real API, not
      only for the dev/CI seed.

**Checkpoint**: The registry, matrix, audit vocabulary, schema and object-store
chokepoint all exist; the default seed is verified for both the dev/CI seed script
and real tenant provisioning. No endpoint exists yet.

---

## Phase 3: User Story 1 - Upload a document to a case (Priority: P1) 🎯 MVP

**Goal**: An assigned member (or MP/SA, inherited exemption) uploads a file against a
case; it is stored with the case reference, uploader and timestamp; the two refusals
this story is graded on — scope and storage-limit — hold, and the storage race
(research.md D4) does not let two concurrent uploads jointly exceed the limit.

**Independent Test**: Upload a file against a seeded case; read it back; confirm the
case reference, uploader and timestamp; confirm a non-assigned caller cannot upload,
and a tenant at its storage limit is refused naming the limit.

### Tests for User Story 1 ⚠️

> **NOTE: Write these FIRST, run them, and see them FAIL before implementation.**

- [X] T017 [P] [US1] Write `backend/tests/contract/document-upload.test.ts` — the
      acceptance scenarios of spec.md User Story 1: successful upload carrying case
      reference/uploader/timestamp; scope refusal for a non-assigned caller (`404`,
      indistinguishable from an absent case); storage-limit refusal (`403
      limit_reached`, 004's existing class) distinguishable from the scope refusal;
      cross-tenant refusal; category-less upload resolving to "Unclassified"; a
      disallowed MIME-type/extension refused (`400 validation_failed`). **Run it; see
      it fail.**
- [X] T018 [P] [US1] Write `backend/tests/integration/storage-limit-race.test.ts`
      (research.md D4) — two concurrent uploads whose combined size exceeds the
      tenant's limit: exactly one succeeds; a failed upload's reservation and
      metadata row both roll back, leaving no phantom counter increment. **Run it;
      see it fail.**

### Implementation for User Story 1

**Design correction, made during implementation**: `004` already has a generic
`LimitReached` class (`common/http/errors.ts`) built for exactly this (FR-024) —
`{error: {code: 'limit_reached', message}, limit: {key, value}}` at `403`. No new
error class is needed; `documents.service.ts` throws it directly, the same class
`refusal.ts` uses for the (currently unwired) `decide()`-level entitlement path. T019
retired — folded into T022.

- [X] T020 [US1] Implement `backend/src/modules/documents/upload-validation.ts` — the
      allowed MIME-type/extension list (spec.md Decision 3's retained floor; not
      malware scanning).
- [X] T021 [US1] Implement `backend/src/modules/documents/documents.repository.ts` —
      `insertWithStorageReservation` (research.md D3/D4: reads
      `tenant.storage_bytes_used` and inserts the `document` row plus increments the
      counter in one transaction), `findCaseForUpload` (RLS-scoped case existence
      check for the route's own `:caseId`)
- [X] T022 [US1] Implement `backend/src/modules/documents/documents.service.ts` —
      `upload()`: resolves the category (named or "Unclassified" default, FR-010),
      validates the file against T020's allowlist, calls the repository's reserving
      insert, calls `ObjectStorePort.put`, and on a storage-write failure rolls back
      the reservation via a compensating delete + counter decrement (research.md D4)
- [X] T023 [US1] Implement `POST /tenant/cases/:caseId/documents` in
      `backend/src/modules/documents/documents.controller.ts`, declaring
      `@Capability('document.upload')`, `@ScopeTarget('caseId')` and
      `@Audited({ action: 'document.uploaded', targetEntity: 'document' })`

**Checkpoint**: A document can be uploaded, scope- and storage-checked, and audited.
This is independently shippable — a document exists for Stories 2–4 to act on.

**Two real bugs found and fixed while making T017/T018 pass:**

1. **`lc_app` had no grant to write `tenant.storage_bytes_used`.** `0006_grants.sql`
   (001/004) deliberately restricts `lc_app` to `SELECT` on `tenant` — plan/RFC/status
   changes all go through `lc_platform`. This slice's upload path runs as `lc_app` and
   needs to increment one column on the tenant's own row. Fixed with a new migration,
   `0029_tenant_storage_counter_grant.sql`, granting `lc_app` **column-level** `UPDATE`
   on exactly `storage_bytes_used` — nothing else on `tenant` becomes writable, and the
   existing `tenant_own_row` RLS policy (0005, `FOR ALL`, own row only) already covered
   it correctly, so no policy change was needed, only the missing grant.
2. **The storage-limit check was not actually atomic.** The first draft read
   `tenant.storage_bytes_used` in one `SELECT`, decided whether to permit the upload,
   and only then ran a separate `UPDATE ... SET storage_bytes_used = storage_bytes_used
   + $size`. Two concurrent uploads could both read the same pre-update total, both
   pass the check, and both commit — exactly the race `spec.md`'s Edge Cases section
   warned against, and exactly what T018's test caught (`[201, 201]` instead of
   `[201, 403]`). Fixed by folding the check into the increment itself: `UPDATE tenant
   SET storage_bytes_used = storage_bytes_used + $size WHERE id = $id AND
   storage_bytes_used + $size <= $limit RETURNING id` — one atomic statement, so the
   second writer's row lock forces it to evaluate the `WHERE` clause against the FIRST
   writer's already-committed total, not a stale value read before either committed.
   `documents.repository.ts`'s `reserveStorage()` replaces the original
   `insertReservingStorage()`; `research.md` D3/D4 updated to match.

---

## Phase 4: User Story 2 - Read, preview and download a case's documents (Priority: P2)

**Goal**: An assigned member reads a case's document list, previews a document inline
without a separate download step, and downloads one — each capability distinct in the
audit trail, `BM` excluded from all three, and the tenant-isolation guarantee for
S3-resident content (research.md D6) verified end to end.

**Independent Test**: Upload two documents to a case (Story 1); read the list as an
assigned member and confirm both appear; read it as a non-assigned member and confirm
a total refusal (not an empty list); preview one inline; download it; confirm a
tenant-B session cannot obtain a pre-signed URL for either.

### Tests for User Story 2 ⚠️

- [X] T024 [P] [US2] Write `backend/tests/contract/document-read.test.ts` — case
      document list (assigned vs. refused, `404` not empty-result, per contract §2's
      contrast with 006's `case.read_list`); preview for PDF/image/Office/unsupported
      families (research.md D5); download; `BM` refused all three. **Run it; see it
      fail.**
- [X] T025 [P] [US2] Write `backend/tests/contract/document-access-audited.test.ts` —
      preview and download each produce exactly one audit entry on
      `x-channel: interactive` and zero on `automated`; a list read produces zero
      either way; preview and download of the same document are two distinct
      entries. **Run it; see it fail.**
- [X] T026 [US2] Write `backend/tests/integration/isolation/object-store/
      pre-signed-url-isolation.test.ts` (research.md D6, the Constitution Check's
      falsification test) — a tenant-A session cannot obtain a pre-signed URL for a
      tenant-B document; the scope check runs before any URL is issued; a genuinely
      valid URL is single-object and expires. **Run it; see it fail** (fails today
      because no preview/download route exists to attempt against).

### Implementation for User Story 2

**Design correction, made during implementation**: `@ScopeTarget(paramName)` reads a
route parameter directly (`common/authz/interceptor.ts`'s `scopeTargetOf`) — there is
no async-lookup extension point for "resolve a document id to its case id first."
Every document-specific route is therefore nested under its case
(`/tenant/cases/:caseId/documents/:id/...`), matching `006`'s own shape exactly, and
`findInCase` (T028) — not a separate lookup file — is what confirms the named `:id`
actually belongs to the named `:caseId` (data-model.md, contracts/document-api.md §0).

- [X] T027 [US2] Extend `documents.repository.ts` (T021) — `findInCase(id, caseId)`
      (RLS- and case-scoped: a document that exists but belongs to a different case
      resolves to `null`, the same generic not-found an absent document produces)
- [X] T028 [US2] Extend `documents.repository.ts` (T021/T027) — `listByCase`
      (metadata only, RLS-scoped)
- [X] T029 [US2] Extend `documents.service.ts` (T022) — `listForCase`, `preview()`
      (research.md D5's file-family branching: native for PDF/image, server-side
      conversion for Office formats, `renderAs: "unsupported"` otherwise), `download()`
      — both calling `findInCase` (T027) before `ObjectStorePort.presignGet`
- [X] T030 [US2] Implement `GET /tenant/cases/:caseId/documents`, `GET /tenant/
      cases/:caseId/documents/:id/preview` and `GET /tenant/cases/:caseId/documents/
      :id/download` in `documents.controller.ts`, declaring `@Capability
      ('document.read')` / `@Capability('document.download')`,
      `@ScopeTarget('caseId')` on all three, and `@Audited` on preview/download only

**Checkpoint**: Documents are readable, previewable and downloadable under the
inherited scope model; D6's isolation guarantee is verified end to end, not assumed.

---

## Phase 5: User Story 3 - Organize documents by category (Priority: P3)

**Goal**: MP/CM/SA assign a category to a document from the tenant's own catalog;
MP/SA add and retire catalog entries; retirement never deletes; name collisions among
active entries are refused.

**Independent Test**: Add a category; assign it to a document (Story 1's upload);
retire it; assert the document still displays it, marked retired, and the retired
category can no longer be newly assigned.

### Tests for User Story 3 ⚠️

- [X] T031 [P] [US3] Write `backend/tests/contract/document-category.test.ts` — add,
      retire, list, the two D1-precedent collision cases (duplicate active name
      refused `409`, same name succeeds after retirement), category-change refusal
      for `AA`/`PL`, category-change refusal for a name absent from the tenant's own
      catalog. **Run it; see it fail.**
- [X] T032 [P] [US3] Write `backend/tests/unit/document-category-collision.test.ts` —
      the collision predicate in isolation: case- and whitespace-insensitive match
      against *active* entries only, mirroring 017's `collidesWithActive` shape as
      its own local function (this module does not import 017's). **Run it; see it
      fail.**

### Implementation for User Story 3

- [X] T033 [US3] Implement `backend/src/modules/documents/categories/
      document-category-collision.ts` — the pure collision predicate (T032)
- [X] T034 [US3] Implement `backend/src/modules/documents/categories/
      document-category.repository.ts` — create, retire, list, activeNames, all
      RLS-scoped by construction
- [X] T035 [US3] Implement `backend/src/modules/documents/categories/
      document-category.service.ts` — the collision check ahead of insert (the
      unique index is the backstop, not the primary UX, 006/017's own precedent);
      reuses `common/http/errors.ts`'s `CatalogEntryNotAvailable`,
      `CatalogEntryAlreadyExists` and `CatalogEntryAlreadyRetired` verbatim (006's own
      classes — no new error class for this catalog)
- [X] T036 [US3] Implement `POST /tenant/document-categories`, `PATCH /tenant/
      document-categories/:id/retire` and `GET /tenant/document-categories` in
      `backend/src/modules/documents/categories/document-category.controller.ts`,
      declaring `@Capability('document.manage_catalog')` on the first two and
      `@Capability('document.read_catalog')` on the list route, with `@Audited` on
      the first two
- [X] T037 [US3] Extend `documents.service.ts` (T022/T029) — `changeCategory()`,
      validating the named category via T035's repository before updating
- [X] T038 [US3] Implement `PATCH /tenant/cases/:caseId/documents/:id/category` in
      `documents.controller.ts`, declaring `@Capability('document.change_category')`,
      `@ScopeTarget('caseId')`, and `@Audited` with previous/new category ids

**Checkpoint**: The category catalog is fully CRUD-able and documents can be
organized by it, isolated per tenant.

---

## Phase 6: User Story 4 - Withdraw and restore a document (Priority: P4)

**Goal**: MP/SA remove a document from active use without destroying the record, and
can bring it back; storage remains counted throughout (research.md D3, FR-015).

**Independent Test**: Withdraw a document; confirm it no longer appears in the case's
active document list; confirm `tenant.storage_bytes_used` is unchanged; restore it;
confirm both events are audited separately.

### Tests for User Story 4 ⚠️

- [X] T039 [P] [US4] Write `backend/tests/contract/document-withdraw-restore.test.ts`
      — withdraw removes from the active list without hard-deleting; storage total
      unchanged by withdrawal; restore reappears in the active list; two distinct
      audit entries; `AA`/`PL`/`CM` refused withdraw; a second withdraw is `409
      already_withdrawn`; restoring an active document is `409 not_withdrawn`. **Run
      it; see it fail.**

### Implementation for User Story 4

- [X] T040 [US4] Add `AlreadyWithdrawn` (409) and `NotWithdrawn` (409) to
      `backend/src/common/http/errors.ts`, following 006/017's existing class shape.
      **MODIFIES a file 001 owns.**
- [X] T041 [US4] Extend `documents.repository.ts` (T021/T028) — `withdraw`,
      `restore` (status + timestamp updates only; never touches
      `storage_bytes_used`, research.md D3)
- [X] T042 [US4] Extend `documents.service.ts` (T022/T029/T037) — `withdraw()`,
      `restore()`, throwing `AlreadyWithdrawn`/`NotWithdrawn` for the respective
      already-final states
- [X] T043 [US4] Implement `PATCH /tenant/cases/:caseId/documents/:id/withdraw` and
      `PATCH /tenant/cases/:caseId/documents/:id/restore` in `documents.controller.ts`,
      declaring `@Capability('document.withdraw')` / `@Capability('document.restore')`,
      `@ScopeTarget('caseId')`, and `@Audited` on each with its own action

**Checkpoint**: All four user stories are independently functional. `016a`'s shell has
a real screen surface to render; `013-calendar-core` and any future slice referencing
case documents have a real read capability to consume.

**Discovered during implementation — full-suite regression, after all four stories
landed.** Running `npm test` at this checkpoint surfaced two categories of failure
across 8 files, both pre-existing structural/registry tests owned by earlier slices
that assert exact counts or exact shapes over the shared registries this slice extends
— neither is a defect in this slice's own new tests, which were all green individually.

1. **A real naming bug**: this slice's original catalog rows were named
   `document_category.read` / `document_category.manage`. `registry-shape.test.ts`'s
   `every id matches module.verb` check (`/^[a-z]+\.[a-z_]+$/`) caught it — the module
   segment before the dot cannot itself contain an underscore, only the verb segment
   may. `006`'s own precedent for a structurally identical catalog used
   `case.read_catalog` / `case.manage_catalog` (module = `case`, underscore only in the
   verb), not `case_catalog.read`. Renamed to `document.read_catalog` /
   `document.manage_catalog` throughout — `capability.ts`, `matrix.ts`,
   `document-category.controller.ts`, `matrix-exhaustive.test.ts`, and every design doc
   below that named the old ids (`data-model.md`, `contracts/document-api.md`,
   `tasks.md` itself, T036 above).
2. **Hardcoded census counts, owned by 004/006/017, that this slice's registry growth
   was always going to move** — the same kind of update 006 made to 017's own counts
   before it. Fixed in: `registry-shape.test.ts` (35→43), `directory-audit-actions.test.ts`
   (31→39), `portal-archetypes-empty.test.ts` (19→21), `capability-declared-everywhere.test.ts`
   (35→43), `audit-fields.test.ts` (31→39 actions, 3→5 channel-gated). None of these
   files' own logic changed — only the literal census number each asserts.
3. **Two registries this slice forgot to extend, not test-count drift**:
   `tenant-scoped-tables.ts` (the RLS-coverage registry) had no rows for `document` /
   `document_category`, caught by `rls-coverage.test.ts`'s "every table carrying a
   tenant_id column is present in the registry" sweep; and `platform-scope.test.ts`
   needed the new `document_category:INSERT` row added to its exact-grant-set
   assertions, the identical extension 017/006 each made for their own catalogs.
4. **`drizzle/seed.ts` had no document fixture row.** `no-context.test.ts` sweeps
   every table in `tenant-scoped-tables.ts` and asserts each is non-empty while a
   tenant is active — the control that makes its "zero rows after release" assertion
   meaningful. Added `seedDocuments()`, one fixture row per tenant, mirroring the
   `venue` fixture's own documented rationale for existing at all.
5. **`no-new-dependency.test.ts`'s baseline was 004's own, pre-S3.** This slice is the
   first to legitimately add a runtime dependency (`@aws-sdk/client-s3`,
   `@aws-sdk/s3-request-presigner` — both named in plan.md's Technical Context, required
   by the constitution's fixed choice of S3). Updated the baseline rather than deleting
   the test, so a future slice adding an unplanned dependency still fails loudly.

T048/T049 below were written and verified as part of this same pass rather than
deferred to Phase 8, since the grant/chokepoint facts they assert were already true
and the sweep above had the suite open regardless.

---

## Phase 7: Frontend (renders inside 016a's shell)

**Purpose**: The upload, list, preview and category-management screens — no new
frontend infrastructure, since `016a` already established `frontend/src/shell/` and
`frontend/src/feedback/`.

- [ ] T044 [P] Implement `frontend/src/app/documents/UploadControl/` — calls T023's
      endpoint; renders storage-limit and scope refusals through `016a`'s existing
      opaque/distinguishable error-state classifier (`frontend/src/feedback/
      refusal-bucket.ts`), not a new one
- [ ] T045 [P] Implement `frontend/src/app/documents/DocumentList/` — calls T030's
      list endpoint; empty-case-of-nothing-uploaded-yet renders `016a`'s existing
      empty state
- [ ] T046 [US2] Implement `frontend/src/app/documents/PreviewPane/` — renders T030's
      preview response per research.md D5's three branches (native, converted,
      unsupported-with-download-fallback)
- [ ] T047 [US3] Implement `frontend/src/app/documents/CategoryManager/` — calls
      T036's catalog endpoints and T038's category-change endpoint

**Checkpoint**: A person can upload, browse, preview and organize documents entirely
inside the existing shell, with no bespoke navigation or feedback-state code.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: The grant audit extension, the object-store chokepoint guarantee, the
documentation this slice's planning surfaced, and full-suite verification.

- [X] T048 Extend `backend/tests/integration/case-core-grants-lockdown.test.ts` (or a
      new `documents-grants-lockdown.test.ts` following the identical pattern) with
      `document`/`document_category` assertions: `lc_app` holds exactly `SELECT,
      INSERT, UPDATE` on each, never `DELETE` (FR-004/FR-012's "never hard-deleted"
      as an absent grant)
- [X] T049 Write `backend/tests/unit/object-store-chokepoint.test.ts` (or a static
      grep-based check run in CI) asserting no file under `backend/src/modules/`
      other than `common/storage/object-store/` imports `@aws-sdk/*` (research.md D6,
      quickstart.md "What to check by hand" #2, made into a real assertion rather
      than a manual step)
- [ ] T050 Add `US17-EP04-DOC-WithdrawRestoreDocument` and
      `US17-EP10-CFG-DefineDocumentCategoryCatalog` (or the next available numbers —
      reconcile against `master-user-story-catalog.md`'s actual current state, per
      `spec.md`'s own Catalog Amendments table, not this document's arithmetic) to
      `specs/master-user-story-catalog.md`
- [ ] T051 Run `npm run test:isolation && npm run test:rls && npm run verify:role &&
      npm run test:contract` — confirm 001/002/004/006/017's suites pass unedited;
      `git diff --stat backend/drizzle/0006_grants.sql` empty
- [ ] T052 Run `npm test -- --coverage`; confirm `src/common/tenant/**`,
      `src/common/audit/**` and `src/common/authz/**` remain at 100%, and that
      `src/common/storage/object-store/**` has real, non-trivial coverage (it is new
      infrastructure this slice introduces, not a pre-existing exempted path)
- [ ] T053 [P] Execute every scenario in [quickstart.md](./quickstart.md) end to end
      and record results in `specs/007-document-management/quickstart-results.md`,
      following 006/017's format
- [ ] T054 [P] Update `specs/007-document-management/spec.md`'s Approval Checklist —
      tick *Every requirement is test-verifiable* once T052 passes, leaving approval
      itself for the technical lead

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately
- **Foundational (Phase 2)**: depends on Setup — **BLOCKS every user story**
- **US1 (Phase 3)**: depends on Foundational only
- **US2 (Phase 4)**: depends on Foundational and on US1 having produced a document to
  read — not independent of US1 the way 017's three stories were of each other,
  because there is nothing to preview or download until something is uploaded. Its
  *case-scoping mechanism* (T027's `findInCase`) is new work, not a reuse of US1's.
- **US3 (Phase 5)**: depends on Foundational and on US1 (a document must exist to
  categorize) and reuses US2's T027 `findInCase` — sequence after US2 if worked by the
  same developer
- **US4 (Phase 6)**: depends on Foundational and on US1 (a document must exist to
  withdraw) and reuses US2's T027 `findInCase` — independent of US3's own additions
- **Frontend (Phase 7)**: depends on the backend routes each screen calls (T023, T030,
  T036/T038) — genuinely parallel across screens once their respective backend routes
  exist
- **Polish (Phase 8)**: depends on all four stories

### User Story Dependencies

```
Setup ──> Foundational ──> US1 (P1, MVP) ──┬──> US2 (P2) ──┬──> US3 (P3)
                                            │               └──> US4 (P4)
                                            └── (US3/US4 need US1's document to exist,
                                                 and US2's T027 findInCase, but not each other)
```

Unlike 017 (three genuinely independent stories after Foundational), this slice's
stories form a shallow chain: US1 produces the document every later story acts on, and
US2 builds the document-to-case scope lookup every later story reuses. US3 and US4 are
independent of **each other** once US1 and US2 exist.

### Parallel Opportunities

- **T002, T003, T004** — three independent Setup files
- **T005, T007, T009, T012, T013, T015** — six independent Foundational test/migration
  files
- **T017, T018** — US1's two test files
- **T024, T025** — US2's two contract test files (T026 depends on T024/T025's routes
  existing to test against, so sequence it after)
- **T031, T032** — US3's two test files
- **T044, T045** — two of Phase 7's four screens (T046 needs T030's preview shape
  settled; T047 needs T036/T038)
- **T053, T054** — Polish tasks, independent of each other

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1: Setup — T001–T004
2. Phase 2: Foundational — T005–T016 **(CRITICAL, blocks everything)**
3. Phase 3: User Story 1 — T017–T023
4. **STOP and VALIDATE**: a document can be uploaded, scope- and storage-checked, and
   audited — the minimum any later story needs to act on
5. Read, preview, download (US2) is the read path 016a's shell actually renders;
   without it, US1 alone stores documents nobody can see yet — still a legitimate,
   demonstrable increment, per 006's own precedent of a case with no assignments yet.

### Incremental Delivery

1. Setup + Foundational → registry, matrix, audit vocabulary, schema, object store,
   seed all exist
2. **US1** → upload works, storage limit is real **(MVP)**
3. **US2** → the read path 016a's shell renders; D6's isolation guarantee proven
4. **US3** → the catalog becomes fully editable, not just seeded
5. **US4** → lifecycle management (withdraw/restore) completes the story set
6. **Frontend** → screens land, reusing 016a's shell and feedback primitives
7. Polish → grant audit, object-store chokepoint guarantee, catalogue entry

### Parallel Team Strategy

With four developers, after Foundational: one on US1, and — once US1's document shape
is settled — one each on US2, and (once US2's T027 lands) one each on US3 and US4, with
frontend developers picking up each screen as its backend route lands.

---

## Notes

- `[P]` tasks = different files, no dependencies
- `[Story]` label maps each task to a spec.md user story for traceability
- **Verify tests fail before implementing** — the constitution requires the PR history
  to evidence it
- Commit after each task or logical group
- T014 and T051/T052 are **verification-heavy** tasks whose primary output is a
  confirmed result, the same shape 006's T040/T060/T063-equivalents took
- T026 is written before T027–T030 exist and is *expected* to fail for the "wrong"
  reason (no route to call) until those tasks land — record that explicitly when
  running it, so "failed because unimplemented" is not mistaken for "failed because
  isolation is broken"
