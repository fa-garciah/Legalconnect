-- session gains its idle and absolute clocks. data-model.md `session`, research.md
-- D1, D2, D5.
--
-- THE ONE FACT THIS MIGRATION TURNS ON: a `session` row is not long-lived.
-- rotate_refresh() mints a FRESH session row on every refresh-token rotation
-- (0034_session_and_refresh.sql:225-229) — a fresh id, a fresh created_at, a fresh
-- 15-minute expires_at — while refresh_token.family_id is the only thing that stays
-- constant across what a person perceives as one continuous sign-in. An absolute
-- limit read off session.created_at would therefore reset every ~15 minutes of
-- active use, which is the opposite of "regardless of activity" (spec.md FR-008).
-- family_created_at is anchored to the FAMILY's origin, not any one row's, and is
-- copied forward unchanged at every rotation (below, in rotate_refresh()).
--
-- last_seen_at does NOT need the same carry-forward: a rotation is itself activity,
-- so resetting it to now() (the column's own DEFAULT) on the fresh row is correct,
-- not a bug.

ALTER TABLE session
  ADD COLUMN last_seen_at      timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN family_created_at timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN session.last_seen_at IS
  'Idle clock (005/D1). Written ONLY by touch_session(), and ONLY after the caller has confirmed idle/absolute limits are not exceeded (D2) — never by resolve_session() itself. A refused presentation never extends the clock it was refused against.';

COMMENT ON COLUMN session.family_created_at IS
  'Absolute clock (005/D1), anchored to the refresh-token family''s origin. Copied forward unchanged by rotate_refresh() at every rotation — never recomputed, never reset by an archetype change.';

-- ---------------------------------------------------------------------------
-- resolve_session() — widened return, STILL read-only. research.md D2.
-- ---------------------------------------------------------------------------
--
-- PostgreSQL refuses CREATE OR REPLACE across a changed return shape (it would
-- have to, since a caller mid-transaction could be relying on the old one) — so the
-- old signature is dropped first. Its callers (session.guard.ts) select columns by
-- name from the result, so once this migration lands, they are updated to read the
-- new columns too (T013).

DROP FUNCTION resolve_session(text);

CREATE FUNCTION resolve_session(p_access_digest text)
RETURNS TABLE (
  id                uuid,
  identity_id       uuid,
  expires_at        timestamptz,
  last_seen_at      timestamptz,
  family_created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT s.id, s.identity_id, s.expires_at, s.last_seen_at, s.family_created_at
  FROM session s
  WHERE s.access_digest = p_access_digest
    AND s.revoked_at IS NULL
    AND s.expires_at > now();
$$;

ALTER FUNCTION resolve_session(text) OWNER TO lc_auth;

COMMENT ON FUNCTION resolve_session(text) IS
  'FR-034 (003), widened by 005/D2. The one function lc_app may EXECUTE. Still STABLE — it reads, it never writes. Returns no row for expired, revoked or unknown — the three stay indistinguishable to the caller.';

-- The DROP above wiped the prior grants along with the old function object — a
-- freshly created function defaults to PUBLIC holding EXECUTE, so both the REVOKE
-- and the GRANT have to be restated here rather than assumed "unchanged from 0034".
REVOKE ALL ON FUNCTION resolve_session(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_session(text) TO lc_auth, lc_app;

-- ---------------------------------------------------------------------------
-- touch_session() — new, VOLATILE. research.md D2.
-- ---------------------------------------------------------------------------
--
-- THE ORDERING IS THE WHOLE POINT. This is called by AuthorizationInterceptor ONLY
-- AFTER the idle/absolute check has already passed for the request — never before,
-- never unconditionally. If resolve_session() itself stamped last_seen_at = now()
-- on every call, an idle-expired session would never actually expire: every
-- presentation that SHOULD be refused would also refresh the very clock being
-- checked. Get this wrong and the idle limit silently never fires.

CREATE FUNCTION touch_session(p_session_id uuid) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE session SET last_seen_at = now()
  WHERE id = p_session_id AND revoked_at IS NULL;
$$;

ALTER FUNCTION touch_session(uuid) OWNER TO lc_auth;

COMMENT ON FUNCTION touch_session(uuid) IS
  '005/D2. Called exactly once per request, by AuthorizationInterceptor, ONLY after idle/absolute limits are confirmed not exceeded. Never called by resolve_session() itself. A no-op against an already-revoked session.';

REVOKE ALL ON FUNCTION touch_session(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION touch_session(uuid) TO lc_auth, lc_app;

-- ---------------------------------------------------------------------------
-- rotate_refresh() — one-line change. research.md D1.
-- ---------------------------------------------------------------------------
--
-- family_created_at is copied forward from the row being replaced, onto the fresh
-- session row a rotation mints. Everything else about this function is unchanged
-- from 0034 — same signature, same reuse-detection branch, same locking discipline.

CREATE OR REPLACE FUNCTION rotate_refresh(
  p_presented_digest   text,
  p_new_access_digest  text,
  p_new_refresh_digest text,
  p_device             jsonb,
  p_access_ttl         interval DEFAULT interval '15 minutes'
)
RETURNS TABLE (
  rotated        boolean,
  reuse_detected boolean,
  session_id     uuid,
  expires_at     timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_presented  refresh_token%ROWTYPE;
  v_new_session_id uuid;
  v_expires    timestamptz;
BEGIN
  SELECT * INTO v_presented
  FROM refresh_token
  WHERE token_digest = p_presented_digest;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, false, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;

  -- Lock the entire family before deciding anything about it.
  PERFORM 1
  FROM refresh_token
  WHERE family_id = v_presented.family_id
  FOR UPDATE;

  -- Re-read under the lock. The row may have been rotated or revoked by the
  -- caller we just waited behind, and acting on the stale copy is the race.
  SELECT * INTO v_presented
  FROM refresh_token
  WHERE token_digest = p_presented_digest;

  IF v_presented.revoked_at IS NOT NULL THEN
    RETURN QUERY SELECT false, false, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;

  -- FR-036. A used token presented again means the token was captured: either the
  -- legitimate holder or an attacker is replaying it, and there is no way to tell
  -- which. Revoking the whole family ends both.
  IF v_presented.used_at IS NOT NULL THEN
    UPDATE refresh_token
    SET revoked_at = now()
    WHERE family_id = v_presented.family_id
      AND revoked_at IS NULL;

    UPDATE session
    SET revoked_at = now()
    WHERE revoked_at IS NULL
      AND id IN (
        SELECT rt.session_id FROM refresh_token rt WHERE rt.family_id = v_presented.family_id
      );

    RETURN QUERY SELECT false, true, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;

  -- The ordinary path: rotate. Marking the presented row used and inserting its
  -- child happen in one transaction, so a token can never be spent without a
  -- successor existing (FR-035).
  UPDATE refresh_token
  SET used_at = now()
  WHERE id = v_presented.id;

  v_expires := now() + p_access_ttl;

  -- 005/D1: family_created_at is carried forward from the row being replaced, NOT
  -- reset to now(). last_seen_at is left to its column DEFAULT now() — a rotation
  -- is itself activity.
  INSERT INTO session (identity_id, access_digest, expires_at, device_metadata, family_created_at)
  SELECT s.identity_id, p_new_access_digest, v_expires, COALESCE(p_device, '{}'::jsonb), s.family_created_at
  FROM session s
  WHERE s.id = v_presented.session_id
  RETURNING id INTO v_new_session_id;

  INSERT INTO refresh_token (family_id, session_id, token_digest, parent_id, device_metadata)
  VALUES (
    v_presented.family_id,
    v_new_session_id,
    p_new_refresh_digest,
    v_presented.id,
    COALESCE(p_device, '{}'::jsonb)
  );

  RETURN QUERY SELECT true, false, v_new_session_id, v_expires;
END;
$$;

COMMENT ON FUNCTION rotate_refresh(text, text, text, jsonb, interval) IS
  'FR-035/FR-036 (003). 005/D1: the INSERT INTO session now carries family_created_at forward from the row being replaced, so the absolute clock is anchored to the family''s origin rather than reset on every rotation.';

-- ---------------------------------------------------------------------------
-- sign_out() — new. research.md D5.
-- ---------------------------------------------------------------------------
--
-- Structurally identical to the revocation rotate_refresh() already performs on
-- detected reuse — this is that same branch, triggered on purpose instead of on a
-- detected anomaly. Resolves the FAMILY via the presented session's own
-- refresh_token row, not just the presented row itself: FR-003 requires the whole
-- family dead, and D1's finding (a "session" a person perceives spans many session
-- rows) means revoking only p_session_id would leave the rest of the family, and
-- its still-valid refresh tokens, alive.
--
-- Idempotent by construction: an already-revoked family's refresh_token row still
-- exists (rows are marked, never deleted), so a second call still finds family_id,
-- and both UPDATEs' WHERE revoked_at IS NULL guards make them no-ops.

CREATE FUNCTION sign_out(p_session_id uuid) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_family_id uuid;
BEGIN
  SELECT family_id INTO v_family_id FROM refresh_token WHERE session_id = p_session_id LIMIT 1;
  IF v_family_id IS NULL THEN RETURN; END IF; -- already dead or unknown: idempotent no-op

  UPDATE refresh_token SET revoked_at = now()
    WHERE family_id = v_family_id AND revoked_at IS NULL;
  UPDATE session SET revoked_at = now()
    WHERE revoked_at IS NULL
      AND id IN (SELECT rt.session_id FROM refresh_token rt WHERE rt.family_id = v_family_id);
END;
$$;

ALTER FUNCTION sign_out(uuid) OWNER TO lc_auth;

COMMENT ON FUNCTION sign_out(uuid) IS
  '005/D5. Revokes the WHOLE refresh-token family sharing the presented session''s family_id, not just the presented row. Idempotent: a second call against an already-dead family is a no-op. EXECUTE granted to lc_auth only — POST /auth/sign-out runs on lc_auth''s connection.';

REVOKE ALL ON FUNCTION sign_out(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sign_out(uuid) TO lc_auth;
