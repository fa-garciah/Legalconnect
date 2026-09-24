# Feature Specification: Case Documents

**Feature Branch**: `021-frontend-documents`
**Created**: 2026-09-23
**Status**: Approved — all six decisions signed 2026-09-23
**Input**: `007-document-management`'s shipped API (its Phase 7, T044–T047, was never built),
`019`'s case register, `020`'s design language, `016a`'s shell and feedback states.

> **Citation convention.** Requirements of slices 004, 006, 007, 014, 016a, 019 and 020 are
> cited as `007/FR-0NN` etc. Bare `FR-0NN` refers to this document.
>
> **Authorship.** Written by Claude directly: Antigravity (`agy`) is out of quota until about
> 2026-09-29.

---

## Why this slice matters

`007` built the whole document backend — upload with a storage ceiling, a per-firm category
catalog, preview and download through short-lived signed URLs, withdraw and restore, eight audit
actions — and **nobody can use any of it**. A law firm that cannot attach the contract to the
matter keeps it in email, and the product's claim to be the firm's system of record fails at the
first file. This slice is the surface.

It also sits on the `assigned` scope kind: a case you are not on answers `404`, identical to a
case that does not exist (`007` contract §0). The screens must read correctly when that happens —
"this matter is not available", never "you are not allowed".

---

## What `007` actually does, checked against the code rather than its contract

`backend/src/modules/documents/` was read before this spec was written. Six points differ from
what a screen would assume from `007/contracts/document-api.md`:

| # | Contract says | Code does | Consequence for a screen |
|---|---|---|---|
| 1 | §7 restore a withdrawn document | `listByCase` returns `status = 'active'` only | A withdrawn document **cannot be found again from any screen**; restore is unreachable → **Decision 2** |
| 2 | §3 `converted-pdf`: "Office formats after server-side conversion" | No converter exists; it returns a signed URL to the **original** `.docx`/`.xlsx`/`.pptx` | Framing it as a preview makes the browser download it → **Decision 3** |
| 3 | §4 download with `filename` | The signed URL carries no `Content-Disposition` | The browser saves the file under the storage key (a UUID, no extension); the `filename` field cannot fix a cross-origin download → **Decision 4** |
| 4 | — | Multer runs with no size limit | A single very large upload is held in memory by the API → **Decision 4** |
| 5 | FR-010 default category | Seeded, and looked up, as the English literal `Unclassified` | Every firm sees an English word in a Spanish product → **Decision 5** |
| 6 | §2 list item | `uploadedByMembershipId` only | No person is nameable (the same gap `019` Q2 recorded); the list shows the date, not the uploader |

Refusal messages from `007` are English (`"This file type is not allowed."`). The screens show
Spanish copy keyed to the refusal **code** and never render the server's `message` (FR-018).

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Attach a file to a matter (Priority: P1) 🎯 MVP

A lawyer on a matter uploads the signed contract to it, choosing its category.

**Catalog**: `US01-EP04-DOC-UploadDocumentToFolder` (MVP).

**Why this priority**: without upload there is nothing to list, preview or organize.

**Independent Test**: as an `AA` on a case, open its documents, upload a PDF with category
"Contrato", and see it listed with its name, category, size and date.

**Acceptance Scenarios**:

1. **Given** an `MP`, `AA`, `PL`, `CM` or `SA` who can reach the case, **When** they choose a file
   and a category and confirm, **Then** the file uploads with visible progress state and appears at
   the top of the list.
2. **Given** no category is chosen, **When** the file uploads, **Then** it is filed under the
   firm's default category (`007/FR-010`), shown as "Sin clasificar".
3. **Given** a file type outside `007`'s allowed list (e.g. `.zip`, `.exe`), **When** it is chosen,
   **Then** the screen refuses it before sending, naming the accepted types; if the server refuses
   anyway, the same Spanish message is shown.
4. **Given** the firm's plan storage would be exceeded, **When** they upload, **Then** they see
   `016a`'s plan-limit message ("Se alcanzó el límite de tu plan para esto."), distinguishable from
   a permission refusal (`007/FR-013`).
5. **Given** a `BM`, **Then** no upload control is drawn (row 36 excludes `BM`).

---

### User Story 2 — Find and read a document (Priority: P2)

An associate opens a matter's documents and reads a PDF without downloading it.

**Catalog**: `US02-EP04-DOC-PreviewDocumentInline` (MVP), `US09-EP04-DOC-DownloadDocumentEasily`.

