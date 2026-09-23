-- 0043 — an identity may read the NAME of a firm it belongs to.
--
-- WHY THIS EXISTS. `016a/FR-008` requires the application shell to name the active firm at
-- all times, and its tenant switcher offers a choice between the caller's firms.
-- `GET /identity/memberships` is the only source of that list and it could return tenant
-- UUIDs only: `tenant`'s single `lc_app` policy, `tenant_own_row`, is keyed on
-- `app.tenant_id`, and the identity surface deliberately runs with NO tenant active
-- (002/research D3). So the shell named nothing, the switcher offered a choice between two
-- identifiers, and the first authenticated render crashed on the absent name.
--
-- WHY IT IS SAFE, STATED AGAINST PRINCIPLE II. This grants strictly less than what the
-- caller can already reach: they hold a LIVE MEMBERSHIP in the firm, and any tenant-scoped
-- route already returns that firm's clients and matters to them. Knowing the name of a firm
-- you work at is not a cross-tenant disclosure. The policy is an EXISTS over `membership`
-- keyed on `app.identity_id` and `status = 'live'`, so:
--
--   * an identity with no live membership sees no tenant row at all;
--   * a revoked membership stops exposing the name on the NEXT request, because the
--     predicate is evaluated per query and nothing is cached;
--   * no column beyond what `SELECT` already grants becomes reachable, and `lc_app` still
--     holds SELECT only on this table.
--
-- The existing `tenant_own_row` is UNTOUCHED. Policies are OR-ed, so the tenant-scoped path
-- keeps working exactly as before and this adds one more way to see a row the caller is
-- entitled to see. Removing `tenant_own_row` and widening this one to cover both cases
-- would have been tidier and strictly worse: it would put the tenant-scoped read's
-- correctness on a predicate that mentions identity, which is the coupling 002/research D3
-- exists to avoid.

-- THE `app.tenant_id IS NULL` GUARD IS THE WHOLE SAFETY OF THIS POLICY, and it is here
-- because the first draft did not have it and the isolation suite caught the consequence
-- within minutes (`membership-real-data.test.ts`, SC-001: "sees only tenant A while A is
-- active"). Postgres OR-s policies together. Inside a TENANT session BOTH `app.tenant_id`
-- and `app.identity_id` are set, so an unguarded EXISTS made a dual-membership identity
-- acting in firm A able to read firm B's `tenant` row — a live cross-tenant widening, from
-- a change whose stated purpose was to show somebody their own firm's name.
--
-- With the guard, this policy admits a row ONLY when no tenant is active, which is exactly
-- and only the identity surface. Inside a tenant session it contributes nothing and
-- `tenant_own_row` remains the sole path, unchanged.
CREATE POLICY tenant_own_membership_select ON tenant
  FOR SELECT
  TO lc_app
  USING (
    NULLIF(current_setting('app.tenant_id', true), '') IS NULL
    AND EXISTS (
      SELECT 1
      FROM membership m
      WHERE m.tenant_id = tenant.id
        AND m.identity_id = NULLIF(current_setting('app.identity_id', true), '')::uuid
        AND m.status = 'live'
    )
  );
