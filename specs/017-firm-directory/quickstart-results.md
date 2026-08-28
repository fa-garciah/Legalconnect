# Quickstart Validation Results

**Feature**: `017-firm-directory` | **Run date**: 2026-08-26

All 5 scenarios in [quickstart.md](./quickstart.md) pass. Full suite: **99 test files,
793 tests, 0 failures**. Blocking coverage (`src/common/tenant/**`,
`src/common/audit/**`, `src/common/authz/**`): **100%** statements, branches, functions
and lines. This slice's own module, `src/modules/directory/**`: **100%** statements,
lines and functions; 93.33% branches (the remainder are defensive `if (!row) throw`
guards and the concurrent-retire race — see *Known uncovered branches*).

One environment caveat applies to the full-suite figure and is documented in full under
*The 5 pre-existing failures* below: the suite as a whole exceeds 002's 50-invitations-
per-hour issuance cap for the seeded tenant A, which fails 5 of 002's own invitation
tests **on `main` as well as on this branch**. The 793/0 figure above is from a run with
`INVITATION_ISSUANCE_RATE_PER_HOUR` raised — the knob `invitation.service.ts` already
provides. Nothing in this slice issues an invitation.

| # | Scenario | Status | Evidence |
|---|---|---|---|
| 1 | Assign a position (US1, FR-001 to FR-005) | ✅ PASS | `backend/tests/contract/assign-position.test.ts` (10 tests), `backend/tests/unit/directory-entry-independence.test.ts` (6) |
| 2 | Define the catalog (US2, FR-006 to FR-010) | ✅ PASS | `backend/tests/contract/position-catalog.test.ts` (12 tests), `backend/tests/unit/position-name-collision.test.ts` (8) |
| 3 | Browse the directory (US3, FR-011 to FR-013) | ✅ PASS | `backend/tests/contract/directory-read.test.ts` (19 tests) |
| 4 | The capability matrix grows to 24 rows, exhaustively | ✅ PASS | `backend/tests/unit/matrix-exhaustive.test.ts` (246 tests, 0 pairs unasserted over 24 × 11), `portal-archetypes-empty.test.ts` (44). Compile-time half verified by hand — see below |
| 5 | Nothing that already worked stopped working | ✅ PASS | `npm run test:isolation` (59), `npm run test:rls` (15), `npm run verify:role` (4), `npm run test:contract` (38 files, 165 tests). `git diff --stat` empty on both `0006_grants.sql` and `0016_platform_role_seed_grants.sql` |

## Scenario detail

### Scenario 1 — Assign a position

| Step | Expected | Result |
|---|---|---|
| MP/SA assigns a catalog position to a live membership of their own tenant | `200`; audited with actor, subject, previous (`null`), new value | ✅ `metadata` reads `{ from: null, to: <positionId> }`; `target_entity` `membership`; actor identity **and** membership recorded |
| The same membership's entry is read again | Carries the new position | ✅ Exactly one `directory_entry` row; the upsert never duplicates on re-assignment (research.md D1) |
| Assignment names a position id absent from the tenant's own catalog | `422 position_not_in_catalog` | ✅ And a **foreign tenant's** position id answers byte-identically — the refusal cannot be used to probe another firm's catalog |
| MP/SA of tenant A assigns to a membership of tenant B | `404 not_found`, recorded as `tenant.cross_access_attempted` | ✅ Both shapes asserted: reaching B's membership from inside A answers the generic `404` (RLS, no record — a member cannot inflate their own firm's log); activating B outright records exactly one `tenant.cross_access_attempted` against B |
| A membership with no position ever assigned is read | Distinguishable from one holding a retired position | ✅ `position_id IS NULL` vs. a real id whose catalog row reads `status: retired` |
| An archetype other than MP/SA attempts assignment | `403 not_authorized` | ✅ `AA` refused; 0 rows written |
| Archetype changed (004) after a position assignment | Position unchanged (SC-009) | ✅ Asserted over HTTP, and again as a pure property of the service layer with no database at all |

### Scenario 2 — Define the catalog

