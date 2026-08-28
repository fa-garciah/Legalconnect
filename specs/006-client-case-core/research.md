# Research — Clients, Cases & Case Teams

**Feature**: `006-client-case-core` | **Date**: 2026-08-27
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Ten decisions. D1–D3 are the substance of the slice; the rest are the ordinary shape
questions each new table raises, answered against precedent rather than from scratch.

Every claim about existing code below was read from the repository, not recalled.

---

## D1 — The `assigned` resolver: what it queries, and why it needs no cache

**Decision.** One `EXISTS` against `case_assignment`, on the transaction the request has
already opened:

```sql
SELECT EXISTS (
  SELECT 1 FROM case_assignment
   WHERE case_id = $1::uuid
     AND membership_id = $2::uuid
     AND unassigned_at IS NULL
)
```

`case_id` is the resolver's `targetId`; `membership_id` comes from
`principal.membershipId`, which `resolvePrincipal` already put on the active principal.
No tenant predicate is written: the transaction has `app.tenant_id` set, and
`case_assignment`'s RLS policy applies it.

**Why no cache, and why that costs nothing.** FR-011 requires unassignment to take effect
on the very next request. That is not a caching *policy* — it falls out of running the
query inside the request's own transaction. There is no session object to invalidate
because nothing is stored between requests. This mirrors `004/research.md` D7's finding
for the entitlement mapping: the read rides a transaction that is already open, so the
marginal cost is one indexed lookup, not a round trip.

The index is partial — `(case_id, membership_id) WHERE unassigned_at IS NULL` — so it
holds only live assignments and stays small as history accumulates.

**`MP`/`SA` short-circuit first (Decision 2).** The resolver returns `true` for those two
archetypes before touching the database. This is what makes Decision 2 "the same
mechanism, one question" rather than a second code path: the exemption is three lines
inside the resolver, not a branch in `decide()`.

**Alternatives considered.**

- *Cache the assignment set on the principal.* Rejected: it reintroduces exactly the
  staleness FR-011 forbids, and 004 already refused the same shortcut for entitlements.
- *Push the check into RLS on the case table.* Rejected: RLS would make the row
  invisible, which is right for the list read (D3) but wrong for the single-case read —
  the module could no longer distinguish "refused by scope" from "no such row" for its
  own audit trail, and `decide()` would never see a `scope` refusal to record.

---

## D2 — How the case id reaches the resolver: the `targetId` gap

**This is the one finding that changes the plan's file list.**

