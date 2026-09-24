# Implementation Plan: Case Documents

**Branch**: `021-frontend-documents` | **Date**: 2026-09-23 | **Spec**: [spec.md](./spec.md)

## Summary

Build `007`'s never-built Phase 7 (T044–T047) as its own frontend slice, and close the four gaps
between `007`'s contract and its code that the spec's decisions resolve: a withdrawn-documents
route (D2), `Content-Disposition` on signed URLs plus a 25 MB upload cap (D4), and the
`Unclassified` → `Sin clasificar` rename (D5). D3 is a contract amendment only.

## Technical Context

| | |
|---|---|
| Backend | NestJS 11, Drizzle 0.45, PostgreSQL 16 with RLS, `@aws-sdk/client-s3` + presigner, multer via `@nestjs/platform-express` |
| Frontend | Next.js 16 App Router, React Query, shadcn + `020` tokens, `apiFetch` → `/api/lc` proxy |
| Testing | Vitest (backend contract/integration with Testcontainers-free local DB; frontend unit/component), Playwright e2e |
| Storage | MinIO (`quay.io/minio/minio`) in dev and CI at `http://localhost:9000` |
| New dependencies | **None** (`no-new-dependency.test.ts` must stay green) |

## Constitution Check

| Principle | How this slice meets it |
|---|---|
| I — spec → plan → tasks, story IDs | This document; stories `US01/02/03/09/17-EP04-DOC`, `US17-EP10-CFG` |
| II — tenant isolation | No new table or policy. The withdrawn route reads `document` under the existing RLS; the rename migration updates each tenant's own row by `tenant_id` |
| III — firm-agnostic defaults | "Sin clasificar" stays a seeded default each firm may rename or retire |
| IV — deny by default, one matrix | The withdrawn route declares `document.restore`; no capability is added. Frontend mirror rows 36–43 transcribed from `007/spec.md` and checked by `capability-matrix-sync.test.ts` |
| V — audit | No audit action added. Preview and download stay one channel-gated entry per explicit click (FR-008, FR-010) — never pre-fetched |
| VI — PII | No new personal data is displayed. Signed URLs stay out of browser storage (FR-011) |
| TDD | Every task below: test first, seen failing |

## Backend changes (all in `007`'s module)

1. **Withdrawn list (D2)** — `GET /tenant/cases/:caseId/documents/withdrawn`,
   `@Capability('document.restore')`, `@ScopeTarget('caseId')`, unaudited like the active list.
   Repository `listWithdrawnByCase`. Contract §2a.
2. **Signed URL disposition (D4)** — `ObjectStore.presignGet(key, { disposition })`;
   download signs `ResponseContentDisposition: attachment; filename="<ascii>"; filename*=UTF-8''<pct>`,
   preview signs `inline`. The chokepoint test (`object-store-chokepoint.test.ts`) stays green.
3. **Upload cap (D4)** — `FileInterceptor('file', { limits: { fileSize } })` with
   `DOCUMENT_MAX_UPLOAD_BYTES` (default 26 214 400). A route-scoped filter maps Nest's
   `PayloadTooLargeException` to a new `FileTooLarge` (413, `file_too_large`) in the product's own
   `{ error: { code, message } }` shape. Contract §1 amended.
4. **Rename (D5)** — migration `0045_document_category_sin_clasificar.sql`: per tenant, rename
   the active `Unclassified` to `Sin clasificar` unless that tenant already has an active
   `Sin clasificar`. The seed writes `Sin clasificar`; `findDefaultCategory` matches either name,
   Spanish first. Contract FR-010 note amended.
5. **Contract (D3)** — §3 and research D5: `converted-pdf` returns the original file; no
   conversion exists.

## Frontend structure

```text
frontend/src/
├── app/documents/api.ts                      # existing wrappers; + listWithdrawnDocuments
├── documents/                                # NEW domain helpers
│   ├── format.ts                             # sizes (KB/MB), category display ("Sin clasificar")
│   ├── upload-rules.ts                       # allowed MIME list + extensions + 25 MB, mirrors 007
│   └── refusal-copy.ts                       # code → Spanish (file_too_large, validation_failed, 422, 409)
├── app/expedientes/[caseId]/documentos/
│   ├── page.tsx                              # server: resolve archetype (as /clientes)
│   ├── DocumentsView.tsx                     # case header + list + preview pane
│   ├── DocumentList.tsx                      # T045
│   ├── UploadDialog.tsx                      # T044
│   ├── PreviewPane.tsx                       # T046
│   ├── ChangeCategoryDialog.tsx              # T047 (per document)
│   └── WithdrawnList.tsx                     # D2, MP/SA
├── app/expedientes/CaseDetailPanel.tsx       # + "Documentos" link (FR-001)
└── app/configuracion/components/
    └── DocumentCategoriesTab.tsx             # D6, reuses 014's catalog pattern
```

Preview: an `<iframe title="Vista previa de {filename}">` for `pdf`, `<img alt={filename}>` for
`image`. The iframe's `src` is the signed MinIO/S3 URL. The frontend has no CSP today, so nothing
is relaxed; if one is added later it must allow the configured object-store origin in `frame-src`
and `img-src`.

## Risks

- **MinIO framing**: MinIO sends no `X-Frame-Options` by default; verified in e2e, not assumed.
- **Rename collision**: a firm that already created "Sin clasificar" keeps both rows; the default
  lookup prefers the Spanish one. Covered by a migration test with both states.
- **Coverage**: `src/common/**` blocking thresholds are unaffected except `common/http/errors.ts`
  (new class) — covered by the upload-cap contract test.
