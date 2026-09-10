/**
 * T085 — the five properties of forced re-enrollment. FR-032, SC-015, SC-033.
 *
 * `tests/contract/recovery.test.ts` covers the happy path and the wire shape.
 * This covers the five that are easy to leave out because each is about
 * something NOT happening.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createUnauthenticatedApp } from '../helpers/real-app';
import { connectAs } from '../helpers/db';
import { expectRoutes } from '../helpers/routes';
import { seedAuthIdentity, TEST_CREDENTIAL } from '../helpers/auth-seed';
import { generateAt } from '../../src/common/auth/totp';
import { signInOriginThrottle } from '../../src/common/auth/origin-throttle';

interface Recoverable {
  identityId: string;
  email: string;
  codes: string[];
}

describe('forced re-enrollment (FR-032, SC-015, SC-033)', () => {
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

  async function enrolled(label: string): Promise<Recoverable> {
    const identity = await seedAuthIdentity(migration, label, { factor: false });
    signInOriginThrottle.reset();
    const credential = await request(server())
      .post('/auth/sign-in')
      .send({ email: identity.email, password: TEST_CREDENTIAL });
    const started = await request(server())
      .post('/auth/enrollment/begin')
      .send({ challengeToken: credential.body.challengeToken });
    const confirmed = await request(server())
      .post('/auth/enrollment/confirm')
      .send({
        enrollmentToken: started.body.enrollmentToken,
        code: await generateAt(started.body.secret, Math.floor(Date.now() / 1000)),
      });
    return {
      identityId: identity.identityId,
      email: identity.email,
      codes: confirmed.body.backupCodes as string[],
    };
  }

  async function challenge(email: string): Promise<string> {
    signInOriginThrottle.reset();
    const response = await request(server())
      .post('/auth/sign-in')
      .send({ email, password: TEST_CREDENTIAL });
    return response.body.challengeToken as string;
  }

  const recover = (challengeToken: string, backupCode: string) =>
    request(server()).post('/auth/recovery/backup-code').send({ challengeToken, backupCode });

  it('recovery-path re-issuance requires 0 STEP-UP CHECKS', async () => {
    // Step-up MFA is 005's, and it is not built. If recovery required it, the
    // path would be unreachable — a person who has lost their authenticator
    // cannot satisfy a step-up challenge, which is the same second factor they
    // no longer have. FR-032 carves this out for exactly that reason.
    const person = await enrolled('reenroll-no-stepup');
    const response = await recover(await challenge(person.email), person.codes[0]!);
    expect(response.status).toBe(201);
    expect(response.body.enrollmentToken).toBeTruthy();
  });

  it('STANDALONE re-issuance is reachable from 0 production surfaces (FR-032)', async () => {
    // A person may not simply ask for ten fresh codes. That would be a
    // capability requiring step-up MFA, which 005 owns and has not built — so
    // rather than shipping it ungated, it does not exist. It arrives only as
    // part of a recovery, where a code was already spent to get here.
    const paths = expectRoutes(app).map((route) => route.path);
    const reissue = paths.filter((path) => /reissue|regenerate|new-codes|nuevos-codigos/i.test(path));
    expect(reissue).toEqual([]);
  });

  it('THE PREVIOUS FACTOR NO LONGER SATISFIES A CHALLENGE (SC-015)', async () => {
    const person = await enrolled('reenroll-old-dead');
    await recover(await challenge(person.email), person.codes[0]!);

    const { rows } = await migration.query<{ confirmed: boolean; enrolled: boolean }>(
      `SELECT (f.confirmed_at IS NOT NULL) AS confirmed, (i.mfa_enrolled_at IS NOT NULL) AS enrolled
         FROM identity_factor f JOIN identity i ON i.id = f.identity_id
        WHERE f.identity_id = $1`,
      [person.identityId],
    );
    // Retired the instant the code was spent, not when the new factor lands.
    expect(rows[0]).toEqual({ confirmed: false, enrolled: false });
  });

  it('ABANDONING re-enrollment leaves no access and an unenrolled identity (SC-016)', async () => {
    // Somebody who spends a code and then closes the tab. They must not be
    // half-recovered: no session, nothing reachable, and the old factor
    // already gone so a thief holding the phone cannot use it either.
    const person = await enrolled('reenroll-abandoned');
    await recover(await challenge(person.email), person.codes[0]!);

    const { rows } = await migration.query<{ sessions: string; codes: string }>(
      `SELECT (SELECT count(*)::text FROM session WHERE identity_id = $1 AND revoked_at IS NULL) AS sessions,
              (SELECT count(*)::text FROM backup_code WHERE identity_id = $1) AS codes`,
      [person.identityId],
    );
    expect(rows[0]!.sessions).toBe('0');
    // The whole prior set is gone with the factor (FR-028), so nine leftover
    // codes cannot be used to recover again without completing this one.
    expect(rows[0]!.codes).toBe('0');
  });

  it('AN IDENTITY WITH ALL 10 CONSUMED IS REFUSED, WITH NO ALTERNATIVE OFFERED (SC-033)', async () => {
    // The hardest case in the product, and the constitution is explicit that
    // it must stay hard: "no internal role may reset an external user's factor
    // without documented out-of-band verification... a phone call cannot be
    // allowed to unlock access to a case file."
    //
    // So a person who has spent all ten and lost their authenticator is
    // genuinely locked out, and the product offers them nothing — because
    // anything it offered would be the weakest link in the whole design.
    const person = await enrolled('reenroll-exhausted');
    await migration.query(
      `UPDATE backup_code SET consumed_at = now() WHERE identity_id = $1`,
      [person.identityId],
    );

    const response = await recover(await challenge(person.email), person.codes[0]!);
    expect(response.status).toBe(401);

    // And the refusal offers nothing — no support address, no reset link, no
    // hint that a human could help.
    const body = JSON.stringify(response.body).toLowerCase();
    for (const offer of ['soporte', 'support', 'contact', 'restablec', 'ayuda', 'administrador']) {
      expect(body, offer).not.toContain(offer);
    }
  });

  it('NO ARCHETYPE HOLDS A FACTOR-RESET CAPABILITY — not SA, not PO', async () => {
    // The structural half of the assertion above. If such a capability
    // existed, the refusal would be a routing choice rather than a property.
    const registry = readFileSync(
      join(__dirname, '..', '..', 'src', 'common', 'authz', 'capability.ts'),
      'utf8',
    );
    expect(registry).not.toMatch(/reset[_.]?(mfa|factor)|factor[_.]?reset/i);

    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (full.endsWith('.ts')) files.push(full);
      }
    };
    walk(join(__dirname, '..', '..', 'src'));

    for (const file of files) {
      const code = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      expect(code, file).not.toMatch(/resetFactor|resetMfa|clearFactor/i);
    }
  });
});