| Step | Expected | Result |
|---|---|---|
| MP/SA adds a new position | `201`; assignable in that tenant only | ✅ `position.created` audited against the new position; absent from the other firm's catalog |
| A member of a different tenant reads or writes the catalog | Refused, cross-tenant recorded | ✅ Both the read and the write recorded one `tenant.cross_access_attempted` each; retiring a foreign position id from inside one's own tenant answers the generic `404` and leaves the row `active` |
| A held position is retired | Existing entries still read it, marked retired; unavailable for new assignments | ✅ Row persists with `status: retired` and `retired_at` set; existing `directory_entry` still names it; the listing labels it; a new assignment naming it answers `422` |
| A freshly provisioned tenant's catalog is read | Already the 5-entry default seed, immediately editable | ✅ Read through `GET /tenant/directory/positions` — exactly the 5 defaults, all `active`; retiring one and adding another both succeed with 0 setup steps. Verified on **both** paths: the dev/CI seed and, since T033–T037, a tenant provisioned through `POST /internal/platform/tenants` |
| An archetype other than MP/SA attempts add/retire | `403 not_authorized` | ✅ `AA` refused both; the same `AA` **may** list (row 24), asserted alongside |
| The same name added twice while the first is active | `409 position_already_exists` | ✅ Exact, upper-cased and whitespace-padded variants all refused; exactly one row exists afterward |
| The same name added again after the first is retired | `201` | ✅ Two rows share the name — one `retired`, one `active`, in that order (D4/D6) |

Additionally asserted: retiring an already-retired position answers `409 already_retired`
and writes **no** second `position.retired` entry; the same name in two different
tenants is not a collision (FR-006).

### Scenario 3 — Browse the directory

| Step | Expected | Result |
|---|---|---|
| Any of the six internal archetypes reads | Every live membership of that tenant, with position or null; 0 foreign entries | ✅ All six asserted individually; every membership of the firm present, 0 rows whose `tenant_id` differs |
| A revoked membership | Absent from the listing; its `directory_entry` untouched | ✅ Present before revocation, absent after; the historical row still names its position |
| Any of the four portal archetypes | Refused | ✅ `CC`, `IC`, `CB`, `EL` each asserted individually (`403`), on both the directory and the catalog read — mirroring 004/SC-004's method |
| `PO` | Refused | ✅ Structurally (`MATRIX['directory.read']` excludes `PO`, and row 24 is `tenant`-scoped) and over HTTP (a caller with no membership gets the generic `404`, never `200`) |
| A tenant with more members than one page | First bounded page, `nextCursor` present | ✅ 25 memberships over 3 pages of 10/10/5, no overlap, every membership accounted for exactly once; `nextCursor: null` on the last. A malformed cursor and an over-`MAX_LIMIT` limit both answer `400` |

### Scenario 4 — The capability matrix, exhaustively

| Step | Expected | Result |
|---|---|---|
| 004's exhaustive suite re-run after this slice's extension | Still 0 pairs unasserted, now over 24 × 11 | ✅ 246 tests, up from 213 |
| `capabilityDef`/`MATRIX` missing one of the 3 new rows | `tsc --noEmit` fails naming the missing row | ✅ Verified by hand — see below |

### Scenario 5 — Nothing that already worked stopped working

| Assertion | Result |
|---|---|
| 001/002/004's complete suites | ✅ Pass unedited, except the 5 pre-existing rate-limit failures documented below, which fail identically on `main` |
| `git diff --stat backend/drizzle/0006_grants.sql` | ✅ Empty — and `0016_platform_role_seed_grants.sql` likewise. This slice's grants live in `0020` (its own two new tables) and `0022` (one insert-only extension), never by editing an existing grant migration |
| Blocking coverage (`tenant`, `audit`, `authz`) | ✅ Still 100% on all four measures |

## Additional gates verified beyond the 5 scenarios

- **FR-021's build gate**, exercised again by this slice rather than rebuilt: ✅ PASS,
  verified by hand — see below.
- **T027, the grant audit extended to the two new tables**: ✅ PASS —
  `backend/tests/integration/grants-lockdown.test.ts` now asserts `lc_app` holds
  exactly `SELECT, INSERT, UPDATE` on `position` and `directory_entry`, that the
  missing `DELETE` is refused at the database rather than by an absent method, that no
  role the application can reach holds `DELETE` on either, and that 001/002/004's own
  `lc_app` grants are unchanged (FR-015).
- **RLS coverage over the two new tables**: ✅ PASS — both registered in
  `src/common/db/tenant-scoped-tables.ts`, both `ENABLE`d and `FORCE`d, both policies
  null-safe, both swept by `isolation/no-context.test.ts` and `unfiltered-read.test.ts`.
