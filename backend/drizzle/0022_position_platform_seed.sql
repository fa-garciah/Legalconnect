-- 017/FR-009, SC-008 on the production provisioning path. research.md D2 —
-- "the same insert runs wherever 001's tenant-provisioning path already writes a
-- tenant's first rows, extending that write, not adding a second provisioning
-- mechanism."
--
-- Provisioning runs as lc_platform, which 0020 gave nothing at all on `position`
-- (that table was granted to lc_app only). This is the same narrow extension
-- 002 already made in 0016_platform_role_seed_grants.sql, in the same shape and
-- for the same reason: one FOR INSERT policy with a restricting WITH CHECK, one
-- GRANT INSERT, and nothing else.
--
-- What this deliberately does NOT grant, and why it matters: no SELECT, so the
-- platform role cannot read back even the catalog it just wrote, and cannot
-- enumerate any firm's ranks; no UPDATE, so it can never retire or edit an entry
-- a firm owns; no DELETE, so FR-007's "never hard-deleted" holds for this role
-- exactly as it does for lc_app. The extension buys provisioning one INSERT and
-- buys it nothing else — 0016's own discipline, restated.
--
-- Nothing here weakens a grant or policy established by 001, 002 or 004 (FR-015):
-- it adds one policy and one privilege on a table this slice introduced.

-- `status = 'active' AND retired_at IS NULL` is the analogue of 0016's
-- `seeded = true`: the platform role may bring a catalog into existence, but only
-- in the state a brand-new catalog is legitimately in. A pre-retired seed row
-- would be a shape no tenant could have produced for itself.
CREATE POLICY position_platform_seed_insert ON position
  FOR INSERT
  TO lc_platform
  WITH CHECK (status = 'active' AND retired_at IS NULL);

GRANT INSERT ON position TO lc_platform;

-- directory_entry is deliberately untouched. Seeding the catalog a firm chooses
-- from is a provisioning act; deciding who holds which position is the firm's own,
-- and the platform role has no business in it.
