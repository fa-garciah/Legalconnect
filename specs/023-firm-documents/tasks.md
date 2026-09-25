---
description: "Task list for 023-firm-documents"
---

# Tasks: The Firm's Documents

**Input**: [spec.md](./spec.md), [plan.md](./plan.md)

**Tests**: mandatory, strict TDD — every test task is run and **seen to fail** before the task
under it starts.

## Format: `[ID] [P?] [Story] Description`

Stories: **US1** find without knowing the matter · **US2** narrow it down · **US3** read from the
list · **US4** upload having chosen a matter.

---

## Phase 1: The capability (BLOCKS every route task)

- [ ] T001 Unit test — extend `backend/tests/unit/matrix-exhaustive.test.ts`'s independently
      transcribed table with `document.read_list` → `['MP','AA','PL','CM','SA']` in its
      `TENANT_ROWS` group. **See it fail** (the capability does not exist yet, so the iteration
      over `Object.keys(CAPABILITIES)` cannot reach it and the transcribed row is unmatched).
- [ ] T002 `capability.ts`: `'document.read_list': { scope: 'tenant' }`, beside the other
      `document.*` rows, carrying a note pointing at `case.read_list`'s "do not tidy this row to
      `assigned`" comment — the next reader will have the same instinct and the same answer.
      `matrix.ts`: the row, `BM` excluded.
- [ ] T003 Frontend mirror: add the row to `frontend/src/authz/capability-matrix.ts` **and** to
      `frontend/tests/unit/capability-matrix-sync.test.ts`'s fixture (the sync test checks
      mirror→fixture, so an un-mirrored capability is not otherwise caught).

## Phase 2: The query (US1, US2)

- [ ] T004 [P] Unit test `backend/tests/unit/like-escape.test.ts`: `escapeLike` escapes `\`, `%`
      and `_`; leaves other text alone; is idempotent about nothing (escaping twice doubles the
      escapes, which is why callers must not); and a term of `100%` becomes a literal match.
      **See it fail.**
- [ ] T005 [P] `backend/src/modules/documents/like-escape.ts` — `escapeLike`, used with an
      explicit `ESCAPE '\'` in the SQL.
- [ ] T006 Contract test `backend/tests/contract/firm-documents-list.test.ts`: `GET
      /tenant/documents` returns `{ items, nextCursor, total }`; newest first; `MP` and `SA` see
      every active document of the firm; `AA`/`PL`/`CM` see only documents of matters they hold a
      live assignment on; `BM` is refused; a withdrawn document never appears; `limit` over 200
      and a malformed cursor are `400`. **See it fail.**
- [ ] T007 `DocumentsRepository.listForTenant` — the join to `case_file`, the single predicate
      list shared by the page query and `count(*)`, the `(uploaded_at, id)` cursor via `toPage`.
- [ ] T008 `FirmDocumentsController` at `@Controller('tenant/documents')`:
      `@Capability('document.read_list')`, **no** `@ScopeTarget` (`scope-target-declared.test.ts`
      refuses an inert one on a non-`assigned` route), **no** `@Audited`. Presenter adds `caseId`
      and `caseFileNumber` and deliberately omits the client's name.
- [ ] T009 Contract test `backend/tests/contract/firm-documents-count.test.ts` — **the leak test.**
      Builds its **own** firm with `makeCaseFirm`, one matter the `AA` is assigned to and one they
      are not, with documents on both — following `case-list-scoping.test.ts` exactly. Asserts
      `total` equals the number of items reached by paging to the end, under every combination of
      no filter / category / matter / search, and that the `AA`'s `total` is strictly smaller than
      the `MP`'s (SC-002, SC-003). **See it fail.**
      *(Found by `/speckit-analyze` as HIGH: the first draft asserted this against `022`'s demo
      firm, which CI never seeds before contract tests — green here, vacuous or red there.)*
- [ ] T009a **FR-002 — minimisation.** In `firm-documents-list.test.ts`, assert the response
      carries `caseId` and `caseFileNumber` and **no** client name — neither the field nor the
      seeded client's legal name anywhere in the serialised body. The join makes the name free to
      include, so without this a later "helpful" addition would pass every other test (Principle
      VI). **See it fail.** *(Gap found by `/speckit-analyze`.)*
- [ ] T009b **FR-016, Decision 6 — the list is not audited.** In the same file, count
      `audit_event` rows for the tenant before and after a list request (and after a search) and
      assert the count is unchanged, while a preview still writes exactly one. This also discharges
      FR-017's "no new audit action". **See it fail.** *(Gap found by `/speckit-analyze`: Decision
      6 was argued at length and asserted nowhere.)*
