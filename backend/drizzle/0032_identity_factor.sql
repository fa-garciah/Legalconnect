-- identity_factor: the TOTP secret and the lockout state. One row per identity.
-- data-model.md entity `identity_factor`, research.md D5 and D7.
--
-- Like identity_credential, lc_app holds NO privilege here at all (FR-015: no
-- archetype may read a factor secret, including through its own session).
--
-- A TOTP SECRET IS THE MOST SENSITIVE RECOVERABLE MATERIAL IN THIS DATABASE, and
-- it differs from every other secret the product holds in the one respect that
-- governs how it must be stored: it CANNOT BE HASHED. A backup code is verified by
-- comparing digests and never needs to be recoverable; a TOTP secret must be
-- readable on every single verification. Anyone who can read this column in
-- plaintext holds a working second factor (Constitution v1.5.0, Custody of TOTP
-- secrets; Recognised Technical Debt item 11).
--
-- Hence `secret_ciphertext bytea` plus `key_reference`, never a plaintext column.
-- The wrapping key is held by the APPLICATION and deliberately not by the database
-- (FR-013), so a database dump, a restored backup, or read access to this table is
-- not sufficient to derive a working factor (SC-008). Storing the secret encrypted
-- under a key the database itself holds would defeat the entire control, which is
-- why no pgcrypto key lives here.

CREATE TABLE identity_factor (
  identity_id          uuid PRIMARY KEY REFERENCES identity (id) ON DELETE CASCADE,
  -- Envelope-encrypted TOTP secret (research.md D5). Never plaintext.
  secret_ciphertext    bytea NOT NULL,
  -- Which key wrapped it, so rotation is a re-wrap rather than a re-enrollment for
  -- every user in the system.
  key_reference        text NOT NULL,
  -- NULL until a valid derived code is returned (FR-009). THIS IS THE ENROLLMENT
  -- STATE. An unconfirmed row never satisfies a challenge (FR-010).
  confirmed_at         timestamptz,
  -- FR-021's counter. Reset to zero on success; backup-code attempts count toward
  -- it too, so recovery is not an unthrottled way around the limit.
  failed_attempt_count integer NOT NULL DEFAULT 0,
  -- FR-021's 15-minute window. Expires on its own — no archetype holds a reset
  -- capability, so a lockout must never need administrative action (FR-055).
  locked_until         timestamptz,
  -- FR-020's replay guard. SEE THE NOTE BELOW: this column is an addition to
  -- data-model.md, not a restatement of it.
  recent_code_digests  jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT identity_factor_key_reference_not_blank CHECK (length(btrim(key_reference)) >= 1),
  CONSTRAINT identity_factor_attempts_non_negative CHECK (failed_attempt_count >= 0),
  CONSTRAINT identity_factor_recent_digests_is_array CHECK (jsonb_typeof(recent_code_digests) = 'array')
);

COMMENT ON TABLE identity_factor IS
  'Authentication material. lc_app holds NO privilege here. The secret is envelope-encrypted under an application-held key that the database does not have (FR-013) — a dump yields no working factor.';

COMMENT ON COLUMN identity_factor.recent_code_digests IS
  'FR-020 replay guard. Digests of codes already accepted, with the instant each was accepted, pruned to FR-056 90-second window on every claim_attempt() call. Digests only — no code is ever stored.';

-- ---------------------------------------------------------------------------
-- A NOTE ON recent_code_digests — an addition to data-model.md, recorded openly.
-- ---------------------------------------------------------------------------
--
-- data-model.md lists six columns for this entity and none of them can hold a
-- replay guard, yet FR-020 requires one and names claim_attempt() as its home:
--
--     "A successfully used code MUST NOT be accepted again anywhere within the
--      full acceptance window of FR-056, not merely within the step it was
--      generated from."
--
-- Enforcing that needs memory of which codes were already accepted, for at least
-- the 90 seconds the window lasts. Nothing in the specified schema provides it, so
-- the requirement was unimplementable as written. This column closes that gap.
--
-- It is placed HERE rather than in a sixth table on purpose. data-model.md commits
-- to "five new entities", and this entity is already described as holding "the TOTP
-- secret and the lockout state" — a replay guard is precisely that class of
-- per-identity verification state. A sixth table would change the slice's shape to
-- store a bounded scrap of data.
--
-- The array is bounded by construction: at most three codes can legitimately be
-- accepted inside one 90-second window, and every call prunes entries older than
-- that window before appending. It holds DIGESTS, never codes — FR-014's exclusion
-- of factor material from any readable surface applies to this column as it does
-- to the secret.

-- ---------------------------------------------------------------------------
-- claim_attempt() — FR-020, FR-021, and FR-005's credential-step threshold.
-- ---------------------------------------------------------------------------
--
-- SECURITY DEFINER FOR ATOMICITY, NOT FOR SECRECY. Secrecy is delivered by the
-- grants: lc_app cannot reach this table at all. What a function delivers that a
-- sequence of application statements cannot is a read-then-write no concurrent
-- attempt can interleave with — and FR-020 and FR-021 each require exactly that by
-- name. Without it, two challenges presenting the same code at the same instant
-- both read "not yet used" and both succeed (SC-018).
--
-- IT RECEIVES A DIGEST OF THE PRESENTED CODE, NOT THE CODE, AND NOT THE SECRET.
-- By the time this is called the application has ALREADY verified the code against
-- the decrypted secret, because the envelope key is not in the database and no
-- in-database function could do the verification. This function decides three
-- things the application cannot decide atomically: whether the identity is locked,
-- whether this exact code was already spent inside the window, and what the counter
-- and lockout become as a result.
--
-- Owned by lc_auth so it runs with lc_auth's privileges rather than the migration
-- role's — the same reason 0015 gives its function OWNER TO lc_identity_writer. A
-- definer function owned by a superuser runs as a superuser.

