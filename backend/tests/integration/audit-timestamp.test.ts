/**
 * T056 / FR-020 — timestamps derive from the database, not from the component
 * emitting the event.
 *
 * Container clocks drift independently. Ordering the log by a value each emitter chose
 * for itself would make it unorderable in exactly the incident where order matters.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { connectAs } from '../helpers/db';
import { closeAppDb } from '../../src/common/db/client';
import { runInTenantContext } from '../../src/common/tenant/middleware';
import { appendAuditEntry, type AppendInput } from '../../src/common/audit/append';
import { seededTenantIds, type SeededTenants } from '../helpers/tenants';
import type { ActivePrincipal } from '../../src/common/tenant/principal';

describe('audit timestamps', () => {
  let platform: Client;
  let tenants: SeededTenants;
  let principal: ActivePrincipal;

  beforeAll(async () => {
    tenants = await seededTenantIds();
    platform = await connectAs('platform');
    principal = {
      identityId: '11111111-1111-4111-8111-111111111111',
      membershipId: '66666666-6666-4666-8666-666666666666',
      tenantId: tenants.a,
      archetype: 'SA',
    };
  });

  afterAll(async () => {
    await platform.end();
    await closeAppDb();
  });

  it('records a server-side timestamp close to the database clock', async () => {
    const marker = `ts-${Date.now()}`;

    const before = await dbNow(platform);
    await runInTenantContext(principal, async (tx) =>
      appendAuditEntry(tx, {
        tenantId: principal.tenantId,
        action: 'audit.queried',
        targetEntity: 'audit_event',
        source: { channel: 'interactive' },
        metadata: { marker },
      }),
    );
    const after = await dbNow(platform);

    const { rows } = await platform.query<{ occurred_at: Date }>(
      `SELECT occurred_at FROM audit_event WHERE metadata ->> 'marker' = $1`,
      [marker],
    );

    const occurred = rows[0]!.occurred_at.getTime();
    expect(occurred).toBeGreaterThanOrEqual(before.getTime() - 1000);
    expect(occurred).toBeLessThanOrEqual(after.getTime() + 1000);
  });

  it('offers no way for a caller to supply a timestamp', () => {
    // Enforced by the type: AppendInput has no occurredAt member, so supplying one is
    // a compile error rather than a silently honoured value.
    const input: AppendInput = {
      tenantId: principal.tenantId,
      action: 'audit.queried',
      targetEntity: 'audit_event',
      source: { channel: 'interactive' },
    };
    expect(Object.keys(input)).not.toContain('occurredAt');
  });

  it('ignores an occurredAt smuggled past the type at runtime', async () => {
    const marker = `smuggle-${Date.now()}`;
    const forged = new Date('2001-01-01T00:00:00Z');

    await runInTenantContext(principal, async (tx) =>
      appendAuditEntry(tx, {
        tenantId: principal.tenantId,
        action: 'audit.queried',
        targetEntity: 'audit_event',
        source: { channel: 'interactive' },
        metadata: { marker },
        // A JavaScript caller can always pass an extra property. The append must not
        // forward it.
        ...({ occurredAt: forged } as Record<string, unknown>),
      } as AppendInput),
    );

    const { rows } = await platform.query<{ occurred_at: Date }>(
      `SELECT occurred_at FROM audit_event WHERE metadata ->> 'marker' = $1`,
      [marker],
    );
    expect(rows[0]!.occurred_at.getFullYear()).not.toBe(2001);
  });
});

async function dbNow(client: Client): Promise<Date> {
  const { rows } = await client.query<{ now: Date }>('SELECT clock_timestamp() AS now');
  return rows[0]!.now;
}
