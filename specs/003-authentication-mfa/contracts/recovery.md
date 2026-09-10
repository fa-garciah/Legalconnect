# Contract: Recovery — Backup-Code Challenge, Forced Re-Enrollment, Re-Issuance

**Surface**: pending-challenge. Reachable only by a sign-in that has passed the credential
step. The re-enrollment route is reachable only immediately after a satisfied recovery.

Base path: `/auth/recovery`.

Covers `US13-EP12-ASC-RecoverWithBackupCode` (FR-027, FR-028, FR-030, FR-032).

**Not gated by `004`** — a person recovering has no confirmed factor and therefore no
capability.

---

## POST /auth/recovery/backup-code

Satisfies the second-factor challenge with a backup code instead of a generated one.

**Request**

```json
{ "challengeToken": "opaque…", "backupCode": "4f2a-91bd" }
```

The same `challengeToken` `/auth/factor` accepts. A person who has lost their authenticator
reaches this route from the challenge screen rather than a separate flow.

**`200 OK` — challenge satisfied, re-enrollment required**

```json
{
  "enrollmentToken": "opaque…",
  "next": "reenrollment",
  "remainingCodes": 9
}
```

**No session is emitted here** (FR-027). Satisfying the challenge with a backup code admits
the person to re-enrollment and nothing else — every tenant-scoped capability remains
unreachable until a replacement factor is confirmed (SC-015, US4 scenarios 2 and 4). A
person who abandons at this point holds no access and remains unenrolled.

`remainingCodes` is disclosed because the person has just proved possession of a code from
the set, and knowing how many remain is what lets them judge whether to worry. It reveals
nothing to anyone who has not already succeeded.

**What happens server-side, in one transaction**

| Step | Rule |
|---|---|
| Verify | Every unconsumed code in the current set is compared, and the **same number of comparisons is performed whether or not one matches** — position in the set is not observable ([research D11](../research.md#d11--backup-code-verification-tries-every-unconsumed-code-with-no-early-exit-timing-signal)) |
| Lock | `SELECT … FOR UPDATE` on the candidate rows, so two concurrent recoveries presenting the same last unconsumed code yield exactly one success |
| Consume | At most one code, marked consumed. The remainder stay valid (FR-026, SC-012) |
| Count | The attempt counts toward FR-021's counter — recovery is not an unthrottled bypass |
| Audit | `backup_code.consumed`, and `backup_codes.exhausted` as a distinct event if it was the last |

**`401` — the uniform refusal**

An invalid code, an already-consumed code, and a code that never existed are **byte-identical**
(FR-030, SC-016). So is a locked identity, and so is an identity whose codes are all
consumed — which is the terminal state `spec.md` records under Named Risks.

```json
{ "error": "authentication_failed", "message": "No fue posible completar el acceso." }
```

---

## POST /auth/recovery/reenroll

Confirms a replacement factor, completing the recovery.

**Request**

```json
{ "enrollmentToken": "opaque…", "code": "718204" }
```

The secret being confirmed is issued by
[`POST /auth/enrollment/begin`](./enrollment.md#post-authenrollmentbegin), which accepts the
`enrollmentToken` this contract returned. The enrollment mechanism is reused rather than
duplicated — there is one way to enroll a factor in this product, and recovery walks
through it.

**`200 OK` — recovered**

```json
{
  "backupCodes": ["…", "…", "…", "…", "…", "…", "…", "…", "…", "…"],
  "accessToken": "opaque…",
  "refreshToken": "opaque…",
  "expiresAt": "2026-09-09T16:45:00Z"
}
```

A **complete new set of 10 codes**, replacing the previous set in its entirety (FR-028,
US4 scenario 8, SC-033). The person leaves recovery back at ten rather than counting down —
which is what keeps FR-031's count from eroding across repeated recoveries and what bounds
the Named Risk.

**Re-issuance here requires no step-up** (FR-032, first case). The recovery has just
established possession of two factors — a valid credential and a valid backup code — and is
about to establish a third by confirming the new authenticator. A step-up check would be
asking the person to prove, again, what they proved seconds ago. This path therefore ships
with this slice.

**What happens server-side, in one transaction**

| Step | Rule |
|---|---|
| Verify | The code against the new unconfirmed secret, 90-second window (FR-056) |
| Replace | The previous factor is replaced and no longer satisfies a challenge (FR-012, US4 scenario 3) |
| Re-issue | The entire previous code set invalidated; 10 new codes issued (FR-028) |
| Emit | One session |
| Audit | `factor.replaced`, `backup_codes.reissued`, `signin.succeeded` — each with the authorising party identified (US4 scenario 7) |

**`401`** uniform refusal for an invalid code, an expired `enrollmentToken`, or an
unavailable key. The person remains unenrolled with no access (US4 scenario 4).

---

## Standalone re-issuance — deferred, not built

A route for re-issuing codes **outside** the recovery flow, on an established session, is
**not exposed in production by this slice** (FR-032, second case).

| | Recovery-path re-issuance | Standalone re-issuance |
|---|---|---|
| Freshness | Two factors just proved | A session of arbitrary age |
| Step-up needed | No — redundant | **Yes**, per the constitution |
| Ships in this slice | Yes | **No — withheld until `005`** |

The posture is deferral by non-exposure, exactly as `002/research.md` D10 takes for its
four step-up-gated capabilities: the constitutional obligation is satisfied by the
capability not being reachable, not bypassed.

This makes **five** capabilities awaiting `005`'s step-up mechanism — `002`'s four
(issuing an invitation, revoking a membership, changing an archetype, issuing a seed
invitation) plus this one.

**Consequence to hold:** until `005` lands, a person cannot top up their codes without
losing a device first. With ten codes, no time expiry, and every recovery restoring the
full set, that is an inconvenience rather than a route into the terminal dead end — but it
is a real gap and it is why `spec.md` records the coupling between FR-031's count and
FR-032's availability.

---

## What has no route, by design

**Assisted MFA reset does not exist in this slice.** `US14`–`US17` are IT2. No archetype —
including SA and the platform operator — holds a capability to reset another person's
factor, and none may read a secret or a code to work around its absence.

A person who loses their authenticator **and** exhausts all ten codes has no recovery path.
`spec.md`'s Named Risks section records this as accepted, terminal, and remediable only by
issuing a fresh invitation through `002` — which produces a new identity, not a recovered
one. The review trigger is the first real occurrence or the start of IT2 planning.
