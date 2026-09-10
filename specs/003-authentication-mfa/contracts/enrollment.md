# Contract: Enrollment — Secret Issuance, Confirmation, Backup Codes

**Surface**: pending-enrollment. Reachable only by an identity that has passed the
credential step and has **no confirmed factor**. Not reachable by an enrolled identity at
all (FR-012).

Base path: `/auth/enrollment`.

Covers `US02-EP12-ASC-EnrollMFAFactor` and `US03-EP12-ASC-ReceiveBackupCodes` (FR-006 to
FR-017, FR-023 to FR-031).

**Not gated by `004`** — an unenrolled identity holds no capability by definition, which is
exactly the state these routes exist to end.

---

## POST /auth/enrollment/begin

Issues a factor secret for registration in an authenticator app. **Does not complete
enrollment** (FR-009).

**Request**

```json
{ "challengeToken": "opaque…" }
```

The `challengeToken` from `/auth/sign-in` whose `next` was `"enrollment"`. This is the
state gate — there is no way to begin enrollment for an identity without first proving its
credential.

**`200 OK`**

```json
{
  "secret": "JBSWY3DPEHPK3PXP",
  "otpauthUri": "otpauth://totp/LegalConnect%20MX:persona@despacho.mx?secret=…&issuer=LegalConnect%20MX&period=30&digits=6",
  "enrollmentToken": "opaque…"
}
```

**This is the only response in the entire product that returns a factor secret**, and it
returns it exactly once, to the person enrolling, during the exchange that requires it
(FR-009). It is never retrievable afterwards by anyone — not the owner, not an SA, not the
platform operator (FR-015, SC-006).

The `otpauthUri` is rendered as a QR code by the client; the bare `secret` is offered for
manual entry.

**What happens server-side**

| Step | Rule |
|---|---|
| Generate | A TOTP secret, 30-second period, 6 digits (FR-056) |
| Encrypt | Envelope-encrypted under an application-held key separate from the database, with the key reference stored alongside (FR-013, [research D5](../research.md#d5--totp-secrets-use-envelope-encryption-behind-a-keyprovider-port-kms-in-production-and-a-local-key-in-devci)) |
| Store | `identity_factor` with `confirmed_at IS NULL`. **An unconfirmed row never satisfies a challenge** (FR-010) |
| Replace | Beginning again discards any prior unconfirmed secret (FR-010, US2 scenario 5) |

**`403 mfa_enrollment_required` is not returned here** — that refusal is what *sent* the
caller to this route.

**`401`** uniform refusal for an expired or unknown `challengeToken`, or for an identity
that already holds a confirmed factor (FR-012).

**Audited**: `enrollment.started`, identity by reference, `tenant_id NULL`. **The secret
appears in no log, error payload, trace or audit entry** (FR-014, SC-007).

---

## POST /auth/enrollment/confirm

Confirms the secret with a derived code, completing enrollment and issuing backup codes.

**Request**

```json
{ "enrollmentToken": "opaque…", "code": "492013" }
```

**`200 OK` — enrolled**

```json
{
  "backupCodes": [
    "4f2a-91bd", "7c03-e5f1", "b8d4-2a67", "e011-9c3d", "5a7f-40be",
    "c92e-1d05", "38b6-7fa2", "d14c-08e9", "9e5b-6321", "a70d-cf48"
  ],
  "accessToken": "opaque…",
  "refreshToken": "opaque…",
  "expiresAt": "2026-09-09T16:45:00Z"
}
```

**Exactly 10 codes** (FR-031, SC-010), **displayed exactly once** (FR-024). There is no
route that returns them again, for anyone, ever — including the person who just received
them (FR-029). The client must present them for the person to record before proceeding, and
must not persist them (FR-051, SC-028).

Enrollment completes and a session is emitted in the same exchange, so the person who just
enrolled is signed in rather than sent back to the sign-in screen.

**What happens server-side, in one transaction**

| Step | Rule |
|---|---|
| Verify | The code is checked against the unconfirmed secret, 90-second window (FR-056) |
| Confirm | `identity_factor.confirmed_at` is set |
| Interface | `identity.mfa_enrolled_at` is set **in the same transaction** — this is what `002/FR-026`'s shipped precondition reads (FR-011). The two must not diverge |
| Issue | 10 backup codes generated, each stored only as a memory-hard digest (FR-025) |
| Emit | One session (FR-033) |
| Audit | `enrollment.completed` and `backup_codes.issued` |

**Enrollment does not complete without the codes** (FR-023). If issuance fails, the whole
transaction fails and the identity remains unenrolled — there is no state in which a
confirmed factor exists with no codes.

**`401`** uniform refusal for an invalid code, an expired or unknown `enrollmentToken`, or
an unavailable key (FR-017). The identity remains unenrolled and the attempt is recorded
(US2 scenario 4).

**Audited on failure**: `enrollment.failed`.

---

## What cannot be reached from this contract

| Attempt | Outcome | Requirement |
|---|---|---|
| Read a factor secret after enrollment | No route exists; `lc_app` holds no grant | FR-015, SC-006 |
| Read the backup codes again | No route exists, for anyone | FR-024, FR-029 |
| Enroll a second factor for an enrolled identity | Refused | FR-012 |
| Enroll SMS, or request a code by email | No such option on any surface | FR-008, SC-005 |
| Skip enrollment | No configuration, flag, entitlement or tenant setting permits it | FR-007, SC-004 |
| Disable the challenge for a trusted device | No such mechanism is built | FR-019, SC-005 |

The last two are **absences, not denials**. `spec.md`'s permission matrix marks them as
such deliberately: the constitution requires that no mechanism exist to be misconfigured,
which is a stronger property than a mechanism that refuses everyone.

Replacing a factor is reached only through [recovery.md](./recovery.md).
