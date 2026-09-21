/**
 * T018 (sign-out) / T025 (step-up) — contract shapes for the two new routes.
 * contracts/session-lifecycle.md.
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

describe('POST /auth/sign-out and POST /auth/step-up contracts', () => {
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

  async function signInFully(identity: SeededAuthIdentity): Promise<{ accessToken: string; refreshToken: string }> {
    signInOriginThrottle.reset();
    const credential = await request(server())
      .post('/auth/sign-in')
      .send({ email: identity.email, password: TEST_CREDENTIAL });
    const code = await generateAt(identity.secret, Math.floor(Date.now() / 1000));
    const factor = await request(server())
      .post('/auth/factor')
      .send({ challengeToken: credential.body.challengeToken, code });
    expect(factor.status).toBe(201);
    return { accessToken: factor.body.accessToken, refreshToken: factor.body.refreshToken };
  }

  describe('POST /auth/sign-out', () => {
    it('200 { signedOut: true } on a live session', async () => {
      const identity = await seedAuthIdentity(migration, 'contract-signout-live');
      const tokens = await signInFully(identity);

      const response = await request(server())
        .post('/auth/sign-out')
        .set('authorization', `Bearer ${tokens.accessToken}`)
        .send();

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ signedOut: true });
    });

    it('200 { signedOut: true }, IDENTICALLY, on an already-revoked session — no field distinguishes them (FR-005)', async () => {
      const identity = await seedAuthIdentity(migration, 'contract-signout-dead');
      const tokens = await signInFully(identity);

      const first = await request(server())
        .post('/auth/sign-out')
        .set('authorization', `Bearer ${tokens.accessToken}`)
        .send();
      const second = await request(server())
        .post('/auth/sign-out')
        .set('authorization', `Bearer ${tokens.accessToken}`)
        .send();

      expect(second.status).toBe(first.status);
      expect(JSON.stringify(second.body)).toBe(JSON.stringify(first.body));
    });

    it('401 with no bearer token presented at all', async () => {
      const response = await request(server()).post('/auth/sign-out').send();
      expect(response.status).toBe(401);
    });
  });

  describe('POST /auth/step-up', () => {
    it('200 { stepUpToken, expiresAt } on a valid code against a gated capability', async () => {
      const identity = await seedAuthIdentity(migration, 'contract-stepup-ok');
      const tokens = await signInFully(identity);
      const code = await generateAt(identity.secret, Math.floor(Date.now() / 1000) + 30);

      const response = await request(server())
        .post('/auth/step-up')
        .set('authorization', `Bearer ${tokens.accessToken}`)
        .send({ capability: 'membership.revoke', code });

      expect(response.status).toBe(200);
      expect(response.body.stepUpToken).toBeTruthy();
      expect(response.body.expiresAt).toBeTruthy();
    });

    it('the same uniform 401 003 already uses, for a wrong code', async () => {
      const identity = await seedAuthIdentity(migration, 'contract-stepup-wrong');
      const tokens = await signInFully(identity);

      const response = await request(server())
        .post('/auth/step-up')
        .set('authorization', `Bearer ${tokens.accessToken}`)
        .send({ capability: 'membership.revoke', code: '000000' });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        error: 'authentication_failed',
        message: 'No fue posible completar el acceso.',
      });
    });

    it('404 for a capability value outside the five stepUp: true ids', async () => {
      const identity = await seedAuthIdentity(migration, 'contract-stepup-badcap');
      const tokens = await signInFully(identity);
      const code = await generateAt(identity.secret, Math.floor(Date.now() / 1000));

      const response = await request(server())
        .post('/auth/step-up')
        .set('authorization', `Bearer ${tokens.accessToken}`)
        .send({ capability: 'case.read', code });

      expect(response.status).toBe(404);
    });

    it('400 for a malformed request', async () => {
      const response = await request(server()).post('/auth/step-up').send({ code: '123456' });
      expect(response.status).toBe(400);
    });
  });
});
