# Implementation Plan: The Firm's Documents

**Branch**: `023-firm-documents` (on `022-demo-firm-seed`) | **Date**: 2026-09-25 | **Spec**: [spec.md](./spec.md)

## Summary

One new endpoint and one new page. `GET /tenant/documents` lists a firm's active documents with a
cursor, a total, a search term over file name and case file number, and optional category/matter
filters — with the `assigned` predicate and the count sharing one `WHERE` clause. `/documentos`
renders the mockup over it, reusing `021`'s preview, download, refusal copy and upload dialog
rather than reimplementing them.

One new capability (`document.read_list`, `tenant` scope, no `BM`). **No migration, no audit
action, no new table, no new dependency** (spec FR-017).

## Technical Context

| | |
|---|---|
| Backend | NestJS 11 + Drizzle 0.45 raw `sql` templates, PostgreSQL 16 under RLS |
| Frontend | Next.js 16 App Router, React Query 5, shadcn primitives + `020` tokens, `apiFetch` → `/api/lc` |
| Testing | Vitest (backend contract/integration, frontend unit/component), Playwright e2e |
| Data under test | `022`'s demo firm — 130 documents over 40 matters, with matters the `AA`s are deliberately not assigned to. That contrast is what makes SC-002 assertable at all |
| New dependencies | **None** — `no-new-dependency.test.ts` holds an exact manifest baseline |
| New migration | **None** — and deliberately: the audit vocabulary is a `CHECK` constraint re-issued whole per slice, so Decision 6's "not audited" is also the answer that needs no schema change |

## Constitution Check

| Principle | How this slice meets it |
|---|---|
| I — spec → plan → tasks, story IDs | This document; `US15-EP04-DOC-LinkDocumentsToCaseFile`, `US05-EP04-DOC-SearchDocumentsByKeyword` (promoted in this PR) |
| II — tenant isolation | RLS scopes rows to the tenant as always. The slice's own risk is narrower and quantitative: the **count** must carry the assignment predicate, or an `AA` learns how many documents exist on matters they cannot reach. One predicate builder, used by both queries, is the mechanism — not two call sites that must be remembered to agree |
| III — firm-agnostic | No firm-specific logic; categories and matters remain per-tenant rows |
| IV — deny by default | One capability added, at `tenant` scope with the rows narrowed in the query — the shape `case.read_list` already documents. `matrix-exhaustive.test.ts` fails loudly without its assertion, which is the intended guard; the frontend mirror and `capability-matrix-sync.test.ts` get the same row |
| V — audit | No audit action added. The list serves no document content, so it is not an access; `document.previewed` / `document.downloaded` remain one audited entry per explicit click (spec Decision 6) |
| VI — compliance | The client's legal name is **not** returned, though the join would make it free — minimisation. No new personal data reaches the browser |
| TDD | Every task below is test-first; the contract test for the endpoint is written and seen failing before the route exists |

## Backend

Everything lands in `007`'s existing module — no new module, no new registration in
`app.module.ts`.

1. **Capability** — `capability.ts`: `'document.read_list': { scope: 'tenant' }`, placed beside the
   other `document.*` rows with a note pointing at `case.read_list`'s "do not tidy this to
   `assigned`" comment, since the next reader will have the same instinct. `matrix.ts`:
   `new Set(['MP','AA','PL','CM','SA'])`. Then the assertion in `matrix-exhaustive.test.ts`'s
   independently-transcribed table — the build fails without it, by design.

2. **Repository** — `DocumentsRepository.listForTenant(input)`:

   ```text
   FROM document d
     JOIN document_category c ON c.id = d.category_id
     JOIN case_file cf        ON cf.id = d.case_id      # NEW: the firm-wide list needs the matter
   WHERE d.status = 'active'
     AND <scope>          # TRUE for MP/SA, else EXISTS(live case_assignment for this membership)
     AND <search>         # (d.original_filename ILIKE … OR cf.file_number ILIKE …)   escaped
     AND <categoryId?>    AND <caseId?>
   ORDER BY d.uploaded_at DESC, d.id DESC
   LIMIT limit + 1
   ```

   The predicate list is built **once** and handed to both the page query and
   `SELECT count(*)`, so FR-005/FR-007 hold structurally rather than by two call sites agreeing.
   Cursor is `(uploaded_at, id)`, matching `toPage`'s `Cursor` shape.

