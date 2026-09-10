-- identity_credential: the verification material for FR-001. One row per identity.
-- data-model.md, entity `identity_credential`.
--
-- THE LOAD-BEARING PROPERTY OF THIS TABLE IS WHAT lc_app IS NOT GRANTED — which is
-- nothing at all. Not a narrowed SELECT, not a column-scoped one: no privilege of
-- any kind.
--
-- This is not defence in depth. It is the difference between FR-015 holding and not
-- holding, and the reason is concrete rather than theoretical. `identity` already
-- carries a self-row SELECT policy for lc_app (0012_identity.sql):
--
--     CREATE POLICY identity_self_row ON identity FOR SELECT TO lc_app
--       USING (id = NULLIF(current_setting('app.identity_id', true), '')::uuid);
--
-- That policy is correct and tested. Had the credential digest been stored as a
-- column on `identity`, it would be readable by its owner THROUGH that correct,
-- already-passing policy — no bug, no missing filter, just a well-tested policy
-- returning a column nobody noticed it now covered. Separate tables with no lc_app
-- grant is what makes that impossible rather than merely unintended
-- (research.md D3). tests/integration/identity-self-row-no-material.test.ts is the
-- regression test for exactly that path.
--
-- No RLS policy here, and that is deliberate rather than an omission. The table
-- carries no `tenant_id`, so the RLS catalogue check in rls-coverage.test.ts admits
-- it — that test asserts every table CARRYING tenant_id has an active policy, and
-- this one does not carry it. A credential is not meaningful per tenant: one
-- credential authenticates one person, who may hold membership in several firms
-- (001/FR-021). The constitution states this exception for identity and session
-- data; this slice extends it only to material hanging off an identity.

CREATE TABLE identity_credential (
  identity_id uuid PRIMARY KEY REFERENCES identity (id) ON DELETE CASCADE,
  -- Argon2id PHC string, interactive profile (research.md D6). Computed in the
  -- application: no plaintext credential ever reaches a SQL parameter, a parameter
  -- log, or pg_stat_statements (research.md D4).
  digest      text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT identity_credential_digest_not_blank CHECK (length(btrim(digest)) >= 1)
);

COMMENT ON TABLE identity_credential IS
  'Authentication material. lc_app holds NO privilege here — see research.md D3. Established atomically with identity and membership by accept_invitation(); never returned by any surface and never logged (FR-002).';

-- ---------------------------------------------------------------------------
-- Grants. lc_app appears nowhere below, and that absence is the design.
-- ---------------------------------------------------------------------------

-- Establishment at acceptance (FR-053, research.md D4). The replaced
-- accept_invitation() runs as this role and inserts the row inside the existing
-- transaction, so no identity holding a membership can exist without a credential
-- and none can exist without an identity.
GRANT INSERT ON identity_credential TO lc_identity_writer;

-- Verification reads the stored PHC string and compares it IN THE APPLICATION.
-- There is no verify_credential() function and inventing one would be misleading:
-- Argon2id digests are salted, so no comparable candidate can be derived without
-- first reading the stored string, and @node-rs/argon2 does not exist inside
-- PostgreSQL. A wrapper around a plain read would suggest the digest stays in the
-- database when it does not and cannot (data-model.md, "Credential verification
-- needs no function").
--
-- UPDATE is column-scoped to the two columns a credential change would touch. No
-- story in this slice exposes that change; the grant is scoped now so that when 005
-- or a later slice adds one, widening it is a visible act rather than an
-- already-granted convenience.
GRANT SELECT                        ON identity_credential TO lc_auth;
GRANT UPDATE (digest, updated_at)   ON identity_credential TO lc_auth;
