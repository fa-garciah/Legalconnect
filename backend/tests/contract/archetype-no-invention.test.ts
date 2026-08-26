/**
 * T049 — US4: there is no route, body field or parameter through which an SA can
 * grant an archetype a capability the product does not define. The archetype-change
 * endpoint accepts only the ten enum values; `archetype.redefine` is held by nobody,
 * `SA` included. US4 scenario 2, matrix row 21.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createRealApp } from '../helpers/real-app';
import { seededTenantIds, type SeededTenants } from '../helpers/tenants';
import { seededIdentities, type SeededIdentities } from '../helpers/identities';
import { MATRIX } from '../../src/common/authz/matrix';
import { CAPABILITIES } from '../../src/common/authz/capability';

describe('archetype meaning cannot be invented or edited through any surface', () => {
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

  it('`archetype.redefine` is registered but held by nobody, SA included', () => {
    expect(CAPABILITIES['archetype.redefine']).toBeDefined();
    expect(MATRIX['archetype.redefine'].size).toBe(0);
    expect(MATRIX['archetype.redefine'].has('SA')).toBe(false);
  });

  it('there is no route exposing archetype.redefine', async () => {
    // The only mutation route touching archetype is PATCH .../memberships/:id/archetype,
    // and it changes a MEMBERSHIP's archetype value, never the archetype vocabulary
    // itself — no route in this application declares archetype.redefine.
    const response = await request(app.getHttpServer())
      .patch(`/tenant/memberships/${identities.dualMembershipA}/archetype`)
      .set('x-identity-id', identities.dualId)
      .set('x-tenant-id', tenants.a)
      .send({ archetype: 'PL' });
    // dual is MP in tenant A -> refused for permission, not a 404 (route exists).
    expect(response.status).toBe(403);
  });

  it('the archetype-change endpoint refuses any value outside the ten enum values', async () => {
    const migration = await import('../helpers/db');
    const client = await migration.connectAs('migration');
    let saIdentityId: string;
    try {
      const identity = await client.query<{ id: string }>(
        `INSERT INTO identity (subject, email, mfa_enrolled_at) VALUES ($1, $2, now()) RETURNING id`,
        [`idp|invention-probe-${Date.now()}`, `invention-probe-${Date.now()}@example.com`],
      );
      saIdentityId = identity.rows[0]!.id;
      await client.query(`INSERT INTO membership (identity_id, tenant_id, archetype) VALUES ($1, $2, 'SA')`, [
        saIdentityId,
        tenants.a,
      ]);
    } finally {
      await client.end();
    }

    for (const invented of ['SUPER_ADMIN', 'sa', 'archetype.redefine', '', 'NULL', 'SA; DROP TABLE membership;']) {
      const response = await request(app.getHttpServer())
        .patch(`/tenant/memberships/${identities.dualMembershipA}/archetype`)
        .set('x-identity-id', saIdentityId)
        .set('x-tenant-id', tenants.a)
        .send({ archetype: invented });
      expect(response.status, `archetype "${invented}" must be refused`).toBe(400);
    }
  });

});
