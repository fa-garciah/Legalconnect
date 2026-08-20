/**
 * T039 / quickstart V4 — the attempt is recorded against the TARGETED tenant, and the
 * entry does not name the actor's home tenant.
 *
 * Both halves matter and the second is the easy one to forget. Telling firm B that a
 * member of firm A reached for its matter would disclose that firm A exists and is
 * adjacent to that matter, which in this domain can itself be privileged. FR-023.
 * So this asserts an ABSENCE, not just a presence.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { connectAs } from '../../helpers/db';
import { recordCrossTenantAttempt } from '../../../src/common/tenant/record-attempt';
import { closeAppDb } from '../../../src/common/db/client';
import { IDENTITY_DUAL, seededTenantIds, type SeededTenants } from '../../helpers/tenants';

describe('recording a cross-tenant attempt', () => {
  let platform: Client;
  let tenants: SeededTenants;

  beforeAll(async () => {
    tenants = await seededTenantIds();
    platform = await connectAs('platform');
  });

  afterAll(async () => {
    await platform.end();
    await closeAppDb();
  });

  it('writes the entry into the targeted tenant’s log, not the actor’s', async () => {
    const before = await count(platform, tenants.b);

    await recordCrossTenantAttempt({
      targetTenantId: tenants.b,
      targetEntity: 'audit_event',
      targetId: null,
      actorIdentityId: IDENTITY_DUAL.id,
      source: { channel: 'interactive', clientClass: 'web' },
    });

    expect(await count(platform, tenants.b)).toBe(before + 1);
  });

  it('does not name the actor’s home tenant anywhere in the entry', async () => {
    await recordCrossTenantAttempt({
      targetTenantId: tenants.b,
      targetEntity: 'audit_event',
      targetId: null,
      actorIdentityId: IDENTITY_DUAL.id,
      source: { channel: 'interactive', clientClass: 'web' },
    });

    const { rows } = await platform.query<{
      tenant_id: string;
      source: unknown;
      metadata: unknown;
      actor_membership_id: string | null;
    }>(
      `SELECT tenant_id, source, metadata, actor_membership_id
         FROM audit_event
        WHERE tenant_id = $1 AND action = 'tenant.cross_access_attempted'
        ORDER BY occurred_at DESC LIMIT 1`,
      [tenants.b],
    );

    const row = rows[0];
    expect(row).toBeDefined();
    expect(row!.tenant_id).toBe(tenants.b);

    const serialised = JSON.stringify([row!.source, row!.metadata]);
    expect(serialised, 'the actor’s home tenant must not appear').not.toContain(tenants.a);

    // The membership is the other thing that would tie the actor to a tenant.
    expect(row!.actor_membership_id).toBeNull();
  });

  it('can be recorded with no tenant context active', async () => {
    // The attempt happens precisely when activation failed, so the recording path
    // cannot depend on a tenant being active.
    await expect(
      recordCrossTenantAttempt({
        targetTenantId: tenants.b,
        targetEntity: 'tenant',
        targetId: tenants.b,
        actorIdentityId: null,
        source: { channel: 'automated' },
      }),
    ).resolves.toBeUndefined();
  });
});

async function count(client: Client, tenantId: string): Promise<number> {
  const { rows } = await client.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM audit_event
      WHERE tenant_id = $1 AND action = 'tenant.cross_access_attempted'`,
    [tenantId],
  );
  return Number(rows[0]!.n);
}
