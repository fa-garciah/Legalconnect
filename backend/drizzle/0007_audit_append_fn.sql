-- The one place in the system permitted to write outside the active tenant
-- (research.md D8).
--
-- Two constraints collide in this function and both matter.
--
-- Mechanically: at the moment of a cross-tenant attempt, app.tenant_id is the
-- ACTOR's tenant, not the target's. Appending to the target's log is refused by
-- audit_event_own_tenant. Hence a definer function rather than a looser policy.
--
-- And less obviously: writing "a member of firm A tried to read your matter" into
-- firm B's log would tell firm B that firm A exists, that the actor belongs to it,
-- and that the two are adjacent — which in this domain can itself be privileged.
-- FR-023. So this function takes NO home-tenant parameter. It cannot record one,
-- because it is never given one.

CREATE OR REPLACE FUNCTION audit_append_cross_tenant_attempt(
  p_target_tenant_id  uuid,
  p_target_entity     text,
  p_target_id         uuid,
  p_actor_identity_id uuid,
  p_source            jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
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
    NULL,
    p_target_entity,
    p_target_id,
    coalesce(p_source, '{}'::jsonb) || jsonb_build_object('channel',
      coalesce(p_source ->> 'channel', 'interactive')),
    '{}'::jsonb
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

-- Runs as lc_audit_writer, whose audit_event policy permits INSERT of exactly one
-- action and nothing else. Not as the table owner: the owner is subject to FORCE RLS
-- with no matching policy, and granting the owner a blanket policy would have
-- defeated the point of FORCE.
ALTER FUNCTION audit_append_cross_tenant_attempt(uuid, text, uuid, uuid, jsonb)
  OWNER TO lc_audit_writer;

REVOKE ALL ON FUNCTION audit_append_cross_tenant_attempt(uuid, text, uuid, uuid, jsonb)
  FROM PUBLIC;

GRANT EXECUTE ON FUNCTION audit_append_cross_tenant_attempt(uuid, text, uuid, uuid, jsonb)
  TO lc_app;
