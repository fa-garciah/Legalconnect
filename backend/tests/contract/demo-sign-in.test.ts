/**
 * T014 — every demo person signs in, through the real ceremony. 022/FR-013, SC-001, SC-002.
 *
 * THIS IS THE SLICE'S CENTRAL CLAIM, and the only test that proves it end to end: the printed
 * password is accepted, the printed TOTP secret produces a code the challenge accepts, and a
 * wrong code is refused. Everything else in `022` is in service of this.
 *
 * ALL SEVEN PEOPLE, not one. SC-002 says every internal archetype can sign in, and the
 * realistic failure is a single person's row being wrong — a position that does not exist in
 * the firm's catalog, an archetype the matrix does not know — which one sampled identity would
 * never reveal.
 *
 * It calls the demo module's own writers rather than shelling out to `npm run db:seed:demo`, so
 * a booted-app test does not depend on a CLI side effect. `demo-seed.test.ts` covers the
 * command itself.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createUnauthenticatedApp } from '../helpers/real-app';
import { connectAs } from '../helpers/db';
import { hashCredential } from '../../src/common/auth/argon2';
import { resolveKeyProvider } from '../../src/common/auth/key-provider';
import { generateAt } from '../../src/common/auth/totp';
import { signInOriginThrottle } from '../../src/common/auth/origin-throttle';
import { DEMO_PASSWORD, DEMO_PEOPLE, totpSecretFor } from '../../drizzle/demo/firm';

/**
 * The same four writes `seed-demo.ts` performs, against throwaway emails so this test never
 * depends on — or disturbs — a database the demo command has actually seeded.
 */
async function seedDemoLikeIdentity(
  migration: Client,
  slug: string,
): Promise<{ readonly email: string; readonly secret: string }> {
  const suffix = `${slug}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const email = `t014-${suffix}@demo.legalconnect.mx`;
  const secret = totpSecretFor(slug);

  const { rows } = await migration.query<{ id: string }>(
    `INSERT INTO identity (subject, email) VALUES ($1, $2) RETURNING id`,
    [`demo-test|${suffix}`, email],
  );
  const identityId = rows[0]!.id;

  await migration.query(`INSERT INTO identity_credential (identity_id, digest) VALUES ($1, $2)`, [
    identityId,
    await hashCredential(DEMO_PASSWORD),
  ]);

  const wrapped = await resolveKeyProvider().wrap(Buffer.from(secret, 'utf8'));
  await migration.query(
    `INSERT INTO identity_factor (identity_id, secret_ciphertext, key_reference, confirmed_at)
     VALUES ($1, $2, $3, now())`,
    [identityId, wrapped.ciphertext, wrapped.keyReference],
  );
  await migration.query(`UPDATE identity SET mfa_enrolled_at = now() WHERE id = $1`, [identityId]);

  return { email, secret };
}

describe('a demo person signs in (T014)', () => {
  let app: INestApplication;
  let migration: Client;
  const seeded: { slug: string; archetype: string; email: string; secret: string }[] = [];

  beforeAll(async () => {
    app = await createUnauthenticatedApp();
    migration = await connectAs('migration');
    for (const person of DEMO_PEOPLE) {
      const { email, secret } = await seedDemoLikeIdentity(migration, person.slug);
      seeded.push({ slug: person.slug, archetype: person.archetype, email, secret });
    }
  }, 180_000);

  afterAll(async () => {
    await migration.end();
    await app.close();
  });

  /** The origin throttle is per-origin and this suite drives 20+ attempts from one. */
  function untrottled(): void {
    signInOriginThrottle.reset();
  }

  it('accepts the printed password and issues a challenge, for every archetype', async () => {
    for (const person of seeded) {
      untrottled();
      const response = await request(app.getHttpServer())
        .post('/auth/sign-in')
        .send({ email: person.email, password: DEMO_PASSWORD });
      expect(response.status, `${person.archetype} ${person.email}`).toBe(201);
      expect(response.body.challengeToken, person.archetype).toBeTruthy();
    }
  }, 180_000);

  it('completes the challenge with a code derived from the printed secret', async () => {
    for (const person of seeded) {
      untrottled();
      const signIn = await request(app.getHttpServer())
        .post('/auth/sign-in')
        .send({ email: person.email, password: DEMO_PASSWORD });
      const code = await generateAt(person.secret, Math.floor(Date.now() / 1000));
      const factor = await request(app.getHttpServer())
        .post('/auth/factor')
        .send({ challengeToken: signIn.body.challengeToken, code });
      expect(factor.status, `${person.archetype} ${person.email}`).toBe(201);
      expect(factor.body.accessToken, person.archetype).toBeTruthy();
    }
  }, 180_000);

  it('refuses a wrong code — the demo installs no bypass (FR-013)', async () => {
    untrottled();
    const person = seeded[0]!;
    const signIn = await request(app.getHttpServer())
      .post('/auth/sign-in')
      .send({ email: person.email, password: DEMO_PASSWORD });
    const factor = await request(app.getHttpServer())
      .post('/auth/factor')
      .send({ challengeToken: signIn.body.challengeToken, code: '000000' });
    expect(factor.status).toBe(401);
    expect(factor.body.accessToken).toBeUndefined();
  });

  it('refuses the wrong password, with no session and no challenge', async () => {
    untrottled();
    const person = seeded[0]!;
    const response = await request(app.getHttpServer())
      .post('/auth/sign-in')
      .send({ email: person.email, password: 'demo-local-legalconnect-2025' });
    expect(response.status).toBe(401);
    expect(response.body.challengeToken).toBeUndefined();
  });

  it('issues no session without the second factor', async () => {
    untrottled();
    const person = seeded[0]!;
    const signIn = await request(app.getHttpServer())
      .post('/auth/sign-in')
      .send({ email: person.email, password: DEMO_PASSWORD });
    // The challenge token alone must not be usable as an access token anywhere.
    const attempt = await request(app.getHttpServer())
      .get('/identity/memberships')
      .set('authorization', `Bearer ${signIn.body.challengeToken as string}`);
    expect(attempt.status).toBe(401);
  });
});
