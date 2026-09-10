-- The pending second-factor challenge. Closes a gap between contracts and
-- data-model, recorded in .spec-context.json before being filled.
--
-- THE GAP. contracts/authentication.md requires a `challengeToken` that is
-- short-lived, SINGLE-USE, and carries no identity the client can read. It is the
-- state that makes POST /auth/factor reachable when no session exists yet, because
-- FR-003 forbids emitting one before the second factor succeeds. data-model.md
-- specifies no storage for it — five entities, none of them a pending challenge —
-- and no FR in spec.md names it.
--
-- Single-use and stateless cannot both hold: a self-contained token cannot
-- invalidate itself. Without single-use, one credential verification mints
-- unlimited sessions by replaying the same token, which is most of what the second
-- factor exists to prevent.
--
-- THE RESOLUTION, and why it is two columns rather than a sixth table. A pending
-- challenge is per-identity state with a lifetime of a minute, exactly like the
-- lockout counters already on this table, and there is at most ONE at a time by
-- design: a fresh sign-in should supersede a prior challenge rather than leave two
-- live. `identity_factor` is described as holding "the TOTP secret and the lockout
-- state"; this is the same class of thing. data-model.md commits to five entities
-- and a sixth table for two columns and a minute of lifetime would be a worse
-- trade than saying so here.
--
-- THE DIGEST IS UNIQUE AND LOOKED UP BY ITSELF. The token must not reveal the
-- identity to the client, so the server cannot be told who to look for — it must
-- resolve the identity FROM the token. A partial unique index makes that a single
-- indexed read while leaving the column free for every identity not mid-sign-in.
--
-- ONLY the enrolled path uses this. An identity with no confirmed factor has no
-- row here at all, and its `next: "enrollment"` token is a different mechanism
-- (see enrollment.md): replaying THAT one is harmless, because FR-012 already says
-- beginning enrollment again discards the prior unconfirmed secret. Replaying a
-- challenge token is not harmless, which is why only this one is stateful.

ALTER TABLE identity_factor
  -- SHA-256 of the opaque token, never the token — the same discipline `session`
  -- applies for the same reason: a dump must yield nothing usable.
  ADD COLUMN challenge_nonce_digest text,
  ADD COLUMN challenge_expires_at   timestamptz;

CREATE UNIQUE INDEX identity_factor_challenge_nonce_unique
  ON identity_factor (challenge_nonce_digest)
  WHERE challenge_nonce_digest IS NOT NULL;

COMMENT ON COLUMN identity_factor.challenge_nonce_digest IS
  'Digest of the pending challengeToken. At most one per identity: a fresh sign-in supersedes any prior challenge. Cleared on consumption, which is what makes the token single-use (contracts/authentication.md).';

-- ---------------------------------------------------------------------------
-- issue_challenge() — begins the second-factor step.
-- ---------------------------------------------------------------------------
--
-- Overwrites any prior pending challenge unconditionally. That is deliberate: a
-- person who starts signing in twice should find the second attempt live and the
-- first dead, not the other way round, and leaving both live would multiply the
-- windows during which a captured token is useful.
--
-- Refuses an identity with no CONFIRMED factor. An unconfirmed row never satisfies
-- a challenge (FR-010), so issuing one against it would create a token that can
-- never be spent.

CREATE FUNCTION issue_challenge(
  p_identity_id  uuid,
  p_nonce_digest text,
  p_ttl          interval DEFAULT interval '5 minutes'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE identity_factor
  SET challenge_nonce_digest = p_nonce_digest,
      challenge_expires_at   = now() + p_ttl
  WHERE identity_id = p_identity_id
    AND confirmed_at IS NOT NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

ALTER FUNCTION issue_challenge(uuid, text, interval) OWNER TO lc_auth;

-- ---------------------------------------------------------------------------
-- consume_challenge() — SINGLE-USE, enforced in the data layer.
-- ---------------------------------------------------------------------------
--
-- Compare-and-clear under FOR UPDATE, so two simultaneous presentations of one
-- token yield exactly one identity and one session. An application-level
-- read-then-clear cannot promise that: both readers would see the same live row
-- before either cleared it, and both would proceed to emit a session from a single
-- credential verification.
--
-- Returns NULL for unknown, expired and already-consumed alike. The caller must
-- refuse all three identically to a wrong code (FR-022), and returning a reason
-- here would be a distinction waiting to leak.
--
-- IT DOES NOT VERIFY THE CODE and does not touch the lockout counters. Those are
-- claim_attempt()'s, called separately by the application once it knows which
-- identity is being challenged. Keeping them apart is what lets a wrong code
-- consume an attempt WITHOUT consuming the challenge, so a person who fat-fingers
-- one digit is not sent back to re-enter their credential.

CREATE FUNCTION consume_challenge(p_nonce_digest text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_identity_id uuid;
BEGIN
  SELECT identity_id INTO v_identity_id
  FROM identity_factor
  WHERE challenge_nonce_digest = p_nonce_digest
    AND challenge_expires_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE identity_factor
  SET challenge_nonce_digest = NULL,
      challenge_expires_at   = NULL
  WHERE identity_id = v_identity_id;

  RETURN v_identity_id;
END;
$$;

ALTER FUNCTION consume_challenge(text) OWNER TO lc_auth;

-- ---------------------------------------------------------------------------
-- peek_challenge() — resolves without consuming.
-- ---------------------------------------------------------------------------
--
-- A WRONG CODE MUST NOT BURN THE CHALLENGE. FR-021 gives a person five attempts
-- before a lockout; if each wrong code also invalidated the token they would be
-- returned to the credential step every time, and the five attempts would be
-- unreachable in practice.
--
-- So the flow is: peek to learn who is being challenged, verify the code, and
-- consume ONLY on success. The window between peek and consume is closed by
-- consume_challenge()'s FOR UPDATE, which is where the single-use guarantee
-- actually lives.

CREATE FUNCTION peek_challenge(p_nonce_digest text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT identity_id
  FROM identity_factor
  WHERE challenge_nonce_digest = p_nonce_digest
    AND challenge_expires_at > now();
$$;

ALTER FUNCTION peek_challenge(text) OWNER TO lc_auth;

REVOKE ALL ON FUNCTION issue_challenge(uuid, text, interval) FROM PUBLIC;
REVOKE ALL ON FUNCTION consume_challenge(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION peek_challenge(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION issue_challenge(uuid, text, interval) TO lc_auth;
GRANT EXECUTE ON FUNCTION consume_challenge(text) TO lc_auth;
GRANT EXECUTE ON FUNCTION peek_challenge(text) TO lc_auth;
