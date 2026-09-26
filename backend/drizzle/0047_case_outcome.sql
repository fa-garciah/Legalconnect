-- 0047 — how a matter ended (015-kpi-dashboard; decisions taken by Claude 2026-09-25, recorded in
-- specs/015-kpi-dashboard/spec.md and pending ratification).
--
-- THE COLUMN THIS PRODUCT WAS MISSING. `case_file` records when a matter opened and when it
-- closed, and nothing at all about HOW — so "tasa de éxito", the most prominent tile of the KPI
-- mockup, could only ever have been invented. This is the one change that makes it real.
--
-- FIXED VALUES, NOT A PER-TENANT CATALOG, and that is deliberate against 006's own grain. Status,
-- matter type and venue are each a firm's own vocabulary, and the product holds no opinion about
-- them. An outcome is different in kind: it is the set of categories a success RATE is defined
-- over. A firm that renamed or deleted "Desfavorable" would not have customised the metric, it
-- would have made it meaningless — and two firms' rates would stop being comparable. Principle III
-- is untouched: nothing here is specific to any one firm (015/Decision 1).
--
-- NULLABLE, AND THAT IS THE HONEST STATE. Every matter closed before this migration has no
-- outcome, and there is no backfill here: inventing outcomes for a firm's history is precisely
-- what this slice exists not to do. "Not declared" is distinct from `sin_resolucion`, which is a
-- DECLARATION that the matter ended without a ruling. The KPI reads that difference (015/FR-009
-- refuses to report a rate computed from too few declarations).

CREATE TYPE case_outcome AS ENUM ('favorable', 'desfavorable', 'convenio', 'sin_resolucion');

ALTER TABLE case_file ADD COLUMN outcome case_outcome;

-- An outcome is a statement about how a matter ENDED, so it may exist only on one that has.
-- Without this the column drifts into a second, informal status — and a "favorable" matter that
-- is still open would corrupt every rate computed from it.
ALTER TABLE case_file ADD CONSTRAINT case_file_outcome_requires_closed
  CHECK (outcome IS NULL OR closed_on IS NOT NULL);

COMMENT ON COLUMN case_file.outcome IS
  '015. How the matter ended, declared by the firm — never inferred from the closing status name. NULL means undeclared, which is NOT the same as sin_resolucion.';

-- `lc_app` already holds UPDATE on case_file (0023), so no grant changes: a new column on an
-- already-granted table is reachable by the same privilege.

-- ---------------------------------------------------------------------------
-- The audit vocabulary, re-issued IN FULL.
--
-- `audit_event_action_known` enumerates every action across every slice, so it cannot be
-- extended in place — each slice that adds one drops and recreates the whole constraint. This is
-- 0046's list plus `case.outcome_declared`.
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
    -- Slice 013 (FR-009, this document)
    'calendar_event.created',
    'calendar_event.updated',
    'calendar_event.cancelled',
    -- Slice 015 (FR-004, this document)
    'case.outcome_declared'
  )
);
