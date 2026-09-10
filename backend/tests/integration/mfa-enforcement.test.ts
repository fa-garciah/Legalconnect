/**
 * T044 — **BLOCKING (SC-029)**. SC-001, SC-002, SC-003.
 *
 * The constitution puts this on the same footing as tenant isolation, and says
 * why in terms this file has to honour: "authentication is covered" IN AGGREGATE
 * does not discharge it. Each assertion below is a single misconfiguration that
 * would leave every other test in this repository green while the protection was
 * absent — which is precisely the property that put tenant isolation on that list.
 *
 * Four claims, stated as counts because that is how SC-001 to SC-003 are written:
 *
 *   100% of sign-ins demand a second factor
 *     0 complete on a credential alone, across every archetype
 *     0 sessions exist before both steps succeed
 *     0 tenant-scoped resources are reachable by an unenrolled identity
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createUnauthenticatedApp } from '../helpers/real-app';
import { seededTenantIds, type SeededTenants } from '../helpers/tenants';
import { connectAs } from '../helpers/db';
import { hashCredential } from '../../src/common/auth/argon2';
import { LocalKeyProvider } from '../../src/common/auth/key-provider';
import { generateSecret, generateAt } from '../../src/common/auth/totp';
import { signInOriginThrottle } from '../../src/common/auth/origin-throttle';

const CREDENTIAL = 'una-contrasena-larga-de-prueba';
/** Every internal archetype. SC-001's "across every archetype" is literal. */
const ARCHETYPES = ['MP', 'AA', 'PL', 'CM', 'BM', 'SA'] as const;

interface Enrolled {
  identityId: string;
  email: string;
  secret: string;
}

