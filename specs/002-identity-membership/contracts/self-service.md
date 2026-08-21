# Contract: Self-Service — Accept Invitation & Enumerate Own Memberships

**Surface**: identity-only. No tenant is active for either route in this
contract — that is the point of both. Runs under the ordinary application role,
with `app.identity_id` set and `app.tenant_id` unset.

Base path: `/identity`.

Covers `US18-EP12-ASC-AcceptInvitation` and the enumeration half of
`US19-EP12-ASC-SelectActiveTenant` (FR-017) — choosing *which* tenant to activate
happens through the existing tenant-context mechanism (`x-tenant-id`), not
through a route in this contract; what belongs here is seeing the choices at all.

---

## POST /identity/invitations/{reference}/accept

Accept a valid invitation. FR-023 through FR-026.

**Not tenant-scoped — no `x-tenant-id` is read or honoured here.** `{reference}`
is the raw token from the invitation email/URL, hashed on arrival and matched
against `invitation.reference_hash` (D2); it is never the row's `id`.

**Headers** (D10's stand-in for slice 003's real verification):

| Header | Meaning |
|---|---|
| `x-subject` | The IdP subject identifier for the person accepting |
| `x-email` | The authenticated email, checked against the invitation's `invited_email` (FR-024) |

**Request**: empty body.

**`200 OK`**

```json
{ "identityId": "7a2c...", "membershipId": "b910...", "tenantId": "9f1c..." }
```

This is the one response in this slice that returns `tenantId` directly to the
caller, deliberately: the person just proved they hold this specific access by
successfully consuming the reference, so naming the tenant here discloses nothing
beyond what they just did. It is not equivalent to being told a *different*
tenant exists.

**The one refusal, covering every failure this endpoint can have**

```json
{ "error": { "code": "invitation_invalid", "message": "This invitation cannot be accepted." } }
```

**`400`**, for every one of: no such reference, expired, already accepted,
revoked, tenant deactivated, email mismatch, or the per-reference attempt
threshold exceeded ([D8](../research.md#d8--enumeration-resistance-thresholds-are-concrete-configuration)). FR-022 and FR-034 require these to be
observably identical; this contract makes that a single response shape rather
than a rule six different code paths have to individually remember. `400`, not
`404`: there is no tenant-existence question to protect at this boundary (the
caller does not yet know or need to know whether a tenant is on the other end of
a bad reference), but FR-028's email-enumeration question still applies, which is
what the single generic body protects regardless of status code choice.

**Concurrency**: two simultaneous accept attempts against the same reference are
serialised by `accept_invitation`'s own transaction and the `UNIQUE` constraint
implied by `status = 'pending'` being consumed exactly once; the loser sees the
same generic refusal a second, later attempt would (SC-005).

**Audit**: `identity.created` (if new) and `membership.created` on success, in
the invitation's tenant. `invitation.refused` on the generic-refusal branch, with
no field in the entry distinguishing which of the six causes applied (FR-034).

---

## GET /identity/memberships

Enumerate the caller's own live memberships. FR-017.

**Headers**: `x-identity-id` — the caller's already-resolved identity (same
header shape as the tenant-application surface's principal, reused here since by
this point in the flow the identity does exist).

**`200 OK`**

```json
{
  "items": [
    { "membershipId": "b910...", "tenantId": "9f1c...", "archetype": "AA" },
    { "membershipId": "c021...", "tenantId": "a331...", "archetype": "CC" }
  ]
}
```

Every live membership, across every tenant, in one list — this is the one
deliberate exception to "a tenant never sees another tenant's data," because
there is no tenant active here at all. The read is scoped to the *identity*, not
to any tenant, which is exactly what D3's second RLS policy exists to make safe.

**Not reachable from a tenant session.** There is no tenant-scoped route that
calls this, and the underlying query only ever runs with `app.tenant_id` unset —
attempting to reach it with a tenant active would still only return this same
identity-scoped result, never a tenant's members, because the policy that grants
the read is keyed on `app.identity_id`, not on whether a tenant happens to also be
set.

**Errors**: none beyond the shared error body — an identity with zero live
memberships gets back `{ "items": [] }`, not an error (FR-011: the identity
remains valid).

**Audit**: none. Reading one's own membership list is not in FR-031's
vocabulary — it is the identity looking at itself, not an access to another
party's data.