- **`npm run db:migrate`** applies `0020`, `0021` and `0022` cleanly, with no manual
  intervention: 23 migrations applied against a genuinely empty volume
  (`docker compose down -v`), and a second run skips all 23 — idempotent.
- **The audit vocabulary stays in sync**: ✅ `0021`'s restated 19-action `CHECK` and
  `AUDIT_ACTIONS` agree; none of the three new actions is channel-gated.

### FR-021 verified by hand

```
src/common/authz/matrix.ts(40,14): error TS2741: Property '"directory.manage_catalog"'
is missing in type '{ ... }' but required in type
'Readonly<Record<"audit.read_own_tenant" | ... | "directory.read", ReadonlySet<...>>>'.
```

Removed `'directory.manage_catalog'` from `MATRIX` while leaving it in `CAPABILITIES`;
`npx tsc --noEmit` failed naming the missing property, as FR-021 requires. Restored
immediately; `npx tsc --noEmit` is clean on the branch.

## One thing found and fixed while validating

**`GET /tenant/directory` leaked the caller's own memberships in other tenants.**

`membership` carries a *second* permissive SELECT policy —
`membership_own_identity_select` (`backend/drizzle/0013`) — which 002 added so an
identity can enumerate its own memberships with no tenant activated. PostgreSQL ORs
permissive policies together, so inside an ordinary tenant session that policy also
admits the caller's own membership rows **in every other tenant they belong to**. Every
prior slice was unaffected because none of them listed memberships tenant-wide;
`membership.read_tenant` still has no route. This slice's directory read is the first,
and its first draft leaned on RLS alone.

Symptom: a dual-tenant member reading firm A's directory saw their own firm B row in
it — a direct SC-005 violation.

