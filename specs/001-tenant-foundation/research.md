# Phase 0 Research: Tenant Foundation & Audit Log

**Feature**: `001-tenant-foundation` | **Date**: 2026-08-19 | **Plan**: [plan.md](./plan.md)

Unlike `spec.md`, this document is allowed to name technology. Most of the stack
is fixed by the constitution's Technology Constraints section; what follows records
the decisions that were genuinely open, plus the non-obvious mechanics of the ones
that were not.

---

## D1 — A person may hold access to more than one tenant

**Decision**: Identity and membership are separate concepts. `Identity` is the
person as recognised by the external IdP and holds no tenant. `Membership` is the
access one identity holds within one tenant, carrying that tenant's archetype for
that person. One identity may hold many memberships; one tenant sees only its own.

**Rationale**: The constitution records this as Technical Debt item 8 and warns
*"This is not a later adjustment."* The asymmetry decides it. Building membership
now, at greenfield, is one join table plus a tenant selector at sign-in. Retrofitting
it means splitting `User`, backfilling, rewriting every code path that assumes
user→tenant, re-verifying every RLS policy, and migrating live data covered by
attorney-client privilege. The driving scenarios are not edge cases in the Mexican
legal market: a corporate client routinely retains more than one firm for different
specialties, and EP13 — where external users are projected to outnumber internal
users roughly 10:1 per tenant — serves exactly that population. Membership also
models the single-tenant case trivially, as one membership per identity; the
converse is impossible.

**Alternatives considered**:
- *One tenant per user.* Cheapest today, and initially the intuitive answer. Rejected on the migration asymmetry above.
- *Multi-membership only for portal archetypes.* Rejected: it still requires building the membership mechanism, so it saves none of the hard part, while adding a second identity model and permanent branching between them.

**Consequence for this slice**: the tenant-context mechanism cannot derive a tenant
from the identity. It receives an explicit tenant and must verify live membership
before activating it (FR-022).

---

## D2 — Audit retention is 24 months

**Decision**: Audit entries are retained 24 months, queryable by an authorized role
throughout, and removed past that window by a routine the application cannot invoke.

**Rationale**: LFPDPPP sets no period, but Principle VI requires retention defined
per entity before go-live, and the choice is a design input to this slice rather
than a later configuration: it decides whether the audit table needs partitioning
from the start, and SC-010's three-second target is measured against the full
retained history. 24 months covers two fiscal cycles and gives meaningful
evidentiary reach toward the firm's own clients without forcing a cold-archive tier
on day one.

**Alternatives considered**:
- *12 months.* Lowest storage cost. Rejected: a dispute or an ARCO request touching facts older than a year would find no evidence, which undercuts the stated rationale of Principle V.
- *60 months.* Aligns with Mexican accounting and fiscal conservation periods and gives the widest coverage. Rejected for now as it forces archival and cold-storage design into this slice, raising cost before the audit volume is known. Revisit once real volume is measured; the partitioning in D7 makes extending the window a configuration change rather than a redesign.

---

## D3 — Tenant activation happens once per transaction, and fails closed

**Decision**: A global NestJS middleware resolves the acting identity and the
requested tenant, verifies a live membership joins them, opens the request's
transaction, and issues `SET LOCAL app.tenant_id = <uuid>` on that same connection
before any business query runs. No business query filters tenant manually.

**Rationale**: `SET LOCAL` is scoped to the surrounding transaction, so it cannot
leak into a neighbouring request through a pooled connection — which is precisely
why the constitution prohibits Prisma and mandates Drizzle or direct `pg`. Doing
the membership check here, once, is what keeps FR-022 from becoming a per-endpoint
obligation.

**Predicate form**: every policy in this slice uses the null-safe predicate mandated
by **Constitution v1.3.0**, Technology Constraints, *PostgreSQL with RLS*:

```sql
tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
```

The bare `current_setting('app.tenant_id', true)::uuid` is prohibited there. The
constitution owns that rule and its rationale, and states it is not re-litigated per
feature, so it is not restated here.

The consequence this slice must handle: with no tenant context active, a query
returns zero rows and does **not** error. Tests must therefore distinguish that
silence from a genuinely empty tenant — see [quickstart.md](./quickstart.md) V3 and
V15.

---

## D4 — RLS shape, and the role configuration that actually enforces it

