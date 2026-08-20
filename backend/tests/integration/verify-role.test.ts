/**
 * T012 / quickstart V1 — the misconfiguration that makes the whole suite lie.
 *
 * PostgreSQL silently ignores RLS for superusers and for the table owner. Get this
 * wrong and every policy is still in place, every other isolation test still passes,
 * and there is no isolation at all. This is asserted here AND at startup, because it
 * is the only failure in this slice that cannot be caught by testing behaviour.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { connectAs } from '../helpers/db';

describe('application role attributes', () => {
  let client: Client;

  beforeAll(async () => {
    client = await connectAs('app');
  });

  afterAll(async () => {
    await client.end();
  });

  it('is not a superuser and does not hold BYPASSRLS', async () => {
    const { rows } = await client.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
      'SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user',
    );
    expect(rows[0]?.rolsuper).toBe(false);
    expect(rows[0]?.rolbypassrls).toBe(false);
  });

  it('owns zero tables', async () => {
    const { rows } = await client.query<{ owned: string }>(
      `SELECT count(*)::text AS owned
         FROM pg_class c
         JOIN pg_roles r ON r.oid = c.relowner
        WHERE r.rolname = current_user AND c.relkind IN ('r', 'p')`,
    );
    expect(rows[0]?.owned).toBe('0');
  });

  it('holds no UPDATE or DELETE privilege on audit_event', async () => {
    // FR-011. The prohibition is the absent grant, not an absent repository method,
    // which is what lets AS-04 assert a permission error.
    const { rows } = await client.query<{ upd: boolean; del: boolean; ins: boolean; sel: boolean }>(
      `SELECT has_table_privilege(current_user, 'audit_event', 'UPDATE') AS upd,
              has_table_privilege(current_user, 'audit_event', 'DELETE') AS del,
              has_table_privilege(current_user, 'audit_event', 'INSERT') AS ins,
              has_table_privilege(current_user, 'audit_event', 'SELECT') AS sel`,
    );
    expect(rows[0]?.upd).toBe(false);
    expect(rows[0]?.del).toBe(false);
    expect(rows[0]?.ins).toBe(true);
    expect(rows[0]?.sel).toBe(true);
  });

  it('holds no DELETE privilege on tenant', async () => {
    // FR-006 / SC-011: tenants are never hard-deleted, by anyone.
    const { rows } = await client.query<{ del: boolean }>(
      `SELECT has_table_privilege(current_user, 'tenant', 'DELETE') AS del`,
    );
    expect(rows[0]?.del).toBe(false);
  });
});
