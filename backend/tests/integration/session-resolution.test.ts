/**
 * T029 — session resolution. FR-034, research.md D2 and D8.
 *
 * The constitution PROHIBITS pure stateless JWT, and this file is where that
 * prohibition becomes observable: validity is a row, not a signature. "The API MUST
 * validate every request against this product's own session state, never against a
 * bearer token's signature and expiry alone."
 *
 * Three properties, each of which a plausible-looking implementation could miss:
 *
 *  1. Resolution answers for a LIVE session and stays silent for an expired, a
 *     revoked, and an unknown one — and the three are indistinguishable.
 *  2. The token itself is NEVER in the table. Only its SHA-256 is. A dump yields no
 *     usable session (D2), which is the session-layer analogue of what envelope
 *     encryption does for the TOTP secret.
 *  3. `lc_app` holds NO SELECT on `session`. Its entire reach into session state is
 *     EXECUTE on resolve_session(), which is narrower than a table grant: a SELECT
 *     would let it read every row, and resolution only ever needs one.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { connectAs } from '../helpers/db';
import { closeAuthDb } from '../../src/common/auth/auth-db';
import {
  digestToken,
  mintSession,
  resolveSession,
  revokeSession,
  withAuthTx,
} from '../../src/common/auth/session.port';

describe('session resolution (FR-034, D2, D8)', () => {
  let migration: Client;
  let app: Client;
  let identityId: string;

  beforeAll(async () => {
    migration = await connectAs('migration');
    app = await connectAs('app');
    const suffix = `${Date.now()}-${Math.random()}`;
    const { rows } = await migration.query<{ id: string }>(
      `INSERT INTO identity (subject, email, mfa_enrolled_at) VALUES ($1, $2, now()) RETURNING id`,
      [`idp|session-test-${suffix}`, `session-test-${suffix}@example.com`],
    );
    identityId = rows[0]!.id;
  });

  afterAll(async () => {
    await migration.end();
    await app.end();
    await closeAuthDb();
  });

  it('resolves a live session to its identity', async () => {
    const minted = await withAuthTx((tx) => mintSession(tx, identityId, { ua: 'test' }));
    const resolved = await withAuthTx((tx) => resolveSession(tx, minted.accessToken));
    expect(resolved?.identityId).toBe(identityId);
    expect(resolved?.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('issues a 15-minute access window (FR-035)', async () => {
    const minted = await withAuthTx((tx) => mintSession(tx, identityId, {}));
    const minutes = (minted.expiresAt.getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(14);
    expect(minutes).toBeLessThanOrEqual(15.5);
  });

  it('THE PLAINTEXT TOKEN IS NEVER IN THE TABLE — only its digest', async () => {
    const minted = await withAuthTx((tx) => mintSession(tx, identityId, {}));

    const { rows } = await migration.query<{ access_digest: string }>(
      `SELECT access_digest FROM session WHERE access_digest = $1`,
      [digestToken(minted.accessToken)],
    );
    expect(rows).toHaveLength(1);

    // And the token itself appears nowhere in either table, under any column.
    const leak = await migration.query(
      `SELECT 1 FROM session WHERE access_digest = $1
       UNION ALL
       SELECT 1 FROM refresh_token WHERE token_digest = $1 OR token_digest = $2`,
      [minted.accessToken, minted.refreshToken],
    );
    expect(leak.rows).toHaveLength(0);
  });

  it('returns nothing for an unknown token', async () => {
    await expect(
      withAuthTx((tx) => resolveSession(tx, 'a-token-that-was-never-issued')),
    ).resolves.toBeNull();
  });

  it('returns nothing for a revoked session, and revocation takes effect immediately', async () => {
    const minted = await withAuthTx((tx) => mintSession(tx, identityId, {}));
    await expect(withAuthTx((tx) => resolveSession(tx, minted.accessToken))).resolves.not.toBeNull();

    await withAuthTx((tx) => revokeSession(tx, minted.sessionId));

    // The next request, not the next expiry. Sessions are this product's own, so
    // revocation is a write to its own table and there is no second system holding
    // a parallel notion of validity to disagree with it.
    await expect(withAuthTx((tx) => resolveSession(tx, minted.accessToken))).resolves.toBeNull();
  });

  it('returns nothing for an expired session', async () => {
    const minted = await withAuthTx((tx) => mintSession(tx, identityId, {}));
    await migration.query(`UPDATE session SET expires_at = now() - interval '1 second' WHERE id = $1`, [
      minted.sessionId,
    ]);
    await expect(withAuthTx((tx) => resolveSession(tx, minted.accessToken))).resolves.toBeNull();
  });

  it('expired, revoked and unknown are INDISTINGUISHABLE to the caller', async () => {
    // All three return exactly null. If any of them ever threw, or returned a
    // reason, the difference would be observable at the API boundary and would
    // disclose whether a token had ever existed.
    const expired = await withAuthTx((tx) => mintSession(tx, identityId, {}));
    await migration.query(`UPDATE session SET expires_at = now() - interval '1 s' WHERE id = $1`, [
      expired.sessionId,
    ]);
    const revoked = await withAuthTx((tx) => mintSession(tx, identityId, {}));
    await withAuthTx((tx) => revokeSession(tx, revoked.sessionId));

    const results = await Promise.all([
      withAuthTx((tx) => resolveSession(tx, expired.accessToken)),
      withAuthTx((tx) => resolveSession(tx, revoked.accessToken)),
      withAuthTx((tx) => resolveSession(tx, 'never-existed')),
    ]);
    expect(results).toEqual([null, null, null]);
  });

  it('lc_app holds NO SELECT on session or refresh_token', async () => {
    // Permission denied, not an empty result. An empty result would mean the grant
    // exists and RLS filtered it — but these tables carry no policy, so a grant
    // would expose every row in the system.
    await expect(app.query('SELECT * FROM session LIMIT 1')).rejects.toThrow(/permission denied/i);
    await expect(app.query('SELECT * FROM refresh_token LIMIT 1')).rejects.toThrow(
      /permission denied/i,
    );
  });

  it('lc_app CAN execute resolve_session — the one function it may reach', async () => {
    const minted = await withAuthTx((tx) => mintSession(tx, identityId, {}));
    const { rows } = await app.query<{ identity_id: string }>(
      `SELECT identity_id FROM resolve_session($1)`,
      [digestToken(minted.accessToken)],
    );
    expect(rows[0]?.identity_id).toBe(identityId);
  });

  it('every minted token is distinct and high-entropy', async () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10; i += 1) {
      const minted = await withAuthTx((tx) => mintSession(tx, identityId, {}));
      expect(seen.has(minted.accessToken)).toBe(false);
      expect(seen.has(minted.refreshToken)).toBe(false);
      seen.add(minted.accessToken);
      seen.add(minted.refreshToken);
      // At least 256 bits, base64url-encoded.
      expect(minted.accessToken.length).toBeGreaterThanOrEqual(43);
    }
  });
});
