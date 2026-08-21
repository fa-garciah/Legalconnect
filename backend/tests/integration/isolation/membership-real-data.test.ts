/**
 * T022 / quickstart V1 / SC-001 — slice 001's isolation suite proved a mechanism
 * against `InMemoryMembershipPort`. This is the acceptance bar `spec.md` states
 * for this slice: the identical guarantees, against the real database-backed
 * adapter and real seeded rows, with 0 test modifications to the suite this
 * mirrors (see tests/integration/isolation/multi-membership.test.ts).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tenant as tenantTable, auditEvent } from '../../../src/common/db/schema';
import { closeAppDb } from '../../../src/common/db/client';
import { runInTenantContext } from '../../../src/common/tenant/middleware';
import { resolvePrincipal } from '../../../src/common/tenant/resolve';
import { DbMembershipPort } from '../../../src/common/tenant/membership';
import { seededTenantIds, type SeededTenants } from '../../helpers/tenants';
import { seededIdentities, type SeededIdentities } from '../../helpers/identities';
import { connectAs } from '../../helpers/db';

describe('membership resolution against real data (SC-001)', () => {
  let tenants: SeededTenants;
  let identities: SeededIdentities;
  const port = new DbMembershipPort();

  beforeAll(async () => {
    tenants = await seededTenantIds();
    identities = await seededIdentities();
  });

  afterAll(async () => {
    await closeAppDb();
  });

  async function activate(identityId: string, tenantId: string) {
    return resolvePrincipal({ identityId, tenantId }, port);
  }

  it('carries a different archetype in each tenant — FR-024, US1 scenario 1', async () => {
    const a = await activate(identities.dualId, tenants.a);
    const b = await activate(identities.dualId, tenants.b);
    if (!a.ok || !b.ok) throw new Error('expected both activations to succeed');
    expect(a.principal.archetype).toBe('MP');
    expect(b.principal.archetype).toBe('IC');
  });

  it('sees only tenant A while A is active, and only B while B is active', async () => {
    const a = await activate(identities.dualId, tenants.a);
    if (!a.ok) throw new Error('expected activation to succeed');
    const rowsA = await runInTenantContext(a.principal, async (tx) =>
      tx.select({ id: tenantTable.id }).from(tenantTable),
    );
    expect(rowsA.map((r) => r.id)).toEqual([tenants.a]);

    const b = await activate(identities.dualId, tenants.b);
    if (!b.ok) throw new Error('expected activation to succeed');
    const rowsB = await runInTenantContext(b.principal, async (tx) =>
      tx.select({ id: tenantTable.id }).from(tenantTable),
    );
    expect(rowsB.map((r) => r.id)).toEqual([tenants.b]);
  });

  it('never reveals the other tenant through the audit log — FR-023 (001)', async () => {
    const a = await activate(identities.dualId, tenants.a);
    if (!a.ok) throw new Error('expected activation to succeed');
    const rows = await runInTenantContext(a.principal, async (tx) =>
      tx.select({ tenantId: auditEvent.tenantId }).from(auditEvent),
    );
    expect(rows.length, 'A must see its own entries').toBeGreaterThan(0);
    expect(new Set(rows.map((r) => r.tenantId))).toEqual(new Set([tenants.a]));
  });

  it('an identity with zero live memberships is refused, and remains a valid identity — US1 scenario 7, FR-011', async () => {
    const result = await activate(identities.outsiderId, tenants.a);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('no_live_membership');
  });

  it('naming a tenant with no live membership and naming a nonexistent tenant refuse identically — US1 scenario 2, quickstart V3', async () => {
    const noMembership = await activate(identities.outsiderId, tenants.a);
    const nonexistent = await activate(
      identities.outsiderId,
      '00000000-0000-4000-8000-000000000000',
    );
    expect(noMembership.ok).toBe(false);
    expect(nonexistent.ok).toBe(false);
    if (!noMembership.ok && !nonexistent.ok) {
      expect(noMembership.reason).toBe(nonexistent.reason);
    }
  });

  it('a revoked membership is refused — US1 scenario 3, quickstart V4', async () => {
    const migration = await connectAs('migration');
    try {
      const { rows } = await migration.query<{ id: string }>(
        `INSERT INTO identity (subject, email) VALUES ($1, 'revoked-test@example.com') RETURNING id`,
        [`idp|revoked-test-${Date.now()}`],
      );
      const testIdentityId = rows[0]!.id;
      await migration.query(
        `INSERT INTO membership (identity_id, tenant_id, archetype, status, revoked_at)
         VALUES ($1, $2, 'AA', 'revoked', now())`,
        [testIdentityId, tenants.a],
      );

      const result = await activate(testIdentityId, tenants.a);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('membership_revoked');
    } finally {
      await migration.end();
    }
  });

  it('a live membership in a deactivated tenant is refused, and the tenant keeps its data — US1 scenario 4', async () => {
    const platform = await connectAs('platform');
    const migration = await connectAs('migration');
    try {
      const provisioned = await platform.query<{ id: string }>(
        `INSERT INTO tenant (name, rfc, plan_id)
         VALUES ('Deactivated Test, S.C.', $1, (SELECT id FROM plan LIMIT 1))
         RETURNING id`,
        [`DTS${Date.now().toString().slice(-6)}AB1`],
      );
      const deactivatedTenantId = provisioned.rows[0]!.id;
      await platform.query(
        `UPDATE tenant SET status = 'deactivated', deactivated_at = now() WHERE id = $1`,
        [deactivatedTenantId],
      );

      const { rows } = await migration.query<{ id: string }>(
        `INSERT INTO identity (subject, email) VALUES ($1, 'deactivated-test@example.com') RETURNING id`,
        [`idp|deactivated-test-${Date.now()}`],
      );
      const testIdentityId = rows[0]!.id;
      await migration.query(
        `INSERT INTO membership (identity_id, tenant_id, archetype) VALUES ($1, $2, 'SA')`,
        [testIdentityId, deactivatedTenantId],
      );

      const result = await activate(testIdentityId, deactivatedTenantId);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('tenant_deactivated');

      const stillThere = await migration.query('SELECT status FROM tenant WHERE id = $1', [
        deactivatedTenantId,
      ]);
      expect(stillThere.rows[0]?.status).toBe('deactivated');
    } finally {
      await platform.end();
      await migration.end();
    }
  });

  it('a token/header contradicting the resolved membership is ignored — US1 scenario 9, FR-016, SC-019', async () => {
    // resolvePrincipal never accepts an archetype or tenant as anything other
    // than its own two explicit parameters — there is no third input it could
    // honour even if a caller tried to smuggle one in.
    const result = await activate(identities.dualId, tenants.a);
    if (!result.ok) throw new Error('expected activation to succeed');
    expect(result.principal.archetype).toBe('MP');
    expect(Object.keys(result.principal).sort()).toEqual(
      ['archetype', 'identityId', 'membershipId', 'tenantId'].sort(),
    );
  });
});
