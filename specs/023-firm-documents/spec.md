# Feature Specification: The Firm's Documents

**Feature Branch**: `023-firm-documents` (stacked on `022-demo-firm-seed`)
**Created**: 2026-09-25
**Status**: Decided — eight decisions taken by Claude 2026-09-25, pending ratification by Jero
**Input**: `021` built documents **per case** and nothing above it. A firm cannot answer "where is
the dictamen?" without first remembering which matter it was filed under. `/documentos` is the
missing view, and searching it is the missing capability.

> **Citation convention.** Requirements of slices 004, 006, 007, 013, 016a, 018, 019, 020, 021 and
> 022 are cited as `007/FR-0NN` etc. Bare `FR-0NN` refers to this document. Code is cited as
> `path:line`, read on 2026-09-25 at the commit this branch starts from.
>
> **Authorship.** Written by Claude (Opus 5) on 2026-09-25, end to end. Every open point is
> resolved as a numbered Decision; each is marked *"Decided by Claude 2026-09-25 — pending
> ratification by Jero"*. Nothing here is approved.

---

## Why this slice matters

`007` shipped the document backend, `021` shipped the screens — **and every route is nested under
one case.** `documents.controller.ts` is `@Controller('tenant/cases/:caseId/documents')`, and its
client-side counterpart takes `caseId` in all eleven of its functions
(`frontend/src/app/documents/api.ts`). So the product can answer "what is in this matter?" and
cannot answer any of:

- *where is the dictamen pericial?* — the firm has 130 of them across 40 matters;
- *show me every contract we hold* — category is a per-document field with no cross-case view;
- *what did we file last week?* — upload date is only visible inside a matter.

`/documentos` has existed in the navigation since `016a`, marked `available: false`, for exactly
that reason. This slice is the screen behind it, plus the one endpoint it needs.

It is also the first slice in the product to **search**. That is worth saying plainly, because the
constitution rules out OpenSearch on the grounds that "Postgres full-text search covers
US05-EP04-DOC" — and no full-text search exists anywhere in this codebase yet. Decision 2 settles
what "search" means here, and it is not what that line assumes.

---

## What the code actually does, checked against the code rather than its contract

`documents.controller.ts`, `documents.repository.ts`, `case.repository.ts`, `common/authz/*`,
`common/audit/actions.ts`, `common/http/pagination.ts`, `frontend/src/app/documents/api.ts`,
`frontend/src/app/expedientes/[caseId]/documentos/*` and `frontend/src/shell/navigation-items.ts`
were read before this spec was written. Nine findings shape it.

