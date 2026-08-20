/**
 * T037 — US1 scenario 3. A write carrying no explicit tenant value is attributed to
 * the active tenant, and cannot be attributed to another.
 *
 * Two independent guarantees, asserted separately because they fail differently:
 *  - the column DEFAULT attributes an unnamed tenant correctly (and fails closed with
 *    no context, rather than landing somewhere arbitrary);
 *  - WITH CHECK refuses a NAMED foreign tenant, which USING alone would not — without
 *    it the row would land and only the read-back would be blocked.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { connectAs, withTenant, withoutTenant } from '../../helpers/db';
import { seededTenantIds, type SeededTenants } from '../../helpers/tenants';

describe('write attribution', () => {
  let app: Client;
  let tenants: SeededTenants;

  beforeAll(async () => {
    tenants = await seededTenantIds();
    app = await connectAs('app');
  });

  afterAll(async () => {
    await app.end();
  });

  it('attributes a write with no tenant named to the active tenant', async () => {
    const written = await withTenant(app, tenants.a, async () => {
      const { rows } = await app.query<{ tenant_id: string }>(
        `INSERT INTO audit_event (action, target_entity, target_id, source)
         VALUES ('audit.queried', 'audit_event', NULL, '{"channel":"interactive"}'::jsonb)
         RETURNING tenant_id`,
      );
      return rows[0]!.tenant_id;
    });

    expect(written).toBe(tenants.a);
    expect(written).not.toBe(tenants.b);
  });

  it('refuses a write that names a foreign tenant', async () => {
    await expect(
      withTenant(app, tenants.a, async () =>
        app.query(
          `INSERT INTO audit_event (tenant_id, action, target_entity, source)
           VALUES ($1, 'audit.queried', 'audit_event', '{"channel":"interactive"}'::jsonb)`,
          [tenants.b],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('fails closed rather than misattributing when no tenant is active', async () => {
    // The default evaluates to NULL with no context. Two checks would each catch that
    // — the policy's WITH CHECK and the NOT NULL constraint — and the policy is
    // evaluated first, so the observed error is the RLS one. Either way the write is
    // refused rather than landing somewhere arbitrary, which is what matters here;
    // asserting the specific check would be asserting PostgreSQL's evaluation order.
    await withTenant(app, tenants.a, async () => {
      await app.query('SELECT 1');
    });

    await expect(
      withoutTenant(app, async () =>
        app.query(
          `INSERT INTO audit_event (action, target_entity, source)
           VALUES ('audit.queried', 'audit_event', '{"channel":"interactive"}'::jsonb)`,
        ),
      ),
    ).rejects.toThrow(/row-level security|not-null|null value/i);
  });
});
