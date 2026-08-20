-- Fixes drizzle/0004_audit_partitions.sql: both partition-management functions were
-- created without SECURITY DEFINER, so a call from lc_platform or lc_retention runs
-- the internal DDL (CREATE TABLE / ALTER TABLE ... DETACH / DROP TABLE) AS THAT ROLE.
-- CREATE TABLE then fails with "permission denied for schema public" — CREATE on
-- schema public is revoked from every login role but the owner (0000_roles.sql) —
-- and the drop routine would fail the same way with "must be owner of relation":
-- DDL privilege does not follow GRANT EXECUTE the way DML privilege does.
--
-- SECURITY DEFINER, under the function's existing owner (the migration/owner role,
-- which already holds the needed privileges), is the same fix D8 already applied to
-- the cross-tenant audit append function in 0009.

ALTER FUNCTION audit_event_ensure_partition(date) SECURITY DEFINER
  SET search_path = public, pg_temp;

ALTER FUNCTION audit_event_drop_expired_partitions(int) SECURITY DEFINER
  SET search_path = public, pg_temp;
