# Phase 0 — Research: Case Documents

**Feature**: `007-document-management` | **Date**: 2026-08-28
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Constitution**: v1.4.1

---

## D1 — Flat catalog, not a folder tree

**Decision.** `DocumentCategory` is a flat, tenant-wide catalog (`spec.md` FR-009–FR-012),
seeded at provisioning with a firm-agnostic default including "unclassified,"
immediately editable, retired-not-deleted. `US03`'s "organize by case and subfolder"
is satisfied by this shape.

**Rationale.** `006-client-case-core` already built the exact same shape three times —
`case_status`, `matter_type`, `venue` — each a `pgTable` with `id, tenant_id, name,
status, created_at, retired_at` and a partial unique index on
`(tenant_id, lower(trim(name))) WHERE status = 'active'`. This is a fourth instance of
an established, tested pattern, not a new one. A real per-case, user-authored folder
hierarchy (arbitrary depth, rename, move-with-contents, empty-folder states) has no
precedent anywhere in this product and is a materially larger and differently-shaped
build.

**Alternative rejected.** A real folder hierarchy. Rejected per the above — this
resolves `spec.md`'s Open Question 1 / now Decision 1.

---

## D2 — Download rights equal read rights

**Decision.** Row 38 (download) grants the identical archetype set as row 37
(read/preview): `MP`, `AA`, `PL`, `CM`, `SA`. No narrower grant.

**Rationale.** No catalog story or prior slice narrows download relative to read, and
this codebase's own precedent (`017`'s Decision 2, `006`'s Decision 2) consistently
declines to invent a restriction with no stated reason behind it. If a real
"view but don't export" control turns out to matter, it is a one-row Capability Matrix
change later, following the same `004/FR-021` discipline every other slice already
uses — not a reason to hold up this slice guessing at a policy nobody has stated.

**Alternative rejected.** A narrower download grant (e.g., `PL` excluded). Rejected —
resolves `spec.md`'s Open Question 2 / now Decision 2.

---

## D3 — Storage total is a maintained counter, not computed on every check

**Decision.** Each tenant's consumed storage is a running total maintained
transactionally alongside every upload and (per FR-015) never decremented by
withdrawal — not a value computed by `SUM(size) FROM document` on every upload
request.

**Rationale.** `PlanLimits.storageBytes` already exists in
`backend/src/common/db/schema.ts` (004's own design), and `004`'s
`evaluateEntitlement()` / `decide()` already carry a `usage`-vs-`limit` comparison
seam — but **no capability in the registry today declares a `limit` key, and
`AuthorizationInterceptor` never populates `usage` when it calls `decide()`**. The
mechanism was built and tested by 004; nothing has ever wired a real consumer to it.
This slice is that first wiring, not a reuse of an existing, exercised pattern — stated
plainly here so `tasks.md` sizes it as new work, not as "connect an existing check."

A running total avoids re-summing every document row on every upload (which would
scale with the tenant's total document count, not with the single upload being
checked) and is what makes D4's reservation atomic: a single row's counter can be
incremented inside the same transaction that reserves headroom, where a `SUM()` query
would need a lock across the whole `document` table to be equally race-safe.

**Alternative rejected.** Summing document sizes live on every check. Rejected: scales
with tenant history instead of the operation at hand, and does not compose with D4's
reservation step without a broader lock.

---

## D4 — The check and the reservation are one atomic statement, not two

**Decision.** An upload's storage-limit check and its counter increment happen in a
**single SQL statement** — a conditional `UPDATE`:

```sql
UPDATE tenant
   SET storage_bytes_used = storage_bytes_used + $sizeBytes
 WHERE id = $tenantId
   AND storage_bytes_used + $sizeBytes <= $limitBytes
RETURNING id
```

Zero rows returned means the reservation was refused — the caller maps that to
`LimitReached`, naming the plan's configured ceiling (never a value read back from the
database). Only once this statement has committed does the application write the
object to S3; a failed S3 write is rolled back by a compensating action (delete the
metadata row, decrement the counter) so no orphaned reservation survives a failed
upload.

**Rationale, corrected from this decision's own first draft.** The first version of
this decision described "the check and the increment happen in the same database
transaction" — reading the current total, deciding whether to permit the upload, and
only then running a separate `UPDATE` to increment it. **That is not what "same
transaction" actually guarantees**, and `tests/integration/storage-limit-race.test.ts`
caught it directly: two concurrent uploads, each individually under the remaining
headroom, both returned `201` instead of one being refused. Postgres's row lock on
`UPDATE` genuinely serializes two writers against the *same statement* — but a plain
`SELECT` run *before* that `UPDATE` cannot see what a concurrent, not-yet-committed
transaction is about to write, so both transactions read the identical pre-update
total, both pass their own check, and both commit. "Same transaction" was doing no
work here; the two statements were still a check-then-write race, just wrapped in a
container that sounded atomic without being so.

