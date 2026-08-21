-- Extends the audit_event_action_known CHECK constraint (0003) with the nine
-- actions this slice adds. data-model.md, FR-031.
--
-- No channel gate on any of these nine — none of them is a read of a
-- monitorable log the way audit.queried/tenant.registry_read are, so none
-- carry the self-amplification risk FR-025/FR-026 exist to prevent.

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
    -- Slice 002 (FR-031, this document)
    'identity.created',
    'membership.created',
    'membership.revoked',
    'membership.archetype_changed',
    'invitation.issued',
    'invitation.seed_issued',
    'invitation.revoked',
    'invitation.accepted',
    'invitation.refused'
  )
);
