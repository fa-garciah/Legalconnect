-- Plan: the iguala tier catalog. Global, NOT tenant data — no tenant_id, no RLS.
-- data-model.md.

CREATE TYPE plan_code AS ENUM ('esencial', 'profesional', 'premium');

CREATE TABLE plan (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code         plan_code NOT NULL UNIQUE,
  name         text NOT NULL,
  -- Quantitative limits and the feature-to-tier mapping are CONFIGURATION.
  -- FR-004 and FR-016: changeable without a code deployment, which is why they are
  -- jsonb columns rather than enumerated columns or code constants.
  limits       jsonb NOT NULL DEFAULT '{}'::jsonb,
  entitlements jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT plan_name_not_blank CHECK (length(btrim(name)) >= 1)
);

COMMENT ON TABLE plan IS
  'Iguala tier catalog. Nothing in slice 001 reads entitlements — enforcement is slice 004. The column exists now so the mechanism has a home.';
