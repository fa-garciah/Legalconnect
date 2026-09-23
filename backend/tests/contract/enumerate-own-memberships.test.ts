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

  /**
   * ADDED BY THE FRONTEND FINDING OF 2026-09-21, not by a new feature.
   *
   * `016a/FR-008` requires the shell to name the active firm AT ALL TIMES, and its tenant
   * switcher offers a choice between firms. This endpoint is the only source of that list,
   * and it returned tenant UUIDs and nothing else — so the shell named nothing, the
   * switcher offered a choice between two identifiers, and the first authenticated render
   * crashed on the absent name.
   *
   * It went unnoticed because `016a` was built against a checked-in fixture that DID carry
   * the name, and by the time `003` replaced that fixture with this call, every request was
   * failing for an unrelated reason and degrading to anonymous. Two defects hid each other.
   *
   * A firm's own name is not a disclosure: the caller holds a live membership in it, which
   * is strictly less than what `GET /tenant/clients` already tells them. The new RLS policy
   * grants exactly that and no more — asserted below.
   */
  it('names each firm, so the shell can say which one you are in — 016a/FR-008', async () => {
    const response = await request(app.getHttpServer())
      .get('/identity/memberships')
      .set('x-identity-id', identities.dualId);

    expect(response.status).toBe(200);
    for (const item of response.body.items) {
      expect(typeof item.tenantName, 'every membership carries its firm name').toBe('string');
      expect(item.tenantName.length).toBeGreaterThan(0);
    }
  });

  it('identifies the caller, so the shell knows whose session it is rendering', async () => {
    const response = await request(app.getHttpServer())
      .get('/identity/memberships')
      .set('x-identity-id', identities.dualId);

    expect(response.body.identityId).toBe(identities.dualId);
  });

  it('names ONLY firms the caller belongs to — the policy is not a window onto the table', async () => {
    // The outsider holds no live membership anywhere. If the new policy were written as a
    // blanket read, this would come back with rows; it must stay empty.
    const response = await request(app.getHttpServer())
      .get('/identity/memberships')
      .set('x-identity-id', identities.outsiderId);

    expect(response.body.items).toEqual([]);
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
