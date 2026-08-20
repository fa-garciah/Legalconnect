/**
 * T035 / quickstart V3 — an unfiltered read returns own rows and zero foreign rows.
 *
 * Both halves are asserted on purpose. An unset tenant context looks like an empty
 * database rather than an error, so a test that only checks "no foreign rows" passes
 * against a middleware that activates nothing at all. Asserting that the tenant's OWN
 * rows are visible in the same breath is what separates working isolation from a
 * broken context.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { connectAs, withTenant } from '../../helpers/db';

describe('unfiltered read inside a tenant context', () => {
  let app: Client;
  let tenantA: string;
  let tenantB: string;

  beforeAll(async () => {
    const platform = await connectAs('platform');
    const { rows } = await platform.query<{ id: string }>(
      'SELECT id FROM tenant ORDER BY created_at',
    );
    if (rows.length < 2) throw new Error('seed must create at least two tenants');
    tenantA = rows[0]!.id;
    tenantB = rows[1]!.id;
    await platform.end();

    app = await connectAs('app');
  });

  afterAll(async () => {
    await app.end();
  });

  it('sees exactly its own tenant row and no other', async () => {
    const ids = await withTenant(app, tenantA, async () => {
      // No WHERE clause anywhere. That is the point.
      const { rows } = await app.query<{ id: string }>('SELECT id FROM tenant');
      return rows.map((r) => r.id);
    });

    expect(ids).toEqual([tenantA]);
    expect(ids).not.toContain(tenantB);
  });

  it('sees its own audit entries and zero foreign entries', async () => {
    const tenantIds = await withTenant(app, tenantA, async () => {
      const { rows } = await app.query<{ tenant_id: string }>('SELECT tenant_id FROM audit_event');
      return rows.map((r) => r.tenant_id);
    });

    expect(tenantIds.length, "own tenant's entries must be visible").toBeGreaterThan(0);
    expect(new Set(tenantIds)).toEqual(new Set([tenantA]));
  });

  it('is symmetric — tenant B sees B and never A', async () => {
    const ids = await withTenant(app, tenantB, async () => {
      const { rows } = await app.query<{ id: string }>('SELECT id FROM tenant');
      return rows.map((r) => r.id);
    });

    expect(ids).toEqual([tenantB]);
  });

  it('cannot write a row under a foreign tenant id even though it could not read it back', async () => {
    // WITH CHECK, not just USING. Without it the write would land and only the read
    // would be blocked.
    await expect(
      withTenant(app, tenantA, async () =>
        app.query(
          `INSERT INTO audit_event (tenant_id, action, target_entity, target_id, source)
           VALUES ($1, 'audit.queried', 'audit_event', $1, '{"channel":"interactive"}'::jsonb)`,
          [tenantB],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});