**Decision**: Every table holding tenant data carries `tenant_id uuid NOT NULL`.
Each has `ENABLE ROW LEVEL SECURITY` plus `FORCE ROW LEVEL SECURITY`, and one
policy applying to all commands with both `USING` and `WITH CHECK` carrying the
null-safe predicate required by **Constitution v1.3.0** (form given in D3).
`WITH CHECK` is not optional: without it a row can be *written* under a foreign
tenant id even though it could not be read back — and it must carry the null-safe
form too, not just `USING`.

**Rationale**: Constitution, derived from Principle II.

**The highest-risk item in the slice**: RLS is silently ignored for superusers and
for the table owner. If the application connects as either, the policies exist, the
isolation does not, and the tests pass. Therefore:

- Migrations run as a **migration/owner role**.
- The application connects as a **separate role that owns nothing**, is not
  superuser, and does not hold `BYPASSRLS`.
- `FORCE ROW LEVEL SECURITY` is added anyway, as defence in depth for anything that
  ends up running as owner.
- A startup assertion verifies the connected role's actual attributes rather than
  trusting configuration.

**Alternatives considered**:
- *Application-layer tenant filtering.* Prohibited by Principle II, whose whole point is that a forgotten filter must be harmless.
- *Schema-per-tenant or database-per-tenant.* Stronger isolation, but the constitution fixes shared schema with `tenant_id`, and per-tenant DDL turns every migration into an N-tenant fan-out.

---

## D5 — Append-only is a grant, not a code convention

**Decision**: The application role holds `INSERT` and `SELECT` on the audit table
and no `UPDATE` or `DELETE`. Retention deletion (D7) runs under a different role.

**Rationale**: FR-011 and Principle V require the prohibition to hold at the data
permission level. A repository class that merely omits an update method is
bypassable by the next developer; a missing grant is not. This is what makes
AS-04's *"fails at the data permission level"* literally true and testable — the
test asserts a permission error, not the absence of a method.

---

## D6 — The audit entry is written in the mutation's own transaction

**Decision**: A global NestJS interceptor over every mutation appends the audit row
inside the same transaction as the mutation. If the append fails, the transaction
rolls back and the mutation has no effect (FR-017).

**Rationale**: This is the only arrangement that makes FR-017 true without a
compensating mechanism. It is also the reason the audit log lives in the same
PostgreSQL database rather than in an external append-only sink.

**Trade-off accepted, and stated plainly**: an external sink — object storage with
object-lock, or a managed append-only stream — would give stronger immutability,
since a database superuser can still alter a table. In exchange it cannot
participate in the transaction, so FR-017 would degrade to best-effort and a
mutation could commit with no audit trail. Given that Principle V exists to produce
evidence of what happened, a guaranteed record with a weaker immutability boundary
is worth more than a stronger boundary that sometimes has no record. The residual
risk — a compromised superuser rewriting history — is noted rather than solved here;
periodic export to write-once storage is the natural follow-up and belongs in its
own slice.

---

## D7 — Monthly range partitioning carries retention and the latency target

**Decision**: The audit table is range-partitioned by timestamp, one partition per
month. Retention detaches and drops partitions older than 24 months. Queries carry a
time bound so the planner prunes.

**Rationale**: The application role cannot `DELETE` (D5), so retention cannot be a
mass delete — and a mass delete over two years of rows would be punishing anyway.
Dropping a partition is metadata work. Pruning is also what makes SC-010's
three-second first-page target reachable as history grows, and it makes extending
retention to 60 months a configuration change rather than a redesign.

---

## D8 — Recording a cross-tenant attempt without leaking the actor's other tenants

**Decision**: The attempt is recorded against the **targeted** tenant, so the
affected firm sees it in its own log. The entry names the resource, the timestamp,
the source and an opaque identity reference. It does **not** name the actor's home
tenant or any other tenant. The insert goes through a narrowly-scoped
`SECURITY DEFINER` function whose only capability is appending an audit row.

**Rationale**: Two constraints collide here and both matter.

First, mechanically: at the moment of the attempt, `app.tenant_id` is the actor's
active tenant, not the target. Appending to the target tenant's log would be blocked
by that table's `WITH CHECK`. Hence a dedicated definer function rather than
loosening the policy — the function is the single audited exception, and it can
insert nothing but audit rows.

