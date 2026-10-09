/**
 * 009 T007 — the database refuses a malformed time entry, not just the service (data-model.md).
 *
 * Time entries are the record a firm may one day bill on. A future import script, a fixture or a
 * well-meant `UPDATE` in a psql session would bypass every check in `time-entry-input.ts`, so each
 * shape rule lives in a CHECK, and this file proves the constraint exists rather than that somebody
 * remembered to write it. Run on the MIGRATION connection on purpose: even the owner is refused.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { connectAs } from '../helpers/db';
import { uniqueRfc } from '../helpers/rfc';
import { makeCaseFirm, nextSuffix, uniqueName, type CaseFirm } from '../helpers/case-core';

describe('time_entry is constrained by the database itself (009)', () => {
  let migration: Client;
  let firm: CaseFirm;
  let caseId: string;

  beforeAll(async () => {
    migration = await connectAs('migration');
    firm = await makeCaseFirm(migration, `CC Horas Restriccion ${nextSuffix()}`, uniqueRfc());
    const client = await migration.query<{ id: string }>(
      `INSERT INTO client (tenant_id, kind, legal_name) VALUES ($1, 'organization', $2) RETURNING id`,
      [firm.tenantId, uniqueName('Horas')],
    );
    const created = await migration.query<{ id: string }>(
      `INSERT INTO case_file (tenant_id, client_id, file_number, case_status_id)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [firm.tenantId, client.rows[0]!.id, `EXP-HRS-${nextSuffix()}`, firm.statusOpenId],
    );
    caseId = created.rows[0]!.id;
  }, 180_000);

  afterAll(async () => {
    await migration.end();
  });

  /** A well-formed manual, logged entry; each test breaks exactly one thing. */
  const manual = (overrides: Record<string, string> = {}) => {
    const columns: Record<string, string> = {
      tenant_id: `'${firm.tenantId}'`,
      case_id: `'${caseId}'`,
      membership_id: `'${firm.aa.membershipId}'`,
      source: `'manual'`,
      status: `'logged'`,
      work_date: `'2026-10-07'`,
      minutes: '90',
      description: `'Llamada con el cliente'`,
      logged_at: 'now()',
      ...overrides,
    };
    const names = Object.keys(columns);
    return migration.query(`INSERT INTO time_entry (${names.join(', ')}) VALUES (${names.map((n) => columns[n]).join(', ')})`);
  };

  const timer = (membershipId: string, overrides: Record<string, string> = {}) =>
    manual({
      membership_id: `'${membershipId}'`,
      source: `'timer'`,
      status: `'running'`,
      minutes: 'NULL',
      description: 'NULL',
      logged_at: 'NULL',
      started_at: 'now()',
      ...overrides,
    });

  it('accepts a well-formed manual entry and a running timer', async () => {
    await expect(manual()).resolves.toBeDefined();
    await expect(timer(firm.pl.membershipId)).resolves.toBeDefined();
  });

  it.each([
    ['zero minutes', { minutes: '0' }, /time_entry_minutes_bounds/],
    ['more than a day', { minutes: '1441' }, /time_entry_minutes_bounds/],
    ['an empty description', { description: `''` }, /time_entry_description_bounds/],
    ['a description over 1000 characters', { description: `repeat('x', 1001)` }, /time_entry_description_bounds/],
    ['a manual entry with a start instant', { started_at: 'now()' }, /time_entry_source_shape/],
    ['a logged entry with no minutes', { minutes: 'NULL' }, /time_entry_status_shape/],
    ['a logged entry with no description', { description: 'NULL' }, /time_entry_status_shape/],
    ['a logged entry with no logged_at', { logged_at: 'NULL' }, /time_entry_status_shape/],
    ['a voided entry with no voided_at', { status: `'voided'` }, /time_entry_status_shape/],
    ['a running manual entry', { status: `'running'`, minutes: 'NULL', description: 'NULL', logged_at: 'NULL' }, /time_entry_(status|source)_shape/],
  ])('refuses %s', async (_label, overrides, constraint) => {
    await expect(manual(overrides)).rejects.toThrow(constraint);
  });

  it('refuses a timer stopped before it started', async () => {
    await expect(
      timer(firm.cm.membershipId, {
        status: `'logged'`,
        minutes: '5',
        description: `'x'`,
        logged_at: 'now()',
        started_at: `now()`,
        stopped_at: `now() - interval '1 hour'`,
      }),
    ).rejects.toThrow(/time_entry_stop_after_start/);
  });

  it('refuses a second running timer for the same person (FR-006)', async () => {
    await timer(firm.mp.membershipId);
    await expect(timer(firm.mp.membershipId)).rejects.toThrow(/time_entry_one_running_timer/);
  });

  it('a person may have a running timer and any number of voided ones', async () => {
    await timer(firm.sa.membershipId, { status: `'voided'`, voided_at: 'now()' });
    await timer(firm.sa.membershipId, { status: `'voided'`, voided_at: 'now()' });
    await expect(timer(firm.sa.membershipId)).resolves.toBeDefined();
  });

  it('lc_app may select, insert and update, and may NOT delete (FR-012)', async () => {
    const { rows } = await migration.query<Record<string, boolean>>(
      `SELECT has_table_privilege('lc_app', 'time_entry', 'SELECT') AS s,
              has_table_privilege('lc_app', 'time_entry', 'INSERT') AS i,
              has_table_privilege('lc_app', 'time_entry', 'UPDATE') AS u,
              has_table_privilege('lc_app', 'time_entry', 'DELETE') AS d`,
    );
    expect(rows[0]).toEqual({ s: true, i: true, u: true, d: false });
  });

  it('row-level security is enabled AND forced', async () => {
    const { rows } = await migration.query<{ enabled: boolean; forced: boolean }>(
      `SELECT relrowsecurity AS enabled, relforcerowsecurity AS forced FROM pg_class WHERE relname = 'time_entry'`,
    );
    expect(rows[0]).toEqual({ enabled: true, forced: true });
  });
});
