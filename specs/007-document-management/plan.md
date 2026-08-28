# Implementation Plan: Case Documents

**Branch**: `007-document-management` | **Date**: 2026-08-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-document-management/spec.md`

**Status**: Phase 0 and Phase 1 complete. `spec.md`'s three open clarifications are
now all closed (Decisions 1–3, the first two carried in from this plan's D1/D2, the
third — malware scanning, deferred out of MVP — resolved directly on `spec.md` after
this plan's initial draft). See Open items for what remains for the CC technical lead.

## Summary

Deliver upload, inline preview, download, category organization and withdraw/restore
for documents attached to a `Case`. Two things make this slice's engineering different
from every slice before it, and both are resolved or scoped below rather than
discovered during `/speckit-tasks`:

**This is the first slice whose primary data does not live in PostgreSQL.** Every
guarantee 001 through 006 built — Row-Level Security, `SET LOCAL`, the cross-tenant
leak test — governs rows in a database with row-level policies. A document's *content*
is an object in S3, which has no row-level security at all. Principle II names "file"
explicitly, alongside query, job, cache, queue and log — this slice is where that word
in the constitution stops being abstract. D6 below is how isolation is proven for a
storage layer that cannot enforce it the way Postgres does.

**This is the first slice to make a quantitative entitlement limit real against a
feature that actually consumes it.** `spec.md`'s FR-013 requires the check to run
against the size the completed upload would add, not the size already stored. D4 below
is the mechanism that makes that true even under concurrent uploads, which a naive
"check, then write" sequence does not guarantee.

`spec.md`'s Open Question 1 (flat category catalog vs. real folder hierarchy) and Open
Question 2 (equal download rights vs. narrower) are resolved as D1 and D2 below. Open
Question 3 (malware scanning) was a security policy decision with a real cost
attached, not an engineering unknown this plan could resolve on its own — it has since
been resolved directly on `spec.md` as Decision 3: deferred out of MVP scope, tracked
as recognized technical debt, with a MIME-type/extension allowlist remaining in scope
as ordinary validation regardless.

## Technical Context

Values marked **fixed by constitution** cannot be changed without a formal amendment.

**Language/Version**: TypeScript — **fixed**. Node.js LTS.

**Primary Dependencies**: NestJS (**fixed**) + Drizzle ORM (**fixed**) for the metadata
side. AWS SDK v3 S3 client for object storage. A PDF-rendering library on the frontend
for inline preview (unconstrained choice; `pdf.js` is the default assumption pending
Phase 1) and a server-side conversion path for Office formats — see D5.

**Storage**: PostgreSQL (document and category metadata, RLS as established by
001/002) + **S3** for binary content, both **fixed by constitution** and both
constrained to `mx-central-1` (Data Residency). No database table stores file bytes.

**Testing**: Strict TDD, mandatory. The isolation suite for this slice covers two
layers, not one — RLS on the metadata tables (as before) **and** a pre-signed-URL
issuance suite proving a tenant-A-authorized URL cannot be produced for a tenant-B
object (D6). A test suite that only covers the first layer would pass while leaving
Principle II's "file" clause unverified.

**Target Platform**: AWS ECS Fargate — **fixed**. No new platform surface; S3 is
already a verified service in-region.

**Project Type**: Web application. `frontend/` already exists — built by
`016a-frontend-shell` (Next.js App Router, TypeScript, TanStack Query for the
loading/error/empty state machine, Tailwind, no adopted component library; the three
feedback-state primitives are hand-built) — so this slice's frontend work (upload
control, document list, inline preview pane, category management) adopts `016a`'s
established conventions rather than inventing its own. Corrected from an earlier draft
of this plan, which assumed no `frontend/` yet existed; that was true when 016a was
still drafted but is no longer true now that it has shipped (`6318df4`).

**Performance Goals**: Preview of a supported file type begins rendering within a
threshold comparable to `001/SC-010`'s 3-second bar — set here as a working target
pending a real number in Phase 1, since no prior slice's performance goal transfers
directly to rendering a file rather than querying rows.

**Constraints**:
- File bytes never traverse the database. Metadata (case reference, uploader,
  category, size, storage key) does; content does not.
- A pre-signed URL is single-object, time-limited, and issued only after the
  application has already run the `assigned`-via-case scope check (D6) — it is never
  a substitute for that check, only a consequence of having passed it.
- No object is written to S3 before its metadata row's transaction has verified scope
  and reserved entitlement headroom (D4) — the reservation exists so a rejected upload
  never leaves an orphaned object behind.

**Scale/Scope**: Two owned tables (`document`, `document_category`), one column added
to the existing per-tenant storage accounting (D3), eight new capability rows (36–43),
no new audit action beyond what `006`'s vocabulary pattern already anticipates.

**Open at constitution level, not resolvable in this slice**:
- **Exact per-tier storage byte ceilings** — `spec.md` Assumptions names this a
  commercial decision; this plan only builds the mechanism that reads whatever number
  is configured.

**Resolved since the draft of this plan**: `spec.md`'s three `[NEEDS CLARIFICATION]`
items are now all closed (Decisions 1–3) — malware/virus scanning is deferred out of
MVP scope, tracked as recognized technical debt rather than left open. See Open items
below for what that decision does and does not cover.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

Evaluated against constitution **v1.4.1**.

### Initial gate — before Phase 0

| # | Principle | Verdict | Basis |
|---|---|---|---|
| I | Spec-First Delivery | ✅ PASS | `spec.md` precedes this plan. Two catalog amendments are named there (withdraw/restore; category catalog management) and must land before any PR opens — tracked in Open items, not silently assumed. |
| II | Tenant Isolation is Absolute | ⚠️ CONDITIONAL → ✅ PASS with D6 | The constitution names "file" as a covered surface. RLS alone does not reach S3. D6 supplies the equivalent guarantee for object storage: every object key is namespaced by tenant, every pre-signed URL issuance re-runs the scope check, and no code path constructs a bucket-wide credential reachable by a request handler. Passes conditional on D6 being implemented exactly as decided, not approximated. |
| III | Product Core vs. Tenant Customization | ✅ PASS | `DocumentCategory` is tenant-configurable data, not tenant-specific code. No client identifier anywhere. |
| IV | Least Privilege by Default | ✅ PASS | `spec.md`'s Capability Matrix (rows 36–43) is deny-by-default, extends `004`'s registry per `004/FR-021`, exactly as `006` and `017` did. |
| V | Auditable by Construction | ✅ PASS | `spec.md` FR-019–FR-021 name upload, category change, withdrawal, restoration, and interactive preview/download as audited, with the list read correctly excluded, mirroring `006`'s resolved reasoning. |
| VI | Compliance-by-Design | ✅ PASS | Content and metadata both remain in `mx-central-1`. No personal data is stored beyond what upload attribution requires (uploader membership, not uploader's personal details beyond what `002` already holds). |

**Gate result: PASSED, conditional on D6.** Principle II is the only principle this
slice could plausibly fail, because it is the first slice with data outside Postgres's
reach. D6 is written to be exactly as falsifiable as the RLS tests 001 established —
a test can attempt to obtain a tenant-B pre-signed URL from a tenant-A session and must
fail every time.

### Re-check — after Phase 1 design

| # | Principle | Verdict | What the design actually does |
|---|---|---|---|
| I | Spec-First Delivery | ✅ PASS | data-model.md and contracts/ introduce no field or endpoint absent from spec.md. The two catalog amendments spec.md names remain tracked in Open items, not silently dropped. |
| II | Tenant Isolation is Absolute | ✅ PASS | data-model.md's RLS policies for `document`/`document_category` mirror `006`'s own shape exactly. contracts/document-api.md's pre-signed URL issuance is specified to re-run the `assigned`-via-case check on every call, never cached, and object keys are namespaced `tenant/{tenantId}/...` so a key alone cannot be guessed into a cross-tenant read even if a URL leaked. quickstart.md Scenario 5 is the falsification test D6 requires. |
| III | Product Core vs. Tenant Customization | ✅ PASS | Unchanged from the initial gate. |
| IV | Least Privilege by Default | ✅ PASS | contracts/document-api.md declares `@Capability` on every route, all eight rows 36–43, none left undeclared. |
| V | Auditable by Construction | ✅ PASS | data-model.md's audit action list matches FR-019–FR-021 exactly: six mutation actions, two access actions (preview, download), zero for list reads. |
| VI | Compliance-by-Design | ✅ PASS | Unchanged from the initial gate. |

**No deviation from the constitution.** No Complexity Tracking entries.

## Phase 0 — Research

Full reasoning in [research.md](./research.md). Summary of what closes here:

- **D1 — `DocumentCategory` is a flat, tenant-wide catalog, not a per-case folder
  tree.** Closes `spec.md` Open Question 1. [Detail](./research.md#d1--flat-catalog-not-a-folder-tree).
- **D2 — Download rights equal read rights (row 38 = row 37).** Closes `spec.md`
  Open Question 2. [Detail](./research.md#d2--download-rights-equal-read-rights).
- **D3 — Storage is a transactionally-maintained running total, not computed by
  summing document sizes on every check.** [Detail](./research.md#d3--storage-total-is-a-maintained-counter).
- **D4 — Upload is reserve-then-commit, to close the race `spec.md`'s own Edge Cases
  section named.** [Detail](./research.md#d4--reserve-then-commit-closes-the-storage-race).
- **D5 — Inline preview: native rendering for PDF and images; a server-side
  conversion step for Office formats; anything else falls to the "no supported
  preview" state `spec.md` Story 2 scenario 4 already requires.** [Detail](./research.md#d5--preview-strategy-by-file-family).
- **D6 — Tenant isolation for S3-resident content**, the gate this Constitution Check
  is conditional on. [Detail](./research.md#d6--tenant-isolation-for-a-storage-layer-rls-cannot-reach).

**Malware/virus scanning** (`spec.md` Open Question 3) is resolved directly on
`spec.md` as Decision 3 — deferred out of MVP scope, tracked as recognized technical
debt. See Open items below for what this does and does not cover.

## Project Structure

### Documentation (this feature)

```text
specs/007-document-management/
├── spec.md              # Complete — three open clarifications, two closed here
├── plan.md               # This file
├── research.md            # Phase 0 — six decisions (D1–D6)
├── data-model.md           # Phase 1 — document, document_category, storage counter
├── contracts/
│   └── document-api.md     # Phase 1 — ten endpoints, request/response shapes
├── quickstart.md            # Phase 1 — validation scenarios
├── checklists/
│   └── requirements.md      # existing
└── tasks.md                 # /speckit-tasks — NOT created by /speckit-plan
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── common/
│   │   ├── authz/
│   │   │   └── matrix.ts          # +rows 36–43, extending 004/006/017's registry
│   │   └── storage/
│   │       └── object-store/      # S3 client wrapper; the ONLY module permitted to
│   │                               #   hold storage credentials (D6) — no other module
│   │                               #   imports the AWS SDK directly
│   ├── modules/
│   │   └── documents/
│   │       ├── documents.service.ts        # upload (reserve→commit, D4), read, download
│   │       ├── documents.repository.ts     # metadata rows only — no bytes
│   │       ├── categories/                 # DocumentCategory catalog, follows 006/017 pattern
│   │       └── scope/
│   │           └── document-case-scope.ts  # FR-005's lookup: document → case → 006's resolver
│   └── main.ts
├── drizzle/                        # +document, +document_category tables;
│                                    #   +storage counter column on the existing plan/tenant table (D3)
└── tests/
    ├── contract/documents/
    ├── integration/
    │   ├── isolation/documents/    # cross-tenant leak suite — merge gate
    │   └── isolation/object-store/ # pre-signed-URL cross-tenant suite — merge gate (D6)
    └── unit/documents/

