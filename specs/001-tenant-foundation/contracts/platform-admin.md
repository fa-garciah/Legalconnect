# Contract: Platform Administration

**Surface**: internal, no tenant context. Runs under the platform database role
([D9](../research.md#d9--the-platform-administration-context-is-a-second-role-not-a-privileged-path)).
Not network-exposed in this slice — see [README](./README.md#authentication-status-stated-plainly).

Base path: `/internal/platform`

Covers US01 (provision), US02 (plan) and the deactivation half of US03. Every
operation here emits an audit entry; the operations and their entries are the whole
point of the surface.

**Reach is deliberately narrow.** The platform role touches `tenant`, `plan` and
`audit_event` only. It holds no access to business tables, because no requirement in
this slice needs cross-tenant reach into case files and granting it would recreate
exactly the exposure Principle II exists to remove.

---

## POST /internal/platform/tenants

Provision a firm as an isolated tenant. FR-001, FR-007. One transaction — a failure
leaves no partial tenant (US3 scenario 5).

**Request**

```json
{
  "name": "Despacho Ejemplo, S.C.",
  "rfc": "DEJ091203ABC",
  "planCode": "profesional"
}
```

| Field | Rules |
|---|---|
| `name` | required, non-empty after trim |
| `rfc` | required, 12 or 13 characters, uppercase, valid RFC shape, unique across tenants |
| `planCode` | required, one of `esencial` / `profesional` / `premium` |

**`201 Created`**

```json
{
  "id": "9f1c...",
  "name": "Despacho Ejemplo, S.C.",
  "rfc": "DEJ091203ABC",
  "planCode": "profesional",
  "status": "active",
  "createdAt": "2026-08-19T18:04:11Z"
}
```

**Errors**

| Status | `code` | Cause |
|---|---|---|
| `400` | `validation_failed` | Missing or malformed `name`, `rfc` or `planCode` |
| `409` | `rfc_already_registered` | An existing tenant holds that RFC |

`409` is raised by the unique constraint, not by a read-then-write check, so two
concurrent requests carrying the same RFC cannot both succeed.

**Audit**: one `tenant.provisioned` entry, target `tenant`, written in the same
transaction. If it cannot be written the tenant is not created (FR-017).

---

## POST /internal/platform/tenants/{tenantId}/deactivate

Move a tenant to `deactivated`. FR-006. Records are retained; no delete path exists
on this surface or any other.

**Request**: empty body.

**`200 OK`**

```json
{ "id": "9f1c...", "status": "deactivated", "deactivatedAt": "2026-08-19T18:22:40Z" }
```

**Errors**

| Status | `code` | Cause |
|---|---|---|
| `404` | `not_found` | No such tenant |
| `409` | `already_deactivated` | Already in that state |

**Audit**: one `tenant.deactivated` entry.

**Effect elsewhere**: the tenant-context mechanism refuses to activate a
deactivated tenant, which makes every downstream path inert without its own check
([D13](../research.md#d13--deactivation-refuses-activation-and-keeps-the-data)).
Revoking sessions already held is slice 003.

---

## PATCH /internal/platform/tenants/{tenantId}/plan

Change a tenant's iguala tier. FR-004 — takes effect with no deployment.

**Request**

```json
{ "planCode": "premium", "acknowledgeExceededLimits": false }
```

**`200 OK`**

```json
{ "id": "9f1c...", "planCode": "premium", "changedAt": "2026-08-19T18:31:02Z" }
```

**Errors**

| Status | `code` | Cause |
|---|---|---|
| `404` | `not_found` | No such tenant |
| `409` | `limits_exceeded` | Target tier's limits are below current consumption |
| `422` | `same_plan` | Already on that tier |

**`409` body**, satisfying US5 scenario 4 — the operator is told *which* limits
before confirming:

```json
{
  "error": { "code": "limits_exceeded", "message": "Target plan limits are below current usage." },
  "exceeded": [ { "limit": "users", "current": 42, "target": 25 } ]
}
```

Re-sending with `acknowledgeExceededLimits: true` completes the change. Nothing in
this slice enforces the limits — enforcement is slice 004 — so this is a warning
gate for the operator, not a technical constraint. Stated so the distinction is not
mistaken for enforcement.

**Audit**: one `tenant.plan_changed` entry, with previous and new tier in `metadata`.

---

## PATCH /internal/platform/plans/{planCode}/limits

Adjust a tier's quantitative limits. FR-016 — no deployment. Affects every tenant on
that tier.

**Request**

```json
{ "limits": { "users": 50, "storageBytes": 214748364800, "monthlyCfdi": 500 } }
```

**`200 OK`**: the updated plan.

**Errors**: `400 validation_failed` (negative or non-integer), `404 not_found`.

**Audit**: one `plan.limits_changed` entry, target `plan`, previous and new values in
`metadata`.

> FR-014 has been **amended** to name this event, so it is now one of seven audited
> operations rather than an unlisted proposal. Changing a tier's ceiling affects every
> tenant on it, and leaving it unaudited contradicted Principle V. See
> [data-model.md](../data-model.md#action-vocabulary-for-this-slice).

---

## GET /internal/platform/tenants/{tenantId}

Read a tenant's commercial identity and tier. Per the permission matrix, the
Platform Operator reads across tenants; this is not a membership.

**`200 OK`**: same shape as the provisioning response, plus `deactivatedAt`.

**Errors**: `404 not_found`.

**Audit**: one `tenant.registry_read` entry per **interactive** call (FR-026).
Automated reads emit nothing — the same channel rule as `audit.queried`. This was
previously unaudited and is now closed: the registry carries every firm's name, RFC
and commercial plan, so browsing it is exactly the access Principle V wants traced.

---

## GET /internal/platform/audit

Cross-tenant audit read for the platform context. Same query grammar as
[audit-query.md](./audit-query.md), with two differences: `tenantId` is an accepted
filter rather than being implicit, and results may span tenants.

**Audit**: one `audit.queried` entry per **interactive** call, with
`actor_identity_id` null and the platform context named in `metadata`. Automated
platform reads emit nothing, per FR-025 — the same rule as the tenant-facing
endpoint, so a monitoring job pointed at either surface stays out of the log.
