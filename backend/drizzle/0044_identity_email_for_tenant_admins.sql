-- 0044 — a firm's administrators may read their own members' email (014-admin-ui, Decision 5,
-- approved by Francisco Garcia, CC technical lead, 2026-09-23).
--
-- WHY THIS EXISTS. The administration screen lists a firm's people, and until now nothing could
-- tell one from another: `GET /tenant/directory` carries membership UUIDs, archetypes and
-- positions, and `identity` — the only table holding a person's email — had exactly one `lc_app`
-- policy, `identity_self_row`, which admits the caller's own row and nothing else. The new route
-- `GET /tenant/members` (capability `membership.read_tenant`, SA and MP) needs the email of each
-- live member of the ACTIVE firm.
--
-- WHY IT IS SAFE, STATED AGAINST PRINCIPLE II. The policy admits an identity row only when a
-- tenant is active AND that identity holds a LIVE membership in THAT tenant. A person who works
-- at the firm is already visible to its members through `membership` and `directory_entry`; this
-- adds their email and nothing about any other firm:
--
--   * an identity whose only membership is in another firm is never admitted, even for a caller
--     who belongs to both — the EXISTS names `app.tenant_id`, not the caller;
--   * a revoked membership stops exposing the email on the next query (evaluated per query);
--   * with NO tenant active — the identity surface — this policy contributes nothing, and
--     `identity_self_row` remains the sole path, unchanged.
--
-- THE `app.tenant_id` GUARD IS THE WHOLE SAFETY OF THIS POLICY. It is written FIRST, as a
-- conjunct, because 0043's first draft shipped without its guard and widened cross-tenant access
-- the moment it was applied: Postgres ORs policies together, so an unguarded predicate is a new
-- door, not a narrowing. `members-email-isolation.test.ts` is the control for this file.
--
-- WHAT RLS DOES NOT DECIDE HERE. Row-level security scopes WHICH ROWS `lc_app` can see inside a
-- firm; it does not know archetypes. That only SA and MP may list members is decided by
-- `AuthorizationInterceptor` against `matrix.ts` (row 5), and `GET /tenant/members` is the only
-- query that reads another member's identity row. `lc_app` still holds SELECT only on this table.

CREATE POLICY identity_member_of_active_tenant ON identity
  FOR SELECT
  TO lc_app
  USING (
    NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM membership m
      WHERE m.identity_id = identity.id
        AND m.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        AND m.status = 'live'
    )
  );

-- ---------------------------------------------------------------------------
-- The audit action for that read: `membership.list_read`. Listing members with their email is a
-- read of personal data (Principle VI), so it is recorded; like `case.read` it is channel-gated
-- in common/audit/actions.ts, so automated traffic does not inflate the log. Written by `lc_app`
-- inside the firm, so `audit_event_own_tenant` already admits it and is not touched.
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
    -- Slice 014 (Decision 5, this document)
    'membership.list_read'
  )
);