3. **Route** — `@Get()` on a new `FirmDocumentsController` at `@Controller('tenant/documents')`,
   `@Capability('document.read_list')`, **no** `@ScopeTarget` (the contract test
   `scope-target-declared.test.ts` refuses an inert one on a non-`assigned` route), **no**
   `@Audited`. Returns `{ items, nextCursor, total }`.

   *Why a separate controller rather than a second `@Controller` path on the existing class*:
   `DocumentsController`'s base path is `tenant/cases/:caseId/documents` and every route on it
   inherits `:caseId`. A firm-wide list cannot live there.

4. **Search escaping** — one small pure function, `escapeLike(term)`, escaping `\`, `%` and `_`,
   with the `ESCAPE '\'` clause spelled out in the SQL. Unit-tested on its own, because it is the
   kind of thing that looks right and is not.

5. **Presenter** — `presentFirmDocument(row)`: `021`'s fields plus `caseId` and `caseFileNumber`.
   Deliberately **not** the client's name (Principle VI).

## Frontend

```text
frontend/src/
├── app/documents/api.ts                   # + listFirmDocuments(query) and its types
├── documents/
│   └── view-mode.ts                       # NEW — localStorage grid/list, try/catch both ways
└── app/documentos/                        # NEW — the page (Spanish route, as 018/019 established)
    ├── page.tsx                           # server: resolve archetype, exactly as /clientes does
    ├── FirmDocuments.tsx                  # heading + count + filters + QueryBoundary + "Cargar más"
    ├── DocumentFilters.tsx                # search (300 ms debounce), category select, matter select
    ├── DocumentCard.tsx                   # grid cell: name, date, category, file number
    ├── DocumentRow.tsx                    # list row: the same fields, tabular
    ├── ViewModeToggle.tsx                 # grid ⇄ list
    └── UploadFromFirmDialog.tsx           # matter selector, then 021's UploadDialog
```

Reused unchanged, by import: `frontend/src/documents/format.ts` (`formatBytes`,
`categoryLabel`), `refusal-copy.ts`, `navigate.ts`, `app/expedientes/[caseId]/documentos/`'s
`PreviewPane`, `RefusalNotice` and `useDownload`. `@/configuracion/format`'s `formatDate` for
dates, as `021` does.

**The page composes as `019`'s register does**, because that is the established shape:
`<section aria-labelledby>` → heading row with the primary action → filters → `QueryBoundary` →
"Limpiar filtros" → "Cargar más". `useInfiniteQuery` with the filters in the `queryKey` so a
filter change resets the cursor, and explicit generics because a rejection has no inferable type
(`CaseRegister.tsx:126-132`'s note).

**Why `app/documentos/` (Spanish) while the API client stays in `app/documents/` (English)**: the
route convention is Spanish, set by `018`/`019` and by `navigation-items.ts`'s own `href`. The
English directory holds `021`'s API client and renaming it would touch every `021` import for no
behaviour change — recorded in the spec's Out of Scope as debt rather than smuggled in here.

## Risks

- **The count is the leak, not the rows.** Two queries, one predicate. If a later change adds a
  filter to one and not the other, an `AA` gets a number describing documents they cannot see.
  Mitigated structurally (one builder) and asserted by SC-003 against the demo firm.
- **`ILIKE` wildcards.** `%` and `_` in a search term are wildcards; `006` and `018` do not escape
  them today. FR-008 escapes them here, with its own unit test, and the existing defect is
  recorded rather than spread.
- **Route collision.** `tenant/documents` must not be captured by anything on
  `tenant/cases/:caseId/documents`. They are different base paths, so this is safe — but
  `routes.ts`'s contract test enumerates the real router and is the check.
- **`BM` and the nav flag.** Flipping `available: true` without narrowing `requiredArchetypes`
  would hand a billing manager a link to a page that refuses them. The two edits are one task, and
  `navigation-items.test.ts` asserts the archetype list.
- **MinIO unavailable here.** Preview and download cannot be exercised end to end on this machine
  (`quay.io` refuses the image). They are `021`'s, shipped and tested where a store exists; this
  slice asserts that it *calls* them with the right case id, not that MinIO answers.
- **`e2e` needs a signed-in browser.** `022` makes that possible for the first time. Where an e2e
  spec cannot run here, it is recorded in `quickstart-results.md` rather than written to pass
  vacuously.
