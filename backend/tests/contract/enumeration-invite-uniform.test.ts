/**
 * US5 scenario 1, SC-008 — inviting a known email and an unknown email
 * produce indistinguishable responses.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createRealApp } from '../helpers/real-app';
import { seededTenantIds, type SeededTenants } from '../helpers/tenants';
import { seededIdentities, type SeededIdentities } from '../helpers/identities';

describe('inviting a known vs. unknown email (US5 scenario 1)', () => {
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

  it('produces the same response shape for a known and an unknown email', async () => {
    const known = await request(app.getHttpServer())
      .post('/tenant/invitations')
      .set('x-identity-id', identities.dualId)
      .set('x-tenant-id', tenants.a)
      .send({ email: 'dual@example.com', targetArchetype: 'AA' }); // already has an identity

    const unknown = await request(app.getHttpServer())
      .post('/tenant/invitations')
      .set('x-identity-id', identities.dualId)
      .set('x-tenant-id', tenants.a)
      .send({ email: `never-seen-${Date.now()}@example.com`, targetArchetype: 'AA' });

    expect(known.status).toBe(unknown.status);
    expect(Object.keys(known.body).sort()).toEqual(Object.keys(unknown.body).sort());
    expect(known.body.email).toBeUndefined();
    expect(unknown.body.email).toBeUndefined();
  });
});
