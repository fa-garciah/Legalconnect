-- A write that names no tenant is attributed to the ACTIVE tenant, not rejected and
-- never left to the caller to remember. US1 scenario 3.
--
-- Same null-safe form as the policies (Constitution v1.3.0): with no context active
-- the default evaluates to NULL, the NOT NULL constraint rejects the row, and the
-- write fails closed instead of landing somewhere arbitrary.
--
-- Paired with the WITH CHECK on audit_event_own_tenant, this gives two independent
-- guarantees: omitting the tenant lands correctly, and naming a foreign one is
-- refused.

ALTER TABLE audit_event
  ALTER COLUMN tenant_id
  SET DEFAULT NULLIF(current_setting('app.tenant_id', true), '')::uuid;
