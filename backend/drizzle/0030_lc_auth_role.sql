-- The fifth role, and the twelve audit actions it alone may write.
-- data-model.md Roles + Audit vocabulary, research.md D12, tasks.md T000.
--
-- WHY lc_auth IS `LOGIN`, UNLIKE lc_audit_writer AND lc_identity_writer.
--
-- Those two are NOLOGIN because nothing connects as them: they exist so a
-- SECURITY DEFINER function runs under an identity whose policy permits exactly
-- one kind of row. That pattern works when the function can do the whole job in
-- SQL. Here it cannot, for three independent reasons (tasks.md T000):
--
--   1. Argon2id digests are salted. Deriving a comparable candidate requires the
--      stored PHC string's salt, so the digest MUST cross into the application.
--   2. The TOTP envelope key is held by the application and deliberately not by
--      the database (FR-013), so no in-database function can decrypt a secret to
--      verify a code against it.
--   3. @node-rs/argon2 does not exist inside PostgreSQL, and 003/D4 rejects
--      pgcrypto explicitly. RDS admits no PL/Rust extension that would change it.
--
-- So the material must reach the application, and the only real question is WHICH
-- CONNECTION receives it. It is this one, held by backend/src/modules/auth/ and by
-- nothing else.
--
-- This is STRONGER than the NOLOGIN reading it replaces, not weaker. Under that
-- reading lc_app would have needed EXECUTE on verification functions. Here lc_app
-- ends up with no grant on any of the five new tables and EXECUTE on exactly one
-- function — resolve_session() — so the connection every other module uses cannot
-- reach authentication material at all. That is what
-- tests/integration/auth-grants-lockdown.test.ts proves, as permission denied
-- rather than as an empty result.
--
-- Passwords are NOT set here. Constitution Principle VI: secrets never in the
-- repository. drizzle/migrate.ts applies them from the environment, and this role
-- is registered there alongside the other three LOGIN roles.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lc_auth') THEN
    CREATE ROLE lc_auth LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO lc_auth;

-- Owns nothing in the schema, now and after any future migration — the same bar
-- 0000_roles.sql sets for every other non-owner role.
REVOKE CREATE ON SCHEMA public FROM lc_auth;

-- ---------------------------------------------------------------------------
-- Audit vocabulary: the twelve actions of this slice.
-- ---------------------------------------------------------------------------
--
-- All twelve carry `tenant_id IS NULL`, and that is a fact about authentication
-- rather than a convenience. Authentication happens BEFORE tenant selection: at
-- the moment a sign-in fails, a factor is enrolled or an account locks, no tenant
-- has been chosen and none could be attributed without inventing one. 0011 already
-- made the column nullable for plan.limits_changed, so the shape exists.
--
-- The policy is the narrowing 001/D8 applies to lc_audit_writer and 002 applies to
-- lc_identity_writer, with one addition: `tenant_id IS NULL` is asserted in the
-- WITH CHECK too, so this role cannot attribute an authentication event to a
-- tenant even by mistake. A row with a NULL tenant_id never matches any active
-- tenant's setting, so these stay invisible to every tenant session and are
-- readable only through lc_platform's unrestricted policy — correct, since no
-- tenant owns a sign-in.
--
-- `mfa_not_enrolled` is deliberately ABSENT from this list and stays unaudited
-- (FR-039, tasks.md T093), agreeing with 002's open item 3: a precondition failure
-- by a legitimate member is not a change of state and not a security signal.

CREATE POLICY audit_event_auth_writer ON audit_event
  FOR INSERT
  TO lc_auth
  WITH CHECK (
    tenant_id IS NULL
    AND action IN (
      'enrollment.started',
      'enrollment.completed',
      'enrollment.failed',
      'factor.replaced',
      'backup_codes.issued',
      'backup_code.consumed',
      'backup_codes.exhausted',
      'backup_codes.reissued',
      'signin.succeeded',
      'signin.failed',
      'challenge.failed',
      'account.locked'
    )
  );

GRANT INSERT ON audit_event TO lc_auth;

-- ---------------------------------------------------------------------------
-- And the other half: lc_app may NOT write any of the twelve.
-- ---------------------------------------------------------------------------
--
-- 0018 established this pattern and stated the reasoning, which applies here
-- unchanged: before that migration lc_app could insert ANY action for its own
-- tenant, and nothing in application code did so — but the grant allowed it.
-- Closing the gap in the data layer rather than relying on the absence of a caller
-- is the whole point.
--
-- The stakes are higher for these twelve than for 002's four. A forged
-- 'signin.succeeded' or a suppressed 'account.locked' is an attack on the only
-- detection net the constitution has while the primary factor is phishable
-- (Recognised Technical Debt item 1). tests/integration/auth-audit-actions.test.ts
-- asserts both halves: lc_app refused, lc_auth admitted with a NULL tenant.
--
-- Recreated in full rather than altered, because PostgreSQL has no ALTER POLICY
-- that edits a WITH CHECK expression in place.

DROP POLICY audit_event_own_tenant ON audit_event;

CREATE POLICY audit_event_own_tenant ON audit_event
  FOR ALL
  TO lc_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND action NOT IN (
      -- 002's four, carried forward unchanged from 0018.
      'identity.created',
      'membership.created',
      'invitation.accepted',
      'invitation.refused',
      -- 003's twelve.
      'enrollment.started',
      'enrollment.completed',
      'enrollment.failed',
      'factor.replaced',
      'backup_codes.issued',
      'backup_code.consumed',
      'backup_codes.exhausted',
      'backup_codes.reissued',
      'signin.succeeded',
      'signin.failed',
      'challenge.failed',
      'account.locked'
    )
  );
