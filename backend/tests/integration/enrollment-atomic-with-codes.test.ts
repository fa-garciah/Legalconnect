/**
 * T075 — enrollment does not complete without the codes. FR-023.
 *
 * The state this forbids is specific and quiet: a confirmed factor with no
 * backup codes. Somebody in it would appear fully enrolled, sign in normally
 * for months, and discover on the day they lose their phone that they have no
 * way back — with no archetype able to help, because none holds a reset
 * capability (FR-055).
 *
 * So issuance is inside the confirmation transaction, and this file proves the
 * rollback rather than trusting the `await` sequence.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createUnauthenticatedApp } from '../helpers/real-app';
import { connectAs } from '../helpers/db';
import { seedAuthIdentity, TEST_CREDENTIAL } from '../helpers/auth-seed';
import { generateAt } from '../../src/common/auth/totp';
import { signInOriginThrottle } from '../../src/common/auth/origin-throttle';

describe('enrollment is atomic with its codes (FR-023)', () => {
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

  async function beginEnrollment(label: string) {
    const identity = await seedAuthIdentity(migration, label, { factor: false });
    signInOriginThrottle.reset();
    const credential = await request(server())
      .post('/auth/sign-in')
      .send({ email: identity.email, password: TEST_CREDENTIAL });
    const started = await request(server())
      .post('/auth/enrollment/begin')
      .send({ challengeToken: credential.body.challengeToken });
    return { identity, started };
  }

  it('a completed enrollment has BOTH a confirmed factor and ten codes', async () => {
    const { identity, started } = await beginEnrollment('atomic-both');
    await request(server())
      .post('/auth/enrollment/confirm')
      .send({
        enrollmentToken: started.body.enrollmentToken,
        code: await generateAt(started.body.secret, Math.floor(Date.now() / 1000)),
      });

    const { rows } = await migration.query<{ confirmed: boolean; codes: string }>(
      `SELECT (f.confirmed_at IS NOT NULL) AS confirmed,
              (SELECT count(*)::text FROM backup_code WHERE identity_id = f.identity_id) AS codes
         FROM identity_factor f WHERE f.identity_id = $1`,
      [identity.identityId],
    );
    expect(rows[0]).toEqual({ confirmed: true, codes: '10' });
  });

  it('A FAILED CONFIRMATION LEAVES NEITHER — no factor, no codes', async () => {
    const { identity, started } = await beginEnrollment('atomic-neither');
    const refused = await request(server())
      .post('/auth/enrollment/confirm')
      .send({ enrollmentToken: started.body.enrollmentToken, code: '000000' });
    expect(refused.status).toBe(401);

    const { rows } = await migration.query<{ confirmed: boolean; codes: string; enrolled: boolean }>(
      `SELECT (f.confirmed_at IS NOT NULL) AS confirmed,
              (SELECT count(*)::text FROM backup_code WHERE identity_id = f.identity_id) AS codes,
              (i.mfa_enrolled_at IS NOT NULL) AS enrolled
         FROM identity_factor f JOIN identity i ON i.id = f.identity_id
        WHERE f.identity_id = $1`,
      [identity.identityId],
    );
    expect(rows[0]).toEqual({ confirmed: false, codes: '0', enrolled: false });
  });

  it('THE FORBIDDEN STATE DOES NOT ARISE ACROSS MANY REAL ENROLLMENTS', async () => {
    // Scoped to identities enrolled THROUGH THE API, deliberately, and it is
    // worth saying why rather than quietly narrowing the query.
    //
    // A database-wide sweep cannot hold here: `seedAuthIdentity` writes
    // confirmed_at and mfa_enrolled_at DIRECTLY, because most suites need an
    // enrolled identity without paying for a full enrollment ceremony. Those
    // fixtures are legitimately in the forbidden state — several hundred of
    // them — and a global assertion would be measuring the test helper rather
    // than the product.
    //
    // What is provable, and what actually matters, is that the PRODUCT never
    // produces the state. Several enrollments through the real path, including
    // one that fails, then the invariant over exactly those.
    const enrolled: string[] = [];

    for (let i = 0; i < 3; i += 1) {
      const { identity, started } = await beginEnrollment(`atomic-sweep-ok-${i}`);
      await request(server())
        .post('/auth/enrollment/confirm')
        .send({
          enrollmentToken: started.body.enrollmentToken,
          code: await generateAt(started.body.secret, Math.floor(Date.now() / 1000)),
        });
      enrolled.push(identity.identityId);
    }

    const failed = await beginEnrollment('atomic-sweep-failed');
    await request(server())
      .post('/auth/enrollment/confirm')
      .send({ enrollmentToken: failed.started.body.enrollmentToken, code: '000000' });
    enrolled.push(failed.identity.identityId);

    const { rows } = await migration.query<{ n: string }>(
      `SELECT count(*)::text AS n
         FROM identity_factor f
        WHERE f.identity_id = ANY($1)
          AND f.confirmed_at IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM backup_code b WHERE b.identity_id = f.identity_id)`,
      [enrolled],
    );
    expect(Number(rows[0]!.n)).toBe(0);
  });

  it('and the converse: the product never sets mfa_enrolled_at without a confirmed factor', async () => {
    // 002/FR-026 reads that column to gate every tenant capability. Set with no
    // factor behind it, a person would be admitted everywhere while holding
    // nothing to challenge. Scoped for the same reason as above.
    const { identity, started } = await beginEnrollment('atomic-converse');
    await request(server())
      .post('/auth/enrollment/confirm')
      .send({
        enrollmentToken: started.body.enrollmentToken,
        code: await generateAt(started.body.secret, Math.floor(Date.now() / 1000)),
      });

    const { rows } = await migration.query<{ n: string }>(
      `SELECT count(*)::text AS n
         FROM identity i
        WHERE i.id = $1
          AND i.mfa_enrolled_at IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM identity_factor f
             WHERE f.identity_id = i.id AND f.confirmed_at IS NOT NULL
          )`,
      [identity.identityId],
    );
    expect(Number(rows[0]!.n)).toBe(0);
  });
});
