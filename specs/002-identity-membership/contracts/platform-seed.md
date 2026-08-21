# Contract: Platform Seed Invitation

**Surface**: platform administration — no tenant context, extends 001's existing
surface (`@PlatformSurface()`, base path `/internal/platform`). Runs under the
platform role, whose reach this slice narrowly extends
([D6](../research.md#d6--the-seed-capability-narrowly-extends-the-platform-roles-reach)).
Not network-exposed — see [README](./README.md#authentication-status-stated-plainly--unchanged-from-001-extended-to-new-headers).

Covers `US16-EP00-FND-SeedFirstAdministrator`, FR-035.

**Reach is deliberately narrower than the two grants suggest.** The platform
role can now count `membership` rows and insert a `seeded` `invitation` row — it
still cannot read a tenant's membership *roster*, still cannot touch `identity`,
and still cannot reach any business table. This one capability is the entire
extension.

---

## POST /internal/platform/tenants/{tenantId}/seed-administrator

Issue the first `SA` invitation for a tenant that has no members yet.

**Request**

```json
{ "email": "primer.socio@example.com" }
```

| Field | Rules |
|---|---|
| `email` | required |

There is no `targetArchetype` field — it is always `SA` (FR-035, check
constraint at the data layer, not merely a default the request could override).

**`201 Created`**

```json
{
  "id": "9f1c...",
  "tenantId": "a331...",
  "targetArchetype": "SA",
  "seeded": true,
  "issuedAt": "2026-08-21T18:04:11Z",
  "expiresAt": "2026-08-28T18:04:11Z"
}
```

**Errors**

| Status | `code` | Cause |
|---|---|---|
| `400` | `validation_failed` | Missing/malformed `email` |
| `404` | `not_found` | No such tenant |
| `409` | `tenant_already_has_members` | The tenant holds at least one live membership — the capability has already extinguished itself (US6 scenario 2) |
| `409` | `tenant_deactivated` | The tenant is deactivated |

**`409 tenant_already_has_members` is not a disclosure risk the way other 409s
in this system might be.** The caller is the platform operator, who already
knows the tenant's full state through the existing platform surface (001) — this
response tells them nothing they could not already see by reading the tenant's
registry entry or its own membership count through a legitimate platform read.
It is the one place in this slice where a specific, informative error is correct
rather than a generic refusal, precisely because the caller here is never the
party FR-028's enumeration resistance is protecting anyone from.

**A seed invitation that expires unaccepted, with the tenant still at zero live
memberships, does not block issuing another** (US6 scenario 5) — there is no
"one seed invitation ever" rule, only "zero live memberships," so the `409` above
is the only gate, and it clears itself the moment it would matter.

**Audit**: one `invitation.seed_issued` entry, target `invitation`, against the
target tenant, with `actor_identity_id` and `actor_membership_id` both `null`
(the `PLATFORM_ACTOR` shape, 001) — the operator is recorded as having acted, but
never as a member of the tenant it acted on.

**What this endpoint explicitly does not do**: create a membership, create an
identity, or grant the platform operator any read access to the tenant's data as
a side effect (US6 scenario 3). It inserts exactly one row in exactly one table.
