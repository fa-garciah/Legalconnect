-- session and refresh_token, plus the two functions the request path needs.
-- data-model.md entities `session` and `refresh_token`, research.md D2 and D8.
--
-- The constitution PROHIBITS pure stateless JWT outright, and the reason is not
-- taste: US09-EP12-ASC-ViewActiveSessions and US10-EP12-ASC-RevokeSession require
-- a session inventory that can be enumerated and revoked, which a signature and an
-- expiry cannot provide. "The API MUST validate every request against this
-- product's own session state, never against a bearer token's signature and expiry
-- alone." These two tables are that state.
--
-- Both store DIGESTS, never tokens (research.md D2). The credential the API emits
-- is an opaque high-entropy value; what is persisted is its SHA-256. A database
-- dump therefore yields no usable session — the same property the TOTP secret gets
-- from envelope encryption, achieved here more cheaply because a session digest
-- never needs to be reversed.
--
-- Neither table carries tenant_id, and that is the constitution's stated exception
-- rather than an oversight: a session belongs to a person, and a person exists
-- before and across tenants. FR-037 goes further — the session carries NO tenant
-- and NO archetype at all. Both are resolved per request from `membership`, and
-- nothing in the session is ever trusted as their source (002/FR-016). That is
-- what keeps the identity layer replaceable and is why this slice touches no
-- shipped authorization code.

CREATE TABLE session (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id     uuid NOT NULL REFERENCES identity (id) ON DELETE CASCADE,
  -- SHA-256 of the opaque access token (research.md D2). UNIQUE because resolution
  -- looks up by exactly this value on every single request.
  access_digest   text NOT NULL UNIQUE,
  -- 15 minutes from issuance (FR-035). 005 owns idle and absolute expiry by role
  -- class; this slice emits the column those extensions will read.
  expires_at      timestamptz NOT NULL,
  revoked_at      timestamptz,
  -- FR-035's device metadata. CARRIES NO PERSONAL DATA beyond user-agent class and
  -- coarse origin — Principle VI's minimisation applies here as everywhere, and
  -- this column is what US09 will render to a person listing their own sessions.
  device_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT session_access_digest_not_blank CHECK (length(btrim(access_digest)) >= 1),
  CONSTRAINT session_device_metadata_is_object CHECK (jsonb_typeof(device_metadata) = 'object')
);

COMMENT ON TABLE session IS
  'Product-owned session state. Carries NO tenant and NO archetype (FR-037) — both are resolved per request from membership. Stored as a digest, so a dump yields no usable session. lc_app holds no table privilege; it may EXECUTE resolve_session() and nothing else.';

CREATE INDEX session_identity_live_idx
  ON session (identity_id)
  WHERE revoked_at IS NULL;

CREATE TABLE refresh_token (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- All descendants of one authentication share this. Detected reuse revokes the
  -- whole family, which is only expressible because the lineage is recorded.
  family_id       uuid NOT NULL,
  session_id      uuid NOT NULL REFERENCES session (id) ON DELETE CASCADE,
  token_digest    text NOT NULL UNIQUE,
  parent_id       uuid REFERENCES refresh_token (id) ON DELETE SET NULL,
  -- NULL until rotated. NON-NULL AND PRESENTED AGAIN IS THE REUSE SIGNAL — the
  -- whole detection rests on this one column.
  used_at         timestamptz,
  revoked_at      timestamptz,
  device_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT refresh_token_digest_not_blank CHECK (length(btrim(token_digest)) >= 1),
  CONSTRAINT refresh_token_device_metadata_is_object CHECK (jsonb_typeof(device_metadata) = 'object')
);

COMMENT ON TABLE refresh_token IS
  'Rotating, individually revocable renewal credential. Rotated on every use; detected reuse revokes the entire family and its sessions (FR-036). Persisted server-side, which is what makes US09/US10 buildable in 005 and what the prohibition on stateless JWT requires.';

CREATE INDEX refresh_token_family_idx ON refresh_token (family_id);

