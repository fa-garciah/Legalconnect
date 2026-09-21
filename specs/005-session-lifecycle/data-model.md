# Phase 1 Data Model: Session Lifecycle

**Slice**: `005-session-lifecycle` | **Date**: 2026-09-21

Two tables modified (`session`, `refresh_token` — columns only, no grant change), one table added
(`step_up_elevation`), four functions added (`touch_session`, `sign_out`, `issue_step_up`,
`consume_step_up`), one function widened in its return shape (`resolve_session`, still read-only).
No `lc_app` table grant changes anywhere in this slice — every new capability for `lc_app` is
`EXECUTE` on a narrow function, the same discipline `003` established.

## The governing property carried forward from `003`

`session` and `refresh_token` remain tenant-global, no `tenant_id`, no RLS policy — this slice adds
no column that would change that (`003/FR-037`, reaffirmed as still true by `research.md` D7). The
new `step_up_elevation` table is identity-scoped for the same reason `identity_credential` and
`identity_factor` are: a step-up verification authenticates a person, not a tenant, and the capability
it gates is checked against tenant-scoped authorization *separately*, after step-up, by
`AuthorizationInterceptor`'s existing `decide()` call.

---

## Modified: `session`

Two columns added. Nothing removed, nothing renamed — `research.md` D1.

| Column | Type | Constraints | Status |
|---|---|---|---|
| `id` | `uuid` | PK DEFAULT `gen_random_uuid()` | Unchanged (003) |
| `identity_id` | `uuid` | NOT NULL, FK → `identity.id` | Unchanged (003) |
| `access_digest` | `text` | NOT NULL UNIQUE | Unchanged (003) |
| `expires_at` | `timestamptz` | NOT NULL, 15 min from issuance | Unchanged (003) |
| `revoked_at` | `timestamptz` | NULL while live | Unchanged (003) |
| `device_metadata` | `jsonb` | NOT NULL DEFAULT `'{}'` | Unchanged (003) |
| `created_at` | `timestamptz` | NOT NULL DEFAULT `now()` | Unchanged (003) |
| **`last_seen_at`** | `timestamptz` | **NEW.** NOT NULL DEFAULT `now()`. Idle clock — written only by `touch_session()`, only on the success path (D2) | Added by `005` |
| **`family_created_at`** | `timestamptz` | **NEW.** NOT NULL DEFAULT `now()`. Absolute clock, anchored to the refresh-token family's origin, copied forward unchanged at every rotation (D1) | Added by `005` |

**Grants**: unchanged from `003`. `lc_app` still holds no table privilege on `session` at all; its
reach is `EXECUTE` on `resolve_session()` (widened return, still read-only) and the new
`touch_session()`. `lc_auth` still holds full privilege — `family_created_at`'s explicit carry-forward
happens inside `rotate_refresh()`, which `lc_auth` already owns.

**Rules added by this slice**:

- `last_seen_at` is never written by `resolve_session()` itself — only by `touch_session()`, and only
  after the caller has confirmed idle/absolute limits are not exceeded (D2). A refused presentation
  never extends the clock it was refused against.
- `family_created_at` is set once, at the family's first row (`mintSession()`), and every subsequent
  row inserted by `rotate_refresh()` copies it forward from the row it replaces. It is never
  recomputed and never reset by an archetype change (FR-010) — only *which limit* it's checked
  against changes, per `research.md` D3.
- Idle and absolute refusal reuses `SessionGuard`'s existing `UnauthorizedException('No autenticado.')`
  — no new refusal reason is distinguishable on the wire (FR-005, FR-011).

---

## Modified: `refresh_token`

No column change. One function it's read by (`rotate_refresh`) changes its `INSERT` to carry
`family_created_at` forward onto the new `session` row it mints — see Function changes below.

---

## New Entity: `step_up_elevation`

One row per completed second-factor verification for one sensitive operation. `research.md` D6.

| Column | Type | Constraints |
|---|---|---|
| `id` | `uuid` | PK DEFAULT `gen_random_uuid()` |
| `identity_id` | `uuid` | NOT NULL, FK → `identity.id` |
| `capability` | `text` | NOT NULL. One of the five `stepUp: true` ids in `capability.ts` — validated in the application, not a DB enum (matching `004` D1: a capability is an application fact, not a database row) |
| `token_digest` | `text` | NOT NULL UNIQUE. SHA-256 of an opaque high-entropy value, same shape as `session.access_digest` |
| `expires_at` | `timestamptz` | NOT NULL. `now() + 2 minutes` at issuance |
| `consumed_at` | `timestamptz` | NULL until used. Non-null + presented again = refuse (same shape as `refresh_token.used_at`) |
| `created_at` | `timestamptz` | NOT NULL DEFAULT `now()` |

**Grants**

| Role | Privilege | Why |
|---|---|---|
| `lc_app` | **none** on the table; `EXECUTE` on `consume_step_up()` only | The gated endpoint (any tenant-scoped route) runs on the ordinary connection and must be able to consume an elevation without ever reading the table directly |
| `lc_auth` | `SELECT`, `INSERT`, `UPDATE` | Issuance (`POST /auth/step-up`) runs on `lc_auth`'s connection, same as sign-in/enrollment/recovery |

**Rules**

- Never returned to the caller except as the opaque token at issuance (never the digest, never a
  full row) — same non-disclosure posture as `session`/`refresh_token`.
- Single-use: `consume_step_up()` sets `consumed_at` in the same statement it checks it is still NULL
  and unexpired, so two simultaneous presentations of the same token cannot both succeed (`UPDATE ...
  WHERE consumed_at IS NULL` is atomic per row).
- Scoped to exactly one `(identity_id, capability)` pair. A second, different gated operation
  attempted with the same token is refused — `consume_step_up()`'s `WHERE capability = p_capability`
  clause is what enforces User Story 2 acceptance scenario 5.
