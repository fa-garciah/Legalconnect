/**
 * T092 — every audited action produces EXACTLY ONE entry. SC-022, SC-023.
 *
 * Two failure modes, opposite in shape and both silent:
 *
 *   MISSING — the event happened and the log does not say so. While the primary
 *   factor stays phishable this log is the only detection net the product has
 *   (Recognised Technical Debt item 1), so a missing entry is a blind spot in
 *   the one place there is nothing else looking.
 *
 *   DUPLICATED — the same event twice. Less obviously harmful and worse in a
 *   specific way: it makes counting meaningless. "Five failed attempts" is the
 *   figure a human reads when deciding whether an account was attacked, and a
 *   double-writing path turns two attempts into that number.
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

const AUTH_ACTIONS = [
  'signin.succeeded',
  'signin.failed',
  'challenge.failed',
  'account.locked',
  'enrollment.started',
  'enrollment.completed',
  'enrollment.failed',
  'factor.replaced',
  'backup_codes.issued',
  'backup_code.consumed',
  'backup_codes.exhausted',
  'backup_codes.reissued',
];

describe('authentication audit completeness (SC-022, SC-023)', () => {
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

  async function entriesFor(identityId: string): Promise<Record<string, number>> {
    const { rows } = await migration.query<{ action: string; n: string }>(
      `SELECT action, count(*)::text AS n FROM audit_event
        WHERE target_id = $1 OR actor_identity_id = $1 GROUP BY action`,
      [identityId],
    );
    return Object.fromEntries(rows.map((row) => [row.action, Number(row.n)]));
  }

  async function credentialStep(identity: SeededAuthIdentity) {
    signInOriginThrottle.reset();
    return request(server())
      .post('/auth/sign-in')
      .send({ email: identity.email, password: TEST_CREDENTIAL });
  }

  it('a successful sign-in writes exactly one signin.succeeded', async () => {
    const identity = await seedAuthIdentity(migration, 'audit-success');
    const credential = await credentialStep(identity);
    await request(server())
      .post('/auth/factor')
      .send({
        challengeToken: credential.body.challengeToken,
        code: await generateAt(identity.secret, Math.floor(Date.now() / 1000)),
      });

    const entries = await entriesFor(identity.identityId);
    expect(entries['signin.succeeded']).toBe(1);
    // And no failure was recorded alongside it.
    expect(entries['signin.failed']).toBeUndefined();
    expect(entries['challenge.failed']).toBeUndefined();
  });

  it('a wrong credential writes exactly one signin.failed', async () => {
    const identity = await seedAuthIdentity(migration, 'audit-wrong-credential');
    signInOriginThrottle.reset();
    await request(server())
      .post('/auth/sign-in')
      .send({ email: identity.email, password: 'una-contrasena-equivocada' });

    const entries = await entriesFor(identity.identityId);
    expect(entries['signin.failed']).toBe(1);
  });

  it('a wrong second factor writes exactly one challenge.failed and NO signin.failed', async () => {
    // The two are distinct events at distinct steps. Conflating them would make
    // it impossible to tell a credential-guessing attempt from somebody
    // fumbling their authenticator.
    const identity = await seedAuthIdentity(migration, 'audit-wrong-factor');
    const credential = await credentialStep(identity);
    await request(server())
      .post('/auth/factor')
      .send({ challengeToken: credential.body.challengeToken, code: '000000' });

    const entries = await entriesFor(identity.identityId);
    expect(entries['challenge.failed']).toBe(1);
    expect(entries['signin.failed']).toBeUndefined();
  });

  it('a lockout writes exactly one account.locked, not one per later attempt', async () => {
    // The duplication case that matters most. If every refused attempt during a
    // lockout wrote account.locked, the log would show a dozen lockouts where
    // there was one, and the count a human reads would be fiction.
    const identity = await seedAuthIdentity(migration, 'audit-lockout');
    for (let attempt = 1; attempt <= 7; attempt += 1) {
      const credential = await credentialStep(identity);
      if (credential.body.challengeToken) {
        await request(server())
          .post('/auth/factor')
          .send({ challengeToken: credential.body.challengeToken, code: '000000' });
      }
    }

    const entries = await entriesFor(identity.identityId);
    expect(entries['account.locked']).toBe(1);
  });

  it('a full enrollment writes started, completed and issued — one each', async () => {
    const identity = await seedAuthIdentity(migration, 'audit-enrollment', { factor: false });
    const credential = await credentialStep(identity);
    const started = await request(server())
      .post('/auth/enrollment/begin')
      .send({ challengeToken: credential.body.challengeToken });
    await request(server())
      .post('/auth/enrollment/confirm')
      .send({
        enrollmentToken: started.body.enrollmentToken,
        code: await generateAt(started.body.secret, Math.floor(Date.now() / 1000)),
      });

    const entries = await entriesFor(identity.identityId);
    expect(entries['enrollment.started']).toBe(1);
    expect(entries['enrollment.completed']).toBe(1);
    expect(entries['backup_codes.issued']).toBe(1);
  });

  it('0 ENTRIES CONTAIN AN EMAIL, A CONTACT DETAIL OR ANY FACTOR MATERIAL (SC-023)', async () => {
    // FR-043 and FR-045. Scoped to entries THIS FILE produced rather than swept
    // database-wide — the third time that lesson has come up in this slice, so
    // it is stated once more here: other suites insert audit rows directly to
    // prove grants, and a global sweep measures those fixtures alongside the
    // product. Scoping also keeps the assertion independent of which suites ran
    // before it, which a shared database otherwise makes it depend on.
    const identity = await seedAuthIdentity(migration, 'audit-no-pii');
    const credential = await credentialStep(identity);
    await request(server())
      .post('/auth/factor')
      .send({
        challengeToken: credential.body.challengeToken,
        code: await generateAt(identity.secret, Math.floor(Date.now() / 1000)),
      });

    const { rows } = await migration.query<{ blob: string }>(
      `SELECT coalesce(string_agg(metadata::text, ' '), '') AS blob
         FROM audit_event
        WHERE (target_id = $1 OR actor_identity_id = $1) AND action = ANY($2)`,
      [identity.identityId, AUTH_ACTIONS],
    );
    const blob = rows[0]!.blob;
    expect(blob).not.toContain('@');
    expect(blob).not.toMatch(/\$argon2id\$/);
    // No six-digit run, which is what a TOTP code looks like.
    expect(blob).not.toMatch(/\b\d{6}\b/);
  });

  it('every authentication entry carries tenant_id NULL (D12)', async () => {
    // This one CAN stay database-wide: the policy in migration 0030 asserts
    // `tenant_id IS NULL` in its WITH CHECK, so no role can write one of these
    // twelve actions against a tenant even deliberately. A row here would mean
    // the policy was gone, whoever wrote it.
    const { rows } = await migration.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM audit_event
        WHERE tenant_id IS NOT NULL AND action = ANY($1)`,
      [AUTH_ACTIONS],
    );
    expect(Number(rows[0]!.n)).toBe(0);
  });

  it('every entry THE PRODUCT WRITES names its identity by reference', async () => {
    // Scoped to one real flow rather than swept database-wide, and the reason
    // is the same one that scoped the enrollment invariant:
    // auth-audit-actions.test.ts (T039) inserts each of the twelve actions
    // DIRECTLY with no target, because proving lc_auth may write them is its
    // whole job. Those rows are fixtures, and a global assertion would be
    // measuring that test instead of this behaviour.
    //
    // A log that recorded the events but not who they were about would satisfy
    // every assertion above and be useless for what Principle V wants it for.
    const identity = await seedAuthIdentity(migration, 'audit-reference', { factor: false });
    const credential = await credentialStep(identity);
    const started = await request(server())
      .post('/auth/enrollment/begin')
      .send({ challengeToken: credential.body.challengeToken });
    await request(server())
      .post('/auth/enrollment/confirm')
      .send({
        enrollmentToken: started.body.enrollmentToken,
        code: await generateAt(started.body.secret, Math.floor(Date.now() / 1000)),
      });

    const { rows } = await migration.query<{ action: string; has_reference: boolean }>(
      `SELECT action, (target_id IS NOT NULL OR actor_identity_id IS NOT NULL) AS has_reference
         FROM audit_event
        WHERE (target_id = $1 OR actor_identity_id = $1) AND action = ANY($2)`,
      [identity.identityId, AUTH_ACTIONS],
    );

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.has_reference, row.action).toBe(true);
    }
  });

  it('the unknown-email refusal IS still audited, with no identity to name', async () => {
    // The one case that legitimately carries no reference: there is no
    // identity. Auditing it anyway is what lets a platform-level read see
    // scanning activity without any tenant's log being touched.
    const before = await migration.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM audit_event
        WHERE action = 'signin.failed' AND target_id IS NULL`,
    );

    signInOriginThrottle.reset();
    await request(server())
      .post('/auth/sign-in')
      .send({ email: `nobody-${Date.now()}@example.com`, password: 'irrelevante-pero-larga' });

    const after = await migration.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM audit_event
        WHERE action = 'signin.failed' AND target_id IS NULL`,
    );
    expect(Number(after.rows[0]!.n)).toBe(Number(before.rows[0]!.n) + 1);
  });
});
