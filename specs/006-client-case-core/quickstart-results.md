# Quickstart Validation Results

**Feature**: `006-client-case-core` | **Run date**: 2026-08-27, amended 2026-08-28

All 6 scenarios in [quickstart.md](./quickstart.md) pass, verified twice: on 2026-08-27
against the 006 branch (**118 files, 1136 tests, 0 failures**), and re-verified on
2026-08-28 on `spec007_document_management` after 007 landed — **132 files, 1315 tests,
0 failures**. This slice's own 16 suites: **120/120**. Both runs against a database
rebuilt from scratch. `tsc --noEmit` and `eslint .` clean; all blocking coverage
thresholds met, including `src/common/authz/**` at 100% and this slice's
`assigned-scope.resolver.ts` at 100%.

> **The caveat below is environmental and now resolved.** Reaching that green run took
> three local setup steps that nothing in the repo tells you about — all three present as
> failures that look like broken code. They are written up because the next person will
> hit them too.

| # | Scenario | Status | Evidence |
|---|---|---|---|
| 1 | Register and maintain a client (US1, FR-001 to FR-004a) | ✅ PASS | `client-crud.test.ts` (12), `client-search.test.ts` (5), `client-reactivate.test.ts` (5) |
| 2 | Open a case (US2, FR-005 to FR-008a) | ✅ PASS | `case-crud.test.ts` (10), `case-closure.test.ts` (8) |
| 3 | Assign a case team, and the first `assigned` scope (US3) | ✅ PASS | `case-assignment.test.ts` (12), `assigned-scope-resolver.test.ts` (8) |
| 3b | Opacity, byte-for-byte (FR-016, SC-002) | ✅ PASS | `assigned-scope-opacity.test.ts` (5) |
| 3c | The empty list is not an error (SC-003) | ✅ PASS | `case-list-scoping.test.ts` (8) |
| 3d | Tenant isolation of the resolver (Principle II) | ✅ PASS | `assigned-scope-isolation.test.ts` (4) |
| 4 | The three catalogs (FR-019 to FR-021) | ✅ PASS | `case-catalog.test.ts` (15), `catalog-name-collision.test.ts` (15), `provision-seeds-case-catalogs.test.ts` (5) |
| 5 | Audit (FR-022, FR-023, SC-005, SC-006) | ✅ PASS | `case-read-audited.test.ts` (6), `revocation-closes-assignments.test.ts` (7) |
| 6 | Nothing that already worked stopped working | ⚠️ PASS **with a documented deviation** | Full suite 1315/1315; **7 prior-slice test files modified** — see *The SC-014 deviation* |

---

## The caveat

### 1. Three local setup steps nothing in the repo documents

Every one of these presents as failing tests rather than as a setup error, and together
they accounted for **23 failures that were not code defects**:

```bash
cd backend
npm install                                                    # 007 declared @aws-sdk/* without an install
sed -n '50,62p' .env.example >> .env                           # 007's OBJECT_STORE_* block
docker exec legalconnect-minio-dev mc alias set local   http://localhost:9000 lc_minio_dev lc_minio_dev_password
docker exec legalconnect-minio-dev mc mb local/legalconnect-documents-dev   # the bucket
```

Plus four keys that were in `.env.example` and absent from `.env`:
`EMAIL_PROVIDER_REGION`, `EMAIL_SENDER_ADDRESS`, `INVITATION_MAX_FAILED_ATTEMPTS` and
`INVITATION_ISSUANCE_RATE_PER_HOUR`. All four have now been added.

**What each one cost, and why it was hard to see:**

- **The missing `OBJECT_STORE_*` block** was the worst. `DocumentsModule`'s `useFactory`
  throws when those three values are absent, a throw inside a Nest provider factory aborts
  initialization, and vitest reports it as `Worker exited unexpectedly` with the cause
  swallowed. **Every** test that boots `AppModule` failed — 004's
  `capability-declared-everywhere.test.ts` as readily as 006's — which reads as a
  repo-wide breakage rather than one missing config block.
- **The missing MinIO bucket** cost 18 failures across 007's five document suites. The
  compose file starts MinIO but never creates `legalconnect-documents-dev`, so every
  upload returned `500`.
- **The missing `INVITATION_ISSUANCE_RATE_PER_HOUR`** cost 5 failures in 002's invitation
  suites. Its absence means `invitation.service.ts`'s default of 50/tenant/hour applies,
  and the full suite exceeds it on a second run within the hour. 017 documented this same
  characteristic and it was still unaddressed; adding the key from `.env.example` (200)
  resolves it.

