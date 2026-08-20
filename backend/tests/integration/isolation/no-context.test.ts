/**
 * T036 / quickstart V15 — no active tenant context returns zero rows and no error.
 *
 * Required by Constitution v1.3.0 for every tenant-scoped table.
 *
 * The ordering below is the whole point and is easy to get wrong. On a FRESH
 * connection that has never set app.tenant_id, `current_setting(..., true)` returns
 * NULL, and even the prohibited bare predicate behaves correctly — so a naive version
 * of this test passes against a non-compliant policy and proves nothing.
 *
 * The failure only appears once a transaction on the same connection has SET the
 * value and then ended, after which the same call returns '' rather than NULL. So
 * each case here deliberately runs a tenant-scoped transaction FIRST, on the same
 * client, and only then the context-free one. That is the pooled-connection sequence
 * the constitution describes, and it is what makes this a real regression test.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { connectAs, withTenant, withoutTenant } from '../../helpers/db';
import { TENANT_SCOPED_TABLES } from '../../../src/common/db/tenant-scoped-tables';

describe('no active tenant context', () => {
  let app: Client;
  let tenantA: string;

  beforeAll(async () => {
    const platform = await connectAs('platform');
    const { rows } = await platform.query<{ id: string }>(
      'SELECT id FROM tenant ORDER BY created_at LIMIT 1',
    );
    tenantA = rows[0]!.id;
    await platform.end();

    app = await connectAs('app');
  });

  afterAll(async () => {
    await app.end();
  });

  it.each(TENANT_SCOPED_TABLES.map((t) => t.table))(
    '%s returns zero rows and raises nothing after the setting has been used and released',
    async (table) => {
      // 1. Use the connection with a tenant active, then let the transaction end.
      //    This is what leaves the setting as '' rather than NULL.
      const seen = await withTenant(app, tenantA, async () => {
        const { rows } = await app.query<{ n: string }>(
          `SELECT count(*)::text AS n FROM ${table}`,
        );
        return Number(rows[0]!.n);
      });
      expect(seen, `${table} should be visible while a tenant is active`).toBeGreaterThan(0);

      // 2. Same connection, no tenant activated. Must be silent, not loud.
      const result = await withoutTenant(app, async () => {
        const { rows } = await app.query<{ n: string }>(
          `SELECT count(*)::text AS n FROM ${table}`,
        );
        return Number(rows[0]!.n);
      });

      expect(result, `${table} must return zero rows with no context`).toBe(0);
    },
  );

  it('confirms the released setting really is the empty string, not NULL', async () => {
    // Documents the mechanism the rule exists for. If this ever reports NULL, the
    // pooling behaviour has changed and the test above stops being meaningful.
    await withTenant(app, tenantA, async () => {
      await app.query('SELECT 1');
    });

    const { rows } = await withoutTenant(app, async () =>
      app.query<{ raw: string | null; nullified: string | null }>(
        `SELECT current_setting('app.tenant_id', true) AS raw,
                NULLIF(current_setting('app.tenant_id', true), '') AS nullified`,
      ),
    );

    expect(rows[0]?.raw).toBe('');
    expect(rows[0]?.nullified).toBeNull();
  });

  it('a write with no tenant context is refused rather than silently misattributed', async () => {
    await withTenant(app, tenantA, async () => {
      await app.query('SELECT 1');
    });

    await expect(
      withoutTenant(app, async () =>
        app.query(
          `INSERT INTO audit_event (tenant_id, action, target_entity, target_id, source)
           VALUES ($1, 'audit.queried', 'audit_event', $1, '{"channel":"interactive"}'::jsonb)`,
          [tenantA],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});
