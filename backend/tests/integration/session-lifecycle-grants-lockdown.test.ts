/**
 * T015 — THE HARD GATE for this slice's new material. plan.md Constitution Check,
 * Principle IV. Modelled directly on `auth-grants-lockdown.test.ts`.
 *
 * Asserts `permission denied`, NOT an empty result — `step_up_elevation` carries no
 * RLS policy at all, so a grant here would expose every row in the system to every
 * archetype's connection.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { connectAs } from '../helpers/db';

describe('step_up_elevation is unreachable from lc_app except through consume_step_up() (Principle IV)', () => {
  let app: Client;
  let auth: Client;
  let migration: Client;

  beforeAll(async () => {
    app = await connectAs('app');
    auth = await connectAs('auth');
    migration = await connectAs('migration');
  });

  afterAll(async () => {
    await app.end();
    await auth.end();
    await migration.end();
  });

  it('lc_app is DENIED SELECT on step_up_elevation — denied, not empty', async () => {
    await expect(app.query(`SELECT * FROM step_up_elevation LIMIT 1`)).rejects.toThrow(/permission denied/i);
  });

  it('lc_app is DENIED INSERT on step_up_elevation', async () => {
    await expect(app.query(`INSERT INTO step_up_elevation DEFAULT VALUES`)).rejects.toThrow(
      /permission denied/i,
    );
  });

  it('lc_app is DENIED UPDATE and DELETE on step_up_elevation', async () => {
    await expect(app.query(`UPDATE step_up_elevation SET consumed_at = now()`)).rejects.toThrow(
      /permission denied/i,
    );
    await expect(app.query(`DELETE FROM step_up_elevation`)).rejects.toThrow(/permission denied/i);
  });

  it('lc_app holds NO column-level privilege on step_up_elevation either', async () => {
    const { rows } = await migration.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM information_schema.column_privileges
        WHERE grantee = 'lc_app' AND table_name = 'step_up_elevation'`,
    );
    expect(Number(rows[0]!.n)).toBe(0);
  });

  it('lc_auth CAN reach step_up_elevation — the tests above are not vacuous', async () => {
    await expect(auth.query(`SELECT * FROM step_up_elevation LIMIT 1`)).resolves.toBeDefined();
  });

  it('lc_app holds EXECUTE on touch_session() and consume_step_up() and NO OTHER new function from this slice', async () => {
    const { rows } = await migration.query<{ proname: string; can_execute: boolean }>(
      `SELECT p.proname, has_function_privilege('lc_app', p.oid, 'EXECUTE') AS can_execute
         FROM pg_proc p
        WHERE p.proname IN ('touch_session', 'sign_out', 'consume_step_up')
        ORDER BY p.proname`,
    );
    const permitted = rows.filter((r) => r.can_execute).map((r) => r.proname);
    expect(permitted.sort()).toEqual(['consume_step_up', 'touch_session']);
  });

  it('lc_app gains ZERO new table privilege anywhere in this slice (session, refresh_token, step_up_elevation)', async () => {
    const { rows } = await migration.query<{ table_name: string; privilege_type: string }>(
      `SELECT table_name, privilege_type FROM information_schema.role_table_grants
        WHERE grantee = 'lc_app' AND table_name IN ('session', 'refresh_token', 'step_up_elevation')`,
    );
    expect(rows).toHaveLength(0);
  });
});
