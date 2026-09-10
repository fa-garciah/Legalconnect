# Contract: Authentication — Credential Step, Challenge Step, Session Emission

**Surface**: public. No identity is resolved when these routes are called; resolving one is
what they do. Runs under `lc_auth`'s connection for verification, never under an identity
or tenant context.

Base path: `/auth`.

Covers `US06-EP12-ASC-AuthenticateWithMFA` (FR-001 to FR-005, FR-018 to FR-022, FR-033 to
FR-038, FR-056).

**Not gated by `004`** — see [README.md](./README.md#these-routes-are-ungated-and-that-is-correct).

---

## POST /auth/sign-in

The credential step. Verifies a credential and, on success, begins a second-factor
challenge. **Emits no session** (FR-003).

**Request**

```json
{ "email": "persona@despacho.mx", "password": "…" }
```

**`200 OK` — credential accepted, second factor required**

```json
{
  "challengeToken": "opaque…",
  "next": "factor"
}
```

`challengeToken` is short-lived, single-use, and carries no identity information the client
can read. It is the state that makes the challenge step reachable — the "state, not
capability" gate the README describes.

`next` is `"factor"` when the identity has a confirmed factor, and `"enrollment"` when it
does not (FR-006, US1 scenario 7). An unenrolled identity is routed to
[enrollment.md](./enrollment.md) and reaches no authenticated capability on the way.

**`401` — the single uniform refusal**

Returned identically for: an email with no identity, a wrong credential, and an identity
locked under FR-005. No field, status or timing distinguishes them (SC-017).

```json
{ "error": "authentication_failed", "message": "No fue posible completar el acceso." }
```

**Audited**: `signin.failed` on refusal, with `tenant_id NULL` and no email in the entry
(FR-043, FR-045). `account.locked` when the 5th consecutive failure trips the threshold.

---

## POST /auth/factor

The challenge step. Verifies a TOTP code and emits the session.

**Request**

```json
{ "challengeToken": "opaque…", "code": "492013" }
```

**`200 OK` — signed in**

```json
{
  "accessToken": "opaque…",
  "refreshToken": "opaque…",
  "expiresAt": "2026-09-09T16:45:00Z"
}
```

Exactly one session is emitted (FR-033, SC-002). `expiresAt` is **15 minutes** from
issuance (FR-035). Both tokens are opaque high-entropy values, stored server-side only as
digests ([research D2](../research.md#d2--the-access-credential-is-an-opaque-high-entropy-token-not-a-signed-jwt)).

**The response carries no tenant and no archetype** (FR-037). Which firms this person may
reach is a separate call to `002`'s enumerate-own-memberships route, and the active tenant
is named per request as it always was.

**Verification rules applied here**

| Rule | Requirement |
|---|---|
| Acceptance window | 30-second step, previous/current/next accepted — 90 seconds (FR-056) |
| Replay | A code already used successfully is refused anywhere in that window (FR-020) |
| Counter | 5 consecutive failures → 15-minute lockout; success resets to zero (FR-021) |
| Backup codes | Accepted here in place of a generated code — see [recovery.md](./recovery.md) (FR-027) |
| Lockout disclosure | A locked identity is refused indistinguishably from a wrong code (FR-055) |
| Key unavailable | Fails closed, indistinguishably from a wrong code (FR-017) |

**`401`** — the same uniform body, for a wrong code, an expired or unknown
`challengeToken`, a replayed code, a locked identity, and an unavailable key.

**Audited**: `signin.succeeded` or `challenge.failed`, `tenant_id NULL`, identity by
reference, never the code.

---

## POST /auth/refresh

Rotates the refresh credential and issues fresh access.

**Request**

```json
{ "refreshToken": "opaque…" }
```

**`200 OK`** — a new pair, same shape as `/auth/factor`'s response. The presented token is
marked used in the same transaction (FR-035).

**`401` — reuse detected**

Presenting an already-rotated token **revokes the entire family** descended from that
authentication, and every session belonging to it (FR-036, SC-019). The response is the
uniform refusal; the revocation is not announced.

Enforced inside one function under `SELECT … FOR UPDATE` on the family, so two
simultaneous presentations of the same used token cannot both succeed
([research D8](../research.md#d8--session-resolution-refresh-rotation-and-family-revocation-are-each-one-security-definer-function)).

---

## The per-request validation this contract establishes

Not a route, but the mechanism every other route in the product now depends on (FR-034):

Each request presents its access token. The guard hashes it and calls `resolve_session()`,
which returns an identity reference and an expiry, or nothing. `lc_app` holds **no grant on
the session table at all** — the function is its only view of session state
([research D8](../research.md#d8--session-resolution-refresh-rotation-and-family-revocation-are-each-one-security-definer-function)).

Validity is never inferred from the token itself. There is nothing in an opaque token to
infer it from, which is the point of choosing one.

Once the identity is resolved, `002`'s existing mechanism proceeds unchanged: `x-tenant-id`
names the tenant, `membership` is consulted, the archetype is read from the resolved
membership, and `mfa_not_enrolled` refuses ahead of everything else. **This slice adds a
step in front of that chain and changes nothing inside it.**

---

## Boundary with `005`

This contract emits a session and defines how it is validated and renewed. It does **not**
define:

- idle or absolute expiry by role class — the 15 minutes here is the access lifetime the
  constitution fixes, not a session-lifetime policy;
- explicit sign-out;
- revocation on tenant deactivation;
- session enumeration or individual revocation (`US09`, `US10`);
- step-up MFA (`US12`).

All `005`. The columns those extensions read — `device_metadata`, `revoked_at`,
`family_id` — are emitted here so that `005` extends the mechanism rather than replacing it
(FR-038).
