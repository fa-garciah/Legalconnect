# Phase 1 — Data Model: Authorization & Tier Entitlements

**Feature**: `004-authorization-entitlements` | **Date**: 2026-08-26
**Spec**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

---

## This slice adds no table

Decision 4 fixed the archetypes, so the matrix is a compile-time constant rather than a
per-tenant lookup. There is no capability table, no role table, no per-tenant override
table, and no persisted decision.

| What | Where it already lives | Owner |
|---|---|---|
| The caller's archetype | `membership.archetype`, a ten-value enum | 002 |
| The tenant's plan | `tenant.plan_id → plan` | 001 |
| The feature mapping | `plan.entitlements jsonb` — written by 001, **read by nothing until now** | 001 |
| The quantitative limits | `plan.limits jsonb` | 001 |
| The audit vocabulary | `audit_event.action`, sixteen actions | 001, 002 |

**One migration, and it adds no table**: a `BEFORE UPDATE` trigger on `membership`
enforcing the last-`SA` invariant (research.md D5). A second migration number is
reserved for a grant narrowing and is expected to be dropped unused (D10).

---

## The capability registry

Not an entity. A constant, in `backend/src/common/authz/capability.ts`.

```ts
export type ScopeKind = 'tenant' | 'self' | 'assigned' | 'none';

export interface CapabilityDef {
  /** Exactly one, always. FR-013 — a capability declaring none is refused. */
  readonly scope: ScopeKind;
  /** Key into `plan.entitlements`. Absent ⇒ included in every plan (research.md D4). */
  readonly tier?: string;
  /** Key into `plan.limits`. Absent ⇒ no quantitative ceiling. */
  readonly limit?: keyof PlanLimits;
  /** Step-up MFA required (slice 005). Withheld from production until it lands. */
  readonly stepUp?: true;
}

export const CAPABILITIES = { /* the twenty-one rows below */ } as const satisfies
  Readonly<Record<string, CapabilityDef>>;

export type CapabilityId = keyof typeof CAPABILITIES;
```

`CapabilityId` is derived from the keys, never written out by hand. That is what makes
the matrix's `Record<CapabilityId, …>` total and a missing row a **compile error**
(FR-021, research.md D1).

### The twenty-one capabilities

Ids are `module.verb`, matching the `audit_event.action` vocabulary's shape so the two
read alike. `route` names the endpoint that declares it today; `—` means the capability
exists in the registry with no endpoint yet, which is legal and is how rows 18–21 assert
that nobody holds them.

| # | `CapabilityId` | Scope | Step-up | Route today |
|---|---|---|---|---|
| 1 | `audit.read_own_tenant` | `tenant` | | `GET /audit/events` |
| 2 | `invitation.issue` | `tenant` | ✅ | `POST /tenant/invitations` |
| 3 | `invitation.revoke` | `tenant` | ✅ | `POST /tenant/invitations/:id/revoke` |
| 4 | `invitation.read_pending` | `tenant` | | `GET /tenant/invitations` |
| 5 | `membership.read_tenant` | `tenant` | | — ‡ |
| 6 | `membership.revoke` | `tenant` | ✅ | `PATCH /tenant/memberships/:id/revoke` |
| 7 | `membership.change_archetype` | `tenant` | ✅ | `PATCH /tenant/memberships/:id/archetype` |
| 8 | `plan.read_own_tenant` | `tenant` | | — |
| 9 | `invitation.accept_own` | `self` | | `POST /identity/invitations/:reference/accept` |
| 10 | `membership.read_own` | `self` | | `GET /identity/memberships` |
| 11 | `tenant.provision` | `none` | | `POST /internal/platform/tenants` |
| 12 | `tenant.deactivate` | `none` | | `POST …/tenants/:id/deactivate` |
| 13 | `tenant.read_registry` | `none` | | `GET /internal/platform/tenants/:id` |
| 14 | `audit.read_platform` | `none` | | `GET /internal/platform/audit` |
| 15 | `tenant.change_plan` | `none` | | `PATCH …/tenants/:id/plan` |
| 16 | `plan.configure_limits` | `none` | | `PATCH …/plans/:code/limits` |
| 17 | `invitation.issue_seed` | `none` | ✅ | `POST …/tenants/:tenantId/seed-administrator` |
| 18 | `identity.read_registry` | `none` | | — |
| 19 | `identity.hard_delete` | `none` | | — |
| 20 | `membership.create_direct` | `none` | | — |
| 21 | `archetype.redefine` | `none` | | — |

