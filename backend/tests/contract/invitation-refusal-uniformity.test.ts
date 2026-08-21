/**
 * quickstart V7 / SC-007 / FR-022 — an expired, an already-used, a revoked,
 * and a nonexistent invitation all produce byte-identical refusal bodies.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { createRealApp } from '../helpers/real-app';
import { seededTenantIds, type SeededTenants } from '../helpers/tenants';
import { seededIdentities, type SeededIdentities } from '../helpers/identities';
import { connectAs } from '../helpers/db';

async function tryAccept(app: INestApplication, rawReference: string, email: string) {
  return request(app.getHttpServer())
    .post(`/identity/invitations/${rawReference}/accept`)
    .set('x-subject', `idp|uniformity-${Date.now()}-${Math.random()}`)
    .set('x-email', email)
    .send();
}

describe('invitation refusal uniformity (SC-007)', () => {
  let app: INestApplication;
  let tenants: SeededTenants;
  let identities: SeededIdentities;

  beforeAll(async () => {
    app = await createRealApp();
    tenants = await seededTenantIds();
    identities = await seededIdentities();
  });

  afterAll(async () => {
    await app.close();
  });

  async function seedInvitation(
    email: string,
    shape: { expired?: boolean; accepted?: boolean; revoked?: boolean },
  ): Promise<string> {
    const migration = await connectAs('migration');
    try {
      const rawReference = `uniformity-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const hash = createHash('sha256').update(rawReference, 'utf8').digest('hex');
      const membership = await migration.query<{ id: string }>(
        `SELECT id FROM membership WHERE identity_id = $1 AND tenant_id = $2`,
        [identities.dualId, tenants.a],
      );
      const issuedAt = shape.expired ? `now() - interval '8 days'` : `now()`;
      const expiresAt = shape.expired ? `now() - interval '1 day'` : `now() + interval '7 days'`;
      const status = shape.accepted ? 'accepted' : shape.revoked ? 'revoked' : 'pending';
      await migration.query(
        `INSERT INTO invitation (
           tenant_id, target_archetype, invited_email, reference_hash,
           issued_by_membership_id, seeded, issued_at, expires_at, status,
           accepted_at, revoked_at
         )
         VALUES ($1, 'AA', $2, $3, $4, false, ${issuedAt}, ${expiresAt}, $5::invitation_status,
           CASE WHEN $5::text = 'accepted' THEN now() ELSE NULL END,
           CASE WHEN $5::text = 'revoked' THEN now() ELSE NULL END)`,
        [tenants.a, email, hash, membership.rows[0]!.id, status],
      );
      return rawReference;
    } finally {
      await migration.end();
    }
  }

  it('expired, used, revoked and nonexistent all answer byte-identically', async () => {
    const expired = await seedInvitation(`u1-${Date.now()}@example.com`, { expired: true });
    const used = await seedInvitation(`u2-${Date.now()}@example.com`, { accepted: true });
    const revoked = await seedInvitation(`u3-${Date.now()}@example.com`, { revoked: true });
    const nonexistent = 'this-reference-was-never-issued';

    const responses = await Promise.all([
      tryAccept(app, expired, 'anything@example.com'),
      tryAccept(app, used, 'anything@example.com'),
      tryAccept(app, revoked, 'anything@example.com'),
      tryAccept(app, nonexistent, 'anything@example.com'),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(400);
    }
    const bodies = responses.map((r) => JSON.stringify(r.body));
    expect(new Set(bodies).size).toBe(1);
  });
});
