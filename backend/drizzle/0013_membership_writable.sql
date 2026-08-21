-- Membership: the access one identity holds within one tenant. Named at slice
-- 001's boundary (backend/src/common/tenant/membership.ts); built here.
-- data-model.md, research.md D3, D9.

-- Constitution v1.4.0 Principle IV fixes ten membership-capable archetype codes
-- (every code except PO, which is not a membership at all). research.md D9:
-- this is the first slice to need the full domain, since an invitation's target
-- archetype must be able to name any of them.
CREATE TYPE archetype AS ENUM
  ('SA', 'MP', 'AA', 'PL', 'CM', 'BM', 'CC', 'IC', 'CB', 'EL');

CREATE TYPE membership_status AS ENUM ('live', 'revoked');

CREATE TABLE membership (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id uuid NOT NULL REFERENCES identity (id),
  tenant_id   uuid NOT NULL REFERENCES tenant (id),
  -- FR-024 (001): the archetype belongs to the membership, not the identity.
  archetype   archetype NOT NULL,
  status      membership_status NOT NULL DEFAULT 'live',
  created_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at  timestamptz,

  -- FR-007: at most one membership per identity per tenant.
  CONSTRAINT membership_identity_tenant_unique UNIQUE (identity_id, tenant_id),

  -- FR-009's one-way transition, the same shape as tenant.deactivated_at.
  CONSTRAINT membership_revoked_at_consistent CHECK (
    (status = 'revoked' AND revoked_at IS NOT NULL)
    OR (status = 'live' AND revoked_at IS NULL)
  )
);

COMMENT ON TABLE membership IS
  'Never hard-deleted (FR-009). The application role holds no INSERT grant at all — the only way a row comes into existence is accept_invitation() in 0015, running as a different role. See research.md D1.';

ALTER TABLE membership ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership FORCE ROW LEVEL SECURITY;

-- Two permissive SELECT policies, combined OR (research.md D3): the ordinary
-- tenant-scoped shape every 001 table uses, and a second one keyed on the
-- caller's own identity, for self-enumeration (FR-017) with no tenant active.
CREATE POLICY membership_own_tenant_select ON membership
  FOR SELECT
  TO lc_app
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY membership_own_identity_select ON membership
  FOR SELECT
  TO lc_app
  USING (identity_id = NULLIF(current_setting('app.identity_id', true), '')::uuid);

-- Mutation is tenant-scoped only, never self-service: an SA/MP acting inside
-- their own tenant revokes or changes archetype; the identity being changed
-- never mutates its own row through the self-enumeration path.
CREATE POLICY membership_own_tenant_update ON membership
  FOR UPDATE
  TO lc_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- No INSERT policy and no INSERT grant for lc_app — FR-009/SC-009 enforced by
-- the absent grant, not by a code-review rule.
GRANT SELECT, UPDATE ON membership TO lc_app;

-- The platform role's existence-check policy and grant (research.md D6) are
-- created together with its invitation counterpart in 0016.
