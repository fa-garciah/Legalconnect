/**
 * T036 — THE HARD GATE. SC-006, research.md D3.
 *
 * Until this passes there is no evidence that any of the five tables is actually
 * unreachable, and every story-phase test in this slice would be green against
 * grants that are wrong. That is the same shape 002 gave its own lockdown
 * verification, applied to material where a wrong grant is an AUTHENTICATION
 * BYPASS rather than a leak.
 *
 * IT ASSERTS `permission denied`, NOT AN EMPTY RESULT, and the distinction is the
 * whole test. An empty result would mean the grant exists and something else
 * happened to filter the rows — and these tables carry no RLS policy at all, so
 * "something else" would be nothing. A grant here exposes every row in the system
 * to every archetype's connection.
 *
 * It connects as the REAL `lc_app` role. Asking the owner whether lc_app can read
 * identity_factor gets a useless answer: the owner can read everything.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { connectAs } from '../helpers/db';

const MATERIAL_TABLES = ['identity_credential', 'identity_factor', 'backup_code'] as const;
const SESSION_TABLES = ['session', 'refresh_token'] as const;

/**
 * A real timestamp column per table, so the UPDATE probe below fails on the GRANT
 * rather than on an unknown column. PostgreSQL resolves the column before it
 * checks the privilege, so `SET created_at = now()` against a table that has only
 * `updated_at` reports a missing column and proves nothing about the grant.
 */
const TOUCHABLE_COLUMN: Record<string, string> = {
  identity_credential: 'updated_at',
  identity_factor: 'created_at',
  backup_code: 'created_at',
  session: 'created_at',
  refresh_token: 'created_at',
};

describe('authentication material is unreachable from lc_app (SC-006, D3)', () => {
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

  describe('lc_app', () => {
    for (const table of [...MATERIAL_TABLES, ...SESSION_TABLES]) {
      it(`is DENIED SELECT on ${table} — denied, not empty`, async () => {
        await expect(app.query(`SELECT * FROM ${table} LIMIT 1`)).rejects.toThrow(
          /permission denied/i,
        );
      });

      it(`is DENIED INSERT on ${table}`, async () => {
        // Reading is the headline risk; writing is the quieter one. An INSERT
        // grant on identity_credential would let any tenant-facing request
        // establish authentication material for an arbitrary identity.
        await expect(app.query(`INSERT INTO ${table} DEFAULT VALUES`)).rejects.toThrow(
          /permission denied/i,
        );
      });

      it(`is DENIED UPDATE and DELETE on ${table}`, async () => {
        await expect(
          app.query(`UPDATE ${table} SET ${TOUCHABLE_COLUMN[table]} = now()`),
        ).rejects.toThrow(/permission denied/i);
        await expect(app.query(`DELETE FROM ${table}`)).rejects.toThrow(/permission denied/i);
      });
    }

    it('holds EXECUTE on resolve_session() and on NO other authentication function', async () => {
      // The one deliberate exception (D8): resolution happens on every request,
      // before app.identity_id exists, so no policy could scope it. Everything
      // else must be refused — a definer function lc_app could call would hand it
      // lc_auth's reach through a side door.
      const { rows } = await migration.query<{ proname: string; can_execute: boolean }>(
        `SELECT p.proname, has_function_privilege('lc_app', p.oid, 'EXECUTE') AS can_execute
           FROM pg_proc p
          WHERE p.proname IN ('resolve_session','claim_attempt','consume_backup_code','rotate_refresh')
          ORDER BY p.proname`,
      );

      const permitted = rows.filter((r) => r.can_execute).map((r) => r.proname);
      expect(permitted).toEqual(['resolve_session']);
    });

    it('holds NO column-level privilege on the material tables either', async () => {
      // A table-level denial can be undone one column at a time. This is the
      // check that a future migration granting SELECT (digest) would fail.
      const { rows } = await migration.query<{ n: string }>(
        `SELECT count(*)::text AS n
           FROM information_schema.column_privileges
          WHERE grantee = 'lc_app' AND table_name = ANY($1)`,
        [[...MATERIAL_TABLES]],
      );
      expect(Number(rows[0]!.n)).toBe(0);
    });
  });

  describe('lc_auth', () => {
    it('CAN reach the material tables — the tests above are not vacuous', async () => {
      // Without this, a migration that dropped every grant including lc_auth's
      // would make this whole file pass while authentication stopped working.
      for (const table of MATERIAL_TABLES) {
        await expect(auth.query(`SELECT * FROM ${table} LIMIT 1`)).resolves.toBeDefined();
      }
    });

    it('is not superuser, owns nothing, and holds no BYPASSRLS', async () => {
      const { rows } = await migration.query<{
        rolsuper: boolean;
        rolbypassrls: boolean;
        owned: string;
      }>(
        `SELECT r.rolsuper, r.rolbypassrls,
                (SELECT count(*)::text FROM pg_tables WHERE tableowner = 'lc_auth') AS owned
           FROM pg_roles r WHERE r.rolname = 'lc_auth'`,
      );
      const row = rows[0]!;
      expect(row.rolsuper).toBe(false);
      expect(row.rolbypassrls).toBe(false);
      // Owning the tables would let the runtime authentication connection DROP
      // them, and would make every grant assertion above vacuous.
      expect(Number(row.owned)).toBe(0);
    });
  });

  describe('lc_platform and lc_retention', () => {
    it('lc_platform reaches NO authentication material', async () => {
      // The platform role is legitimately cross-tenant, which is exactly why it
      // must not be near this. PO may not read a factor secret either (FR-015).
      const { rows } = await migration.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM information_schema.role_table_grants
          WHERE grantee = 'lc_platform' AND table_name = ANY($1)`,
        [[...MATERIAL_TABLES]],
      );
      expect(Number(rows[0]!.n)).toBe(0);
    });

    it('lc_retention may prune sessions but touches no material', async () => {
      const { rows } = await migration.query<{ table_name: string; privilege_type: string }>(
        `SELECT table_name, privilege_type FROM information_schema.role_table_grants
          WHERE grantee = 'lc_retention' AND table_name = ANY($1)`,
        [[...MATERIAL_TABLES, ...SESSION_TABLES]],
      );
      for (const row of rows) {
        expect(SESSION_TABLES).toContain(row.table_name as (typeof SESSION_TABLES)[number]);
      }
    });
  });
});
