# Contract — The Refusal Protocol

**Feature**: `004-authorization-entitlements` | **Constitution**: v1.4.0
**Status**: normative for every slice downstream of 004.

> **Every later slice consumes this contract and does not restate it.** A domain slice
> that describes its own refusal semantics is describing a second source of truth. Cite
> `004/contracts/refusal.md` and add only the rows of the capability registry it
> introduces.

---

## 1. The four reasons, in their fixed order

Exactly one reason is returned per refused request, always the earliest that applies
(FR-022). The order is a constant in `common/authz/refusal.ts`; nothing may reorder it
per endpoint, because no endpoint can reach it.

| Order | Reason | The question it answers | Remedy | Decided by |
|---|---|---|---|---|
| 1 | `mfa_not_enrolled` | Has this identity completed second-factor enrollment? | Enroll | `resolvePrincipal` (002) |
| 2 | `permission` | Does this archetype hold this capability at all? | Change role | `MATRIX` |
| 3 | `scope` | Does this caller hold it over **this** entity? | Get assigned | `ScopeResolver` |
| 4 | `entitlement` | Does the tenant's plan include it, and is it within limits? | Upgrade plan | `plan.entitlements` / `plan.limits` |

**Reason 1 is enforced upstream and is not re-checked.** `TenantContextInterceptor`
refuses an unenrolled membership before `AuthorizationInterceptor` runs at all, so the
ordering is a property of the interceptor order rather than of a repeated test. It is
named in the ordering constant so the constant is complete and so
`refusal-ordering.test.ts` can assert all four in one place.

**Why this order and not another.** It never reveals that an entity exists to a caller
whose archetype could not have touched it anyway. Permission is evaluated before scope
because an archetype that does not hold a capability must not learn, from the shape of
its refusal, whether the target exists. Entitlement is last because it is the only
reason whose remedy is commercial, and a caller who reaches it has already proved they
would otherwise be allowed through.

---

## 2. Wire mapping

| Reason | Status | `error.code` | Body carries |
|---|---|---|---|
| `mfa_not_enrolled` | 403 | `mfa_enrollment_required` | nothing further |
| `permission` | 403 | `not_authorized` | nothing further |
| `scope`, kind `self` | 403 | `not_authorized` | nothing further |
| `scope`, kind `assigned` | **404** ‡ | `not_found` | nothing further |
| `entitlement`, feature flag | 403 | `entitlement_required` | `capability` |
| `entitlement`, quantitative limit | 403 | `limit_reached` | `limit: { key, value }` |
| *no capability declared* (FR-019) | 404 | `not_found` | nothing further |

All bodies use the `ErrorBody` shape already established by
[`common/http/errors.ts`](../../../backend/src/common/http/errors.ts):
`{ "error": { "code": "...", "message": "..." } }`, plus the named field above where the
table says so.

‡ **`assigned` is provisional and nothing in this slice exercises it.** No capability in
004's registry resolves at `assigned` scope, so this row is first observable in the slice
that ships the first `assigned` capability. See research.md D6 for the disclosure
argument and `plan.md` Open Items for the sign-off it needs.

### The two refusals that name something

`entitlement` is the only class permitted to disclose a detail, and only these two
fields, and only to a caller who has already passed permission and scope:

```json
{ "error": { "code": "entitlement_required",
             "message": "Your plan does not include this feature." },
  "capability": "cases.export" }
```

```json
{ "error": { "code": "limit_reached",
             "message": "Your plan's limit for this has been reached." },
  "limit": { "key": "users", "value": 25 } }
```

FR-024 requires the limit be named. `value` is the plan's configured ceiling, never the
tenant's current usage — the ceiling is already visible to the tenant through their own
plan, and the usage count is not something a refusal needs to hand out.

---

## 3. What a refusal must never do

- **Never disclose existence or shape** (FR-023). A 404 from this module is
  byte-identical to `ResourceNotFound` — same status, same code, same message. A caller
  cannot tell a foreign resource from an absent one by comparing responses, which is the
  rule [`errors.ts`](../../../backend/src/common/http/errors.ts) already carries from 001.
- **Never vary by endpoint.** Two endpoints refusing for the same reason produce the same
  status and the same code.
- **Never include personal data of the firm's end clients** (Principle VI). Not in the
  body, not in the message, not in the audit metadata.
- **Never return more than one reason.** `Decision` cannot express two.

---

## 4. Audit consequences

| Situation | Event | Owner |
|---|---|---|
| A refused attempt reaching across tenants | `tenant.cross_access_attempted` | 001 US10, `001/FR-008` — unchanged |
| A refused attempt inside the caller's own tenant | **none** | this contract |
| Any archetype assignment | `membership.archetype_changed` | 002 — unchanged |
| Any plan change | `tenant.plan_changed` | 001 — unchanged |

**This slice adds no audit action.** Cross-tenant refusal already emits its event from
`resolvePrincipal`, before authorization runs, and that path is untouched.

**In-tenant refusals are deliberately silent.** Recording every permission refusal would
let an authenticated member inflate their own firm's audit log by looping a forbidden
endpoint — the same self-amplification argument that put `audit.queried` and
`tenant.registry_read` behind the channel gate of `001/FR-025`, and that kept
`tenant_deactivated` out of `REFUSALS_THAT_AUDIT`. FR-012's blocking coverage of refusal
paths is a *test* obligation, not a logging one.

---

## 5. Declaring a capability on an endpoint

```ts
@Get('audit')
@Capability('audit.read_own_tenant')
async query(...) { ... }
```

Rules, all enforced by test rather than by review:

1. **Every route declares exactly one capability.** A route with none is unreachable
   (FR-019), on every surface — tenant, platform and identity alike.
2. **A capability's id must exist in `CAPABILITIES`.** `@Capability()` takes
   `CapabilityId`, so a typo is a compile error.
3. **Adding a capability requires its matrix row in the same change** (FR-021). `MATRIX`
   is a total `Record<CapabilityId, …>`, so a missing row is a compile error naming the
   capability.
4. **`@PlatformSurface()` and a `tenant`-scoped capability are mutually exclusive**, and
   a test asserts no route carries both — this is how `PO` is provably refused every
   tenant-scoped capability (FR-008, SC-003).

`@RequireArchetypes` is **removed** by this slice. Its four call sites become
`@Capability(...)`. Two mechanisms deciding one rule is how they diverge.

---

## 6. What downstream slices owe this contract

A slice introducing a domain capability adds, in the same PR:

- one row to `CAPABILITIES`, carrying its scope kind and — if the commercial mapping
  says so — its `tier` or `limit` key;
- one row to `MATRIX`, which the compiler will demand anyway;
- `@Capability(...)` on every route it adds;
- the `assigned` resolver, **if** it is the slice that introduces the relationship that
  kind resolves over (FR-015). It registers a provider under `SCOPE_RESOLVERS` from its
  own module and edits no file under `common/authz/`.

It does **not** add: a refusal reason, a status code, a body shape, an ordering, or a
rule authored inside a controller. If a slice believes it needs one of those, the
correct move is to amend this contract, not to work around it.
