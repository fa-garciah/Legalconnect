-- Invitation: a single-use, 7-day grant to become a member of one tenant with
-- one named archetype, issued to one email address, or seeded by the platform
-- context for a tenant with no members yet. data-model.md, research.md D2, D6, D8.

CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'revoked');

CREATE TABLE invitation (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL REFERENCES tenant (id),
  target_archetype        archetype NOT NULL,
  invited_email           text NOT NULL,

  -- research.md D2: the bearer credential is a separate random token, never the
  -- row's id. Only its hash is stored.
  reference_hash          text NOT NULL,

  issued_by_membership_id uuid REFERENCES membership (id),
  seeded                  boolean NOT NULL DEFAULT false,
  status                  invitation_status NOT NULL DEFAULT 'pending',

  -- research.md D8: the per-reference brute-force counter.
  failed_attempts         integer NOT NULL DEFAULT 0,

  issued_at               timestamptz NOT NULL DEFAULT now(),

  -- FR-027: 7 days, uniform. NOT a GENERATED column — `timestamptz + interval`
  -- is not an IMMUTABLE expression in PostgreSQL, which GENERATED columns
  -- require, so PostgreSQL refuses to create one here. The same guarantee is
  -- achieved two ways instead: a DEFAULT computed at insert time, and a CHECK
  -- tying the value to issued_at exactly, so no row can ever carry any other
  -- value. Column-level grants below (see the bottom of this file) additionally
  -- withhold UPDATE on this column from every role — belt and suspenders, since
  -- either mechanism alone already makes "MUST NOT be extendable" hold.
  expires_at              timestamptz NOT NULL DEFAULT (now() + interval '7 days'),

  accepted_at             timestamptz,
  revoked_at              timestamptz,

  CONSTRAINT invitation_reference_hash_unique UNIQUE (reference_hash),
  CONSTRAINT invitation_invited_email_not_blank CHECK (length(btrim(invited_email)) >= 1),
  CONSTRAINT invitation_failed_attempts_non_negative CHECK (failed_attempts >= 0),
  CONSTRAINT invitation_expires_at_fixed CHECK (expires_at = issued_at + interval '7 days'),

  -- FR-035, structurally: a seeded row targets SA and has no issuing membership;
  -- an ordinary row always has one.
  CONSTRAINT invitation_seeded_shape CHECK (
    (seeded AND target_archetype = 'SA' AND issued_by_membership_id IS NULL)
    OR (NOT seeded AND issued_by_membership_id IS NOT NULL)
  ),

  CONSTRAINT invitation_accepted_at_consistent CHECK (
    (status = 'accepted' AND accepted_at IS NOT NULL) OR (status <> 'accepted' AND accepted_at IS NULL)
  ),
  CONSTRAINT invitation_revoked_at_consistent CHECK (
    (status = 'revoked' AND revoked_at IS NOT NULL) OR (status <> 'revoked' AND revoked_at IS NULL)
  )
);

COMMENT ON TABLE invitation IS
  'expires_at is fixed to issued_at + 7 days by a CHECK constraint and by column-level grants withholding UPDATE on it from every role — FR-027''s "MUST NOT be extendable" is a data-layer fact. reference_hash, not id, is the bearer credential (research.md D2).';

CREATE INDEX invitation_tenant_status_idx ON invitation (tenant_id, status);

ALTER TABLE invitation ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitation FORCE ROW LEVEL SECURITY;

-- Ordinary tenant-scoped issue/revoke/list, the same shape as every 001 table.
CREATE POLICY invitation_own_tenant ON invitation
  FOR ALL
  TO lc_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid AND seeded = false);

-- Table-level SELECT and INSERT, but column-level UPDATE: lc_app may revoke
-- (status, revoked_at) and nothing else on an existing row — never
-- expires_at, issued_at, failed_attempts, accepted_at, or any identifying
-- column. Revocation is the only mutation an ordinary tenant member performs.
GRANT SELECT, INSERT ON invitation TO lc_app;
GRANT UPDATE (status, revoked_at) ON invitation TO lc_app;

-- The platform role's seed-insert policy and grant (research.md D6) are created
-- together with its membership counterpart in 0016.
--
-- lc_identity_writer's own policies (SELECT by reference_hash across tenants,
-- UPDATE for status/accepted_at/failed_attempts) are created in 0015, alongside
-- the role itself.
