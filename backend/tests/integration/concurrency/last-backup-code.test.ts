/**
 * T083 — two recoveries racing on the LAST unconsumed code. research.md D11.
 *
 * The last code is the interesting one because the loser has nowhere to go.
 * With nine remaining, a lost race costs a retry; with one, a double-consume
 * would mean either two recoveries from one code — a person and a thief both
 * getting in — or a code marked spent twice and nobody getting in at all.
 *
 * `consume_backup_code()` takes FOR UPDATE on the candidate row, so the second
 * caller blocks, re-reads, and finds `consumed_at` already set.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { connectAs } from '../../helpers/db';
import { seedAuthIdentity } from '../../helpers/auth-seed';
import { hashBackupCodes, generateBackupCodeSet } from '../../../src/modules/auth/backup-codes';

describe('the last backup code, under concurrency (D11)', () => {
  let migration: Client;

  beforeAll(async () => {
    migration = await connectAs('migration');
  });

  afterAll(async () => {
    await migration.end();
  });

  /** One identity holding exactly ONE unconsumed code. */
  async function withOneCodeLeft(label: string): Promise<{ identityId: string; codeId: string }> {
    const identity = await seedAuthIdentity(migration, label);
    const [code] = generateBackupCodeSet(1);
    const [digest] = await hashBackupCodes([code!]);
    const { rows } = await migration.query<{ id: string }>(
      `INSERT INTO backup_code (identity_id, set_id, digest)
       VALUES ($1, gen_random_uuid(), $2) RETURNING id`,
      [identity.identityId, digest],
    );
    return { identityId: identity.identityId, codeId: rows[0]!.id };
  }

  it('TWO SIMULTANEOUS CONSUMPTIONS YIELD EXACTLY ONE SUCCESS', async () => {
    const { identityId, codeId } = await withOneCodeLeft('last-code-race');

    // Two independent connections, so this is a real database race rather than
    // two statements queued on one client.
    const a = await connectAs('auth');
    const b = await connectAs('auth');
    try {
      const [first, second] = await Promise.all([
        a.query<{ consume_backup_code: boolean }>(
          `SELECT consume_backup_code($1, $2) AS consume_backup_code`,
          [identityId, codeId],
        ),
        b.query<{ consume_backup_code: boolean }>(
          `SELECT consume_backup_code($1, $2) AS consume_backup_code`,
          [identityId, codeId],
        ),
      ]);

      const wins = [first, second].filter((r) => r.rows[0]!.consume_backup_code);
      expect(wins).toHaveLength(1);
    } finally {
      await a.end();
      await b.end();
    }
  });

  it('and EXACTLY ONE consumption is recorded', async () => {
    // The other half. Two successes would be the obvious bug; one success with
    // the row left unconsumed would be the subtle one, and equally fatal —
    // the code would still work afterwards.
    const { identityId, codeId } = await withOneCodeLeft('last-code-recorded');

    const a = await connectAs('auth');
    const b = await connectAs('auth');
    try {
      await Promise.all([
        a.query(`SELECT consume_backup_code($1, $2)`, [identityId, codeId]),
        b.query(`SELECT consume_backup_code($1, $2)`, [identityId, codeId]),
      ]);
    } finally {
      await a.end();
      await b.end();
    }

    const { rows } = await migration.query<{ spent: string; left: string }>(
      `SELECT count(*) FILTER (WHERE consumed_at IS NOT NULL)::text AS spent,
              count(*) FILTER (WHERE consumed_at IS NULL)::text     AS left
         FROM backup_code WHERE identity_id = $1`,
      [identityId],
    );
    expect(rows[0]).toEqual({ spent: '1', left: '0' });
  });

  it('ten concurrent attempts on one code still yield exactly one success', async () => {
    // Scaled up, because a two-way race can pass by luck on a lock that is
    // only nearly right.
    const { identityId, codeId } = await withOneCodeLeft('last-code-stampede');
    const clients = await Promise.all(Array.from({ length: 10 }, () => connectAs('auth')));
    try {
      const results = await Promise.all(
        clients.map((client) =>
          client.query<{ consume_backup_code: boolean }>(
            `SELECT consume_backup_code($1, $2) AS consume_backup_code`,
            [identityId, codeId],
          ),
        ),
      );
      expect(results.filter((r) => r.rows[0]!.consume_backup_code)).toHaveLength(1);
    } finally {
      await Promise.all(clients.map((client) => client.end()));
    }
  });
});
