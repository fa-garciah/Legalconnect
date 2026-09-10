# Phase 1 Data Model: Authentication & Multi-Factor Enrollment

**Slice**: `003-authentication-mfa` | **Date**: 2026-09-09

Five new entities, one modified table, one replaced function, one new database role.

## The governing property of this design

**Every table here is tenant-global and carries no `tenant_id` and no RLS policy.** The
constitution states this exception directly:

> The `identity` table and the session table are tenant-global by design and therefore
> carry no `tenant_id` and no RLS policy of their own. They are the documented exception
> to the RLS catalogue check above, not an oversight in it: a person exists before and
> across tenants.

This slice extends that exception only to material that hangs off an identity — its
credential, its factor, its codes, its sessions. None is meaningful per tenant: one
credential authenticates one person, who may hold membership in several firms. The RLS
catalogue CI test asserts that every table *carrying* `tenant_id` has an active policy, so
these tables satisfy it rather than needing an exemption from it.

**Isolation is not weakened by this.** `membership` remains the sole resolver from an
identity to tenant data and remains policied normally. What this slice changes is that the
identity reaching that resolver is now proven rather than asserted by a header
([research D10](./research.md#d10--002s-routes-come-onto-the-network-by-replacing-the-header-stand-ins-with-the-session-guard)).

**The second governing property is what `lc_app` is *not* granted.** **All five** tables
grant the ordinary application role nothing at all — no `SELECT`, no `INSERT`, no
`UPDATE` — and `lc_app` holds `EXECUTE` on exactly one function, `resolve_session()`.
This is not defence in depth. It is the difference between FR-015 holding and
not holding, because `identity` already carries a self-row `SELECT` policy for `lc_app`
(`0012_identity.sql`), so a factor secret stored as a column on `identity` would be
readable by its owner through a correct, already-tested policy
([research D3](./research.md#d3--authentication-material-lives-in-tables-lc_app-cannot-reach-verified-inside-security-definer-functions)).

---

## Roles

| Role | Exists | This slice |
|---|---|---|
| `lc_app` | 001 | **Gains almost nothing.** `EXECUTE` on `resolve_session()` alone, and no table privilege whatsoever on any of the five new tables |
| `lc_platform` | 001 | Unchanged. Touches none of these tables |
| `lc_identity_writer` | 002 | Owns the replaced `accept_invitation()`; gains `INSERT` on `identity_credential` only |
| `lc_audit_writer` | 001 | Unchanged |
| `lc_retention` | 001 | Gains `DELETE` on `session` and `refresh_token` for expiry pruning; nothing on material tables |
| **`lc_auth`** | **NEW** | Owns the five new tables and the race-controlled functions, and is the **only** connection holding any grant on authentication material. `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT` |

**`lc_auth` is `LOGIN`, unlike `lc_audit_writer` and `lc_identity_writer`, and the
reason is a hard constraint rather than a preference.** Argon2id runs in the application
([research D6](./research.md#d6--argon2id-via-node-rsargon2-for-both-credentials-and-backup-codes-with-two-parameter-profiles))
and the envelope key is held by the application and deliberately not by the database
([research D5](./research.md#d5--totp-secrets-use-envelope-encryption-behind-a-keyprovider-port-kms-in-production-and-a-local-key-in-devci),
FR-013). No in-database function can therefore verify a credential, decrypt a factor
secret, or compare a backup code — the cryptography it would need is not there. So the
material must cross into the application, and the only question is *which connection*
receives it. It is `lc_auth`'s, held by `backend/src/modules/auth/` and by nothing else.

This is **stronger** than the alternative it replaces, not weaker: `lc_app` ends up with
no grant on any of the five tables and no `EXECUTE` on any verification function, so the
connection every other module uses cannot reach authentication material at all. See
[tasks.md T000](./tasks.md#blocking-design-question--resolved-2026-09-09) for the full
argument and the two readings it reconciles.

---

## Entity: `identity_credential`

One row per identity. The verification material for FR-001.

| Column | Type | Constraints |
|---|---|---|
| `identity_id` | `uuid` | **PK**, FK → `identity.id`. One credential per identity |
| `digest` | `text` | NOT NULL. Argon2id PHC string, interactive profile (research D6) |
| `updated_at` | `timestamptz` | NOT NULL DEFAULT `now()` |

**Grants**

| Role | Privilege | Why |
|---|---|---|
| `lc_app` | **none** | The connection every other module uses cannot reach the digest at all |
| `lc_identity_writer` | `INSERT` | Establishment at acceptance (FR-053, research D4) |
| `lc_auth` | `SELECT`, `UPDATE (digest, updated_at)` | Verification reads the stored PHC string and compares it in the application — Argon2id digests are salted, so no comparable candidate can be derived without it. Also later credential change, which no story in this slice exposes |

**Rules**

- The digest is computed in the application. No plaintext credential reaches a SQL
  parameter, a parameter log, or `pg_stat_statements` (research D4).
- Established atomically with `identity` and `membership` (FR-053). No row may exist for an
  identity holding a membership without one, and none may exist without an identity.
- Never returned by any surface, never logged (FR-002).

---

## Entity: `identity_factor`

One row per identity once enrollment begins. Holds the TOTP secret and the lockout state.

| Column | Type | Constraints |
|---|---|---|
| `identity_id` | `uuid` | **PK**, FK → `identity.id`. Exactly one factor per identity in v1.0 |
| `secret_ciphertext` | `bytea` | NOT NULL. Envelope-encrypted TOTP secret (research D5) |
| `key_reference` | `text` | NOT NULL. Which key wrapped it, so rotation is a re-wrap not a re-enrollment |
| `confirmed_at` | `timestamptz` | NULL until a valid derived code is returned (FR-009). **This is the enrollment state** |
| `failed_attempt_count` | `integer` | NOT NULL DEFAULT 0. FR-021's counter (research D7) |
| `locked_until` | `timestamptz` | NULL unless locked. FR-021's 15-minute window |
| `created_at` | `timestamptz` | NOT NULL DEFAULT `now()` |

**Grants**

| Role | Privilege | Why |
|---|---|---|
| `lc_app` | **none** | FR-015: no archetype may read a factor secret, including through its own session |
| `lc_auth` | `SELECT`, `INSERT`, `UPDATE`, `DELETE` | Enrollment, verification, lockout, and replacement on recovery. The ciphertext must reach the application because the unwrapping key is held there and not by the database (FR-013) |

**Rules**

- `secret_ciphertext` is never stored in plaintext and never encrypted under a key the
  database holds (FR-013). A dump without the application key yields no working factor
  (SC-008).
- Never appears — plaintext or ciphertext — in logs, errors, traces or the audit log
  (FR-014). The audit log records that enrollment or verification happened, by identity
  reference (FR-043).
- An unconfirmed row (`confirmed_at IS NULL`) never satisfies a challenge (FR-010).
  Beginning enrollment again replaces the row, discarding the prior unconfirmed secret.
- `identity.mfa_enrolled_at` is set in the same transaction as `confirmed_at`, because
  `002/FR-026`'s already-shipped precondition reads that column (FR-011). **The two must
  not diverge** — `confirmed_at` is the fact, `mfa_enrolled_at` is the pre-existing
  interface to it.

### State transitions

```text
(no row)
   │  begin enrollment  ──────────────────────────────►  unconfirmed
   │                                                       │
   │                          invalid code (FR-004)  ◄──────┤
   │                                                       │
   │                          valid code               ────▼
   │                          + backup codes issued  ──►  confirmed
   │                          + mfa_enrolled_at set        │
   │                                                       │
   │  begin enrollment again ◄─── recovery forces ─────────┤
   └───────────────────────────    re-enrollment (FR-027)  ─┘

confirmed  ──5 failed attempts──►  locked (15 min)  ──expiry──►  confirmed
```

Re-running enrollment against a `confirmed` row is refused (FR-012). Replacement is
reachable only through recovery.

---

## Entity: `backup_code`

Ten rows per identity per issued set. FR-023 to FR-031.

| Column | Type | Constraints |
|---|---|---|
| `id` | `uuid` | PK DEFAULT `gen_random_uuid()` |
| `identity_id` | `uuid` | NOT NULL, FK → `identity.id` |
| `set_id` | `uuid` | NOT NULL. Groups one issued set, so re-issuance replaces wholesale (FR-028) |
| `digest` | `text` | NOT NULL. Argon2id PHC string, high-entropy profile (research D6) |
| `consumed_at` | `timestamptz` | NULL while usable. Single-use (FR-026) |
| `created_at` | `timestamptz` | NOT NULL DEFAULT `now()` |

Index on `(identity_id, set_id) WHERE consumed_at IS NULL` — the lookup verification
iterates (research D11).

**Grants**

| Role | Privilege | Why |
|---|---|---|
| `lc_app` | **none** | FR-029: no archetype may read any backup code, including its owner after issuance |
| `lc_auth` | `SELECT`, `INSERT`, `UPDATE (consumed_at)`, `DELETE` | Issuance, consumption, replacement. Verification reads the unconsumed set's digests and compares each in the application, for the same salting reason the credential carries |

**Rules**

- **Exactly 10 per set** (FR-031). No time-based expiry: a code ceases to be valid only by
  consumption or by its set being replaced (SC-031).
- Stored only as a memory-hard digest, never recoverable, never in logs or an audit entry
  (FR-025).
- Displayed exactly once, at issuance (FR-024). No surface re-displays or retrieves them.
- Re-issuance inserts a new `set_id` and **deletes or marks the entire prior set**, rather
  than topping it up (FR-028). Prior codes become invalid in the same transaction.
- Verification tries every unconsumed code in the current set and performs the same number
  of verifications whether or not one matches, so position in the set is not observable
  (research D11).
- `SELECT ... FOR UPDATE` on the candidate rows, so two concurrent recoveries presenting
  the same last unconsumed code yield exactly one success.

---

## Entity: `session`

The access emitted on successful authentication. FR-033 to FR-038.

| Column | Type | Constraints |
|---|---|---|
| `id` | `uuid` | PK DEFAULT `gen_random_uuid()` |
| `identity_id` | `uuid` | NOT NULL, FK → `identity.id` |
| `access_digest` | `text` | NOT NULL UNIQUE. SHA-256 of the opaque token (research D2) |
| `expires_at` | `timestamptz` | NOT NULL. **15 minutes** from issuance (FR-035) |
| `revoked_at` | `timestamptz` | NULL while live |
| `device_metadata` | `jsonb` | NOT NULL DEFAULT `'{}'`. FR-035's device metadata. **Carries no personal data** beyond user-agent class and coarse origin |
| `created_at` | `timestamptz` | NOT NULL DEFAULT `now()` |

**Grants**

| Role | Privilege | Why |
|---|---|---|
| `lc_app` | **none** on the table; `EXECUTE` on `resolve_session()` | Lookup happens *before* `app.identity_id` is set, so no RLS policy could scope it — a function is the only way to scope it at all (research D8) |
| `lc_auth` | `SELECT`, `INSERT`, `UPDATE`, `DELETE` | Emission, resolution, revocation |
| `lc_retention` | `DELETE` | Pruning expired rows |

**Rules**

- **Carries no tenant and no archetype** (FR-037). Both are resolved per request from
  `membership`, and nothing in the session is trusted as their source (`002/FR-016`).
- Stored as a digest, so a dump yields no usable session (research D2).
- Every request validates against this row (FR-034). Validity is never inferred from the
  token alone.
- `005` owns idle and absolute expiry by role class, explicit sign-out, revocation on
  tenant deactivation, and the inventory `US09`/`US10` need. This slice emits the row and
  the columns those extensions will read; it implements none of that behaviour (FR-038).

---

## Entity: `refresh_token`

The rotating, individually revocable renewal credential. FR-035, FR-036.

| Column | Type | Constraints |
|---|---|---|
| `id` | `uuid` | PK DEFAULT `gen_random_uuid()` |
| `family_id` | `uuid` | NOT NULL. All descendants of one authentication share it |
| `session_id` | `uuid` | NOT NULL, FK → `session.id` |
| `token_digest` | `text` | NOT NULL UNIQUE. SHA-256 |
| `parent_id` | `uuid` | NULL for the first. FK → `refresh_token.id` |
| `used_at` | `timestamptz` | NULL until rotated. **Non-null + presented again = reuse** |
| `revoked_at` | `timestamptz` | NULL while live |
| `device_metadata` | `jsonb` | NOT NULL DEFAULT `'{}'` |
| `created_at` | `timestamptz` | NOT NULL DEFAULT `now()` |

**Grants**: nothing at all for `lc_app` — `POST /auth/refresh` is an authentication route
and runs on `lc_auth`'s connection, so unlike `resolve_session()` there is no per-request
path that needs `rotate_refresh()` from elsewhere. Full access for `lc_auth`; `DELETE`
for `lc_retention`.

**Rules**

- **Rotated on every use** (FR-035). Rotation marks the presented row `used_at` and inserts
  a child in the same transaction.
- **Detected reuse revokes the entire family** (FR-036) — every row sharing `family_id`,
  and the `session` rows they belong to. Enforced inside `rotate_refresh()` under
  `SELECT ... FOR UPDATE` on the family, so two simultaneous presentations of the same used
  token cannot both succeed (research D8).
- Persisted server-side and individually revocable, which is what makes `US09`/`US10`
  buildable in `005` and what the constitution's prohibition on stateless JWT requires.

---

## Modified: `identity`

Two changes, both forced by self-hosting ([research D9](./research.md#d9--identityemail-gains-a-unique-index-on-a-normalized-form-and-subject-becomes-a-product-generated-opaque-value)).

1. **New unique index on `lower(btrim(email))`.** The column is `NOT NULL` today with **no
   uniqueness constraint** — only `subject` is unique. Sign-in resolves an identity by
   email, which requires it to identify at most one row. Cognito's user pool enforced this;
   nothing does now. **This is a live gap, not a new requirement**: two identities can
   already share an email today, so migration `0035` must be preceded by a duplicate check
   in every environment (plan.md, non-blocking item 2).
2. **`subject` becomes a product-generated opaque value**, set at acceptance, still
   `NOT NULL UNIQUE`, deliberately not the email. `002/FR-003` keeps its meaning, and an
   identity whose email later changes keeps its subject, credential, factor and memberships
   — which is what keeps Technical Debt item 6 tractable.

`mfa_enrolled_at` is unchanged in shape and finally becomes settable. Its writer is the
enrollment confirmation, in the same transaction as `identity_factor.confirmed_at`.

No column is added to `identity` itself. Every piece of authentication material lives in
the ungranted tables above, for the reason the governing property states.

---

## Replaced function: `accept_invitation()`

`0036` drops the four-argument function and creates a five-argument one taking the
Argon2id digest, inserting the `identity_credential` row inside the existing transaction
(FR-053, research D4). Dropping is necessary rather than tidy: adding a parameter creates a
new signature, and leaving both would be an ambiguous overload on the product's only path
into `identity`.

Everything `002` guaranteed is preserved unchanged: the `FOR UPDATE` on the invitation row
that makes `002/SC-005` hold, the six collapsed refusal branches, the tenant-status check,
the audit writes, and atomicity — a failure leaves no identity, no membership, **no
credential**, and an unused invitation.

## New functions, owned by `lc_auth`

**These functions exist for atomicity and race control, not for secrecy.** Secrecy is
delivered by the grants above — `lc_app` cannot reach any of the five tables. What a
function delivers that a sequence of application statements cannot is a read-then-write
that no concurrent attempt can interleave with, which is what FR-020, FR-021 and FR-036
each require by name.

| Function | Returns | Why it must be a function rather than a query |
|---|---|---|
| `claim_attempt(identity_id, code_digest, succeeded)` | verdict + lockout state | FR-020, FR-021. The lockout check, the replay guard **over the full 90-second window**, and the counter update must be one indivisible step, or two concurrent challenges presenting the same code both succeed. The application verifies the code against the decrypted secret and passes a digest of the *presented code* so the replay guard has something to compare — no plaintext code is ever stored. Serves the credential step's FR-005 threshold too, which `spec.md` fixes at the same values |
| `consume_backup_code(identity_id, code_id)` | whether this caller won the race | FR-026, research D11. `SELECT … FOR UPDATE` on the candidate row, so two recoveries presenting the same last unconsumed code yield exactly one success and one consumption. The application has already identified `code_id` by comparing every unconsumed digest with a fixed comparison count |
| `resolve_session(access_digest)` | `identity_id`, `expires_at` | FR-034. **The one function `lc_app` may `EXECUTE`.** Resolution happens on every request, before `app.identity_id` exists, so no RLS policy could scope it — a function is the only way to scope it at all (research D8) |
| `rotate_refresh(token_digest, device)` | new pair, or reuse verdict | FR-035, FR-036. Family revocation on detected reuse, under `SELECT … FOR UPDATE` on the family, so two simultaneous presentations of the same used token cannot both succeed |

**Credential verification needs no function.** It is a `SELECT` of the stored PHC string
on `lc_auth`'s connection followed by `argon2.verify()` in the application, then
`claim_attempt()` for the threshold. There is nothing to make atomic in the comparison
itself, and inventing a `verify_credential()` wrapper around a plain read would suggest
the digest stays in the database when it does not and cannot.

---

## Audit vocabulary

Twelve actions added under `001`'s mechanism, written in-transaction, `tenant_id NULL`
where no tenant exists ([research D12](./research.md#d12--twelve-audit-actions-written-in-transaction-attributed-to-no-tenant-where-none-exists)):

`enrollment.started`, `enrollment.completed`, `enrollment.failed`, `factor.replaced`,
`backup_codes.issued`, `backup_code.consumed`, `backup_codes.exhausted`,
`backup_codes.reissued`, `signin.succeeded`, `signin.failed`, `challenge.failed`,
`account.locked`.

`0018_lc_app_audit_action_restriction.sql` restricts which actions a role may write, so
these must be added to `lc_auth`'s permitted set in `0030` — a migration, not an
application change. No entry carries an email address, other contact detail, or any factor
material (FR-043), enforced by the existing `assertNoSensitiveData` sanitiser with its
deny-list extended.

`mfa_not_enrolled` remains **unaudited**, agreeing with `002`'s open item 3: it is a
precondition failure by a legitimate member, not a change of state and not a security
signal.