`ScopeRequest` has carried a `targetId` field since 004 shipped. `AuthorizationInterceptor`
sets it to `null` unconditionally
([interceptor.ts:87](../../backend/src/common/authz/interceptor.ts#L87)), with a comment
explaining why that was correct at the time:

> Neither of today's two `self`-scoped routes names a target id … `null` is the correct,
> and only, value until a `self`-scoped capability names one.

That was true for 004 and stayed true for 017, whose three rows are all `tenant`-scoped.
It stops being true here. **No `assigned` capability can function until the interceptor
learns to populate this field.**

**Decision.** A companion decorator to `@Capability()`, in the same file:

```ts
@Patch(':caseId/status')
@Capability('case.change_status')
@ScopeTarget('caseId')          // names the route param carrying the scoped entity's id
```

`AuthorizationInterceptor` reads the metadata, pulls that param off the request, and puts
it on `ScopeRequest.targetId`. A route whose capability declares `assigned` scope and
carries no `@ScopeTarget` is a **build-time** failure, asserted by an extension of the
existing `capability-declared-everywhere.test.ts` — the same posture 004 took for a route
with no `@Capability` at all.

**Why a decorator rather than a convention.** Reading `request.params.id` by convention
would work for four of this slice's routes and silently produce `undefined` for the fifth
the day someone names a param differently. `undefined` would make the resolver answer
`false`, which refuses correctly — and therefore hides the bug behind a plausible refusal
until someone reports "I can't open my own case." An explicit declaration fails loudly at
build time instead.

**Consequence for the spec.** FR-013 says the resolver is supplied "without editing 004's
own files." That holds for `scope.ts` and for `decide()`; it cannot hold for
`interceptor.ts`. `plan.md` Open Item 1 requests the amendment rather than assuming it.

**Alternatives considered.**

- *Give the resolver a request handle.* Rejected: resolvers are module-scoped singletons
  registered in a plain `Map`, deliberately framework-free so 004's unit suite can call
  them with no container. Threading a request through would undo that.
- *Have the controller call the resolver itself.* Rejected outright — FR-013's "no second
  mechanism," and it would put an authorization decision outside the single decision point
  `004/research.md` D2 exists to establish.

---

## D3 — The case list filters; it does not scope

**Decision.** `case.read_list` declares `tenant` scope. Assignment filtering happens in
the SQL of the list query, as a join against live `case_assignment` rows, skipped
entirely for `MP`/`SA`.

**Why this is forced, not chosen.** `ScopeResolver.resolve()` returns `Promise<boolean>`
and `decide()` turns `false` into `{ permitted: false, reason: 'scope' }`
([decide.ts:66](../../backend/src/common/authz/decide.ts#L66)). There is no third outcome
meaning "permit with fewer rows." An `assigned`-scoped list capability would therefore
**refuse** a caller with no assignments — while spec US3 scenario 5 requires them to
receive an empty list. The two cannot both hold, so the list read cannot be
`assigned`-scoped. `spec.md` states this before its requirements; this is the same
finding recorded at the design layer.

**Where the filter lives: SQL, not application code.** The rows must be excluded before
the page boundary, or a page of 50 becomes a page of 7 after filtering and `nextCursor`
lies about what follows. One query, one `EXISTS` sub-clause, `limit + 1` for the existence
proof — the shape `common/http/pagination.ts` already imposes and 017's directory read
already uses.

**Not RLS.** A policy on the case table would hide unassigned cases from the single-case
read too, and D1 explains why that breaks the refusal path. Filtering belongs to this one
query, not to the table.

---

## D4 — `case` is a reserved word; the table is `case_file`

**Decision.** Table name `case_file`. The entity stays `Case` in the spec, the API path
stays `/tenant/cases`, and the TypeScript type stays `Case`.

**Why.** `CASE` is a reserved keyword in PostgreSQL. `CREATE TABLE case (...)` is a syntax
error. It can be quoted — `"case"` — but then every hand-written migration, every RLS
policy, every raw `sql` template and every `COMMENT ON TABLE` in this codebase's style
must quote it, and the first one that forgets fails at runtime rather than at review. This
repo writes its migrations by hand (`0000`–`0022`), so that cost is paid continuously.

`case_file` also maps cleanly onto *expediente*, the term the domain and the prototype
already use, and onto `file_number`, the column the spec already names.

**Alternatives considered.**

- *Quote `"case"` everywhere.* Rejected for the reason above — a persistent papercut with
  a runtime failure mode.
- *`matter`.* A good legal term and genuinely tempting, but the spec, the catalog stories
  (`US01-EP02-CSM-CreateNewCase`) and the API all say "case," and `matter_type` is already
  a different table in this same slice. Two things called `matter` invites exactly the
  confusion the rename was meant to avoid.

---

## D5 — Assignment history: a partial unique index, not application logic

**Decision.** `case_assignment` keeps every row. Unassignment sets `unassigned_at`.
Uniqueness of the *live* assignment is a partial index:

```sql
CREATE UNIQUE INDEX case_assignment_live_unique
  ON case_assignment (case_id, membership_id)
  WHERE unassigned_at IS NULL;
```

This is 017's `position_tenant_active_name_unique` pattern applied to a different pair of
columns, for the same reason: the constraint that must hold is about *live* rows, and
history must stay reusable. It also makes the spec's "assigned twice" edge case a database
refusal rather than a read-then-write race two concurrent callers could both win — the
same argument `ProvisionService` already makes for RFC uniqueness.

**No DELETE grant** on `case_assignment`, for any role. FR-012's "never hard-deleted" is
the absent grant, exactly as 017 did it for `position` and `directory_entry`.

---

## D6 — File numbers are supplied, uniqueness is a per-tenant index

**Decision.** The caller supplies `file_number`. No format is imposed. Uniqueness:

```sql
CREATE UNIQUE INDEX case_file_tenant_file_number_unique
  ON case_file (tenant_id, lower(trim(file_number)));
```

Not partial — unlike a position name, a file number stays taken after a case closes.
Reusing a closed matter's number would corrupt the firm's own records.

**Why supplied rather than generated.** The spec's Assumptions already fix this, and the
edge case it answers ("file number collision within a tenant") only exists for a value the
caller controls. Firms carry existing numbering conventions — `EXP-2026-0001`, a bare
sequence, a per-practice-area prefix — and an imposed scheme fights every one of them.

**On the plan draft's Open Item 3** ("file number format — `EXP-2026-0001` vs. a bare
sequence"): there is nothing left to decide. The system stores a string and enforces
uniqueness; the format is the firm's. Recording it as closed rather than deferring it.

**Collision handling** follows `ProvisionService`'s precedent exactly: catch the database
unique violation and map it, rather than checking first. A read-then-write passes a
sequential test and still lets two concurrent callers both succeed.

---

## D7 — The three catalogs extend the provisioning transaction 017 already extends

**Decision.** `case-catalog.seed.ts` mirrors `directory/position-catalog.seed.ts`
verbatim in shape, and `ProvisionService.provision()` calls it on the same transaction it
already calls `seedDefaultPositionCatalog` on.

This is what FR-021 asks for — one provisioning operation, four catalogs — and it inherits
017's own guarantee for free: because it is the same transaction, a provisioning that
fails partway leaves neither a tenant nor a catalog behind.

**Default seeds**, firm-agnostic per Principle III and editable on day one:

| Catalog | Seed |
|---|---|
| `case_status` | En Proceso, En Espera, Concluido — the three `US07-EP02-CSM-MonitorCaseStatus` names |
| `matter_type` | Civil, Mercantil, Laboral, Familiar, Penal, Amparo |
| `venue` | *empty* — see below |

**Venue seeds empty, deliberately.** Case status and matter type are near-universal across
Mexican practice. Courts are not: a firm's venues depend on its jurisdiction and its
caseload, and any list this product ships would be both wrong for most firms and a
statement about where they practise. An empty venue catalog is honest, and `venue` is
optional on a case (FR-005), so a firm can open cases from day one without touching it.
This is the same reasoning `017/research.md` D2 used to keep its seed small.

**Grants.** `lc_platform` needs `INSERT` and nothing else on all three tables, matching
`0022_position_platform_seed.sql`. Not `SELECT` — the seed uses no `RETURNING` and no
`ON CONFLICT` for precisely that reason, and the tenant was created moments earlier in the
same transaction, so it has no catalog to conflict with.

---

## D8 — Audit: twelve actions, one of them channel-gated

**Decision.** Twelve new entries in the action vocabulary and its `CHECK` constraint. Ten
were settled here in Phase 0; `client.reactivated` and `case_catalog.entry_updated` were
added by the clarification session of 2026-08-27 (FR-004a, FR-008a):

| Action | Gated? | Notes |
|---|---|---|
| `client.created` | no | |
| `client.updated` | no | carries previous/new |
| `client.deactivated` | no | |
| `client.reactivated` | no | FR-004a — its own action, so the round trip is legible |
| `case.created` | no | |
| `case.status_changed` | no | carries previous/new, `004/FR-009`'s shape |
| `case.team_member_assigned` | no | subject is the membership, not the case |
| `case.team_member_unassigned` | no | also written by revocation closure (FR-012a) |
| `case.read` | **yes** | FR-023 |
| `case_catalog.entry_created` | no | `target_entity` names which catalog |
| `case_catalog.entry_updated` | no | `is_closing` only; `case_status` only (FR-008a) |
| `case_catalog.entry_retired` | no | |

**Three catalog actions, not nine.** One set covering all three catalogs, with
`target_entity` distinguishing them — matching the single capability pair (rows 34–35)
the spec gives them. Nine actions for three structurally identical tables would be
vocabulary growth with no read that benefits from it.

**Revocation-driven unassignment reuses `case.team_member_unassigned`** rather than adding
a distinct action. The event is the same — a person came off a matter — and the entry's
actor already separates the two paths: a deliberate unassignment carries the `MP` or `CM`
who did it, a revocation cascade carries whoever revoked the membership, and the
neighbouring `membership.revoked` entry in the same transaction names the cause. A separate
action would duplicate what the trail already says.

**Why `case.read` is gated.** Principle V requires recording *access* to cases, not only
modification — which the spec draft this slice came from had missed. But an ungated read
action would let a monitoring job inflate the log it watches, which is precisely why 001
gates `audit.queried` and `tenant.registry_read`. The gate mechanism already exists in
`appendAuditEntry`, keyed off `source.channel`; this action simply joins
`CHANNEL_GATED_ACTIONS`.

**The list read writes nothing**, per the spec's Resolved Decisions. It returns only rows
the caller is already scoped to and discloses no matter's contents.

---

## D9 — Client deactivation blocks new cases; it does not cascade

**Decision.** `client.status` gates *creation* only. Existing cases keep resolving a
deactivated client with no change in behaviour, and the check lives in `CaseService`, not
in a foreign-key rule.

**And the status moves both ways** (FR-004a, clarified 2026-08-27). Withdrawal is reversible
under the same capability that performs it. An earlier revision of this document left
deactivation terminal by omission; that made a mis-click permanent, with a duplicate client
record as the only remedy — and merging duplicates is out of scope, so the duplicate would
have been permanent too. Restoration is one route, one audit action and no new matrix row.

FR-004 and FR-008 pull in opposite directions if read carelessly — one says a deactivated
client is unavailable for new cases, the other says deactivation must not cascade. Both
hold because they govern different moments: creation-time validation versus read-time
resolution. A database-level constraint could not express that distinction; a service
check can, and the contract states the refusal explicitly.

**No DELETE grant** on `client`, so FR-003's "never hard-deleted" is structural rather
than a rule someone must remember.

---

## D10 — What this slice does *not* change

Recorded because three of these were listed as work in the plan draft, and finding they
were already done is a result worth keeping.

| File | Draft said | Actually |
|---|---|---|
| `common/authz/scope.ts` | MODIFIED | **Untouched.** `registerScopeResolver()` is exported so a downstream module calls it from `onModuleInit`. Its header says so in as many words: "no file here is edited to do it." |
| `common/authz/refusal.ts` | implied work for the 404 | **Untouched.** `ASSIGNED_SCOPE_REFUSAL` already returns `ResourceNotFound`, written as a named constant so this slice's decision would be "a one-line change" — and the line is already the one we want. Accepting Decision 4 costs zero code. |
| `frontend/src/feedback/refusal-bucket.ts` | classifier "carries a `scope`-bucket type with nothing to exercise it" | **Untouched, and the premise is wrong.** `RefusalBucket` is `'opaque' \| 'role' \| 'entitlement-feature' \| 'entitlement-limit'` — there is no `scope` variant. 016a's research D3 explicitly left it unbuilt. The classifier already maps `not_found` → opaque, which is exactly what an `assigned` refusal needs, so 016a's Scenario 4 and 6 become testable with **no frontend change at all**. |
| `common/authz/decide.ts` | — | Untouched. It already handles a registered `assigned` resolver; only the registration was missing. |

**What this means for sequencing.** The end-to-end opacity story (FR-016, FR-017, SC-002,
SC-013) is deliverable the moment the resolver and the `targetId` seam exist. It needs no
frontend PR, no refusal-mapping PR, and no coordination with 016a.

---

## Open questions carried to `plan.md`

None from research. The three items `plan.md` carries are governance
(the FR-013 amendment, the catalog PR, Decision 4's signer), not technical unknowns.
