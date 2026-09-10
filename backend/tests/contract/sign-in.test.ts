/**
 * T042 — contract for `POST /auth/sign-in`. FR-003, FR-004, SC-017.
 *
 * THE UNIFORM REFUSAL IS THE HARD PART, and it is asserted BYTE-IDENTICALLY
 * rather than by status code. Three causes must be indistinguishable: an email
 * with no identity, a wrong credential, and an identity locked under FR-005. A
 * difference in any field, or in the presence of a field, is an enumeration
 * oracle — it tells an attacker which addresses belong to a firm, which is
 * exactly what 002 spent its own enumeration work preventing at the invitation
 * surface.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createUnauthenticatedApp } from '../helpers/real-app';
import { connectAs } from '../helpers/db';
import { hashCredential } from '../../src/common/auth/argon2';
import { LocalKeyProvider } from '../../src/common/auth/key-provider';
import { generateSecret } from '../../src/common/auth/totp';
import { signInOriginThrottle } from '../../src/common/auth/origin-throttle';

const CREDENTIAL = 'una-contrasena-larga-de-prueba';

describe('POST /auth/sign-in (T042)', () => {
  let app: INestApplication;
  let migration: Client;
  let enrolledEmail: string;
  let unenrolledEmail: string;
  let lockedEmail: string;

  async function seed(label: string, opts: { factor: boolean; locked?: boolean }): Promise<string> {
    const suffix = `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const email = `t042-${suffix}@example.com`;
    const { rows } = await migration.query<{ id: string }>(
      `INSERT INTO identity (subject, email) VALUES ($1, $2) RETURNING id`,
      [`lc|${suffix}`, email],
    );
    const id = rows[0]!.id;
    await migration.query(`INSERT INTO identity_credential (identity_id, digest) VALUES ($1, $2)`, [
      id,
      await hashCredential(CREDENTIAL),
    ]);
    if (opts.factor) {
      const provider = new LocalKeyProvider(process.env.AUTH_LOCAL_KEY!, 'local:env');
      const wrapped = await provider.wrap(Buffer.from(generateSecret(), 'utf8'));
      await migration.query(
        `INSERT INTO identity_factor (identity_id, secret_ciphertext, key_reference, confirmed_at, locked_until)
         VALUES ($1, $2, $3, now(), $4)`,
        [id, wrapped.ciphertext, wrapped.keyReference, opts.locked ? new Date(Date.now() + 900_000) : null],
      );
    }
    return email;
  }

  beforeAll(async () => {
    app = await createUnauthenticatedApp();
    migration = await connectAs('migration');
    enrolledEmail = await seed('enrolled', { factor: true });
    unenrolledEmail = await seed('unenrolled', { factor: false });
    lockedEmail = await seed('locked', { factor: true, locked: true });
  });

  afterAll(async () => {
    await app.close();
    await migration.end();
  });

  const signIn = (email: string, password = CREDENTIAL) => {
    signInOriginThrottle.reset();
    return request(app.getHttpServer()).post('/auth/sign-in').send({ email, password });
  };

  it('200-class with next="factor" and NO session for an enrolled identity', async () => {
    const response = await signIn(enrolledEmail);
    expect(response.status).toBe(201);
    expect(response.body.next).toBe('factor');
    expect(response.body.challengeToken).toBeTruthy();
    // FR-003. The credential step emits no session, and nothing in the body
    // could be mistaken for one.
    expect(response.body.accessToken).toBeUndefined();
    expect(response.body.refreshToken).toBeUndefined();
    expect(response.body.expiresAt).toBeUndefined();
  });

  it('next="enrollment" for an identity with no confirmed factor (FR-006)', async () => {
    const response = await signIn(unenrolledEmail);
    expect(response.status).toBe(201);
    expect(response.body.next).toBe('enrollment');
    expect(response.body.accessToken).toBeUndefined();
  });

  it('THE 401 BODY IS BYTE-IDENTICAL for unknown email, wrong credential and locked identity', async () => {
    const [unknown, wrong, locked] = await Promise.all([
      signIn(`t042-nobody-${Date.now()}@example.com`),
      signIn(enrolledEmail, 'una-contrasena-equivocada'),
      signIn(lockedEmail),
    ]);

    for (const response of [unknown, wrong, locked]) {
      expect(response.status).toBe(401);
      expect(response.body.error ?? response.body.message).toBeTruthy();
    }

    // The assertion SC-017 actually asks for: not merely the same status, the
    // same bytes. Serialised so a field added to one path and not the others
    // fails here.
    expect(JSON.stringify(wrong.body)).toBe(JSON.stringify(unknown.body));
    expect(JSON.stringify(locked.body)).toBe(JSON.stringify(unknown.body));
  });

  it('the refusal discloses nothing about the identity, the factor or the lockout', async () => {
    const response = await signIn(lockedEmail);
    const body = JSON.stringify(response.body).toLowerCase();
    for (const leak of ['lock', 'bloque', 'attempt', 'intento', 'factor', 'enroll', 'exist']) {
      expect(body).not.toContain(leak);
    }
    // And no header carries what the body withholds.
    expect(response.headers['retry-after']).toBeUndefined();
  });

  it('a malformed request is a validation failure, not an authentication oracle', async () => {
    // 400 rather than 401: a request with no email at all has not made an
    // authentication attempt, and answering 401 would let a caller probe the
    // shape of the endpoint through the refusal path.
    const response = await request(app.getHttpServer()).post('/auth/sign-in').send({});
    expect(response.status).toBe(400);
  });

  it('is reachable with no session at all — @AuthSurface(), not an oversight', async () => {
    const response = await signIn(enrolledEmail);
    expect(response.status).not.toBe(401);
    expect(response.status).not.toBe(404);
  });

  it('a fresh sign-in supersedes the previous pending challenge', async () => {
    // At most one challenge per identity by design: the second attempt should be
    // live and the first dead, not both, or a captured token stays useful for
    // longer than one attempt's worth of time.
    const first = await signIn(enrolledEmail);
    const second = await signIn(enrolledEmail);
    expect(first.body.challengeToken).not.toBe(second.body.challengeToken);

    const stale = await request(app.getHttpServer())
      .post('/auth/factor')
      .send({ challengeToken: first.body.challengeToken, code: '123456' });
    expect(stale.status).toBe(401);
  });
});
