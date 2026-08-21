-- research.md D6 — the seed capability (FR-035) narrowly extends the platform
-- role's reach, which 001/D9 deliberately narrowed to tenant/plan/audit_event.
-- Exactly two additions, both narrow: a read-only existence-check on membership,
-- and an insert restricted to the seeded shape on invitation. Neither grant
-- touches identity, and neither lets the platform role read a tenant's
-- membership roster — only whether one exists at all.

CREATE POLICY membership_platform_existence_check ON membership
  FOR SELECT
  TO lc_platform
  USING (true);

GRANT SELECT ON membership TO lc_platform;

CREATE POLICY invitation_platform_seed_insert ON invitation
  FOR INSERT
  TO lc_platform
  WITH CHECK (seeded = true);

GRANT INSERT ON invitation TO lc_platform;
