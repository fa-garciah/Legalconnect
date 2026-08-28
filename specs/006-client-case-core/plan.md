# Implementation Plan: Clients, Cases & Case Teams

**Branch**: `006-client-case-core` | **Date**: 2026-08-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-client-case-core/spec.md`

---

## Summary

Two entities the whole domain hangs from — `client` and the case table — plus
`case_assignment`, the entity the prototype could not express at all (a single free-text
attorney name on the case). Three tenant-scoped catalogs (`case_status`, `matter_type`,
`venue`) land here per Decision 1, since 017 shipped only the position catalog.

Authorization is entirely 004's `decide()`. This slice's only new mechanism is the
`assigned` resolver 004 shipped a port for and nobody has implemented yet.

**Decisions taken before this plan** (spec.md) — all four, not three:

1. `case_status`, `matter_type` and `venue` are owned by this slice, not 017.
2. `MP` and `SA` **satisfy** the `assigned` resolver unconditionally (not "bypass" it —
   the distinction is the whole point of Decision 2's mechanism argument). Every other
   internal archetype is genuinely restricted to their own assignments.
3. A case may transiently hold zero assignments; it stays readable by `MP`/`SA` only.
4. An `assigned`-scope refusal is a **404**, byte-identical to a nonexistent case — and
   taking it obliges amending `004/FR-017` and `004`'s US5 scenario 3 in the same PR.

**Q1, resolved 2026-08-27**: `PL` holds client create and update (matrix rows 26–27),
not deactivate (row 28).

**Clarification session, 2026-08-27** — five answers, folded into the design below:
client search ships here (FR-002a); membership revocation closes case assignments
(FR-012a); a case's closing date is derived from a firm-settable `is_closing` flag on its
own case-status catalog (FR-008a); concurrent edits are last-write-wins as a named
trade-off; and a withdrawn client can be restored under the capability that withdrew it
(FR-004a).

### What Phase 0 found that changes this plan's shape

Four claims in the plan draft did not survive contact with the code. Each is corrected
below and carried in [research.md](./research.md):

| Draft claim | What is actually true |
|---|---|
| `scope.ts` is MODIFIED to register the resolver | **It is not touched.** `registerScopeResolver()` is exported precisely so a downstream module registers from its own `onModuleInit`. Its own header says "no file here is edited to do it." |
| `refusal.ts` / 016a need work for the 404 | **Neither needs any change.** `refusalToHttp` already maps `scope`+`assigned` → `ResourceNotFound`, behind a constant written for this slice. `classifyRefusal` already maps `not_found` → opaque. Decision 4 costs zero code. |
| 016a's classifier "carries a `scope`-bucket type with nothing to exercise it" | **There is no `scope` bucket.** `RefusalBucket` is `'opaque' \| 'role' \| 'entitlement-feature' \| 'entitlement-limit'`. 016a's research D3 explicitly left it unbuilt. Nothing to exercise, nothing to change. |
| 004's files are otherwise untouched | **`AuthorizationInterceptor` must change.** It hard-codes `targetId: null` — there is no path by which a case id reaches a resolver today. This is the one real 004 edit, and it needs a narrow spec amendment. See Open Item 1. |

The net: **the 404 story is already built and the frontend is already correct**; the
actual engineering is the resolver, the `targetId` seam that feeds it, and the six tables.

---

## Technical Context

**Language/Version**: TypeScript 5.7, Node ≥22. NestJS 11 + Drizzle 0.44 — unchanged,
inherited from 001/002/004/017.

**Primary Dependencies**: None new. `common/http/pagination.ts` (001) backs the case-list
read, the same way 017's directory read already reuses it. `common/authz/scope.ts`'s
`ScopeResolverPort` gains its first real implementation through its existing exported
registration function — not a new interface, and not an edit to that file.

**Storage**: PostgreSQL 16 with RLS, unchanged. **Six** new tables: `client`, the case
table (see research D4 on its name), `case_assignment`, `case_status`, `matter_type`,
`venue`. Three migrations.

**Testing**: Vitest + Testcontainers against real PostgreSQL, the same three-tier split
(`tests/unit`, `tests/contract`, `tests/integration`) every prior slice uses. Strict TDD
per the constitution — `tasks.md` orders every test before its implementation.

The `assigned` resolver additionally needs a **concurrency** suite: it is the first
resolver in this codebase that *queries* rather than comparing a column already in
memory, so "unassign commits while a request is in flight" is a real interleaving and
FR-011's immediacy claim is only meaningful if it is tested under it.

**Target Platform**: AWS ECS Fargate, unchanged. No new AWS access, no new secret.

**Project Type**: Backend only. `frontend/` is **not touched** — see the table above; the
refusal classifier already handles this slice's only new wire behaviour, and no screen
ships here (016a's navigation registry stays as it is until a UI slice consumes these
capabilities).

**Performance Goals**: The `assigned` resolver adds one indexed query per
`assigned`-scoped request, which `tenant`/`self`/`none` do not need. `004/plan.md` flagged
this cost and assigned it here. Target: a partial index on
`(case_id, membership_id) WHERE unassigned_at IS NULL`, single-digit milliseconds at
one firm's caseload. The list read's assignment filter is a join, not an N+1 — one query
per page, unchanged from 017's directory read.

**Constraints**:

- Every constraint of 001/002/004/017 applies unchanged.
- **FR-013**: the resolver is supplied through 004's existing port. No second scope
  mechanism, no second `decide()`, no controller-level bypass.
- **FR-014**: the case-list read declares `tenant` and filters its rows. It must not
  declare `assigned` — that would refuse the unassigned caller the spec requires to see
  an empty list.
- **FR-016/FR-017**: an `assigned` refusal is byte-identical to a nonexistent case. The
  existing 404 mapping delivers this; nothing may introduce a distinguishing field.
- **FR-018**: `uuid` ids, matching 001's shape, so opacity cannot be defeated by
  sequential-id guessing.
- **FR-023**: a single-case read is audited, channel-gated to interactive.
- **FR-008a**: `closed_on` is derived from the firm's own `is_closing` flag and is never
  accepted as request input — one place it moves, in both directions.
- **FR-012a**: revoking a membership closes its live case assignments **in the same
  transaction**, so the two cannot come apart.

**Scale/Scope**: 6 tables, **11** new capability rows (25–35, continuing 017's 22–24),
**12** new audit actions (11 mutations + the channel-gated `case.read`), 3 tenant-scoped
catalogs following 017's seeded-and-editable pattern, and the first live `assigned`
resolver. The clarification session added two routes (client restore, `is_closing` update)
and two audit actions without adding a capability row — both reuse rows 28 and 35.

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

### Initial gate — before Phase 0

| # | Principle | Verdict | Basis |
|---|---|---|---|
| I | Spec-First Delivery (NON-NEGOTIABLE) | ⚠️ **CONDITIONAL** | The spec's Catalog Amendments table lists four amendments to `master-user-story-catalog.md` that do not exist yet — a case-team assignment story, two fixes to `US08-EP02-CSM-ViewAssignedAttorney`, and catalog-management stories under EP10-CFG. **That amendment must merge before any PR against this slice**, the same posture 004, 016a and 017 each took at this gate. |
| II | Tenant Isolation (NON-NEGOTIABLE) | ✅ PASS | All six tables carry `tenant_id` with RLS in 001's exact shape, and no DELETE grant. The `assigned` resolver runs on the request's own tenant transaction, so RLS narrows to the caller's tenant before `membership_id` is ever compared. |
| III | Product Core vs. Tenant Customization | ✅ PASS | The three catalogs are per-tenant rows seeded at provisioning, following 017's precedent exactly. `role_on_case`'s three values are product core, not tenant-configurable — spec Assumptions say so, and nothing in the matrix distinguishes them. |
| IV | Least Privilege by Default | ✅ PASS | 11 rows extend 004's registry in place per `004/FR-021`. The exhaustive matrix suite grows to 35 × 11 automatically; no separate check is written. `PL` holds rows 26–27 and not 28 (Q1). |
| V | Auditability | ✅ PASS | Every mutation is audited (FR-022), and — unusually, but as Principle V's text actually requires — so is the single-case **read** (FR-023), channel-gated the way 001 gates its own log reads. |
| VI | Data Minimisation | ✅ PASS | `BM` holds client rows and no case row. Enforced in the matrix itself, not by a post-hoc filter. |

**Testing discipline**: strict TDD, no exemption claimed. The three migrations fall under
exemption 1 (declarative migrations), which is the only exemption this slice uses.

### Re-check — after Phase 1 design

| # | Principle | Verdict | What the design actually delivers |
|---|---|---|---|
| I | Spec-First | ⚠️ **CONDITIONAL, unchanged** | Still gated on the catalog amendment. Phase 1 added no requirement absent from the spec. One spec amendment is *requested* by this plan rather than assumed — see Open Item 1 — which is Principle I working as intended, not a violation of it. |
| II | Tenant Isolation | ✅ **PASS — the row to watch, watched** | The resolver's query runs on `currentTx()`, the transaction `TenantContextInterceptor` already opened with `app.tenant_id` set. It therefore cannot see another tenant's `case_assignment` row even if handed that tenant's case id: RLS returns zero rows, the resolver answers `false`, and the refusal is the same 404 a nonexistent case gets. Cross-tenant existence stays uninferable from the response. `data-model.md` records the query and `assigned-scope-isolation.test.ts` asserts it. |
| III | Product Core | ✅ PASS | Confirmed by design: catalogs are rows, `role_on_case` is an enum in the product. |
| IV | Least Privilege | ✅ PASS | Confirmed: 11 registry rows, one scope kind each, exhaustive suite covers them. |
| V | Auditability | ✅ PASS | Confirmed: 10 actions in `contracts/`, each with actor/subject/previous/new where a value changed. |
| VI | Data Minimisation | ✅ PASS | Confirmed. |

**One design consequence worth naming under II.** The resolver deliberately does **not**
check whether the case exists before checking assignment. Both "no such case" and "not
your case" produce zero rows and the same `false`. Distinguishing them internally would
create a code path whose timing differs, which is the side channel FR-016 exists to
close.

---

## Project Structure

### Documentation (this feature)

```text
specs/006-client-case-core/
├── spec.md
├── plan.md                    # This file
├── research.md                # Phase 0 — D1..D10
├── data-model.md              # Phase 1 — six tables, RLS, grants, the resolver's query
├── contracts/
│   ├── client-api.md          # client CRUD
│   ├── case-api.md            # case create/read/list/status, team assign/unassign
│   └── catalog-api.md         # the three catalogs, 017's position surface reshaped
├── quickstart.md              # Phase 1 — run-and-verify
├── checklists/requirements.md
└── tasks.md                   # /speckit-tasks — NOT created by /speckit-plan
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── common/authz/
│   │   ├── capability.ts        # MODIFIED: +11 rows (25-35)
│   │   ├── matrix.ts            # MODIFIED: +11 rows
│   │   ├── declare.ts           # MODIFIED: + @ScopeTarget() — names the route param
│   │   │                        #   carrying the scoped entity's id (research D2)
│   │   ├── interceptor.ts       # MODIFIED: populates ScopeRequest.targetId from
│   │   │                        #   @ScopeTarget instead of hard-coding null.
│   │   │                        #   THE one 004 edit — see Open Item 1
│   │   ├── scope.ts             # UNTOUCHED — registration is via its exported seam
│   │   └── refusal.ts           # UNTOUCHED — the assigned→404 mapping already exists
│   ├── common/audit/
│   │   └── actions.ts           # MODIFIED: +10 actions, 1 channel-gated (case.read)
│   ├── common/db/
│   │   └── schema.ts            # MODIFIED: +6 tables, +4 enums
│   └── modules/case-core/
│       ├── case-core.module.ts          # registers the resolver in onModuleInit
│       ├── close-assignments.ts         # FR-012a — exported for 002's revoke() to call
│       ├── assigned-scope.resolver.ts   # FR-013 — the ScopeResolverPort implementation
│       ├── client.{repository,service,controller}.ts
│       ├── case.{repository,service,controller}.ts
│       ├── case-assignment.{repository,service,controller}.ts
│       └── catalogs/
│           ├── case-catalog.seed.ts     # mirrors directory/position-catalog.seed.ts
│           └── case-catalog.{repository,service,controller}.ts
├── src/modules/tenant/
│   └── provision.service.ts     # MODIFIED: seeds the three catalogs on the same
│                                #   transaction it already seeds position on
├── src/modules/membership/
│   └── membership.service.ts    # MODIFIED (002): revoke() closes the membership's live
│                                #   case assignments on its own transaction (FR-012a).
│                                #   Same dependency direction 017 set with ProvisionService
├── drizzle/
│   ├── 0023_case_core.sql             # client, case_file, case_assignment + RLS + grants
│   ├── 0024_case_core_catalogs.sql    # case_status, matter_type, venue + RLS + grants
│   │                                  #   + lc_platform INSERT for provisioning
│   ├── 0025_case_core_audit_actions.sql  # extends audit_event_action_known (0017/0021)
│   └── seed.ts                        # MODIFIED: dev/CI catalog + case fixtures
└── tests/
    ├── unit/
    │   ├── assigned-resolver-pure.test.ts       # MP/SA short-circuit, no DB
    │   ├── file-number-normalisation.test.ts
    │   └── catalog-name-collision.test.ts       # mirrors 017's position-name-collision
    ├── contract/
    │   ├── client-crud.test.ts                  # incl. Q1: PL creates/updates, not deactivates
    │   ├── case-crud.test.ts
    │   ├── case-list-scoping.test.ts            # FR-014 — empty list, never a refusal
    │   ├── case-assignment.test.ts
    │   ├── case-catalog.test.ts
    │   └── case-read-audited.test.ts            # FR-023 — interactive 1, automated 0
    └── integration/
        ├── assigned-scope-resolver.test.ts      # correctness + FR-011 concurrency
        ├── assigned-scope-opacity.test.ts       # FR-016 — byte-identical to nonexistent
        ├── assigned-scope-isolation.test.ts     # Principle II re-check, above
        └── case-core-grants-lockdown.test.ts    # extends 004/017's grant audit to 6 tables
