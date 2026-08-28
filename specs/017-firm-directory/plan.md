# Implementation Plan: Firm Directory — Position & Configurable Catalogs

**Branch**: `017-firm-directory` | **Date**: 2026-08-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/017-firm-directory/spec.md`

---

## Summary

Two new tenant-scoped tables — `position` (the firm's own catalog) and
`directory_entry` (a one-to-one extension of `membership`, never a modification of it,
FR-014) — plus three new capability rows (22–24) added to 004's registry in the same
change, per FR-016. No new mechanism: authorization is 004's `decide()`, tenant
isolation is 001's RLS, audit is 001's append primitive. This slice is data and five
endpoints behind that machinery, the same shape 004 itself described for a domain slice
extending its registry.

## Technical Context

**Language/Version**: TypeScript, NestJS + Drizzle — unchanged, inherited from 001/002/004.

**Primary Dependencies**: None new. `common/http/pagination.ts` (001) is reused verbatim
for the directory read (FR-013) — it is already generic cursor pagination, not
audit-specific despite having shipped with the audit query.

**Storage**: PostgreSQL with RLS, unchanged. Two new tables, two new migration numbers
(`0020`, `0021`) — see Project Structure.

**Testing**: Vitest, Testcontainers/real Postgres for RLS-touching suites, the same
three-tier split (`tests/unit`, `tests/contract`, `tests/integration`) 001/002/004 use.

**Target Platform**: AWS ECS Fargate, unchanged. No new AWS access needed.

**Project Type**: Backend only — `backend/src/modules/directory/`. No UI (slice 014
consumes this slice's capabilities, per spec.md Out of Scope).

**Performance Goals**: SC-010 — first bounded page comparable to `001/SC-010`'s
audit-query bound. No other numeric target.

**Constraints**: FR-014 (no change to 002's `membership` table — a new table, not a new
column), FR-015 (no grant/RLS weakening), FR-016 (this slice's capability rows land in
004's own registry file, in the same PR, not a parallel mechanism).

**Scale/Scope**: 2 tables, 3 capability rows, 3 new audit actions, 5 endpoints
(create position, retire position, list catalog, assign a member's position, read the
directory).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

### Initial gate — before Phase 0

| # | Principle | Verdict | Basis |
|---|---|---|---|
| I | Spec-First Delivery (NON-NEGOTIABLE) | ✅ PASS | `US11`–`US13-EP10-CFG` are new catalog stories; spec.md's Approval Checklist already flags the catalog addition as blocking, actioned in this plan's Phase 1 output, matching 004's own Decision-5-style pattern. |
| II | Tenant Isolation (NON-NEGOTIABLE) | ✅ PASS | Both new tables carry `tenant_id` and RLS, the identical shape every prior slice's tenant-scoped table uses. Cross-tenant reads/writes fail closed via the same mechanism, not a check this slice writes. |
| III | Product Core vs. Tenant Customization | ✅ PASS | Position is *specified* to be tenant-configurable (spec.md, The Deliberate Asymmetry With 004) — this is the row the principle exists to permit, not a violation of it. Nothing about archetype is touched. |
| IV | Least Privilege by Default | ✅ PASS | Rows 22–24 extend 004's own matrix in the same file, deciding nothing outside `decide()`. Deny-by-default holds because an omitted archetype on any row is refused, exactly as 004 already tests exhaustively. |
| V | Auditability | ✅ PASS | Three new actions (`position.created`, `position.retired`, `directory.position_assigned`), each following 004/FR-009's actor/subject/previous/new pattern already established for `membership.archetype_changed`. |
| VI | Data Minimisation | ✅ PASS | A position name and a membership-to-position link; no end-client data, no case content. |

### Re-check — after Phase 1 design

| # | Principle | Verdict | What the design actually does |
|---|---|---|---|
| I | Spec-First Delivery | ✅ PASS | No design artefact introduces a requirement absent from spec.md. research.md D5/D6 record two scope calls (no rename endpoint, no minimum-catalog-size invariant) as decisions, not silent omissions. |
| II | Tenant Isolation | ✅ PASS | `data-model.md`'s RLS policies for both new tables mirror `membership`'s own shape exactly (0013's `..._own_tenant_select`/`..._own_tenant_update` pattern). A position id from another tenant is invisible under RLS before FR-010's business check ever runs — the same "grant does the work" posture 001/002 established. |
| III | Product Core vs. Tenant Customization | ✅ PASS | `position` carries no product-wide default logic — the seed (research.md D2) is inserted per tenant at provisioning time, immediately mutable, never read back as a shared constant the way 004's `matrix.ts` is. |
| IV | Least Privilege by Default | ✅ PASS | `capability.ts`/`matrix.ts` gain exactly 3 rows, each with a scope kind, each exercised by the same exhaustive-matrix test 004 already runs — SC-001 of 004 grows to cover 24 capabilities, not a second registry. |
| V | Auditability | ✅ PASS | Unchanged from the initial gate. |
| VI | Data Minimisation | ✅ PASS | Unchanged. |

**No deviation from the constitution.** No Complexity Tracking entries.

---

## Project Structure

### Documentation (this feature)

```text
specs/017-firm-directory/
├── spec.md              # rev. 2: Decisions 1-2 resolved 2026-08-26, 0 clarifications
├── plan.md               # this file
├── research.md            # Phase 0 — D1..D6
├── data-model.md           # Phase 1 — position, directory_entry, RLS, migrations
├── contracts/
│   └── directory-api.md    # Phase 1 — the five endpoints, request/response shapes
├── quickstart.md            # Phase 1 — validation scenarios
├── checklists/
│   └── requirements.md      # existing
└── tasks.md                 # /speckit-tasks — NOT created by /speckit-plan
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── common/authz/
│   │   ├── capability.ts               # MODIFIED: +3 rows (22-24), FR-016
│   │   └── matrix.ts                   # MODIFIED: +3 rows (22-24)
│   ├── common/audit/
│   │   └── actions.ts                  # MODIFIED: +3 actions
│   ├── common/db/
│   │   └── schema.ts                   # MODIFIED: +2 table definitions (position, directory_entry)
│   └── modules/directory/
│       ├── directory.module.ts
│       ├── position.repository.ts       # catalog CRUD (create, retire, list)
│       ├── position.service.ts          # FR-007-010: name collision, retirement, catalog validation
│       ├── position.controller.ts       # POST/PATCH/GET .../positions
│       ├── directory-entry.repository.ts # the membership x position join, paginated read
│       ├── directory-entry.service.ts    # FR-001-005: assign, independence from archetype
│       └── directory.controller.ts       # PATCH .../entries/:membershipId/position, GET /tenant/directory
├── drizzle/
│   ├── 0020_directory.sql              # position + directory_entry tables, RLS, grants
│   ├── 0021_directory_audit_actions.sql # extends audit_event_action_known (0017's pattern)
│   └── seed.ts                         # MODIFIED: seeds the default position catalog per tenant (FR-009)
└── tests/
    ├── unit/
    │   ├── position-name-collision.test.ts   # research.md D6
    │   └── directory-entry-independence.test.ts  # FR-005, SC-009
    ├── contract/
    │   ├── position-catalog.test.ts          # US2's five scenarios
    │   ├── assign-position.test.ts           # US1's six scenarios
    │   └── directory-read.test.ts            # US3's five scenarios
    └── integration/
        └── directory-grants-lockdown.test.ts  # extends 004's T061 pattern to the 2 new tables
```

**Structure Decision.** `backend/src/modules/directory/` sits beside `membership/`,
`invitation/` and `plan/` — the same per-domain module shape every prior slice uses.
`capability.ts`/`matrix.ts`/`actions.ts` are modified in place rather than duplicated,
per FR-016's own instruction and 004/contracts/refusal.md §6's contract for downstream
slices: "one row to `CAPABILITIES`... one row to `MATRIX`... `@Capability(...)` on every
route it adds" — exactly what this plan does, nothing more.

## Complexity Tracking

*No entries — the Constitution Check above found no violation requiring justification.*
