/**
 * 008 T006 — the database refuses a malformed note, and refuses a note that is anything but
 * internal, whoever writes it (data-model.md). Run on the MIGRATION connection: even the owner is
 * refused. The `internal`-only CHECK is Decision 1 made physical — widening it is a migration and a
 * counsel decision, never a default someone flips.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { connectAs } from '../helpers/db';
import { uniqueRfc } from '../helpers/rfc';
import { makeCaseFirm, nextSuffix, uniqueName, type CaseFirm } from '../helpers/case-core';

describe('case_note is constrained by the database itself (008)', () => {
  let migration: Client;
  let firm: CaseFirm;
  let caseId: string;

  beforeAll(async () => {
    migration = await connectAs('migration');
    firm = await makeCaseFirm(migration, `CC Notas Restriccion ${nextSuffix()}`, uniqueRfc());
    const client = await migration.query<{ id: string }>(
      `INSERT INTO client (tenant_id, kind, legal_name) VALUES ($1, 'organization', $2) RETURNING id`,
      [firm.tenantId, uniqueName('Notas')],
    );
    const created = await migration.query<{ id: string }>(
      `INSERT INTO case_file (tenant_id, client_id, file_number, case_status_id) VALUES ($1, $2, $3, $4) RETURNING id`,
      [firm.tenantId, client.rows[0]!.id, `EXP-NOT-${nextSuffix()}`, firm.statusOpenId],
    );
    caseId = created.rows[0]!.id;
  }, 180_000);

  afterAll(async () => {
    await migration.end();
  });

  const note = (overrides: Record<string, string> = {}) => {
    const columns: Record<string, string> = {
      tenant_id: `'${firm.tenantId}'`,
      case_id: `'${caseId}'`,
      author_membership_id: `'${firm.aa.membershipId}'`,
      body: `'Audiencia diferida'`,
      ...overrides,
    };
    const names = Object.keys(columns);
    return migration.query(`INSERT INTO case_note (${names.join(', ')}) VALUES (${names.map((n) => columns[n]).join(', ')})`);
  };

  it('accepts a well-formed note, internal and active by default', async () => {
    const { rows } = await migration.query<{ visibility: string; status: string }>(
      `INSERT INTO case_note (tenant_id, case_id, author_membership_id, body) VALUES ($1, $2, $3, 'x') RETURNING visibility, status`,
      [firm.tenantId, caseId, firm.aa.membershipId],
    );
    expect(rows[0]).toEqual({ visibility: 'internal', status: 'active' });
  });

  it('refuses an empty body and one over 5000 characters', async () => {
    await expect(note({ body: `''` })).rejects.toThrow(/case_note_body_bounds/);
    await expect(note({ body: `repeat('x', 5001)` })).rejects.toThrow(/case_note_body_bounds/);
  });

  it('refuses any visibility but internal (Decision 1)', async () => {
    await expect(note({ visibility: `'client'` })).rejects.toThrow();
  });

  it('a voided note has voided_at, and only a voided one does', async () => {
    await expect(note({ status: `'voided'` })).rejects.toThrow(/case_note_voided_consistent/);
    await expect(note({ voided_at: 'now()' })).rejects.toThrow(/case_note_voided_consistent/);
    await expect(note({ status: `'voided'`, voided_at: 'now()' })).resolves.toBeDefined();
  });

  it('lc_app may select, insert, update — and NOT delete', async () => {
    const { rows } = await migration.query<Record<string, boolean>>(
      `SELECT has_table_privilege('lc_app', 'case_note', 'SELECT') AS s,
              has_table_privilege('lc_app', 'case_note', 'INSERT') AS i,
              has_table_privilege('lc_app', 'case_note', 'UPDATE') AS u,
              has_table_privilege('lc_app', 'case_note', 'DELETE') AS d`,
    );
    expect(rows[0]).toEqual({ s: true, i: true, u: true, d: false });
  });

  it('row-level security is enabled AND forced', async () => {
    const { rows } = await migration.query<{ enabled: boolean; forced: boolean }>(
      `SELECT relrowsecurity AS enabled, relforcerowsecurity AS forced FROM pg_class WHERE relname = 'case_note'`,
    );
    expect(rows[0]).toEqual({ enabled: true, forced: true });
  });
});