Second, and less obvious: writing *"user X of firm A tried to read your case"* into
firm B's log would tell firm B that firm A exists, that X belongs to it, and that
the two are adjacent. Under FR-023 the set of tenants an identity belongs to is not
tenant-visible, and in this domain the mere fact that a given firm is adjacent to a
given matter can itself be privileged. So the entry is deliberately thin on the
actor side.

**Open point for legal review, not a blocker**: whether the *targeted* firm is
entitled to more actor detail than this, and whether the *acting* firm's log should
carry the fuller record. The mechanism supports either; the decision is the CC
technical lead's with counsel, and it changes only what is written into the columns.

---

## D9 — The platform administration context is a second role, not a privileged path

**Decision**: Provisioning, deactivation, plan assignment and limit configuration
run under a distinct database role on a distinct connection, exposed on an internal
surface that never passes through the tenant middleware (FR-009).

**Rationale**: These operations legitimately span tenants, which no tenant session
may do. Implementing them as a bypass flag inside the tenant mechanism would put a
"disable isolation" switch on the path that every business request traverses. A
separate role keeps the tenant path with no such switch to find.

**Deliberate narrowing**: the platform role's cross-tenant reach covers the tenant,
plan and audit tables only. It gets no access to business tables. Cross-tenant
administrative reach into case files is not required by any requirement in this
slice, and granting it would recreate the risk Principle II exists to remove.

**And now traced**: an interactive registry read under this role writes a
`tenant.registry_read` entry (FR-026, channel-gated like `audit.queried`). No conflict
with this decision — the narrowing bounds what the role *can* reach, the entry records
when it *did*. The reasoning lives in FR-026 and is not repeated here.

---

## D10 — Audit timestamps come from the database

**Decision**: The timestamp column defaults to the database's own clock at insert.
Application-supplied timestamps are rejected. (FR-020)

**Rationale**: FR-020 requires a single authoritative source. Container clocks drift
independently; ordering the log by a value each emitter chose for itself would make
the log unorderable in exactly the incident where ordering matters.

---

## D11 — Isolation tests run against real PostgreSQL as the real role

**Decision**: Vitest as the runner, Testcontainers to bring up a real PostgreSQL
instance, Supertest for HTTP-level paths. Isolation tests connect as the actual
non-owner application role.

**Rationale**: The constitution constrains the runner not at all, but it does put
tenant isolation on the non-negotiable blocking-coverage list. That effectively
picks the strategy: RLS cannot be exercised against a mock, an in-memory
substitute, or a connection made as the owner — every one of those makes an
isolation test that passes while proving nothing, which is the specific failure mode
the constitution warns about. Testcontainers also lets a test assert the connected
role's attributes, so the D4 misconfiguration is caught by a test rather than by an
incident.

**Alternatives considered**: *Jest* — NestJS's default and equally workable; Vitest
chosen for speed and for parity with the wider TypeScript tooling. Not a
constitutional matter, and cheap to revisit before the first test is written.

---

## D12 — CI proves every tenant table is covered

**Decision**: A build-blocking test queries the catalog for every table carrying a
`tenant_id` column and asserts each has row security enabled and at least one
policy. A new table without a policy breaks the build.

**Rationale**: Mandated by the constitution. It converts *"remember to add the
policy"* into a mechanical gate, which is the same reasoning behind D3, D5 and D6 —
each cross-cutting concern is enforced by construction rather than by discipline.

---

## D13 — Deactivation refuses activation and keeps the data

**Decision**: `Tenant.status` moves active → deactivated and never to deleted.
Activating a tenant context for a deactivated tenant is refused by the middleware,
which makes every downstream path inert without needing its own check. Records,
files and backups are retained; queued messages for that tenant are drained without
processing.

**Rationale**: FR-006. Refusing at activation rather than per resource is the same
single-choke-point pattern as D3.

**Open point deferred to slice 003**: a user holding a live session at the moment
their tenant is deactivated. Session revocation is slice 003's subject; this slice's
refusal at activation already denies the request, so nothing is left unguarded in
the meantime.

---

## Constitution `[PENDING]` items touching this slice

Neither is resolvable here; both are recorded so the plan does not appear to have
overlooked them.

| Pending | Effect on this slice |
|---|---|
| AWS region | Blocks production deployment, not design. Must appear in the firm's privacy notice under LFPDPPP, and backups must share the primary data's jurisdiction. |
| External IdP provider | No effect on this slice — no identity is built here. Required before slice 002, and the IdP is what supplies the `Identity` of D1. |
