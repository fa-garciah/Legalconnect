-- Grants. FR-011's prohibition lives here, as an ABSENT grant rather than an absent
-- repository method: a method someone forgot to write is bypassable by the next
-- developer, a missing privilege is not.

-- ---------------------------------------------------------------------------
-- Application role
-- ---------------------------------------------------------------------------

GRANT SELECT ON tenant TO lc_app;
GRANT SELECT ON plan TO lc_app;

-- Append-only. Deliberately NO UPDATE and NO DELETE on audit_event, for any role
-- the application can reach. This is what makes AS-04 assert a permission error
-- rather than the absence of a method.
GRANT SELECT, INSERT ON audit_event TO lc_app;

-- ---------------------------------------------------------------------------
-- Platform administration role (research.md D9)
-- ---------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE ON tenant TO lc_platform;
GRANT SELECT, INSERT, UPDATE ON plan TO lc_platform;
GRANT SELECT, INSERT ON audit_event TO lc_platform;

-- Deliberately absent everywhere, for every role: DELETE on tenant. FR-006 and
-- SC-011 — tenants are never hard-deleted, and the guarantee is the missing grant.

-- ---------------------------------------------------------------------------
-- Audit definer-path role
-- ---------------------------------------------------------------------------

-- INSERT only, and its RLS policy in 0005 further narrows it to one action. No
-- SELECT: the definer path writes attempts, it does not read the log.
GRANT INSERT ON audit_event TO lc_audit_writer;

-- ---------------------------------------------------------------------------
-- Retention role
-- ---------------------------------------------------------------------------

-- Needs the table reference to detach partitions; its RLS policy returns no rows.
GRANT SELECT ON audit_event TO lc_retention;

-- ---------------------------------------------------------------------------
-- Future tables inherit nothing by accident
-- ---------------------------------------------------------------------------

-- No default privileges are granted to lc_app. A new table is unreachable until a
-- migration grants it explicitly — which pairs with the CI check that a new table
-- carrying tenant_id must also carry an RLS policy.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC;