**Independent Test**: open a case with a PDF and an image; preview each inline; download a `.docx`
and get it under its original name.

**Acceptance Scenarios**:

1. **Given** a case's documents, **Then** each row shows file name, category (retired categories
   marked "Retirada"), size in human units (KB/MB) and upload date; newest first.
2. **Given** a PDF or an image, **When** "Ver" is chosen, **Then** it renders inline in the preview
   pane (`renderAs: pdf | image`).
3. **Given** an Office file or plain text, **When** "Ver" is chosen, **Then** the pane says it cannot
   be previewed here and offers "Descargar" (Decision 3).
4. **Given** "Descargar", **Then** the file is saved under its original filename (Decision 4).
5. **Given** a signed URL expires while the pane is open (5 minutes), **When** the person acts
   again, **Then** a fresh URL is requested; an expired link never shows a raw storage error.
6. **Given** a case the caller cannot reach, **Then** the documents area shows `016a`'s opaque
   state — the same as for a case that does not exist.
7. **Given** no documents, **Then** `016a`'s empty state says "Este expediente aún no tiene
   documentos." with the upload action when the caller holds it.

---

### User Story 3 — Keep a matter's documents organized (Priority: P3)

A case manager fixes a mis-filed document's category; a partner takes a wrong upload out of the
matter and can put it back.

**Catalog**: `US03-EP04-DOC-OrganizeDocumentsByMatter` (MVP); withdraw/restore is `007` Story 4.

**Acceptance Scenarios**:

1. **Given** an `MP`, `CM` or `SA`, **When** "Cambiar categoría" is chosen, **Then** only ACTIVE
   categories are offered and the row updates (row 39; `AA` and `PL` get no control).
2. **Given** an `MP` or `SA`, **When** "Retirar" is chosen and confirmed, **Then** the document
   leaves the list; the confirmation says it is not deleted and can be restored (`007/FR-004`).
3. **Given** Decision 2 option A, **When** an `MP`/`SA` shows "Retirados", **Then** withdrawn
   documents are listed with "Restaurar", which needs no confirmation (it is the undo — `018`'s
   precedent).

---

### User Story 4 — The firm's document categories (Priority: P4)

A partner adds "Poderes notariales" to the firm's categories and retires one nobody uses.

**Acceptance Scenarios**:

1. **Given** an `MP` or `SA`, **Then** `/configuracion` shows a fourth tab, "Categorías de
   documentos" (Decision 6), listing active and retired categories.
2. **When** they add a name that duplicates an active category (trimmed, case-insensitive),
   **Then** it is refused before sending; the server's `409` shows the same message.
3. **When** they retire a category, **Then** documents already filed under it keep it, marked
   "Retirada", and it is no longer offered (`007/FR-012`).

---

### Edge Cases

- **Upload fails midway** (network, or the object store): the row does not appear, the error state
  offers a retry, and nothing half-uploaded is listed — `007`'s reserve-then-commit guarantees
  there is nothing to list.
- **A category is retired while the upload dialog is open**: the server answers `422
  catalog_entry_not_available`; the dialog re-reads the catalog and asks again.
- **A colleague withdraws the document being previewed**: the next action answers `404`; the pane
  closes and the list re-reads.
- **Two tabs, one withdraws, the other restores**: `409 already_withdrawn` / `not_withdrawn` →
  re-read, the same handling `018` gives `already_deactivated`.
- **Large file**: until Decision 4 lands, a large upload is sent without a size check.
- **Preview inside the page**: the signed URL is on the object store's origin (MinIO in
  development, S3 later); the preview must not require relaxing the app's own security headers
  beyond allowing that one origin in `frame-src`/`img-src`.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Documents are reached from the case: the case detail panel (`019`) gains a
  "Documentos" link to `/expedientes/{caseId}/documentos` (Decision 1).
- **FR-002**: The documents page names the case (file number and client) from `GET
  /tenant/cases/:caseId`, which is one audited `case.read` per visit — an actual access, recorded as
  such. It does not re-read the case per document action.
- **FR-003**: The list calls `GET /tenant/cases/:caseId/documents` and renders `016a`'s loading,
  empty and error states; a `404` renders the opaque state.
- **FR-004**: Upload uses `POST …/documents` as `multipart/form-data` through `apiFetch` (which
  already omits `content-type` for `FormData`) and the proxy (which forwards the boundary).
