-- Case documents and the document-category catalog. 007-document-management,
-- data-model.md. Adds no column to any table 001, 002, 004, 006 or 017 own, except
-- one new counter column on tenant (research.md D3).

ALTER TABLE tenant ADD COLUMN storage_bytes_used bigint NOT NULL DEFAULT 0;

COMMENT ON COLUMN tenant.storage_bytes_used IS
  'research.md D3 — a transactionally-maintained running total, never decremented by withdrawal (FR-015). Read live on every upload check (FR-014), never cached.';

-- ---------------------------------------------------------------------------
-- document_category
-- ---------------------------------------------------------------------------

CREATE TYPE document_category_status AS ENUM ('active', 'retired');

CREATE TABLE document_category (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenant (id),
  name        text NOT NULL,
  status      document_category_status NOT NULL DEFAULT 'active',
  created_at  timestamptz NOT NULL DEFAULT now(),
  retired_at  timestamptz,

  CONSTRAINT document_category_retired_at_consistent CHECK (
    (status = 'retired' AND retired_at IS NOT NULL)
    OR (status = 'active' AND retired_at IS NULL)
  )
);

COMMENT ON TABLE document_category IS
  'Never hard-deleted (FR-012) — retirement is a status change. Structurally identical to 006''s case_status/matter_type/venue and 017''s position.';

-- research.md D1 — active names collide case-insensitively per tenant; a retired
-- name is free to reuse, the same shape 006/017's own catalogs already use.
CREATE UNIQUE INDEX document_category_tenant_active_name_unique
  ON document_category (tenant_id, lower(trim(name)))
  WHERE status = 'active';

-- ---------------------------------------------------------------------------
-- document
-- ---------------------------------------------------------------------------

CREATE TYPE document_status AS ENUM ('active', 'withdrawn');

CREATE TABLE document (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid NOT NULL REFERENCES tenant (id),
  -- FR-001: exactly one case, immutable after upload — no route in this slice
  -- changes this column.
  case_id                  uuid NOT NULL REFERENCES case_file (id),
  -- FR-002: membership-scoped attribution, never an identity directly.
  uploaded_by_membership_id uuid NOT NULL REFERENCES membership (id),
  -- FR-010: never null. An upload naming no category resolves to the tenant's
  -- "Unclassified" default BEFORE this row is inserted.
  category_id              uuid NOT NULL REFERENCES document_category (id),
  -- The S3 object key (research.md D6) — tenant/{tenantId}/case/{caseId}/{id}. No
  -- column here ever holds file bytes, only the pointer to them.
  storage_key              text NOT NULL UNIQUE,
  original_filename        text NOT NULL,
  mime_type                text NOT NULL,
  size_bytes               bigint NOT NULL,
  status                   document_status NOT NULL DEFAULT 'active',
  uploaded_at              timestamptz NOT NULL DEFAULT now(),
  withdrawn_at             timestamptz,

  CONSTRAINT document_withdrawn_at_consistent CHECK (
    (status = 'withdrawn' AND withdrawn_at IS NOT NULL)
    OR (status = 'active' AND withdrawn_at IS NULL)
  )
);

COMMENT ON TABLE document IS
  'Never hard-deleted (FR-004). Scope is its case''s scope (spec.md) — this table carries no assignment of its own and this slice registers no scope resolver.';

-- Backs the case-level active-document-list read (contracts/document-api.md §2).
CREATE INDEX document_case_active_idx ON document (case_id, status);

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------

ALTER TABLE document_category ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_category FORCE  ROW LEVEL SECURITY;
ALTER TABLE document          ENABLE ROW LEVEL SECURITY;
ALTER TABLE document          FORCE  ROW LEVEL SECURITY;

-- One FOR ALL policy each, 006/017's own shape: lc_app legitimately INSERTs into
-- both directly, so membership's split SELECT/UPDATE policies are not needed here.
CREATE POLICY document_category_own_tenant ON document_category
  FOR ALL
  TO lc_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY document_own_tenant ON document
  FOR ALL
  TO lc_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- No DELETE grant on either table, to any role. FR-004/FR-012's "never
-- hard-deleted" is the absent grant, the same discipline every prior slice used.
GRANT SELECT, INSERT, UPDATE ON document_category TO lc_app;
GRANT SELECT, INSERT, UPDATE ON document          TO lc_app;
