/**
 * T080 / FR-013 / US4 scenario 2 — a caller whose membership archetype does not
 * permit the read gets `403 not_authorized`.
 *
 * Uses the dual-membership identity on purpose: it carries a live membership and a
 * real archetype in both tenants, neither of which is SA. A refusal here must come
 * from the permission guard, not from the membership/tenant-activation checks T040
 * already covers — those are a different mechanism and would pass this test without
 * proving anything about authorization.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createTenantApp } from '../helpers/tenant-app';
import { closeAppDb } from '../../src/common/db/client';
import {
  IDENTITY_DUAL,
  membershipFixtures,
  seededTenantIds,
  type SeededTenants,
} from '../helpers/tenants';

describe('GET /audit/events — authorization', () => {
  let app: INestApplication;
  let tenants: SeededTenants;

  beforeAll(async () => {
    tenants = await seededTenantIds();
    app = await createTenantApp(membershipFixtures(tenants));
  });

  afterAll(async () => {
    await app.close();
    await closeAppDb();
  });

  it('refuses an MP archetype with 403 not_authorized', async () => {
    const response = await request(app.getHttpServer())
      .get('/audit/events')
      .set('x-identity-id', IDENTITY_DUAL.id)
      .set('x-tenant-id', tenants.a);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: { code: 'not_authorized', message: 'Your role does not permit this operation.' },
    });
  });

  it('refuses an IC archetype with 403 not_authorized', async () => {
    // Same identity, the OTHER tenant, a different archetype (FR-024) — still refused.
    const response = await request(app.getHttpServer())
      .get('/audit/events')
      .set('x-identity-id', IDENTITY_DUAL.id)
      .set('x-tenant-id', tenants.b);

    expect(response.status).toBe(403);
    expect(response.status).not.toBe(200);
  });
});