- No relation to `session` or `refresh_token`. Completing step-up neither reads nor writes
  `last_seen_at`/`family_created_at` — FR-019's "MUST NOT extend, reset, or otherwise interact with"
  is enforced by the two mechanisms simply never touching the same row.

---

## Function: `resolve_session()` — widened return, still `STABLE`

```sql
CREATE OR REPLACE FUNCTION resolve_session(p_access_digest text)
RETURNS TABLE (
  id                uuid,
  identity_id       uuid,
  expires_at        timestamptz,
  last_seen_at      timestamptz,
  family_created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT s.id, s.identity_id, s.expires_at, s.last_seen_at, s.family_created_at
  FROM session s
  WHERE s.access_digest = p_access_digest
    AND s.revoked_at IS NULL
    AND s.expires_at > now();
$$;
```

Still returns no row for expired, revoked or unknown — unchanged, and still the single indistinguishable
refusal (FR-005, FR-011). Still `STABLE`: it reads, it does not write. Grants unchanged
(`lc_auth`, `lc_app` both `EXECUTE`).

## Function: `touch_session()` — new, `VOLATILE`

```sql
CREATE FUNCTION touch_session(p_session_id uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE session SET last_seen_at = now()
  WHERE id = p_session_id AND revoked_at IS NULL;
$$;

REVOKE ALL ON FUNCTION touch_session(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION touch_session(uuid) TO lc_auth, lc_app;
```

Called exactly once per request, by `AuthorizationInterceptor`, only after idle/absolute limits are
confirmed not exceeded (`research.md` D2, D4). Never called by `resolve_session()` itself.

## Function: `sign_out()` — new

```sql
CREATE FUNCTION sign_out(p_session_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_family_id uuid;
BEGIN
  SELECT family_id INTO v_family_id FROM refresh_token WHERE session_id = p_session_id LIMIT 1;
  IF v_family_id IS NULL THEN RETURN; END IF;

  UPDATE refresh_token SET revoked_at = now()
    WHERE family_id = v_family_id AND revoked_at IS NULL;
  UPDATE session SET revoked_at = now()
    WHERE revoked_at IS NULL
      AND id IN (SELECT rt.session_id FROM refresh_token rt WHERE rt.family_id = v_family_id);
END $$;

REVOKE ALL ON FUNCTION sign_out(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sign_out(uuid) TO lc_auth;
```

`EXECUTE` granted to `lc_auth` only — the sign-out route runs on `lc_auth`'s connection
(`research.md` D5), the same reasoning `rotate_refresh()` already documents for its own `lc_app`-free
grant. Idempotent by construction: a second call against an already-dead family finds
`family_id` (the `refresh_token` row still exists, only marked) but both `UPDATE`s' `WHERE revoked_at
IS NULL` guards make them no-ops.

## Functions: `issue_step_up()` / `consume_step_up()` — new

`issue_step_up()` is a thin `INSERT ... RETURNING id` behind the digest computation, called from
`step-up.service.ts` on `lc_auth`'s connection after `verifyCode()` succeeds — no SQL-level novelty,
omitted here in full for brevity; see `contracts/session-lifecycle.md`.

```sql
CREATE FUNCTION consume_step_up(p_token_digest text, p_identity_id uuid, p_capability text)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE step_up_elevation
  SET consumed_at = now()
  WHERE token_digest = p_token_digest AND identity_id = p_identity_id
    AND capability = p_capability AND consumed_at IS NULL AND expires_at > now()
  RETURNING true;
$$;

REVOKE ALL ON FUNCTION consume_step_up(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION consume_step_up(text, uuid, text) TO lc_app;
```

Returns no row (NULL to the caller) for absent, expired, wrong-capability, or already-consumed —
collapsed into the same `step_up_required` refusal by `AuthorizationInterceptor`, deliberately not
`resolve_session()`'s indistinguishable-refusal shape, because this refusal is workflow guidance, not
a secret (`research.md` D6).

## Function: `rotate_refresh()` — one-line change

The `INSERT INTO session` at `0034_session_and_refresh.sql:225-229` gains `family_created_at` in its
column and `SELECT` list, copied from the row being replaced:

```sql
INSERT INTO session (identity_id, access_digest, expires_at, device_metadata, family_created_at)
SELECT s.identity_id, p_new_access_digest, v_expires, COALESCE(p_device, '{}'::jsonb), s.family_created_at
FROM session s
WHERE s.id = v_presented.session_id
RETURNING id INTO v_new_session_id;
```

No other change to `rotate_refresh()`. `last_seen_at` is left to its column `DEFAULT now()` — a
rotation is itself activity (`research.md` D1).

## Function: `mint_session()` (application-level, `session.port.ts`) — no change

Both new columns default to `now()` on `INSERT`, which is exactly a new family's origin. No explicit
value needs to be passed.

---

## Application-level shape changes (non-SQL, listed for `data-model.md` completeness)

- `AuthenticatedRequest` (`common/auth/session.guard.ts:46-50`) gains `sessionId`, `lastSeenAt`,
  `familyCreatedAt`.
- `capability.ts`'s existing `CapabilityDef.stepUp?: true` (already shipped by `004`) needs no change
  — this slice is the first to read it.
- `common/audit/actions.ts`'s `AUDIT_ACTIONS` and `TARGET_ENTITY_BY_ACTION` gain `session.signed_out`,
  `stepup.verified`, `stepup.failed` (`research.md` D8).
- A new pure module, `common/auth/session-lifecycle.ts`, exports `roleClassFor()` and
  `SESSION_LIMITS` (`research.md` D3) — no NestJS or Drizzle import, unit-testable standalone, the
  same style `capability.ts` already established.
