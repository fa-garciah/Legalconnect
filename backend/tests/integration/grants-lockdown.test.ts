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

  it("T061 (004, research.md D10): lc_app holds no more than SELECT on tenant — the grant audit's expected finding: none", async () => {
    await withTenant(app, tenantA, async () => {
      await expect(
        app.query(`UPDATE tenant SET name = 'attacker-renamed' WHERE id = $1`, [tenantA]),
      ).rejects.toThrow(/permission denied/i);
    });
    await withTenant(app, tenantA, async () => {
      await expect(
        app.query(`INSERT INTO tenant (name, rfc, plan_id) VALUES ('x', 'ABC123456XYZ', (SELECT id FROM plan LIMIT 1))`),
      ).rejects.toThrow(/permission denied/i);
    });
    await withTenant(app, tenantA, async () => {
      await expect(app.query(`DELETE FROM tenant WHERE id = $1`, [tenantA])).rejects.toThrow(
        /permission denied/i,
      );
    });
  });

  it('T061 (004, research.md D10): lc_app holds no more than SELECT on plan', async () => {
    await withTenant(app, tenantA, async () => {
      await expect(
        app.query(`UPDATE plan SET name = 'attacker-renamed' WHERE code = 'esencial'`),
      ).rejects.toThrow(/permission denied/i);
    });
    await withTenant(app, tenantA, async () => {
      await expect(
        app.query(`INSERT INTO plan (code, name, limits, entitlements) VALUES ('premium', 'x', '{}', '{}')`),
      ).rejects.toThrow(/permission denied/i);
    });
    await withTenant(app, tenantA, async () => {
      await expect(app.query(`DELETE FROM plan WHERE code = 'esencial'`)).rejects.toThrow(/permission denied/i);
    });
  });

  it("T027 (017): lc_app holds exactly SELECT, INSERT, UPDATE on position and directory_entry — never DELETE", async () => {
    // FR-004/FR-007's "never hard-deleted" is the ABSENT grant, the same discipline
    // 001 established for tenant and 002 for membership/invitation. Asserted against
    // the catalog rather than by attempting a delete, so a future migration that
    // added the privilege fails here even if no code ever calls it.
    const migration = await connectAs('migration');
    try {
      const { rows } = await migration.query<{ table_name: string; privilege_type: string }>(
        `SELECT table_name, privilege_type
           FROM information_schema.role_table_grants
          WHERE grantee = 'lc_app' AND table_name IN ('position', 'directory_entry')
          ORDER BY table_name, privilege_type`,
      );
      expect(rows.map((r) => `${r.table_name}:${r.privilege_type}`)).toEqual([
        'directory_entry:INSERT',
        'directory_entry:SELECT',
        'directory_entry:UPDATE',
        'position:INSERT',
        'position:SELECT',
        'position:UPDATE',
      ]);
    } finally {
      await migration.end();
    }
  });

  it('T027 (017): the missing DELETE is real — lc_app is refused at the database, not by a missing method', async () => {
    await withTenant(app, tenantA, async () => {
      await expect(app.query(`DELETE FROM position WHERE tenant_id = $1`, [tenantA])).rejects.toThrow(
        /permission denied/i,
      );
    });
    await withTenant(app, tenantA, async () => {
      await expect(
        app.query(`DELETE FROM directory_entry WHERE tenant_id = $1`, [tenantA]),
      ).rejects.toThrow(/permission denied/i);
    });
  });

  it('T027 (017): no role the application can reach holds DELETE on either new table (FR-004, FR-007)', async () => {
    // "every role the application can reach", in 0006_grants.sql's own words — the
    // owner's implicit privileges are not a grant the application can use, and are
    // what DDL runs as.
    const migration = await connectAs('migration');
    try {
      const { rows } = await migration.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM information_schema.role_table_grants
          WHERE table_name IN ('position', 'directory_entry')
            AND privilege_type = 'DELETE'
            AND grantee IN ('lc_app', 'lc_platform', 'lc_audit_writer', 'lc_retention')`,
      );
      expect(Number(rows[0]!.n)).toBe(0);
    } finally {
      await migration.end();
    }
  });

  it("T027 (017): FR-015 — the two new tables added grants, and weakened none of 001/002/004's", async () => {
    const migration = await connectAs('migration');
    try {
      // lc_app on the pre-existing tables, exactly as 001/002/004 left them.
      const { rows } = await migration.query<{ table_name: string; privilege_type: string }>(
        `SELECT table_name, privilege_type
           FROM information_schema.role_table_grants
          WHERE grantee = 'lc_app'
            AND table_name IN ('tenant', 'plan', 'audit_event', 'identity', 'membership', 'invitation')
          ORDER BY table_name, privilege_type`,
      );
      expect(rows.map((r) => `${r.table_name}:${r.privilege_type}`)).toEqual([
        'audit_event:INSERT',
        'audit_event:SELECT',
        'identity:SELECT',
        'invitation:INSERT',
        'invitation:SELECT',
        // No table-wide invitation:UPDATE — 002 granted it per COLUMN, which is what
        // the immutable-columns test below exercises from the other direction.
        'membership:SELECT',
        'membership:UPDATE',
        'plan:SELECT',
        'tenant:SELECT',
      ]);
    } finally {
      await migration.end();
    }
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
