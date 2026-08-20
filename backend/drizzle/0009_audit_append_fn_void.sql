-- Supersedes the function defined in 0007.
--
-- 0007 ended its INSERT with `RETURNING id INTO v_id`. `INSERT ... RETURNING` requires
-- SELECT privilege on the table, and lc_audit_writer is deliberately granted INSERT
-- only — it writes attempts, it does not read the log. So the least-privilege decision
-- and the convenience of returning the new id were in direct conflict, and every call
-- failed with "permission denied for table audit_event".
--
-- Resolved by dropping RETURNING rather than by granting SELECT. Nothing ever consumed
-- the returned id, and keeping the role write-only preserves the property that makes
-- this exception narrow: it can append one kind of row and do nothing else, which is
-- exactly what the "can do nothing else" test asserts.

DROP FUNCTION IF EXISTS audit_append_cross_tenant_attempt(uuid, text, uuid, uuid, jsonb);

CREATE FUNCTION audit_append_cross_tenant_attempt(
  p_target_tenant_id  uuid,
  p_target_entity     text,
  p_target_id         uuid,
  p_actor_identity_id uuid,
  p_source            jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- No RETURNING. See the note above.
  INSERT INTO audit_event (
    tenant_id,
    action,
    actor_identity_id,
    actor_membership_id,
    target_entity,
    target_id,
    source,
    metadata
  ) VALUES (
    p_target_tenant_id,
    'tenant.cross_access_attempted',
    p_actor_identity_id,
    -- Never a membership: that would tie the actor to a tenant, and the targeted firm
    -- must not learn which other firm the actor belongs to (FR-023).
    NULL,
    p_target_entity,
    p_target_id,
    coalesce(p_source, '{}'::jsonb)
      || jsonb_build_object('channel', coalesce(p_source ->> 'channel', 'interactive')),
    '{}'::jsonb
  );
END $$;

ALTER FUNCTION audit_append_cross_tenant_attempt(uuid, text, uuid, uuid, jsonb)
  OWNER TO lc_audit_writer;

REVOKE ALL ON FUNCTION audit_append_cross_tenant_attempt(uuid, text, uuid, uuid, jsonb)
  FROM PUBLIC;

GRANT EXECUTE ON FUNCTION audit_append_cross_tenant_attempt(uuid, text, uuid, uuid, jsonb)
  TO lc_app;