- [ ] T010 Contract test `backend/tests/contract/firm-documents-filters.test.ts`: `categoryId` and
      `caseId` filter; a well-formed id matching nothing yields an empty list, **never** a refusal
      (006's deliberate choice); a malformed id is `400`; search matches file name **or** case file
      number, case-insensitively; `%` and `_` are literal (SC-005). **See it fail.**
- [ ] T011 Contract test `backend/tests/contract/firm-documents-route.test.ts`: using the
      `tests/helpers/routes.ts` helper to enumerate the real Nest router, assert `GET
      /tenant/documents` is registered and is **not** shadowed by `tenant/cases/:caseId/documents`.
      **See it fail.** *(`routes.ts` is a helper, not a contract test — the first draft said
      `tests/contract/routes.ts`, which does not exist.)*

## Phase 3: The page (US1, US2, US3)

- [ ] T012 `listFirmDocuments(query)` in `frontend/src/app/documents/api.ts` plus its types,
      omitting absent filters from the query string the way `cases/api.ts`'s `meaningful()` does.
- [ ] T013 [P] Unit test `frontend/tests/unit/view-mode.test.ts`: `readViewMode` defaults to grid
      when storage is empty, when it holds rubbish, and when `localStorage` **throws** (private
      windows); `writeViewMode` never throws. **See it fail.**
- [ ] T014 [P] `frontend/src/documents/view-mode.ts`.
- [ ] T015 Component test `frontend/tests/component/firm-documents.test.tsx`: the heading, the
      count as "N documentos", a card per item showing name, date, category and file number; the
      loading, empty and error states come from `016a`'s primitives; "Cargar más" appears only
      when `nextCursor` is present. **See it fail.**
- [ ] T016 `frontend/src/app/documentos/page.tsx` (server, resolving archetype exactly as
      `/clientes` does) and `FirmDocuments.tsx`.
- [ ] T017 `DocumentCard.tsx` and `DocumentRow.tsx` — file name as the title (Decision 5), the
      full name as the accessible name when truncated.
- [ ] T018 Component test for `DocumentFilters.tsx`: search debounces at 300 ms; the category and
      matter selects use the `ALL` sentinel and are not debounced; "Limpiar filtros" clears all
      three. **See it fail**, then build it.
- [ ] T019 `ViewModeToggle.tsx`, persisting per viewer (FR-011).
- [ ] T020 Component test: preview and download from a card call `021`'s modules with **that
      row's** `caseId`, and no control is drawn for an archetype lacking the capability.
      **See it fail**, then wire `PreviewPane`, `useDownload` and `RefusalNotice` in.

## Phase 4: Upload from the firm-wide page (US4)

- [ ] T021 Component test `frontend/tests/component/upload-from-firm.test.tsx`: the dialog asks
      for the matter **first**; the selector is fed by the assigned-scoped case list; the file
      picker is disabled until a matter is chosen; on success the list re-reads. **See it fail.**
- [ ] T022 `UploadFromFirmDialog.tsx`, wrapping `021`'s `UploadDialog` beneath the matter step.

## Phase 5: Navigation and copy

- [ ] T023 Unit test — extend `frontend/tests/unit/navigation-items.test.ts`: `documentos` is
      `available: true` and its `requiredArchetypes` are exactly `['MP','AA','PL','CM','SA']`,
      excluding `BM`. **See it fail** (finding #7: it currently says `INTERNAL`, which includes
      `BM`, while the matrix grants `BM` nothing).
- [ ] T024 Flip the flag and narrow the archetypes — both in one edit, because either alone is
      wrong.
- [ ] T025 Extend `frontend/tests/component/spanish-copy.test.tsx` with an `it(...)` rendering the
      new page and its dialog (that suite imports each component explicitly; a new screen is
      covered only by being added). Add a `FIRM_DOCUMENT_WIRE_WORDS` regex in the established
      shape. **See it fail**, then fix any English that surfaces.
- [ ] T026 Grep the new files for colour literals; expect zero (`020`/FR-009).

## Phase 6: Gates and closure

- [ ] T027 Backend gates: `typecheck`, `lint`, `test`, and with a database `test:rls`,
      `test:isolation`, `verify:role`, `test:auth-coverage`, `npm test -- --coverage`. Record the
      MinIO-dependent failures as `022` established them — pre-existing and environmental — and
      **never** claim a suite that did not run.
- [ ] T028 Frontend gates: `typecheck`, `lint`, `npm test`, `npm run build`.
- [ ] T029 e2e `frontend/tests/e2e/firm-documents.spec.ts` — sign in as `022`'s `MP`, open
      `/documentos`, search, filter, and confirm the count changes with the filter. If it cannot
      run here, say so in `quickstart-results.md` rather than writing it to pass vacuously.
- [ ] T030 `specs/023-firm-documents/quickstart.md` — how to see the screen against `022`'s demo
      firm, as `MP` and as an `AA`, and what differs between them.
- [ ] T031 `specs/023-firm-documents/quickstart-results.md` — verified and not verified, by name.
- [ ] T032 Leave the spec's eight Decision boxes **unticked** (pending Jero) and confirm the
      verification boxes are honest.

---

## Dependencies

- T001–T003 first: the capability must exist before any route can declare it, and the two matrix
  tests fail loudly until it is asserted in both places.
- T004–T005 block T007 (the query interpolates the escaped term).
- T007 blocks T008; T008 blocks T009–T011.
- T012 blocks every frontend task.
- T023–T024 should land **with** the page, not before: flipping the nav flag while `/documentos`
  is a 404 is exactly what `016a`'s note warns against.
- Phase 6 last.

## Parallel opportunities

`[P]`: T004/T005 (escaping) ‖ T013/T014 (view mode). The backend query chain and the frontend page
chain are serial within themselves but independent of each other once T012 exists.