**Rows 19–21 carry `none` rather than no scope kind.** The spec's table leaves their
scope column blank on the reasoning that no scope could make them permitted. FR-013
says a capability declaring no scope kind is refused — but a capability with an
*absent* scope key is a compile error under `CapabilityDef`, which is stronger and
happens earlier. `none` plus an empty matrix row is the encoding that survives the type
system; the "nobody holds it" property is carried by the row, not by the scope.

‡ **Rows 5 and 8 have no route today, and the count confirms it.** The application
exposes exactly **15 routes**; the registry carries 21 capabilities, of which 6 have no
endpoint — rows 5, 8, 18, 19, 20 and 21. 15 + 6 = 21, with no capability unaccounted for
and no route undeclared. That arithmetic is the check `capability-declared-everywhere.test.ts`
automates.

- **Row 5** (`membership.read_tenant`): `002`'s permission matrix grants `SA`/`MP` the
  right to read their tenant's memberships, but `MembershipController` exposes only the
  two `PATCH` routes. The read was specified and never built.
- **Row 8** (`plan.read_own_tenant`): the spec's matrix grants `MP`, `BM` and `SA` the
  right to read their own plan and limits. `PlanController` is `@PlatformSurface()`
  throughout, so no tenant-facing plan read exists.

A registry entry with no route is inert and legal — FR-018 requires every *exposed*
capability be registered, not that every registered capability be exposed. Both are
listed so the slice that adds the endpoint adds a **row**, not a rule.

---

## The matrix

`backend/src/common/authz/matrix.ts`. A constant, per Decision 4.

```ts
export type Subject = Archetype | 'PO';        // the eleven codes of Principle IV

export const MATRIX: Readonly<Record<CapabilityId, ReadonlySet<Subject>>> = {
  'audit.read_own_tenant':      new Set(['SA']),
  'invitation.issue':           new Set(['SA', 'MP']),
  // ...
  'identity.read_registry':     new Set([]),     // rows 18-21: held by nobody
};
```

`Subject` is declared here and not in `common/tenant/principal.ts`, because `PO` is not
a membership and `Archetype` must keep meaning *what can appear in the enum column*
(research.md D9).

Rows 9 and 10 carry a set for documentation, and the decision function does not consult
it: their scope kind is `self` and the `self` resolver is the whole constraint
(research.md D8).

### The rows, as resolved

| `CapabilityId` | Subjects | Against 002 |
|---|---|---|
| `audit.read_own_tenant` | `SA` | unchanged |
| `invitation.issue` | `SA`, `MP` | unchanged |
| `invitation.revoke` | `SA`, `MP` | unchanged |
| `invitation.read_pending` | `SA`, `MP` | unchanged |
| `membership.read_tenant` | `SA`, `MP` | unchanged |
| `membership.revoke` | `SA`, `MP` | unchanged |
| `membership.change_archetype` | `SA` | unchanged |
| `plan.read_own_tenant` | `SA`, `MP`, `BM` | new row, no route |
| `invitation.accept_own` | *not archetype-decided* | unchanged |
| `membership.read_own` | *not archetype-decided* | unchanged |
| `tenant.provision` … `invitation.issue_seed` (11–17) | `PO` | unchanged |
| `identity.read_registry` … `archetype.redefine` (18–21) | *(empty)* | unchanged |

**FR-028's enumeration of differences is empty.** Decision 6 kept `MP` exactly as 002
shipped it, so no route's declaration changes and 002's permission matrix needs no
amendment. This is the property SC-017 turns into a test.

---

## The decision

Not persisted. Derived per request, returned by a pure function.

