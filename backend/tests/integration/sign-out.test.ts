/**
 * T019-T021 — sign-out kills the whole family, leaves other devices untouched,
 * and is audited exactly once. SC-001, FR-003 to FR-006, User Story 1.
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

describe('sign-out (SC-001, FR-003..FR-006, US1)', () => {
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

  const signOut = (accessToken: string) =>
    request(server()).post('/auth/sign-out').set('authorization', `Bearer ${accessToken}`).send();

  it('the presented access token is refused on the next request (US1 scenario 1)', async () => {
    const identity = await seedAuthIdentity(migration, 'signout-next-req');
    const tokens = await signInFully(identity);

    const out = await signOut(tokens.accessToken);
    expect(out.status).toBe(200);

    const after = await request(server())
      .get('/identity/memberships')
      .set('authorization', `Bearer ${tokens.accessToken}`);
    expect(after.status).toBe(401);
  });

  it('POST /auth/refresh against a token from the signed-out family is refused (US1 scenario 2)', async () => {
    const identity = await seedAuthIdentity(migration, 'signout-refresh-dead');
    const tokens = await signInFully(identity);

    await signOut(tokens.accessToken);

    const refreshed = await request(server()).post('/auth/refresh').send({ refreshToken: tokens.refreshToken });
    expect(refreshed.status).toBe(401);
  });

  it('every session/refresh_token row sharing the family is revoked (FR-003, US1 scenario 3)', async () => {
    const identity = await seedAuthIdentity(migration, 'signout-whole-family');
    const first = await signInFully(identity);
    // Rotate once so the family has more than one session row.
    const rotated = await request(server()).post('/auth/refresh').send({ refreshToken: first.refreshToken });
    expect(rotated.status).toBe(201);

    await signOut(rotated.body.accessToken);

    const { rows } = await migration.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM session WHERE identity_id = $1 AND revoked_at IS NULL`,
      [identity.identityId],
    );
    expect(Number(rows[0]!.n)).toBe(0);

    const rtRows = await migration.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM refresh_token rt
        JOIN session s ON s.id = rt.session_id
       WHERE s.identity_id = $1 AND rt.revoked_at IS NULL`,
      [identity.identityId],
    );
    expect(Number(rtRows.rows[0]!.n)).toBe(0);
  });

  it('a second, independent family (a different device) for the same identity is untouched (FR-004, US1 scenario 6)', async () => {
    const identity = await seedAuthIdentity(migration, 'signout-other-device');
    const deviceA = await signInFully(identity, 0);
    const deviceB = await signInFully(identity, 1);

    await signOut(deviceA.accessToken);

    const stillWorks = await request(server())
      .get('/identity/memberships')
      .set('authorization', `Bearer ${deviceB.accessToken}`);
    expect(stillWorks.status).toBe(200);
  });

  it('exactly one session.signed_out audit entry per completed call; a second call adds none (FR-006, SC-008, US1 scenario 5)', async () => {
    const identity = await seedAuthIdentity(migration, 'signout-audit-once');
    const tokens = await signInFully(identity);

    const first = await signOut(tokens.accessToken);
    expect(first.status).toBe(200);
    const second = await signOut(tokens.accessToken);
    expect(second.status).toBe(200);

    const { rows } = await migration.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM audit_event
        WHERE action = 'session.signed_out' AND actor_identity_id = $1`,
      [identity.identityId],
    );
    expect(Number(rows[0]!.n)).toBe(1);
  });
});