| # | What a screen would assume | What the code does | Consequence |
|---|---|---|---|
| 1 | There is some way to list a firm's documents | There is not. The only list is `listByCase` — `WHERE d.case_id = $1 AND d.status = 'active'` (`documents.repository.ts:214-221`) | The endpoint is new → **FR-001** |
| 2 | A flat document route is fine | `documents.controller.ts:1-7` explicitly rules one out: *"never a flat `/tenant/documents/:id` shape — `@ScopeTarget('caseId')` reads a route parameter directly and has no async-lookup extension point"* | That reasoning binds `:id` routes, not a list, which has no target. Resolved deliberately rather than quietly → **Decision 1** |
| 3 | `assigned` scope can be applied to a list by the interceptor | It cannot. A resolver returns a **boolean** (`scope.ts:29-32`), and `@ScopeTarget` reads `request.params` synchronously (`interceptor.ts:269-276`). There is no "permit, but fewer rows" outcome | The capability must be `tenant`-scoped and the predicate must live in the query — exactly what `case.read_list` already does, with a comment warning against "tidying" it to `assigned` (`capability.ts:71-79`) → **FR-004** |
| 4 | Lists are page-numbered and return a total | **No endpoint in the product is offset-paginated, and none returns a total.** Every list is an opaque forward cursor, `{ items, nextCursor }` (`common/http/pagination.ts:15-18`); `MAX_LIMIT` is 200, default 50 | The mockup's "128 documentos" needs a count that does not exist anywhere → **Decision 3** |
| 5 | "Postgres search" means full-text search | **There is no `tsvector`, `to_tsquery` or `plainto_tsquery` anywhere in `backend/`.** Both existing text filters are substring `ILIKE` — `case.repository.ts:171-179` and `client.repository.ts:84` | Choosing between them is a real decision, not a formality → **Decision 2** |
| 6 | A document list item can name its matter | It cannot. `present()` returns category name but no case file number and no client (`documents.controller.ts:41-59`), and `SELECT_WITH_CATEGORY` joins only `document_category` — never `case_file` (`documents.repository.ts:45-52`) | A firm-wide card has nothing to identify the matter with → **FR-002** |
| 7 | The nav entry is consistent with the matrix | It is not. `documentos` carries `requiredArchetypes: INTERNAL`, which **includes `BM`** (`navigation-items.ts:105-113`, `INTERNAL` at `:67`), while `MATRIX` grants `BM` **none** of the eight `document.*` capabilities (`matrix.ts:101-110`) | Flipping `available: true` without narrowing the list would draw a `BM` a link to a page every request on which is refused → **FR-014** |
| 8 | The per-case list is audited, so a firm-wide one should be | It is not: `@Get()` carries no `@Audited` (`documents.controller.ts:97-104`), and neither do the client, case or category lists. Only `document.previewed` and `document.downloaded` are recorded, both channel-gated (`actions.ts:74-81`, `:145-157`) | Whether to audit this list is an open question with a real precedent on both sides → **Decision 6** |
| 9 | `021`'s components can be reused as they are | Only partly. Everything under `app/expedientes/[caseId]/documentos/` takes `caseId` as a **prop** and passes it to every query; nothing accepts a per-row case. But `frontend/src/documents/` is already case-agnostic — `format.ts`, `navigate.ts`, `refusal-copy.ts`, `upload-rules.ts` | Preview, download and refusal copy are reused; the list and its row are new → **FR-010** |

Two more facts that constrain the plan:

- **Adding an audit action costs a migration.** The vocabulary is a `CHECK` constraint re-issued
  in full by each slice that extends it (`0046_calendar_event.sql:82-157`). Decision 6's "not
  audited" answer is therefore also the answer that needs no migration.
- **Adding a capability costs two test edits, by design.** `matrix-exhaustive.test.ts` iterates
  `Object.keys(CAPABILITIES)` and cross-checks each row against a table transcribed independently
  of `matrix.ts`, so a new capability without an assertion fails the build loudly. That is the
  intended behaviour, not an obstacle (`tests/unit/matrix-exhaustive.test.ts:1-7`).

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Find a document without remembering its matter (Priority: P1) 🎯 MVP

A case manager remembers a dictamen arrived last month but not which matter it belongs to. They
open `/documentos`, type "dictamen", and see it with its matter's file number on the card.

**Catalog**: `US15-EP04-DOC-LinkDocumentsToCaseFile` (MVP) and
`US05-EP04-DOC-SearchDocumentsByKeyword` — **promoted IT2 → MVP** in this slice's PR.

**How this slice reads `US15`**: the catalog phrases it as "auto-link to related case", and the
link itself already exists — `document.case_id` is set at upload and immutable (`007/FR-001`).
What has never existed is the link being *visible or usable*: no screen shows which matter a
document belongs to unless you are already inside that matter. This slice makes the link legible
(every card names its matter) and actionable (filter by matter). Stated here rather than left for
a reviewer to reconcile.

**Why this priority**: it is the slice. Everything else is a filter on this list.

**Independent Test**: as an `MP` on the demo firm, open `/documentos`, see a count and a grid of
cards; type "dictamen"; see only matching documents, each showing its file number.

**Acceptance Scenarios**:

1. **Given** an `MP` or `SA`, **When** they open `/documentos`, **Then** they see every active
   document in the firm, newest first, with the total count rendered as "N documentos".
2. **Given** an `AA`, `PL` or `CM`, **When** they open it, **Then** they see only documents of
   matters they hold a live assignment on — and the count reflects that same restriction, not the
   firm's total (**FR-005**).
