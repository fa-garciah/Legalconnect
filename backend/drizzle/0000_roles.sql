-- Roles. This separation IS the isolation mechanism (research.md D4).
--
-- PostgreSQL silently ignores RLS for superusers and for the table OWNER. If the
-- application connects as either, every policy below stays written and the isolation
-- does not exist — with the test suite still green. That is why there is more than
-- one role here.
--
-- Passwords are NOT set in this file. Constitution Principle VI: secrets never in the
-- repository. drizzle/migrate.ts applies them from the environment.

-- Application role. Owns nothing, not superuser, no BYPASSRLS.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lc_app') THEN
    CREATE ROLE lc_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT;
  END IF;
END $$;

-- Platform administration role. Legitimately cross-tenant, but reaching only
-- tenant, plan and audit_event — never a business table (research.md D9).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lc_platform') THEN
    CREATE ROLE lc_platform LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT;
  END IF;
END $$;

-- Retention role. May drop audit partitions past the 24-month window. The
-- application deliberately does not hold this (FR-019).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lc_retention') THEN
    CREATE ROLE lc_retention LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT;
  END IF;
END $$;

-- Owner of the SECURITY DEFINER append function only. NOLOGIN: nothing connects as
-- this role, it exists so the definer path runs under an identity whose audit_event
-- policy permits exactly one kind of row and nothing else (research.md D8).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lc_audit_writer') THEN
    CREATE ROLE lc_audit_writer NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO lc_app, lc_platform, lc_retention, lc_audit_writer;

-- No CREATE on the schema for anyone but the owner: the application role must own
-- nothing, now and after any future migration.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM lc_app, lc_platform, lc_retention, lc_audit_writer;
