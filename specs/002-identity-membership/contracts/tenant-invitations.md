# Contract: Tenant Invitations & Membership Management

**Surface**: tenant application — requires an active tenant, resolved by 001's
unchanged tenant-context mechanism now backed by real data. Runs under the
ordinary application role.

Base path: `/tenant/invitations`, `/tenant/memberships`.

Covers `US01-EP12-ASC-InviteUser`, `US04-EP12-ASC-RejectExpiredInvitation`, and
the Membership functional requirements (FR-009, FR-012) that back the permission
matrix's "revoke membership" and "change membership archetype" rows.

---

## POST /tenant/invitations

Issue an invitation into the active tenant. FR-019, FR-020, FR-021.

**Requires**: `SA` or `MP` archetype (`@RequireArchetypes('SA', 'MP')`).

**Request**

```json
{ "email": "colega@example.com", "targetArchetype": "AA" }
```

| Field | Rules |
|---|---|
| `email` | required |
| `targetArchetype` | required, one of the ten membership-capable codes; MUST NOT be broader than the issuer's own archetype (FR-021) |

**`201 Created`**

```json
{
  "id": "9f1c...",
  "targetArchetype": "AA",
  "status": "pending",
  "issuedAt": "2026-08-21T18:04:11Z",
  "expiresAt": "2026-08-28T18:04:11Z"
}
```

Note what is absent: the response never echoes `email` back, and never includes
the raw reference token or its hash — the token is delivered only through the
invitation email itself (D7), never through this endpoint's response body. This
is what FR-005 (US5) scenario 1 requires holding even for the issuer's own
successful call: an issuer inviting an email that already holds a live membership
in this tenant gets back the identical `201` shape (FR-029), not a distinguishing
error.

**Errors**

| Status | `code` | Cause |
|---|---|---|
| `400` | `validation_failed` | Missing/malformed `email` or `targetArchetype` |
| `403` | `not_authorized` | Caller's archetype is not `SA`/`MP`, or `targetArchetype` is broader than the caller's own (FR-021) |
| `404` | *(generic, 001's shape)* | The active tenant is deactivated — surfaced by the tenant-context mechanism before this handler runs, not by this endpoint |

**Audit**: one `invitation.issued` entry, target `invitation`, in the issuer's
tenant. `metadata` carries `targetArchetype`; never `email` (the existing
sanitiser refuses it if attempted).

---

## POST /tenant/invitations/{id}/revoke

Revoke a pending invitation before it is accepted. FR-019 (US2 scenario 5).

**Requires**: `SA` or `MP`, and the invitation's own tenant must be the active
one (enforced by the tenant-scoped `UPDATE` grant — a cross-tenant `id` finds no
row, and the response is 001's generic not-found, not a distinguishing one).

**Request**: empty body.

**`200 OK`**

```json
{ "id": "9f1c...", "status": "revoked", "revokedAt": "2026-08-21T19:00:00Z" }
```

**Errors**

| Status | `code` | Cause |
|---|---|---|
| `404` | *(generic)* | No such invitation in the active tenant, or already accepted/revoked |

A revoke against an already-accepted or already-revoked invitation answers the
same generic `404` a genuinely absent `id` would — consistent with FR-022's
"observably identical" requirement extended to this endpoint too, even though
FR-022 is written from the acceptor's side.

**Audit**: one `invitation.revoked` entry.

---

## GET /tenant/invitations

List the active tenant's pending invitations. Permission matrix: SA/MP, read,
own tenant.

**Requires**: `SA` or `MP`.

**`200 OK`**: paginated (001's cursor convention), each item shaped as the
`POST` response above — no `email`, no token.

**Audit**: none. Reading a list of one's own tenant's pending invitations is not
in FR-031's vocabulary; nothing here reads across a boundary that needs tracing
the way the platform registry read did in 001.

---

## PATCH /tenant/memberships/{id}/revoke

Revoke a membership. FR-009, FR-010. A separate route from archetype change,
not a body switch on one endpoint — `@Audited` declares one fixed action per
route, the same reason `PATCH .../plan` and `PATCH .../plans/{code}/limits`
(001) are two routes rather than one.

**Requires**: `SA` or `MP`.

**Request**: empty body.

**`200 OK`**: the updated membership, same shape as an enumeration item (see
`self-service.md`).

**Errors**

| Status | `code` | Cause |
|---|---|---|
| `404` | *(generic)* | No such membership in the active tenant |
| `409` | `already_revoked` | Revoking an already-revoked membership |

**Effect elsewhere**: revocation takes effect on the *next* request that attempts
to use that membership (FR-010) — this endpoint does not, and per `spec.md`
cannot, terminate a session already in progress. That is slice 005.

**Audit**: one `membership.revoked` entry.

---

## PATCH /tenant/memberships/{id}/archetype

Change a membership's archetype without destroying and recreating it. FR-012.

**Requires**: `SA` only — the permission matrix reserves this to `SA` until
slice 004 settles the global matrix (`plan.md`'s note on this). `MP` may revoke
but not this.

**Request**

```json
{ "archetype": "PL" }
```

**`200 OK`**: the updated membership.

**Errors**

| Status | `code` | Cause |
|---|---|---|
| `400` | `validation_failed` | `archetype` missing or not a valid code |
| `403` | *(Nest's default forbidden shape)* | Caller is not `SA` |
| `404` | *(generic)* | No such membership in the active tenant |

**Audit**: one `membership.archetype_changed` entry, carrying the previous and
new archetype in `metadata`.
