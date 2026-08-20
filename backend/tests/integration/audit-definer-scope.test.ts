/**
 * T058 / research.md D8 — the definer function can append its one row, and can do
 * nothing else.
 *
 * This is the test that keeps the sanctioned exception narrow. The function is the only
 * place in the system permitted to write outside the active tenant, so its blast radius
 * has to be pinned down rather than assumed.
 *
 * The scoping is doubled on purpose: to the ROLE (lc_audit_writer) and to one ACTION
 * (via its RLS policy). Either alone would be too loose — the role alone could forge
 * any event, the action alone would apply to every role.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { connectAs } from '../helpers/db';
import { seededTenantIds, type SeededTenants } from '../helpers/tenants';

describe('definer function scope', () => {
  let migration: Client;
  let tenants: SeededTenants;

  beforeAll(async () => {
    tenants = await seededTenantIds();
    // Connects as the superuser so it can SET ROLE to the writer and observe what that
    // role can actually do — the only way to test the role's limits directly.
    migration = await connectAs('migration');
  });

  afterAll(async () => {
    await migration.end();
  });

  it('runs as lc_audit_writer, not as the caller or the table owner', async () => {
    const { rows } = await migration.query<{ prosecdef: boolean; owner: string }>(
      `SELECT prosecdef, pg_get_userbyid(proowner) AS owner
         FROM pg_proc WHERE proname = 'audit_append_cross_tenant_attempt'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.prosecdef).toBe(true);
    expect(rows[0]!.owner).toBe('lc_audit_writer');
  });

  it('holds INSERT on audit_event and nothing more', async () => {
    const { rows } = await migration.query<{
      ins: boolean;
      sel: boolean;
      upd: boolean;
      del: boolean;
    }>(
      `SELECT has_table_privilege('lc_audit_writer','audit_event','INSERT') AS ins,
              has_table_privilege('lc_audit_writer','audit_event','SELECT') AS sel,
              has_table_privilege('lc_audit_writer','audit_event','UPDATE') AS upd,
              has_table_privilege('lc_audit_writer','audit_event','DELETE') AS del`,
    );
    expect(rows[0]!.ins).toBe(true);
    // No SELECT: it writes attempts, it does not read the log. This is also why the
    // function must not use INSERT ... RETURNING.
    expect(rows[0]!.sel).toBe(false);
    expect(rows[0]!.upd).toBe(false);
    expect(rows[0]!.del).toBe(false);
  });

  it('holds no privilege at all on tenant or plan', async () => {
    const { rows } = await migration.query<{ t: boolean; p: boolean }>(
      `SELECT has_table_privilege('lc_audit_writer','tenant','SELECT') AS t,
              has_table_privilege('lc_audit_writer','plan','SELECT') AS p`,
    );
    expect(rows[0]!.t).toBe(false);
    expect(rows[0]!.p).toBe(false);
  });

  it('is not a superuser and does not bypass RLS', async () => {
    const { rows } = await migration.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
      `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'lc_audit_writer'`,
    );
    expect(rows[0]!.rolsuper).toBe(false);
    expect(rows[0]!.rolbypassrls).toBe(false);
  });

  it('cannot log in', async () => {
    // Nothing connects as this role. It exists solely to own the function.
    const { rows } = await migration.query<{ rolcanlogin: boolean }>(
      `SELECT rolcanlogin FROM pg_roles WHERE rolname = 'lc_audit_writer'`,
    );
    expect(rows[0]!.rolcanlogin).toBe(false);
  });

  it('can append the cross-tenant attempt row', async () => {
    await migration.query('BEGIN');
    try {
      await migration.query('SET LOCAL ROLE lc_audit_writer');
      await expect(
        migration.query(
          `INSERT INTO audit_event (tenant_id, action, target_entity, source)
           VALUES ($1, 'tenant.cross_access_attempted', 'tenant', '{"channel":"interactive"}'::jsonb)`,
          [tenants.b],
        ),
      ).resolves.toBeDefined();
    } finally {
      await migration.query('ROLLBACK');
    }
  });

  it('cannot forge any OTHER action, even for its own tenant', async () => {
    // The policy's WITH CHECK pins the action. Without this, the role could write a
    // fake provisioning or plan-change event for any firm.
    for (const action of ['tenant.provisioned', 'tenant.plan_changed', 'audit.queried']) {
      await migration.query('BEGIN');
      try {
        await migration.query('SET LOCAL ROLE lc_audit_writer');
        await expect(
          migration.query(
            `INSERT INTO audit_event (tenant_id, action, target_entity, source)
             VALUES ($1, $2, 'tenant', '{"channel":"interactive"}'::jsonb)`,
            [tenants.b, action],
          ),
          `${action} must be refused`,
        ).rejects.toThrow(/row-level security/i);
      } finally {
        await migration.query('ROLLBACK');
      }
    }
  });
});
