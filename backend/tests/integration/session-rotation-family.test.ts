/**
 * T045 — refresh rotation and family revocation. FR-035, FR-036, SC-019.
 *
 * A rotating refresh token turns a stolen credential into a DETECTABLE event
 * rather than a silent one. The attacker and the legitimate holder cannot both
 * keep using the lineage: whoever presents second presents a token already
 * marked used, and that presentation is the signal.
 *
 * What the system does with the signal is the point. It cannot tell which party
 * is the thief — the token is identical in both hands — so it ends the lineage
 * for both, and says nothing. Announcing the revocation would tell an attacker
 * their theft was noticed; leaving the family alive would make detection
 * pointless.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createUnauthenticatedApp } from '../helpers/real-app';
import { connectAs } from '../helpers/db';
import { seedAuthIdentity, TEST_CREDENTIAL, type SeededAuthIdentity } from '../helpers/auth-seed';
import { generateAt } from '../../src/common/auth/totp';
import { signInOriginThrottle } from '../../src/common/auth/origin-throttle';

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

describe('refresh rotation and family revocation (FR-035, FR-036, SC-019)', () => {
  let app: INestApplication;
  let migration: Client;

  beforeAll(async () => {
    app = await createUnauthenticatedApp();
    migration = await connectAs('migration');
  });

  afterAll(async () => {
    await app.close();
    await migration.end();
  });

  const server = () => app.getHttpServer();

  /**
   * A complete sign-in, both steps, returning the emitted pair.
   *
   * `stepOffset` shifts which 30-second step the code is derived from, and it
   * exists because of FR-020 rather than for convenience: two sign-ins inside one
   * window would otherwise present the SAME code, and the replay guard would
   * correctly refuse the second. A code from the neighbouring step is still
   * inside FR-056's 90-second window — so it verifies — while being a different
   * value, which is the distinction the guard is drawing.
   */
  async function signInFully(identity: SeededAuthIdentity, stepOffset = 0): Promise<Tokens> {
    signInOriginThrottle.reset();
    const credential = await request(server())
      .post('/auth/sign-in')
      .send({ email: identity.email, password: TEST_CREDENTIAL });
    const code = await generateAt(identity.secret, Math.floor(Date.now() / 1000) + stepOffset * 30);
    const factor = await request(server())
      .post('/auth/factor')
      .send({ challengeToken: credential.body.challengeToken, code });
    expect(factor.status).toBe(201);
    return { accessToken: factor.body.accessToken, refreshToken: factor.body.refreshToken };
  }

  const refresh = (refreshToken: string) =>
    request(server()).post('/auth/refresh').send({ refreshToken });

  async function liveSessions(identityId: string): Promise<number> {
    const { rows } = await migration.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM session WHERE identity_id = $1 AND revoked_at IS NULL`,
      [identityId],
    );
    return Number(rows[0]!.n);
  }

  it('rotates: a fresh pair, and the presented token marked used', async () => {
    const identity = await seedAuthIdentity(migration, 'rotate-ok');
    const first = await signInFully(identity);

    const rotated = await refresh(first.refreshToken);
    expect(rotated.status).toBe(201);
    expect(rotated.body.accessToken).toBeTruthy();
    expect(rotated.body.refreshToken).not.toBe(first.refreshToken);
    expect(rotated.body.accessToken).not.toBe(first.accessToken);

    const { rows } = await migration.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM refresh_token WHERE used_at IS NOT NULL AND session_id IN (
         SELECT id FROM session WHERE identity_id = $1)`,
      [identity.identityId],
    );
    expect(Number(rows[0]!.n)).toBeGreaterThanOrEqual(1);
  });

  it('PRESENTING A ROTATED TOKEN TWICE REVOKES THE ENTIRE FAMILY AND ITS SESSIONS', async () => {
    const identity = await seedAuthIdentity(migration, 'rotate-reuse');
    const first = await signInFully(identity);

    // Rotate once — legitimately.
    const rotated = await refresh(first.refreshToken);
    expect(rotated.status).toBe(201);
    expect(await liveSessions(identity.identityId)).toBeGreaterThan(0);

    // Now present the ALREADY-USED token, which is what a thief holding a
    // captured copy would do.
    const reuse = await refresh(first.refreshToken);
    expect(reuse.status).toBe(401);

    // Everything descended from that authentication is dead — including the
    // session the legitimate rotation had just produced.
    expect(await liveSessions(identity.identityId)).toBe(0);

    const { rows } = await migration.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM refresh_token
        WHERE revoked_at IS NULL AND session_id IN (SELECT id FROM session WHERE identity_id = $1)`,
      [identity.identityId],
    );
    expect(Number(rows[0]!.n)).toBe(0);
  });

  it('the revocation is NOT announced — reuse looks like any other refusal', async () => {
    const identity = await seedAuthIdentity(migration, 'rotate-silent');
    const first = await signInFully(identity);
    await refresh(first.refreshToken);

    const reuse = await refresh(first.refreshToken);
    const nonsense = await refresh('a-token-that-was-never-issued');

    expect(reuse.status).toBe(nonsense.status);
    expect(JSON.stringify(reuse.body)).toBe(JSON.stringify(nonsense.body));
  });

  it('the access token issued before the reuse stops working immediately', async () => {
    // Revocation takes effect on the NEXT REQUEST, not the next expiry. That is
    // the property owning our own sessions buys, and the reason the constitution
    // prohibits inferring validity from the token alone.
    const identity = await seedAuthIdentity(migration, 'rotate-access-dead');
    const first = await signInFully(identity);
    const rotated = await refresh(first.refreshToken);
    const liveAccess = rotated.body.accessToken as string;

    const before = await request(server())
      .get('/identity/memberships')
      .set('authorization', `Bearer ${liveAccess}`);
    expect(before.status).toBe(200);

    await refresh(first.refreshToken); // reuse → family revoked

    const after = await request(server())
      .get('/identity/memberships')
      .set('authorization', `Bearer ${liveAccess}`);
    expect(after.status).toBe(401);
  });

  it('TWO SIMULTANEOUS PRESENTATIONS OF THE SAME USED TOKEN DO NOT BOTH SUCCEED (SC-019)', async () => {
    const identity = await seedAuthIdentity(migration, 'rotate-concurrent');
    const first = await signInFully(identity);

    // Both race on the same live token. FOR UPDATE on the whole family is what
    // decides this; without it both readers see an unused row and both rotate,
    // producing two live lineages from one credential.
    const [a, b] = await Promise.all([refresh(first.refreshToken), refresh(first.refreshToken)]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 401]);
  });

  it('one family being revoked does not touch another sign-in by the same person', async () => {
    // Two devices, two authentications, two families. Losing a phone must not
    // sign somebody out of their desk.
    const identity = await seedAuthIdentity(migration, 'rotate-two-families');
    const deviceA = await signInFully(identity);
    // Next step's code: a different value, still inside the window (see above).
    const deviceB = await signInFully(identity, 1);

    await refresh(deviceA.refreshToken);
    await refresh(deviceA.refreshToken); // reuse on A only

    const stillWorks = await refresh(deviceB.refreshToken);
    expect(stillWorks.status).toBe(201);
  });
});
