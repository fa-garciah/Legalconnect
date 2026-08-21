/**
 * US2 scenario 5 — POST /tenant/invitations/:id/revoke.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createRealApp } from '../helpers/real-app';
import { seededTenantIds, type SeededTenants } from '../helpers/tenants';
import { seededIdentities, type SeededIdentities } from '../helpers/identities';

describe('POST /tenant/invitations/:id/revoke (US2 scenario 5)', () => {
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

  it('revokes a pending invitation, and a second revoke of the same one is refused', async () => {
    const issued = await request(app.getHttpServer())
      .post('/tenant/invitations')
      .set('x-identity-id', identities.dualId)
      .set('x-tenant-id', tenants.a)
      .send({ email: `to-revoke-${Date.now()}@example.com`, targetArchetype: 'AA' });
    expect(issued.status).toBe(201);

    const revoked = await request(app.getHttpServer())
      .post(`/tenant/invitations/${issued.body.id}/revoke`)
      .set('x-identity-id', identities.dualId)
      .set('x-tenant-id', tenants.a)
      .send();
    expect(revoked.status).toBe(200);
    expect(revoked.body.status).toBe('revoked');

    const second = await request(app.getHttpServer())
      .post(`/tenant/invitations/${issued.body.id}/revoke`)
      .set('x-identity-id', identities.dualId)
      .set('x-tenant-id', tenants.a)
      .send();
    expect(second.status).toBe(404);
  });

  it('cannot be revoked from a different tenant — the generic not-found', async () => {
    const issued = await request(app.getHttpServer())
      .post('/tenant/invitations')
      .set('x-identity-id', identities.dualId)
      .set('x-tenant-id', tenants.a)
      .send({ email: `cross-tenant-${Date.now()}@example.com`, targetArchetype: 'AA' });
    expect(issued.status).toBe(201);

    // Dual holds IC in tenant B — not SA/MP, but even an SA/MP of tenant B
    // could never see tenant A's row through RLS, which is the point.
    const response = await request(app.getHttpServer())
      .post(`/tenant/invitations/${issued.body.id}/revoke`)
      .set('x-identity-id', identities.dualId)
      .set('x-tenant-id', tenants.b)
      .send();
    expect(response.status).toBe(403); // IC lacks the archetype at all
  });
});
