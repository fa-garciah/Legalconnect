/**
 * T011 — `resolve_session()`'s widened return and `touch_session()`. data-model.md,
 * research.md D2.
 *
 * Migrations are TDD-exempt (constitution exemption 1); this is the test that
 * verifies what 0040 built rather than preceding it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { connectAs } from '../helpers/db';
import { seedAuthIdentity } from '../helpers/auth-seed';

describe('resolve_session() widened return + touch_session() (D2)', () => {
  let migration: Client;
  let auth: Client;
  let app: Client;

  beforeAll(async () => {
    migration = await connectAs('migration');
    auth = await connectAs('auth');
    app = await connectAs('app');
  });

  afterAll(async () => {
    await migration.end();
    await auth.end();
    await app.end();
  });

  async function mintLiveSession(): Promise<{ sessionId: string; digest: string; identityId: string }> {
    const identity = await seedAuthIdentity(migration, 'fn-test', { factor: false });
    const digest = `digest-${identity.identityId}-${Date.now()}`;
    const { rows } = await migration.query<{ id: string }>(
      `INSERT INTO session (identity_id, access_digest, expires_at) VALUES ($1, $2, now() + interval '15 minutes') RETURNING id`,
      [identity.identityId, digest],
    );
    return { sessionId: rows[0]!.id, digest, identityId: identity.identityId };
  }

  it('resolve_session() returns id, last_seen_at and family_created_at for a live session', async () => {
    const { sessionId, digest } = await mintLiveSession();
    const { rows } = await app.query(`SELECT * FROM resolve_session($1)`, [digest]);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(sessionId);
    expect(rows[0].last_seen_at).toBeTruthy();
    expect(rows[0].family_created_at).toBeTruthy();
  });

  it('touch_session() updates last_seen_at on a live session', async () => {
    const { sessionId } = await mintLiveSession();
    await migration.query(`UPDATE session SET last_seen_at = now() - interval '1 hour' WHERE id = $1`, [
      sessionId,
    ]);
    const before = await migration.query<{ last_seen_at: Date }>(
      `SELECT last_seen_at FROM session WHERE id = $1`,
      [sessionId],
    );

    await app.query(`SELECT touch_session($1)`, [sessionId]);

    const after = await migration.query<{ last_seen_at: Date }>(
      `SELECT last_seen_at FROM session WHERE id = $1`,
      [sessionId],
    );
    expect(new Date(after.rows[0]!.last_seen_at).getTime()).toBeGreaterThan(
      new Date(before.rows[0]!.last_seen_at).getTime(),
    );
  });

  it('touch_session() is a no-op against a revoked session', async () => {
    const { sessionId } = await mintLiveSession();
    await migration.query(`UPDATE session SET revoked_at = now() WHERE id = $1`, [sessionId]);
    const before = await migration.query<{ last_seen_at: Date }>(
      `SELECT last_seen_at FROM session WHERE id = $1`,
      [sessionId],
    );

    await app.query(`SELECT touch_session($1)`, [sessionId]);

    const after = await migration.query<{ last_seen_at: Date }>(
      `SELECT last_seen_at FROM session WHERE id = $1`,
      [sessionId],
    );
    expect(new Date(after.rows[0]!.last_seen_at).getTime()).toBe(
      new Date(before.rows[0]!.last_seen_at).getTime(),
    );
  });

  describe('grants', () => {
    it('lc_app holds EXECUTE on touch_session()', async () => {
      const { sessionId } = await mintLiveSession();
      await expect(app.query(`SELECT touch_session($1)`, [sessionId])).resolves.toBeDefined();
    });

    it('lc_app is DENIED EXECUTE on sign_out() — permission denied, not an empty result', async () => {
      const { sessionId } = await mintLiveSession();
      await expect(app.query(`SELECT sign_out($1)`, [sessionId])).rejects.toThrow(/permission denied/i);
    });

    it('lc_auth holds EXECUTE on sign_out()', async () => {
      const { sessionId } = await mintLiveSession();
      await expect(auth.query(`SELECT sign_out($1)`, [sessionId])).resolves.toBeDefined();
    });
  });
});
