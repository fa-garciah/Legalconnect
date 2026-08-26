# Phase 0 — Research: Authorization & Tier Entitlements

**Feature**: `004-authorization-entitlements` | **Date**: 2026-08-26
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Constitution**: v1.4.0

Every decision below was taken against `backend/src` and `backend/drizzle` as they
stand at `dd7755f`, not against the story catalogue. Where the two disagreed, the
repository won and the disagreement is recorded.

---

## D1 — Capability identity: a registry object, keyed

**Decision.** A single `const` registry object. The capability id type is derived from
its keys, and the matrix is typed as a total `Record` over that type.

```ts
export const CAPABILITIES = {
  'audit.read_own_tenant':      { scope: 'tenant', tier: 'audit_log' },
  'invitation.issue':           { scope: 'tenant' },
  // ...
} as const;

export type CapabilityId = keyof typeof CAPABILITIES;
export const MATRIX: Readonly<Record<CapabilityId, ReadonlySet<Subject>>> = { ... };
```

**Rationale.** FR-021 requires that a capability reaching `main` without a matrix row
**fail the build**, not merely be refused at runtime. `Record<CapabilityId, T>` is the
only one of the three candidates that delivers that for free: TypeScript reports a
missing key in an object literal typed as a total `Record` over a union as a compile
error, naming the missing capability. Nothing has to remember to run a check.

FR-018 additionally requires the registry be *enumerable*, so the exhaustive test of
SC-001 iterates `Object.keys(CAPABILITIES)` rather than a hand-written list that can
drift from it. A `const` object satisfies both the compile-time totality and the
runtime enumeration; the other two candidates satisfy at most one.

**Alternatives considered.**

| Candidate | Why rejected |
|---|---|
| A string-literal union `type CapabilityId = 'a' \| 'b'` | Enumerable at compile time only. The exhaustive test would need a parallel runtime array, which is precisely the hand-maintained list FR-018 forbids. |
| A TypeScript `enum` | Reverse mappings make `Object.keys` return both names and values, so the exhaustive test silently doubles and half its pairs are nonsense. Also carries a runtime object the rest of the codebase does not use — 002 has no `enum` anywhere. |
| A repository / database table | Decision 4 forbids it. A capability is a property of the product, identical for every tenant; storing it would make the matrix a per-tenant lookup and put a query on the hot path. |

**Consequence.** `capability.ts` and `matrix.ts` import nothing from NestJS, Drizzle or
`node:*`. That is what makes the exhaustive unit suite run with no Testcontainers.

---

## D2 — The decision runs in an interceptor, on all three surfaces

**Decision.** A fourth global interceptor, `AuthorizationInterceptor`, registered in
`app.module.ts` **after** both context interceptors and **before** `AuditInterceptor`.
It runs for *every* route on *every* surface, reads the route's `@Capability()`
declaration, and calls `decide()`.

```
TenantContextInterceptor      resolves the principal, opens the tenant transaction
PlatformContextInterceptor    opens the platform transaction
  └── AuthorizationInterceptor   decides — tenant, platform and identity surfaces alike
      └── AuditInterceptor       appends inside whichever transaction is open
```

**Rationale, part 1 — why not a Guard.** The constitution's Technology Constraints
table still reads *"Tier entitlement → Global guard"*. That row is unimplementable for
exactly the reason v1.4.0 already corrected the two rows above it: Nest runs Guards
before every Interceptor, and entitlement depends on the tenant's plan, which does not
exist until `TenantContextInterceptor` has resolved a principal. A Guard reading the
plan would find no tenant on every request. The correction v1.4.0 applied to rows 1 and
2 applies verbatim to row 3, and was simply missed. This is recorded as a deviation in
`plan.md` Complexity Tracking and carried to an amendment PR.

