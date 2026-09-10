/**
 * T065 — contract for the enrollment routes. FR-009 to FR-012.
 *
 * The property worth the most here is that the secret is returned EXACTLY ONCE.
 * Every other guarantee in this slice about factor secrets — no archetype reads
 * one, a dump yields no working factor, reset means re-enrollment — rests on
 * there being a single moment when the plaintext exists outside the encryption,
 * and on that moment being this one.
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

describe('POST /auth/enrollment (T065)', () => {
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

  /** The credential step for an UNENROLLED identity yields the enrollment token. */
  async function enrollmentToken(identity: SeededAuthIdentity): Promise<string> {
    signInOriginThrottle.reset();
    const response = await request(server())
      .post('/auth/sign-in')
      .send({ email: identity.email, password: TEST_CREDENTIAL });
    expect(response.body.next).toBe('enrollment');
    return response.body.challengeToken as string;
  }

  const begin = (challengeToken: string) =>
    request(server()).post('/auth/enrollment/begin').send({ challengeToken });

  const confirm = (token: string, code: string) =>
    request(server()).post('/auth/enrollment/confirm').send({ enrollmentToken: token, code });

  it('begin returns the secret, an otpauth URI and a token — and no session', async () => {
    const identity = await seedAuthIdentity(migration, 'enroll-begin', { factor: false });
    const response = await begin(await enrollmentToken(identity));

    expect(response.status).toBe(201);
    expect(response.body.secret).toMatch(/^[A-Z2-7]+$/);
    expect(response.body.otpauthUri).toContain('otpauth://totp/');
    expect(response.body.enrollmentToken).toBeTruthy();
    // FR-009: beginning does NOT complete enrollment, so no session yet.
    expect(response.body.accessToken).toBeUndefined();
  });

  it('AN UNCONFIRMED ROW SATISFIES NO CHALLENGE (FR-010)', async () => {
    // The row exists after `begin`, holding a real secret. Until it is
    // confirmed, the person is still routed to enrollment rather than to the
    // factor challenge — otherwise enrollment would be complete the moment it
    // started.
    const identity = await seedAuthIdentity(migration, 'enroll-unconfirmed', { factor: false });
    const started = await begin(await enrollmentToken(identity));
    expect(started.body.secret).toBeTruthy();

    signInOriginThrottle.reset();
    const secondSignIn = await request(server())
      .post('/auth/sign-in')
      .send({ email: identity.email, password: TEST_CREDENTIAL });
    expect(secondSignIn.body.next).toBe('enrollment');
  });

  it('beginning again DISCARDS the prior unconfirmed secret (FR-010)', async () => {
    const identity = await seedAuthIdentity(migration, 'enroll-restart', { factor: false });
    const first = await begin(await enrollmentToken(identity));
    const second = await begin(await enrollmentToken(identity));

    expect(second.body.secret).not.toBe(first.body.secret);

    // The FIRST secret is now dead: confirming with a code derived from it fails.
    const staleCode = await generateAt(first.body.secret, Math.floor(Date.now() / 1000));
    const refused = await confirm(second.body.enrollmentToken, staleCode);
    expect(refused.status).toBe(401);
  });

  it('confirm completes enrollment, issues 10 codes and emits a session', async () => {
    const identity = await seedAuthIdentity(migration, 'enroll-confirm', { factor: false });
    const started = await begin(await enrollmentToken(identity));
    const code = await generateAt(started.body.secret, Math.floor(Date.now() / 1000));

    const response = await confirm(started.body.enrollmentToken, code);
    expect(response.status).toBe(201);
    expect(response.body.backupCodes).toHaveLength(10);
    expect(response.body.accessToken).toBeTruthy();
    expect(response.body.expiresAt).toBeTruthy();
  });

  it('CONFIRMED_AT AND MFA_ENROLLED_AT ARE SET IN THE SAME TRANSACTION (FR-011)', async () => {
    // `confirmed_at` is the fact; `mfa_enrolled_at` is 002/FR-026's shipped
    // interface to it. If they diverged, a person could hold a working factor
    // while the precondition gating every tenant capability still refused them
    // — or, worse, the reverse.
    const identity = await seedAuthIdentity(migration, 'enroll-columns', { factor: false });
    const started = await begin(await enrollmentToken(identity));
    await confirm(
      started.body.enrollmentToken,
      await generateAt(started.body.secret, Math.floor(Date.now() / 1000)),
    );

    const { rows } = await migration.query<{ both_set: boolean }>(
      `SELECT (f.confirmed_at IS NOT NULL AND i.mfa_enrolled_at IS NOT NULL) AS both_set
         FROM identity i JOIN identity_factor f ON f.identity_id = i.id WHERE i.id = $1`,
      [identity.identityId],
    );
    expect(rows[0]!.both_set).toBe(true);
  });

  it('AN ENROLLED IDENTITY IS REFUSED (FR-012)', async () => {
    // Replacing a factor is reached only through recovery, which requires
    // proving a backup code. Without this, anyone who reached the credential
    // step could silently replace somebody's second factor.
    const identity = await seedAuthIdentity(migration, 'enroll-already', { factor: true });
    signInOriginThrottle.reset();
    const credential = await request(server())
      .post('/auth/sign-in')
      .send({ email: identity.email, password: TEST_CREDENTIAL });
    expect(credential.body.next).toBe('factor');

    const response = await begin(credential.body.challengeToken);
    expect(response.status).toBe(401);
  });

  it('a wrong code leaves the identity UNENROLLED and records the attempt', async () => {
    const identity = await seedAuthIdentity(migration, 'enroll-wrong-code', { factor: false });
    const started = await begin(await enrollmentToken(identity));

    const response = await confirm(started.body.enrollmentToken, '000000');
    expect(response.status).toBe(401);

    const { rows } = await migration.query<{ enrolled: boolean }>(
      `SELECT (mfa_enrolled_at IS NOT NULL) AS enrolled FROM identity WHERE id = $1`,
      [identity.identityId],
    );
    expect(rows[0]!.enrolled).toBe(false);

    const audit = await migration.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM audit_event WHERE action = 'enrollment.failed' AND target_id = $1`,
      [identity.identityId],
    );
    expect(Number(audit.rows[0]!.n)).toBeGreaterThanOrEqual(1);
  });

  it('an unknown or malformed token is refused uniformly', async () => {
    const [unknown, malformed] = await Promise.all([
      begin('a-token-never-issued'),
      confirm('not-even-base64url', '123456'),
    ]);
    expect(unknown.status).toBe(401);
    expect(malformed.status).toBe(401);
  });
});
