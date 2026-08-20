# Runbook: Platform Administration

Operator guide for provisioning tenants, deactivating them, and changing plans
and limits. Covers only what `001-tenant-foundation` ships — see
[contracts/platform-admin.md](../specs/001-tenant-foundation/contracts/platform-admin.md)
for the full contract.

## Before you start

- **This surface authenticates nothing.** It is bound to `127.0.0.1` by
  `backend/src/main.ts` and must never be exposed to a network before slice 003
  supplies session and MFA handling. Run these commands from the same host the
  API is running on, or over an SSH tunnel — never through a public load
  balancer or port-forward.
- Base URL below assumes the default `PORT=3000` from `backend/.env.example`.
- Every operation here writes an audit entry. There is no way to perform any of
  them silently, by design (Principle V).

## Provision a new tenant

```bash
curl -s -X POST http://127.0.0.1:3000/internal/platform/tenants \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Despacho Ejemplo, S.C.",
    "rfc": "DEJ091203ABC",
    "planCode": "profesional"
  }'
```

`rfc` must be unique, 12 characters (moral person) or 13 (physical person),
uppercase, matching the standard RFC shape. A duplicate returns
`409 rfc_already_registered` — this is a database constraint, not a
read-then-write check, so retrying with a different RFC is the only fix, never
a retry of the same request.

Record the returned `id`. Nothing else identifies this tenant on this surface.

## Read a tenant's registry entry

```bash
curl -s http://127.0.0.1:3000/internal/platform/tenants/<tenantId> \
  -H 'x-channel: interactive'
```

`x-channel: interactive` (or omitting the header — it defaults to interactive)
records one `tenant.registry_read` entry in that tenant's own log. If you are
scripting a health check or a report against this endpoint, send
`x-channel: automated` instead, or every run will add to the tenant's audit
history for no operational reason (FR-026).

## Deactivate a tenant

```bash
curl -s -X POST http://127.0.0.1:3000/internal/platform/tenants/<tenantId>/deactivate
```

**This is one-way.** There is no reactivation endpoint in this slice, by design
— `spec.md` specifies deactivation as one-way, and adding an undo path requires
a spec amendment, not a code change here. Nothing is deleted: files, audit
history and backups are retained. A second call returns
`409 already_deactivated`.

## Change a tenant's plan

```bash
curl -s -X PATCH http://127.0.0.1:3000/internal/platform/tenants/<tenantId>/plan \
  -H 'Content-Type: application/json' \
  -d '{ "planCode": "premium" }'
```

If the target tier's limits are below the tenant's **current** tier's limits,
you get `409 limits_exceeded` naming which limits and by how much:

```json
{
  "error": { "code": "limits_exceeded", "message": "..." },
  "exceeded": [{ "limit": "users", "current": 100, "target": 10 }]
}
```

**Read this carefully before re-sending with acknowledgement.** This slice
tracks no real business usage (no case files, no user accounts exist yet) —
`current` is the tenant's *current plan's own ceiling*, not measured
consumption. The 409 is a sanity prompt ("you're moving to a much smaller
tier"), not proof the tenant actually fits. Confirm the real situation with the
firm before proceeding:

```bash
curl -s -X PATCH http://127.0.0.1:3000/internal/platform/tenants/<tenantId>/plan \
  -H 'Content-Type: application/json' \
  -d '{ "planCode": "premium", "acknowledgeExceededLimits": true }'
```

Requesting the plan the tenant is already on returns `422 same_plan` — this is
not an error to retry, it means there is nothing to do.

## Adjust a tier's limits

Affects **every tenant currently on that tier** — there is no per-tenant
override.

```bash
curl -s -X PATCH http://127.0.0.1:3000/internal/platform/plans/esencial/limits \
  -H 'Content-Type: application/json' \
  -d '{ "limits": { "users": 15, "storageBytes": 21474836480, "monthlyCfdi": 75 } }'
```

Send the **complete** limits object — this replaces the stored value, it does
not merge partial fields. Negative or non-integer values return
`400 validation_failed`.

## Reading audit history across tenants

```bash
curl -s "http://127.0.0.1:3000/internal/platform/audit?limit=50" -H 'x-channel: interactive'
curl -s "http://127.0.0.1:3000/internal/platform/audit?tenantId=<tenantId>" -H 'x-channel: interactive'
```

Unfiltered, this spans every tenant — use `tenantId` to scope to one firm.
`from`/`to` are clamped to the 24-month retention window; the response's
`servedWindow` reports what was actually served if your request asked for
more. Results are paginated — follow `nextCursor` for the next page.

## If something looks wrong

- **A tenant seems reachable that shouldn't be**: this endpoint runs under the
  platform database role, which is *supposed* to reach every tenant's `tenant`,
  `plan` and `audit_event` rows (research.md D9) — that is not a leak. A leak
  is a *business* table (none exist in this slice) becoming reachable across
  tenants, which this role cannot do by grant.
- **An operation seems to have happened but nothing shows in the audit log**:
  check `x-channel` — `tenant.registry_read` and `audit.queried` are recorded
  only for `interactive` reads (FR-025, FR-026). Every other operation here
  records unconditionally; if one of those is missing an entry, stop and treat
  it as an incident, not a config issue — see D6: an unaudited mutation is
  supposed to be structurally impossible.
