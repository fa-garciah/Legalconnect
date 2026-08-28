# Quickstart — Validating Clients, Cases & Case Teams

**Feature**: `006-client-case-core` | **Date**: 2026-08-27
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) |
**Contracts**: [client-api.md](./contracts/client-api.md) ·
[case-api.md](./contracts/case-api.md) · [catalog-api.md](./contracts/catalog-api.md)

A run-and-verify guide, not an implementation guide.

---

## Prerequisites

Identical to 017 — nothing new. Docker running, `backend/.env` already established.

```bash
cd backend
npm ci
npm run db:up && npm run db:migrate && npm run db:seed
```

The seed now writes, per tenant: the three case catalogs (research D7), two clients, and
three cases with assignments arranged so the scope scenarios below have something to
refuse. It prints the ids it created — `SEED_CASE_ASSIGNED_TO_AA`,
`SEED_CASE_UNASSIGNED`, and the membership ids — since Scenario 3 needs them by hand.

---

## Scenario 1 — Register and maintain a client (US1, FR-001 to FR-004)

```bash
npx vitest run tests/contract/client-crud.test.ts
```

| Step | Expected |
|---|---|
| `MP` creates a client with a legal name and kind | `201`; available for case creation in that tenant only |
| A client is created with no RFC | `201` — RFC is nullable |
| Two tenants each register a client with the same legal name | Both succeed, distinct records |
| Two clients in **one** tenant share a legal name | Both succeed — no uniqueness constraint, asserted deliberately |
| A client referenced by a live case is deactivated | `200`; every case still resolves it; nothing cascades |
| A new case is opened against a deactivated client | `422 client_not_available` |
| Tenant A's `MP` reads or writes a client of tenant B | `404 not_found`, recorded as `tenant.cross_access_attempted` |
| A `PL` creates a client, then corrects its legal name | Both `200`/`201` — **Q1** |
| The same `PL` attempts to deactivate it | `403 not_authorized` — **Q1's split** |
| `kind` is supplied in a `PATCH` | `400 validation_failed` |

### 1b — Search, and the way back (FR-002a, FR-004a)

```bash
npx vitest run tests/contract/client-search.test.ts tests/contract/client-reactivate.test.ts
```

| Step | Expected |
|---|---|
| The list is read with `?q=torres` | Only clients whose legal name contains that fragment, matched in any letter case |
| `?q=` or `?q=%20%20` | Treated as absent — the whole list, not an empty result |
| `?status=inactive` | Only withdrawn clients; `?status=nonsense` is `400 validation_failed` |
| A filtered read over more matches than one page | A **full** page of matching clients, and a `nextCursor` that leads to more matches — filtering happened before the boundary (SC-007a) |
| A withdrawn client is restored by `MP`, `BM` or `SA` | `200`, `status: "active"`, immediately accepted for new cases |
| A `PL` attempts the restore | `403 not_authorized` — row 28, same split as deactivation |
| An active client is restored | `409 already_active` |
| The withdraw-then-restore round trip is audited | 2 distinct entries, `client.deactivated` then `client.reactivated` (SC-007b) |

## Scenario 2 — Open a case (US2, FR-005 to FR-008)

```bash
npx vitest run tests/contract/case-crud.test.ts
```

| Step | Expected |
|---|---|
| `CM` opens a case against an active client | `201`; tenant-unique file number; status from the tenant's own catalog |
| A consultative matter is created with no venue | `201`; `venue: null`, case valid |
| A case records the court's own number | Stored in `venueCaseReference`, distinct from `fileNumber` (FR-006) |
| A second case reuses a file number in the same tenant | `409 file_number_already_used` |
| Two tenants each use the same file number | Both succeed — uniqueness is per tenant |
| A case names another tenant's `caseStatusId` | `422 catalog_entry_not_available`, and the body does not say which id was at fault |
| A case names a **retired** status | Same `422`, same body — the three causes are indistinguishable |
| A client is deactivated after its case exists; the case is read | Unaffected (FR-008) |
| A freshly provisioned tenant's three catalogs are read | Already seeded and editable; `venue` deliberately empty, `Concluido` seeded as closing |

### 2b — Closure follows the firm's own catalog (FR-008a)

```bash
npx vitest run tests/contract/case-closure.test.ts
```

