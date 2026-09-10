-- accept_invitation(), five arguments. FR-053, research.md D4.
--
-- NUMBERED 0037, NOT 0036 as tasks.md says. 0036 went to the audit vocabulary the
-- twelve new actions needed and 0030 had failed to add. migrate.ts applies files in
-- filename order, so the number is load-bearing and the task's text is stale on it.
--
-- DROPPING AND RECREATING IS NECESSARY, NOT TIDY. Adding a parameter creates a new
-- signature rather than replacing the old one, and leaving both would be an
-- ambiguous overload on the product's ONLY path into `identity`. A caller passing
-- four arguments would silently get the version that establishes no credential, and
-- the identity it created would be one nobody can ever sign in as — a state
-- FR-053 exists to make impossible.
--
-- EVERYTHING 002 GUARANTEED IS PRESERVED UNCHANGED, and the list is worth stating
-- because this file is the one place it could quietly be lost:
--
--   * SELECT ... FOR UPDATE on the invitation row, which is what makes 002/SC-005
--     hold — the second of two simultaneous callers blocks, then finds the status
--     no longer pending and refuses.
--   * The six refusal branches collapsed into one 'refused' outcome, so
--     002/FR-022's "observably identical" stays true BY CONSTRUCTION rather than
--     by a caller remembering to flatten them.
--   * The tenant-status check, the already-a-member guard, the failed-attempt
--     counter, and every audit write, in the same order and with the same
--     attribution.
--   * Atomicity. A failure anywhere leaves no identity, no membership, NO
--     CREDENTIAL, and an unused invitation.
--   * OWNER TO lc_identity_writer, so the definer runs with a role that holds
--     INSERT and nothing else.
--
-- WHAT IS NEW: the credential digest, inserted inside the existing transaction.
-- The digest is computed in the APPLICATION (Argon2id, interactive profile, D6) —
-- no plaintext credential ever reaches a SQL parameter, a parameter log, or
-- pg_stat_statements.

DROP FUNCTION accept_invitation(text, text, text, int);

CREATE FUNCTION accept_invitation(
  p_reference_hash    text,
  p_subject           text,
  p_email             text,
  -- NEW. Argon2id PHC string, interactive profile. Never the credential itself.
  p_credential_digest text,
  p_max_attempts      int DEFAULT 10
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

  -- FIND-OR-CREATE NOW KEYS ON THE NORMALIZED EMAIL, not on the subject, and this
  -- follows necessarily from D9 rather than departing from it.
  --
  -- Under the previous provider the subject was the user pool's identifier: the
  -- same person accepting a second invitation arrived carrying the same subject,
  -- so keying on it resolved them to their existing identity and 001/FR-021 — a
  -- person may hold membership in more than one firm — worked.
  --
  -- D9 makes the subject a value THIS PRODUCT generates at acceptance. A generated
  -- subject is new every time by construction, so keying on it would find nothing,
  -- ever: every acceptance would mint a fresh identity, and one human being with
  -- two firms would become two people with one credential each. FR-021 would be
  -- silently false, and nothing would fail loudly to say so.
  --
  -- The email is the right key now, and 0035 is what makes it a legitimate one: it
  -- carries a unique index on exactly this normalized form, so it identifies at
  -- most one row. That index and this lookup are the same decision seen twice —
  -- sign-in resolves a person by email for the same reason.
  --
  -- The subject stays distinct from the email and keeps its own meaning
  -- (002/FR-003, D9): it is the stable internal handle that survives an email
  -- change, which is what keeps Recognised Technical Debt item 6 tractable. It is
  -- simply not the thing that answers "have I seen this person before".
  SELECT id INTO v_identity_id
  FROM identity
  WHERE lower(btrim(email)) = lower(btrim(p_email));

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

    -- FR-053. The credential, in the SAME transaction as the identity and the
    -- membership below. No identity holding a membership may exist without one.
    --
    -- INSIDE THIS BRANCH, NOT AFTER IT, and the reason is a grant rather than a
    -- preference. An existing identity already has a credential and it MUST NOT be
    -- replaced — overwriting it would let anyone holding a valid invitation to any
    -- tenant reset the authentication material of an existing person who shares
    -- that email, which is an account takeover wearing the clothes of an ordinary
    -- onboarding.
    --
    -- The obvious way to express that is `ON CONFLICT (identity_id) DO NOTHING`
    -- after the branch. It does not work here, and the failure is instructive:
    -- ON CONFLICT must read the conflicting row, so PostgreSQL requires SELECT on
    -- the table, and lc_identity_writer holds INSERT and nothing else. Granting it
    -- SELECT to make the idiom work would hand the credential digest to a second
    -- role for a check this branch performs for free. The grant is right; the idiom
    -- was wrong.
    INSERT INTO identity_credential (identity_id, digest)
      VALUES (v_identity_id, p_credential_digest);

    INSERT INTO audit_event (tenant_id, action, target_entity, target_id, source, metadata)
      VALUES (v_invitation.tenant_id, 'identity.created', 'identity', v_identity_id,
              '{"channel":"interactive"}'::jsonb, '{}'::jsonb);
  END IF;


  -- No RETURNING, deliberately (the same fix 001/D8 applied in 0009):
  -- lc_identity_writer holds INSERT only on membership, and INSERT ... RETURNING
  -- requires SELECT too.
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

ALTER FUNCTION accept_invitation(text, text, text, text, int) OWNER TO lc_identity_writer;

REVOKE ALL ON FUNCTION accept_invitation(text, text, text, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION accept_invitation(text, text, text, text, int) TO lc_app;
