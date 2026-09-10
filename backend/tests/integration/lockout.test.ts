/**
 * T046 — the lockout. FR-021, FR-055, SC-032.
 *
 * Five consecutive failures, fifteen minutes, counter reset on success. The
 * rationale the spec gives is worth keeping in view while reading these: five
 * attempts per fifteen minutes reduces guessing to roughly twenty attempts an
 * hour against odds near three in a million, while a fifteen-minute window keeps
 * a MALICIOUS lockout an annoyance rather than a denial of access to a live
 * matter.
 *
 * That second half is why the last two tests matter as much as the first. A
 * lockout that never lifted, or that needed an administrator, would convert a
 * cheap attack into a support ticket and a lawyer locked out of a hearing.
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

describe('second-factor lockout (FR-021, FR-055, SC-032)', () => {
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

  async function challengeToken(identity: SeededAuthIdentity): Promise<string> {
    signInOriginThrottle.reset();
    const response = await request(server())
      .post('/auth/sign-in')
      .send({ email: identity.email, password: TEST_CREDENTIAL });
    return response.body.challengeToken as string;
  }

  const present = (token: string, code: string) =>
    request(server()).post('/auth/factor').send({ challengeToken: token, code });

  const currentCode = (identity: SeededAuthIdentity) =>
    generateAt(identity.secret, Math.floor(Date.now() / 1000));

  async function counters(identityId: string): Promise<{ attempts: number; locked: boolean }> {
    const { rows } = await migration.query<{ failed_attempt_count: number; is_locked: boolean }>(
      `SELECT failed_attempt_count, (locked_until IS NOT NULL AND locked_until > now()) AS is_locked
         FROM identity_factor WHERE identity_id = $1`,
      [identityId],
    );
    return { attempts: rows[0]!.failed_attempt_count, locked: rows[0]!.is_locked };
  }

  it('4 failures then a valid code succeeds, and the counter resets to zero', async () => {
    const identity = await seedAuthIdentity(migration, 'lockout-reset');

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const token = await challengeToken(identity);
      const response = await present(token, '000000');
      expect(response.status, `attempt ${attempt}`).toBe(401);
      expect((await counters(identity.identityId)).attempts).toBe(attempt);
      // Not locked yet — the threshold is five, and four is not five.
      expect((await counters(identity.identityId)).locked).toBe(false);
    }

    const token = await challengeToken(identity);
    const success = await present(token, await currentCode(identity));
    expect(success.status).toBe(201);
    expect(await counters(identity.identityId)).toEqual({ attempts: 0, locked: false });
  });

  it('the 5th consecutive failure locks the identity', async () => {
    const identity = await seedAuthIdentity(migration, 'lockout-trip');

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const token = await challengeToken(identity);
      await present(token, '000000');
    }

    expect(await counters(identity.identityId)).toMatchObject({ locked: true });
  });

  it('A VALID CODE IS REFUSED DURING THE LOCKOUT, indistinguishably from a wrong one', async () => {
    // FR-055's real content. If a correct code succeeded during a lockout the
    // control would be theatre, and if it failed DIFFERENTLY it would announce
    // that a lockout was in effect — which tells an attacker their guessing is
    // being counted and roughly where they are in the count.
    const identity = await seedAuthIdentity(migration, 'lockout-valid-refused');

    // The token from the FIFTH attempt is reused deliberately. Once locked, the
    // credential step refuses too (FR-005), so a fresh challenge cannot be
    // obtained at all — and a wrong code does not consume the challenge, which
    // is exactly the property that leaves this one live to present again.
    let lastToken = '';
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      lastToken = await challengeToken(identity);
      await present(lastToken, '000000');
    }

    const withValidCode = await present(lastToken, await currentCode(identity));
    const withWrongCode = await present(lastToken, '000001');

    expect(withValidCode.status).toBe(401);
    expect(JSON.stringify(withValidCode.body)).toBe(JSON.stringify(withWrongCode.body));
  });

  it('a locked identity is refused at the CREDENTIAL step too (FR-005)', async () => {
    // The two steps share one threshold, so neither is throttled more loosely
    // than the other. A lockout that only covered the second step would leave
    // the credential guessable at full speed.
    const identity = await seedAuthIdentity(migration, 'lockout-credential');
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await present(await challengeToken(identity), '000000');
    }

    signInOriginThrottle.reset();
    const response = await request(server())
      .post('/auth/sign-in')
      .send({ email: identity.email, password: TEST_CREDENTIAL });
    expect(response.status).toBe(401);
  });

  it('THE LOCKOUT LIFTS ON ITS OWN — no administrative action exists or is needed', async () => {
    // SC-032. No archetype holds a reset capability, so if this did not expire
    // by itself a locked-out person would be permanently locked out. Simulated
    // by ageing the row rather than waiting fifteen minutes.
    const identity = await seedAuthIdentity(migration, 'lockout-expiry');
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await present(await challengeToken(identity), '000000');
    }
    expect((await counters(identity.identityId)).locked).toBe(true);

    await migration.query(
      `UPDATE identity_factor SET locked_until = now() - interval '1 second' WHERE identity_id = $1`,
      [identity.identityId],
    );

    const token = await challengeToken(identity);
    const response = await present(token, await currentCode(identity));
    expect(response.status).toBe(201);
  });

  it('one identity locking out does not affect another', async () => {
    const victim = await seedAuthIdentity(migration, 'lockout-victim');
    const bystander = await seedAuthIdentity(migration, 'lockout-bystander');

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await present(await challengeToken(victim), '000000');
    }

    const token = await challengeToken(bystander);
    const response = await present(token, await currentCode(bystander));
    expect(response.status).toBe(201);
  });
});
