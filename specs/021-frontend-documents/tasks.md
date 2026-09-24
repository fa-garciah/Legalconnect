---
description: "Task list for 021-frontend-documents"
---

# Tasks: Case Documents

**Input**: [spec.md](./spec.md), [plan.md](./plan.md)

**Tests**: mandatory, strict TDD — every test task is run and **seen to fail** before the task
under it starts.

## Format: `[ID] [P?] [Story] Description`

Stories: US1 upload · US2 find & read · US3 organize (category, withdraw/restore) · US4 categories tab.

---

## Phase 1: Backend — close `007`'s gaps (BLOCKS the stories that use them)

### A. Withdrawn list (Decision 2)

- [ ] T001 Contract test `backend/tests/contract/documents-withdrawn-list.test.ts`: MP and SA get
      `200` with only withdrawn documents of the named case; AA, PL, CM `403`; BM `403`; a case
      the caller cannot reach `404`; an active document never appears. **See it fail.**
- [ ] T002 `DocumentsRepository.listWithdrawnByCase` and the route
      `GET /tenant/cases/:caseId/documents/withdrawn` (`document.restore`, `@ScopeTarget('caseId')`).
      Note the route order: `withdrawn` must not be captured by `:id`.
- [ ] T003 Amend `specs/007-document-management/contracts/document-api.md` with §2a.

### B. Signed URL disposition and upload cap (Decision 4)

- [ ] T004 Unit test `backend/tests/unit/content-disposition.test.ts`: ASCII fallback and RFC 5987
      `filename*` for "Contrato Señor Pérez.pdf"; quotes and CR/LF stripped. **See it fail.**
- [ ] T005 Contract test `backend/tests/contract/documents-download-disposition.test.ts`: the
      download URL carries `response-content-disposition=attachment…` with the original name;
      preview carries `inline`; fetching the download URL from MinIO returns that header.
      **See it fail.**
- [ ] T006 `ObjectStore.presignGet(key, { disposition })`, `contentDisposition()` helper, and the
      service using them. Keep `object-store-chokepoint.test.ts` green.
- [ ] T007 Contract test `backend/tests/contract/documents-upload-cap.test.ts`: with
      `DOCUMENT_MAX_UPLOAD_BYTES` set small, an oversized upload answers `413
      { error: { code: 'file_too_large' } }`, writes no row, leaves `storage_bytes_used` unchanged
      and no object in the bucket. **See it fail.**
- [ ] T008 `FileTooLarge` in `common/http/errors.ts`, the multer limit, and the route-scoped filter.
- [ ] T009 Amend contract §1 (cap) and §4 (disposition).

### C. "Sin clasificar" (Decision 5)

- [ ] T010 Integration test `backend/tests/integration/document-category-rename.test.ts`: after
      migration `0045`, a tenant with only `Unclassified` has `Sin clasificar`; a tenant that
      already had an active `Sin clasificar` keeps both and the default resolves to the Spanish
      one; a newly provisioned tenant is seeded with `Sin clasificar`; an upload with no category
      lands in it. **See it fail.**
- [ ] T011 Migration `backend/drizzle/0045_document_category_sin_clasificar.sql`, the seed, and
      `findDefaultCategory`. Update any test that asserted the English literal.

### D. Office preview (Decision 3)

- [ ] T012 Amend contract §3 and `007/research.md` D5: `converted-pdf` is the original file; no
      conversion exists.

- [ ] T013 Run `npm run test:isolation && npm run test:rls && npm run verify:role` and the full
      backend suite with coverage.

---

## Phase 2: Frontend foundations

- [ ] T014 [P] Unit tests `frontend/tests/unit/documents/format.test.ts` (sizes in KB/MB, es-MX;
      "Unclassified" and "Sin clasificar" both display as "Sin clasificar") and
      `upload-rules.test.ts` (allowed MIME list equals `007`'s; `.zip`/`.exe` refused; over 25 MB
      refused). **See them fail.**
