/**
 * T005 — the database refuses a dishonest outcome, not just the service. 015/FR-001.
 *
 * WHY BOTH LAYERS. `case.service.ts#declareOutcome` refuses an open matter with a readable 400,
 * which is the right experience for a caller. But a KPI is only as trustworthy as its worst
 * writer: a future import script, a fixture, a migration or a well-meant `UPDATE` in a psql
 * session would all bypass the service, and a "favorable" matter that is still open would make
 * every success rate computed from it quietly wrong rather than loudly broken.
 *
 * So the invariant lives in `case_file_outcome_requires_closed`, and this file is what proves the
 * constraint exists rather than that somebody remembered to write it in the migration.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { connectAs } from '../helpers/db';
import { uniqueRfc } from '../helpers/rfc';
import { makeCaseFirm, nextSuffix, uniqueName, type CaseFirm } from '../helpers/case-core';

describe('case_file.outcome is constrained by the database itself', () => {
  let migration: Client;
  let firm: CaseFirm;
  let clientId: string;

  beforeAll(async () => {
    migration = await connectAs('migration');
    firm = await makeCaseFirm(migration, `CC Restriccion ${nextSuffix()}`, uniqueRfc());
    const client = await migration.query<{ id: string }>(
      `INSERT INTO client (tenant_id, kind, legal_name) VALUES ($1, 'organization', $2) RETURNING id`,
      [firm.tenantId, uniqueName('Restringida')],
    );
    clientId = client.rows[0]!.id;
  }, 180_000);

  afterAll(async () => {
    await migration.end();
  });

  async function insertCase(closed: boolean): Promise<string> {
    const { rows } = await migration.query<{ id: string }>(
      `INSERT INTO case_file (tenant_id, client_id, file_number, case_status_id, closed_on)
       VALUES ($1, $2, $3, $4, $5::date) RETURNING id`,
      [
        firm.tenantId,
        clientId,
        `EXP-CON-${nextSuffix()}`,
        closed ? firm.statusClosingId : firm.statusOpenId,
        closed ? '2026-06-30' : null,
      ],
    );
    return rows[0]!.id;
  }

  it('accepts an outcome on a closed matter', async () => {
    const id = await insertCase(true);
    await expect(
      migration.query(`UPDATE case_file SET outcome = 'favorable' WHERE id = $1`, [id]),
    ).resolves.toBeDefined();
  });

  it('REFUSES an outcome on an open matter, even from the superuser connection', async () => {
    const id = await insertCase(false);
    await expect(
      migration.query(`UPDATE case_file SET outcome = 'favorable' WHERE id = $1`, [id]),
    ).rejects.toThrow(/case_file_outcome_requires_closed/);
  });

  it('refuses a value outside the four, because it is an enum', async () => {
    const id = await insertCase(true);
    await expect(
      migration.query(`UPDATE case_file SET outcome = 'ganado' WHERE id = $1`, [id]),
    ).rejects.toThrow();
  });

  it('refuses re-opening a matter that carries an outcome', async () => {
    // The constraint reads in both directions: clearing `closed_on` while an outcome stands
    // would leave an open matter claiming a result.
    const id = await insertCase(true);
    await migration.query(`UPDATE case_file SET outcome = 'convenio' WHERE id = $1`, [id]);
    await expect(
      migration.query(`UPDATE case_file SET closed_on = NULL WHERE id = $1`, [id]),
    ).rejects.toThrow(/case_file_outcome_requires_closed/);
  });

  it('permits clearing the outcome and then re-opening', async () => {
    // The order a real re-opening would take, and the proof the constraint is not a trap.
    const id = await insertCase(true);
    await migration.query(`UPDATE case_file SET outcome = 'convenio' WHERE id = $1`, [id]);
    await migration.query(`UPDATE case_file SET outcome = NULL WHERE id = $1`, [id]);
    await expect(
      migration.query(`UPDATE case_file SET closed_on = NULL WHERE id = $1`, [id]),
    ).resolves.toBeDefined();
  });

  it('leaves every matter closed before this migration undeclared', async () => {
    // FR-002a: no backfill. "Undeclared" is the honest state for a firm's history, and it is
    // what FR-009's floor reads to refuse a rate computed from too little.
    const id = await insertCase(true);
    const { rows } = await migration.query<{ outcome: string | null }>(
      `SELECT outcome FROM case_file WHERE id = $1`,
      [id],
    );
    expect(rows[0]!.outcome).toBeNull();
  });
});
