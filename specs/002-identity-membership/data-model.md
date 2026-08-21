# Phase 1 Data Model: Identity, Membership & Invitation

**Feature**: `002-identity-membership` | **Date**: 2026-08-21 | **Research**: [research.md](./research.md)

Three entities are owned by this slice: `identity`, `membership`, `invitation`.
`membership` was named at slice 001's boundary
([001/data-model.md](../001-tenant-foundation/data-model.md#boundary-entities-owned-by-slice-002));
this slice builds it for real, alongside the two entities that create it.

**Every tenant-scoped RLS policy below uses the null-safe predicate mandated by
Constitution v1.3.0/v1.4.0**, in both `USING` and `WITH CHECK`:

```sql
tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
```

Two policies in this slice use a parallel form for the identity setting, following
the same reasoning ([D3](./research.md#d3--self-enumeration-uses-a-second-permissive-rls-policy-not-a-second-table)):

```sql
identity_id = NULLIF(current_setting('app.identity_id', true), '')::uuid
-- and, on `identity` itself:
id          = NULLIF(current_setting('app.identity_id', true), '')::uuid
```

---

## Identity

The person, as recognised by the external IdP. Holds no tenant.

| Field | Type | Constraints |
|---|---|---|
| `id` | `uuid` | PK, generated |
| `subject` | `text` | NOT NULL, **UNIQUE** — the IdP's subject identifier (FR-001, FR-003) |
| `email` | `text` | NOT NULL — held for correlation and contact, never as a credential |
| `mfa_enrolled_at` | `timestamptz` | NULL until slice 003's enrollment completes (FR-026) |
| `created_at` | `timestamptz` | NOT NULL, database default |

**Validation rules**
- `subject` unique across all identities — FR-003. The same subject never resolves
  to two rows; an incoming subject with a different email than the one on record
  does not silently overwrite `email` (FR-003) — the `accept_invitation` function
  (D1) only ever inserts a new row or reuses the existing one by `subject`, and
  never updates `email` on an existing row.
- No `DELETE` grant for any role, and no `UPDATE`/`INSERT` grant for the ordinary
  application role at all — see *Grants* below and
  [D4](./research.md#d4--the-identity-table-has-no-general-grant-for-the-application-role).

**Grants** (the load-bearing part of this table's design):

| Role | Privilege | Restricted by |
|---|---|---|
| Application role | `SELECT` only | RLS: `id = ` the null-safe `app.identity_id` setting — self-row only |
| Application role | `INSERT`, `UPDATE` | **none granted** |
| `accept_invitation` function (D1) | full, as definer | the function's own logic, not a grant |
| Platform role | **none granted** | — |

**State transitions**: none specified in this slice. `mfa_enrolled_at` moves
null → set exactly once, by a mechanism slice 003 owns; this slice only reads it.

---

## Membership

The access one identity holds within one tenant. Named at slice 001's boundary;
built here.

| Field | Type | Constraints |
|---|---|---|
| `id` | `uuid` | PK, generated. Referenced by `audit_event.actor_membership_id` |
| `identity_id` | `uuid` | NOT NULL, FK → `identity.id` |
| `tenant_id` | `uuid` | NOT NULL, FK → `tenant.id`; tenant-scoped |
| `archetype` | `archetype` (enum) | NOT NULL — see *Archetype enum* below |
| `status` | `membership_status` (enum) | NOT NULL, default `live`; `('live','revoked')` |
| `created_at` | `timestamptz` | NOT NULL, database default |
| `revoked_at` | `timestamptz` | NULL; NOT NULL exactly when `status = 'revoked'` (check constraint) |

**Validation rules**
- **Unique** on `(identity_id, tenant_id)` — FR-007, one membership per identity
  per tenant.
- No hard delete, ever — FR-009. `status` moves `live → revoked`, one-way; there is
  no un-revoke in this slice (a new invitation and a new acceptance is the
  specified path back to access, matching how `spec.md` treats invitation
  extension — see FR-027's "issue a new one, not extend the old one" reasoning
  applied consistently here too).
- Archetype change (FR-012) updates `archetype` in place; it does not touch `id`,
  `created_at`, or `status`, and is audited (`membership.archetype_changed`).

**Grants**:

| Role | Privilege | Restricted by |
|---|---|---|
| Application role | `SELECT` | Two permissive policies, combined `OR`: `tenant_id = ` current tenant (SA/MP reading their tenant's roster), `identity_id = ` current identity (self-enumeration, FR-017) |
| Application role | `UPDATE` | `tenant_id = ` current tenant only — revoke and archetype-change are tenant-scoped acts by SA/MP, never self-service |
| Application role | `INSERT` | **none granted** |
| `accept_invitation` function (D1) | `SELECT`, `INSERT`, as definer | `SELECT` backs FR-029's already-a-member guard (across every tenant); the function never updates an existing membership row |
| Platform role | `SELECT` | Existence-check only — see [D6](./research.md#d6--the-seed-capability-narrowly-extends-the-platform-roles-reach). No `INSERT`/`UPDATE`. |

**Why the self-enumeration policy is read-only, and the tenant policy governs
writes exclusively**: a person can see their own memberships everywhere, but can
change none of them themselves — every mutation is something a *different*
membership (an SA or MP acting inside its own tenant) does to this one. That
asymmetry is what keeps "read own memberships" and "revoke membership" as
genuinely separate rows in the permission matrix rather than the same capability
under two names.

**Archetype enum**: extends slice 001's `Archetype` TypeScript union with `'CC'`
([D9](./research.md#d9--the-archetype-enum-gains-cc)). The PostgreSQL enum mirrors
the constitution's ten membership-capable codes exactly:

```sql
CREATE TYPE archetype AS ENUM
  ('SA','MP','AA','PL','CM','BM','CC','IC','CB','EL');
```

`PO` is deliberately absent from this enum — it is not a membership archetype at
all (Constitution v1.4.0 Principle IV), and no column in this data model ever
needs to hold it.

---

## Invitation

A single-use, 7-day grant to become a member of one tenant with one named
archetype, issued to one email address, or seeded by the platform context for a
tenant with no members yet.

| Field | Type | Constraints |
|---|---|---|
| `id` | `uuid` | PK, generated. Internal handle only — safe to log, never the bearer credential |
| `tenant_id` | `uuid` | NOT NULL, FK → `tenant.id`; tenant-scoped |
| `target_archetype` | `archetype` (enum) | NOT NULL. Constrained to `'SA'` when `seeded = true` (check constraint, FR-035) |
| `invited_email` | `text` | NOT NULL |
| `reference_hash` | `text` | NOT NULL, **UNIQUE** — SHA-256 of the opaque token; see [D2](./research.md#d2--the-invitation-reference-is-a-random-token-hashed-at-rest-distinct-from-the-rows-id) |
| `issued_by_membership_id` | `uuid` | NULL when `seeded = true`; FK → `membership.id` otherwise |
| `seeded` | `boolean` | NOT NULL, default `false` — true only for FR-035's platform-issued rows |
| `status` | `invitation_status` (enum) | NOT NULL, default `pending`; `('pending','accepted','revoked')` |
| `failed_attempts` | `integer` | NOT NULL, default `0` — [D8](./research.md#d8--enumeration-resistance-thresholds-are-concrete-configuration)'s per-reference counter |
| `issued_at` | `timestamptz` | NOT NULL, database default |
| `expires_at` | `timestamptz` | NOT NULL, generated as `issued_at + interval '7 days'` (FR-027) |
| `accepted_at` | `timestamptz` | NULL; NOT NULL exactly when `status = 'accepted'` |
| `revoked_at` | `timestamptz` | NULL; NOT NULL exactly when `status = 'revoked'` |

**Validation rules**
- `expires_at` is a **generated column**, not application-set — FR-027's "7 days,
  applied uniformly" is a database-enforced fact, not a value the caller could
  pass a different number into by mistake.
- No `UPDATE` of `expires_at` is possible by any role, by construction (generated
  columns cannot be assigned). This is what makes FR-027's "MUST NOT be
  extendable" true at the data layer rather than by convention.
- Effective validity, checked by `accept_invitation` (D1), is
  `status = 'pending' AND now() < expires_at AND failed_attempts < 10` — all three
  refuse identically (FR-022, SC-007); the function does not distinguish which one
  failed in its response.
- `seeded = true` rows carry `issued_by_membership_id IS NULL` and
  `target_archetype = 'SA'` (check constraints) — FR-035 enforced structurally,
  not by the platform controller remembering to set the right fields.

**State transitions**

```
pending ──accept───> accepted
pending ──revoke───> revoked
pending ──expire───> (no column change; expiry is computed, not transitioned)
```

Expiry is deliberately not a state transition written by anything — `expires_at`
already answers "is this still valid" as a pure function of `issued_at`, so there
is no expiry job, and nothing to fail to run.

**Grants**:

| Role | Privilege | Restricted by |
|---|---|---|
| Application role | `SELECT`, `INSERT`, `UPDATE` | `tenant_id = ` current tenant — ordinary issue/revoke/list by SA/MP |
| `accept_invitation` function (D1) | `SELECT` (by `reference_hash`, bypassing tenant RLS), `UPDATE` (status/accepted_at/failed_attempts), as definer | the function's own logic |
| Platform role | `INSERT` only | Check constraint restricts platform-role inserts to `seeded = true` rows ([D6](./research.md#d6--the-seed-capability-narrowly-extends-the-platform-roles-reach)) |

**Why `reference_hash` rather than `id` is what the definer function looks up
by**: the accepting caller does not have an active tenant, so it cannot reach this
row through the tenant-scoped policy at all — the definer function is the only
path, and it is given the hash of whatever token the invitee actually holds, never
the row's `id`.

---

## Audit vocabulary added by this slice

FR-031 extends `001/FR-014`'s seven actions to sixteen. This slice adds nine:

| `action` | `target_entity` | Emitted when |
|---|---|---|
| `identity.created` | `identity` | A new identity is created during acceptance — audited against the **invitation's tenant** (FR-033), since identity itself holds no tenant |
| `membership.created` | `membership` | A membership is created during acceptance |
| `membership.revoked` | `membership` | An SA/MP revokes a membership within their tenant |
| `membership.archetype_changed` | `membership` | An SA changes a membership's archetype (previous/new in `metadata`) |
| `invitation.issued` | `invitation` | An SA/MP issues an ordinary invitation |
| `invitation.seed_issued` | `invitation` | The platform context issues a seed invitation (FR-035) — kept distinct from `invitation.issued` so the one PO-originated action is never confused with a tenant member's own |
| `invitation.revoked` | `invitation` | The issuer revokes a pending invitation |
| `invitation.accepted` | `invitation` | `accept_invitation` succeeds |
| `invitation.refused` | `invitation` | `accept_invitation` refuses, for any reason — FR-034: the entry never states which reason |

**All nine follow 001's D6 pattern**: written inside the same transaction as the
mutation they describe. For the five actions the `accept_invitation` function
itself performs (`identity.created`, `membership.created`, `invitation.accepted`,
`invitation.refused`, and the counter increment behind `invitation.refused` in the
failed-attempts case), the function writes them directly, as its own definer
privilege — the same shape 001's `audit_append_cross_tenant_attempt` uses.

**Actor attribution for `invitation.seed_issued`**: `actor_identity_id` and
`actor_membership_id` are both `null`, the same `PLATFORM_ACTOR` shape 001 uses for
its own platform-context actions ([001 `audit/actor.ts`](../../backend/src/common/audit/actor.ts)) — the platform operator is not a membership and must never be recorded as one.

**No new channel-gated action.** FR-025/FR-026 (001) gate `audit.queried` and
`tenant.registry_read` on `source.channel = 'interactive'`. None of this slice's
nine actions are reads of a monitorable log, so none carry that risk, and none are
gated.

**Email never appears in any of the nine entries.** `invited_email` exists on
`invitation`, but no audit code path reads it into `metadata` — and if one tried
to, the existing sanitiser (`assertNoSensitiveData`, 001) already refuses any
metadata key containing `email`, rolling back the mutation with it. This slice
adds no new sanitiser rule because the existing one already covers the one new
risk this slice introduces.

---

## Entity relationships

```
Tenant 1 ──────< Membership >────── 1 Identity
   │                  │
   │                  └── created by ── Invitation (accepted)
   │
   └──────< Invitation

Identity        no tenant_id; SELECT self-row only; no general grant at all
Membership      RLS: tenant_id OR identity_id (self-read); INSERT only via accept_invitation
Invitation      RLS: tenant_id (ordinary); reference_hash lookup only via accept_invitation;
                seeded rows insertable by the platform role only
```

## What this slice delivers against slice 001's boundary contract

001's `data-model.md` named the contract the tenant-context mechanism needs:
a verified identity reference, an explicit target tenant, and a way to confirm a
live membership joins them with the tenant active. This slice delivers all three
against real data — `MembershipPort.find` is now backed by the `membership` table
(with the D5 join for `mfa_enrolled_at`), replacing
`InMemoryMembershipPort` behind the unchanged interface. Nothing above that
interface — `resolvePrincipal`'s callers, the tenant-context interceptor, every
route built against slice 001 — changes.
