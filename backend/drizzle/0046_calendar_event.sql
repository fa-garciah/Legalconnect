-- 0046 — the firm's calendar (013-calendar-core; decisions taken under the CC technical lead's
-- delegation of 2026-09-23, recorded in specs/013-calendar-core/spec.md).
--
-- One tenant table, `calendar_event`, scoped the ordinary way (Principle II): RLS enabled and
-- forced, one null-safe `lc_app` policy on `tenant_id`, registered in TENANT_SCOPED_TABLES.
-- `lc_app` holds SELECT, INSERT, UPDATE and NOT DELETE: cancelling an event is a status change,
-- never a removal (FR-008, Principle V).
--
-- WHO SEES A CASE-LINKED EVENT is not decided here. RLS scopes the row to the firm; that a member
-- not on the case never receives it is `calendar.repository.ts`'s assignment predicate, the same
-- one 006's case list uses (FR-006), and `calendar-isolation.test.ts` is its control.
--
-- An event has exactly one shape (FR-003): all-day, with dates (`starts_on`, `ends_on`), or
-- timed, with instants (`starts_at`, `ends_at`). All-day dates are dates on purpose: a deadline on
-- 30 September is 30 September in any browser's time zone (SC-005).

CREATE TYPE calendar_event_type AS ENUM ('hearing', 'deadline', 'meeting', 'other');
CREATE TYPE calendar_event_status AS ENUM ('scheduled', 'cancelled');

CREATE TABLE calendar_event (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 uuid NOT NULL REFERENCES tenant (id),
  case_id                   uuid REFERENCES case_file (id),
  type                      calendar_event_type NOT NULL,
  title                     text NOT NULL,
  description               text,
  location                  text,
  all_day                   boolean NOT NULL,
  starts_at                 timestamptz,
  ends_at                   timestamptz,
  starts_on                 date,
  ends_on                   date,
  remind_minutes_before     integer,
  status                    calendar_event_status NOT NULL DEFAULT 'scheduled',
  cancelled_at              timestamptz,
  created_by_membership_id  uuid NOT NULL REFERENCES membership (id),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT calendar_event_one_shape CHECK (
    (all_day AND starts_on IS NOT NULL AND starts_at IS NULL AND ends_at IS NULL)
    OR (NOT all_day AND starts_at IS NOT NULL AND starts_on IS NULL AND ends_on IS NULL)
  ),
  CONSTRAINT calendar_event_ends_after_start CHECK (
    (ends_at IS NULL OR ends_at >= starts_at) AND (ends_on IS NULL OR ends_on >= starts_on)
  ),
  CONSTRAINT calendar_event_cancelled_consistent CHECK (
    (status = 'cancelled' AND cancelled_at IS NOT NULL) OR (status = 'scheduled' AND cancelled_at IS NULL)
  ),
  CONSTRAINT calendar_event_reminder_offered CHECK (
    remind_minutes_before IS NULL OR remind_minutes_before IN (15, 60, 1440, 2880, 10080)
  ),
  CONSTRAINT calendar_event_text_bounds CHECK (
    char_length(title) BETWEEN 1 AND 200
    AND (location IS NULL OR char_length(location) <= 200)
    AND (description IS NULL OR char_length(description) <= 2000)
  )
);

COMMENT ON TABLE calendar_event IS
  '013. Never deleted — cancellation is a status (FR-008). A case-linked event is visible to a non-MP/SA member only while they hold a live assignment on the case (FR-006, enforced in the query).';

CREATE INDEX calendar_event_tenant_starts_at ON calendar_event (tenant_id, starts_at);
CREATE INDEX calendar_event_tenant_starts_on ON calendar_event (tenant_id, starts_on);
CREATE INDEX calendar_event_case ON calendar_event (case_id);

ALTER TABLE calendar_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_event FORCE ROW LEVEL SECURITY;

CREATE POLICY calendar_event_own_tenant ON calendar_event
  FOR ALL
  TO lc_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON calendar_event TO lc_app;

-- ---------------------------------------------------------------------------
-- The three audit actions (FR-009). Written by lc_app inside the firm, so
-- audit_event_own_tenant already admits them; only the vocabulary changes.
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
    'calendar_event.cancelled'
  )
);