```ts
export type RefusalClass = 'mfa_not_enrolled' | 'permission' | 'scope' | 'entitlement';

export type Decision =
  | { readonly permitted: true }
  | { readonly permitted: false;
      readonly reason: RefusalClass;
      /** Populated only for `entitlement` from a limit. FR-024. */
      readonly limit?: { readonly key: string; readonly value: number };
      /** Populated only for `entitlement` from a feature flag. */
      readonly capability?: CapabilityId };
```

Exactly one reason, always the earliest that applies (FR-022). The ordering is a
constant array in `refusal.ts` and the evaluation walks it — so the order cannot vary by
endpoint, because no endpoint can reach it.

### `decide()`

```ts
export function decide(input: DecisionInput): Promise<Decision>;

export interface DecisionInput {
  readonly subject: Subject;
  readonly capability: CapabilityId | null;      // null ⇒ endpoint declared none (FR-019)
  readonly mfaEnrolledAt: string | null | undefined;
  readonly scope: ScopeRequest;
  readonly plan: { entitlements: Record<string, boolean>; limits: PlanLimits } | null;
  readonly usage?: Readonly<Partial<Record<keyof PlanLimits, number>>>;
}
```

`Promise` rather than a synchronous return, because the `assigned` resolver will query.
The three resolvers this slice ships return resolved promises and add no round trip
(research.md D7).

**`capability: null` refuses before anything else is evaluated.** That is FR-019 — an
endpoint that declares no capability is unreachable — and it is what closes the fail-open
path the spec's §2 describes, where an undeclared route today passes straight through.

---

## Changes to entities that already exist

Three modifications, all widenings of a seam, none of a grant.

### `MembershipRecord` — `common/tenant/membership.ts`

Gains two optional fields, populated only by `DbMembershipPort`:

```ts
readonly planEntitlements?: Record<string, boolean>;
readonly planLimits?: PlanLimits;
```

Optional for the same reason `identityMfaEnrolledAt` is: 001's `InMemoryMembershipPort`
fixtures must keep compiling untouched (SC-017). `DbMembershipPort.find()`'s existing
single `SELECT` gains two joins — `tenant` on `membership.tenant_id`, `plan` on
`tenant.plan_id` — and no second round trip. Both grants already exist and `tenant`'s
RLS restricts the join to the row whose `id` equals the `app.tenant_id` the method has
just set (research.md D7).

### `ActivePrincipal` — `common/tenant/principal.ts`

Gains the resolved plan, so `AuthorizationInterceptor` reads it from
`currentPrincipal()` with no lookup:

```ts
readonly plan: { readonly entitlements: Record<string, boolean>;
                 readonly limits: PlanLimits } | null;
```

`null` where the port supplied nothing — the in-memory fixtures — which `decide()` treats
as *no plan resolved*, and which refuses any capability carrying a `tier` key. Fail-closed,
and no fixture in 001 declares one.

### `RefusalReason` — `common/tenant/principal.ts`

The existing six-value union is **not** extended. `RefusalReason` describes why a *tenant
activation* was refused and is consumed by `refusalToHttp` and `REFUSALS_THAT_AUDIT`;
authorization refusals are a different question asked at a different point, and merging
them would put `permission` into `REFUSALS_THAT_AUDIT`'s domain, where it has no meaning.
`RefusalClass` above is the authorization vocabulary and lives in `common/authz/refusal.ts`.

`mfa_not_enrolled` appears in both, deliberately and without duplication of behaviour:
`resolvePrincipal` still refuses it first, before `AuthorizationInterceptor` ever runs, so
the ordering of FR-022 is satisfied by the interceptor order rather than by a re-check.
`RefusalClass` names it so the ordering constant is complete and testable as a whole.

---

## The `membership` trigger

`backend/drizzle/0019_membership_retain_one_sa.sql`. Full shape in research.md D5.

- Fires `BEFORE UPDATE ON membership`, only on the transition out of live-`SA`.
- Takes `FOR UPDATE` on sibling live `SA` rows, which is what closes the concurrent-
  demotion race SC-009 forbids.
- Raises `SQLSTATE 23001` (`restrict_violation`); `membership.service.ts` maps that code
  — not the message — to a distinct HTTP refusal.
- Predicate is `tenant_id = OLD.tenant_id`, so the invariant is per membership, not per
  person.

It refuses; it never widens. No grant, role or policy changes.
