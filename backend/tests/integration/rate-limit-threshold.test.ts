/**
 * US5 scenario 4, research.md D8 — repeated attempts against a single
 * invitation reference beyond the configured threshold are refused without
 * disclosing why (still the same generic body).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { createRealApp } from '../helpers/real-app';
import { seededTenantIds, type SeededTenants } from '../helpers/tenants';
import { seededIdentities, type SeededIdentities } from '../helpers/identities';
import { connectAs } from '../helpers/db';

describe('per-reference failed-attempt threshold (research.md D8)', () => {
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

  it('refuses further attempts against one reference after 10 failures, even with the CORRECT email supplied afterward', async () => {
    const email = `threshold-${Date.now()}@example.com`;
    const rawReference = randomBytes(16).toString('hex');
    const hash = createHash('sha256').update(rawReference, 'utf8').digest('hex');

    const migration = await connectAs('migration');
    try {
      const membership = await migration.query<{ id: string }>(
        `SELECT id FROM membership WHERE identity_id = $1 AND tenant_id = $2`,
        [identities.dualId, tenants.a],
      );
      await migration.query(
        `INSERT INTO invitation (tenant_id, target_archetype, invited_email, reference_hash, issued_by_membership_id, seeded)
         VALUES ($1, 'AA', $2, $3, $4, false)`,
        [tenants.a, email, hash, membership.rows[0]!.id],
      );
    } finally {
      await migration.end();
    }

    // 10 wrong-email attempts exhaust the threshold.
    for (let i = 0; i < 10; i += 1) {
      const response = await request(app.getHttpServer())
        .post(`/identity/invitations/${rawReference}/accept`)
        .set('x-subject', `idp|attacker-${i}`)
        .set('x-email', 'wrong@example.com')
        .send();
      expect(response.status).toBe(400);
    }

    // The 11th attempt, even with the RIGHT email, is still refused — the
    // reference is spent, not the email check.
    const finalAttempt = await request(app.getHttpServer())
      .post(`/identity/invitations/${rawReference}/accept`)
      .set('x-subject', 'idp|legitimate-invitee')
      .set('x-email', email)
      .send();
    expect(finalAttempt.status).toBe(400);
    expect(finalAttempt.body.error.code).toBe('invitation_invalid');
  });
});
