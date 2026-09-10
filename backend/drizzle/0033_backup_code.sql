-- backup_code: ten rows per identity per issued set. FR-023 to FR-031.
-- data-model.md entity `backup_code`, research.md D6 and D11.
--
-- Constitution v1.5.0 reframed this material. Under the previous identity provider
-- holding backup codes was a NAMED EXCEPTION to the rule that the platform stores
-- no authentication factors, granted because no provider supplied them. With a
-- self-hosted identity layer there is no external provider for it to be an
-- exception to: building and holding this material IS the design, and the
-- constitution now states it as a positive obligation carrying every requirement
-- it always carried (Recognised Technical Debt item 8).
--
-- What that means concretely, and all of it is enforced below or in T028/T079:
--   - stored ONLY as memory-hard digests, never in recoverable form, never in
--     logs, never in an error message, never in an audit entry (FR-025);
--   - single-use — consuming one invalidates it (FR-026);
--   - re-issuance REPLACES the entire set rather than topping it up (FR-028);
--   - no archetype may read another person's codes, and NO archetype may read any
--     code at all, including PO and SA (FR-029) — which is why lc_app, the
--     connection every archetype's requests run on, is granted nothing here.
--
-- A bug on this path is an authentication bypass, not a leak. Coverage is blocking
-- in CI on the same footing as tenant isolation.

CREATE TABLE backup_code (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id uuid NOT NULL REFERENCES identity (id) ON DELETE CASCADE,
  -- Groups one issued set, so re-issuance replaces wholesale (FR-028) rather than
  -- leaving a person holding codes from two generations at once.
  set_id      uuid NOT NULL,
  -- Argon2id PHC string, HIGH-ENTROPY profile (research.md D6). A backup code is
  -- 128 bits of randomness this product generated, not a human-chosen secret, so
  -- it needs no interactive-grade work factor to resist guessing — and it must not
  -- carry one, because verification compares against EVERY unconsumed digest in
  -- the set with no early exit (D11). Ten interactive-profile verifications per
  -- attempt would be a self-inflicted denial of service.
  digest      text NOT NULL,
  -- NULL while usable. Single-use (FR-026). Deliberately a timestamp rather than a
  -- boolean: consumption is an audited event and the instant is part of the record.
  consumed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT backup_code_digest_not_blank CHECK (length(btrim(digest)) >= 1)
);

COMMENT ON TABLE backup_code IS
  'Authentication material. lc_app holds NO privilege here — FR-029 forbids ANY archetype reading any code, including its owner after issuance and including PO and SA. Displayed exactly once, at issuance.';

-- The lookup verification iterates (research.md D11). Partial on the unconsumed
-- rows because that is the only set a verification ever reads — a consumed code is
-- refused identically to one that never existed, so there is nothing to compare it
-- against.
CREATE INDEX backup_code_unconsumed_idx
  ON backup_code (identity_id, set_id)
  WHERE consumed_at IS NULL;

-- ---------------------------------------------------------------------------
-- consume_backup_code() — FR-026, research.md D11.
-- ---------------------------------------------------------------------------
--
-- THE FIXED-COMPARISON-COUNT LOOP IS NOT HERE. It lives in the application
-- (T028/backup-codes.ts), which is where Argon2id is — the same constraint that
-- made lc_auth a LOGIN role. By the time this function is called the application
-- has already compared the presented value against EVERY unconsumed digest in the
-- set, performing the same number of verifications whether or not one matched, so
-- that position in the set is not observable from response time. This function
-- receives the id that comparison identified, and decides one thing only:
--
--     did THIS caller win the race to consume that row?
--
-- Which matters because two concurrent recoveries presenting the same LAST
-- unconsumed code must yield exactly one success and exactly one consumption. A
-- read-then-write in application code cannot guarantee that; SELECT ... FOR UPDATE
-- inside one function can.
--
-- Returns false rather than raising when the row is already consumed or absent.
-- The caller must refuse a consumed code identically to one that never existed
-- (FR-022, SC-013), and an exception would be a different observable outcome.

CREATE FUNCTION consume_backup_code(
  p_identity_id uuid,
  p_code_id     uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- FOR UPDATE serialises the two racing recoveries. The loser blocks here, then
  -- re-reads and finds consumed_at already set, so its WHERE matches nothing.
  SELECT id INTO v_id
  FROM backup_code
  WHERE id = p_code_id
    AND identity_id = p_identity_id
    AND consumed_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE backup_code
  SET consumed_at = now()
  WHERE id = v_id;

  RETURN true;
END;
$$;

ALTER FUNCTION consume_backup_code(uuid, uuid) OWNER TO lc_auth;

COMMENT ON FUNCTION consume_backup_code(uuid, uuid) IS
  'FR-026/D11. Marks exactly one unconsumed code consumed under FOR UPDATE, so two recoveries presenting the same last code yield one success. Returns false rather than raising, because a consumed code must be refused identically to one that never existed.';

-- ---------------------------------------------------------------------------
-- Grants. lc_app appears nowhere.
-- ---------------------------------------------------------------------------

-- Issuance, consumption, replacement. Verification reads the unconsumed set's
-- digests and compares each in the application, for the same salting reason the
-- credential carries.
--
-- UPDATE is column-scoped to consumed_at: nothing may ever rewrite a digest in
-- place. Re-issuance replaces the set (FR-028), which is a DELETE and an INSERT of
-- a new set_id, not an edit.
GRANT SELECT, INSERT, DELETE   ON backup_code TO lc_auth;
GRANT UPDATE (consumed_at)     ON backup_code TO lc_auth;

REVOKE ALL ON FUNCTION consume_backup_code(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION consume_backup_code(uuid, uuid) TO lc_auth;