**Rationale, part 2 — why it must be its own interceptor rather than more code inside
`TenantContextInterceptor`.** `TenantContextInterceptor` returns `next.handle()`
immediately for `@PlatformSurface()` and `@IdentitySurface()` routes
([middleware.ts:107-113](../../backend/src/common/tenant/middleware.ts#L107-L113)).
Every archetype check today therefore lives on a code path those two surfaces never
enter. Rows 11–17 of the matrix are `PO` capabilities on platform routes and rows 9–10
are `self` capabilities on identity routes; a decision mechanism that cannot see them
covers eight of the twenty-one rows not at all. A separate interceptor that runs
unconditionally is what closes FR-019 across all three surfaces rather than one.

**How it obtains the archetype without a second lookup.** It does not look anything up.
`TenantContextInterceptor` wraps the handler in `runInTenantContext`, so an interceptor
nested inside it reads `currentPrincipal()` from the same `AsyncLocalStorage` —
synchronous, zero queries. On the platform surface there is no principal and the
subject is `PO` (see D9). On the identity surface there is no archetype at all (see D8).

**Consequence for `@RequireArchetypes`.** It becomes redundant and is removed in the
same PR, its four call sites replaced by `@Capability(...)`. Leaving both would be two
sources of truth for one rule, which is the failure mode `plan.md`'s second Complexity
Tracking row exists to avoid.

**Alternative rejected.** Registering `AuthorizationInterceptor` *first*, outermost.
It would then run before the tenant transaction is open, so an `assigned` resolver
would have to open its own connection instead of joining the request's transaction —
and a scope read outside the request transaction is a read that cannot see the
request's own uncommitted state. Nesting inside is both cheaper and more correct.

---

## D3 — `ScopeResolverPort`: a registry keyed by scope kind, not by capability

**Decision.**

```ts
export interface ScopeRequest {
  readonly subject: Subject;               // archetype, or PO
  readonly capability: CapabilityId;
  readonly principal: ActivePrincipal | null;
  readonly identityId: string | null;
  readonly targetTenantId: string | null;
  readonly targetId: string | null;
}

export interface ScopeResolver {
  readonly kind: ScopeKind;                          // 'tenant' | 'self' | 'assigned' | 'none'
  resolve(request: ScopeRequest): Promise<boolean>;
}

export const SCOPE_RESOLVERS = Symbol('SCOPE_RESOLVERS');   // multi-provider token
```

Resolvers are collected from the DI container by kind. This slice registers three —
`tenant`, `self`, `none`. The clients-and-cases slice registers `assigned` from *its
own module*, in the PR that introduces the case team, by adding one provider to the
`SCOPE_RESOLVERS` array. **No file under `common/authz/` is edited to do it**, which is
what FR-015 asks for.

**Rationale.** Keying by scope *kind* rather than by capability is what keeps the port
small. The alternative — a resolver per capability — would mean the cases slice
registers one resolver per case capability and each is a copy of the last. Ethical
walls are a property of the relationship, not of the verb.

**Fail-closed.** `decide()` looks up the resolver for the declared kind and refuses on
scope when none is registered (US5 scenario 6). This is why the `assigned` kind can be
declared today, with no resolver, without opening anything: a missing resolver is a
missing rule, and a missing rule is a refusal. It is asserted by a unit test, not
inferred.

**Alternatives considered.** A `Map<CapabilityId, Resolver>` populated by a decorator
on the capability — rejected because it puts the registration back inside
`common/authz/`. A single resolver interface taking the kind as an argument — rejected
because it makes "no resolver registered" indistinguishable from "resolver said no",
and those must refuse for different recorded reasons even though both refuse.

---

## D4 — Entitlement: two evaluations, one refusal class, two refusal shapes

**Decision.** `plan.entitlements` (a `Record<string, boolean>`) and `plan.limits`
(`{ users?, storageBytes?, monthlyCfdi? }`) are evaluated by one function that can
return two shapes:

| Shape | Source | Refusal payload | Spec |
|---|---|---|---|
| Feature flag | `plan.entitlements[tierKey] !== true` | names the capability, no number | FR-006 |
| Quantitative limit | `usage >= plan.limits[limitKey]` | **names the limit reached** | FR-024, SC-008 |

Both are `entitlement`-class for the purposes of the refusal ordering (FR-022) — they
never compete with each other, because a capability declares at most one of `tier` and
`limit`.

**A capability with neither key is entitlement-exempt, and that is not a hole.** The
entitlement mechanism is cross-cutting and is never removed (constitution, *Tier
Entitlements*), but *which* capability is gated is configuration whose owner is a
commercial decision, not this slice's (spec, Assumptions). A capability with no `tier`
key is included in every plan — which is the launch state for all twenty-one rows
until someone owns the mapping. See `plan.md`, Open Items.

**Where the usage count comes from.** `plan.limits.users` is the only limit any
capability in this slice's matrix could reach, and no row in this matrix creates a
membership — `accept_invitation()` does, and it runs as a different role from a route
that has no caller. So **no limit is enforced by this slice**; the mechanism, its
refusal shape and its test ship here, and the first real limit lands with the first
capability that creates a countable thing. This is stated so the empty limit path is a
recorded decision rather than an omission someone finds later.

**Alternative rejected.** Folding limits into the feature-flag map as
`{ "cases.create": false }` once a tenant is at its cap. It cannot name the limit
reached (FR-024), and it would require a writer to flip flags on every create and
delete — turning a read-only configuration column into hot mutable state.

---

## D5 — The last-`SA` invariant is a database trigger

**Decision.** A `BEFORE UPDATE` trigger on `membership`, refusing any update that would
leave the row's tenant with zero live `SA` memberships. It covers archetype change and
revocation with one rule, because both are `UPDATE`s on that table
([membership.service.ts:39-80](../../backend/src/modules/membership/membership.service.ts#L39-L80)).

**Rationale.** Two reasons, and the second is the one that decides it.

1. **House style.** 002 put its own invariants at the data layer wherever a grant or a
   constraint could carry them, and said why: an application check in every endpoint is
   the *developer forgets it* failure mode Principle II exists to make impossible
   rather than merely unlikely. `membership`'s `revoked_at` consistency is already a
   `CHECK`; this is the same shape one level up.
2. **The race.** An application check reads the live-`SA` count, then writes. Two
   concurrent requests demoting the last two `SA`s each read `2`, each conclude they
   are safe, and both commit — leaving zero. SC-009 says *0 sequences* leave a tenant
   with zero live `SA`, and a check-then-write cannot deliver that. The trigger takes
   `FOR UPDATE` on the sibling `SA` rows, so the second transaction blocks until the
   first commits and then re-reads the true count.

**Shape.**

```sql
CREATE FUNCTION membership_retain_one_sa() RETURNS trigger AS $$
BEGIN
  IF OLD.archetype = 'SA' AND OLD.status = 'live'
     AND (NEW.archetype <> 'SA' OR NEW.status <> 'live') THEN
    PERFORM 1 FROM membership
      WHERE tenant_id = OLD.tenant_id AND archetype = 'SA'
        AND status = 'live' AND id <> OLD.id
      FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'last_sa_protected' USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
```

The trigger fires only on the transition out of live-`SA`, so it costs nothing on any
other update. `restrict_violation` (`23001`) is mapped to a distinct HTTP refusal by
`membership.service.ts`; a `SQLSTATE`, not a message match, so the mapping does not
break when the message is reworded.

**Per membership, not per person.** The predicate is `tenant_id = OLD.tenant_id`. An
`SA` who is last in tenant A and one of several in tenant B is refused in A and
unaffected in B, which is the edge case the spec calls out.

**Alternative rejected.** A deferred constraint trigger checking the count at commit.
It would report the failure at `COMMIT` rather than at the statement, so the service
could not attribute it to a particular request's audit entry, and Nest would surface it
after the audit interceptor had already appended.

---

## D6 — Refusal HTTP mapping, and the one tension the spec carries

**Decision, for what this slice ships.**

| Reason | Status | Body code | Precedent |
|---|---|---|---|
| `mfa_not_enrolled` | 403 | `mfa_enrollment_required` | 002, unchanged — stays first, not reordered |
| `permission` | 403 | `not_authorized` | 002's `NotAuthorized`, unchanged |
| `scope` — `self` kind | 403 | `not_authorized` | the caller's own record; nothing is disclosed |
| `scope` — `assigned` kind | **404** | `not_found` | recommended; **see below** |
| `entitlement` — feature | 403 | `entitlement_required` | new; names the capability |
| `entitlement` — limit | 403 | `limit_reached` | new; names the limit (FR-024) |

**The tension, stated plainly.** FR-017 and US5 scenario 3 require a scope refusal be
*distinguishable* from a permission refusal and an entitlement refusal. FR-023 requires
that no refusal disclose the existence of the refused resource. For an `assigned`-scope
refusal these pull in opposite directions: a 403 saying "you are not assigned to this"
confirms the matter exists. In a firm running an ethical wall, that confirmation is the
leak the wall was built to prevent — a screened partner learns a matter exists, which
is often the whole of the protected fact.

**This is not blocking, and that is the useful part.** No row in this slice's matrix
resolves at `assigned` scope. Rows 1–8 are `tenant`, 9–10 are `self`, 11–17 are `none`.
The mechanism, the port and the fail-closed behaviour all ship here and are tested with
a stub resolver; **the wire mapping for `assigned` is first observable in the slice that
ships the first `assigned` capability**, which is the clients-and-cases slice.

**Recommendation carried forward:** 404, with `ResourceNotFound`'s existing body,
byte-identical to a resource that does not exist. It should be signed off by someone who
can speak to the professional-privilege consequence rather than to the HTTP convention,
and if it is taken, FR-017 and US5 scenario 3 are amended in the same PR to say that the
`assigned` distinction is drawn in the audit trail and in the module's `Decision` type
rather than on the wire. Recorded in `plan.md`, Open Items.

**What is decided now, either way:** the internal `Decision` type distinguishes all four
reasons unconditionally. Only the HTTP projection is in question, and only for one kind.

---

## D7 — The entitlement mapping is read per request, with no cache at all

**Decision.** No cache. No TTL. The plan's `entitlements` and `limits` are read on every
request, in the query that already runs.

**How it costs nothing.** `DbMembershipPort.find()` already opens a transaction, sets
both settings, and runs one `SELECT` joining `membership` to `identity`
([membership.ts:96-118](../../backend/src/common/tenant/membership.ts#L96-L118)). It
gains two more joins — `tenant` on `membership.tenant_id`, `plan` on `tenant.plan_id` —
and returns two more fields. Same transaction, same round trip. The grants are already
in place: `GRANT SELECT ON tenant TO lc_app` and `GRANT SELECT ON plan TO lc_app`
([0006_grants.sql](../../backend/drizzle/0006_grants.sql)), `tenant` is RLS-restricted
to the row whose `id` matches `app.tenant_id` — which this transaction has just set —
and `plan` carries no RLS because it is global product configuration, not tenant data
([0001_plan.sql](../../backend/drizzle/0001_plan.sql)).

**Rationale.** The plan draft that preceded this document asserted that "archetype and
plan are already resolved by the existing `MembershipPort` lookup." Half of that is
true: `MembershipRecord` carries no plan today. The choice was therefore between adding
a second query and widening the first. Widening the first keeps the stated performance
goal — *no added query for the `tenant`, `self` and `none` scope kinds* — literally
true rather than approximately true.

**Why a cache is the wrong answer even though it would be fast.** FR-007 and SC-007
require the mapping to take effect *on the next request*, with 0 deployments and 0
restarts. A TTL cache satisfies that sentence and defeats it: an operator who changes a
tenant's plan and is told "it will apply within five minutes" has a deployment-free
mechanism that behaves like a deployment. And a cache keyed by tenant is per-tenant
mutable state in a multi-tenant process, which is a category of bug Principle II exists
to keep out of this codebase. There is no performance case to trade against, because
the read is free.

**Consequence.** `MembershipRecord` gains `planEntitlements: Record<string, boolean>`
and `planLimits: PlanLimits`, both optional in the interface for the same reason
`identityMfaEnrolledAt` is optional — 001's `InMemoryMembershipPort` fixtures must keep
compiling untouched, and only `DbMembershipPort` ever populates them. This is a widening
of a seam, not of a grant.

---

## D8 — The identity surface is decided by identity, not by archetype

**Decision.** Rows 9 (accept own invitation) and 10 (read own memberships) declare
scope `self` and their archetype dimension is **not consulted**. The `self` resolver is
the whole of the constraint, exactly as the spec's own note under the matrix says.

**Why this needs deciding at all.** Read literally against FR-020 — *the four portal
archetypes hold zero capabilities* — the exhaustive test would assert that `CC`, `IC`,
`CB` and `EL` are refused row 9. That refusal breaks a capability 002 shipped and tested:
`SA` may issue an invitation naming a portal archetype, and the invitee must be able to
accept it. Worse, at the moment of acceptance the caller **has no membership**, so there
is no archetype to decide against — that is the point of accepting. The same holds for
row 10: no tenant is active, and the identity may hold several memberships carrying
different archetypes. Neither route checks an archetype today, and neither can.

**Reading that holds both.** FR-020 and SC-004 are about **tenant-scoped** capability:
the portal archetypes hold zero of rows 1–8 and zero of every domain row a later slice
adds. That is the property the portal epic needs — granting a portal archetype anything
must be a deliberate act — and it is asserted unchanged. Rows 9 and 10 are not
archetype-decided by anybody, `PO` included.

**Consequence for the exhaustive suite.** `matrix-exhaustive.test.ts` iterates the
eleven subjects across every capability whose scope kind is `tenant` or `none`, and
asserts archetype-independence for the `self` rows separately. SC-001's *0 pairs
unasserted* is met; the assertion for two of the twenty-one rows has a different shape,
and the test says so in a comment rather than leaving the reader to infer it.

**Flagged.** This is a re-reading of FR-020 and SC-004, not a contradiction of them, but
it is the plan interpreting the spec and it should be confirmed. Recorded in `plan.md`,
Open Items. If it is rejected, the alternative is to amend 002 so a portal archetype
cannot be invited at all — a materially larger change, in a different slice.

---

## D9 — `PO` is a property of the surface, not of a claim

**Decision.** On a `@PlatformSurface()` route the decision subject is `PO`, established
by the route's own declaration. There is no `PO` membership to resolve and no header to
trust.

**Rationale.** `PO` is not a membership and never appears in the `archetype` enum
([0013_membership_writable.sql](../../backend/drizzle/0013_membership_writable.sql)).
The platform surface authenticates nothing in the current build and is bound to loopback
for exactly that reason ([main.ts:44-56](../../backend/src/main.ts#L44-L56)). Deriving
the subject from the route declaration is therefore not a shortcut — it is the only
honest reading of what the surface currently is, and it is FR-003-safe in the strongest
possible way: nothing the caller supplies participates.

**What changes when slice 003 lands.** The subject becomes an authenticated `PO`
identity and `AuthorizationInterceptor`'s call site does not change — only where
`subject` comes from on that one branch. The `Subject` type is
`Archetype | 'PO'` from the start, so no signature moves.

**Consequence for FR-008 and SC-003.** `PO` being surface-derived is what makes
`po-refused-everything.test.ts` meaningful: a tenant-scoped capability can never be
reached with subject `PO`, because a tenant-scoped route is not a platform route, and
the two markers are mutually exclusive by declaration. The test asserts the decision
function refuses `PO` for all 8 tenant-scoped rows *and* that no route carries both
markers.

---

## D10 — The grant audit, and why this slice runs it

**Decision.** Run `grants-lockdown.test.ts`'s style of assertion over the two tables
this slice newly reads on the hot path — `tenant` and `plan` — and over the audit
actions it touches. Add a narrowing migration only if a gap is found; drop it if not.

**Rationale.** 002's `quickstart-results.md` deviation 5 found `lc_app`'s `audit_event`
grant wider than intended and narrowed it in
[0018](../../backend/drizzle/0018_lc_app_audit_action_restriction.sql). That gap was
invisible until someone looked. This slice is the natural place to look again, because
it is the first to put `tenant` and `plan` on the per-request path for the ordinary
role. **Expected finding: none** — `GRANT SELECT` is already the narrowest useful grant
on both, and `plan` correctly carries no RLS. The migration number
`0019_authz_grant_verification.sql` is reserved and will be dropped from the branch if
the assertions pass, which is the outcome to expect.

**This slice widens no grant.** It adds no `INSERT`, no `UPDATE`, no new role, and no
policy. The one migration it does add is a trigger (D5), which only ever refuses.

---

## Summary of what changed against the plan draft

Two assertions in the draft did not survive contact with the repository, and both are
load-bearing:

1. **"Archetype and plan are already resolved by the existing `MembershipPort`
   lookup."** Archetype is; the plan is not. `MembershipRecord` has no plan field.
   Resolved by D7 — widen the existing query rather than add one.
2. **"`guard.ts` — the single NestJS guard."** A Guard cannot see the principal or the
   plan; this is settled in the codebase and documented in
   [permissions/guard.ts](../../backend/src/common/permissions/guard.ts), which contains
   no guard for that reason. Resolved by D2 — an interceptor, and the constitution's
   third table row needs the same correction v1.4.0 applied to the first two.

Two things the draft did not reach, both found by reading the interceptors:

3. **The platform and identity surfaces bypass every archetype check today**, so eight
   of twenty-one matrix rows sit on code paths no decision has ever run on. D2 puts the
   decision on all three surfaces, which is also what closes FR-019 properly.
4. **Rows 9 and 10 cannot be archetype-decided at all.** D8.
