-- Extends the audit_event_action_known CHECK constraint (0003, last touched by
-- 0027) with the twelve actions 003-authentication-mfa adds. FR-042.
--
-- This is the second half of what 0030 started and is separated for the reason
-- every slice before it separated the two: 0030 decides WHO MAY WRITE which
-- actions (policies and grants), this decides WHICH ACTIONS EXIST AT ALL (the
-- vocabulary). Conflating them would put a role decision and a domain decision in
-- one migration, and 0021, 0025 and 0027 each kept them apart.
--
-- All twelve are written with tenant_id NULL, which the policy in 0030 enforces —
-- authentication precedes tenant selection, so there is no tenant to attribute a
-- sign-in to (research.md D12).
--
-- None is channel-gated. The gate lives in common/audit/actions.ts, not here; this
-- constraint only fixes the vocabulary. And none of these twelve should ever be
-- gated: an authentication event is exactly what a firm needs a record of, and
-- suppressing one for an "automated" caller would be a way to sign in unobserved.
--
-- `mfa_not_enrolled` is deliberately ABSENT and stays unaudited (FR-039).

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
    -- Slice 003 (FR-042, this document). Enrollment, the challenge, the codes and
    -- the lockout. Writable ONLY by lc_auth, and explicitly NOT by lc_app (0030) —
    -- while the primary factor stays phishable this log is the only detection net
    -- the product has, so a forged signin.succeeded or a suppressed account.locked
    -- attacks the net itself.
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
