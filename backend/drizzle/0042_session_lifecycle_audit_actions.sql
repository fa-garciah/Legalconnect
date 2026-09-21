-- Extends the audit_event_action_known CHECK constraint (0003, last touched by
-- 0036) with the three actions 005-session-lifecycle adds. research.md D8, plan.md
-- Constitution Check re-check item 2.
--
-- The same two-migration split every prior slice used: 0030/0036 decided WHO MAY
-- WRITE 003's twelve actions (policies and grants) separately from WHICH ACTIONS
-- EXIST AT ALL (the vocabulary, there in 0036). This migration is the vocabulary
-- half for 005's three actions; the who-may-write half is below in the same file
-- for these three (following 0030's own combined shape, since there is no third
-- migration boundary this slice's tasks.md draws between them — T005 names this one
-- migration for both the CHECK and the WITH CHECK policy widening).
--
-- All three are written with tenant_id NULL, matching 003's twelve: sign-out and
-- step-up both run on lc_auth's connection before any tenant is necessarily active,
-- and FR-006/FR-021 name the identity as what's audited, not a tenant.
--
-- None is channel-gated (common/audit/actions.ts, not here) — an authentication
-- event is exactly what a firm needs a record of.

ALTER TABLE audit_event DROP CONSTRAINT audit_event_action_known;

ALTER TABLE audit_event ADD CONSTRAINT audit_event_action_known CHECK (
  action IN (
    -- Slice 001 (FR-014, 001)
    'tenant.provisioned',
    'tenant.deactivated',
    'tenant.plan_changed',
    'plan.limits_changed',
    'tenant.cross_access_attempted',
    'audit.queried',
    'tenant.registry_read',
    -- Slice 002 (FR-031, 002)
    'identity.created',
    'membership.created',
    'membership.revoked',
    'membership.archetype_changed',
    'invitation.issued',
    'invitation.seed_issued',
    'invitation.revoked',
    'invitation.accepted',
    'invitation.refused',
    -- Slice 017 (FR-003, 017)
    'position.created',
    'position.retired',
    'directory.position_assigned',
    -- Slice 006 (FR-022 to FR-024, 006)
    'client.created',
    'client.updated',
    'client.deactivated',
    'client.reactivated',
    'case.created',
    'case.read',
    'case.status_changed',
    'case.team_member_assigned',
    'case.team_member_unassigned',
    'case.catalog_entry_created',
    'case.catalog_entry_updated',
    'case.catalog_entry_retired',
    -- Slice 007 (FR-019, FR-020, 007)
    'document.uploaded',
    'document.previewed',
    'document.downloaded',
    'document.category_changed',
    'document.withdrawn',
    'document.restored',
    'document_category.created',
    'document_category.retired',
    -- Slice 003 (FR-042, 003)
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
    'account.locked',
    -- Slice 005 (research.md D8, this document). Sign-out and step-up
    -- verification. session.expired / tenant.session_revoked are deliberately
    -- ABSENT — FR-011 and FR-015 both require idle/absolute expiry and
    -- tenant-deactivation's effect on a session to get NO dedicated entry.
    'session.signed_out',
    'stepup.verified',
    'stepup.failed'
  )
);

-- ---------------------------------------------------------------------------
-- Who may write the three new actions. Same shape 0030 established for 003's
-- twelve: lc_auth may, with tenant_id NULL; lc_app may not.
-- ---------------------------------------------------------------------------

DROP POLICY audit_event_auth_writer ON audit_event;

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
      'account.locked',
      'session.signed_out',
      'stepup.verified',
      'stepup.failed'
    )
  );

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
      'account.locked',
      -- 005's three.
      'session.signed_out',
      'stepup.verified',
      'stepup.failed'
    )
  );
