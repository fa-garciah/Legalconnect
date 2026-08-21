/**
 * US4 scenario 1 — an invitation older than 7 days is refused and creates no
 * membership.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createRealApp } from '../helpers/real-app';
import { seededTenantIds, type SeededTenants } from '../helpers/tenants';
import { seededIdentities, type SeededIdentities } from '../helpers/identities';
import { connectAs } from '../helpers/db';

describe('invitation expiry (US4 scenario 1)', () => {
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

  it('refuses acceptance once past its 7-day expiry, and no membership is created', async () => {
    const email = `expired-${Date.now()}@example.com`;
    const subject = `idp|expired-${Date.now()}`;
    const rawReference = `expiry-token-${Date.now()}`;

    const migration = await connectAs('migration');
    let invitationId: string;
    try {
      const { createHash } = await import('node:crypto');
      const hash = createHash('sha256').update(rawReference, 'utf8').digest('hex');
      const membership = await migration.query<{ id: string }>(
        `SELECT id FROM membership WHERE identity_id = $1 AND tenant_id = $2`,
        [identities.dualId, tenants.a],
      );
      const inserted = await migration.query<{ id: string }>(
        `INSERT INTO invitation (tenant_id, target_archetype, invited_email, reference_hash, issued_by_membership_id, seeded, issued_at, expires_at)
         VALUES ($1, 'AA', $2, $3, $4, false, now() - interval '8 days', now() - interval '1 day')
         RETURNING id`,
        [tenants.a, email, hash, membership.rows[0]!.id],
      );
      invitationId = inserted.rows[0]!.id;
    } finally {
      await migration.end();
    }

    const response = await request(app.getHttpServer())
      .post(`/identity/invitations/${rawReference}/accept`)
      .set('x-subject', subject)
      .set('x-email', email)
      .send();

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('invitation_invalid');

    const migration2 = await connectAs('migration');
    try {
      const idRows = await migration2.query('SELECT count(*)::text AS n FROM identity WHERE subject = $1', [
        subject,
      ]);
      expect(Number(idRows.rows[0].n)).toBe(0);
      const stillPending = await migration2.query('SELECT status FROM invitation WHERE id = $1', [
        invitationId,
      ]);
      expect(stillPending.rows[0]?.status).toBe('pending');
    } finally {
      await migration2.end();
    }
  });
});
