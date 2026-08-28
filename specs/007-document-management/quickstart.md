# Quickstart — Validating Case Documents

**Feature**: `007-document-management` | **Date**: 2026-08-28
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) |
**Contract**: [contracts/document-api.md](./contracts/document-api.md)

A run-and-verify guide, not an implementation guide.

---

## Prerequisites

Identical to 006 — nothing new at the database layer. Docker running,
`backend/.env` already established, plus S3 access for the object-store module
(research.md D6) — a local S3-compatible endpoint (e.g. MinIO) or a real bucket in
`mx-central-1`, configured the same way `plan.md`'s Phase 2 (`/speckit-tasks`) will
specify.

```bash
cd backend
npm ci
npm run db:up && npm run db:migrate && npm run db:seed
```

The seed writes, per tenant: the document-category catalog (research.md D1 — same
seed shape as `006`'s catalogs), including "Unclassified," and — reusing `006`'s own
seeded cases and assignments — a small set of documents distributed so the scope
scenarios below have something to refuse. It prints the ids it creates
(`SEED_DOCUMENT_ON_ASSIGNED_CASE`, `SEED_DOCUMENT_ON_UNASSIGNED_CASE`) since Scenario 2
needs them by hand.

---

## Scenario 1 — Upload a document (US1, FR-001 to FR-005)

```bash
npx vitest run tests/contract/document-upload.test.ts
```

| Step | Expected |
|---|---|
| An `AA` assigned to a case uploads a file | `201`; the document carries the case reference, the uploading membership, and the upload time |
| `MP`/`SA` uploads to a case they hold no assignment on | `201` — Decision 2, inherited |
| An `AA` **not** assigned to the case attempts an upload | `404 not_found`, indistinguishable from an absent case (Section 0 of the contract) |
| A tenant at its storage limit attempts an upload | `403 limit_reached` (004's existing `LimitReached` class), naming the limit — distinguishable from the scope refusal above |
| An upload names no category | `201`; the document carries the tenant's "Unclassified" default |
| An upload names a category from another tenant's catalog | `422 catalog_entry_not_available` |
| A tenant of another firm reads or references this document | `404 not_found`, recorded per `001/FR-011` |
| A file outside the allowed MIME-type/extension list | `400 validation_failed` (Decision 3's retained floor — not malware scanning) |

### 1b — The storage race (research.md D3/D4, spec.md Edge Cases)

```bash
npx vitest run tests/integration/storage-limit-race.test.ts
```

| Step | Expected |
|---|---|
| Two uploads, each individually under the remaining headroom, submitted concurrently, whose **combined** size exceeds the limit | Exactly one succeeds, one is refused `403 limit_reached` (004's existing `LimitReached` class) — never both accepted |
| An upload that would exceed the limit fails partway through the S3 write | The reserved counter increment and the metadata row are both rolled back — a retry sees the same headroom as before the failed attempt, not a phantom reservation |

## Scenario 2 — Read, preview and download (US2, FR-005 to FR-008, FR-013 to FR-015)

```bash
npx vitest run tests/contract/document-read.test.ts
```

| Step | Expected |
|---|---|
| An assigned member reads a case's document list | Every document referencing that case, each with `categoryName` and `categoryStatus` |
| A member not assigned to that specific case reads its document list | `404 not_found` — a single named case's documents, not `006`'s tenant-wide empty-result shape (contract §2's own contrast) |
| A PDF is requested for preview | `previewUrl` returned; rendering needs no separate download step |
| An Office-format document is requested for preview | `previewUrl` returned after server-side conversion (research.md D5) |
| A file type with no supported preview is requested | `renderAs: "unsupported"`, `downloadAvailable` reflects the caller's own download right — never a blank or broken viewer |
| A document is downloaded, then previewed (or vice versa) | Two distinct audit entries — never one conflated action |
| `BM` attempts to read, preview or download any document | `403 not_authorized` — row 37/38 exclude `BM` (Principle VI) |

### 2b — Access is audited, the list is not (FR-020, FR-021, SC-009)

```bash
npx vitest run tests/contract/document-access-audited.test.ts
```

| Step | Expected |
|---|---|
| A document is previewed with `x-channel: interactive` | Exactly 1 `document.previewed` entry |
| The same preview with `x-channel: automated` | 0 entries — the gate |
| A document is downloaded with `x-channel: interactive` | Exactly 1 `document.downloaded` entry, distinct action from `document.previewed` |
| A case's document list is read, either channel | 0 entries, deliberately — mirrors `006`'s own resolved reasoning for `case.read_list` |

## Scenario 3 — Organize by category (US3, FR-009 to FR-012)

```bash
npx vitest run tests/contract/document-category.test.ts
npx vitest run tests/unit/document-category-collision.test.ts
```

| Step | Expected |
|---|---|
| `CM` assigns a category to a document on a case they can reach | `200`; the document reflects it |
| A category name absent from the tenant's own catalog is named | `422 catalog_entry_not_available` |
| The same name is added twice while the first is active | `409 catalog_entry_already_exists` |
| The same name is added again after the first is retired | `201` — retire-then-recreate, `017`'s D4/D6 pattern, reused via `006`'s own catalog mechanism |
| A category held by existing documents is retired | Those documents keep displaying it, marked retired; offered for no new assignment or upload |
| A freshly provisioned tenant's category catalog is read | Already seeded, including "Unclassified," immediately editable |
| An `AA` or `PL` attempts to change a document's category | `403 not_authorized` — row 39 is `MP`/`CM`/`SA` |

## Scenario 4 — Withdraw and restore (US4, FR-004, FR-015)

```bash
npx vitest run tests/contract/document-withdraw-restore.test.ts
```

| Step | Expected |
|---|---|
| `MP`/`SA` withdraws a document | `200`; absent from the case's active document list; never hard-deleted |
| The same document is restored | `200`; reappears in the active list |
| The withdraw-then-restore round trip is audited | 2 distinct entries, `document.withdrawn` then `document.restored` (SC-007) |
| A withdrawn document's size remains counted | `tenant.storage_bytes_used` unchanged by the withdrawal (research.md D3, FR-015) |
| An `AA`, `PL` or `CM` attempts to withdraw a document | `403 not_authorized` — row 40 is `MP`/`SA` only, narrower than organizing |
| A withdrawn document is withdrawn again | `409 already_withdrawn` |
| An active (never-withdrawn) document is restored | `409 not_withdrawn` |

## Scenario 5 — Tenant isolation of the object store itself (research.md D6, Principle II re-check)

**This is the scenario the slice's Constitution Check is conditional on.**

```bash
npx vitest run tests/integration/isolation/object-store/pre-signed-url-isolation.test.ts
```

| Step | Expected |
|---|---|
| A member of tenant A requests a preview/download URL for tenant B's document id | `404 not_found` before any URL is issued — the scope check runs first, and RLS makes the foreign row invisible to the lookup |
| A member of tenant A is handed a genuinely valid pre-signed URL for their own tenant's document | Resolves; the URL is single-object and expires |
| The same URL is replayed after `expiresAt` | Rejected by S3 itself, not by application logic — the URL is genuinely time-limited, not merely labelled so |
| Any code path outside `common/storage/object-store/` is inspected for AWS SDK imports or credentials | None found — the chokepoint is structural, not a convention someone could forget |
| An object key is constructed by hand from a guessed tenant/case/document id triple with no valid pre-signed signature | Rejected by S3 — a key alone, without a signed credential, resolves to nothing |

## Scenario 6 — Nothing that already worked stopped working

```bash
npm test
```

| Step | Expected |
|---|---|
| 001, 002, 004, 006 and 017's full suites | Green, unchanged (SC-012) |
| The exhaustive capability matrix suite | 0 pairs unasserted, now over **43** capabilities × 11 subjects |
| `capabilityDef`/`MATRIX` missing one of the 8 new rows | `npm run typecheck` fails, naming it (`004/FR-021`, unchanged mechanism) |
| A route declaring `assigned` scope without `@ScopeTarget` | Build fails — `006`'s own extension to `capability-declared-everywhere.test.ts` (research D2), inherited unchanged |
| `npx vitest run tests/integration/documents-grants-lockdown.test.ts` | 0 `DELETE` grants on `document`/`document_category`, for every role |
| `git diff --stat backend/drizzle/0006_grants.sql` | Empty — this slice's grants are new, never a change to an existing one |

---

## What to check by hand, once

**1. Storage usage is read live, never cached.** Confirm the check reads the counter
inside the same transaction as the reservation, not a value fetched earlier in the
request:

```bash
grep -n "storage_bytes_used" backend/src/modules/documents/documents.service.ts
```

**2. The object-store chokepoint holds.** Confirm no other module imports the AWS SDK:

```bash
grep -rn "@aws-sdk" backend/src/modules/ | grep -v "common/storage/object-store"
```

Expected: no matches. Any hit here is a Principle II gap this slice's own Constitution
Check assumed closed.

---

## Known-not-covered

Recorded so the gaps are visible rather than assumed absent:

- **Malware/virus scanning is not built** (`spec.md` Decision 3) — only a MIME-type/
  extension allowlist. A crafted file within an allowed type is not inspected for
  malicious content. Recognized technical debt, not silently inherited.
- **No content-based deduplication.** The same file uploaded twice is two distinct
  documents, two distinct audit trails (`spec.md` Edge Cases) — by design, not an
  oversight to fix later.
- **No version history.** Replacing a document's content is out of scope (`US08`,
  `US07`) — a new upload is a new document, unrelated to any prior one at the data
  layer.
- **Preview conversion for Office formats has a real, unsized infrastructure cost**
  (`plan.md` Open item 2) — `tasks.md` should size it before committing to it over a
  narrower "PDF and images only" MVP cut.
- **The exact per-tier storage byte ceiling is not set by this slice** (`spec.md`
  Assumptions) — this quickstart's Scenario 1 tests exercise the mechanism against
  whatever ceiling the test fixture's plan carries, not a real commercial number.
