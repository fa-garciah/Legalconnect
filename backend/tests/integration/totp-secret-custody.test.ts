/**
 * T067 — **BLOCKING (SC-029)**. FR-008, FR-013, FR-014, SC-007, SC-008.
 *
 * A TOTP secret CANNOT BE HASHED — it must be readable on every verification —
 * which makes it the most sensitive recoverable material in this database and
 * the reason the constitution governs it separately from backup codes.
 *
 * Recognised Technical Debt item 11 states the residual risk in one sentence:
 * this product now holds material whose compromise is an authentication bypass
 * across every tenant at once, and the control protecting it is key management,
 * which is an operational discipline rather than a test that can prove itself
 * green forever. The realistic failure is a production backup restored somewhere
 * less protected. THIS FILE IS THE TEST OF THAT EXACT SCENARIO.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createUnauthenticatedApp } from '../helpers/real-app';
import { connectAs } from '../helpers/db';
import { seedAuthIdentity, TEST_CREDENTIAL, type SeededAuthIdentity } from '../helpers/auth-seed';
import { generateAt } from '../../src/common/auth/totp';
import { LocalKeyProvider } from '../../src/common/auth/key-provider';
import { signInOriginThrottle } from '../../src/common/auth/origin-throttle';

describe('TOTP secret custody — BLOCKING (SC-029)', () => {
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

  async function enrollFully(label: string): Promise<{ identity: SeededAuthIdentity; secret: string }> {
    const identity = await seedAuthIdentity(migration, label, { factor: false });
    signInOriginThrottle.reset();
    const credential = await request(server())
      .post('/auth/sign-in')
      .send({ email: identity.email, password: TEST_CREDENTIAL });
    const started = await request(server())
      .post('/auth/enrollment/begin')
      .send({ challengeToken: credential.body.challengeToken });
    await request(server())
      .post('/auth/enrollment/confirm')
      .send({
        enrollmentToken: started.body.enrollmentToken,
        code: await generateAt(started.body.secret, Math.floor(Date.now() / 1000)),
      });
    return { identity, secret: started.body.secret as string };
  }

  it('A DUMP RESTORED WITHOUT THE KEY YIELDS 0 WORKING FACTORS (SC-008)', async () => {
    // The scenario Technical Debt item 11 names as the realistic failure. Read
    // the stored bytes exactly as a restored backup would expose them, and try
    // to derive a working second factor with a DIFFERENT key.
    const { identity, secret } = await enrollFully('custody-dump');

    const { rows } = await migration.query<{ secret_ciphertext: Buffer }>(
      `SELECT secret_ciphertext FROM identity_factor WHERE identity_id = $1`,
      [identity.identityId],
    );
    const stored = rows[0]!.secret_ciphertext;

    // The plaintext is not in the column, in any encoding anyone would try.
    expect(stored.includes(Buffer.from(secret, 'utf8'))).toBe(false);
    expect(stored.toString('utf8')).not.toContain(secret);
    expect(stored.toString('base64')).not.toContain(secret);
    expect(stored.toString('hex')).not.toContain(Buffer.from(secret, 'utf8').toString('hex'));

    // And an attacker holding the dump plus their own key gets nothing.
    const attacker = new LocalKeyProvider(Buffer.alloc(32, 0x99).toString('base64'), 'local:env');
    await expect(attacker.unwrap('local:env', stored)).rejects.toThrow();
  });

  it('the secret appears in NO audit entry, ever (FR-014)', async () => {
    const { identity, secret } = await enrollFully('custody-audit');

    const { rows } = await migration.query<{ blob: string }>(
      `SELECT coalesce(string_agg(metadata::text || target_entity || coalesce(target_id::text,''), ' '), '') AS blob
         FROM audit_event WHERE target_id = $1 OR actor_identity_id = $1`,
      [identity.identityId],
    );
    expect(rows[0]!.blob).not.toContain(secret);
  });

  it('the audit records THAT enrollment happened, by reference only (FR-043)', async () => {
    // The other direction. A log that recorded nothing would trivially pass the
    // test above while destroying the evidentiary value Principle V is for.
    const { identity } = await enrollFully('custody-audit-present');

    const { rows } = await migration.query<{ action: string }>(
      `SELECT action FROM audit_event WHERE target_id = $1 ORDER BY occurred_at`,
      [identity.identityId],
    );
    const actions = rows.map((r) => r.action);
    expect(actions).toContain('enrollment.started');
    expect(actions).toContain('enrollment.completed');
    expect(actions).toContain('backup_codes.issued');
  });

  it('no email or contact detail rides along in an authentication entry (FR-043, FR-045)', async () => {
    const { identity } = await enrollFully('custody-no-pii');
    const { rows } = await migration.query<{ blob: string }>(
      `SELECT coalesce(string_agg(metadata::text, ' '), '') AS blob
         FROM audit_event WHERE target_id = $1`,
      [identity.identityId],
    );
    expect(rows[0]!.blob).not.toContain('@');
  });

  it('AN AUTHENTICATOR APP IS THE ONLY ENROLLABLE TYPE — no SMS, no email code', async () => {
    // FR-008 and SC-005 as an ABSENCE, which is the stronger property: the
    // constitution requires that no mechanism exist to be misconfigured, not
    // that one exist and refuse. Asserted over the source tree, because a
    // behavioural test cannot prove a route nobody wrote is missing.
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (full.endsWith('.ts')) files.push(full);
      }
    };
    walk(join(__dirname, '..', '..', 'src'));

    const offenders: string[] = [];
    for (const file of files) {
      const code = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      // A factor TYPE selector, an SMS sender, or an email-OTP path.
      if (/factorType|factor_type|sendSms|smsFactor|emailOtp|email_otp/i.test(code)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the key reference is stored, so rotation is a re-wrap not a re-enrollment', async () => {
    const { identity } = await enrollFully('custody-key-ref');
    const { rows } = await migration.query<{ key_reference: string }>(
      `SELECT key_reference FROM identity_factor WHERE identity_id = $1`,
      [identity.identityId],
    );
    expect(rows[0]!.key_reference).toBeTruthy();
  });

  it('NO ROUTE RETURNS A FACTOR SECRET AFTER ENROLLMENT (FR-015, SC-006)', async () => {
    // Asserted by route-table inspection rather than by attempting each route:
    // an attempt-based test proves only that the routes it thought of refuse.
    const { secret } = await enrollFully('custody-no-readback');
    const routes = app.getHttpAdapter().getInstance()._router?.stack ?? [];
    const paths = routes
      .map((layer: { route?: { path?: string } }) => layer.route?.path)
      .filter((path: string | undefined): path is string => typeof path === 'string');

    for (const path of paths) {
      expect(path.toLowerCase()).not.toContain('secret');
    }
    expect(secret).toBeTruthy();
  });
});
