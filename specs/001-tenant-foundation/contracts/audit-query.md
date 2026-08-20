# Contract: Audit Query

**Surface**: tenant application. Requires an active tenant context
([tenant-context.md](./tenant-context.md)). Runs under the application database role.

Base path: `/audit`

Covers US05-EP00-FND. FR-013: queryable by an authorized role, scoped to own tenant,
returned in bounded portions.

---

## GET /audit/events

**Query parameters**

| Name | Type | Rules |
|---|---|---|
| `from` | RFC 3339 | optional; defaults to 24 months before now |
| `to` | RFC 3339 | optional; defaults to now |
| `action` | string | optional, repeatable; filters to the given actions |
| `targetEntity` | string | optional |
| `targetId` | uuid | optional |
| `limit` | integer | optional, default 50, maximum 200 |
| `cursor` | opaque | optional |

`from` and `to` are clamped to the 24-month retention window (FR-019). A `from`
older than the window is silently clamped rather than rejected, and the response
reports the window actually served — a caller asking for three years gets two years
plus an explicit statement of that, instead of a silently short answer that looks
complete.

Supplying a time bound matters for more than filtering: it lets the planner prune
partitions, which is what keeps SC-010's three-second first page reachable as
history grows ([D7](../research.md#d7--monthly-range-partitioning-carries-retention-and-the-latency-target)).

**`200 OK`**

```json
{
  "items": [
    {
      "id": "3b7e...",
      "occurredAt": "2026-08-19T18:04:11Z",
      "action": "tenant.plan_changed",
      "actor": { "identityId": "a41f...", "membershipId": "77c2..." },
      "targetEntity": "tenant",
      "targetId": "9f1c...",
      "source": { "channel": "interactive", "clientClass": "web" },
      "metadata": { "from": "profesional", "to": "premium" }
    }
  ],
  "nextCursor": "eyJvIjoiMjAy...",
  "servedWindow": { "from": "2024-08-19T00:00:00Z", "to": "2026-08-19T18:40:00Z" }
}
```

`tenantId` is absent from every item by construction. Results can only be the
caller's own tenant, so returning it would be noise — and its absence is a small
reminder that scoping is not this endpoint's job.

**Errors**

| Status | `code` | Cause |
|---|---|---|
| `400` | `validation_failed` | Malformed dates, `from` after `to`, `limit` out of range, bad cursor |
| `403` | `not_authorized` | The caller's membership archetype does not permit reading the audit log |
| `404` | `not_found` | Reserved for `targetId` naming a resource of another tenant — indistinguishable from a resource that does not exist |

`403` here is about the caller's own tenant's log and reveals nothing cross-tenant,
so it is safe. The `404`-not-`403` rule in the [README](./README.md) applies to
cross-tenant reach, which is a different question.

**Audit**: one `audit.queried` entry per **interactive** call, target `audit_event`,
with the filters in `metadata`. Calls whose `source.channel` is `automated` emit
nothing (FR-025). US4 scenario 3.

---

## Two consequences worth stating before implementation

**Querying the log writes to the log — but only when a person does it. Resolved.**
FR-014 requires `audit.queried` to be audited, so reads are self-recording, and an
automated poller would otherwise add a row that a later poll returns, compounding
without bound. FR-025 now gates emission on `source.channel = 'interactive'`:
monitoring, health checks and export jobs read the log and emit nothing.

This keeps what Principle V is actually after — a record that a *person* looked at
this log — and drops what has no evidentiary value, since a firm has no reason to
find its own monitoring in its audit history. The `source.channel` field already
existed on every entry, so nothing in the schema changed.

The test asserts both directions ([quickstart.md](../quickstart.md) V9): an
interactive read adds exactly one entry, an automated read adds none. One direction
alone is insufficient — an implementation that recorded nothing would pass the
automated half while breaking FR-014.

**"Authorized role" is not fully deliverable inside this slice.** FR-013 requires an
authorized role, but the constitution mandates that permissions be enforced by a
*global guard* and states that applying such a concern per endpoint is a design
violation — and that guard is slice 004. The `403` above therefore depends on
machinery this slice does not own. Two ways forward:

- **(a) Recommended.** Slice 001 installs the guard as a global shell that resolves the active membership's archetype and permits only SA, with slice 004 filling in the full matrix behind the same seam. Keeps the mechanism global from the first endpoint and keeps this contract whole.
- **(b)** Move `GET /audit/events` into slice 004, leaving 001 with audit *writing* only. Keeps slices strictly separate at the cost of US05 not shipping with its own slice.

This is flagged in [plan.md](../plan.md) as an open coupling for the CC technical
lead rather than resolved unilaterally, because (b) changes the scope of two specs.
