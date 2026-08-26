/**
 * T037 — US2: an archetype change takes effect on the very next request. SC-011, US2
 * scenario 6. No session cache, no grace period — the archetype is read fresh from
 * the membership on every request (currentPrincipal().archetype).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createRealApp } from '../helpers/real-app';
import { seededTenantIds, type SeededTenants } from '../helpers/tenants';
import { connectAs } from '../helpers/db';

describe('an archetype change is decided live, not cached', () => {
  let app: INestApplication;
  let tenants: SeededTenants;

  beforeAll(async () => {
    app = await createRealApp();
    tenants = await seededTenantIds();
  });

  afterAll(async () => {
    await app.close();
  });

  async function freshMember(archetype: string, tenantId: string): Promise<{ identityId: string; membershipId: string }> {
    const migration = await connectAs('migration');
    try {
      const identity = await migration.query<{ id: string }>(
        `INSERT INTO identity (subject, email, mfa_enrolled_at) VALUES ($1, $2, now()) RETURNING id`,
        [`idp|live-archetype-${Date.now()}-${Math.random()}`, `live-archetype-${Date.now()}@example.com`],
      );
      const membership = await migration.query<{ id: string }>(
        `INSERT INTO membership (identity_id, tenant_id, archetype) VALUES ($1, $2, $3) RETURNING id`,
        [identity.rows[0]!.id, tenantId, archetype],
      );
      return { identityId: identity.rows[0]!.id, membershipId: membership.rows[0]!.id };
    } finally {
      await migration.end();
    }
  }

  it("SA demotes a live MP to AA; the member's very next request to an MP capability is refused", async () => {
    const sa = await freshMember('SA', tenants.a);
    const mp = await freshMember('MP', tenants.a);

    // Confirm the MP capability is permitted BEFORE the demotion.
    const before = await request(app.getHttpServer())
      .get('/tenant/invitations')
      .set('x-identity-id', mp.identityId)
      .set('x-tenant-id', tenants.a);
    expect(before.status).toBe(200);

    const demote = await request(app.getHttpServer())
      .patch(`/tenant/memberships/${mp.membershipId}/archetype`)
      .set('x-identity-id', sa.identityId)
      .set('x-tenant-id', tenants.a)
      .send({ archetype: 'AA' });
    expect(demote.status).toBe(200);
    expect(demote.body.archetype).toBe('AA');

    // 0 requests decided under the previous archetype: the very next request refuses.
    const after = await request(app.getHttpServer())
      .get('/tenant/invitations')
      .set('x-identity-id', mp.identityId)
      .set('x-tenant-id', tenants.a);
    expect(after.status).toBe(403);
    expect(after.body.error.code).toBe('not_authorized');
  });
});
