/**
 * US1 scenario 8, FR-017, quickstart V15 — GET /identity/memberships.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createRealApp } from '../helpers/real-app';
import { seededTenantIds, type SeededTenants } from '../helpers/tenants';
import { seededIdentities, type SeededIdentities } from '../helpers/identities';

describe('GET /identity/memberships (US1 scenario 8)', () => {
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

  it('lists every live membership across tenants for the dual identity', async () => {
    const response = await request(app.getHttpServer())
      .get('/identity/memberships')
      .set('x-identity-id', identities.dualId);

    expect(response.status).toBe(200);
    const tenantIds = response.body.items.map((i: { tenantId: string }) => i.tenantId).sort();
    expect(tenantIds).toEqual([tenants.a, tenants.b].sort());
  });

  it('the outsider identity gets an empty list, not an error — FR-011', async () => {
    const response = await request(app.getHttpServer())
      .get('/identity/memberships')
      .set('x-identity-id', identities.outsiderId);

    expect(response.status).toBe(200);
    expect(response.body.items).toEqual([]);
  });

  it('is unreachable without x-identity-id', async () => {
    const response = await request(app.getHttpServer()).get('/identity/memberships');
    expect(response.status).toBe(400);
  });

  it('quickstart V15: a stray x-tenant-id header does not narrow the result to that tenant\'s roster', async () => {
    const withTenantHeader = await request(app.getHttpServer())
      .get('/identity/memberships')
      .set('x-identity-id', identities.dualId)
      .set('x-tenant-id', tenants.a);
    const without = await request(app.getHttpServer())
      .get('/identity/memberships')
      .set('x-identity-id', identities.dualId);

    // IdentitySurface exempts this route from the tenant interceptor entirely,
    // so a stray x-tenant-id is never even read — the two results must match.
    const sort = (body: { items: Array<{ tenantId: string }> }) =>
      body.items.map((i) => i.tenantId).sort();
    expect(sort(withTenantHeader.body)).toEqual(sort(without.body));
  });
});
