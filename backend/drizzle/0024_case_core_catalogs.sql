-- The three case catalogs. 006-client-case-core, Decision 1 and data-model.md.
--
-- The conceptual model assumed these lived in the firm directory; 017 as built ships
-- only `position`, so case_status, matter_type and venue were never anyone's table.
-- They are consumed exclusively by case_file, which this slice also owns.
--
-- Structurally identical to 0020's `position`, three times: name + active/retired
-- status + per-tenant active-name uniqueness. One column differs — see is_closing.

CREATE TYPE catalog_entry_status AS ENUM ('active', 'retired');

-- ---------------------------------------------------------------------------
-- case_status
-- ---------------------------------------------------------------------------

CREATE TABLE case_status (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenant (id),
  name        text NOT NULL,
  -- FR-008a. The firm's own declaration that a case holding this status is closed.
  -- The product must NOT infer this from the name: the catalog is per tenant
  -- (Principle III), so `Concluido` means nothing to the product that `Archivado`
  -- does not. A tenant may mark several statuses closing, or none; both are legal.
  is_closing  boolean NOT NULL DEFAULT false,
  status      catalog_entry_status NOT NULL DEFAULT 'active',
  created_at  timestamptz NOT NULL DEFAULT now(),
  retired_at  timestamptz,

  CONSTRAINT case_status_retired_at_consistent CHECK (
    (status = 'retired' AND retired_at IS NOT NULL)
    OR (status = 'active' AND retired_at IS NULL)
  )
);

COMMENT ON TABLE case_status IS
  'Never hard-deleted (FR-019). is_closing is what stamps case_file.closed_on (FR-008a) — the one field on any catalog entry that is editable after creation, because it is a declaration about meaning rather than the meaning itself.';

CREATE UNIQUE INDEX case_status_tenant_active_name_unique
  ON case_status (tenant_id, lower(trim(name)))
  WHERE status = 'active';

-- ---------------------------------------------------------------------------
-- matter_type
-- ---------------------------------------------------------------------------

CREATE TABLE matter_type (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenant (id),
  name        text NOT NULL,
  status      catalog_entry_status NOT NULL DEFAULT 'active',
  created_at  timestamptz NOT NULL DEFAULT now(),
  retired_at  timestamptz,

  CONSTRAINT matter_type_retired_at_consistent CHECK (
    (status = 'retired' AND retired_at IS NOT NULL)
    OR (status = 'active' AND retired_at IS NULL)
  )
);

COMMENT ON TABLE matter_type IS 'Never hard-deleted (FR-019). Optional on a case.';

CREATE UNIQUE INDEX matter_type_tenant_active_name_unique
  ON matter_type (tenant_id, lower(trim(name)))
  WHERE status = 'active';

-- ---------------------------------------------------------------------------
-- venue
-- ---------------------------------------------------------------------------

CREATE TABLE venue (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenant (id),
  name        text NOT NULL,
  status      catalog_entry_status NOT NULL DEFAULT 'active',
  created_at  timestamptz NOT NULL DEFAULT now(),
  retired_at  timestamptz,

  CONSTRAINT venue_retired_at_consistent CHECK (
    (status = 'retired' AND retired_at IS NOT NULL)
    OR (status = 'active' AND retired_at IS NULL)
  )
);

COMMENT ON TABLE venue IS
  'Never hard-deleted (FR-019). Optional on a case — a consultative matter has no venue. Seeded EMPTY: a firm''s courts depend on its jurisdiction, and any list this product shipped would be wrong for most firms and a statement about where they practise (research.md D7).';

CREATE UNIQUE INDEX venue_tenant_active_name_unique
  ON venue (tenant_id, lower(trim(name)))
  WHERE status = 'active';

-- ---------------------------------------------------------------------------
-- The three foreign keys 0023 deferred
-- ---------------------------------------------------------------------------
--
-- The FK is what makes FR-020's "a retired entry stays resolvable" structural:
-- retirement is a status change, the row persists, and every case referencing it keeps
-- resolving. There is no ON DELETE clause because there is no DELETE grant.

ALTER TABLE case_file
  ADD CONSTRAINT case_file_case_status_fk
    FOREIGN KEY (case_status_id) REFERENCES case_status (id),
  ADD CONSTRAINT case_file_matter_type_fk
    FOREIGN KEY (matter_type_id) REFERENCES matter_type (id),
  ADD CONSTRAINT case_file_venue_fk
    FOREIGN KEY (venue_id) REFERENCES venue (id);

-- Cross-tenant catalog references (US2 scenario 6) are refused in the service, not by a
-- composite FK: that would need a redundant composite unique key on every catalog table.
-- RLS already makes another tenant's catalog row invisible, so the service's existence
-- check fails naturally and returns the 422 the contract specifies.

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------

ALTER TABLE case_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_status FORCE  ROW LEVEL SECURITY;
ALTER TABLE matter_type ENABLE ROW LEVEL SECURITY;
ALTER TABLE matter_type FORCE  ROW LEVEL SECURITY;
ALTER TABLE venue       ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue       FORCE  ROW LEVEL SECURITY;

CREATE POLICY case_status_own_tenant ON case_status
  FOR ALL
  TO lc_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY matter_type_own_tenant ON matter_type
  FOR ALL
  TO lc_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY venue_own_tenant ON venue
  FOR ALL
  TO lc_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON case_status TO lc_app;
GRANT SELECT, INSERT, UPDATE ON matter_type TO lc_app;
GRANT SELECT, INSERT, UPDATE ON venue       TO lc_app;

-- Provisioning (FR-021, research.md D7). Exactly 0022's shape, three times: one FOR
-- INSERT policy with a restricting WITH CHECK, one GRANT INSERT, and nothing else.
--
-- No SELECT, so the platform role cannot read back the catalogs it just wrote and cannot
-- enumerate any firm's vocabulary. No UPDATE, so it can never retire or edit an entry a
-- firm owns. No DELETE, so FR-019 holds for this role as it does for lc_app. The seed
-- uses neither RETURNING nor ON CONFLICT precisely so no SELECT privilege is needed.
--
-- Without a matching policy the GRANT alone is not enough: FORCE ROW LEVEL SECURITY
-- blocks the insert regardless of the privilege.
CREATE POLICY case_status_platform_seed_insert ON case_status
  FOR INSERT
  TO lc_platform
  WITH CHECK (status = 'active' AND retired_at IS NULL);

CREATE POLICY matter_type_platform_seed_insert ON matter_type
  FOR INSERT
  TO lc_platform
  WITH CHECK (status = 'active' AND retired_at IS NULL);

CREATE POLICY venue_platform_seed_insert ON venue
  FOR INSERT
  TO lc_platform
  WITH CHECK (status = 'active' AND retired_at IS NULL);

GRANT INSERT ON case_status TO lc_platform;
GRANT INSERT ON matter_type TO lc_platform;
GRANT INSERT ON venue       TO lc_platform;

-- client, case_file and case_assignment are deliberately untouched by lc_platform.
-- Seeding the vocabulary a firm chooses from is a provisioning act; registering its
-- clients and opening its matters is the firm's own, exactly the line 0022 drew between
-- `position` and `directory_entry`.
