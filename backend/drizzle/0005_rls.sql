-- Row-Level Security. This file is the load-bearing piece of Principle II.
--
-- Constitution v1.3.0, Technology Constraints, "PostgreSQL with RLS": every
-- predicate MUST use the null-safe form
--     NULLIF(current_setting('app.tenant_id', true), '')::uuid
-- and never the bare current_setting('app.tenant_id', true)::uuid. The constitution
-- owns that rule and its rationale; it is not restated here.
--
-- WITH CHECK is not optional and carries the same form. Without it a row could be
-- WRITTEN under a foreign tenant id even though it could not be read back.
--
-- FORCE ROW LEVEL SECURITY is defence in depth: it subjects the table OWNER to the
-- policies too. Consequence to know: the owner (the migration role) therefore has no
-- matching policy and can read or write nothing here. DDL is unaffected, so
-- migrations still work — but SEEDING runs as lc_platform, not as the owner. That is
-- semantically right anyway: provisioning is a platform operation.

-- ---------------------------------------------------------------------------
-- tenant — note the predicate is on id, not tenant_id. The row IS the tenant.
-- ---------------------------------------------------------------------------

ALTER TABLE tenant ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_own_row ON tenant
  FOR ALL
  TO lc_app
  USING      (id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- The platform administration context (research.md D9). Cross-tenant by necessity —
-- no tenant session can create a tenant that does not yet exist. This is a separate
-- ROLE rather than a bypass flag inside the tenant path, so there is no
-- "disable isolation" switch sitting on the route every business request takes.
CREATE POLICY tenant_platform_all ON tenant
  FOR ALL
  TO lc_platform
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- audit_event
-- ---------------------------------------------------------------------------

ALTER TABLE audit_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_event FORCE ROW LEVEL SECURITY;

CREATE POLICY audit_event_own_tenant ON audit_event
  FOR ALL
  TO lc_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY audit_event_platform_all ON audit_event
  FOR ALL
  TO lc_platform
  USING (true)
  WITH CHECK (true);

-- The single sanctioned exception (research.md D8). Recording a cross-tenant attempt
-- must append to the TARGETED tenant's log while a DIFFERENT tenant is active, which
-- audit_event_own_tenant above would refuse.
--
-- The exception is scoped two ways rather than one: to this role, AND to one action.
-- lc_audit_writer owns the SECURITY DEFINER function in 0007 and can therefore write
-- cross-tenant — but only rows whose action is the attempt itself. It cannot forge a
-- provisioning event, cannot read the log, and cannot touch any other table. That is
-- the property the "can do nothing else" test asserts.
CREATE POLICY audit_event_cross_attempt_writer ON audit_event
  FOR INSERT
  TO lc_audit_writer
  WITH CHECK (action = 'tenant.cross_access_attempted');

-- Retention reads partition metadata, never rows.
CREATE POLICY audit_event_retention_none ON audit_event
  FOR SELECT
  TO lc_retention
  USING (false);