frontend/                           # ALREADY EXISTS — built by 016a-frontend-shell
├── src/
│   ├── shell/                       # 016a's persistent nav/header — this slice renders inside it, doesn't touch it
│   ├── feedback/                    # 016a's loading/error/empty primitives — this slice REUSES these, builds none of its own
│   ├── authz/                       # 016a's item-visibility filter sourced from 004's matrix — extended with rows 36-43's gates, not a new mechanism
│   └── app/documents/                # this slice's own screens, following 016a's established App Router convention
│       ├── UploadControl/
│       ├── DocumentList/
│       ├── PreviewPane/            # D5's rendering strategy lives here
│       └── CategoryManager/
└── tests/                           # 016a's existing Playwright/Vitest setup — this slice adds specs, not tooling
```

**Structure Decision**: Web application, full stack — the first domain slice to ship
both backend and frontend code in the same plan. `common/storage/object-store/` is
deliberately the single chokepoint for S3 access, mirroring how `common/tenant/`
is the single chokepoint 001 established for RLS context — the same "one seam, not
one check per endpoint" shape Principle II already demands, applied to the layer RLS
cannot reach. `documents/scope/` is its own file rather than inline in the service so
FR-005's document-to-case lookup is a single, testable unit no future document
capability can bypass by writing its own scope check.

## Complexity Tracking

*No entries — the Constitution Check above found no violation requiring justification.
D6 is additional mechanism, not a deviation from a principle: it is what satisfies
Principle II for a data type 001's mechanism does not reach, not an exception to it.*

## Open items for the CC technical lead

None block `/speckit-tasks`. One blocks production exposure of upload.

1. **Malware/virus scanning — resolved 2026-08-28 (`spec.md` Decision 3): deferred
   out of MVP scope**, tracked as recognized technical debt. The allowed MIME-type
   and extension list (documents, images, common Office formats — no executables,
   scripts, or archive formats that can contain them) remains in scope as ordinary
   upload validation regardless — it costs nothing and closes the crudest attack
   class. Full content scanning (a scanning service in the upload path) is deferred
   to a future slice, if/when it enters scope.
2. **Preview conversion for Office formats (D5) has a real infrastructure cost**
   (a conversion service, however it's implemented) that this plan has not sized.
   Not blocking Phase 0, but should be sized before Phase 1 commits to it over a
   narrower "PDF and images only, everything else downloads" MVP cut.
3. **The storage-byte entitlement check (D3/D4) is genuinely new mechanism, not a
   reuse of an existing pattern.** `PlanLimits.storageBytes` and the
   `evaluateEntitlement()`/`decide()` `usage` seam already exist (004), but no
   capability in the registry today declares a `limit` key and
   `AuthorizationInterceptor` never populates `usage` when calling `decide()` — the
   mechanism was built and tested by 004 but never wired to a real consumer. This
   slice is that first wiring, not a copy of prior work. Sizing and testing it
   should account for that; there is no invitation-count-style precedent to lean on.
