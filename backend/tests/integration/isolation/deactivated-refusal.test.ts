/**
 * T044 / quickstart V11 / research.md D13 — activating a deactivated tenant is
 * refused, and its records remain intact.
 *
 * Refusing at ACTIVATION rather than per resource is the same single-choke-point
 * pattern as the membership check: every downstream path becomes inert without needing
 * its own check, so there is nothing to forget.
 *
 * Uses a throwaway tenant rather than deactivating a seeded one, because the
 * transition is one-way by design (FR-006) and there is no reactivation path to
 * clean up with.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { connectAs } from '../../helpers/db';
import { closeAppDb } from '../../../src/common/db/client';
import { resolvePrincipal } from '../../../src/common/tenant/resolve';
import { runInTenantContext } from '../../../src/common/tenant/middleware';
import { InMemoryMembershipPort } from '../../../src/common/tenant/membership';
import { IDENTITY_SINGLE } from '../../helpers/tenants';

describe('deactivated tenant', () => {
  let platform: Client;
  let doomedTenantId: string;
  let port: InMemoryMembershipPort;

  beforeAll(async () => {
    platform = await connectAs('platform');

    const rfc = `DDT${String(Date.now()).slice(-6)}Z${String(Date.now()).slice(-2)}`;
    const { rows } = await platform.query<{ id: string }>(
      `INSERT INTO tenant (name, rfc, plan_id)
       VALUES ('Despacho Desactivado, S.C.', $1, (SELECT id FROM plan WHERE code = 'esencial'))
       RETURNING id`,
      [rfc.toUpperCase().slice(0, 12)],
    );
    doomedTenantId = rows[0]!.id;

    await platform.query(
      `INSERT INTO audit_event (tenant_id, action, target_entity, target_id, source)
       VALUES ($1, 'tenant.provisioned', 'tenant', $1, '{"channel":"interactive"}'::jsonb)`,
      [doomedTenantId],
    );

    port = new InMemoryMembershipPort([
      {
        id: 'mm-doomed',
        identityId: IDENTITY_SINGLE.id,
        tenantId: doomedTenantId,
        archetype: 'SA',
        status: 'live',
      },
    ]);
  });

  afterAll(async () => {
    await platform.end();
    await closeAppDb();
  });

  it('activates normally while the tenant is active', async () => {
    // Asserted first, so the refusal below is known to be caused by deactivation and
    // not by the fixture being broken all along.
    const result = await resolvePrincipal(
      { identityId: IDENTITY_SINGLE.id, tenantId: doomedTenantId },
      port,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const rows = await runInTenantContext(result.principal, async (tx) =>
        tx.execute('SELECT 1 AS ok'),
      );
      expect(rows.rowCount).toBe(1);
    }
  });

  it('refuses activation once deactivated', async () => {
    await platform.query(
      `UPDATE tenant SET status = 'deactivated', deactivated_at = now() WHERE id = $1`,
      [doomedTenantId],
    );

    const result = await resolvePrincipal(
      { identityId: IDENTITY_SINGLE.id, tenantId: doomedTenantId },
      port,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('tenant_deactivated');
  });

  it('keeps the tenant’s records intact', async () => {
    // FR-006: deactivated, never erased.
    const { rows } = await platform.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM audit_event WHERE tenant_id = $1`,
      [doomedTenantId],
    );
    expect(Number(rows[0]!.n)).toBeGreaterThan(0);

    const tenantRow = await platform.query<{ status: string; deactivated_at: Date | null }>(
      `SELECT status, deactivated_at FROM tenant WHERE id = $1`,
      [doomedTenantId],
    );
    expect(tenantRow.rows[0]!.status).toBe('deactivated');
    expect(tenantRow.rows[0]!.deactivated_at).not.toBeNull();
  });

  it('cannot be hard-deleted by any role the application holds', async () => {
    const app = await connectAs('app');
    try {
      await expect(
        app.query('DELETE FROM tenant WHERE id = $1', [doomedTenantId]),
      ).rejects.toThrow(/permission denied/i);
    } finally {
      await app.end();
    }
  });
});