3. **Given** a search term, **When** it is typed, **Then** the list filters on document file name
   **or** case file number, case-insensitively, after a 300 ms debounce (`019`'s precedent).
4. **Given** a search with no matches, **Then** `016a`'s empty state appears with guidance, and
   the count reads "0 documentos".
5. **Given** a `BM`, **Then** `/documentos` is not in their navigation at all and the endpoint
   refuses them (**FR-014**).
6. **Given** more documents than one page, **When** the person reaches the end, **Then** "Cargar
   más" fetches the next page by cursor, as `019`'s register does.

---

### User Story 2 — Narrow the list down (Priority: P2)

A partner wants every contract on one client's matter.

**Acceptance Scenarios**:

1. **Given** the type filter, **When** a category is chosen, **Then** only documents in it are
   listed and the count follows (**FR-006**).
2. **Given** the matter filter, **When** a matter is chosen, **Then** only its documents are
   listed; the options offered are only matters the person can reach.
3. **Given** both filters and a search term, **Then** all three apply together, and clearing them
   is one action ("Limpiar filtros", `019`'s precedent).
4. **Given** a filter value that is a well-formed id for something that does not exist, **Then**
   the answer is an empty list, never a refusal — `006`'s deliberate choice
   (`case.service.ts:81-87`), so a filter cannot be used to probe for ids.
5. **Given** a malformed filter value, **Then** `400 validation_failed`.

---

### User Story 3 — Read a document from the firm-wide list (Priority: P3)

Somebody finds the document and opens it without navigating to its matter first.

**Acceptance Scenarios**:

1. **Given** a card, **When** "Ver" is chosen, **Then** `021`'s preview is used unchanged, called
   with **that row's** case id (**FR-010**).
2. **Given** an Office file, **Then** the "no preview" state with "Descargar" appears — `021`'s
   Decision 3, unchanged.
3. **Given** "Descargar", **Then** the file is saved under its original name, through `021`'s
   existing `useDownload`.
4. **Given** a document withdrawn by a colleague since the list loaded, **When** preview is
   chosen, **Then** the `404` is classified as `016a`'s opaque state and the list re-reads.
5. **Given** a person without `document.download`, **Then** no download control is drawn — the
   matrix is the source, through `can()`.

---

### User Story 4 — Upload from here, having chosen a matter (Priority: P4)

Someone has a file and knows the matter, and starts from the documents page rather than the case.

**Acceptance Scenarios**:

1. **Given** somebody holding `document.upload`, **When** they press "Subir Documento", **Then**
   the dialog asks for **the matter first** and the file second (**FR-012**, Decision 7).
2. **Given** the matter selector, **Then** it offers only matters the person can reach — the same
   `assigned`-scoped `GET /tenant/cases` the register uses — so a case they could not upload to is
   never offered.
3. **Given** a matter is chosen, **Then** the rest of the dialog is exactly `021`'s
   `UploadDialog`: category, file-type check, the 25 MB cap, and its Spanish refusals.
4. **Given** a `BM` or anyone without `document.upload`, **Then** the button is not drawn.
5. **Given** the upload succeeds, **Then** the firm-wide list re-reads and the new document is at
   the top.

---

### Edge Cases

- **A matter the person is removed from mid-session**: the next page or re-read simply omits its
  documents. No error — losing an assignment is not a failure.
- **`MP` and the unstaffed matter**: `022` seeds a matter with no live assignment. An `MP` sees
  its documents (unrestricted), an `AA` does not. That contrast is the scope test with real data.
- **Search text containing `%` or `_`**: substring `ILIKE` treats both as wildcards. They must be
  escaped, or searching for "50%" returns everything (**FR-008**). Neither existing search escapes
  them — recorded as a defect this slice does not spread.
- **A retired category on a filter**: retired categories are still shown as filter options when
  documents remain filed under them, marked "Retirada" as `021` does; otherwise a person cannot
  find those documents at all.
- **Zero documents in the whole firm**: the empty state, with the upload action when held.
- **A very long file name**: the card truncates with a visible ellipsis and carries the full name
  as its accessible name — never a `title` attribute alone.
- **The count and the page disagreeing** because somebody uploaded between the two queries: both
  are read in one request. The count may be one behind reality for a moment; it must never be
  computed with a different predicate than the page (**FR-007**).

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A new `GET /tenant/documents` returns the firm's active documents, newest first,
  cursor-paginated in the shape `common/http/pagination.ts` already defines.
- **FR-002**: Each item carries what a firm-wide card needs and `present()` does not supply: the
  document's own fields plus `caseId` and `caseFileNumber`. The client's name is **not** included
  — the mockup's card does not show it and Principle VI's minimisation says not to send it.
- **FR-003**: The route declares a new capability `document.read_list` at `tenant` scope, granted
  to `MP`, `AA`, `PL`, `CM`, `SA` and **not** `BM` — mirroring `document.read` exactly.
- **FR-004**: Scope is applied **inside the query**, not by the interceptor: `MP` and `SA` are
  unrestricted; everybody else sees only documents whose case has a live `case_assignment` for
  their membership. One parenthesised predicate, the shape `case.repository.ts:156-162` and
  `calendar.repository.ts:101-112` both use — and the reason it cannot be the interceptor's job is
  recorded in `case-list-scoping.test.ts:1-15`, quoted under Decision 1.
- **FR-005**: The total count obeys the **same** predicate as the page, including every active
  filter, so the number a person sees describes the list they are looking at.
- **FR-006**: Filters: `categoryId` and `caseId`, both optional, both validated for UUID shape
  only — a well-formed id that matches nothing yields an empty list, never a refusal.
- **FR-007**: The page and the count are computed in one request from one predicate.
- **FR-008**: The search term is trimmed, ignored when empty, and has `%`, `_` and `\` escaped
  before being interpolated into `ILIKE`.
- **FR-009**: `/documentos` renders the mockup: a search box, a type filter, a matter filter, the
  "N documentos" count, a grid/list toggle, and cards showing file name, date, category and case
  file number.
- **FR-010**: Preview and download reuse `021`'s modules unchanged, called with each row's own
  `caseId`. No second preview implementation is written.
- **FR-011**: The grid/list choice is remembered **per viewer in the browser only**, never sent to
  the server and never stored per tenant (Decision 8).
- **FR-012**: "Subir Documento" requires a matter to be chosen before a file, offering only
  matters the person can reach, and then reuses `021`'s upload dialog.
- **FR-013**: Every control is gated by `can()` against the frontend mirror; the new capability is
  added to `frontend/src/authz/capability-matrix.ts` and to
  `capability-matrix-sync.test.ts`'s independently transcribed fixture.
- **FR-014**: `navigation-items.ts`'s `documentos` entry flips to `available: true` and narrows
  `requiredArchetypes` to `['MP','AA','PL','CM','SA']`, removing `BM` (finding #7).
- **FR-015**: All copy is Spanish, the new components join `spanish-copy.test.tsx`, and no colour
  literal is introduced (`020`/FR-009).
- **FR-016**: The list read writes no audit entry (Decision 6). Preview and download keep their
  existing per-click audited accesses, unchanged.
- **FR-017**: No new migration, no new audit action, no new table, no new dependency.

### Capability Matrix *(Principle IV — one new row)*

| # | Capability | Scope | MP | AA | PL | CM | BM | SA |
|---|---|---|---|---|---|---|---|---|
| **new** | **`document.read_list`** | **tenant** | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| 36 | `document.upload` | assigned | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| 37 | `document.read` | assigned | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| 38 | `document.download` | assigned | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| 39 | `document.change_category` | assigned | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ |
| 40 | `document.withdraw` | assigned | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| 41 | `document.restore` | assigned | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| 42 | `document.read_catalog` | tenant | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| 43 | `document.manage_catalog` | tenant | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |

Rows 36–43 verified against `matrix.ts:101-110` on 2026-09-25 and reproduced here unchanged.
`document.read_list` is `tenant`-scoped **and that is not a widening**: the rows a caller receives
are narrowed by FR-004's predicate inside the query, exactly as `case.read_list` works. The
capability answers "may you ask this question at all"; the query answers "about which documents".
None is step-up gated.

### Key Entities

No new entity. `document` and `document_category` (`007`) and `case_file` (`006`) unchanged; this
slice adds a query across them.

---

## Success Criteria *(mandatory)*

- **SC-001**: A `CM` finds a document by a word in its name, without knowing its matter, in under
  15 seconds from opening `/documentos`.
- **SC-002**: An `AA`'s list and count include **no** document of a matter they are not assigned
  to — asserted against the `022` demo firm, which has both kinds.
- **SC-003**: The count equals the number of items a person would reach by paging to the end, for
  every combination of filters — asserted, not assumed.
- **SC-004**: A `BM` sees no `/documentos` navigation entry and receives a refusal from the
  endpoint.
- **SC-005**: Searching `100%` or `a_b` returns only documents whose name contains that literal
  text (FR-008).
- **SC-006**: Preview and download from the firm-wide list behave identically to `021`'s per-case
  screens, with no second implementation — asserted by both paths importing the same module.
- **SC-007**: Zero colour literals and zero English strings in the new files.
- **SC-008**: `matrix-exhaustive.test.ts` and `capability-matrix-sync.test.ts` pass with the new
  capability asserted in both, and no other matrix row changed.

---

## Decisions

Every decision below was taken rather than deferred. **Decided by Claude 2026-09-25 — pending
ratification by Jero.**

### Decision 1 — A flat `GET /tenant/documents`, with a `tenant`-scoped capability

**Taken**: one new flat route, `document.read_list` at `tenant` scope, with the assignment
predicate inside the repository query.
**Why this is not in conflict with the comment forbidding flat routes**, which a reviewer will
reasonably raise: `documents.controller.ts:1-7` rules out a flat `/tenant/documents/:id` because
`@ScopeTarget('caseId')` reads a route parameter and cannot look a document's case up
asynchronously. A **list has no target id**, so that mechanism was never available to it and
nothing is being circumvented. The codebase already contains this exact shape, with the reasoning
written out twice — and the second place is decisive rather than suggestive:

> *"That is why `case.read_list` declares `tenant` scope rather than `assigned`. A scope resolver
> returns a boolean and `decide()` turns `false` into a refusal — there is no outcome meaning
> 'permit, but return fewer rows'. An `assigned`-scoped list could only have refused this caller,
> and 016a would have rendered its ERROR state where the spec requires its EMPTY state. If someone
> later 'tidies' row 29 to `assigned` for consistency with rows 30/32/33, this file is what stops
> them."*
> — `backend/tests/contract/case-list-scoping.test.ts:1-15`

So there is already a test in this repository whose stated purpose is to prevent exactly the
"correction" a reviewer might ask for here. `capability.ts:71-79` carries the same warning as a
comment. This slice follows that precedent rather than arguing with it.
**Rejected (B)**: `GET /tenant/cases/documents` — a flat route wearing a nested URL, which reads
as a case id named "documents" to anybody scanning the routes.
**Rejected (C)**: a client-side fan-out over the person's cases. N requests, a count that cannot
be computed, and pagination that cannot be expressed.

### Decision 2 — Substring `ILIKE`, not Postgres full-text search

**Taken**: `WHERE (d.original_filename ILIKE '%…%' OR cf.file_number ILIKE '%…%')`, one
parenthesised group, with wildcards escaped (FR-008).
**Why, given the constitution names full-text search**: the MVP prohibition list rules out
OpenSearch *"— Postgres full-text search covers US05-EP04-DOC"*. That sentence rules out a search
cluster; it does not require `tsvector`, and the promise it makes — searching without new
infrastructure — is kept exactly. Three concrete reasons to prefer `ILIKE` here:
1. **What is being searched is identifiers, not prose.** `to_tsvector('spanish', 'Escrito inicial
   de demanda 3.pdf')` stems words and discards punctuation, so `EXP-2026-2001` does not survive
   as a searchable unit and a user typing `2026-2001` gets surprising results. Substring matching
   is what a person expects from a file-name box.
2. **Prefix and infix matching are the common case.** "dicta" should find "dictamen". FTS needs
   `:*` and only matches prefixes of stemmed lexemes, never infixes.
3. **It is the codebase's existing answer.** Both text filters in the product are `ILIKE`
   (`case.repository.ts:171-179`, `client.repository.ts:84`). A second, different search mechanism
   for the third screen is a divergence with no user-visible benefit.
**What this defers, stated so it is not lost**: searching document *content* (the words inside a
PDF) is a different feature. It needs text extraction at upload, a `tsvector` column and a GIN
index, and it is not what `US05` asks for ("keyword and filename search"). When it is wanted, FTS
is the right tool and this decision does not stand in its way.
**Cost accepted**: `ILIKE '%term%'` cannot use a B-tree index and will sequentially scan
`document`. At the scale this product targets — a firm with a few thousand documents — that is
microseconds, and the same trade-off `006` already accepted for cases. If it ever matters, the
remedy is a `pg_trgm` GIN index, which is a migration and no API change.

### Decision 3 — The envelope gains `total`

**Taken**: `{ items, nextCursor, total }`, where `total` is a `COUNT(*)` under the identical
predicate.
**Why**: the mockup shows "128 documentos", and a count is the one thing an opaque cursor cannot
express. The envelope is already extensible — `audit.controller.ts` returns a third field,
`servedWindow`, for its own reasons — so this is a precedent, not a new pattern.
**Why it must share the predicate** (and why the spec says so twice): a count computed without
the assignment predicate would tell an `AA` how many documents the firm holds, which is a
quantitative leak about matters they cannot reach. FR-005 and SC-003 exist to keep that honest.
**Cost accepted**: a second query per request. Measured against the alternative — a person unable
to tell whether a filter matched 3 documents or 300 — it is worth one `COUNT`.
**Rejected**: no count at all (the mockup's most informative element, dropped); an approximate or
capped count ("200+"), which is a lie at the exact moment it matters.

### Decision 4 — `BM` loses the documents navigation entry, and this slice is where

**Taken**: flip `available: true` **and** narrow `requiredArchetypes` to
`['MP','AA','PL','CM','SA']` in the same edit.
**Why**: the entry currently says `INTERNAL`, which includes `BM`, while the matrix grants `BM`
none of the eight document capabilities. Today that inconsistency is invisible because the entry
is `available: false` and renders as inert text. The moment it becomes a link, a billing manager
gets a menu item leading to a page that refuses every request it makes — which `016a`'s own note
calls worse than an honestly unavailable one.
**Why here and not in a tidy-up**: `navigation-items.ts`'s header states the rule — a slice flips
its own flag in the same PR that adds its screen, with its real `requiredArchetypes`. This is that
PR.

### Decision 5 — The card's title is the file name

**Taken**: file name as the card's heading; date, category and case file number beneath it.
**Why**: it is what the person is scanning for, and it is what they typed into the search box —
a list whose heading is not the thing you searched for reads as the wrong list. The matter number
is the secondary line because it answers "which matter?", which is the question the card exists
to answer second.
**Rejected**: the matter number as the title (groups visually by matter, which is what the *case*
screen is for) — and truncating the file name harder to fit, which hides the one field that
identifies the row.

### Decision 6 — The list is not audited

**Taken**: no `@Audited` on the list route, and no new audit action.
**Why**: Principle V requires every *access to* a document to be recorded, and the list serves no
document — no bytes, no signed URL, only names the person is already entitled to see. The
audited accesses remain `document.previewed` and `document.downloaded`, one per explicit click
(`021`/FR-008, FR-010).
**Why `021`/FR-002 is not a counter-precedent**, since it deliberately audits a read: that is
`case.read`, a **single-resource** read of one matter, and `007`/`021` treat opening a matter as an
access. Every **list** in the product is unaudited — documents per case, clients, cases,
categories — and a debounced search box would otherwise write an audit row per keystroke batch,
burying the accesses that matter in noise. Principle V's value is evidentiary; a log nobody can
read has none.
**It is also the answer that needs no migration**, since the vocabulary is a `CHECK` constraint
re-issued whole per slice — a convenience, not the reason.

### Decision 7 — Upload asks for the matter first

**Taken**: "Subir Documento" opens a dialog whose first field is a searchable matter selector fed
by `GET /tenant/cases`; the file picker and category follow, reusing `021`'s dialog beneath.
**Why**: `POST /tenant/cases/:caseId/documents` cannot be called without a case, and
`document.upload` is `assigned`-scoped — so the case must be chosen *and* must be one the person
can reach. Feeding the selector from the already-`assigned`-scoped case list means an unreachable
matter is never offered, rather than offered and then refused.
**Rejected**: drawing the button disabled with a link to `/expedientes` (makes the firm-wide page
read-only for no reason); uploading to a "sin expediente" holding area (`007`/FR-001 makes
`case_id` mandatory and immutable, so there is nowhere to put it).

### Decision 8 — The grid/list toggle is per-viewer, in the browser

**Taken**: `localStorage`, read defensively, defaulting to grid.
**Why**: it is a viewing preference, not firm data. Storing it server-side would mean a table, a
migration and a capability for something that does not survive being wrong. Per-viewer also means
two people looking at the same firm can disagree, which is correct.
**Consequence accepted**: it does not follow a person between devices, and a private window
forgets it. Both are fine for a toggle with two states.

---

## Assumptions

- `021`'s preview, download and refusal-copy modules are unchanged and reusable; this slice adds
  no behaviour to them.
- `022`'s demo firm is the data these screens are judged against: 130 documents across 40 matters,
  with matters the `AA`s are deliberately not on.
- MinIO remains unavailable on this machine, so preview and download cannot be exercised
  end-to-end here (they are `021`'s, already shipped and tested where a store exists).
- `GET /tenant/cases` is suitable as the matter selector's source at demo scale (45 matters, one
  page).

## Dependencies

- `007` — the `document` table, categories, and the upload/preview/download routes.
- `021` — every frontend module this slice reuses rather than rewrites.
- `006` — `case_file`, `case_assignment` and the `assigned`-scope predicate this slice copies.
- `004` — the capability registry and the two matrix tests that guard it.
- `022` — not a build dependency, but the data without which these screens cannot be judged.

## Out of Scope

- **Document content search** (the words inside a PDF) — Decision 2 records why and what it would
  take.
- **Versions** (`US08`, IT2), **bulk upload** (`US11`, IT2), **client sharing** (`US04`, IT2),
  **upload notifications** (`US12`, IT3), **naming the uploader** (`US07`, IT3 — no slice stores a
  person's name).
- **A firm-wide withdrawn list.** `021`'s withdrawn view stays per case: restoring a document is a
  matter-level act, and `document.restore` is `assigned`-scoped.
- **Renaming `frontend/src/app/documents/` to `documentos/`.** The directory is English while
  every route is Spanish — a real inconsistency, recorded by `plan-paralelo-2026-09.md` §2. It
  holds the API client that this slice extends, and renaming it touches every `021` import for no
  behaviour change. Left as recorded debt rather than smuggled into this diff.
- **Changing any existing matrix row.** Only `document.read_list` is added.

## Approval Checklist

- [ ] Decision 1 — flat `GET /tenant/documents`, `tenant`-scoped capability, predicate in the query — *Decided by Claude 2026-09-25, pending ratification by Jero*
- [ ] Decision 2 — `ILIKE` substring search rather than full-text — *Decided by Claude 2026-09-25, pending ratification by Jero*
- [ ] Decision 3 — the envelope gains `total`, under the same predicate — *Decided by Claude 2026-09-25, pending ratification by Jero*
- [ ] Decision 4 — `BM` removed from the documents nav as it is switched on — *Decided by Claude 2026-09-25, pending ratification by Jero*
- [ ] Decision 5 — the card's title is the file name — *Decided by Claude 2026-09-25, pending ratification by Jero*
- [ ] Decision 6 — the list is not audited — *Decided by Claude 2026-09-25, pending ratification by Jero*
- [ ] Decision 7 — upload asks for the matter first — *Decided by Claude 2026-09-25, pending ratification by Jero*
- [ ] Decision 8 — grid/list toggle per viewer, in the browser — *Decided by Claude 2026-09-25, pending ratification by Jero*
- [x] Checked against the code, not only its contracts — nine findings recorded above
- [x] `US05-EP04-DOC-SearchDocumentsByKeyword` promoted IT2 → MVP in this slice's PR
- [x] Permission matrix declares the one new row and reproduces rows 36–43 unchanged
- [x] Zero `[NEEDS CLARIFICATION]` markers
