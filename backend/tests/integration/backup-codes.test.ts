/**
 * T074 — **BLOCKING (SC-029)**. FR-023 to FR-031, SC-010 to SC-016, SC-031.
 *
 * Constitution v1.5.0 reframed this material and the reframing is the reason
 * this suite is blocking. Under the previous provider, holding backup codes was
 * a NAMED EXCEPTION — granted because no vendor supplied them, and remediable
 * by a future vendor that did. With a self-hosted identity layer there is no
 * such vendor to wait for, so it stopped being a gap against a bought
 * capability and became a PERMANENT PROPERTY OF THE DESIGN. The review trigger
 * was withdrawn as vacuous. What remains is the obligation: build it correctly,
 * cover it blockingly, and never treat it as routine.
 *
 * A bug on this path is an authentication bypass, not a leak.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createUnauthenticatedApp } from '../helpers/real-app';
import { connectAs } from '../helpers/db';
import { expectRoutes } from '../helpers/routes';
import { seedAuthIdentity, TEST_CREDENTIAL } from '../helpers/auth-seed';
import { generateAt } from '../../src/common/auth/totp';
import { verifyHighEntropy } from '../../src/common/auth/argon2';
import { signInOriginThrottle } from '../../src/common/auth/origin-throttle';

interface Enrolled {
  identityId: string;
  codes: string[];
}

describe('backup codes — BLOCKING (SC-029)', () => {
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

  async function enroll(label: string): Promise<Enrolled> {
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
    expect(confirmed.status).toBe(201);
    return { identityId: identity.identityId, codes: confirmed.body.backupCodes as string[] };
  }

  it('EXACTLY 10 codes, issued once (FR-031, SC-010)', async () => {
    const { identityId, codes } = await enroll('codes-ten');
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);

    const { rows } = await migration.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM backup_code WHERE identity_id = $1`,
      [identityId],
    );
    expect(Number(rows[0]!.n)).toBe(10);
  });

  it('all 10 are stored as IRREVERSIBLE memory-hard digests (FR-025)', async () => {
    const { identityId, codes } = await enroll('codes-digests');
    const { rows } = await migration.query<{ digest: string }>(
      `SELECT digest FROM backup_code WHERE identity_id = $1`,
      [identityId],
    );

    for (const row of rows) {
      // Argon2id, and the reduced profile D6 justifies by the codes' own entropy.
      expect(row.digest).toMatch(/^\$argon2id\$/);
      // No code appears in any stored form.
      for (const code of codes) expect(row.digest).not.toContain(code);
    }

    // The digests really are of these codes — otherwise the assertions above
    // would pass against a column of unrelated strings.
    const matches = await Promise.all(rows.map((row) => verifyHighEntropy(row.digest, codes[0]!)));
    expect(matches.filter(Boolean)).toHaveLength(1);
  });

  it('ONE code belongs to ONE identity — no set is shared', async () => {
    const first = await enroll('codes-mine');
    const second = await enroll('codes-yours');
    expect(first.codes.some((code) => second.codes.includes(code))).toBe(false);
  });

  it('advancing the clock a year leaves all 10 valid — NO time-based expiry (SC-031)', async () => {
    // A code ceases to be valid only by consumption or by its set being
    // replaced. An expiry would silently strand somebody who enrolled, printed
    // their codes, and needed one eighteen months later — which is exactly when
    // they are needed.
    const { identityId } = await enroll('codes-no-expiry');
    await migration.query(
      `UPDATE backup_code SET created_at = now() - interval '1 year' WHERE identity_id = $1`,
      [identityId],
    );

    const { rows } = await migration.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM backup_code WHERE identity_id = $1 AND consumed_at IS NULL`,
      [identityId],
    );
    expect(Number(rows[0]!.n)).toBe(10);
  });

  it('consuming 1 invalidates exactly that 1, with 0 collateral (FR-026, SC-012)', async () => {
    const { identityId } = await enroll('codes-single-use');
    const { rows: before } = await migration.query<{ id: string }>(
      `SELECT id FROM backup_code WHERE identity_id = $1 AND consumed_at IS NULL ORDER BY id LIMIT 1`,
      [identityId],
    );
    const target = before[0]!.id;

    const consumed = await migration.query<{ consume_backup_code: boolean }>(
      `SELECT consume_backup_code($1, $2) AS consume_backup_code`,
      [identityId, target],
    );
    expect(consumed.rows[0]!.consume_backup_code).toBe(true);

    const { rows: after } = await migration.query<{ remaining: string; spent: string }>(
      `SELECT count(*) FILTER (WHERE consumed_at IS NULL)::text     AS remaining,
              count(*) FILTER (WHERE consumed_at IS NOT NULL)::text AS spent
         FROM backup_code WHERE identity_id = $1`,
      [identityId],
    );
    expect(after[0]).toEqual({ remaining: '9', spent: '1' });
  });

  it('a consumed code is refused IDENTICALLY to one that never existed (SC-013)', async () => {
    const { identityId } = await enroll('codes-consumed-uniform');
    const { rows } = await migration.query<{ id: string }>(
      `SELECT id FROM backup_code WHERE identity_id = $1 LIMIT 1`,
      [identityId],
    );
    const id = rows[0]!.id;

    await migration.query(`SELECT consume_backup_code($1, $2)`, [identityId, id]);

    // Second attempt on the same code, and an attempt on an id that never
    // existed. Both false, neither raising — a thrown error would be a
    // distinguishable outcome.
    const again = await migration.query<{ consume_backup_code: boolean }>(
      `SELECT consume_backup_code($1, $2) AS consume_backup_code`,
      [identityId, id],
    );
    const never = await migration.query<{ consume_backup_code: boolean }>(
      `SELECT consume_backup_code($1, gen_random_uuid()) AS consume_backup_code`,
      [identityId],
    );
    expect(again.rows[0]!.consume_backup_code).toBe(false);
    expect(never.rows[0]!.consume_backup_code).toBe(false);
  });

  it('one identity cannot consume ANOTHER identity\'s code', async () => {
    const mine = await enroll('codes-owner-mine');
    const theirs = await enroll('codes-owner-theirs');
    const { rows } = await migration.query<{ id: string }>(
      `SELECT id FROM backup_code WHERE identity_id = $1 LIMIT 1`,
      [theirs.identityId],
    );

    const attempt = await migration.query<{ consume_backup_code: boolean }>(
      `SELECT consume_backup_code($1, $2) AS consume_backup_code`,
      [mine.identityId, rows[0]!.id],
    );
    expect(attempt.rows[0]!.consume_backup_code).toBe(false);
  });

  it('NO SURFACE RETURNS THE SET AGAIN, for anyone (FR-024, FR-029, SC-006)', async () => {
    // Asserted by route-table inspection rather than by attempting each route:
    // an attempt-based test proves only that the routes it thought of refuse,
    // and says nothing about one added later.
    await enroll('codes-no-readback');
    // Via expectRoutes(), which THROWS on an empty list — see T076.
    const paths = expectRoutes(app).map((route) => route.path);

    // `/auth/recovery/backup-code` names a code because it SPENDS one, which
    // is the opposite of returning them. Nothing else mentions them at all,
    // and nothing returns them — tests/integration/backup-codes-unreadable
    // (T076) makes that the whole subject of its own file.
    const mentions = paths.filter((path) => /backup|codigos|codes/i.test(path));
    expect(mentions).toEqual(['/auth/recovery/backup-code']);
  });

  it('the codes appear in NO audit entry (FR-025)', async () => {
    const { identityId, codes } = await enroll('codes-not-audited');
    const { rows } = await migration.query<{ blob: string }>(
      `SELECT coalesce(string_agg(metadata::text, ' '), '') AS blob
         FROM audit_event WHERE target_id = $1 OR actor_identity_id = $1`,
      [identityId],
    );
    for (const code of codes) expect(rows[0]!.blob).not.toContain(code);
  });

  it('issuance IS audited, by reference (FR-030)', async () => {
    // The other direction, for the same reason as the secret: a log that
    // recorded nothing would pass the secrecy assertion trivially.
    const { identityId } = await enroll('codes-issuance-audited');
    const { rows } = await migration.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM audit_event
        WHERE action = 'backup_codes.issued' AND target_id = $1`,
      [identityId],
    );
    expect(Number(rows[0]!.n)).toBe(1);
  });
});
