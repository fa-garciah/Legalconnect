/**
 * T038 / quickstart V4 / AS-02 — a cross-tenant request answers 404 with the generic
 * body. Never 403, which would confirm existence. Never 200.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { connectAs } from '../helpers/db';
import { createTestApp } from '../helpers/app';
import {
  IDENTITY_DUAL,
  IDENTITY_SINGLE,
  membershipFixtures,
  seededTenantIds,
  type SeededTenants,
} from '../helpers/tenants';

describe('cross-tenant HTTP reach', () => {
  let app: INestApplication;
  let tenants: SeededTenants;
  let entryInA: string;
  let entryInB: string;

  beforeAll(async () => {
    tenants = await seededTenantIds();

    const platform = await connectAs('platform');
    const pick = async (tenantId: string): Promise<string> => {
      const { rows } = await platform.query<{ id: string }>(
        'SELECT id FROM audit_event WHERE tenant_id = $1 LIMIT 1',
        [tenantId],
      );
      if (!rows[0]) throw new Error(`no audit entry seeded for tenant ${tenantId}`);
      return rows[0].id;
    };
    entryInA = await pick(tenants.a);
    entryInB = await pick(tenants.b);
    await platform.end();

    app = await createTestApp(membershipFixtures(tenants));
  });

  afterAll(async () => {
    await app.close();
  });

  const asIdentity = (tenantId: string) => ({
    'x-identity-id': IDENTITY_SINGLE.id,
    'x-tenant-id': tenantId,
  });

  it('returns the resource when it belongs to the active tenant', async () => {
    // Asserted first and deliberately: without this, a middleware that activates
    // nothing at all would make every case below "pass".
    const response = await request(app.getHttpServer())
      .get(`/probe/audit/${entryInA}`)
      .set(asIdentity(tenants.a));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: entryInA });
  });

  it('returns 404, not 403, when reaching for another tenant’s resource', async () => {
    const response = await request(app.getHttpServer())
      .get(`/probe/audit/${entryInB}`)
      .set(asIdentity(tenants.a));

    expect(response.status).toBe(404);
    expect(response.status).not.toBe(403);
  });

  it('answers a foreign resource identically to one that does not exist', async () => {
    // The disclosure test. If these two responses differ in any way, a caller can
    // enumerate which resources exist in other tenants.
    const foreign = await request(app.getHttpServer())
      .get(`/probe/audit/${entryInB}`)
      .set(asIdentity(tenants.a));

    const absent = await request(app.getHttpServer())
      .get('/probe/audit/00000000-0000-4000-8000-000000000000')
      .set(asIdentity(tenants.a));

    expect(foreign.status).toBe(absent.status);
    expect(foreign.body).toEqual(absent.body);
    expect(foreign.body).toEqual({
      error: { code: 'not_found', message: 'The requested resource does not exist.' },
    });
  });

  it('is symmetric — operating in tenant B cannot reach tenant A’s resource', async () => {
    // Uses the DUAL-membership identity on purpose. A single-tenant identity would be
    // refused for lacking membership, which is a different mechanism and would make
    // this test pass without proving anything about isolation.
    const headers = { 'x-identity-id': IDENTITY_DUAL.id, 'x-tenant-id': tenants.b };

    const own = await request(app.getHttpServer())
      .get(`/probe/audit/${entryInB}`)
      .set(headers);
    expect(own.status, 'B must be able to read its own entry').toBe(200);

    const foreign = await request(app.getHttpServer())
      .get(`/probe/audit/${entryInA}`)
      .set(headers);
    expect(foreign.status).toBe(404);
  });
});
