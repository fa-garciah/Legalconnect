/**
 * T049 — a key outage fails CLOSED. FR-017, SC-009.
 *
 * The TOTP secret is envelope-encrypted, so verification needs the key. When the
 * key is gone — KMS unreachable, a rotated reference, a restored backup wrapped
 * under something else — the honest answers are "we cannot check" and "no".
 *
 * FR-017 requires the second, and requires it to look EXACTLY like a wrong code.
 * That is uncomfortable and deliberate: telling a caller "the key is unavailable"
 * tells an attacker the outage exists, and telling them anything other than the
 * ordinary refusal distinguishes a real identity from an invented one.
 *
 * The cost is stated in plan.md open item 3 rather than hidden: a total key
 * outage looks like every user in the system suddenly typing wrong codes, and
 * NOTHING in the response distinguishes it. The signal has to be a metric, which
 * is an infra deliverable this slice does not own. This file is what makes sure
 * the silence is deliberate rather than accidental.
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

describe('key unavailable fails closed (FR-017, SC-009)', () => {
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

  async function attempt(identity: SeededAuthIdentity, code: string) {
    signInOriginThrottle.reset();
    const credential = await request(server())
      .post('/auth/sign-in')
      .send({ email: identity.email, password: TEST_CREDENTIAL });
    return request(server())
      .post('/auth/factor')
      .send({ challengeToken: credential.body.challengeToken, code });
  }

  /** Points the stored factor at a key this process does not hold. */
  async function breakKey(identityId: string): Promise<void> {
    await migration.query(
      `UPDATE identity_factor SET key_reference = 'local:a-key-that-is-not-loaded' WHERE identity_id = $1`,
      [identityId],
    );
  }

  it('refuses a VALID code when the key is unavailable — it does not admit', async () => {
    // The direction that matters. Failing OPEN here would turn a key outage into
    // an authentication bypass for everyone at once.
    const identity = await seedAuthIdentity(migration, 'key-gone-valid');
    const code = await generateAt(identity.secret, Math.floor(Date.now() / 1000));
    await breakKey(identity.identityId);

    const response = await attempt(identity, code);
    expect(response.status).toBe(401);
    expect(response.body.accessToken).toBeUndefined();
  });

  it('THE REFUSAL IS BYTE-IDENTICAL TO A WRONG CODE', async () => {
    const broken = await seedAuthIdentity(migration, 'key-gone-uniform');
    const healthy = await seedAuthIdentity(migration, 'key-ok-uniform');
    const validForBroken = await generateAt(broken.secret, Math.floor(Date.now() / 1000));
    await breakKey(broken.identityId);

    const keyOutage = await attempt(broken, validForBroken);
    const wrongCode = await attempt(healthy, '000000');

    expect(keyOutage.status).toBe(wrongCode.status);
    expect(JSON.stringify(keyOutage.body)).toBe(JSON.stringify(wrongCode.body));
  });

  it('the response leaks nothing about keys, encryption or the outage', async () => {
    const identity = await seedAuthIdentity(migration, 'key-gone-silent');
    const code = await generateAt(identity.secret, Math.floor(Date.now() / 1000));
    await breakKey(identity.identityId);

    const response = await attempt(identity, code);
    const body = JSON.stringify(response.body).toLowerCase();
    for (const leak of ['key', 'llave', 'kms', 'decrypt', 'cipher', 'unavailable', 'unwrap']) {
      expect(body, leak).not.toContain(leak);
    }
  });

  it('a key outage still counts toward the lockout, like any other failure', async () => {
    // Consistency with the replay guard's reasoning: a failure the attacker can
    // induce must not be an unthrottled probe. It also means an outage does not
    // silently reset anyone's counter.
    const identity = await seedAuthIdentity(migration, 'key-gone-counts');
    const code = await generateAt(identity.secret, Math.floor(Date.now() / 1000));
    await breakKey(identity.identityId);

    await attempt(identity, code);
    const { rows } = await migration.query<{ n: number }>(
      `SELECT failed_attempt_count AS n FROM identity_factor WHERE identity_id = $1`,
      [identity.identityId],
    );
    expect(rows[0]!.n).toBeGreaterThanOrEqual(1);
  });

  it('restoring the key restores sign-in — the failure is closed, not permanent', async () => {
    const identity = await seedAuthIdentity(migration, 'key-restored');
    await breakKey(identity.identityId);
    await attempt(identity, await generateAt(identity.secret, Math.floor(Date.now() / 1000)));

    await migration.query(
      `UPDATE identity_factor SET key_reference = 'local:env', failed_attempt_count = 0, locked_until = NULL
        WHERE identity_id = $1`,
      [identity.identityId],
    );

    const response = await attempt(
      identity,
      await generateAt(identity.secret, Math.floor(Date.now() / 1000) + 30),
    );
    expect(response.status).toBe(201);
  });
});
