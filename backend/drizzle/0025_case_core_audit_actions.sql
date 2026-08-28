-- Extends the audit_event_action_known CHECK constraint (0003, last touched by 0021)
-- with the twelve actions 006-client-case-core adds. FR-022, FR-023, FR-024.
--
-- Eleven are mutations. The twelfth, `case.read`, records ACCESS rather than change:
-- Principle V requires recording every access to cases, not only their modification, and
-- this slice is the first to own an entity that clause names. It is channel-gated in
-- `common/audit/actions.ts` so a monitoring job cannot inflate the log it watches — the
-- same gate 001 applies to `audit.queried` and `tenant.registry_read`. The gate lives in
-- TypeScript, not here; this constraint only fixes the vocabulary.
--
-- Reading the case LIST writes nothing (spec.md Resolved Decisions): it returns only rows
-- the caller is already scoped to and discloses no matter's contents.

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
    -- Slice 006 (FR-022 to FR-024, this document)
    'client.created',
    'client.updated',
    'client.deactivated',
    -- FR-004a. Its own action rather than a `client.updated` carrying a status field:
    -- the withdraw/restore round trip has to be legible in the trail, and a status
    -- change buried in an update's metadata is not.
    'client.reactivated',
    'case.created',
    -- FR-023. The one ACCESS record in this slice, channel-gated in actions.ts.
    'case.read',
    'case.status_changed',
    'case.team_member_assigned',
    -- Also written by the revocation cascade (FR-012a), deliberately reusing this action
    -- rather than adding a distinct one: the event is the same — a person came off a
    -- matter — and the entry's actor plus the neighbouring `membership.revoked` in the
    -- same transaction already name the cause (research.md D8).
    'case.team_member_unassigned',
    -- Three actions for three catalogs, with target_entity naming which one. Nine would
    -- be vocabulary growth with no read that benefits: the audit surface already filters
    -- by target_entity (research.md D8).
    'case.catalog_entry_created',
    -- FR-008a. Only ever carries case_status — is_closing is the sole editable field on
    -- any catalog entry, and only that catalog has it.
    'case.catalog_entry_updated',
    'case.catalog_entry_retired'
  )
);
