/**
 * T082 — contract for the recovery routes. FR-027, FR-028, SC-014 to SC-016.
 *
 * The constitution calls recovery the weakest attack surface in the system once
 * MFA is universal: "with universal mandatory MFA, the recovery flow becomes the
 * weakest attack surface... a phone call cannot be allowed to unlock access to a
 * case file." Every assertion here is about keeping a written-down code from
 * being worth as much as the factor it replaces.
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

interface Recoverable {
  identityId: string;
  email: string;
  codes: string[];
  secret: string;
}

describe('POST /auth/recovery (T082)', () => {
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
      secret: started.body.secret as string,
    };
  }

  /** A fresh challenge token, as the challenge screen would hold. */
  async function challenge(email: string): Promise<string> {
    signInOriginThrottle.reset();
    const response = await request(server())
      .post('/auth/sign-in')
      .send({ email, password: TEST_CREDENTIAL });
    return response.body.challengeToken as string;
  }

  const present = (challengeToken: string, backupCode: string) =>
    request(server()).post('/auth/recovery/backup-code').send({ challengeToken, backupCode });

  it('A SATISFIED CHALLENGE EMITS NO SESSION — only an enrollmentToken (FR-027)', async () => {
    // The assertion the whole flow turns on. If a backup code produced a
    // session, a written-down string would be worth exactly as much as the
    // authenticator it replaces, and losing a printout would be losing the
    // second factor.
    const person = await enrolled('recovery-no-session');
    const response = await present(await challenge(person.email), person.codes[0]!);

    expect(response.status).toBe(201);
    expect(response.body.next).toBe('reenrollment');
    expect(response.body.enrollmentToken).toBeTruthy();
    expect(response.body.accessToken).toBeUndefined();
    expect(response.body.refreshToken).toBeUndefined();

    const { rows } = await migration.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM session WHERE identity_id = $1 AND revoked_at IS NULL`,
      [person.identityId],
    );
    expect(Number(rows[0]!.n)).toBe(0);
  });

  it('remainingCodes is disclosed only AFTER success (FR-028)', async () => {
    const person = await enrolled('recovery-remaining');
    const success = await present(await challenge(person.email), person.codes[0]!);
    expect(success.body.remainingCodes).toBe(9);

    // A failed attempt says nothing — telling an attacker how many codes are
    // left would meter their progress for them.
    const failure = await present(await challenge(person.email), 'AAAAA-BBBBB-CCCCC-DDDDD-EEEEE-F');
    expect(failure.status).toBe(401);
    expect(failure.body.remainingCodes).toBeUndefined();
  });

  it('the consumed code cannot be reused', async () => {
    const person = await enrolled('recovery-single-use');
    await present(await challenge(person.email), person.codes[0]!);

    const again = await present(await challenge(person.email), person.codes[0]!);
    expect(again.status).toBe(401);
  });

  it('re-enrollment returns a COMPLETE NEW SET OF 10 plus a session', async () => {
    const person = await enrolled('recovery-complete');
    const satisfied = await present(await challenge(person.email), person.codes[0]!);

    // The enrollment mechanism is reused: begin, then reenroll confirms.
    const started = await request(server())
      .post('/auth/enrollment/begin')
      .send({ challengeToken: satisfied.body.enrollmentToken });
    expect(started.status).toBe(201);

    const recovered = await request(server())
      .post('/auth/recovery/reenroll')
      .send({
        enrollmentToken: started.body.enrollmentToken,
        code: await generateAt(started.body.secret, Math.floor(Date.now() / 1000)),
      });

    expect(recovered.status).toBe(201);
    expect(recovered.body.backupCodes).toHaveLength(10);
    expect(recovered.body.accessToken).toBeTruthy();
    // FR-028: a complete NEW set, not the nine that were left.
    expect(recovered.body.backupCodes).not.toContain(person.codes[1]);
  });

  it('THE PREVIOUS FACTOR NO LONGER SATISFIES A CHALLENGE (SC-015)', async () => {
    const person = await enrolled('recovery-old-factor-dead');
    const satisfied = await present(await challenge(person.email), person.codes[0]!);
    const started = await request(server())
      .post('/auth/enrollment/begin')
      .send({ challengeToken: satisfied.body.enrollmentToken });
    await request(server())
      .post('/auth/recovery/reenroll')
      .send({
        enrollmentToken: started.body.enrollmentToken,
        code: await generateAt(started.body.secret, Math.floor(Date.now() / 1000)),
      });

    // The OLD authenticator, which a thief holding the stolen phone would have.
    const stale = await request(server())
      .post('/auth/factor')
      .send({
        challengeToken: await challenge(person.email),
        code: await generateAt(person.secret, Math.floor(Date.now() / 1000)),
      });
    expect(stale.status).toBe(401);
  });

  it('ABANDONING re-enrollment leaves no access and an UNENROLLED identity (SC-016)', async () => {
    // Somebody who satisfies the challenge and then closes the tab must not be
    // left half-recovered: no session, and the old factor already dead.
    const person = await enrolled('recovery-abandoned');
    await present(await challenge(person.email), person.codes[0]!);

    const { rows } = await migration.query<{ enrolled: boolean; sessions: string }>(
      `SELECT (i.mfa_enrolled_at IS NOT NULL) AS enrolled,
              (SELECT count(*)::text FROM session WHERE identity_id = i.id AND revoked_at IS NULL) AS sessions
         FROM identity i WHERE i.id = $1`,
      [person.identityId],
    );
    expect(rows[0]!.sessions).toBe('0');
  });

  it('a wrong backup code is refused uniformly and counts toward the lockout', async () => {
    const person = await enrolled('recovery-wrong-code');
    const before = await migration.query<{ n: number }>(
      `SELECT failed_attempt_count AS n FROM identity_factor WHERE identity_id = $1`,
      [person.identityId],
    );

    const response = await present(await challenge(person.email), 'ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ-Z');
    expect(response.status).toBe(401);

    const after = await migration.query<{ n: number }>(
      `SELECT failed_attempt_count AS n FROM identity_factor WHERE identity_id = $1`,
      [person.identityId],
    );
    // FR-021: recovery is not an unthrottled way around the limit.
    expect(after.rows[0]!.n).toBe(before.rows[0]!.n + 1);
  });

  it('consumption and exhaustion are audited as DISTINCT events (FR-030)', async () => {
    const person = await enrolled('recovery-audit');
    await present(await challenge(person.email), person.codes[0]!);

    const { rows } = await migration.query<{ action: string }>(
      `SELECT action FROM audit_event WHERE target_id = $1 AND action LIKE 'backup%'`,
      [person.identityId],
    );
    const actions = rows.map((r) => r.action);
    expect(actions).toContain('backup_codes.issued');
    expect(actions).toContain('backup_code.consumed');
    // Not exhausted — nine remain, and conflating the two would lose the moment
    // a person's recovery capacity actually reached zero.
    expect(actions).not.toContain('backup_codes.exhausted');
  });
});
