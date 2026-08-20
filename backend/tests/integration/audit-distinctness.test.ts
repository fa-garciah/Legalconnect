/**
 * T055 / FR-018 — two entries recorded in the same instant are distinct and
 * individually addressable.
 *
 * This is why the timestamp default is clock_timestamp() and not now(). now() returns
 * transaction-start, so two appends inside one transaction would carry an identical
 * timestamp, and the log would be unorderable in exactly the incident where order
 * matters.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { connectAs } from '../helpers/db';
import { closeAppDb } from '../../src/common/db/client';
import { runInTenantContext } from '../../src/common/tenant/middleware';
import { appendAuditEntry } from '../../src/common/audit/append';
import { seededTenantIds, type SeededTenants } from '../helpers/tenants';
import type { ActivePrincipal } from '../../src/common/tenant/principal';

describe('audit entry distinctness', () => {
  let platform: Client;
  let tenants: SeededTenants;
  let principal: ActivePrincipal;

  beforeAll(async () => {
    tenants = await seededTenantIds();
    platform = await connectAs('platform');
    principal = {
      identityId: '11111111-1111-4111-8111-111111111111',
      membershipId: '55555555-5555-4555-8555-555555555555',
      tenantId: tenants.a,
      archetype: 'SA',
    };
  });

  afterAll(async () => {
    await platform.end();
    await closeAppDb();
  });

  it('produces two distinct, individually addressable entries in one transaction', async () => {
    const marker = `distinct-${Date.now()}`;

    await runInTenantContext(principal, async (tx) => {
      for (const n of [1, 2]) {
        await appendAuditEntry(tx, {
          tenantId: principal.tenantId,
          action: 'audit.queried',
          targetEntity: 'audit_event',
          source: { channel: 'interactive' },
          metadata: { marker, n },
        });
      }
    });

    // occurred_at is selected as TEXT on purpose. timestamptz carries microsecond
    // precision and a JavaScript Date only holds milliseconds, so round-tripping the
    // key through a Date silently loses the last three digits and matches nothing.
    // Anything addressing an entry by its composite key — the audit query cursor in
    // US4, for one — must carry the timestamp as a string for the same reason.
    const { rows } = await platform.query<{ id: string; occurred_at: string }>(
      `SELECT id, occurred_at::text AS occurred_at FROM audit_event
        WHERE metadata ->> 'marker' = $1 ORDER BY occurred_at, id`,
      [marker],
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]!.id).not.toBe(rows[1]!.id);

    // Each is reachable on its own by the full (occurred_at, id) primary key.
    for (const row of rows) {
      const one = await platform.query<{ n: string }>(
        'SELECT count(*)::text AS n FROM audit_event WHERE occurred_at = $1::timestamptz AND id = $2',
        [row.occurred_at, row.id],
      );
      expect(Number(one.rows[0]!.n)).toBe(1);
    }
  });

  it('gives the two entries different timestamps, not the transaction start', async () => {
    const marker = `clock-${Date.now()}`;

    await runInTenantContext(principal, async (tx) => {
      for (const n of [1, 2]) {
        await appendAuditEntry(tx, {
          tenantId: principal.tenantId,
          action: 'audit.queried',
          targetEntity: 'audit_event',
          source: { channel: 'interactive' },
          metadata: { marker, n },
        });
      }
    });

    const { rows } = await platform.query<{ distinct_times: string }>(
      `SELECT count(DISTINCT occurred_at)::text AS distinct_times
         FROM audit_event WHERE metadata ->> 'marker' = $1`,
      [marker],
    );

    // With now() this would be 1 and the ordering guarantee would be gone.
    expect(Number(rows[0]!.distinct_times)).toBe(2);
  });
});
