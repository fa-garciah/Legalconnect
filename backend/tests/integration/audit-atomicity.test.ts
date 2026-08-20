/**
 * T053 / quickstart V6 / FR-017 / SC-012 — a mutation whose audit entry cannot be
 * written leaves zero observable effects.
 *
 * This is the difference between an audit log that is evidence and one that is a hint.
 * If a mutation can commit with no entry, Principle V's guarantee is gone and nothing
 * in the log's contents will ever reveal the gap.
 *
 * A note on what stands in for "the mutation". US2 ships no business write — the first
 * one is provisioning, in US3 — and the only table the application role may write is
 * audit_event itself. So the transaction below performs a marker append and then a
 * failing append, and asserts the marker is gone. That proves the property under test:
 * the audit write is transactionally coupled to whatever shares its transaction.
 * US3's provisioning tests exercise the same path with a real business mutation.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import type { Client } from 'pg';
import { connectAs } from '../helpers/db';
import { closeAppDb } from '../../src/common/db/client';
import { runInTenantContext } from '../../src/common/tenant/middleware';
import { appendAuditEntry } from '../../src/common/audit/append';
import { seededTenantIds, type SeededTenants } from '../helpers/tenants';
import type { ActivePrincipal } from '../../src/common/tenant/principal';

describe('audit atomicity', () => {
  let platform: Client;
  let tenants: SeededTenants;
  let principal: ActivePrincipal;

  beforeAll(async () => {
    tenants = await seededTenantIds();
    platform = await connectAs('platform');
    principal = {
      identityId: '11111111-1111-4111-8111-111111111111',
      membershipId: 'mm-atomicity',
      tenantId: tenants.a,
      archetype: 'SA',
    };
  });

  afterAll(async () => {
    await platform.end();
    await closeAppDb();
  });

  const countMarkers = async (marker: string): Promise<number> => {
    const { rows } = await platform.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM audit_event WHERE metadata ->> 'marker' = $1`,
      [marker],
    );
    return Number(rows[0]!.n);
  };

  it('commits both writes when the audit append succeeds', async () => {
    const marker = `ok-${Date.now()}`;

    await runInTenantContext(principal, async (tx) => {
      await appendAuditEntry(tx, {
        tenantId: principal.tenantId,
        action: 'audit.queried',
        targetEntity: 'audit_event',
        source: { channel: 'interactive' },
        metadata: { marker },
      });
    });

    expect(await countMarkers(marker)).toBe(1);
  });

  it('rolls the whole transaction back when the audit append fails', async () => {
    const marker = `rollback-${Date.now()}`;

    await expect(
      runInTenantContext(principal, async (tx) => {
        // The "mutation".
        await appendAuditEntry(tx, {
          tenantId: principal.tenantId,
          action: 'audit.queried',
          targetEntity: 'audit_event',
          source: { channel: 'interactive' },
          metadata: { marker },
        });

        // Its audit entry, forced to fail — an action outside the vocabulary trips the
        // CHECK constraint, which is a genuine write failure rather than a thrown
        // error the test invented.
        await tx.execute(sql`
          INSERT INTO audit_event (tenant_id, action, target_entity, source)
          VALUES (${principal.tenantId}::uuid, 'not.a.real.action', 'tenant',
                  '{"channel":"interactive"}'::jsonb)
        `);
      }),
    ).rejects.toThrow();

    // Zero observable effects.
    expect(await countMarkers(marker)).toBe(0);
  });

  it('leaves nothing behind even when the failure is the last statement', async () => {
    const marker = `late-${Date.now()}`;

    await expect(
      runInTenantContext(principal, async (tx) => {
        await appendAuditEntry(tx, {
          tenantId: principal.tenantId,
          action: 'tenant.registry_read',
          targetEntity: 'tenant',
          source: { channel: 'interactive' },
          metadata: { marker },
        });
        throw new Error('handler failed after the audit append');
      }),
    ).rejects.toThrow(/handler failed/);

    expect(await countMarkers(marker)).toBe(0);
  });
});