- **FR-005**: The file picker's `accept` mirrors `007`'s allowed MIME list
  (`upload-validation.ts`), and a disallowed file is refused client-side before sending.
- **FR-006**: The upload dialog offers active categories only, defaulting to none (the firm's
  default).
- **FR-007**: A `403 limit_reached` renders `016a`'s `entitlement-limit` bucket; a `404` renders the
  opaque bucket; a `400 validation_failed` renders the file-type message of FR-005.
- **FR-008**: Preview calls `GET …/preview` on demand (never pre-fetched per row) and renders
  `pdf` in an `<iframe>` and `image` in an `<img>` with the file name as its accessible name.
- **FR-009**: `converted-pdf` and `unsupported` both render the "no preview" state with
  "Descargar" (Decision 3).
- **FR-010**: Download calls `GET …/download` on click and navigates to the returned URL; nothing
  is fetched until the person asks, so every download is one audited access (`007/FR-020`).
- **FR-011**: Signed URLs are held in component state only, never in browser storage, and are
  requested again once past `expiresAt`.
- **FR-012**: "Cambiar categoría" is drawn only for `document.change_category`; it offers active
  categories and calls `PATCH …/category`.
- **FR-013**: "Retirar" is drawn only for `document.withdraw`, confirms first, and calls `PATCH
  …/withdraw`.
- **FR-014**: "Restaurar" is drawn only for `document.restore`, on the withdrawn list of Decision 2,
  and calls `PATCH …/restore` without confirmation.
- **FR-015**: The category tab (Decision 6) is drawn only for `document.manage_catalog`; it lists
  `GET /tenant/document-categories`, creates with `POST`, retires with `PATCH …/retire`, and
  validates names client-side exactly as `014`'s position catalog does.
- **FR-016**: Sizes are shown in Spanish units ("482 KB", "1.2 MB"); dates as `014`'s
  `formatDate` does (es-MX, America/Mexico_City).
- **FR-017**: The default category is shown as "Sin clasificar" wherever it appears (Decision 5).
- **FR-018**: No server `message` string is ever rendered; every refusal is copy keyed to its code
  or `016a`'s classifier.
- **FR-019**: Every control is keyed to a capability id through `can()`; the eight document rows
  are added to the frontend mirror and to `capability-matrix-sync.test.ts`'s fixture, transcribed
  from `007/spec.md`.
- **FR-020**: All copy is Spanish and the new components join `spanish-copy.test.tsx`; no colour
  literals (`020`).

### Capability Matrix *(Principle IV — a mirror; this slice adds no capability)*

| # | Capability | Scope | MP | AA | PL | CM | BM | SA |
|---|---|---|---|---|---|---|---|---|
| 36 | `document.upload` | assigned | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| 37 | `document.read` | assigned | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| 38 | `document.download` | assigned | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| 39 | `document.change_category` | assigned | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ |
| 40 | `document.withdraw` | assigned | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| 41 | `document.restore` | assigned | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| 42 | `document.read_catalog` | tenant | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| 43 | `document.manage_catalog` | tenant | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |

Checked against `backend/src/common/authz/matrix.ts` on 2026-09-23. None is step-up gated.

### Key Entities

- **Document** (`007`): file name, MIME type, size, category, upload date, status (active /
  withdrawn). Belongs to exactly one case.
- **Document category** (`007`): a firm's own name for a kind of document; active or retired.

---

## Success Criteria *(mandatory)*

- **SC-001**: An `AA` on a case uploads a PDF and previews it inline in under 30 seconds, without
  leaving the matter.
- **SC-002**: Every one of `007`'s refusals a person can reach (file type, storage limit,
  unreachable case, retired category, already withdrawn) renders Spanish copy; zero server
  `message` strings reach the screen (asserted per code).
- **SC-003**: A downloaded file keeps its original name and extension (after Decision 4).
- **SC-004**: A withdrawn document can be found and restored by an `MP` from the screen (after
  Decision 2).
- **SC-005**: A case the caller is not on is indistinguishable, on screen, from one that does not
  exist.
