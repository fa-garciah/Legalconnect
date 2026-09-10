-- lc_auth reads `identity`. The half of T000's resolution that only shows up when
-- the credential step is actually built.
--
-- THE GAP. `identity` grants SELECT to lc_app alone (0012), scoped by
-- `identity_self_row` to the caller's own row. That is right for every route 002
-- shipped: those callers already know who they are. Sign-in does not — resolving
-- WHO IS ASKING is the entire job of the credential step, and it starts from an
-- email typed into a form. lc_auth could read the credential digest and the factor
-- but not the row that connects them to an address, so the join returned nothing
-- and every sign-in failed.
--
-- WHY THIS IS A GRANT PLUS A POLICY, NOT JUST A GRANT. `identity` has RLS enabled
-- and FORCED. A grant with no policy for this role would return ZERO ROWS rather
-- than permission denied — the quietest possible failure, and one that looks
-- exactly like "no such person" at the only step where those two must not be
-- confused. Both halves are required for the read to happen at all.
--
-- WHAT THIS ROLE CAN NOW SEE, STATED PLAINLY. `identity_auth_read` is
-- `USING (true)`: lc_auth can read EVERY identity row — id, subject, email,
-- mfa_enrolled_at, created_at. That is a real widening and it is the narrowest one
-- that makes sign-in possible, because a person who has not authenticated yet
-- cannot be scoped to their own row: which row that is, is the answer.
--
-- What it does NOT get, and this is what keeps the widening contained:
--
--   * no `membership`, so it cannot learn which firms anyone belongs to;
--   * no tenant table, no client, no case, no document — no tenant data at all;
--   * no ability to WRITE an identity. Creating one stays with
--     lc_identity_writer inside accept_invitation(), so this connection cannot
--     mint a person to authenticate as.
--
-- The blast radius is therefore "the list of people who exist and their email
-- addresses", reachable only from `src/modules/auth/`, and never from the
-- connection every other module uses. Principle II is untouched: tenancy is
-- resolved from `membership` under RLS, and this role cannot see that table.

GRANT SELECT ON identity TO lc_auth;

CREATE POLICY identity_auth_read ON identity
  FOR SELECT
  TO lc_auth
  USING (true);

COMMENT ON POLICY identity_auth_read ON identity IS
  'Sign-in resolves a person by email before they are authenticated, so it cannot be scoped to their own row — which row that is, is the question being asked. Confined to lc_auth, which holds nothing on membership or any tenant table.';

-- ---------------------------------------------------------------------------
-- One column of UPDATE, for enrollment.
-- ---------------------------------------------------------------------------
--
-- `identity.mfa_enrolled_at` is 002/FR-026's already-shipped interface to the
-- enrollment state, and FR-011 requires it set in the SAME transaction as
-- `identity_factor.confirmed_at` — "the two must not diverge". `confirmed_at` is
-- the fact; this column is what the shipped precondition reads.
--
-- Column-scoped deliberately. A table-wide UPDATE would let the authentication
-- connection rewrite an email or a subject, which is an identity operation
-- requiring step-up MFA and re-verification (Recognised Technical Debt item 6),
-- not something the sign-in path should be able to do by accident.

GRANT UPDATE (mfa_enrolled_at) ON identity TO lc_auth;

CREATE POLICY identity_auth_enrollment_write ON identity
  FOR UPDATE
  TO lc_auth
  USING (true)
  WITH CHECK (true);