CREATE FUNCTION claim_attempt(
  p_identity_id uuid,
  p_code_digest text,
  p_succeeded   boolean
)
RETURNS TABLE (
  admitted          boolean,
  locked            boolean,
  attempts_recorded integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now             timestamptz := now();
  v_window_start    timestamptz := v_now - interval '90 seconds';
  v_lockout_minutes integer     := 15;
  v_threshold       integer     := 5;
  v_factor          identity_factor%ROWTYPE;
  v_replayed        boolean;
  v_pruned          jsonb;
  v_attempts        integer;
  v_locked_until    timestamptz;
BEGIN
  -- FOR UPDATE is what makes the whole decision indivisible. Two concurrent
  -- challenges for one identity serialise here; the second sees what the first
  -- wrote, which is the only way FR-020's "exactly one success" holds.
  SELECT * INTO v_factor
  FROM identity_factor
  WHERE identity_id = p_identity_id
  FOR UPDATE;

  -- No factor row. Refuse, and say nothing that distinguishes this from a wrong
  -- code (FR-022). There is no counter to advance for an identity with no factor.
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, false, 0;
    RETURN;
  END IF;

  -- Already locked. Refuse WITHOUT advancing the counter and without disclosing
  -- that a lockout is in effect (FR-055) — a valid code presented during a lockout
  -- is refused indistinguishably from a wrong one. Not advancing the counter is
  -- what stops a locked-out person from having the window extended by their own
  -- retries.
  IF v_factor.locked_until IS NOT NULL AND v_factor.locked_until > v_now THEN
    RETURN QUERY SELECT false, true, v_factor.failed_attempt_count;
    RETURN;
  END IF;

  -- Prune the replay guard to FR-056's window before reading it, so an entry can
  -- never outlive the window it guards and the array cannot grow without bound.
  SELECT COALESCE(jsonb_agg(entry), '[]'::jsonb) INTO v_pruned
  FROM jsonb_array_elements(v_factor.recent_code_digests) AS entry
  WHERE (entry->>'at')::timestamptz > v_window_start;

  -- FR-020: was this exact code already spent ANYWHERE in the window — not merely
  -- in the step it was generated from?
  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_pruned) AS entry
    WHERE entry->>'d' = p_code_digest
  ) INTO v_replayed;

  -- A replay is a failure, and it counts. Treating it as a silent no-op would make
  -- replaying a captured code an unthrottled probe.
  IF p_succeeded AND NOT v_replayed THEN
    -- FR-021: success resets the counter to zero and clears any expired lockout.
    UPDATE identity_factor
    SET failed_attempt_count = 0,
        locked_until         = NULL,
        recent_code_digests  = v_pruned || jsonb_build_object('d', p_code_digest, 'at', v_now)
    WHERE identity_id = p_identity_id;

    RETURN QUERY SELECT true, false, 0;
    RETURN;
  END IF;

  -- Every other path is a failure: a wrong code, or a correct one already spent.
  v_attempts := v_factor.failed_attempt_count + 1;

  IF v_attempts >= v_threshold THEN
    v_locked_until := v_now + make_interval(mins => v_lockout_minutes);
  ELSE
    v_locked_until := NULL;
  END IF;

  UPDATE identity_factor
  SET failed_attempt_count = v_attempts,
      locked_until         = v_locked_until,
      recent_code_digests  = v_pruned
  WHERE identity_id = p_identity_id;

  RETURN QUERY SELECT false, (v_locked_until IS NOT NULL), v_attempts;
END;
$$;

ALTER FUNCTION claim_attempt(uuid, text, boolean) OWNER TO lc_auth;

COMMENT ON FUNCTION claim_attempt(uuid, text, boolean) IS
  'FR-020/FR-021. Lockout check, replay guard over the full 90-second window, and counter update as ONE indivisible step. Receives a digest of the presented code — never the code, never the secret. SECURITY DEFINER for atomicity, not for secrecy.';

-- ---------------------------------------------------------------------------
-- Grants. lc_app appears nowhere, including on the function.
-- ---------------------------------------------------------------------------

-- Enrollment, verification, lockout, and replacement on recovery. The ciphertext
-- must reach the application because the unwrapping key is held there (FR-013).
GRANT SELECT, INSERT, UPDATE, DELETE ON identity_factor TO lc_auth;

-- PUBLIC gets EXECUTE on new functions by default, which on a SECURITY DEFINER
-- function is how a definer becomes a privilege-escalation path. Revoked first,
-- then granted to exactly one role.
REVOKE ALL ON FUNCTION claim_attempt(uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_attempt(uuid, text, boolean) TO lc_auth;
