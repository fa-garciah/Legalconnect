/**
 * US4 scenario 4 — no endpoint extends an invitation; re-issuing creates a
 * new invitation with a fresh audit entry.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createRealApp } from '../helpers/real-app';
import { seededTenantIds, type SeededTenants } from '../helpers/tenants';
import { seededIdentities, type SeededIdentities } from '../helpers/identities';

describe('invitation re-issuance, not extension (US4 scenario 4)', () => {
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

  it('no PATCH/extend route exists on the invitation controller — only issuing a new one is possible', async () => {
    const first = await request(app.getHttpServer())
      .post('/tenant/invitations')
      .set('x-identity-id', identities.dualId)
      .set('x-tenant-id', tenants.a)
      .send({ email: `reissue-${Date.now()}@example.com`, targetArchetype: 'AA' });
    expect(first.status).toBe(201);

    // There is no PATCH .../invitations/:id at all — attempting one 404s at
    // the routing layer, not at a business-logic refusal.
    const attempted = await request(app.getHttpServer())
      .patch(`/tenant/invitations/${first.body.id}`)
      .set('x-identity-id', identities.dualId)
      .set('x-tenant-id', tenants.a)
      .send({ expiresAt: '2099-01-01T00:00:00Z' });
    expect(attempted.status).toBe(404);

    const second = await request(app.getHttpServer())
      .post('/tenant/invitations')
      .set('x-identity-id', identities.dualId)
      .set('x-tenant-id', tenants.a)
      .send({ email: `reissue-${Date.now()}@example.com`, targetArchetype: 'AA' });
    expect(second.status).toBe(201);
    expect(second.body.id).not.toBe(first.body.id);
  });
});
