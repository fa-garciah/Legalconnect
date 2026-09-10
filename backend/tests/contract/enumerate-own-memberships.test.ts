/**
 * US1 scenario 8, FR-017, quickstart V15 — GET /identity/memberships.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createAuthenticatedApp } from '../helpers/real-app';
import { seededTenantIds, type SeededTenants } from '../helpers/tenants';
import { seededIdentities, type SeededIdentities } from '../helpers/identities';

describe('GET /identity/memberships (US1 scenario 8)', () => {
  let app: INestApplication;
  let tenants: SeededTenants;
  let identities: SeededIdentities;

  beforeAll(async () => {
    app = await createAuthenticatedApp();
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

  it('is unreachable without an authenticated identity — 401 from the session guard', async () => {
    // 003/T033. This used to answer 400 validation_failed, because the route read
    // `x-identity-id` and the interceptor rejected a missing header as malformed
    // input. It now answers 401 from `SessionGuard`, which is a stronger
    // statement and a more honest one: the request is not badly shaped, it is
    // UNAUTHENTICATED. Nothing in the request can assert an identity any more —
    // only a session can.
    const response = await request(app.getHttpServer()).get('/identity/memberships');
    expect(response.status).toBe(401);
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