```

**Structure Decision.** `backend/src/modules/case-core/` sits beside `directory/`,
`membership/`, `invitation/` and `plan/` — the per-domain module shape every prior slice
uses.

The three catalogs live in a `catalogs/` subfolder behind **one** repository/service/
controller triple rather than three, because they are structurally identical (name +
active/retired status + tenant) and the spec gives them **one** capability each for read
and manage (rows 34–35), not three. Three near-identical triples would be three places
for the retire-while-referenced rule to drift. 017's `position.*` is the shape being
followed; the difference is that 017 had one catalog and this has three of the same kind.

---

## Complexity Tracking

| Deviation | Why Needed | Alternative Rejected Because |
|---|---|---|
| Three catalogs land here rather than in 017 | Decision 1 — 017 shipped only `position`; the other three were never anyone's table. Waiting on a 017 amendment blocks the root slice of the whole domain. | Reopening 017 — real coordination cost for a conceptual-boundary argument the actual build already diverged from once. |
| The `assigned` resolver is the first `ScopeResolverPort` implementation to put a query on the authorization path | FR-013 requires it. 004 shipped the port empty by design and named this slice as the one that fills it. | None — this is the deferred cost 004 explicitly assigned here, not a new decision. |
| `AuthorizationInterceptor` (a 004 file) gains `targetId` population | Without it no case id reaches any resolver, and `assigned` scope cannot function at all. The field exists on `ScopeRequest` and is hard-coded `null`. | Reading route params inside the resolver — it has no request handle and is a singleton. Checking scope in the controller — that is the second mechanism FR-013 forbids. |
| `MembershipService.revoke()` (a 002 file) calls into this slice | FR-012a — revocation and assignment closure must share one transaction, or a revoked member lingers on a case team until something notices. | A background job or an event listener: both make the two states divergent for a window, which is the failure the requirement exists to prevent. 017 already set this dependency direction — `ProvisionService` (001) calls `seedDefaultPositionCatalog` (017) on its own transaction. |

**Concurrency is last-write-wins, deliberately** (spec Assumptions, clarified
2026-08-27). No optimistic locking on any of the six tables. This is not tracked as a
deviation because no principle requires otherwise and no prior slice carries it — it is
recorded here so a reviewer sees it was decided rather than missed. FR-022's
previous/new values are what make a lost update reconstructable.

**No principle is violated by this plan.** Decision 2 — `MP`/`SA` satisfying the
`assigned` resolver — is a documented product trade-off, not a constitutional deviation:
it narrows *who* scope restricts without touching *how* `decide()` works. The
`interceptor.ts` change is an extension of a shared file, the same category as
`capability.ts`, `matrix.ts` and `actions.ts`, all of which every slice extends; it is
listed above because it contradicts one phrase of FR-013 as written, not because it
strains a principle.

---

## Open items for the CC technical lead

Ordered by when an answer is needed.

1. **FR-013's phrase "without editing 004's own files" needs a one-line amendment.**
   *Blocks `/speckit-tasks`? No. Blocks the PR? Yes.* Registration genuinely needs no
   edit — that clause holds for `scope.ts`. But `AuthorizationInterceptor` hard-codes
   `targetId: null` ([interceptor.ts:87](../../backend/src/common/authz/interceptor.ts#L87)),
   with a comment saying `null` is "the correct, and only, value until a `self`-scoped
   capability names one." No `assigned` capability can work until that changes.
   **Recommend** amending FR-013 to read "…without editing `004`'s scope port or decision
   function; `AuthorizationInterceptor` gains `targetId` population, declared per route."
   Cheap, and it keeps the spec honest about what shipped.

2. **The catalog amendment PR must merge first**, per Constitution Check I. Four rows,
   one file. Nothing else in this slice is blocked by it, but the first PR is.

3. **Decision 4 still needs its named signer.** `004/plan.md` Open Item 3 asked for
   someone who can speak to the professional-privilege consequence rather than the HTTP
   convention. Phase 0 makes the ask cheaper to grant, not less necessary: the 404 is
   already implemented behind `ASSIGNED_SCOPE_REFUSAL`
   ([refusal.ts:41](../../backend/src/common/authz/refusal.ts#L41)), so accepting it costs
   no code — only the `004/FR-017` amendment. **Rejecting** it is now the expensive
   option, which is a reason to decide deliberately rather than by default.

4. **Ethical-wall enforcement is out of this slice's guarantee**, per spec Decision 2. If
   a firm ever needs a system-enforced wall against its own `MP`, that is new scope, not
   an extension of this matrix.

5. **Whether `BM`'s client-only visibility survives contact with real billing** once
   `010-billing-core` is specified. Flagged, not answered — that slice is outside the
   current sequencing. The likely shape is a narrow `case.read_billing_reference`
   capability rather than widening row 30.
