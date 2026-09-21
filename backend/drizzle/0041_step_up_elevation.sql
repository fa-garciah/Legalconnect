-- step_up_elevation: a database-backed, single-use, two-minute elevation.
-- data-model.md `step_up_elevation`, research.md D6.
--
-- WHY NOT A SIGNED TOKEN. The constitution prohibits a stateless credential as sole
-- authority (003/research.md D2). A step-up elevation IS a credential — "this
-- identity recently proved possession of its second factor for this one operation"
-- — and the same prohibition applies to it verbatim. A DB-backed, single-use,
-- revocable-by-construction row is the only shape consistent with what 003 already
-- committed to.
--
-- IDENTITY-SCOPED, NOT TENANT-SCOPED, for the same reason identity_credential and
-- identity_factor are (003): a step-up verification authenticates a PERSON, not a
-- tenant. The capability it gates is checked against tenant-scoped authorization
-- SEPARATELY, after step-up, by AuthorizationInterceptor's existing decide() call.

CREATE TABLE step_up_elevation (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id   uuid NOT NULL REFERENCES identity (id) ON DELETE CASCADE,
  -- One of the five stepUp: true capability ids — validated in the application
  -- against the CapabilityId union, not a DB constraint (matching 004/D1: a
  -- capability is an application-level fact, never a database table).
  capability    text NOT NULL,
  -- SHA-256 of an opaque high-entropy value, exactly session.access_digest's shape.
  token_digest  text NOT NULL UNIQUE,
  expires_at    timestamptz NOT NULL,
  -- NULL until used. Non-null + presented again = refuse (same shape as
  -- refresh_token.used_at).
  consumed_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT step_up_elevation_capability_not_blank CHECK (length(btrim(capability)) >= 1),
  CONSTRAINT step_up_elevation_digest_not_blank CHECK (length(btrim(token_digest)) >= 1)
);

COMMENT ON TABLE step_up_elevation IS
  '005/D6. One row per completed second-factor verification for one sensitive operation. Identity-scoped, not tenant-scoped — a step-up verification authenticates a person, not a tenant. lc_app holds no table privilege; it may EXECUTE consume_step_up() and nothing else.';

CREATE INDEX step_up_elevation_identity_capability_idx
  ON step_up_elevation (identity_id, capability)
  WHERE consumed_at IS NULL;

-- ---------------------------------------------------------------------------
-- Grants: lc_auth issues (SELECT/INSERT/UPDATE), lc_app consumes only (no table
-- grant at all — its entire reach is EXECUTE on consume_step_up() below).
-- ---------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE ON step_up_elevation TO lc_auth;

-- ---------------------------------------------------------------------------
-- consume_step_up() — new. research.md D6.
-- ---------------------------------------------------------------------------
--
-- Atomic check-and-set: the UPDATE's WHERE clause checks consumed_at IS NULL AND
-- expires_at > now() in the SAME statement that sets consumed_at, so two
-- simultaneous presentations of the same token cannot both succeed. Returns no row
-- (NULL to the caller) for absent, expired, wrong-capability, or already-consumed —
-- all four collapse to the same refusal at the application layer
-- (AuthorizationInterceptor's step_up_required), deliberately NOT
-- resolve_session()'s indistinguishable-refusal shape, because this refusal is
-- workflow guidance, not a secret.
--
-- EXECUTE granted to lc_app: unlike issuance, the GATED endpoint runs on the
-- ordinary application connection (any tenant-scoped route), and must be able to
-- consume an elevation without ever reading the table directly.

CREATE FUNCTION consume_step_up(p_token_digest text, p_identity_id uuid, p_capability text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE step_up_elevation
  SET consumed_at = now()
  WHERE token_digest = p_token_digest AND identity_id = p_identity_id
    AND capability = p_capability AND consumed_at IS NULL AND expires_at > now()
  RETURNING true;
$$;

ALTER FUNCTION consume_step_up(text, uuid, text) OWNER TO lc_auth;

COMMENT ON FUNCTION consume_step_up(text, uuid, text) IS
  '005/D6. Atomic check-and-set: single-use by construction. Scoped to exactly one (identity_id, capability) pair — a token minted for one gated operation does not satisfy a different one. Returns NULL for absent, expired, wrong-capability, or already-consumed, collapsed by the caller into step_up_required.';

REVOKE ALL ON FUNCTION consume_step_up(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION consume_step_up(text, uuid, text) TO lc_app;