**A diagnostic trap worth recording**: booting `AppModule` under `tsx` to find the first
cause produces a *different and false* answer —
`Nest can't resolve dependencies of the DocumentsService (?, ...)`. That is esbuild having
no `emitDecoratorMetadata` support, which `vitest.config.ts` already warns about in its own
comments. Diagnose Nest DI problems under SWC (a vitest file), never under `tsx`.

**Recommended follow-ups, none of them 006's to make**: add a `mc mb` step to
`docker-compose.yml` or a `db:up`-style script; have `objectStoreConfig()` fail lazily on
first use rather than at module construction; and treat `.env.example` drift as something
CI checks, since three of these four were the same failure mode.

---

## Scenario detail

### Scenario 1 — Register and maintain a client

| Step | Expected | Result |
|---|---|---|
| A client is created with a legal name and kind | `201`, available in that tenant only | ✅ The other firm's list never contains it — RLS, not an application filter |
| A client with no RFC | `201` | ✅ Both omitted and explicit `null` accepted. No RFC format validation: 001's `normaliseRfc` is for *tenant* RFCs, and validating a client's would refuse records a firm has not finished collecting |
| A client referenced by a live case is deactivated | Deactivated, never hard-deleted; cases still resolve it | ✅ Row still present; the case reads back with `client.status: "inactive"` and full resolution |
| Two tenants register the same legal name | Distinct records | ✅ And **within one tenant** too — asserted deliberately, so a later reader does not "fix" the absent uniqueness constraint. Two people called Juan Pérez at one firm is not a data error |
| A deactivated client is named on a new case | Refused | ✅ `422 client_not_available` |
| Reaching another tenant's client | `404 not_found` | ✅ Generic; RLS makes it invisible before any business logic |
| **Q1** — a `PL` creates and corrects a client | Both succeed | ✅ |
| **Q1** — the same `PL` withdraws it | Refused | ✅ `403 not_authorized`. The clarification session's one permission move, holding end to end |

### Scenario 1b — Search and restore (both added by the clarification session)

| Step | Expected | Result |
|---|---|---|
| `?q=` matches a name substring | Any letter case | ✅ Mid-string, not just prefix — a firm typing "torres" finds "Grupo Torres, S.A. de C.V." |
| `?q=` empty or whitespace-only | Treated as absent | ✅ Returns the whole register, not zero. A cleared search box shows everything back |
| `?status=` filters; a bad value refuses | | ✅ `400 validation_failed` |
| **SC-007a** — a filtered page is FULL | Filtering before the page boundary | ✅ 8 matches, `limit=5` → pages of 5 then 3, disjoint, 8 distinct ids. A post-fetch filter would have shortened the first page while `nextCursor` still promised more |
| **SC-007b** — withdraw then restore | Usable again, 2 audit entries | ✅ A new case opens against the restored client; `client.deactivated` then `client.reactivated`, in order |
| `PL` attempts the restore | Refused | ✅ `403` — restoration shares row 28, so Q1's split applies to it unchanged |

### Scenario 2 — Open a case

| Step | Expected | Result |
|---|---|---|
| A case is opened against an active client | Tenant-unique file number, catalog status | ✅ |
| A consultative matter with no venue | Valid | ✅ `venue: null` |
| The court's own number | A field distinct from the firm's | ✅ What the prototype could not express — it had one field and had to choose |
| A duplicate file number in one tenant | Refused | ✅ `409 file_number_already_used`, trimmed and case-insensitively, mapped from the **database's** unique violation rather than a pre-check |
| The same number in another tenant | Allowed | ✅ Uniqueness is per tenant |
| Another tenant's catalog id | Refused, without naming the field | ✅ `422 catalog_entry_not_available`; the body does not contain `caseStatusId`. Naming it would turn one probe into three |
| A **retired** entry | The same refusal, byte-identical | ✅ Retired, foreign and absent are indistinguishable |
| A case already holding a retired entry | Still resolves it, marked retired | ✅ `catalogStatus: "retired"` on the wire |
| Decision 3 — a fresh case has no team | Legal | ✅ `team: []` |

### Scenario 2b — Closure follows the firm's own catalog (FR-008a)

The clarification session found the spec promising a closing date with no rule for setting
it, and the design having quietly invented one. This is the answer that replaced it.

| Step | Expected | Result |
|---|---|---|
| **SC-008b** — moving to a closing status | Stamps the date, no caller input | ✅ |
| Moving back to a non-closing status | Clears it | ✅ Both directions, and from the very first write — a case opened *directly* into a closing status is closed |
| A request carrying `closedOn` | Refused | ✅ `400` on both create and status-change. Output-only, so the status and the date cannot disagree |
| A tenant marking several statuses closing | Either closes | ✅ |
| A tenant marking none | No case ever closes, legally | ✅ The fixture's status is renamed non-closing and the product follows the firm, not the name |
| Toggling `isClosing` afterwards | Does **not** re-date existing cases | ✅ They re-date when they next move status. Rewriting them would rewrite history the trail already records |

