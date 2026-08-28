/**
 * T055 — 006/FR-003, FR-012, FR-019. The grant audit for this slice's six tables.
 *
 * "Never hard-deleted" is enforced by the ABSENT privilege, not by the absent route. A
 * repository with no `delete` method is a convention; a role with no DELETE grant is a
 * guarantee. This file checks the guarantee.
 *
 * Extends the pattern `grants-lockdown.test.ts` established for 001/002's tables and 017
 * repeated for its own two.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { connectAs } from '../helpers/db';

const CASE_CORE_TABLES = [
  'client',
  'case_file',
  'case_assignment',
  'case_status',
  'matter_type',
  'venue',
] as const;

describe('006 grant lockdown', () => {
  let migration: Client;

  beforeAll(async () => {
    migration = await connectAs('migration');
  });

  afterAll(async () => {
    await migration.end();
  });

  it('0 roles hold DELETE on any of the six tables', async () => {
    const { rows } = await migration.query<{ grantee: string; table_name: string }>(
      `SELECT grantee, table_name FROM information_schema.role_table_grants
        WHERE table_name = ANY($1::text[]) AND privilege_type = 'DELETE'
          AND grantee <> 'lc_migration'`,
      [CASE_CORE_TABLES],
    );

    // `lc_migration` owns the tables and is excluded: it is the DDL role and never serves a
    // request. Every role the application actually connects as must hold nothing.
    expect(rows).toEqual([]);
  });

  it('0 roles hold TRUNCATE — the other way to erase history', async () => {
    const { rows } = await migration.query<{ grantee: string; table_name: string }>(
      `SELECT grantee, table_name FROM information_schema.role_table_grants
        WHERE table_name = ANY($1::text[]) AND privilege_type = 'TRUNCATE'
          AND grantee <> 'lc_migration'`,
      [CASE_CORE_TABLES],
    );
    expect(rows).toEqual([]);
  });

  it('lc_app holds exactly SELECT, INSERT and UPDATE on each', async () => {
    for (const table of CASE_CORE_TABLES) {
      const { rows } = await migration.query<{ privilege_type: string }>(
        `SELECT privilege_type FROM information_schema.role_table_grants
          WHERE grantee = 'lc_app' AND table_name = $1
          ORDER BY privilege_type`,
        [table],
      );
      expect(rows.map((r) => r.privilege_type), table).toEqual(['INSERT', 'SELECT', 'UPDATE']);
    }
  });

  it('lc_platform holds INSERT on the three catalogs and NOTHING on the three domain tables', async () => {
    for (const table of ['case_status', 'matter_type', 'venue'] as const) {
      const { rows } = await migration.query<{ privilege_type: string }>(
        `SELECT privilege_type FROM information_schema.role_table_grants
          WHERE grantee = 'lc_platform' AND table_name = $1`,
        [table],
      );
      // INSERT and nothing else: provisioning brings a vocabulary into existence and can
      // never read it back, edit it or remove it. 0022's discipline, restated three times.
      expect(rows.map((r) => r.privilege_type), table).toEqual(['INSERT']);
    }

    for (const table of ['client', 'case_file', 'case_assignment'] as const) {
      const { rows } = await migration.query(
        `SELECT 1 FROM information_schema.role_table_grants
          WHERE grantee = 'lc_platform' AND table_name = $1`,
        [table],
      );
      // Registering a firm's clients and opening its matters is the firm's own act. The
      // same line 0022 drew between `position` and `directory_entry`.
      expect(rows.length, table).toBe(0);
    }
  });

  it('every one of the six forces RLS, so even the owner is subject to policy', async () => {
    const { rows } = await migration.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `SELECT relname, relrowsecurity, relforcerowsecurity
         FROM pg_class WHERE relname = ANY($1::text[])`,
      [CASE_CORE_TABLES],
    );

    expect(rows).toHaveLength(6);
    for (const row of rows) {
      expect(row.relrowsecurity, `${row.relname} ENABLE`).toBe(true);
      // FORCE matters as much as ENABLE: without it PostgreSQL silently exempts the table
      // owner, and every policy would be written and unenforced for that role.
      expect(row.relforcerowsecurity, `${row.relname} FORCE`).toBe(true);
    }
  });

  it('case_assignment.tenant_id always matches its case\'s tenant', async () => {
    // The invariant that justifies denormalising the column at all (data-model.md). It is
    // written from the session setting rather than the request, so it cannot drift — but
    // "cannot drift" is a claim about code, and this asserts it about data.
    const { rows } = await migration.query<{ n: string }>(
      `SELECT count(*)::text AS n
         FROM case_assignment a JOIN case_file c ON c.id = a.case_id
        WHERE a.tenant_id <> c.tenant_id`,
    );
    expect(rows[0]!.n).toBe('0');
  });

  it('FR-018 — client and case ids are uuids, not a sequence', async () => {
    // A guessable identifier would defeat FR-016's opacity regardless of what the refusal
    // discloses: an attacker who can enumerate ids does not need the response to tell them
    // a matter exists.
    const { rows } = await migration.query<{ table_name: string; data_type: string; column_default: string | null }>(
      `SELECT table_name, data_type, column_default
         FROM information_schema.columns
        WHERE table_name = ANY($1::text[]) AND column_name = 'id'
        ORDER BY table_name`,
      [CASE_CORE_TABLES],
    );

    expect(rows).toHaveLength(6);
    for (const row of rows) {
      expect(row.data_type, row.table_name).toBe('uuid');
      expect(row.column_default ?? '', row.table_name).toContain('gen_random_uuid');
    }
  });
});
