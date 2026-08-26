/**
 * T043 — US3: the entitlement mapping is configuration, and behaves like it. FR-007,
 * FR-027, SC-007. No cache, no TTL (research.md D7) — this proves it against the
 * real database, not just the pure function.
 *
 * No capability at launch carries a `tier`/`limit` key (plan.md Open Item 4), so this
 * injects one temporary synthetic registry row — the same technique
 * refusal-ordering.test.ts uses — to observe a real plan flip through the real
 * `DbMembershipPort` -> `resolvePrincipal` -> `decide()` path.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { decide } from '../../src/common/authz/decide';
import { CAPABILITIES, type CapabilityDef, type CapabilityId } from '../../src/common/authz/capability';
import { MATRIX } from '../../src/common/authz/matrix';
import { DbMembershipPort } from '../../src/common/tenant/membership';
import { resolvePrincipal } from '../../src/common/tenant/resolve';
import { closeAppDb } from '../../src/common/db/client';
import { connectAs } from '../helpers/db';

const SYNTHETIC_ID = 'test.no_deploy_probe' as CapabilityId;
const SYNTHETIC_DEF: CapabilityDef = { scope: 'tenant', tier: 'probe_feature' };

beforeAll(() => {
  (CAPABILITIES as Record<string, CapabilityDef>)[SYNTHETIC_ID] = SYNTHETIC_DEF;
  (MATRIX as unknown as Record<string, Set<string>>)[SYNTHETIC_ID] = new Set(['SA']);
});

afterAll(() => {
  delete (CAPABILITIES as Record<string, CapabilityDef>)[SYNTHETIC_ID];
  delete (MATRIX as unknown as Record<string, Set<string>>)[SYNTHETIC_ID];
});

afterEach(async () => {
  await closeAppDb();
});

async function seedThrowawayMember(planCode: string): Promise<{ identityId: string; tenantId: string }> {
  const migration = await connectAs('migration');
  try {
    const tenant = await migration.query<{ id: string }>(
      `INSERT INTO tenant (name, rfc, plan_id)
       VALUES ($1, $2, (SELECT id FROM plan WHERE code = $3))
       RETURNING id`,
      ['No-Deploy Probe Tenant, S.C.', `NDP${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 900 + 100)}`, planCode],
    );
    const identity = await migration.query<{ id: string }>(
      `INSERT INTO identity (subject, email, mfa_enrolled_at) VALUES ($1, $2, now()) RETURNING id`,
      [`idp|no-deploy-${Date.now()}-${Math.random()}`, `no-deploy-${Date.now()}@example.com`],
    );
    await migration.query(`INSERT INTO membership (identity_id, tenant_id, archetype) VALUES ($1, $2, 'SA')`, [
      identity.rows[0]!.id,
      tenant.rows[0]!.id,
    ]);
    return { identityId: identity.rows[0]!.id, tenantId: tenant.rows[0]!.id };
  } finally {
    await migration.end();
  }
}

async function decideForMember(identityId: string, tenantId: string) {
  const port = new DbMembershipPort();
  const resolution = await resolvePrincipal({ identityId, tenantId }, port);
  if (!resolution.ok) throw new Error(`expected activation to succeed, got refusal: ${resolution.reason}`);
  return decide({
    subject: resolution.principal.archetype,
    capability: SYNTHETIC_ID,
    mfaEnrolledAt: undefined,
    scope: {
      subject: resolution.principal.archetype,
      capability: SYNTHETIC_ID,
      principal: resolution.principal,
      identityId: resolution.principal.identityId,
      targetTenantId: resolution.principal.tenantId,
      targetId: null,
    },
    plan: resolution.principal.plan ?? null,
  });
}

describe('entitlement mapping changes take effect with no deployment', () => {
  it('flipping plan.entitlements[key] refuses/permits the very next request — 0 restarts, 0 deployments', async () => {
    const member = await seedThrowawayMember('esencial');
    const migration = await connectAs('migration');
    const original = await migration.query<{ entitlements: Record<string, boolean> }>(
      `SELECT entitlements FROM plan WHERE code = 'esencial'`,
    );
    const originalEntitlements = original.rows[0]!.entitlements;

    try {
      await migration.query(`UPDATE plan SET entitlements = $1::jsonb WHERE code = 'esencial'`, [
        JSON.stringify({ ...originalEntitlements, probe_feature: false }),
      ]);
      const refused = await decideForMember(member.identityId, member.tenantId);
      expect(refused.permitted).toBe(false);
      if (!refused.permitted) expect(refused.reason).toBe('entitlement');

      await migration.query(`UPDATE plan SET entitlements = $1::jsonb WHERE code = 'esencial'`, [
        JSON.stringify({ ...originalEntitlements, probe_feature: true }),
      ]);
      const permitted = await decideForMember(member.identityId, member.tenantId);
      expect(permitted.permitted).toBe(true);
    } finally {
      await migration.query(`UPDATE plan SET entitlements = $1::jsonb WHERE code = 'esencial'`, [
        JSON.stringify(originalEntitlements),
      ]);
      await migration.end();
    }
  });

  it('changing the tenant\'s plan_id outright is evaluated against the new plan on the next request', async () => {
    const member = await seedThrowawayMember('esencial');
    const migration = await connectAs('migration');
    try {
      const before = await decideForMember(member.identityId, member.tenantId);
      // esencial carries no probe_feature entitlement by default -> refused.
      expect(before.permitted).toBe(false);

      await migration.query(
        `UPDATE tenant SET plan_id = (SELECT id FROM plan WHERE code = 'profesional') WHERE id = $1`,
        [member.tenantId],
      );

      // profesional's default entitlements are also {} — the observable change here is
      // the LIMIT the resolved plan now carries, proving the join re-reads live.
      const port = new DbMembershipPort();
      const resolution = await resolvePrincipal({ identityId: member.identityId, tenantId: member.tenantId }, port);
      if (!resolution.ok) throw new Error('expected activation to succeed');
      expect(resolution.principal.plan?.limits.users).toBe(25); // profesional, drizzle/seed.ts
    } finally {
      await migration.end();
    }
  });

  it('a request tripping permission and entitlement at once returns exactly one reason: permission (FR-022, SC-005)', async () => {
    const decision = await decide({
      subject: 'AA',
      capability: SYNTHETIC_ID,
      mfaEnrolledAt: '2026-01-01T00:00:00.000Z',
      scope: {
        subject: 'AA',
        capability: SYNTHETIC_ID,
        principal: { identityId: 'i', membershipId: 'm', tenantId: 't', archetype: 'AA' },
        identityId: 'i',
        targetTenantId: 't',
        targetId: null,
      },
      plan: { entitlements: { probe_feature: false }, limits: {} },
    });
    expect(decision.permitted).toBe(false);
    if (!decision.permitted) expect(decision.reason).toBe('permission');
  });
});
