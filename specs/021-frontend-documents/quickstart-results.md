# Quickstart Results — Case Documents

**Feature**: `021-frontend-documents` | **Validated**: 2026-09-23 | by the implementer (Claude)

## Automated gates

| Gate | Result |
|---|---|
| Backend lint, typecheck, `npm test -- --coverage` | ✅ 183 files, 1,708 tests, thresholds met (after removing a local e2e leftover — see below) |
| `test:isolation` / `test:rls` / `verify:role` | ✅ 77 / 31 / 4 |
| Frontend `npm test` | ✅ 70 files, 603 tests |
| Frontend `typecheck`, `lint`, `build` | ✅ `/expedientes/[caseId]/documentos` built |
| Colour literals in new files | ✅ 0 |
| `tests/e2e/documentos.spec.ts` (desktop, live backend + MinIO) | ✅ 7/7 in 9.7 s |

## Scenarios

| Scenario | Result |
|---|---|
| Case panel → documents page | ✅ e2e |
| Upload a PDF with an accented name; listed under that name | ✅ e2e |
| PDF previews inline; MinIO serves `inline`, `application/pdf`, no `X-Frame-Options` | ✅ e2e |
| Download saves as "Contrato Señor Pérez ….pdf" | ✅ e2e (`download.suggestedFilename()`) |
| Change category; withdraw (confirmed); restore from "Retirados" | ✅ e2e |
| No signed URL in browser storage | ✅ e2e |
| Image preview, Office "no preview", client-side type/size refusals, server refusal copy | ✅ component tests only |
| Categories tab (create, duplicate refused, retire) | ✅ component tests only — **not run e2e** |
| Roles other than MP (AA, CM, BM controls) | ✅ component tests only — the demo identity is MP |
| Mobile viewport | ❌ **not run** |

## Defects found in `007` and fixed here

1. **Accented filenames were stored garbled** ("SeÃ±or"): multer decodes the multipart filename as
   latin1. Now decoded as UTF-8 (`upload-filename.ts`). Rows stored before the fix keep the garbled
   name; only demo data is affected.
2. **Both document lists answered MP/SA `200 {"items":[]}`** for a nonexistent or other-firm case
   (everyone else got `404`); an empty list read as "this matter has no documents". Now `404`.
3. **`categoryStatus` was dropped** from the list response although the contract documents it; a
   retired category could not be marked on screen.
4. Plus the four the spec found before building (withdrawn documents unreachable, Office "preview",
   UUID download names, no upload cap) and "Unclassified".

## Local-environment notes

- The `014` e2e had left a retired "Cargo e2e-…" position in seeded tenant A, which made `017`'s
  `position-catalog.test.ts` fail locally. Removed; `014/quickstart.md` now documents it.
- This spec's e2e leaves one restored document per run in the first case of firm Alfa.

## Not done

- The navigation item "Documentos" still reads "Pronto": a firm-wide documents view is out of scope
  (every document route is nested under its case).
- Uploader names (`US07`, IT3) — no person's name exists in the system.
