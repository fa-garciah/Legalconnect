-- Narrows lc_app's WITH CHECK on audit_event so it can never insert the four
-- actions reserved to accept_invitation()/lc_identity_writer (0015).
--
-- Before this migration, lc_app's own policy (0005) had no action restriction
-- at all — it could insert ANY action value for its own tenant, including
-- 'identity.created', 'membership.created', 'invitation.accepted' and
-- 'invitation.refused'. Nothing in application code ever does that (no
-- controller declares an `@Audited` action of those four; they are written
-- only by the SQL function itself), but the grant allowed it, which is exactly
-- the gap this slice's whole design exists to close elsewhere. This migration
-- closes it here too: the data layer now enforces "only accept_invitation
-- writes these four", not just the absence of a caller.

DROP POLICY audit_event_own_tenant ON audit_event;

CREATE POLICY audit_event_own_tenant ON audit_event
  FOR ALL
  TO lc_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND action NOT IN ('identity.created', 'membership.created', 'invitation.accepted', 'invitation.refused')
  );
