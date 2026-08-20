-- Tenant: the contracted firm, and the root of the isolation boundary.
-- data-model.md.

CREATE TYPE tenant_status AS ENUM ('active', 'deactivated');

CREATE TABLE tenant (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  rfc            text NOT NULL,
  plan_id        uuid NOT NULL REFERENCES plan (id),
  status         tenant_status NOT NULL DEFAULT 'active',
  created_at     timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz,

  CONSTRAINT tenant_name_not_blank CHECK (length(btrim(name)) >= 1),

  -- 12 characters for a moral person, 13 for a physical one.
  CONSTRAINT tenant_rfc_shape CHECK (rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$'),

  -- FR-007 and US3 scenario 2. A database constraint, not an application
  -- read-then-write check, so two concurrent provisionings carrying the same RFC
  -- cannot both succeed.
  CONSTRAINT tenant_rfc_unique UNIQUE (rfc),

  -- The one-way transition of FR-006 is kept honest here: a deactivated tenant must
  -- carry its timestamp, an active one must not.
  CONSTRAINT tenant_deactivated_at_consistent CHECK (
    (status = 'deactivated' AND deactivated_at IS NOT NULL)
    OR (status = 'active' AND deactivated_at IS NULL)
  )
);

COMMENT ON TABLE tenant IS
  'Isolation root. Note its RLS policy filters on id, not tenant_id — the row IS the tenant. The tenant-scoped table registry must therefore list it explicitly, since a tenant_id column scan will not find it.';
