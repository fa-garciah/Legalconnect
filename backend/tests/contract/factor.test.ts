/**
 * T043 — contract for `POST /auth/factor`. FR-033, FR-035, FR-037.
 *
 * The step that emits the session, and the three things its response must and
 * must not contain.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createUnauthenticatedApp } from '../helpers/real-app';
import { connectAs } from '../helpers/db';
import { seedAuthIdentity, TEST_CREDENTIAL, type SeededAuthIdentity } from '../helpers/auth-seed';
import { seededTenantIds, type SeededTenants } from '../helpers/tenants';
import { generateAt } from '../../src/common/auth/totp';
import { signInOriginThrottle } from '../../src/common/auth/origin-throttle';

describe('POST /auth/factor (T043)', () => {
  let app: INestApplication;
  let migration: Client;
  let tenants: SeededTenants;

  beforeAll(async () => {
    app = await createUnauthenticatedApp();
    migration = await connectAs('migration');
    tenants = await seededTenantIds();
  });

  afterAll(async () => {
    await app.close();
    await migration.end();
  });

  const server = () => app.getHttpServer();

  async function token(identity: SeededAuthIdentity): Promise<string> {
    signInOriginThrottle.reset();
    const response = await request(server())
      .post('/auth/sign-in')
      .send({ email: identity.email, password: TEST_CREDENTIAL });
    return response.body.challengeToken as string;
  }

  const present = (challengeToken: string, code: string) =>
    request(server()).post('/auth/factor').send({ challengeToken, code });

  const codeNow = (identity: SeededAuthIdentity, offset = 0) =>
    generateAt(identity.secret, Math.floor(Date.now() / 1000) + offset);

  it('emits EXACTLY ONE session, with expiresAt 15 minutes out (FR-033, FR-035)', async () => {
    const identity = await seedAuthIdentity(migration, 'factor-one-session');
    const response = await present(await token(identity), await codeNow(identity));

    expect(response.status).toBe(201);
    expect(response.body.accessToken).toBeTruthy();
    expect(response.body.refreshToken).toBeTruthy();

    const minutes = (new Date(response.body.expiresAt).getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(14);
    expect(minutes).toBeLessThanOrEqual(15.5);

    const { rows } = await migration.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM session WHERE identity_id = $1 AND revoked_at IS NULL`,
      [identity.identityId],
    );
    expect(Number(rows[0]!.n)).toBe(1);
  });

  it('THE RESPONSE CARRIES NO TENANT AND NO ARCHETYPE (FR-037)', async () => {
    // The separation that keeps the identity layer replaceable. Which firms this
    // person may reach is a separate call, and nothing in the session is trusted
    // as the source of either (002/FR-016). A tenant leaking into this response
    // would be the first step back toward a token that carries authorization.
    const identity = await seedAuthIdentity(migration, 'factor-no-tenant');
    await migration.query(
      `INSERT INTO membership (identity_id, tenant_id, archetype) VALUES ($1, $2, 'MP')`,
      [identity.identityId, tenants.a],
    );

    const response = await present(await token(identity), await codeNow(identity));
    expect(response.status).toBe(201);
    expect(Object.keys(response.body).sort()).toEqual(
      ['accessToken', 'expiresAt', 'refreshToken'].sort(),
    );
    const body = JSON.stringify(response.body);
    expect(body).not.toContain(tenants.a);
    expect(body).not.toContain('MP');
  });

  it('the emitted access token actually authenticates a request', async () => {
    const identity = await seedAuthIdentity(migration, 'factor-usable');
    const emitted = await present(await token(identity), await codeNow(identity));

    const response = await request(server())
      .get('/identity/memberships')
      .set('authorization', `Bearer ${emitted.body.accessToken}`);
    expect(response.status).toBe(200);
  });

  it('the uniform 401 covers a wrong code, an unknown token, and a replay alike', async () => {
    const identity = await seedAuthIdentity(migration, 'factor-uniform');
    const code = await codeNow(identity);
    await present(await token(identity), code); // spend it

    const [wrongCode, unknownToken, replayed] = await Promise.all([
      present(await token(identity), '000000'),
      present('a-token-never-issued', '000000'),
      present(await token(identity), code),
    ]);

    for (const response of [wrongCode, unknownToken, replayed]) {
      expect(response.status).toBe(401);
      expect(JSON.stringify(response.body)).toBe(JSON.stringify(wrongCode.body));
    }
  });

  it('an expired challenge is refused', async () => {
    const identity = await seedAuthIdentity(migration, 'factor-expired');
    const challenge = await token(identity);
    await migration.query(
      `UPDATE identity_factor SET challenge_expires_at = now() - interval '1 second' WHERE identity_id = $1`,
      [identity.identityId],
    );

    const response = await present(challenge, await codeNow(identity));
    expect(response.status).toBe(401);
  });

  it('a malformed request is a validation failure, not an authentication oracle', async () => {
    const response = await request(server()).post('/auth/factor').send({ code: '123456' });
    expect(response.status).toBe(400);
  });

  it('neither emitted token appears anywhere in the database in plaintext', async () => {
    const identity = await seedAuthIdentity(migration, 'factor-digests-only');
    const emitted = await present(await token(identity), await codeNow(identity));

    const { rows } = await migration.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM session s FULL JOIN refresh_token r ON false
        WHERE s.access_digest IN ($1, $2) OR r.token_digest IN ($1, $2)`,
      [emitted.body.accessToken, emitted.body.refreshToken],
    );
    expect(Number(rows[0]!.n)).toBe(0);
  });
});