- [ ] T015 Implement `frontend/src/documents/format.ts`, `upload-rules.ts`, `refusal-copy.ts`.
- [ ] T016 Add rows 36–43 to `frontend/src/authz/capability-matrix.ts` and, transcribed from
      `007/spec.md`, to `capability-matrix-sync.test.ts`'s fixture.
- [ ] T017 `listWithdrawnDocuments` in `frontend/src/app/documents/api.ts`.

---

## Phase 3: US1 — Upload (P1) 🎯 MVP

- [ ] T018 [US1] Component test `frontend/tests/component/documentos/UploadDialog.test.tsx`: sends
      `FormData` with `file` and optional `categoryId`; offers active categories only; refuses a
      `.zip` and a 26 MB file before sending; `403 limit_reached` shows the plan-limit copy;
      `413 file_too_large` and `400` show Spanish copy, never the server message; not drawn for BM.
      **See it fail.**
- [ ] T019 [US1] Implement `UploadDialog.tsx`.

## Phase 4: US2 — Find and read (P2)

- [ ] T020 [P] [US2] Component test `DocumentList.test.tsx`: name, category (retired marked
      "Retirada"), size, date; newest first; empty state copy; `404` renders the opaque state.
      **See it fail.**
- [ ] T021 [P] [US2] Component test `PreviewPane.test.tsx`: preview is requested only on "Ver";
      `pdf` → iframe titled with the file name; `image` → img with alt; `converted-pdf` and
      `unsupported` → "no disponible" + "Descargar"; an expired URL is requested again; nothing is
      written to browser storage. **See it fail.**
- [ ] T022 [US2] Implement `DocumentList.tsx`, `PreviewPane.tsx`, the download action,
      `DocumentsView.tsx` and `page.tsx`; add the "Documentos" link to `CaseDetailPanel.tsx`.

## Phase 5: US3 — Organize (P3)

- [ ] T023 [P] [US3] Component test `ChangeCategoryDialog.test.tsx`: drawn for MP/CM/SA only;
      active categories only; `422` re-reads the catalog. **See it fail.**
- [ ] T024 [P] [US3] Component test `WithdrawRestore.test.tsx`: "Retirar" for MP/SA only, confirms
      first, says it is not deleted; "Retirados" lists withdrawn documents; "Restaurar" without
      confirmation; `409` re-reads. **See it fail.**
- [ ] T025 [US3] Implement `ChangeCategoryDialog.tsx`, withdraw, and `WithdrawnList.tsx`.

## Phase 6: US4 — Categories tab (P4)

- [ ] T026 [US4] Component test `DocumentCategoriesTab.test.tsx`: lists active and retired; create
      and retire for MP/SA only; duplicate refused before sending; `409` Spanish copy; the tab is
      absent for an archetype without `document.manage_catalog`. **See it fail.**
- [ ] T027 [US4] Implement `DocumentCategoriesTab.tsx` and add the tab to `ConfiguracionView.tsx`.

---

## Phase 7: Polish

- [ ] T028 Add every new component to `frontend/tests/component/spanish-copy.test.tsx`, with a
      wire-vocabulary check for `withdrawn`, `active`, `retired`, `Unclassified`, `pending`.
- [ ] T029 e2e `frontend/tests/e2e/documentos.spec.ts`: upload a PDF → preview renders inline
      (MinIO framing) → download keeps its name → change category → withdraw → restore; no signed
      URL in browser storage.
- [ ] T030 Full gates: backend `npm test -- --coverage`; frontend `npm test`, `typecheck`, `lint`,
      `build`; zero colour literals.
- [ ] T031 `quickstart.md` and `quickstart-results.md`: what was verified by hand, what was not.
- [ ] T032 Mark `007`'s T044–T047 as delivered by `021`, and T050 as done (catalog rows added here).

## Dependencies

- Phase 1 B blocks T021/T022's download assertion; Phase 1 A blocks T024; Phase 1 C blocks T014's
  display rule only in e2e (the display mapping works either way).
- US1–US4 depend on Phase 2; US2 needs US1 only for e2e.

## Summary

- **Total**: 32 tasks · **Done**: 0
- Backend touches `007` only; no capability, audit action or dependency is added.
