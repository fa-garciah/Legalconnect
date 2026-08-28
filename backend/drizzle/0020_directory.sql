-- The firm directory: position catalog + directory entries. 017-firm-directory,
-- data-model.md. Adds no column to any table 001, 002 or 004 own (FR-014).

CREATE TYPE position_status AS ENUM ('active', 'retired');

CREATE TABLE position (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenant (id),
  name       text NOT NULL,
  status     position_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz,

  -- Mirrors membership's own revoked_at consistency check (0013).
  CONSTRAINT position_retired_at_consistent CHECK (
    (status = 'retired' AND retired_at IS NOT NULL)
    OR (status = 'active' AND retired_at IS NULL)
  )
);

COMMENT ON TABLE position IS
  'Never hard-deleted (FR-007) — retirement is a status change. research.md, "Retirement, never deletion".';

-- research.md D6 — active names collide case-insensitively per tenant; a
-- retired name is free to reuse, which is what makes the retire-then-recreate
-- pattern (research.md D4) legal.
CREATE UNIQUE INDEX position_tenant_active_name_unique
  ON position (tenant_id, lower(trim(name)))
  WHERE status = 'active';

CREATE TABLE directory_entry (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- FR-001: extends exactly one live membership. UNIQUE is what makes
  -- "upsert on first assignment" (research.md D1) correct.
  membership_id uuid NOT NULL UNIQUE REFERENCES membership (id),
  tenant_id     uuid NOT NULL REFERENCES tenant (id),
  -- FR-002: at most one position, MAY be unset.
  position_id   uuid REFERENCES position (id),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE directory_entry IS
  'Never hard-deleted (FR-004). Extends membership behind its own seam (FK only) — never a modification of the membership table itself. A row with position_id NULL, and the absence of any row, both mean "no position assigned" (research.md D1).';

ALTER TABLE position ENABLE ROW LEVEL SECURITY;
ALTER TABLE position FORCE ROW LEVEL SECURITY;
ALTER TABLE directory_entry ENABLE ROW LEVEL SECURITY;
ALTER TABLE directory_entry FORCE ROW LEVEL SECURITY;

-- Unlike membership (whose only lc_app write path is via accept_invitation(),
-- a different role), lc_app legitimately INSERTs into both of these tables
-- directly — an SA/MP's own tenant-scoped request creates the row, the same
-- shape a plan change already has. One FOR ALL policy each is therefore
-- sufficient, rather than membership's split SELECT/UPDATE policies.
CREATE POLICY position_own_tenant ON position
  FOR ALL
  TO lc_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY directory_entry_own_tenant ON directory_entry
  FOR ALL
  TO lc_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- No DELETE grant on either table, for any role — FR-004/FR-007's "never
-- hard-deleted" is the absent grant, the same discipline every prior slice
-- used for tenant/membership/invitation.
GRANT SELECT, INSERT, UPDATE ON position TO lc_app;
GRANT SELECT, INSERT, UPDATE ON directory_entry TO lc_app;
