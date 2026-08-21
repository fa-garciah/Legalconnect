/**
 * US5 scenario 2, FR-029 — inviting an email that already holds a live
 * membership in the inviting tenant looks like a valid new invitation and
 * creates no duplicate membership, whether or not it is later accepted.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createRealApp } from '../helpers/real-app';
import { seededTenantIds, type SeededTenants } from '../helpers/tenants';
import { seededIdentities, type SeededIdentities } from '../helpers/identities';
import { connectAs } from '../helpers/db';

describe('inviting an already-member email (US5 scenario 2, FR-029)', () => {
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

  it('issuing looks identical to a valid new invitation', async () => {
    // dual@example.com already holds a live membership in tenant A.
    const response = await request(app.getHttpServer())
      .post('/tenant/invitations')
      .set('x-identity-id', identities.dualId)
      .set('x-tenant-id', tenants.a)
      .send({ email: 'dual@example.com', targetArchetype: 'AA' });

    expect(response.status).toBe(201);
    expect(response.body.status).toBe('pending');
  });

  it('accepting it does not create a second membership for the same tenant', async () => {
    const migration = await connectAs('migration');
    let rawReference: string;
    try {
      const { createHash, randomBytes } = await import('node:crypto');
      rawReference = randomBytes(16).toString('hex');
      const hash = createHash('sha256').update(rawReference, 'utf8').digest('hex');
      const membership = await migration.query<{ id: string }>(
        `SELECT id FROM membership WHERE identity_id = $1 AND tenant_id = $2`,
        [identities.dualId, tenants.a],
      );
      await migration.query(
        `INSERT INTO invitation (tenant_id, target_archetype, invited_email, reference_hash, issued_by_membership_id, seeded)
         VALUES ($1, 'AA', 'dual@example.com', $2, $3, false)`,
        [tenants.a, hash, membership.rows[0]!.id],
      );
    } finally {
      await migration.end();
    }

    const response = await request(app.getHttpServer())
      .post(`/identity/invitations/${rawReference}/accept`)
      .set('x-subject', 'idp|dual-tenant-counsel')
      .set('x-email', 'dual@example.com')
      .send();

    // Refused generically (FR-029's guard), not a 500 from a unique-constraint
    // violation.
    expect(response.status).toBe(400);

    const migration2 = await connectAs('migration');
    try {
      const { rows } = await migration2.query(
        `SELECT count(*)::text AS n FROM membership WHERE identity_id = $1 AND tenant_id = $2`,
        [identities.dualId, tenants.a],
      );
      expect(Number(rows[0]!.n)).toBe(1);
    } finally {
      await migration2.end();
    }
  });
});
