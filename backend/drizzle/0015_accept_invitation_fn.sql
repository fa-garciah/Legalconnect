-- accept_invitation(): the one SECURITY DEFINER function that creates identity
-- and membership rows. research.md D1.
--
-- FR-023 requires this atomic across three tables, for a caller who by
-- definition holds no live membership yet and so cannot open a normal tenant
-- transaction. lc_app cannot be granted INSERT on identity or membership at all
-- (0012, 0013) — that is the exact grant FR-009/SC-009 require not to exist. So
-- this runs as a separate, NOLOGIN role, the same shape as lc_audit_writer
-- (research.md 001/D8): narrowly scoped, and nothing outside this one function
-- can ever run as it.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lc_identity_writer') THEN
    CREATE ROLE lc_identity_writer NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO lc_identity_writer;
REVOKE CREATE ON SCHEMA public FROM lc_identity_writer;

-- identity: unrestricted for this role only — it is the sole path by which a
-- row is ever created, and the only caller of this role is the function below.
CREATE POLICY identity_writer_all ON identity
  FOR ALL
  TO lc_identity_writer
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT ON identity TO lc_identity_writer;

-- membership: SELECT (FR-029's already-a-member guard, across every tenant)
-- and INSERT. The function never updates an existing membership row.
CREATE POLICY membership_writer_select ON membership
  FOR SELECT
  TO lc_identity_writer
  USING (true);

CREATE POLICY membership_writer_insert ON membership
  FOR INSERT
  TO lc_identity_writer
  WITH CHECK (true);

GRANT SELECT, INSERT ON membership TO lc_identity_writer;

-- invitation: SELECT (to find the row by reference_hash, across every tenant —
-- the accepting caller has none active) and UPDATE (status, accepted_at,
-- failed_attempts). No INSERT: this role never issues an invitation, only
-- consumes one.
CREATE POLICY invitation_writer_select ON invitation
  FOR SELECT
  TO lc_identity_writer
  USING (true);

CREATE POLICY invitation_writer_update ON invitation
  FOR UPDATE
  TO lc_identity_writer
  USING (true)
  WITH CHECK (true);

GRANT SELECT ON invitation TO lc_identity_writer;
-- Column-level, same reasoning as lc_app's own grant in 0014: this role may set
-- status/accepted_at/failed_attempts and never expires_at, issued_at, or any
-- identifying column.
GRANT UPDATE (status, accepted_at, failed_attempts) ON invitation TO lc_identity_writer;

-- tenant: read-only, across every tenant — the function must confirm the
-- invitation's target tenant is active regardless of any session setting,
-- since the accepting caller has no tenant context at all.
CREATE POLICY tenant_identity_writer_read ON tenant
  FOR SELECT
  TO lc_identity_writer
  USING (true);

GRANT SELECT ON tenant TO lc_identity_writer;

-- audit_event: INSERT restricted to exactly the four actions this function may
-- write. The same narrowing 001/D8 applies to lc_audit_writer's one action.
CREATE POLICY audit_event_identity_writer ON audit_event
  FOR INSERT
  TO lc_identity_writer
  WITH CHECK (action IN ('identity.created', 'membership.created', 'invitation.accepted', 'invitation.refused'));

GRANT INSERT ON audit_event TO lc_identity_writer;

-- ---------------------------------------------------------------------------
-- The function itself.
-- ---------------------------------------------------------------------------
--
-- Returns a single row: outcome ('accepted' | 'refused'), and the identity/
-- membership/tenant ids on success (all NULL on refusal). Every refusal cause —
-- no such reference, expired, used, revoked, email mismatch, tenant deactivated,
-- attempt threshold exceeded — reaches the SAME 'refused' outcome, which is what
-- makes FR-022/FR-034's "observably identical" true by construction rather than
-- by the caller remembering to collapse six branches into one response.
--
-- SELECT ... FOR UPDATE on the invitation row is what makes SC-005 (concurrent
-- acceptance) hold: the second of two simultaneous callers blocks until the
-- first commits, then finds status <> 'pending' and refuses.

CREATE FUNCTION accept_invitation(
  p_reference_hash text,
  p_subject        text,
  p_email          text,
  -- research.md D8. A parameter rather than a hardcoded local, so the
  -- application layer can source it from INVITATION_MAX_FAILED_ATTEMPTS
  -- (.env.example) without a migration — but ONLY the trusted internal
  -- service passes it; nothing here reads it from request input, and the
  -- default protects any caller that omits it.
  p_max_attempts   int DEFAULT 10
)
RETURNS TABLE (outcome text, identity_id uuid, membership_id uuid, tenant_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invitation     invitation%ROWTYPE;
  v_tenant_status  tenant_status;
  v_identity_id    uuid;
  v_membership_id  uuid;
  v_already_member boolean;
BEGIN
  SELECT * INTO v_invitation FROM invitation WHERE reference_hash = p_reference_hash FOR UPDATE;

  IF NOT FOUND THEN
    -- Nothing to attribute this to: no invitation, no tenant, no target. Still
    -- audited, against no tenant, so a platform-level read can see scanning
    -- activity without any tenant's log being touched (FR-034).
    INSERT INTO audit_event (tenant_id, action, target_entity, target_id, source, metadata)
      VALUES (NULL, 'invitation.refused', 'invitation', NULL, '{"channel":"interactive"}'::jsonb, '{}'::jsonb);
    RETURN QUERY SELECT 'refused'::text, NULL::uuid, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  SELECT status INTO v_tenant_status FROM tenant WHERE id = v_invitation.tenant_id;

  IF v_invitation.status <> 'pending'
     OR now() >= v_invitation.expires_at
     OR v_invitation.failed_attempts >= p_max_attempts
     OR lower(v_invitation.invited_email) <> lower(p_email)
     OR v_tenant_status IS DISTINCT FROM 'active'
  THEN
    UPDATE invitation SET failed_attempts = failed_attempts + 1 WHERE id = v_invitation.id;
    INSERT INTO audit_event (tenant_id, action, target_entity, target_id, source, metadata)
      VALUES (v_invitation.tenant_id, 'invitation.refused', 'invitation', v_invitation.id,
              '{"channel":"interactive"}'::jsonb, '{}'::jsonb);
    RETURN QUERY SELECT 'refused'::text, NULL::uuid, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  -- Find-or-create, keyed on subject (FR-003). Never overwrites email on an
  -- existing row — a subject arriving with a different email than the one on
  -- record still resolves to the same identity, untouched.
  SELECT id INTO v_identity_id FROM identity WHERE subject = p_subject;

  -- FR-029: an email invited again while already a live member must not
  -- produce a second membership. Guarded here, not only at issuance, since
  -- accepting is the path that would otherwise violate membership's
  -- (identity_id, tenant_id) uniqueness with an unhandled error rather than
  -- the ordinary generic refusal.
  IF v_identity_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM membership m
       WHERE m.identity_id = v_identity_id AND m.tenant_id = v_invitation.tenant_id AND m.status = 'live'
    ) INTO v_already_member;

    IF v_already_member THEN
      UPDATE invitation SET failed_attempts = failed_attempts + 1 WHERE id = v_invitation.id;
      INSERT INTO audit_event (tenant_id, action, target_entity, target_id, source, metadata)
        VALUES (v_invitation.tenant_id, 'invitation.refused', 'invitation', v_invitation.id,
                '{"channel":"interactive"}'::jsonb, '{}'::jsonb);
      RETURN QUERY SELECT 'refused'::text, NULL::uuid, NULL::uuid, NULL::uuid;
      RETURN;
    END IF;
  END IF;

  IF v_identity_id IS NULL THEN
    INSERT INTO identity (subject, email) VALUES (p_subject, p_email)
      RETURNING id INTO v_identity_id;

    -- FR-033: audited against the invitation's tenant, since identity itself
    -- holds no tenant of its own.
    INSERT INTO audit_event (tenant_id, action, target_entity, target_id, source, metadata)
      VALUES (v_invitation.tenant_id, 'identity.created', 'identity', v_identity_id,
              '{"channel":"interactive"}'::jsonb, '{}'::jsonb);
  END IF;

  -- No RETURNING here, deliberately (the same fix 001/D8 applied in 0009):
  -- lc_identity_writer holds INSERT only on membership, and INSERT ... RETURNING
  -- requires SELECT too. Generating the id in advance keeps the grant at
  -- exactly INSERT, matching data-model.md's "INSERT only" claim for this table.
  v_membership_id := gen_random_uuid();
  INSERT INTO membership (id, identity_id, tenant_id, archetype)
    VALUES (v_membership_id, v_identity_id, v_invitation.tenant_id, v_invitation.target_archetype);

  INSERT INTO audit_event (
    tenant_id, action, target_entity, target_id, source, metadata,
    actor_identity_id, actor_membership_id
  ) VALUES (
    v_invitation.tenant_id, 'membership.created', 'membership', v_membership_id,
    '{"channel":"interactive"}'::jsonb, '{}'::jsonb, v_identity_id, v_membership_id
  );

  UPDATE invitation SET status = 'accepted', accepted_at = now() WHERE id = v_invitation.id;

  INSERT INTO audit_event (
    tenant_id, action, target_entity, target_id, source, metadata,
    actor_identity_id, actor_membership_id
  ) VALUES (
    v_invitation.tenant_id, 'invitation.accepted', 'invitation', v_invitation.id,
    '{"channel":"interactive"}'::jsonb, '{}'::jsonb, v_identity_id, v_membership_id
  );

  RETURN QUERY SELECT 'accepted'::text, v_identity_id, v_membership_id, v_invitation.tenant_id;
END $$;

ALTER FUNCTION accept_invitation(text, text, text, int) OWNER TO lc_identity_writer;

REVOKE ALL ON FUNCTION accept_invitation(text, text, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION accept_invitation(text, text, text, int) TO lc_app;