| Step | Expected |
|---|---|
| A case is moved to a status the firm marked `isClosing` | `closedOn` stamped with today, with no caller input (SC-008b) |
| The same case is moved back to a non-closing status | `closedOn` cleared |
| A status-change request carries `closedOn` | `400 validation_failed` — the field is output-only |
| A tenant marks two statuses closing | Either one closes a case |
| A tenant marks none | No case ever carries a closing date, and that is legal |
| A catalog entry's `isClosing` is toggled after cases already hold it | Existing cases are **not** re-dated; they re-date when they next move status |
| `isClosing` is sent to `matter-types` or `venues` | `400 validation_failed` |

## Scenario 3 — Assign a case team, and the first `assigned` scope (US3, FR-009 to FR-018)

**This is the scenario the slice exists for.** Three prior slices deferred to it by name.

```bash
npx vitest run tests/contract/case-assignment.test.ts
npx vitest run tests/integration/assigned-scope-resolver.test.ts
```

| Step | Expected |
|---|---|
| `MP` assigns an `AA` to a case as `lead` | `201`; the `AA` now resolves as holding scope over it |
| The same `AA` reads that case | `200` with the team listed |
| The `AA` is unassigned; they immediately re-request the case | `404 not_found` on the **very next** request — no grace period (FR-011, SC-001) |
| The same pair is assigned twice while the first is live | `409 already_assigned` — enforced by the partial unique index, not a read-then-write |
| Two members are on a case; one is unassigned | The other's assignment is untouched (US3 scenario 3) |
| A member is unassigned, then reassigned | `201` — a **new** row; the historical row persists, nothing was deleted |
| A member holding live assignments has their **membership revoked** | Every assignment closed in the same transaction; the case team read no longer lists them; the historical rows survive (FR-012a, SC-008a) |
| A member with no assignments is revoked | Clean no-op |
| `MP` and `SA` read a case they are on nobody's team for | `200` — Decision 2, the resolver short-circuits before querying |
| A `CM` not on a case attempts to add themselves | `404 not_found` — staffing a matter you are not on is an `MP`/`SA` act |

### 3b — Opacity, asserted byte-for-byte (FR-016, FR-017, SC-002)

```bash
npx vitest run tests/integration/assigned-scope-opacity.test.ts
```

| Step | Expected |
|---|---|
| An `AA` requests a case of their own tenant they are **not** assigned to | `404`, body `{"error":{"code":"not_found",…}}` |
| The same `AA` requests a case id that **does not exist** | **Byte-identical** response |
| The same `AA` requests a case belonging to **another tenant** | **Byte-identical** response |
| All three responses are compared field by field, status included | 0 differences — nothing confirms case B exists |

### 3c — The empty list is not an error (US3 scenario 5, SC-003)

```bash
npx vitest run tests/contract/case-list-scoping.test.ts
```

| Step | Expected |
|---|---|
| A `PL` with a live membership and **no** assignments reads the case list | `200 { "items": [], "nextCursor": null }` — **not** a refusal |
| An `AA` assigned to 2 of the tenant's 7 cases reads the list | `200` with exactly those 2 |
| `MP` reads the same list | All 7 — Decision 2 |
| A tenant with more assigned cases than one page | First bounded page, `nextCursor` present, and the page holds a full `limit` of **visible** cases — filtering happened before the boundary, so no page is silently short |
| `BM` reads the case list | `403 not_authorized` — `BM` holds no case row (Principle VI) |

### 3d — Tenant isolation of the resolver itself (Principle II re-check)

```bash
npx vitest run tests/integration/assigned-scope-isolation.test.ts
```

| Step | Expected |
|---|---|
| A member of tenant A is handed a valid case id from tenant B | Resolver's query returns 0 rows — RLS filtered before `membership_id` was compared |
| The refusal produced | The same `404` a nonexistent case gets; existence stays uninferable |
| The resolver is invoked with no active tenant context | Throws rather than answering — `currentTx()`'s existing no-context guard |

## Scenario 4 — The catalogs (FR-019 to FR-021)

```bash
npx vitest run tests/contract/case-catalog.test.ts
```

