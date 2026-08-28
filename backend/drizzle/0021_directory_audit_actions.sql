-- Extends the audit_event_action_known CHECK constraint (0003, last touched by
-- 0017) with the three actions 017-firm-directory adds. data-model.md, FR-003.
--
-- Neither is channel-gated — neither is a read of a monitorable log the way
-- audit.queried/tenant.registry_read are, so no self-amplification risk applies.

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
    -- Slice 017 (FR-003, this document)
    'position.created',
    'position.retired',
    'directory.position_assigned'
  )
);
