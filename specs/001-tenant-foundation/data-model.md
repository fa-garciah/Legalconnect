# Phase 1 Data Model: Tenant Foundation & Audit Log

**Feature**: `001-tenant-foundation` | **Date**: 2026-08-19 | **Research**: [research.md](./research.md)

Three entities are owned by this slice. Two more are named at the boundary because
[D1](./research.md#d1--a-person-may-hold-access-to-more-than-one-tenant) decided
their shape, but they are built in slice 002.

Types are PostgreSQL. Isolation mechanics follow
[D4](./research.md#d4--rls-shape-and-the-role-configuration-that-actually-enforces-it).

**Every RLS policy below uses the null-safe predicate mandated by Constitution
v1.3.0**, Technology Constraints, *PostgreSQL with RLS* — in both `USING` and
`WITH CHECK`:

```sql
-- tenant-scoped tables (audit_event, and membership in slice 002)
tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid

-- the tenant table itself, which filters on its own primary key
id         = NULLIF(current_setting('app.tenant_id', true), '')::uuid
```

The bare `current_setting(...)::uuid` form is prohibited by that rule. The
constitution owns the reasoning; it is not repeated here.

---

## Tenant

The contracted firm, and the root of the isolation boundary.

| Field | Type | Constraints |
|---|---|---|
| `id` | `uuid` | PK, generated |
| `name` | `text` | NOT NULL, length ≥ 1 after trim |
| `rfc` | `text` | NOT NULL, **UNIQUE**, 12 or 13 characters, uppercase, matching the RFC shape for a moral or physical person |
| `plan_id` | `uuid` | NOT NULL, FK → `plan.id` |
| `status` | `tenant_status` | NOT NULL, default `active`; enum `('active','deactivated')` |
| `created_at` | `timestamptz` | NOT NULL, database default |
| `deactivated_at` | `timestamptz` | NULL; NOT NULL exactly when `status = 'deactivated'` (check constraint) |

**Validation rules**
- `rfc` unique across all tenants — satisfies FR-007 and AS-01 scenario 2. Uniqueness is a database constraint, not an application pre-check, so two concurrent provisionings with the same RFC cannot both succeed (edge case in `spec.md`).
- Provisioning is one transaction: no partially created tenant can exist (US3 scenario 5).
- No `DELETE` grant on this table for any role. FR-006 is enforced by absence of the grant, the same reasoning as [D5](./research.md#d5--append-only-is-a-grant-not-a-code-convention).

**State transitions**

```
active ──deactivate──> deactivated
```

One-way. There is no transition to a deleted state, and no reactivation path is
specified in this slice.

**Isolation note — this table is the exception worth flagging.** Every other
tenant-scoped table filters on its own `tenant_id`. This one filters on `id`,
because the row *is* the tenant — its policy compares `id` to the tenant setting
using the same null-safe form (predicate given above), which means a tenant session
can read exactly its own row and no other. Consequence:
the CI check in [D12](./research.md#d12--ci-proves-every-tenant-table-is-covered)
cannot find this table by looking for a `tenant_id` column. The check must therefore
work from an explicit registry of tenant-scoped tables, verified to include every
table with a `tenant_id` column *plus* the registered exceptions — otherwise the one
table whose exposure matters most is the one the guard silently skips.

---

## Plan

An iguala tier with its entitlements and quantitative limits. A global catalog, not
tenant data — it carries no `tenant_id` and no RLS policy.

| Field | Type | Constraints |
|---|---|---|
| `id` | `uuid` | PK, generated |
| `code` | `plan_code` | NOT NULL, UNIQUE; enum `('esencial','profesional','premium')` |
| `name` | `text` | NOT NULL |
| `limits` | `jsonb` | NOT NULL; quantitative limits — users, storage bytes, monthly CFDI issued |
| `entitlements` | `jsonb` | NOT NULL; feature key → boolean |
| `updated_at` | `timestamptz` | NOT NULL |

**Validation rules**
- Exactly three rows, one per `code`. `code` is immutable once created; `limits` and `entitlements` are mutable, which is what satisfies FR-004 and FR-016 without a deployment.
- The application role holds `SELECT` only. Mutation belongs to the platform administration context ([D9](./research.md#d9--the-platform-administration-context-is-a-second-role-not-a-privileged-path)).
- Nothing in this slice reads `entitlements`. Enforcement arrives in slice 004; the column exists now so the mechanism has a home, per the constitution's Tier Entitlements rationale.

---

## AuditEvent

One append-only record of one action. Range-partitioned monthly on `occurred_at`
([D7](./research.md#d7--monthly-range-partitioning-carries-retention-and-the-latency-target)).

| Field | Type | Constraints |
|---|---|---|
| `id` | `uuid` | generated |
| `occurred_at` | `timestamptz` | NOT NULL, **database-generated** default; partition key |
| `tenant_id` | `uuid` | NOT NULL, FK → `tenant.id` |
| `action` | `text` | NOT NULL, constrained to the vocabulary below |
| `actor_identity_id` | `uuid` | NULL when the actor is the system or the platform context |
| `actor_membership_id` | `uuid` | NULL as above |
| `target_entity` | `text` | NOT NULL |
| `target_id` | `uuid` | NULL when the action has no single target |
| `source` | `jsonb` | NOT NULL; origin as observed by the system — channel (`interactive`/`automated`), coarse network origin, client class |
| `metadata` | `jsonb` | NOT NULL, default `{}`; action-specific detail |

**Primary key**: `(occurred_at, id)`. A partitioned table's primary key must contain
the partition key, so `id` alone cannot be it. `id` still satisfies FR-018's
individual addressability, and the pair keeps two entries in the same instant
distinct.

**Validation rules**
- `occurred_at` comes from the database, never from the caller ([D10](./research.md#d10--audit-timestamps-come-from-the-database)). FR-020.
- No `UPDATE` or `DELETE` grant for the application role. FR-011, and what makes AS-04 assert a permission error rather than a missing method.
- `source` and `metadata` carry no end-client personal data, no secrets and no authentication factors (FR-012). This is the one rule here that a constraint cannot express — it is enforced by a test that inspects written entries against a deny-list of shapes, plus the explicit log review the constitution requires in code review. Treat the test as the real control.
- Written in the mutation's own transaction ([D6](./research.md#d6--the-audit-entry-is-written-in-the-mutations-own-transaction)). FR-017.

**State transitions**: none. Insert only, for 24 months, then the partition is
dropped. There is no edit path to specify.

### Action vocabulary for this slice

FR-014 enumerates seven audited events:

| `action` | `target_entity` | Emitted when |
|---|---|---|
| `tenant.provisioned` | `tenant` | A tenant is created |
| `tenant.deactivated` | `tenant` | A tenant moves to `deactivated` |
| `tenant.plan_changed` | `tenant` | A tenant's `plan_id` changes |
| `plan.limits_changed` | `plan` | A plan's `limits` or `entitlements` JSON changes |
| `tenant.cross_access_attempted` | the targeted entity | A request reaches for another tenant's resource, or names a tenant it holds no membership in |
| `audit.queried` | `audit_event` | The audit log is read **and** `source.channel = 'interactive'`. Automated or system-initiated reads — health checks, export jobs, monitoring — emit nothing |
| `tenant.registry_read` | `tenant` | The platform administration context reads the tenant registry, and `source.channel = 'interactive'` |

**Two actions are channel-gated, under the same rule.** `audit.queried` (FR-025) and
`tenant.registry_read` (FR-026) write an entry only for an interactive read. The
gating was extended to registry reads to prevent the same self-amplification risk for
automated and monitoring traffic: a job polling either surface would otherwise grow
the very log it is watching. Every other action above is unconditional.

**`plan.limits_changed` — gap closed.** FR-016 makes plan limits configurable without
a deployment, and the original FR-014 did not list that configuration as an audited
event. Changing the storage or user ceiling of a tier is a commercial act affecting
every tenant on it, so leaving it unaudited was inconsistent with Principle V.
FR-014 has been amended to name it, and it is a first-class action above rather than
a flagged proposal.

**`audit.queried` is interactive-only — self-amplification closed.** Reading the log
records the read, which means an automated poller would generate entries the next
poll returns, compounding without bound. Gating emission on
`source.channel = 'interactive'` keeps the evidentiary value that Principle V is
after — a person looked at this log, and that is recorded — while removing the
feedback loop, since a monitoring job reading the log is not an event a firm needs in
its own audit history. The field already exists on every entry, so this costs no
schema change.

The rule must be asserted in both directions, because each direction fails
differently: an implementation that recorded nothing at all would satisfy
"automated reads are silent" while breaking FR-014. See
[quickstart.md](./quickstart.md) V9.

`tenant.cross_access_attempted` is written against the *targeted* tenant through the
narrow definer function of
[D8](./research.md#d8--recording-a-cross-tenant-attempt-without-leaking-the-actors-other-tenants),
and deliberately omits the actor's home tenant.

---

## Boundary: entities owned by slice 002

Named here only so this slice's tenant-context contract has something to reference.
Neither table is created by this slice.

### Identity *(slice 002)*

The person, as recognised by the external IdP. Holds **no** tenant. Keyed by the
IdP's subject identifier. Not tenant-scoped, and therefore never readable by a
tenant session in a way that would expose other identities.

### Membership *(slice 002)*

The access one identity holds within one tenant.

| Field | Type | Note |
|---|---|---|
| `id` | `uuid` | Referenced by `AuditEvent.actor_membership_id` |
| `identity_id` | `uuid` | FK → `identity.id` |
| `tenant_id` | `uuid` | FK → `tenant.id`; tenant-scoped, RLS applies |
| `archetype` | enum | Per FR-024, the archetype lives here, not on `Identity` |
| `status` | enum | `live` / `revoked` |

Unique on `(identity_id, tenant_id)`. Because the table is tenant-scoped, a tenant
session sees only its own memberships, which is what delivers FR-023: firm A cannot
learn that one of its members also belongs to firm B.

---

## What this slice needs from the identity model, stated as a contract

This is the seam between slice 001 and slice 002, and the reason D1 had to be
decided before this plan.

The tenant-context mechanism requires, per request or job:

1. A verified **identity reference** — this slice does not authenticate; it receives an already-authenticated principal.
2. An **explicit target tenant** — not derived, because an identity may have several.
3. A way to confirm a **live membership** joins the two, and that the tenant's `status` is `active`.

Given those, it activates exactly one tenant for the transaction. Absent any of
them, it activates nothing and the request is refused — which, per
[D3](./research.md#d3--tenant-activation-happens-once-per-transaction-and-fails-closed),
also means an escaped query sees an empty database rather than another firm's rows.

Until slice 002 exists, tests supply identity and membership through fixtures. The
contract is specified in
[contracts/tenant-context.md](./contracts/tenant-context.md).

---

## Entity relationships

```
Plan 1 ──────< Tenant 1 ──────< AuditEvent
                  │
                  └──────< Membership >────── 1 Identity     (slice 002)

Plan          global catalog, no tenant_id, no RLS
Tenant        RLS on id,        null-safe predicate (v1.3.0)
AuditEvent    RLS on tenant_id, null-safe predicate (v1.3.0), monthly partitions, insert-only
Membership    RLS on tenant_id, null-safe predicate (v1.3.0)  (slice 002)
Identity      no tenant_id, never tenant-readable             (slice 002)
```