### Scenario 3 — The case team, and the first `assigned` scope

| Step | Expected | Result |
|---|---|---|
| An assigned `AA` resolves as holding scope | Reads the case | ✅ 404 before the assignment, 200 after — the same request, the same case |
| **SC-001** — unassignment | Effective on the very next request | ✅ Asserted three times in a row, immediately. No cache to invalidate: the resolver queries inside each request's own transaction |
| Two members, one unassigned | The other unaffected | ✅ |
| The same live pair assigned twice | Refused | ✅ `409 already_assigned`, from the partial unique index — two concurrent callers cannot both win |
| Reassignment after removal | A **new** row; the old one persists | ✅ Two rows, one closed and one live |
| A revoked or foreign membership | Refused, indistinguishably | ✅ `422 membership_not_available` for both |
| A `CM` not on the case adds themselves | Refused | ✅ `404`. Staffing a matter you are not on is an `MP`/`SA` act — surprising, and intended |
| `MP`/`SA` with zero assignment rows | Granted | ✅ Decision 2, short-circuiting before any query |
| A revoked membership's assignments | Closed in the same transaction | ✅ See Scenario 5 |

### Scenario 3b — Opacity, byte-for-byte (SC-002)

**The property the whole refusal design exists for.** Three requests by the same `AA`:

| Target | Result |
|---|---|
| A case of their own tenant they are not on | `404 not_found` |
| A case id that exists nowhere | **Byte-identical** |
| A case belonging to another firm | **Byte-identical** |

Compared as status, as parsed body, and as serialised JSON: `new Set(...).size === 1`. The
body names nothing — not the case id, not the tenant, not the words *assign*, *scope* or
*team*. The same three targets are indistinguishable on the status-change route too, since
FR-016 is a property of the **kind**, not of one route.

Proven to be genuinely the scope refusal rather than a blanket 404: assigning the `AA`
lifts it to 200 for that one case while the foreign and nonexistent ones stay 404, and
unassigning restores it.

**Zero code was needed for this.** `refusalToHttp` already mapped `scope` + `assigned` to
`ResourceNotFound` behind a constant 004 wrote for this exact moment, and
`refusal-bucket.ts` already maps `not_found` to its opaque bucket. Decision 4 cost an
amendment to `004/spec.md`, and nothing else.

### Scenario 3c — The empty list is not an error (SC-003)

| Step | Expected | Result |
|---|---|---|
| A `PL` with no assignments reads the list | `200 { items: [], nextCursor: null }` | ✅ Asserted explicitly **not** to be 403 and **not** to be 404, with no `error` key |
| An `AA` on 2 of 7 | Exactly those 2 | ✅ |
| `MP`/`SA` | All 7 | ✅ Decision 2 |
| **SC-012** — a page is full | Filtering before the boundary | ✅ 7 cases, `limit=5` → 5 then 2, disjoint |
| A restricted caller paging | Over their **own** matches | ✅ The `AA`'s two, one per page, never one of the five they are not on |
| `BM` | `403`, not an empty list | ✅ Refused on **permission** — a different statement from "you are on no matters" |

This is why row 29 declares `tenant` and not `assigned`, and the suite says so in its own
header: a scope resolver returns a boolean, so an `assigned`-scoped list could only have
refused the first caller.

### Scenario 3d — The resolver cannot see across tenants (Principle II)

The row `plan.md`'s post-design Constitution re-check flagged to watch.

| Step | Result |
|---|---|
| Firm A's **MP** handed a real case id from firm B | ✅ `404` — and MP is the caller who would see a leak if one existed, since Decision 2 exempts them from the assignment check |
| Firm A's AA, same id | ✅ `404`, body identical to the MP's |
| The resolver's query under the wrong tenant | ✅ `EXISTS` returns `false`; under the **right** tenant the same query returns `true`, so the `false` is isolation and not a query that never matches |
| A cross-tenant reach with B's tenant header | ✅ Refused, and exactly one `tenant.cross_access_attempted` recorded against B |
| Writing an assignment into another tenant | ✅ Refused by the policy's `WITH CHECK` |

### Scenario 4 — The three catalogs

All 15 rows pass, including retire-then-recreate, the unknown-segment `404`, and the
deliberately-permitted retirement of the **last** active case status (recoverable in one
request, so not guarded — 004 introduced `LastAdministratorProtected` only where the
failure is unrecoverable).

