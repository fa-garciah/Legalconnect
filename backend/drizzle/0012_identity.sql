-- Identity: the person as recognised by the external IdP. Holds no tenant.
-- data-model.md, research.md D4.
--
-- The load-bearing property of this table is what it does NOT grant. FR-004
-- requires "no tenant session may enumerate identities" to be a data-layer fact,
-- not an application-layer one — so lc_app gets exactly one privilege, a SELECT
-- restricted to its own row, and nothing else. There is no INSERT, no UPDATE, no
-- unrestricted SELECT for lc_app at any point. The only way a row is created is
-- the accept_invitation() function in 0015, running as a different role entirely.

CREATE TABLE identity (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- FR-001, FR-003: the IdP's subject identifier. The same subject always
  -- resolves to exactly one row.
  subject         text NOT NULL,
  -- Held for correlation and contact (FR-024's email match, FR-025 reuse across
  -- tenants) — never as a credential. FR-002.
  email           text NOT NULL,
  -- NULL until slice 003's enrollment completes. FR-026 reads this; nothing in
  -- this slice sets it to non-null.
  mfa_enrolled_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT identity_subject_unique UNIQUE (subject),
  CONSTRAINT identity_subject_not_blank CHECK (length(btrim(subject)) >= 1),
  CONSTRAINT identity_email_not_blank CHECK (length(btrim(email)) >= 1)
);

COMMENT ON TABLE identity IS
  'Holds no tenant. The application role has exactly one privilege here: SELECT restricted to its own row. No INSERT/UPDATE grant exists for it at all — see research.md D4.';

ALTER TABLE identity ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity FORCE ROW LEVEL SECURITY;

-- Constitution v1.3.0's null-safe form, applied to app.identity_id rather than
-- app.tenant_id — research.md D3.
CREATE POLICY identity_self_row ON identity
  FOR SELECT
  TO lc_app
  USING (id = NULLIF(current_setting('app.identity_id', true), '')::uuid);

-- Deliberately no lc_platform policy and no lc_platform grant. The seed
-- capability (research.md D6) never touches identity at all.

-- The only grant lc_app holds on this table. No INSERT, no UPDATE, no DELETE.
GRANT SELECT ON identity TO lc_app;
