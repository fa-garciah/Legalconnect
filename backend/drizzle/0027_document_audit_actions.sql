-- Extends the audit_event_action_known CHECK constraint (0003, last touched by 0025)
-- with the eight actions 007-document-management adds. FR-019, FR-020.
--
-- Six are mutations. The other two, document.previewed and document.downloaded,
-- record ACCESS rather than change — each is its own distinct interactive access
-- (FR-020), never conflated into one action. Both are channel-gated in
-- common/audit/actions.ts, joining 006's case.read and 001's audit.queried/
-- tenant.registry_read. The gate lives in TypeScript, not here; this constraint only
-- fixes the vocabulary.
--
-- Reading a case's document LIST writes nothing (FR-021), mirroring 006's own
-- resolved reasoning for case.read_list exactly.

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
    -- Slice 007 (FR-019, FR-020, this document)
    'document.uploaded',
    'document.previewed',
    'document.downloaded',
    'document.category_changed',
    'document.withdrawn',
    'document.restored',
    'document_category.created',
    'document_category.retired'
  )
);
