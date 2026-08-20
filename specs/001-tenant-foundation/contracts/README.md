# Contracts: Tenant Foundation & Audit Log

**Feature**: `001-tenant-foundation` | **Date**: 2026-08-19

REST over JSON. The constitution prohibits GraphQL for the MVP ("no multiple
consumers justify it") and puts microservices, CQRS and WebSockets out of scope, so
these are plain HTTP resources inside one modular monolith.

This slice exposes three contracts, on two deliberately separate surfaces plus one
internal mechanism.

| Contract | Surface | Consumer |
|---|---|---|
| [platform-admin.md](./platform-admin.md) | Platform administration — no tenant context | Cosmic Chimps operators |
| [audit-query.md](./audit-query.md) | Tenant application — requires an active tenant | An authorized member of a firm |
| [tenant-context.md](./tenant-context.md) | Internal mechanism, not HTTP | Every request and job in the system |

The two HTTP surfaces are separate on purpose. Per
[D9](../research.md#d9--the-platform-administration-context-is-a-second-role-not-a-privileged-path),
platform operations run under a different database role on a different connection
and never traverse the tenant middleware — so there is no "disable isolation" flag
sitting on the path every business request takes.

No user interface is delivered by this slice. `spec.md` assumes none, and
provisioning is an internal operation rather than a user-facing flow (FR-009).

## Conventions

**Media type**: `application/json`.

**Identifiers**: UUID v4 in path and body. `plan` is addressed by its `code`
(`esencial` / `profesional` / `premium`) since exactly three exist.

**Timestamps**: RFC 3339 with offset, always UTC, always server-generated.

**Pagination**: opaque forward cursor. Requests take `limit` (default 50, maximum
200) and `cursor`; responses return `items` and `nextCursor` (`null` at the end).
FR-013 requires bounded portions, so there is no unbounded variant.

**Error body**:

```json
{ "error": { "code": "string", "message": "string" } }
```

`message` is safe to show a user and never contains a secret, a raw identifier from
another tenant, or an internal detail.

**The one response rule that carries a principle**: any attempt to reach another
tenant's resource returns `404` with a generic body — identical to the response for
a resource that genuinely does not exist. Never `403`, which would confirm
existence. `spec.md` FR-008 and AS-02; the constitution's Principle II verification
clause states it as `404/403, never 200`, and this slice picks `404` because `403`
still discloses.

**Every such attempt is recorded** against the targeted tenant, deliberately without
naming the actor's home tenant — see
[D8](../research.md#d8--recording-a-cross-tenant-attempt-without-leaking-the-actors-other-tenants).

## Authentication status, stated plainly

This slice authenticates nothing. Identity, sessions and MFA are slices 002, 003 and
005; the tenant-context mechanism receives an already-authenticated principal.

**Therefore neither HTTP surface may be exposed to a network before slice 003
lands.** The platform administration surface in particular performs unauthenticated
tenant creation and plan changes if reachable. During this slice it is bound to
localhost and exercised by tests only. This is a deployment constraint, not a
suggestion.

The constitution additionally mandates step-up MFA for creating and deactivating
users and for permission matrix changes. Tenant provisioning and deactivation are
the same class of operation, so step-up should be required on the platform surface
once the mechanism exists in slice 005. Recorded here so it is not lost between
slices.
