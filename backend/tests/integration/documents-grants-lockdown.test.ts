/**
 * T048 — 007/FR-004, FR-012. The grant audit for this slice's two tables.
 *
 * "Never hard-deleted" is enforced by the ABSENT privilege, not by the absent route. A
 * repository with no `delete` method is a convention; a role with no DELETE grant is a
 * guarantee. This file checks the guarantee.
 *
 * Extends the pattern `case-core-grants-lockdown.test.ts` established for 006's six
 * tables and 017 before it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { connectAs } from '../helpers/db';

const DOCUMENT_TABLES = ['document', 'document_category'] as const;

describe('007 grant lockdown', () => {
  let migration: Client;

  beforeAll(async () => {
    migration = await connectAs('migration');
  });

  afterAll(async () => {
    await migration.end();
  });

  it('0 roles hold DELETE on either table', async () => {
    const { rows } = await migration.query<{ grantee: string; table_name: string }>(
      `SELECT grantee, table_name FROM information_schema.role_table_grants
        WHERE table_name = ANY($1::text[]) AND privilege_type = 'DELETE'
          AND grantee <> 'lc_migration'`,
      [DOCUMENT_TABLES],
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
      [DOCUMENT_TABLES],
    );
    expect(rows).toEqual([]);
  });

  it('lc_app holds exactly SELECT, INSERT and UPDATE on each', async () => {
    for (const table of DOCUMENT_TABLES) {
      const { rows } = await migration.query<{ privilege_type: string }>(
        `SELECT privilege_type FROM information_schema.role_table_grants
          WHERE grantee = 'lc_app' AND table_name = $1
          ORDER BY privilege_type`,
        [table],
      );
      expect(rows.map((r) => r.privilege_type), table).toEqual(['INSERT', 'SELECT', 'UPDATE']);
    }
  });

  it('lc_platform holds INSERT on document_category and NOTHING on document', async () => {
    const { rows: categoryRows } = await migration.query<{ privilege_type: string }>(
      `SELECT privilege_type FROM information_schema.role_table_grants
        WHERE grantee = 'lc_platform' AND table_name = 'document_category'`,
    );
    // INSERT and nothing else: provisioning seeds the default catalog and can never read
    // it back, edit it or remove it. 0022/0024's discipline, restated once more.
    expect(categoryRows.map((r) => r.privilege_type)).toEqual(['INSERT']);

    const { rows: documentRows } = await migration.query(
      `SELECT 1 FROM information_schema.role_table_grants
        WHERE grantee = 'lc_platform' AND table_name = 'document'`,
    );
    // Whichever documents a firm files is entirely its own — the same line 0022 drew
    // between `position` and `directory_entry`.
    expect(documentRows.length).toBe(0);
  });

  it('every one of the two forces RLS, so even the owner is subject to policy', async () => {
    const { rows } = await migration.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `SELECT relname, relrowsecurity, relforcerowsecurity
         FROM pg_class WHERE relname = ANY($1::text[])`,
      [DOCUMENT_TABLES],
    );

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.relrowsecurity, `${row.relname} ENABLE`).toBe(true);
      // FORCE matters as much as ENABLE: without it PostgreSQL silently exempts the table
      // owner, and every policy would be written and unenforced for that role.
      expect(row.relforcerowsecurity, `${row.relname} FORCE`).toBe(true);
    }
  });

  it('document.tenant_id always matches its case\'s tenant', async () => {
    // Mirrors case-core-grants-lockdown.test.ts's case_assignment check: a document has
    // no scope resolver of its own (spec.md, "A Document's Scope Is Its Case's Scope"),
    // so the tenant_id it carries must never drift from the case it references.
    const { rows } = await migration.query<{ n: string }>(
      `SELECT count(*)::text AS n
         FROM document d JOIN case_file c ON c.id = d.case_id
        WHERE d.tenant_id <> c.tenant_id`,
    );
    expect(rows[0]!.n).toBe('0');
  });

  it('FR — document and document_category ids are uuids, not a sequence', async () => {
    const { rows } = await migration.query<{ table_name: string; data_type: string; column_default: string | null }>(
      `SELECT table_name, data_type, column_default
         FROM information_schema.columns
        WHERE table_name = ANY($1::text[]) AND column_name = 'id'
        ORDER BY table_name`,
      [DOCUMENT_TABLES],
    );

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.data_type, row.table_name).toBe('uuid');
      expect(row.column_default ?? '', row.table_name).toContain('gen_random_uuid');
    }
  });
});
