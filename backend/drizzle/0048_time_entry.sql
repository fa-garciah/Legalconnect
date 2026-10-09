-- 0048 — recording time (009-time-tracking; decisions taken by Claude 2026-10-08, recorded in
-- specs/009-time-tracking/spec.md and pending ratification by Jero).
--
-- ONE ENTITY FOR BOTH CAPTURE METHODS (Decision 1). A timer is a time entry that has not stopped:
-- `status = 'running'`. Stopping it sets `minutes`, `logged_at` and `status = 'logged'`, and from
-- then on it differs from a manual entry only in its `source`. Everything downstream — the
-- timesheet, its totals, corrections, a future invoice — reads "time recorded" and never needs to
-- know how it was captured.
--
-- One tenant table, scoped the ordinary way (Principle II): RLS enabled and forced, one null-safe
-- `lc_app` policy on `tenant_id`, registered in TENANT_SCOPED_TABLES. `lc_app` holds SELECT, INSERT
-- and UPDATE and NOT DELETE: "Eliminar" on screen is a void, never a removal (FR-012, Principle V).
--
-- WHOSE ENTRY, AND ON WHICH MATTER, IS NOT DECIDED HERE. RLS scopes the row to the firm. That a
-- person writes only on matters they reach is 006's `assigned` resolver (every write is nested under
-- `/tenant/cases/:caseId`); that they read only their OWN entries on matters they STILL reach is the
-- repository's predicate (009/FR-009). `time-entries-isolation.test.ts` is the control for both.
--
-- MINUTES ARE INTEGERS, 1 TO 1440 (Decision 6). No increment or rounding rule is stored or applied:
-- that is a pricing policy (`US10-EP10`, IT3), applied when time is priced, never written back here.
-- The work day is a Mexico City `date`; for a timer, the day it STARTED.

CREATE TYPE time_entry_source AS ENUM ('timer', 'manual');
CREATE TYPE time_entry_status AS ENUM ('running', 'logged', 'voided');

CREATE TABLE time_entry (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenant (id),
  case_id        uuid NOT NULL REFERENCES case_file (id),
  membership_id  uuid NOT NULL REFERENCES membership (id),
  source         time_entry_source NOT NULL,
  status         time_entry_status NOT NULL,
  work_date      date NOT NULL,
  minutes        integer,
  description    text,
  started_at     timestamptz,
  stopped_at     timestamptz,
  logged_at      timestamptz,
  voided_at      timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT time_entry_minutes_bounds CHECK (minutes IS NULL OR minutes BETWEEN 1 AND 1440),
  CONSTRAINT time_entry_description_bounds CHECK (
    description IS NULL OR char_length(description) BETWEEN 1 AND 1000
  ),
  -- A manual entry never had a clock running; a timer always did.
  CONSTRAINT time_entry_source_shape CHECK (
    (source = 'manual' AND started_at IS NULL AND stopped_at IS NULL)
    OR (source = 'timer' AND started_at IS NOT NULL)
  ),
  -- What each status must carry. `voided` keeps whatever it had (a discarded timer has no minutes;
  -- a voided logged entry keeps them as history) and adds the instant it was voided.
  CONSTRAINT time_entry_status_shape CHECK (
    (status = 'running' AND source = 'timer' AND stopped_at IS NULL AND minutes IS NULL
       AND logged_at IS NULL AND voided_at IS NULL)
    OR (status = 'logged' AND minutes IS NOT NULL AND description IS NOT NULL
       AND logged_at IS NOT NULL AND voided_at IS NULL)
    OR (status = 'voided' AND voided_at IS NOT NULL)
  ),
  CONSTRAINT time_entry_stop_after_start CHECK (stopped_at IS NULL OR stopped_at >= started_at)
);

COMMENT ON TABLE time_entry IS
  '009. Recorded time. Never deleted — "Eliminar" is a void (FR-012). A person reads only their own entries on matters they still reach (FR-009, enforced in the query).';

-- FR-006: one running timer per person. The only race-free place to say it: two simultaneous
-- starts are serialised here, one wins and the other gets `409 timer_running`.
CREATE UNIQUE INDEX time_entry_one_running_timer ON time_entry (membership_id) WHERE status = 'running';
CREATE INDEX time_entry_timesheet ON time_entry (tenant_id, membership_id, work_date);
CREATE INDEX time_entry_case ON time_entry (case_id);

ALTER TABLE time_entry ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_entry FORCE ROW LEVEL SECURITY;

CREATE POLICY time_entry_own_tenant ON time_entry
  FOR ALL
  TO lc_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON time_entry TO lc_app;

-- ---------------------------------------------------------------------------
-- The audit vocabulary, re-issued IN FULL (FR-014).
--
-- `audit_event_action_known` enumerates every action across every slice, so it cannot be extended
-- in place. This is 0047's list plus the six time-entry actions.
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
    -- Slice 009 (FR-014, this document)
    'time_entry.timer_started',
    'time_entry.timer_stopped',
    'time_entry.timer_discarded',
    'time_entry.logged',
    'time_entry.corrected',
    'time_entry.voided'
  )
);
