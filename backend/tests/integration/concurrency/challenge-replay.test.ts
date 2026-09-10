/**
 * T047 — the replay guard, under concurrency. FR-020, SC-018.
 *
 * FR-020 is narrower and stranger than "a code is single-use", and the
 * difference is the whole point: a used code must be refused ANYWHERE in
 * FR-056's 90-second window, "not merely within the step it was generated from".
 *
 * That distinction exists because the window is centred on the VERIFYING
 * instant, not on the code. A code accepted at t is still arithmetically valid
 * at t+30 and t+60, from two neighbouring steps it was never generated for. A
 * guard scoped to one step would refuse the obvious replay and admit the two
 * non-obvious ones.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createUnauthenticatedApp } from '../../helpers/real-app';
import { connectAs } from '../../helpers/db';
import { seedAuthIdentity, TEST_CREDENTIAL, type SeededAuthIdentity } from '../../helpers/auth-seed';
import { generateAt } from '../../../src/common/auth/totp';
import { signInOriginThrottle } from '../../../src/common/auth/origin-throttle';

describe('challenge replay under concurrency (FR-020, SC-018)', () => {
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

  async function token(identity: SeededAuthIdentity): Promise<string> {
    signInOriginThrottle.reset();
    const response = await request(server())
      .post('/auth/sign-in')
      .send({ email: identity.email, password: TEST_CREDENTIAL });
    return response.body.challengeToken as string;
  }

  const present = (challengeToken: string, code: string) =>
    request(server()).post('/auth/factor').send({ challengeToken, code });

  it('TWO CONCURRENT CHALLENGES WITH THE SAME VALID CODE YIELD EXACTLY ONE SUCCESS', async () => {
    // The race claim_attempt()'s FOR UPDATE exists for. Without it both readers
    // see "not yet used", both verify, and one credential verification becomes
    // two sessions.
    const identity = await seedAuthIdentity(migration, 'replay-race');
    const code = await generateAt(identity.secret, Math.floor(Date.now() / 1000));

    const [tokenA, tokenB] = await Promise.all([token(identity), token(identity)]);
    const [a, b] = await Promise.all([present(tokenA, code), present(tokenB, code)]);

    const successes = [a, b].filter((r) => r.status === 201);
    expect(successes).toHaveLength(1);

    const { rows } = await migration.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM session WHERE identity_id = $1 AND revoked_at IS NULL`,
      [identity.identityId],
    );
    expect(Number(rows[0]!.n)).toBe(1);
  });

  it('a used code is refused ANYWHERE in the window, not only in its own step', async () => {
    // The assertion FR-020 is actually about. The code is spent at its own
    // step, then presented again as though a step had passed — still inside the
    // 90-second window, where it would otherwise verify perfectly.
    const identity = await seedAuthIdentity(migration, 'replay-window');
    const code = await generateAt(identity.secret, Math.floor(Date.now() / 1000));

    const first = await present(await token(identity), code);
    expect(first.status).toBe(201);

    const replay = await present(await token(identity), code);
    expect(replay.status).toBe(401);
  });

  it('the replay counts as a failed attempt — it is not a silent no-op', async () => {
    // Treating a replay as "nothing happened" would make replaying a captured
    // code an unthrottled probe against the lockout.
    const identity = await seedAuthIdentity(migration, 'replay-counts');
    const code = await generateAt(identity.secret, Math.floor(Date.now() / 1000));
    await present(await token(identity), code);

    const before = await migration.query<{ n: number }>(
      `SELECT failed_attempt_count AS n FROM identity_factor WHERE identity_id = $1`,
      [identity.identityId],
    );
    await present(await token(identity), code);
    const after = await migration.query<{ n: number }>(
      `SELECT failed_attempt_count AS n FROM identity_factor WHERE identity_id = $1`,
      [identity.identityId],
    );

    expect(after.rows[0]!.n).toBe(before.rows[0]!.n + 1);
  });

  it('a DIFFERENT code from a neighbouring step still works — the guard is not a blanket', async () => {
    // Without this the file would pass against an implementation that refused
    // every second attempt regardless, which would break legitimate re-entry.
    const identity = await seedAuthIdentity(migration, 'replay-not-blanket');
    const now = Math.floor(Date.now() / 1000);

    const first = await present(await token(identity), await generateAt(identity.secret, now));
    expect(first.status).toBe(201);

    const second = await present(await token(identity), await generateAt(identity.secret, now + 30));
    expect(second.status).toBe(201);
  });

  it('the stored guard holds digests, never codes', async () => {
    const identity = await seedAuthIdentity(migration, 'replay-digests');
    const code = await generateAt(identity.secret, Math.floor(Date.now() / 1000));
    await present(await token(identity), code);

    const { rows } = await migration.query<{ guard: string }>(
      `SELECT recent_code_digests::text AS guard FROM identity_factor WHERE identity_id = $1`,
      [identity.identityId],
    );
    expect(rows[0]!.guard).not.toContain(code);
    expect(rows[0]!.guard).toContain('"d"');
  });
});