-- ---------------------------------------------------------------------------
-- resolve_session() — FR-034. THE ONE FUNCTION lc_app MAY EXECUTE.
-- ---------------------------------------------------------------------------
--
-- Every other definer function in this slice is confined to lc_auth. This one is
-- not, and the exception is principled rather than convenient (research.md D8):
--
--   1. EVERY request must resolve a session, not just the four auth routes.
--   2. That resolution happens BEFORE app.identity_id exists — it is what
--      establishes it — so no RLS policy could scope it. `identity_self_row` works
--      because the identity is already known; here it is not yet known, and a
--      policy predicated on a setting that has not been set yet matches nothing.
--   3. A session digest is not material FR-013 or FR-015 protect. It authenticates
--      nobody who does not already hold the token it digests.
--
-- So a function is the ONLY way to scope this at all, and granting EXECUTE on it
-- is narrower than the alternative — a SELECT grant on `session` would let lc_app
-- read every row, which is exactly what the grant discipline exists to prevent.
--
-- Returns nothing for an expired, revoked or unknown digest. Deliberately not an
-- error and deliberately not a reason: the guard's caller must not be able to
-- distinguish the three.

CREATE FUNCTION resolve_session(p_access_digest text)
RETURNS TABLE (
  identity_id uuid,
  expires_at  timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT s.identity_id, s.expires_at
  FROM session s
  WHERE s.access_digest = p_access_digest
    AND s.revoked_at IS NULL
    AND s.expires_at > now();
$$;

ALTER FUNCTION resolve_session(text) OWNER TO lc_auth;

COMMENT ON FUNCTION resolve_session(text) IS
  'FR-034. The one function lc_app may EXECUTE. Resolution runs before app.identity_id exists, so no RLS policy could scope it. Returns no row for expired, revoked or unknown — the three are indistinguishable to the caller.';

-- ---------------------------------------------------------------------------
-- rotate_refresh() — FR-035, FR-036.
-- ---------------------------------------------------------------------------
--
-- SIGNATURE NOTE, recorded rather than glossed. data-model.md abbreviates this as
-- `rotate_refresh(token_digest, device)`. It cannot be only that: the replacement
-- access token and refresh token are OPAQUE HIGH-ENTROPY VALUES GENERATED IN THE
-- APPLICATION (research.md D2), and the database never sees them — it stores their
-- digests. So the caller must supply the new digests, exactly as claim_attempt()
-- receives a digest of a code the application already verified. The same
-- constraint produces both signatures: the cryptography is not in PostgreSQL.
--
-- What this function actually delivers is the part the application cannot do
-- safely: detect reuse and revoke a whole family without a window where two
-- callers both believe they won.
--
--   presented row absent   → refuse. Nothing to rotate.
--   presented row revoked  → refuse.
--   presented row USED     → REUSE DETECTED. Revoke every token in the family and
--                            every session those tokens belong to, then refuse.
--   otherwise              → mark used, mint child + new session, return them.
--
-- FOR UPDATE is taken on the whole FAMILY, not just the presented row, because the
-- revocation on detection writes to every one of them. Two simultaneous
-- presentations of the same used token serialise here, so the second sees the
-- first's revocation rather than performing its own concurrently (SC-019).

CREATE FUNCTION rotate_refresh(
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

  INSERT INTO session (identity_id, access_digest, expires_at, device_metadata)
  SELECT s.identity_id, p_new_access_digest, v_expires, COALESCE(p_device, '{}'::jsonb)
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

ALTER FUNCTION rotate_refresh(text, text, text, jsonb, interval) OWNER TO lc_auth;

COMMENT ON FUNCTION rotate_refresh(text, text, text, jsonb, interval) IS
  'FR-035/FR-036. Rotation and reuse detection under FOR UPDATE on the whole family, so two simultaneous presentations of one used token cannot both succeed. Receives digests of application-generated opaque tokens — the database never sees a token.';

-- ---------------------------------------------------------------------------
-- Grants.
-- ---------------------------------------------------------------------------

-- Emission, resolution, revocation.
GRANT SELECT, INSERT, UPDATE, DELETE ON session       TO lc_auth;
GRANT SELECT, INSERT, UPDATE, DELETE ON refresh_token TO lc_auth;

-- Pruning expired rows. Nothing on the material tables — 001 deliberately does not
-- hold this connection in the application.
GRANT DELETE, SELECT ON session       TO lc_retention;
GRANT DELETE, SELECT ON refresh_token TO lc_retention;

-- lc_app gets NO TABLE PRIVILEGE on either table. Its entire reach into session
-- state is the one function below, and POST /auth/refresh is an authentication
-- route running on lc_auth's connection, so no per-request path needs
-- rotate_refresh() from elsewhere.
REVOKE ALL ON FUNCTION resolve_session(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_session(text) TO lc_auth, lc_app;

REVOKE ALL ON FUNCTION rotate_refresh(text, text, text, jsonb, interval) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rotate_refresh(text, text, text, jsonb, interval) TO lc_auth;
