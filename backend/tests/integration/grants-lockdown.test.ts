/**
 * T021 — the application role has no INSERT grant on `identity` or
 * `membership`, and no unrestricted SELECT on `identity`, verified by
 * attempting each directly and asserting a permission error, not an
 * application-layer refusal.
 *
 * This is the Complexity Tracking test: FR-009/SC-009 ("no membership can be
 * created by any path other than accepting an invitation") and FR-004 ("no
 * tenant session may enumerate identities") both have to be true of the grants
 * themselves, not of which code paths happen to call them. A missing method is
 * bypassable by the next developer; a missing grant is not.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { connectAs, withTenant } from '../helpers/db';
import { seededTenantIds } from '../helpers/tenants';

describe('identity/membership grant lockdown', () => {
  let app: Client;
  let tenantA: string;

  beforeAll(async () => {
    app = await connectAs('app');
    const tenants = await seededTenantIds();
    tenantA = tenants.a;
  });

  afterAll(async () => {
    await app.end();
  });

  it('lc_app cannot INSERT into identity', async () => {
    await withTenant(app, tenantA, async () => {
      await expect(
        app.query(
          `INSERT INTO identity (subject, email) VALUES ('idp|attacker', 'x@example.com')`,
        ),
      ).rejects.toThrow(/permission denied/i);
    });
  });

  it('lc_app cannot UPDATE identity', async () => {
    await withTenant(app, tenantA, async () => {
      await expect(
        app.query(`UPDATE identity SET email = 'x@example.com' WHERE true`),
      ).rejects.toThrow(/permission denied/i);
    });
  });

  it('lc_app cannot INSERT into membership directly', async () => {
    await withTenant(app, tenantA, async () => {
      await expect(
        app.query(
          `INSERT INTO membership (identity_id, tenant_id, archetype)
           VALUES (gen_random_uuid(), $1, 'SA')`,
          [tenantA],
        ),
      ).rejects.toThrow(/permission denied/i);
    });
  });

  it('lc_app SELECT on identity sees only its own row, never an unrestricted read', async () => {
    // No app.identity_id set at all: the self-row policy matches nothing.
    const { rows } = await app.query('SELECT count(*)::text AS n FROM identity');
    expect(Number(rows[0]!.n)).toBe(0);
  });

  it('lc_app cannot UPDATE the immutable columns of invitation (expires_at, issued_at)', async () => {
    await withTenant(app, tenantA, async () => {
      const { rows } = await app.query<{ id: string }>(
        `SELECT id FROM invitation WHERE tenant_id = $1 LIMIT 1`,
        [tenantA],
      );
      const id = rows[0]?.id;
      expect(id, 'seed must have created at least one invitation for tenant A').toBeTruthy();

      await expect(
        app.query(`UPDATE invitation SET expires_at = now() + interval '30 days' WHERE id = $1`, [id]),
      ).rejects.toThrow(/permission denied/i);
    });
  });
});
