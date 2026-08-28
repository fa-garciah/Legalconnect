# Why no business query filters tenant by hand

Read this before writing the first business table in slice 002 or later. It
explains a rule you'll notice by its absence: nowhere in this codebase does a
repository or service write `WHERE tenant_id = :activeTenant`. That omission is
the point, not an oversight to fix.

## The mechanism

Every tenant-facing request passes through `TenantContextInterceptor`
(`backend/src/common/tenant/middleware.ts`), registered globally in
`app.module.ts`. Before your handler runs, it has already:

1. Resolved the identity and the named tenant into a verified, live membership
   (`resolvePrincipal`, `backend/src/common/tenant/resolve.ts`).
2. Opened the request's database transaction.
3. Issued `SELECT set_config('app.tenant_id', '<uuid>', true)` on that same
   connection — transaction-scoped, so it cannot leak into a neighbouring
   request through the connection pool.

Every tenant-scoped table carries a PostgreSQL Row-Level Security policy of
this shape (the exact form the constitution mandates — see
`backend/drizzle/0005_rls.sql`):

```sql
USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
```

By the time your query reaches PostgreSQL, the database itself will not
return, nor accept, a row for any tenant other than the one already active.
This is why a query that FORGOT to filter tenant is not a bug that leaks data
— it is indistinguishable, at the row level, from a query that filtered
correctly.

## What this means for you, concretely

**Do not add `tenantId` to a `WHERE` clause "to be safe."** It changes
nothing about correctness (RLS already enforces it) and it actively hides the
one class of bug the isolation test suite exists to catch: if you write the
filter by hand and get it wrong, RLS is still there to save you and the
mistake goes unnoticed. If you never write the filter, RLS is the *only*
thing standing between a forgotten `WHERE` clause and a leak, which is exactly
why isolation is on the constitution's non-negotiable blocking-coverage list
(100% on `src/common/tenant/**` and `src/common/audit/**` — see
`backend/vitest.config.ts`).

**Do not build your own tenant-scoping helper that reads `req.tenantId` and
appends a filter.** That reintroduces the manual-filter problem one layer up.
Read the active tenant from `currentPrincipal()` only when you need its value
for something OTHER than scoping a query — an audit entry's actor, a log
line, a cache key prefix. Never to build a `WHERE` clause.

**A new tenant-scoped table needs three things, not one:**

1. A `tenant_id uuid NOT NULL REFERENCES tenant(id)` column.
2. `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`, and a policy using
   the null-safe predicate above, in both `USING` and `WITH CHECK`.
3. A grant for the application role (`lc_app`) — nothing is reachable by
   default; see `backend/drizzle/0006_grants.sql`'s closing comment.

Forgetting step 2 is exactly what
`backend/tests/integration/rls-coverage.test.ts` (T025) exists to catch: it
scans the catalog for every table carrying a `tenant_id` column and fails the
build if one has no active policy. It is not optional and it is not a
suggestion — a new migration that adds a tenant-scoped table without a policy
breaks CI.

## The one legitimate exception, and why it stays narrow

The platform administration surface (`PlatformSurface()`-decorated routes)
runs under a *different database role* (`lc_platform`) on a *different
connection*, never through `TenantContextInterceptor` at all (FR-009,
research.md D9). It is not a bypass flag inside the tenant path — there is no
"disable isolation" switch sitting on the route every business request
travels. `lc_platform`'s own reach is narrowed at the grant level, and every
extension to it since 001 has been *narrower* than the three grants 001 started
with. As of slice 006 it holds, in full:

| Table | Privileges | Added by |
|---|---|---|
| `tenant` | INSERT, SELECT, UPDATE | 001 |
| `plan` | INSERT, SELECT, UPDATE | 001 |
| `audit_event` | INSERT, SELECT | 001 |
| `membership` | SELECT | 002 — a read-only existence check |
| `invitation` | INSERT | 002 — the bootstrap seed |
| `position` | INSERT | 017 — provisioning writes the default catalog |
| `case_status`, `matter_type`, `venue` | INSERT | 006 — same, three more catalogs |

Read the shape of that list, not just its length. The four newest grants are
**INSERT-only**: provisioning may bring a firm's starting vocabulary into
existence and can never read it back, edit it, or remove it. And it holds
**nothing at all** on `client`, `case_file` or `case_assignment` — registering a
firm's clients and opening its matters is the firm's own act. No case file, and
no tenant's membership roster, is reachable across firms. That this list must be
edited by hand to grow is the mechanism, not an inconvenience;
`tests/integration/platform-scope.test.ts` fails the build when it changes
without someone saying so. If
a future slice genuinely needs a second cross-tenant administrative surface,
model it the same way: a separate role, a separate connection, narrowed
grants — not a parameter that skips the tenant middleware.

## When authorization itself depends on RLS having already narrowed

Slice `006-client-case-core` introduced the first component whose *correctness as an
authorization check* rests on the mechanism above: the `assigned` scope resolver
(`src/modules/case-core/assigned-scope.resolver.ts`). It is worth reading once, because it
looks wrong to anyone who has not read this document.

The resolver answers "is this caller on this case's team?" with a single query, and that
query writes **no `tenant_id` predicate**:

```sql
SELECT EXISTS (
  SELECT 1 FROM case_assignment
   WHERE case_id = $1::uuid AND membership_id = $2::uuid AND unassigned_at IS NULL
)
```

Its absence is load-bearing, not an oversight. `currentTx()` is the transaction
`TenantContextInterceptor` already opened with `app.tenant_id` set, and
`case_assignment_own_tenant` applies it. Hand the resolver another firm's case id and the
sub-select matches zero rows, the resolver answers `false`, and the caller gets the same
`404` a nonexistent case gets — so **cross-firm case existence stays uninferable**. Adding
the predicate by hand would be harmless but would suggest RLS were not already doing it,
which is worse than the apparent omission. `assigned-scope-isolation.test.ts` asserts both
directions: zero rows under the wrong tenant, and a match under the right one, so the
`false` is isolation rather than a query that never matches anything.

Two consequences worth carrying into the next slice that adds a scope kind:

- **`case_assignment.tenant_id` is denormalised on purpose.** It could be reached through
  `case_file`, but then the RLS policy would need a join, and that join would sit on the
  authorization path of every scoped request. The column is written from the session
  setting rather than from the request, and `case-core-grants-lockdown.test.ts` asserts it
  always matches its case's tenant.
- **The resolver deliberately does not check whether the case exists first.** "No such
  case" and "not your case" both produce zero rows and the same `false`. Distinguishing
  them internally would create two code paths whose timing differs — a side channel that
  would undo the byte-identical refusal the 404 was chosen to provide.

## What "no context active" means, and why it's silent

A connection with no `app.tenant_id` set returns **zero rows**, not an error,
for every tenant-scoped query (Constitution v1.3.0; see
`backend/tests/integration/isolation/no-context.test.ts`, T036). This is
deliberate and it is the reason V3 in
[quickstart.md](../specs/001-tenant-foundation/quickstart.md) asserts *both*
that an active tenant sees its own rows *and* that no context sees none —
checking only the second would pass against a middleware that activates
nothing at all. If you are debugging a handler that mysteriously sees an
empty result set, check whether a tenant context is actually active before
suspecting the data.