`isClosing` specifics: accepted on `case-statuses`, **refused** on the other two rather
than silently dropped, editable (the one mutable field on any catalog entry), audited with
previous and new, and settable on several statuses or none.

Provisioning: a tenant created through the real platform route receives all three catalogs
on the same transaction as its position catalog — **four catalogs, one operation** (FR-021,
SC-009), with `venue` deliberately empty and `Concluido` seeded as closing.

### Scenario 5 — Audit

| Step | Expected | Result |
|---|---|---|
| **SC-006** — an interactive single-case read | Exactly 1 `case.read` | ✅ |
| The same read, `x-channel: automated` | **0** | ✅ The gate. A monitoring job may read a matter without growing the log a firm reads |
| The case **list** read, either channel | 0 | ✅ Per the spec's Resolved Decisions |
| A **refused** read | 0 | ✅ If a refusal wrote an entry, the log would confirm the existence the 404 exists to hide |
| **SC-005** — each of the 11 mutations | Exactly 1 entry | ✅ |
| `client.updated` metadata | Previous and new, for fields that **moved** | ✅ A field not sent is absent, not recorded as unchanged — the entry answers "what changed", not "what was sent" |
| **SC-008a** — a revocation closing 3 assignments | 3 `case.team_member_unassigned` entries | ✅ One each, carrying `caseId` and `reason: membership_revoked`, beside the `membership.revoked` entry which carries the count |
| A revocation refused by the last-SA invariant | Closes nothing | ✅ The whole transaction rolls back — the cascade genuinely shares it |

---

## The SC-014 deviation, stated plainly

SC-014 asked for **0 test files modified** in 001/002/004/017. **Six were.** All six are
census assertions that any slice extending a shared registry must move:

| File | Change |
|---|---|
| `capability-declared-everywhere.test.ts` | 24 → 35 capabilities |
| `registry-shape.test.ts` | 24 → 35 rows |
| `portal-archetypes-empty.test.ts` | 11 → 19 tenant-scoped rows |
| `directory-audit-actions.test.ts` | 19 → 31 actions |
| `audit-fields.test.ts` | 19 → 31 actions; gated set 2 → 3 |
| `platform-scope.test.ts` | 6 → 9 tables, plus a new insert-only assertion for the three catalogs |
| `matrix-exhaustive.test.ts` | +`ASSIGNED_ROWS` group, +permissive `assigned` stub, 24 → 35 |

That is seven files.

**The honest reading**: 017 already moved four of these same counters from 21 → 24, so the
precedent is established and SC-014's bar was written more absolutely than the codebase
can honour. A census that must be edited by hand to grow is the mechanism working, not a
regression — `matrix-exhaustive.test.ts` says as much in its own comment. But the criterion
said zero, and the result is seven. **SC-014 should be reworded** for the next slice to
distinguish "no prior-slice test's *assertion about its own behaviour* changed" (true here)
from "no prior-slice test file was touched" (false, and unachievable).

No prior slice's behavioural assertion was weakened, and no test was deleted or skipped.

---

## Two things found during implementation, and fixed

1. **`case_catalog.*` violated the registry's naming convention.** `registry-shape.test.ts`
   enforces `module.verb` with a single-word module, and `case_catalog.read` failed it.
   Renamed to `case.read_catalog` / `case.manage_catalog`, and the three audit actions to
   `case.catalog_entry_*`, matching 017's `directory.manage_catalog`. Caught by 004's gate,
   which is what it is for.

2. **The `venue` catalog being empty broke an isolation sweep.** `no-context.test.ts`
   requires every tenant-scoped table to have a visible row under an active tenant — the
   control that makes its "zero rows after release" result meaningful rather than vacuous.
   A permanently empty table would pass it for the wrong reason. Fixed in the **dev seed
   only**: it writes one venue, while production provisioning still seeds zero. The
   research D7 decision is unchanged; the fixture exists so the isolation of that table is
   genuinely proven.

## Known uncovered branches

`src/modules/case-core/assigned-scope.resolver.ts` holds its 100% blocking threshold
(vitest.config.ts, T004).

`src/common/authz/interceptor.ts` gained `scopeTargetOf`, whose two fail-closed fallbacks
are unreachable through the shipped registry — `scope-target-declared.test.ts` fails the
build if an `assigned` route omits `@ScopeTarget`, or declares one it does not need.
`tests/unit/interceptor-scope-target-extraction.test.ts` exercises them through a probe
module, the same shape `interceptor-platform-tenant-guard.test.ts` already uses for the
other defensive branch in that file. Both halves are load-bearing: the gate prevents the
situation, and the fallback makes it survivable if the gate is ever bypassed.