describe('MFA enforcement — BLOCKING (SC-029)', () => {
  let app: INestApplication;
  let migration: Client;
  let tenants: SeededTenants;
  const enrolled: Record<string, Enrolled> = {};
  let unenrolled: { identityId: string; email: string };

  async function seedIdentity(label: string, withFactor: boolean): Promise<Enrolled> {
    const suffix = `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const email = `mfa-${suffix}@example.com`;
    const { rows } = await migration.query<{ id: string }>(
      `INSERT INTO identity (subject, email) VALUES ($1, $2) RETURNING id`,
      [`lc|${suffix}`, email],
    );
    const identityId = rows[0]!.id;

    await migration.query(`INSERT INTO identity_credential (identity_id, digest) VALUES ($1, $2)`, [
      identityId,
      await hashCredential(CREDENTIAL),
    ]);

    const secret = generateSecret();
    if (withFactor) {
      const provider = new LocalKeyProvider(process.env.AUTH_LOCAL_KEY!, 'local:env');
      const wrapped = await provider.wrap(Buffer.from(secret, 'utf8'));
      await migration.query(
        `INSERT INTO identity_factor (identity_id, secret_ciphertext, key_reference, confirmed_at)
         VALUES ($1, $2, $3, now())`,
        [identityId, wrapped.ciphertext, wrapped.keyReference],
      );
      await migration.query(`UPDATE identity SET mfa_enrolled_at = now() WHERE id = $1`, [identityId]);
    }
    return { identityId, email, secret };
  }

  beforeAll(async () => {
    // The UNAUTHENTICATED app deliberately: this suite must not be able to reach
    // anything through the test-only stand-in, or it would prove nothing about
    // what a real caller can do.
    app = await createUnauthenticatedApp();
    migration = await connectAs('migration');
    tenants = await seededTenantIds();

    for (const archetype of ARCHETYPES) {
      const seeded = await seedIdentity(archetype.toLowerCase(), true);
      await migration.query(
        `INSERT INTO membership (identity_id, tenant_id, archetype) VALUES ($1, $2, $3)`,
        [seeded.identityId, tenants.a, archetype],
      );
      enrolled[archetype] = seeded;
    }

    const none = await seedIdentity('unenrolled', false);
    await migration.query(
      `INSERT INTO membership (identity_id, tenant_id, archetype) VALUES ($1, $2, 'AA')`,
      [none.identityId, tenants.a],
    );
    unenrolled = none;
  });

  afterAll(async () => {
    await app.close();
    await migration.end();
  });

  const signIn = (email: string, password = CREDENTIAL) => {
    // Every request in this file arrives from 127.0.0.1, so the per-origin
    // throttle would refuse the sixth sign-in and this suite would be measuring
    // the throttle instead of the MFA gate. Cleared per call: the throttle is
    // best-effort by design (D7) and has its own coverage; what is being asserted
    // here is that a second factor is demanded, which must hold at any rate.
    signInOriginThrottle.reset();
    return request(app.getHttpServer()).post('/auth/sign-in').send({ email, password });
  };

  const liveSessions = async (identityId: string): Promise<number> => {
    const { rows } = await migration.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM session WHERE identity_id = $1 AND revoked_at IS NULL`,
      [identityId],
    );
    return Number(rows[0]!.n);
  };

  it('SC-001 — 100% of sign-ins demand a second factor, across EVERY archetype', async () => {
    for (const archetype of ARCHETYPES) {
      const response = await signIn(enrolled[archetype]!.email);
      expect(response.status, `${archetype} credential step`).toBe(201);
      expect(response.body.next, `${archetype} next`).toBe('factor');
      // The credential step returns a challenge and NOTHING that could be used
      // as access. This product recognises no low-risk role.
      expect(response.body.accessToken).toBeUndefined();
      expect(response.body.refreshToken).toBeUndefined();
    }
  });

  it('SC-002 — 0 sign-ins complete on a credential alone, and 0 sessions exist before both steps', async () => {
    for (const archetype of ARCHETYPES) {
      const identity = enrolled[archetype]!;
      const before = await liveSessions(identity.identityId);
      const response = await signIn(identity.email);
      expect(response.status).toBe(201);
      // The assertion that matters: the credential verified, and still no session.
      expect(await liveSessions(identity.identityId)).toBe(before);
    }
  });

  it('a session exists ONLY after the second factor succeeds', async () => {
    const identity = enrolled.MP!;
    const before = await liveSessions(identity.identityId);

    const credential = await signIn(identity.email);
    expect(await liveSessions(identity.identityId)).toBe(before);

    const code = await generateAt(identity.secret, Math.floor(Date.now() / 1000));
    const factor = await request(app.getHttpServer())
      .post('/auth/factor')
      .send({ challengeToken: credential.body.challengeToken, code });

    expect(factor.status).toBe(201);
    expect(factor.body.accessToken).toBeTruthy();
    expect(await liveSessions(identity.identityId)).toBe(before + 1);
  });

  it('a correct credential with a WRONG second factor yields no session and no access', async () => {
    const identity = enrolled.AA!;
    const before = await liveSessions(identity.identityId);
    const credential = await signIn(identity.email);

    const factor = await request(app.getHttpServer())
      .post('/auth/factor')
      .send({ challengeToken: credential.body.challengeToken, code: '000000' });

    expect(factor.status).toBe(401);
    expect(factor.body.accessToken).toBeUndefined();
    expect(await liveSessions(identity.identityId)).toBe(before);
  });

  it('SC-003 — an UNENROLLED identity is routed to enrollment and reaches 0 tenant-scoped resources', async () => {
    const response = await signIn(unenrolled.email);
    expect(response.status).toBe(201);
    // FR-006. The unenrolled state resolves to enrollment or to refusal, never
    // to access.
    expect(response.body.next).toBe('enrollment');
    expect(response.body.accessToken).toBeUndefined();
    expect(await liveSessions(unenrolled.identityId)).toBe(0);

    // And nothing it holds reaches a tenant-scoped route.
    const scoped = await request(app.getHttpServer())
      .get('/tenant/invitations')
      .set('x-tenant-id', tenants.a);
    expect(scoped.status).toBe(401);
  });

  it('no unauthenticated request reaches a tenant-scoped route at all', async () => {
    for (const path of ['/tenant/invitations', '/identity/memberships']) {
      const response = await request(app.getHttpServer()).get(path).set('x-tenant-id', tenants.a);
      expect(response.status, path).toBe(401);
    }
  });

  it('THE CHALLENGE TOKEN IS SINGLE-USE — one credential verification yields one session', async () => {
    const identity = enrolled.PL!;
    const credential = await signIn(identity.email);
    const token = credential.body.challengeToken;
    const before = await liveSessions(identity.identityId);

    const code = await generateAt(identity.secret, Math.floor(Date.now() / 1000));
    const first = await request(app.getHttpServer())
      .post('/auth/factor')
      .send({ challengeToken: token, code });
    expect(first.status).toBe(201);

    // Replaying the token must not mint a second session, even with a code that
    // would otherwise be valid at this instant.
    const replay = await request(app.getHttpServer())
      .post('/auth/factor')
      .send({ challengeToken: token, code });
    expect(replay.status).toBe(401);
    expect(await liveSessions(identity.identityId)).toBe(before + 1);
  });

  it('the challenge token carries no identity the client can read', async () => {
    const identity = enrolled.CM!;
    const credential = await signIn(identity.email);
    const token: string = credential.body.challengeToken;
    expect(token).not.toContain(identity.identityId);
    expect(Buffer.from(token, 'base64url').toString('utf8')).not.toContain(identity.identityId);
  });

  it('NO configuration value alters any of the above — FR-007, asserted structurally', async () => {
    // The exhaustive inspection is T066's. This is the narrower claim this file
    // owns: the code path taken above consults nothing that could switch it off.
    // Asserted by reading the service source, because a behavioural test cannot
    // prove the ABSENCE of a branch nobody wrote a config value for.
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const source = readFileSync(
      join(__dirname, '..', '..', 'src', 'modules', 'auth', 'sign-in.service.ts'),
      'utf8',
    );
    // No environment read at all in the sign-in path.
    expect(source).not.toMatch(/process\.env/);
    // And no conditional that could skip the challenge.
    expect(source).not.toMatch(/skip.*challenge|challenge.*disabled|mfa.*enabled/i);
  });
});