| Step | Expected |
|---|---|
| `MP` adds a matter type | `201`; available for new cases in that tenant only |
| The same name is added twice while the first is active | `409 catalog_entry_already_exists` |
| The same name is added again after the first is retired | `201` — retire-then-recreate, 017's D4/D6 pattern |
| A status held by existing cases is retired | Those cases still read it, marked `catalogStatus: "retired"`; offered for no new case |
| An `AA` attempts to add or retire an entry | `403 not_authorized` — rows 34–35 are `MP`/`SA` |
| A member of another tenant reads or writes the catalog | Refused, cross-tenant recorded |
| The last active `case_status` is retired | `200` — permitted; recoverable in one request, deliberately not guarded |
| An unknown `{catalog}` path segment | `404 not_found` |

## Scenario 5 — Audit (FR-022, FR-023, SC-005, SC-006)

```bash
npx vitest run tests/contract/case-read-audited.test.ts
```

| Step | Expected |
|---|---|
| Each of the 11 mutations in this slice | Exactly 1 audit entry, with actor, subject, and previous/new where a value changed |
| A revocation that closes 3 assignments | 3 `case.team_member_unassigned` entries beside the `membership.revoked` one — same action as a deliberate unassignment; the actor and the neighbouring entry name the cause (research D8) |
| A single case is read with `x-channel: interactive` | Exactly 1 `case.read` entry |
| The same read with `x-channel: automated` | **0** entries — the gate (FR-023) |
| The case **list** is read, either channel | 0 entries — deliberate, per the spec's Resolved Decisions |
| `case.team_member_assigned`'s subject | The **membership**, not the case — 017's `directory.position_assigned` precedent |
| A status change that fails validation | 0 entries — the refusal throws before the append |

## Scenario 6 — Nothing that already worked stopped working

```bash
npm test
```

| Step | Expected |
|---|---|
| 001, 002, 004 and 017's full suites | Green, unchanged (SC-014) |
| The exhaustive capability matrix suite | 0 pairs unasserted, now over **35** capabilities × 11 subjects |
| `capabilityDef`/`MATRIX` missing one of the 11 new rows | `npm run typecheck` fails, naming it (`004/FR-021`, unchanged mechanism) |
| A route declaring `assigned` scope without `@ScopeTarget` | Build fails — the extension to `capability-declared-everywhere.test.ts` (research D2) |
| `npx vitest run tests/integration/case-core-grants-lockdown.test.ts` | 0 `DELETE` grants on all 6 new tables, for every role |

---

## What to check by hand, once

Two things the suites cover but which are worth seeing directly, because they are the
claims most likely to be doubted later.

**1. The 404 needs no new code.** Before writing the resolver, confirm the mapping is
already there:

```bash
grep -n "ASSIGNED_SCOPE_REFUSAL" backend/src/common/authz/refusal.ts
grep -n "'not_found'" frontend/src/feedback/refusal-bucket.ts
```

Both already return the opaque path. Decision 4 costs no implementation — only the
`004/FR-017` amendment (plan.md Open Item 1 and 3).

**2. `targetId` is the gap.** Confirm the reason `assigned` cannot work today:

```bash
grep -n "targetId" backend/src/common/authz/interceptor.ts
```

It is hard-coded `null`. Everything in Scenario 3 depends on that line changing.

---

## Known-not-covered

Recorded so the gaps are visible rather than assumed absent:

- **`role_on_case` has no authorization effect.** `lead`, `collaborator` and `support` are
  stored and returned, and no test asserts a permission difference between them, because
  the matrix draws none (spec Assumptions).
- **Concurrent edits are last-write-wins**, and
  `tests/integration/concurrent-edit-last-write-wins.test.ts` asserts exactly that. It
  documents an accepted trade-off rather than guarding an invariant — two people editing one
  record in the same window will lose one edit, silently, and the audit trail is what makes
  it reconstructable (spec Assumptions, clarified 2026-08-27).
- **Catalog entry names cannot be edited**, only retired and recreated — 017's precedent.
  `isClosing` is the sole exception, and only on `case-statuses`.
- **Assignment history is not exposed.** The rows persist and
  `case-assignment.test.ts` asserts they are not deleted, but no route reads them.
- **`016a`'s Scenario 4 and 6** become testable with this slice, but exercising them is
  016a's own suite, not this one. No frontend change is required (research D10) — someone
  should run 016a's deferred scenarios once this ships and close them there.
