# Contract: Sign-Out, Idle/Absolute Expiry, Step-Up MFA

**Surface**: `POST /auth/sign-out` and `POST /auth/step-up` are authentication-module routes, on
`lc_auth`'s connection, requiring an already-resolved session (`SessionGuard`) but no tenant context.
Idle/absolute expiry has no route of its own — it is a refusal any session-bearing request on any
surface can now hit, enforced inside `AuthorizationInterceptor` (`research.md` D4). Step-up's
*consumption* likewise has no route of its own — it is a header any `stepUp: true` capability's route
can now require.

Covers `US08-EP12-ASC-SignOut`, `US07-EP12-ASC-ExpireIdleSession`, `US12-EP12-ASC-
StepUpForSensitiveOperation` (FR-001 to FR-011, FR-016 to FR-022, FR-024 to FR-025).

Base path: `/auth`.

---

## POST /auth/sign-out

**Request**: no body. Identity and session resolved from the presented access token, same as any
other authenticated route.

**`200 OK`** — always, including against an already-dead session (FR-005). No response body content
distinguishes "was live" from "was already dead."

```json
{ "signedOut": true }
```

**Effect**: the presented session's entire refresh-token family is revoked (`sign_out()`,
`research.md` D5) — every `session` row and every `refresh_token` row sharing its `family_id`. Any
other session belonging to the same identity (a different device, a different family) is untouched
(FR-004, User Story 1 scenario 6).

**Audited**: exactly one `session.signed_out` entry, identifying the identity (FR-006).

**No refresh possible afterward**: `POST /auth/refresh` against any token from the now-revoked family
hits `rotate_refresh()`'s existing "presented row revoked → refuse" branch
(`0034_session_and_refresh.sql:191-194`) unchanged — sign-out needed no change to that function.

---

## Idle and absolute expiry — a refusal, not a route

Any request presenting a session whose `now() - last_seen_at` exceeds its role class's idle limit, or
whose `now() - family_created_at` exceeds its absolute limit, is refused with the same response
`SessionGuard` already returns for a missing or unknown token:

**`401`**

```json
{ "error": "unauthenticated", "message": "No autenticado." }
```

Idle-expired, absolute-expired, revoked, and never-existed are four causes behind one response
(FR-005, FR-011). No field distinguishes them, and none needs to — the caller's only correct next
action in all four cases is the same: sign in again.

**Limits applied** (`research.md` D3, values from spec.md FR-007/FR-008, a constitution citation —
not decided here):

| Role class | Idle | Absolute | Applies to |
|---|---|---|---|
| Internal | 8 h | 12 h | `MP`, `AA`, `PL`, `CM`, `BM` |
| `SA` | 30 min | 8 h | `SA`, and any request with no active tenant context (`research.md` D3's default) |
| Portal | 2 h | 24 h | `CC`, `IC`, `CB`, `EL`, third parties |

Evaluated fresh on every request, from `currentPrincipal().archetype` when a tenant is active — so an
archetype change mid-session (`membership.change_archetype`) applies its new limits on the very next
request (FR-010), with no separate mechanism.

**Not reachable from `/auth/sign-in`, `/auth/factor`, `/auth/refresh`, `/auth/sign-out`, or
`/auth/step-up`** — these are auth-surface routes, outside `AuthorizationInterceptor`'s reach, the
same carve-out `003`'s own contract already documents.

---

## POST /auth/step-up

The fresh-verification step for one of the five `stepUp: true` capabilities. Reuses `003`'s TOTP
verification exactly — same `KeyProvider.unwrap()`, same `verifyCode()`, same `identity_factor` row.
No new enrollment, no new factor.

**Request**

```json
{ "capability": "membership.revoke", "code": "492013" }
```

`capability` MUST be one of the five ids `capability.ts` marks `stepUp: true`
(`invitation.issue`, `invitation.revoke`, `membership.revoke`, `membership.change_archetype`,
`invitation.issue_seed`) — any other value is refused before a code is even checked, with the same
`404` an undeclared capability already gets elsewhere in the authorization pipeline.

**`200 OK` — verified**

```json
{ "stepUpToken": "opaque…", "expiresAt": "2026-09-21T10:32:00Z" }
```

`expiresAt` is **2 minutes** from issuance (`research.md` D6) — long enough for one retry of the
gated request, short enough that the window itself isn't a meaningful new attack surface. Single-use:
consuming it (below) invalidates it regardless of outcome.

**`401` — the single uniform refusal, same shape `003` already uses**

```json
{ "error": "authentication_failed", "message": "No fue posible completar el acceso." }
```

Returned identically for a wrong code and an expired/missing challenge state — FR-020's "no
disclosure of which specific check failed," the same posture `003`'s own `/auth/sign-in` and
`/auth/factor` already apply.

**Audited**: exactly one entry per call — `stepup.verified` or `stepup.failed` — identifying the
identity and the capability (FR-021). This is the one and only audited "verification" event; later
consuming the token against the gated endpoint is not a second one (Summary, below).

---

## Consuming a step-up elevation — a header, not a route

A gated capability's route, once ordinary permission has already been decided in its favor
(Edge Cases: "the ordinary permission refusal applies first"), requires an `X-Step-Up-Token` header
carrying the token from a still-valid, unconsumed `POST /auth/step-up` response for that exact
`(identity, capability)` pair.

**`403` — step-up required, deliberately distinguishable from a failed code**

```json
{ "error": "step_up_required", "message": "Se requiere verificación adicional." }
```

Returned when the header is absent, the token is expired, already consumed, or was issued for a
*different* capability (User Story 2 scenario 5 — one verification does not cover two operations).
This refusal is not audited a second time; only `POST /auth/step-up`'s own call is (FR-021's "every
step-up verification... exactly one entry" — the code check is the verification, this is the gate).

**On success**: the gated operation proceeds exactly as it would have without step-up, and its own
mutation's audit entry (e.g. `membership.revoked`) is unaffected — step-up adds a precondition, not a
second audit trail for the operation itself.

**Idle/absolute timers are untouched either way** (FR-019). The `X-Step-Up-Token` header and
`step_up_elevation` table are never read by, and never write to, `session.last_seen_at` or
`family_created_at` — the two mechanisms share no code path (`data-model.md`, `step_up_elevation`
Rules).

---

## Summary — what's audited, once each, and nothing else

| Event | Action | Count per occurrence |
|---|---|---|
| Sign-out, any outcome | `session.signed_out` | Exactly 1 |
| Step-up code check, any outcome | `stepup.verified` / `stepup.failed` | Exactly 1 |
| Idle or absolute refusal | *(none — FR-011)* | 0, by requirement |
| Step-up gate refusal (missing/expired/wrong-capability token) | *(none — see above)* | 0, deliberately not double-counted against the verification event |
| Tenant deactivation's effect on a session | *(none — FR-015, the existing `tenant.deactivated` entry covers it)* | 0, by requirement |
