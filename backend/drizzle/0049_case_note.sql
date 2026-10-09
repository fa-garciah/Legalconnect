-- 0049 — case notes (008-notes-and-activity; decisions taken by Claude 2026-10-09, recorded in
-- specs/008-notes-and-activity/spec.md, pending ratification by Jero — and Decision 1 by Felipe).
--
-- NOTES ARE INTERNAL WORK PRODUCT (Decision 1). `visibility` exists and admits exactly one value,
-- 'internal', which is also its default. No route reads it from input. The day a firm wants to share
-- a note with a client, that is a reviewed migration that widens `case_note_internal_only` — beside a
-- recorded counsel decision — and a per-note act with the safe default, never a property of all
-- notes nor a default someone flips.
--
-- One tenant table, scoped the ordinary way (Principle II): RLS enabled and forced, one null-safe
-- `lc_app` policy, registered in TENANT_SCOPED_TABLES. `lc_app` holds SELECT, INSERT, UPDATE and NOT
-- DELETE: "Eliminar" is a void (Principle V, 008 Decision 3 after 009's ratified Decision 3).
--
-- WHO MAY READ OR WRITE A NOTE ON WHICH MATTER is not decided here: every route is nested under the
-- matter, and 006's `assigned` resolver — firm-checked for every archetype — decides reach.

CREATE TYPE case_note_visibility AS ENUM ('internal');
CREATE TYPE case_note_status AS ENUM ('active', 'voided');

CREATE TABLE case_note (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenant (id),
  case_id               uuid NOT NULL REFERENCES case_file (id),
  author_membership_id  uuid NOT NULL REFERENCES membership (id),
  body                  text NOT NULL,
  visibility            case_note_visibility NOT NULL DEFAULT 'internal',
  status                case_note_status NOT NULL DEFAULT 'active',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  voided_at             timestamptz,
  CONSTRAINT case_note_body_bounds CHECK (char_length(body) BETWEEN 1 AND 5000),
  -- Belt and braces with a one-value enum: if someone later adds a value to the TYPE (say, for a
  -- different table), this still holds notes internal until this constraint itself is changed.
  CONSTRAINT case_note_internal_only CHECK (visibility = 'internal'),
  CONSTRAINT case_note_voided_consistent CHECK ((status = 'voided') = (voided_at IS NOT NULL))
);

COMMENT ON TABLE case_note IS
  '008. Attorney work product. Internal only (Decision 1). Never deleted — "Eliminar" is a void. Reach is 006''s assigned resolver.';

CREATE INDEX case_note_by_case ON case_note (tenant_id, case_id, created_at);

ALTER TABLE case_note ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_note FORCE ROW LEVEL SECURITY;

CREATE POLICY case_note_own_tenant ON case_note
  FOR ALL
  TO lc_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON case_note TO lc_app;

-- ---------------------------------------------------------------------------
-- The audit vocabulary, re-issued IN FULL: 0048's list plus the four note actions.
-- ---------------------------------------------------------------------------

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
    -- Slice 005 (research.md D8, migration 0042). Sign-out and step-up
    -- verification. session.expired / tenant.session_revoked are deliberately
    -- ABSENT — FR-011 and FR-015 both require idle/absolute expiry and
    -- tenant-deactivation's effect on a session to get NO dedicated entry.
    'session.signed_out',
    'stepup.verified',
    'stepup.failed',
    -- Slice 014 (Decision 5, migration 0044)
    'membership.list_read',
    -- Slice 013 (FR-009, migration 0046)
    'calendar_event.created',
    'calendar_event.updated',
    'calendar_event.cancelled',
    -- Slice 015 (FR-004, migration 0047)
    'case.outcome_declared',
    -- Slice 009 (FR-014, migration 0048)
    'time_entry.timer_started',
    'time_entry.timer_stopped',
    'time_entry.timer_discarded',
    'time_entry.logged',
    'time_entry.corrected',
    'time_entry.voided',
    -- Slice 008 (FR-009, this document)
    'note.created',
    'note.corrected',
    'note.voided',
    'note.list_read'
  )
);
