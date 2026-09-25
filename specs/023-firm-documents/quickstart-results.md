# Quickstart results — `023-firm-documents`

**Run**: 2026-09-25, same machine as `022` (Windows 11, Node 22.13.1, PostgreSQL 16 in Docker on
port 5455, MinIO **unavailable**, backend on 3001, frontend on 3000).

What was verified, and what was not. Nothing here is claimed from a sibling suite or a reading.

---

## Verified in a real browser, against a real database

This is the first slice in the repository whose e2e suite could actually run, because `022`
produces a person who can sign in. **All five e2e tests pass** (`tests/e2e/firm-documents.spec.ts`,
desktop project, Playwright, against the running stack and `022`'s demo firm):

| Test | What it proves |
|---|---|
| the navigation offers Documentos, and it leads somewhere | FR-014 — the entry is a link, not the inert "Pronto" text it has been since `016a` |
| it lists the firm's documents with a count and a matter per card | FR-002, FR-009 — cards carry `EXP-…`, which is what makes a firm-wide list usable |
| searching narrows both the list and the count | FR-005 — the **server** filtered; a browser-side filter would leave the count alone |
| the grid/list toggle changes the layout and is remembered | FR-011 — and it survives a reload, per viewer |
| a filter that matches nothing offers a way out | The empty state plus "Limpiar filtros" |

A screenshot of the result is at `frontend/test-results/documentos.png`: 128 documents, the
search box and two filters, the count, the grid/list toggle, and cards showing name, date,
category, matter number and size — in `020`'s type scale and palette, inside `016a`'s shell.

## Verified against the demo firm through the API

Signed in as each archetype and called `GET /tenant/documents` (`022`'s firm, 130 documents, 2 of
them withdrawn):

| Caller | Query | Result |
|---|---|---|
| `MP` Alejandro Méndez | none | `total=128` — the 130 seeded rows minus the 2 withdrawn |
| `MP` | `q=dictamen` | `total=6` |
| `MP` | `q=EXP-2026` | `total=79` — the search reaches the **matter's** file number |
| `MP` | `q=%` | `total=0` — **the escaping works.** Unescaped, `%` is "match everything" and this would have returned 128 |
| `AA` Jorge González | none | `total=48`, strictly fewer than the `MP`'s 128 (SC-002) |
| `BM` Sergio Pantoja | none | **403** (SC-004) |
| every call | — | `clientNameLeaked=false`: the client's legal name appears nowhere in the response (FR-002, Principle VI) |

## Suites

| Gate | Result |
|---|---|
| backend `npm run typecheck` | **clean** |
| backend `npm run lint` | **clean** |
| backend `tests/contract/firm-documents-list.test.ts` | **17 passed** |
| backend `tests/contract/firm-documents-filters.test.ts` | **27 passed** |
| backend `tests/contract/firm-documents-route.test.ts` | **9 passed** |
| backend `tests/unit/like-escape.test.ts` | **7 passed** |
| backend `tests/unit` (whole) | **985 passed / 51 files** |
| backend `capability-declared-everywhere`, `scope-target-declared` | **9 passed** — the two build gates that police a new route |
| frontend `tsc --noEmit` | **clean** |
| frontend `npm run lint` | **clean** (it caught two `react-hooks/set-state-in-effect` errors; both were fixed rather than suppressed — see below) |
| frontend `npm test` | **678 passed / 79 files** (up from 639: 39 new) |
| frontend `npm run build` | **clean**, `/documentos` in the route manifest |
| frontend e2e `firm-documents.spec.ts` | **5 passed** |

### Three defects this slice's own gates found in its own work

Recorded because each was a real fault, not a test that needed relaxing:

1. **A confident wrong answer while loading.** The page rendered "0 documentos" before the query
   returned. The e2e spec read that zero and compared it against a filtered count; the fix was to
   render no count until the server has given one, which is also the honest behaviour.
2. **Two `setState`-in-effect violations.** The view-mode preference synced through an effect, and
   the upload dialog cleared its state on close. Fixed properly: the preference now goes through
   `useSyncExternalStore` with a server snapshot — which also removes a hydration mismatch —
   and the dialog is unmounted by its parent instead of reset.
3. **The mirror row that silently did not land.** `document.read_list` was added to
   `capability-matrix-sync.test.ts`'s fixture but the edit to `capability-matrix.ts` did not
   apply. The sync test **passed anyway**, because it checks mirror→fixture and cannot see a
   missing row; the navigation test caught it instead (`can()` returned false while the nav
   showed the item). Worth knowing: that sync test does not prove the mirror is complete.

### A fourth, in an adjacent screen

Adding a capability made `/configuracion`'s permissions matrix render an unlabelled row —
`matrix-view-model.test.ts` failed with `expected 'document.read_list' not to be
'document.read_list'`, i.e. the Spanish label had fallen back to the capability id. A label was
added. Any future slice adding a capability owes that screen one too.

---

## Not verified, and why

### `npm test` (full backend suite) — it DID run; it is red, for the same 11 files as before

*(Listed in this section because the gate is red, not because it was skipped.)*

**2029 passed, 26 failed, 13 skipped, across 205 files (11 failed).**

The failing eleven are byte-for-byte the set `022` established as MinIO-dependent:

```
tests/contract/document-access-audited.test.ts        tests/contract/documents-upload-cap.test.ts
tests/contract/document-category.test.ts              tests/contract/documents-withdrawn-list.test.ts
tests/contract/document-read.test.ts                  tests/integration/document-category-rename.test.ts
tests/contract/document-upload.test.ts                tests/integration/isolation/object-store/pre-signed-url-isolation.test.ts
tests/contract/document-withdraw-restore.test.ts      tests/integration/storage-limit-race.test.ts
tests/contract/documents-download-disposition.test.ts
```

Same files, same 26 failures, and passing tests rose from 1954 to **2029** — the +75 this slice
adds. It introduces no new failure and fixes none of the existing ones, which are environmental:
the MinIO image cannot be pulled here at all.

**MinIO remains unavailable**: `quay.io` answers `401` for the pinned `minio/minio` and
`minio/mc` images. The firm-wide list never touches the object store, which is precisely why its
contract tests insert `document` rows directly and pass here; preview and download are `021`'s
and are exercised where a store exists.

### `npm test -- --coverage`

Not run to completion. Reasoning, which is not measurement: the blocking thresholds are 100% on
`src/common/tenant/**`, `src/common/audit/**`, `src/common/authz/**` and
`assigned-scope.resolver.ts`. This slice adds **one line** under any of them — the
`document.read_list` row in `capability.ts` and `matrix.ts`, both data rather than branches, and
both exercised by `matrix-exhaustive.test.ts` across all eleven subjects. Its new code lives in
`src/modules/documents/`, which carries no threshold.

### The mobile viewport

The e2e spec skips the `mobile` project deliberately (`desktop only — this is a
layout-independent read`). The grid collapses by Tailwind breakpoints and was not checked at
phone width.

### `PL` and `CM` against the demo firm

Their **contract** behaviour is asserted with purpose-built fixtures (empty list, not a refusal —
`firm-documents-list.test.ts`). The demo-firm check could not be completed for `PL`: the fifth
sign-in from this origin inside fifteen minutes was refused by `003`'s origin throttle. That was
confirmed rather than assumed — her `identity_credential` exists, `failed_attempt_count` is 0 and
`locked_until` is null, and `sign-in.service.ts:95` throttles by origin at five per fifteen
minutes. The product behaved correctly; the verification script was the abusive-looking source.

### The Companion GUI hooks

`python3` is not installed, so the mandatory `after_*` hooks skipped per their own contract:
`[companion] Warning: python3 not detected; skipped .spec-context.json capture`.

---

## Approval state

The spec's eight decisions are **taken and unratified**; their Approval Checklist boxes stay
unticked until Jero signs. Everything built here follows the recommended option of each.
