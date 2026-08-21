/**
 * GET /tenant/invitations — lists only the active tenant's pending invitations,
 * with no email or token in the response.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createRealApp } from '../helpers/real-app';
import { seededTenantIds, type SeededTenants } from '../helpers/tenants';
import { seededIdentities, type SeededIdentities } from '../helpers/identities';

describe('GET /tenant/invitations', () => {
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

  it('lists only the active tenant\'s pending invitations, no email or token', async () => {
    const response = await request(app.getHttpServer())
      .get('/tenant/invitations')
      .set('x-identity-id', identities.dualId)
      .set('x-tenant-id', tenants.a);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.items)).toBe(true);
    expect(response.body.items.length).toBeGreaterThan(0);
    for (const item of response.body.items) {
      expect(item.tenantId).toBe(tenants.a);
      expect(item.status).toBe('pending');
      expect(item.email).toBeUndefined();
      expect(item.referenceHash).toBeUndefined();
    }
  });
});
