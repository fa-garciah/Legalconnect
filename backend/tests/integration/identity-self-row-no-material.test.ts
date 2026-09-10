/**
 * T037 — THE REGRESSION THAT MOTIVATED D3. FR-015.
 *
 * `identity` carries a self-row SELECT policy for lc_app, shipped by 002 in
 * 0012_identity.sql:
 *
 *     CREATE POLICY identity_self_row ON identity FOR SELECT TO lc_app
 *       USING (id = NULLIF(current_setting('app.identity_id', true), '')::uuid);
 *
 * That policy is correct, tested, and exactly what 002 needed. It is also the
 * reason authentication material could not be stored as columns on `identity`:
 * a factor secret or a credential digest sitting there would be readable BY ITS
 * OWNER through a correct, already-passing policy. No bug, no missing filter — a
 * well-tested policy quietly returning a column nobody noticed it now covered.
 *
 * D3's answer was separate tables with no lc_app grant at all. This file is the
 * standing proof that the answer held: an identity reading its own row obtains no
 * material, and every path from that row to material is closed.
 *
 * The distinction this file guards is subtle enough to be worth naming. Everywhere
 * else in this product, "you may not see it" is RLS. Here it is a GRANT — and the
 * two fail differently. RLS returns nothing; a missing grant refuses. A future
 * migration that "fixed" the refusal by adding a policy instead of a grant would
 * turn a hard denial into a filtered read, which is a much easier thing to get
 * wrong.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { connectAs } from '../helpers/db';

describe('an identity reading its own row obtains no material (FR-015, D3)', () => {
  let app: Client;
  let migration: Client;
  let identityId: string;

  beforeAll(async () => {
    app = await connectAs('app');
    migration = await connectAs('migration');

    const suffix = `${Date.now()}-${Math.random()}`;
    const { rows } = await migration.query<{ id: string }>(
      `INSERT INTO identity (subject, email, mfa_enrolled_at) VALUES ($1, $2, now()) RETURNING id`,
      [`lc|self-row-${suffix}`, `self-row-${suffix}@example.com`],
    );
    identityId = rows[0]!.id;

    // Give this identity every kind of material, so a leak has something to leak.
    await migration.query(`INSERT INTO identity_credential (identity_id, digest) VALUES ($1, $2)`, [
      identityId,
      '$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHQ$ZGlnZXN0ZGlnZXN0',
    ]);
    await migration.query(
      `INSERT INTO identity_factor (identity_id, secret_ciphertext, key_reference, confirmed_at)
       VALUES ($1, $2, 'local:test', now())`,
      [identityId, Buffer.from('ciphertext-bytes')],
    );
    await migration.query(
      `INSERT INTO backup_code (identity_id, set_id, digest) VALUES ($1, gen_random_uuid(), $2)`,
      [identityId, '$argon2id$v=19$m=8192,t=1,p=1$c2FsdA$Y29kZWRpZ2VzdA'],
    );
  });

  afterAll(async () => {
    await app.end();
    await migration.end();
  });

  /** Runs `fn` with this identity's own self-row context active, as a real request would. */
  async function asSelf<T>(fn: () => Promise<T>): Promise<T> {
    await app.query('BEGIN');
    try {
      await app.query('SELECT set_config($1, $2, true)', ['app.identity_id', identityId]);
      const out = await fn();
      await app.query('COMMIT');
      return out;
    } catch (error) {
      await app.query('ROLLBACK');
      throw error;
    }
  }

  it('CAN read its own identity row — the policy still works, so the tests below mean something', async () => {
    const rows = await asSelf(async () => {
      const result = await app.query<{ id: string; email: string }>('SELECT id, email FROM identity');
      return result.rows;
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(identityId);
  });

  it('that row carries NO credential, NO secret and NO code — every column is checked', async () => {
    // Asserted over the actual column list rather than a remembered one, so a
    // future migration adding `identity.totp_secret` fails here instead of
    // shipping.
    const columns = await asSelf(async () => {
      const result = await app.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'identity'`,
      );
      return result.rows.map((r) => r.column_name);
    });

    for (const column of columns) {
      expect(column).not.toMatch(/secret|credential|digest|ciphertext|backup|password|code/i);
    }
    expect(columns.sort()).toEqual(
      ['created_at', 'email', 'id', 'mfa_enrolled_at', 'subject'].sort(),
    );
  });

  it('CANNOT follow its own row to any material table, even with the right identity active', async () => {
    // The attack this closes: hold a legitimate session, know your own identity
    // id, and join. The refusal is a grant refusal, so it does not depend on the
    // policy being written correctly for these tables — they have none.
    for (const table of ['identity_credential', 'identity_factor', 'backup_code']) {
      await expect(
        asSelf(() => app.query(`SELECT * FROM ${table} WHERE identity_id = '${identityId}'`)),
      ).rejects.toThrow(/permission denied/i);
    }
  });

  it('CANNOT reach material through a join from identity', async () => {
    await expect(
      asSelf(() =>
        app.query(
          `SELECT i.id, c.digest FROM identity i JOIN identity_credential c ON c.identity_id = i.id`,
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('CANNOT reach material through a subquery or EXISTS either', async () => {
    // A join is the obvious shape; a correlated subquery is the one a person
    // reaches for when the join is refused, and it must be refused identically.
    await expect(
      asSelf(() =>
        app.query(
          `SELECT id, (SELECT digest FROM identity_credential c WHERE c.identity_id = identity.id) FROM identity`,
        ),
      ),
    ).rejects.toThrow(/permission denied/i);

    await expect(
      asSelf(() =>
        app.query(
          `SELECT id FROM identity WHERE EXISTS (SELECT 1 FROM identity_factor f WHERE f.identity_id = identity.id)`,
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
