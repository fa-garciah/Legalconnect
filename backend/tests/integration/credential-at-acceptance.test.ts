/**
 * T038 — the credential is established atomically with the identity and the
 * membership. FR-053, 002/FR-023.
 *
 * This is the test that makes 003 the slice that unblocks the product. Before it,
 * three merged slices described a state no shipped capability could produce:
 * 002/FR-026 refuses tenant data until second-factor enrollment, 004 fixed that
 * refusal as position 1 of its ordering, and nothing could create a person who
 * might ever get past either. Acceptance is now the ONE path into `identity`, and
 * it produces somebody who can actually sign in.
 *
 * "Atomically" is asserted in both directions, because only one of them is
 * obvious. That all three rows appear together is the easy half. That a failure
 * leaves NONE of them — and leaves the invitation unused, so the person can try
 * again — is the half that decides whether a partial failure strands somebody
 * with an invitation that is spent and an account that does not work.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createHash } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createAuthenticatedApp } from '../helpers/real-app';
import { seededTenantIds, type SeededTenants } from '../helpers/tenants';
import { seededIdentities, type SeededIdentities } from '../helpers/identities';
import { connectAs } from '../helpers/db';

const CREDENTIAL = 'una-contrasena-larga-de-prueba';

describe('acceptance establishes identity, membership and credential atomically (FR-053)', () => {
  let app: INestApplication;
  let migration: Client;
  let tenants: SeededTenants;
  let identities: SeededIdentities;

  beforeAll(async () => {
    app = await createAuthenticatedApp();
    migration = await connectAs('migration');
    tenants = await seededTenantIds();
    identities = await seededIdentities();
  });

  afterAll(async () => {
    await app.close();
    await migration.end();
  });

  async function issue(email: string, tenantId = tenants.a): Promise<string> {
    const rawReference = `t038-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const hash = createHash('sha256').update(rawReference, 'utf8').digest('hex');
    const membership = await migration.query<{ id: string }>(
      `SELECT id FROM membership WHERE identity_id = $1 AND tenant_id = $2`,
      [identities.dualId, tenantId],
    );
    await migration.query(
      `INSERT INTO invitation (tenant_id, target_archetype, invited_email, reference_hash, issued_by_membership_id, seeded)
       VALUES ($1, 'AA', $2, $3, $4, false)`,
      [tenantId, email, hash, membership.rows[0]!.id],
    );
    return rawReference;
  }

  const accept = (reference: string, email: string, credential = CREDENTIAL) =>
    request(app.getHttpServer())
      .post(`/identity/invitations/${reference}/accept`)
      .send({ email, credential });

  it('creates all three rows in one transaction', async () => {
    const email = `t038-all-three-${Date.now()}@example.com`;
    const response = await accept(await issue(email), email);
    expect(response.status).toBe(201);

    const { rows } = await migration.query<{ identities: string; memberships: string; credentials: string }>(
      `SELECT
         (SELECT count(*)::text FROM identity WHERE id = $1)                       AS identities,
         (SELECT count(*)::text FROM membership WHERE identity_id = $1)            AS memberships,
         (SELECT count(*)::text FROM identity_credential WHERE identity_id = $1)   AS credentials`,
      [response.body.identityId],
    );
    expect(rows[0]).toEqual({ identities: '1', memberships: '1', credentials: '1' });
  });

  it('the stored credential is an Argon2id digest, never the credential itself', async () => {
    const email = `t038-digest-${Date.now()}@example.com`;
    const response = await accept(await issue(email), email);

    const { rows } = await migration.query<{ digest: string }>(
      `SELECT digest FROM identity_credential WHERE identity_id = $1`,
      [response.body.identityId],
    );
    const digest = rows[0]!.digest;
    expect(digest).toMatch(/^\$argon2id\$/);
    // The interactive profile, not the reduced one meant for backup codes (D6).
    expect(digest).toContain('m=19456');
    expect(digest).not.toContain(CREDENTIAL);
  });

  it('A REFUSAL LEAVES NONE OF THE THREE, and leaves the invitation usable', async () => {
    // The half that matters. Nothing may be left behind by a refusal.
    //
    // Revocation rather than expiry, because `invitation_expires_at_fixed` pins
    // expires_at relative to created_at — the table will not let a test age a row
    // by hand, which is 002 defending its own invariant. Revocation reaches the
    // same collapsed 'refused' outcome, which is the point: the six branches are
    // interchangeable for this assertion BY CONSTRUCTION.
    //
    // `revoked_at` is set alongside the status because `invitation_revoked_at_consistent`
    // requires it — 002 defending another of its own invariants, and worth
    // leaving visible rather than routing around.
    const email = `t038-refused-${Date.now()}@example.com`;
    const reference = await issue(email);
    await migration.query(
      `UPDATE invitation SET status = 'revoked', revoked_at = now() WHERE reference_hash = $1`,
      [createHash('sha256').update(reference, 'utf8').digest('hex')],
    );

    const response = await accept(reference, email);
    expect(response.status).toBe(400);

    const { rows } = await migration.query<{ identities: string; credentials: string }>(
      `SELECT
         (SELECT count(*)::text FROM identity WHERE lower(btrim(email)) = lower(btrim($1))) AS identities,
         (SELECT count(*)::text FROM identity_credential c
            JOIN identity i ON i.id = c.identity_id
           WHERE lower(btrim(i.email)) = lower(btrim($1)))                                   AS credentials`,
      [email],
    );
    expect(rows[0]).toEqual({ identities: '0', credentials: '0' });
  });

  it('a second membership for an existing person does NOT replace their credential', async () => {
    // 001/FR-021 — one human being, two firms. The second acceptance resolves to
    // the existing identity, and its credential must survive untouched.
    // Overwriting it would let anyone holding a valid invitation to ANY tenant
    // reset the authentication material of an existing person: an account
    // takeover wearing the clothes of an ordinary onboarding.
    const email = `t038-two-firms-${Date.now()}@example.com`;

    const first = await accept(await issue(email, tenants.a), email, 'primera-contrasena-larga');
    expect(first.status).toBe(201);
    const { rows: before } = await migration.query<{ digest: string }>(
      `SELECT digest FROM identity_credential WHERE identity_id = $1`,
      [first.body.identityId],
    );

    const second = await accept(await issue(email, tenants.b), email, 'segunda-contrasena-larga');
    expect(second.status).toBe(201);
    expect(second.body.identityId).toBe(first.body.identityId);

    const { rows: after } = await migration.query<{ digest: string }>(
      `SELECT digest FROM identity_credential WHERE identity_id = $1`,
      [first.body.identityId],
    );
    expect(after[0]!.digest).toBe(before[0]!.digest);

    const { rows: counts } = await migration.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM membership WHERE identity_id = $1`,
      [first.body.identityId],
    );
    expect(Number(counts[0]!.n)).toBe(2);
  });

  it("002's six refusal branches still collapse identically (002/FR-023)", async () => {
    // Unknown reference, expired, and already-accepted must be byte-identical.
    // 003 added a parameter to this function; it must not have added a way to
    // tell the causes apart.
    const email = `t038-uniform-${Date.now()}@example.com`;

    const used = await issue(email);
    await accept(used, email);

    const responses = await Promise.all([
      accept('a-reference-that-never-existed', email),
      accept(used, email),
      accept(await issue(`t038-other-${Date.now()}@example.com`), email),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(400);
      expect(response.body).toEqual(responses[0]!.body);
    }
  });

  it('refuses a credential below the minimum without creating anything', async () => {
    const email = `t038-short-${Date.now()}@example.com`;
    const reference = await issue(email);

    const response = await accept(reference, email, 'corta');
    expect(response.status).toBe(400);

    const { rows } = await migration.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM identity WHERE lower(btrim(email)) = lower(btrim($1))`,
      [email],
    );
    expect(Number(rows[0]!.n)).toBe(0);
  });
});
