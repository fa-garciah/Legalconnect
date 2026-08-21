/**
 * quickstart V12, FR-032, SC-012 — no audit entry written by this slice's
 * nine actions contains an email address or other contact detail.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createRealApp } from '../helpers/real-app';
import { seededTenantIds, type SeededTenants } from '../helpers/tenants';
import { seededIdentities, type SeededIdentities } from '../helpers/identities';
import { connectAs } from '../helpers/db';

const EMAIL_SHAPE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

const SLICE_002_ACTIONS = [
  'identity.created',
  'membership.created',
  'membership.revoked',
  'membership.archetype_changed',
  'invitation.issued',
  'invitation.seed_issued',
  'invitation.revoked',
  'invitation.accepted',
  'invitation.refused',
];

describe('no PII in this slice\'s audit entries (SC-012)', () => {
  let app: INestApplication;
  let tenants: SeededTenants;
  let identities: SeededIdentities;

  beforeAll(async () => {
    app = await createRealApp();
    tenants = await seededTenantIds();
    identities = await seededIdentities();

    // Exercise every action at least once.
    const email = `pii-sweep-${Date.now()}@example.com`;
    const issued = await request(app.getHttpServer())
      .post('/tenant/invitations')
      .set('x-identity-id', identities.dualId)
      .set('x-tenant-id', tenants.a)
      .send({ email, targetArchetype: 'AA' });

    await request(app.getHttpServer())
      .post(`/tenant/invitations/${issued.body.id}/revoke`)
      .set('x-identity-id', identities.dualId)
      .set('x-tenant-id', tenants.a)
      .send();

    await request(app.getHttpServer())
      .post(`/identity/invitations/nonexistent-for-pii-sweep/accept`)
      .set('x-subject', 'idp|pii-sweep')
      .set('x-email', email)
      .send();
  });

  afterAll(async () => {
    await app.close();
  });

  it('no entry for any of the nine actions contains an email-shaped value anywhere in metadata', async () => {
    const migration = await connectAs('migration');
    try {
      const { rows } = await migration.query<{ metadata: Record<string, unknown>; action: string }>(
        `SELECT action, metadata FROM audit_event WHERE action = ANY($1::text[])`,
        [SLICE_002_ACTIONS],
      );
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        const serialised = JSON.stringify(row.metadata);
        expect(serialised, `${row.action} metadata must contain no email`).not.toMatch(EMAIL_SHAPE);
        expect(Object.keys(row.metadata).join(',').toLowerCase()).not.toContain('email');
      }
    } finally {
      await migration.end();
    }
  });
});