Folding the limit into the `UPDATE`'s own `WHERE` clause is what actually closes the
race: the second writer's row lock forces its `WHERE` clause to evaluate against the
FIRST writer's already-committed total, not a value either of them read earlier. This
is the same principle `case_assignment_live_unique`'s partial index (006) and
`position_tenant_active_name_unique`'s partial index (017) already use — push the
invariant into a single statement the database itself makes atomic, rather than
trusting an application-level sequence of separate statements to stay consistent under
concurrency.

**Alternative rejected (this decision's original approach).** `SELECT` the current
total, decide in application code, then `UPDATE` separately — even inside one
transaction. Rejected because it is exactly the race described above, proven by the
test this decision's own task (T018) required writing.

**Alternative rejected (locking instead).** `SELECT ... FOR UPDATE` to lock the
tenant row before checking, then a separate `UPDATE`. Would also close the race, but
needs two statements and an explicit lock where the conditional `UPDATE` needs
neither — the same reasoning 017's research.md D5 gives for preferring a database
constraint over an application-level lock where one is available.

---

## D5 — Preview strategy by file family

**Decision.** Inline preview renders natively for PDF and common image formats
(client-side, in `frontend/src/app/documents/PreviewPane/`, following `016a`'s
existing `frontend/src/feedback/` state-machine conventions for the
loading/error/empty transitions around it). Common Office formats (`.docx`, `.xlsx`,
`.pptx`) go through a server-side conversion step to a previewable format before
reaching the same pane. Any file type outside both families falls to `spec.md` Story 2
scenario 4's "no supported inline preview" state — the person is told plainly, and
download remains available per D2.

**Rationale.** PDF and images are the only formats a browser can render natively
without a conversion step, and are almost certainly the bulk of what a firm uploads
(contracts, evidence, correspondence scans). Office formats are common enough in legal
practice to be worth a conversion path rather than an immediate "no preview," but that
conversion is real infrastructure (a service or a library invocation per request) —
sized as a real cost in `plan.md`'s Open items, not assumed free. Everything else
(archives, unusual formats) correctly falls to the state `spec.md` already specifies
for exactly this case, rather than inventing a third bucket.

**Alternative rejected.** Universal server-side conversion (render everything through
one pipeline, including PDF/images). Rejected: pays a conversion cost for formats the
browser already renders for free, for no benefit this spec asks for.

---

## D6 — Tenant isolation for a storage layer RLS cannot reach

**Decision.** Four mechanisms together, none of them a second authorization system:

1. **Object keys are namespaced by tenant**: every S3 key is prefixed
   `tenant/{tenantId}/case/{caseId}/{documentId}`, so a key alone — even if it
   leaked — cannot be guessed into a cross-tenant path without already knowing another
   tenant's UUID, and even then resolves to nothing without a valid credential for it.
2. **`common/storage/object-store/` is the ONLY module permitted to hold storage
   credentials or import the AWS SDK.** No controller, service, or repository outside
   it ever touches S3 directly — mirroring `common/tenant/`'s role as the single
   chokepoint 001 established for RLS context (Principle II's "one seam, not one check
   per endpoint," applied to the layer RLS cannot reach).
3. **A pre-signed URL is issued only after FR-005's `assigned`-via-case scope check has
   already passed**, is single-object and time-limited, and is never a substitute for
   that check — only a consequence of having passed it. The scope check runs through
   006's existing `AssignedScopeResolver` (`backend/src/modules/case-core/
   assigned-scope.resolver.ts`), which already resolves `(membership, caseId)` against
   `case_assignment` under RLS, with `MP`/`SA` bypassing unconditionally (006's
   Decision 2) — this slice registers no second resolver (FR-005/FR-008).
4. **No bucket-wide or long-lived credential is ever reachable by a request handler.**
   The object-store module holds short-lived, scoped credentials (Dependencies and
   Infrastructure: "No long-lived credentials... short-lived roles only") and issues
   only single-object pre-signed URLs outward.

**Verification.** A dedicated isolation suite
(`tests/integration/isolation/object-store/`) attempts to obtain a tenant-B pre-signed
URL from a tenant-A session and must fail every time — the same falsifiable shape
001's RLS tests established for Postgres rows, applied to an object store that has no
row-level policies of its own to test.

**Rationale.** Principle II names "file" explicitly alongside query, job, cache, queue
and log as a covered surface. RLS enforces isolation for every one of those *except*
file, because S3 has no concept of a row-level policy. This is the first slice where
that gap is live rather than theoretical, and the Constitution Check in `plan.md` is
conditional on this decision being implemented exactly as stated, not approximated.

**Alternative rejected.** Trusting an unsigned, permanent S3 URL protected only by key
obscurity. Rejected outright: "security by unguessable URL" is not a tenant-isolation
guarantee, and Principle II admits no such exception for schedule or convenience.
