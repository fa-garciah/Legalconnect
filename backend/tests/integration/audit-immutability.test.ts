/**
 * T052 / quickstart V5 / AS-04 / SC-005 — audit entries cannot be modified or deleted
 * by the application.
 *
 * The assertion is specifically a PERMISSION error, not a missing method. FR-011
 * requires the prohibition to hold at the data permission level: a repository class
 * that merely omits an update method is bypassable by the next developer, a missing
 * grant is not.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { connectAs, withTenant } from '../helpers/db';
import { seededTenantIds, type SeededTenants } from '../helpers/tenants';

describe('audit log immutability', () => {
  let app: Client;
  let platform: Client;
  let tenants: SeededTenants;
  let existingId: string;

  beforeAll(async () => {
    tenants = await seededTenantIds();
    platform = await connectAs('platform');
    const { rows } = await platform.query<{ id: string }>(
      'SELECT id FROM audit_event WHERE tenant_id = $1 LIMIT 1',
      [tenants.a],
    );
    existingId = rows[0]!.id;
    app = await connectAs('app');
  });

  afterAll(async () => {
    await app.end();
    await platform.end();
  });

  it('refuses UPDATE with a permission error', async () => {
    await expect(
      withTenant(app, tenants.a, async () =>
        app.query(`UPDATE audit_event SET action = 'audit.queried' WHERE id = $1`, [existingId]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('refuses DELETE with a permission error', async () => {
    await expect(
      withTenant(app, tenants.a, async () =>
        app.query('DELETE FROM audit_event WHERE id = $1', [existingId]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('refuses a blanket DELETE just as firmly', async () => {
    await expect(
      withTenant(app, tenants.a, async () => app.query('DELETE FROM audit_event')),
    ).rejects.toThrow(/permission denied/i);
  });

  it('leaves the entry intact after the attempts', async () => {
    const { rows } = await platform.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM audit_event WHERE id = $1',
      [existingId],
    );
    expect(Number(rows[0]!.n)).toBe(1);
  });

  it('can still append — append-only means append, not read-only', async () => {
    // Asserted so the tests above are known to fail for the right reason. If INSERT
    // were also missing, every case above would pass while the log was simply
    // unusable.
    const inserted = await withTenant(app, tenants.a, async () => {
      const { rows } = await app.query<{ id: string }>(
        `INSERT INTO audit_event (action, target_entity, source)
         VALUES ('audit.queried', 'audit_event', '{"channel":"interactive"}'::jsonb)
         RETURNING id`,
      );
      return rows[0]!.id;
    });
    expect(inserted).toBeTruthy();
  });
});
