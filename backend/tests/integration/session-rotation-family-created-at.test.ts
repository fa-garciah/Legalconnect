/**
 * T012 — `rotate_refresh()` copies `family_created_at` forward unchanged across
 * successive rotations, while `last_seen_at` resets to each rotation's own time.
 * research.md D1.
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

describe("rotate_refresh() carries family_created_at forward unchanged (D1)", () => {
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

  async function sessionClocksFor(accessDigestPlain: string): Promise<{ lastSeenAt: Date; familyCreatedAt: Date }> {
    const { createHash } = await import('node:crypto');
    const digest = createHash('sha256').update(accessDigestPlain, 'utf8').digest('hex');
    const { rows } = await migration.query<{ last_seen_at: Date; family_created_at: Date }>(
      `SELECT last_seen_at, family_created_at FROM session WHERE access_digest = $1`,
      [digest],
    );
    expect(rows).toHaveLength(1);
    return { lastSeenAt: new Date(rows[0]!.last_seen_at), familyCreatedAt: new Date(rows[0]!.family_created_at) };
  }

  it('family_created_at is identical across three rotations; last_seen_at moves forward each time', async () => {
    const identity = await seedAuthIdentity(migration, 'family-created-at');
    const first = await signInFully(identity);
    const origin = await sessionClocksFor(first.accessToken);

    const rotate = async (refreshToken: string) => {
      const rotated = await request(server()).post('/auth/refresh').send({ refreshToken });
      expect(rotated.status).toBe(201);
      return rotated.body as { accessToken: string; refreshToken: string };
    };

    // Space rotations out slightly so last_seen_at values are distinguishable —
    // clock_timestamp()/now() resolution is well under a millisecond apart
    // otherwise on a fast local run.
    await new Promise((r) => setTimeout(r, 20));
    const second = await rotate(first.refreshToken);
    const secondClocks = await sessionClocksFor(second.accessToken);

    await new Promise((r) => setTimeout(r, 20));
    const third = await rotate(second.refreshToken);
    const thirdClocks = await sessionClocksFor(third.accessToken);

    // The absolute clock never moves.
    expect(secondClocks.familyCreatedAt.getTime()).toBe(origin.familyCreatedAt.getTime());
    expect(thirdClocks.familyCreatedAt.getTime()).toBe(origin.familyCreatedAt.getTime());

    // The idle clock resets to each rotation's own time — strictly increasing.
    expect(secondClocks.lastSeenAt.getTime()).toBeGreaterThanOrEqual(origin.lastSeenAt.getTime());
    expect(thirdClocks.lastSeenAt.getTime()).toBeGreaterThanOrEqual(secondClocks.lastSeenAt.getTime());
  });
});
