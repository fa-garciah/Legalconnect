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
travels. `lc_platform`'s own reach is narrowed at the grant level to `tenant`,
`plan` and `audit_event` — it cannot read or write a single business table,
now or after any future migration, because nothing grants it that access. If
a future slice genuinely needs a second cross-tenant administrative surface,
model it the same way: a separate role, a separate connection, narrowed
grants — not a parameter that skips the tenant middleware.

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
