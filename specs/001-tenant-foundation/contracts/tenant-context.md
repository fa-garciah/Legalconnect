# Contract: Tenant Context

**Not an HTTP surface.** This is the internal mechanism every tenant-scoped request
and job passes through, implemented as global NestJS middleware. It is the load-
bearing piece of Principle II, and the reason
[D1](../research.md#d1--a-person-may-hold-access-to-more-than-one-tenant) had to be
decided before this plan could be written.

---

## What it requires

Per request or job, three things:

| Input | Source | Note |
|---|---|---|
| Verified identity reference | Slice 002/003 | This slice authenticates nothing; it receives an already-authenticated principal |
| Explicit target tenant | Request header, or the job message envelope | **Never derived from the identity.** Per FR-021 an identity may hold several memberships, so there is no single tenant to derive |
| Live membership joining them | `membership` table (slice 002); fixtures until then | Must be `status = 'live'`, and the tenant must be `status = 'active'` |

Until slice 002 exists, identity and membership are supplied by test fixtures. The
contract is written against the final shape so slice 002 plugs in without changing
it.

## What it guarantees

1. **Exactly one tenant is active for the whole transaction.** FR-022. Not per query, not per handler — per transaction, so a handler cannot switch tenants midway.
2. **`SET LOCAL app.tenant_id` is issued on the same connection and transaction as every subsequent query.** This is the mechanic the constitution's Drizzle mandate exists to preserve; `SET LOCAL` dies with its transaction and cannot leak into the next request through the pool.
3. **No business query filters tenant by hand.** Isolation is the data layer's job ([D4](../research.md#d4--rls-shape-and-the-role-configuration-that-actually-enforces-it)).
4. **It fails closed.** If no tenant is activated, the null-safe predicate required by **Constitution v1.3.0** yields `NULL`, no row is visible, and nothing raises. Validated by [quickstart.md](../quickstart.md) V15, which the constitution requires for every tenant-scoped table.

## Failure modes

| Condition | Outcome | Audit |
|---|---|---|
| No identity | Refused, no tenant activated | none |
| No tenant named | Refused | none |
| No live membership joining identity and tenant | Refused as a cross-tenant access attempt (FR-022, US1 scenario 7) | `tenant.cross_access_attempted` against the **named** tenant |
| Membership `revoked` | Same as above | same |
| Tenant `deactivated` | Refused ([D13](../research.md#d13--deactivation-refuses-activation-and-keeps-the-data)) | none — the tenant is not operating, and writing to its log on every stray request would be a denial-of-service surface on its own audit volume |
| Resource reached belongs to another tenant despite valid activation | RLS returns nothing; handler answers `404` | `tenant.cross_access_attempted` against the targeted tenant |

The distinction in the last two rows matters for testing. The membership check
catches the attempt *before* any query runs; RLS catches whatever gets past it. Both
paths must be tested, because the first is application code that can regress and the
second is the guarantee that survives when it does.

## The failure that must be tested explicitly

An unset tenant context does not raise — it looks like an empty database
([D3](../research.md#d3--tenant-activation-happens-once-per-transaction-and-fails-closed)).
That is correct fail-closed behaviour and a genuine testing hazard: a broken
middleware and a genuinely empty tenant produce the same observable result. Tests
must therefore assert *both* that a foreign row is invisible **and** that the
tenant's own row is visible in the same scenario. A test that only asserts the first
passes against a middleware that activates nothing at all.

The complementary case — no context active at all, on every tenant-scoped table,
returning zero rows and **no error** — is mandated by Constitution v1.3.0 and covered
by [quickstart.md](../quickstart.md) V15. The two together are what make the
predicate form verifiable, since a catalog check can confirm a policy exists but not
that it is null-safe.

## Asynchronous work

The tenant travels in the message envelope, not in the payload, and the worker runs
the identical activation path — same membership verification, same `SET LOCAL`,
inside the job's transaction. FR-005 puts jobs, queues, caches, files, logs and
backups under the same isolation as requests, and the constitution requires a
cross-tenant leak test for every async job, not only every endpoint.

Cache keys are prefixed with the tenant id. A cache read that omits the prefix must
miss rather than return a foreign entry — the same fail-closed shape as the database
layer.

## The one sanctioned exception

Recording a cross-tenant attempt has to append to the **targeted** tenant's log while
a **different** tenant is active, which that table's `WITH CHECK` would refuse. It
goes through a narrowly-scoped `SECURITY DEFINER` function that can insert audit rows
and nothing else
([D8](../research.md#d8--recording-a-cross-tenant-attempt-without-leaking-the-actors-other-tenants)).

The entry deliberately omits the actor's home tenant. Telling firm B that *"a member
of firm A tried to read your matter"* would disclose that firm A exists and is
adjacent to that matter, which is itself capable of being privileged, and would
breach FR-023. The function is the only place in the system permitted to write
outside the active tenant, and it must be covered by a test asserting it can do
nothing else.

## Startup assertion

Before serving traffic the application asserts its own database role is not a
superuser, owns no tables, and lacks `BYPASSRLS`. If any is false the process
refuses to start.

This is not defensive padding. It is the single misconfiguration that leaves every
policy in place, every isolation test green, and no isolation whatsoever — and the
constitution calls it out by name for that reason.