- **SC-006**: No signed URL appears in localStorage, sessionStorage or IndexedDB after preview and
  download (e2e, as `003`'s `auth-no-browser-storage.spec.ts` checks).

---

## Decisions Requiring Sign-Off

### Decision 1 — Where documents live

**Recommended**: a page per case, `/expedientes/{caseId}/documentos`, linked from `019`'s case
panel: list on the left, preview pane on the right (stacked on mobile).
**Why**: the case panel is a modal at `max-w-2xl`; a PDF preview needs the width, and a modal
inside a modal traps focus badly. **Alternative**: a "Documentos" section inside the panel with
preview in a second dialog — fewer files, a worse reader.

### Decision 2 — Withdrawn documents can be found again (changes `007`)

**Recommended (A)**: a separate route, `GET /tenant/cases/:caseId/documents/withdrawn`, declared
`@Capability('document.restore')` + `@ScopeTarget('caseId')` — so only MP and SA reach it, decided by
`AuthorizationInterceptor` like every other route, never by an archetype check in a handler (the
first draft said `?status=withdrawn` on the list; one route per capability is how this codebase
expresses who may read what). Everyone else keeps today's active-only list. `007` contract gains
§2a. **(B)** ship withdraw without restore in
the UI — a partner's mis-click then needs a database operator. **(C)** leave withdraw out too.

### Decision 3 — Office files are downloaded, not "previewed"

**Recommended**: treat `converted-pdf` as `unsupported` in the UI and amend `007` contract §3 and
research D5 to say conversion is not implemented. A real converter (LibreOffice/Gotenberg as a
service) is infrastructure, and blocked with AWS. **Alternative**: build the converter now.

### Decision 4 — Download names and an upload size cap (changes `007`)

**Recommended**: the download URL is signed with `ResponseContentDisposition: attachment;
filename*=UTF-8''<original>` and the preview URL with `inline`; multer gets a size limit
(proposed **25 MB**, `DOCUMENT_MAX_UPLOAD_BYTES`), refused as `413 payload_too_large` with Spanish
copy, mirrored client-side. **Alternative**: filenames only, no cap yet.

### Decision 5 — "Unclassified" becomes "Sin clasificar" (changes `007`)

**Recommended**: a migration renames each firm's `Unclassified` to `Sin clasificar` (only where the
firm has not already created a "Sin clasificar"), the seed uses the Spanish name, and the default
lookup accepts either. **Alternative**: keep the stored name and display "Sin clasificar" in the UI
only — cheaper, but the API and any export keep the English word.

### Decision 6 — Categories are managed in `/configuracion`

**Recommended**: a fourth tab "Categorías de documentos" in `014`'s page (MP/SA), next to the
position catalog it mirrors. **Alternative**: a separate `/documentos/categorias` route.

---

## Assumptions

- `006`/`019`'s case detail read and `016a`'s classifier are unchanged.
- MinIO in development serves signed URLs from `http://localhost:9000`; the frontend's security
  headers are adjusted to allow exactly the configured object-store origin for preview.
- The demo firm (Alfa) already has the four default categories, seeded at provisioning.

## Dependencies

- `007` backend (shipped), plus Decisions 2, 4, 5 if approved.
- `014`'s `/configuracion` page (Decision 6) and its position-catalog component pattern.
- `019`'s `CaseDetailPanel` (the entry link).

## Out of Scope

- Search across documents (`US05`, IT2), versions (`US08`, IT2), bulk upload (`US11`, IT2),
  sharing with clients (`US04`, IT2), upload notifications (`US12`, IT3).
- Naming the uploader (`US07`, IT3) — no slice stores a person's name (`019` Q2).
- A firm-wide "all documents" view: every document route is nested under its case by design.

## Approval Checklist

- [x] Decision 1 — documents page per case — **approved by Francisco Garcia (CC technical lead), 2026-09-23**
- [x] Decision 2 — withdrawn list for MP/SA, option A (changes `007`) — **approved by Francisco Garcia (CC technical lead), 2026-09-23**
- [x] Decision 3 — Office files download-only; `007` contract amended — **approved by Francisco Garcia (CC technical lead), 2026-09-23**
- [x] Decision 4 — download filename + 25 MB upload cap (changes `007`) — **approved by Francisco Garcia (CC technical lead), 2026-09-23**
- [x] Decision 5 — rename to "Sin clasificar" in the database (changes `007`) — **approved by Francisco Garcia (CC technical lead), 2026-09-23**
- [x] Decision 6 — categories tab in `/configuracion` — **approved by Francisco Garcia (CC technical lead), 2026-09-23**
- [x] Checked against `007`'s code, not only its contract (six differences recorded above)
- [x] Permission matrix declared as a mirror of `matrix.ts` rows 36–43
- [x] Zero `[NEEDS CLARIFICATION]` markers