Fixed by narrowing the listing query with an explicit
`m.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid`, documented at
the call site as a narrowing against 002's deliberate self-enumeration seam rather than
as a substitute for RLS (every *other* tenant's rows remain invisible without it). It is
the only hand-written tenant predicate in this slice.

Regression-proofed by `directory-read.test.ts`'s scenario 1b, which fixtures a genuine
dual-tenant identity and asserts both directions. Verified to fail without the predicate
and pass with it before being accepted.

## The 5 pre-existing failures

Running the complete suite in one pass fails these 5 of 002's invitation tests:

- `contract/invite-user.test.ts` — scenario 1
- `contract/enumeration-duplicate-invite.test.ts` — issuing looks identical
- `contract/invitation-reissue.test.ts` — no PATCH/extend route
- `contract/revoke-invitation.test.ts` — both tests

All five fail identically: `expected 429 to be 201`. The cause is 002's own coarse
anti-abuse cap (`research.md` D8, `ISSUANCE_RATE_PER_HOUR = 50`): with
`fileParallelism: false`, the contract suites run sequentially against the one seeded
tenant A and collectively issue more than 50 invitations within the rolling hour, so
whichever files run late are refused.

**Confirmed pre-existing, not caused by this slice.** Verified by stashing every 017
change (`git stash push -u`), resetting the database
(`db:down && db:up && db:migrate && db:seed`) and running `npm test` on the clean
baseline: the same 4 files and the same 5 tests failed, with the same message. This
slice issues no invitations and touches nothing in `src/modules/invitation`.

With `INVITATION_ISSUANCE_RATE_PER_HOUR` raised — a knob `invitation.service.ts` already
reads from the environment — the full suite is **98 files / 786 tests / 0 failures**.
Fixing the fixture properly (per-file throwaway tenants for the invitation suites, or a
test-profile cap) belongs to whoever owns 002's fixtures; it is recorded here rather
than patched from this branch.

## Known uncovered branches

`src/modules/directory/**` is at 100% statements, lines and functions. The 93.18%
branch figure is these, all deliberate:

- `directory-entry.repository.ts:119`, `position.repository.ts:82,100` — `if (!row)
  throw` guards after a `RETURNING`. Unreachable without a database fault.
- `position.service.ts:80` — the lost-race branch when a concurrent retirement commits
  first between the pre-check and the `UPDATE`. Deterministically unreachable from a
  test; the refusal it raises is the same one the pre-check already covers.
- `directory.controller.ts:65`, `position.controller.ts:38` — `(body ?? {})` fallbacks
  for a request with no body at all.

## Commands run

```bash
cd backend
npm run db:down && npm run db:up && npm run db:migrate && npm run db:seed

npx vitest run tests/contract/assign-position.test.ts          # Scenario 1 — 10 passed
npx vitest run tests/contract/position-catalog.test.ts         # Scenario 2 — 12 passed
npx vitest run tests/contract/directory-read.test.ts           # Scenario 3 — 19 passed
npx vitest run tests/unit/matrix-exhaustive.test.ts            # Scenario 4 — 246 passed

npm run test:isolation                                         # Scenario 5 — 59 passed
npm run test:rls                                               #              15 passed
npm run verify:role                                            #               4 passed
npm run test:contract                                          #             160 passed
git diff --stat backend/drizzle/0006_grants.sql                #              empty

npx vitest run tests/contract/provision-seeds-catalog.test.ts   # T033      —   5 passed
npx vitest run tests/integration/platform-scope.test.ts        # T036      —  10 passed

docker compose down -v && docker compose up -d --wait           # empty volume
npm run db:migrate                                              # 23 applied, 0 errors
npm run db:migrate                                              # re-run: all skipped

INVITATION_ISSUANCE_RATE_PER_HOUR=100000 npm test -- --coverage
#   99 files / 793 tests / 0 failures
#   src/common/tenant, src/common/audit, src/common/authz — 100/100/100/100
```

## FR-009's production half — closed (T033–T037, 2026-08-26)

The first pass of this slice seeded the default catalog in `drizzle/seed.ts` only, which
is all `tasks.md` had scoped. A tenant provisioned through the **production** path —
`POST /internal/platform/tenants` — still started with an empty catalog, so SC-008's
"0 manual setup steps required before the first assignment" did not hold there. That is
now fixed.

**What changed.** research.md D2's own instruction, followed literally: *"the same insert
runs wherever 001's tenant-provisioning path already writes a tenant's first rows —
extending that write, not adding a second provisioning mechanism."*

- `0022_position_platform_seed.sql` — one `FOR INSERT` policy and one `GRANT INSERT` for
  `lc_platform` on `position`, in the exact shape 002 already used in
  `0016_platform_role_seed_grants.sql`. The policy's `WITH CHECK (status = 'active' AND
  retired_at IS NULL)` is the analogue of 0016's `seeded = true`: the platform role may
  bring a catalog into existence, but only in the state a new catalog is legitimately in.
- `src/modules/directory/position-catalog.seed.ts` — the default list and the insert that
  writes it, now shared by `ProvisionService` and `drizzle/seed.ts`. They held two
  separate copies of the list before, which is precisely the drift this closes:
  `directory-seed.test.ts` would have gone on passing against the dev seed's copy while
  real firms were provisioned from the other.
- `ProvisionService.provision()` writes the catalog on the **same platform transaction**
  as the tenant row, so SC-008 and 001's US3 scenario 5 hold together — a tenant either
  exists with its catalog or does not exist.

**What the platform role can now do, and what it still cannot.** The extension buys one
INSERT and nothing else, asserted directly rather than assumed:

| Operation | Before | After |
|---|---|---|
| `INSERT` into `position` | permission denied | permitted, `active` rows only |
| `SELECT` from `position` | permission denied | **still permission denied** — it cannot read back even the catalog it wrote |
| `UPDATE` on `position` | permission denied | **still permission denied** |
| `DELETE` on `position` | permission denied | **still permission denied** (FR-007) |
| Anything on `directory_entry` | permission denied | **still permission denied** — who holds which position is the firm's own business |
| Inserting a pre-retired row | n/a | refused by RLS, not by application code |

`platform-scope.test.ts` — 002's own lockdown, and the reason this was flagged rather than
done silently on the first pass — was updated from five tables to six and now additionally
asserts that the `position` extension is insert-only and that its policy carries no
`USING` clause and a `WITH CHECK` that is not `true`. `0006_grants.sql` and
`0016_platform_role_seed_grants.sql` are both untouched (`git diff --stat` empty on each),
so FR-015 holds: this added a privilege on a table this slice introduced and weakened none.

**Evidence**: `backend/tests/contract/provision-seeds-catalog.test.ts` (5 tests) — a
provisioned tenant's catalog read back through the product's own endpoint by a real member
of that new tenant, immediately assignable and immediately editable, isolated per tenant,
plus the five containment assertions above. `backend/tests/integration/platform-scope.test.ts`
(10 tests, up from 8).
