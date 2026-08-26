/**
 * T048 — US4: a tenant can never be left without an administrator, under
 * concurrency as well as in sequence. FR-010, SC-009. The concurrent case is the one
 * that matters — an application-level check-then-write passes the first two and
 * fails this one (research.md D5).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createRealApp } from '../helpers/real-app';
import { connectAs } from '../helpers/db';
import { uniqueRfc } from '../helpers/rfc';

async function provisionTenant(app: INestApplication): Promise<string> {
  const response = await request(app.getHttpServer())
    .post('/internal/platform/tenants')
    .send({ name: 'Last-SA Probe, S.C.', rfc: uniqueRfc(), planCode: 'esencial' });
  expect(response.status).toBe(201);
  return response.body.id;
}

async function addMember(tenantId: string, archetype: string): Promise<string> {
  const migration = await connectAs('migration');
  try {
    const identity = await migration.query<{ id: string }>(
      `INSERT INTO identity (subject, email, mfa_enrolled_at) VALUES ($1, $2, now()) RETURNING id`,
      [`idp|last-sa-${Date.now()}-${Math.random()}`, `last-sa-${Date.now()}-${Math.random()}@example.com`],
    );
    const membership = await migration.query<{ id: string }>(
      `INSERT INTO membership (identity_id, tenant_id, archetype) VALUES ($1, $2, $3) RETURNING id`,
      [identity.rows[0]!.id, tenantId, archetype],
    );
    return membership.rows[0]!.id;
  } finally {
    await migration.end();
  }
}

describe('the last SA of a tenant cannot be removed', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createRealApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('with one live SA, changing their archetype is refused, and revoking their membership is refused — by the same rule', async () => {
    const tenantId = await provisionTenant(app);
    const saId = await addMember(tenantId, 'SA');

    const migration = await connectAs('migration');
    const identityRow = await migration.query<{ identity_id: string }>(
      `SELECT identity_id FROM membership WHERE id = $1`,
      [saId],
    );
    const saIdentityId = identityRow.rows[0]!.identity_id;
    await migration.end();

    // The SA acts on their own membership — the only member of this tenant.
    const selfDemote = await request(app.getHttpServer())
      .patch(`/tenant/memberships/${saId}/archetype`)
      .set('x-identity-id', saIdentityId)
      .set('x-tenant-id', tenantId)
      .send({ archetype: 'AA' });
    expect(selfDemote.status).toBe(409);
    expect(selfDemote.body.error.code).toBe('last_administrator_protected');

    const revoke = await request(app.getHttpServer())
      .patch(`/tenant/memberships/${saId}/revoke`)
      .set('x-identity-id', saIdentityId)
      .set('x-tenant-id', tenantId)
      .send();
    expect(revoke.status).toBe(409);
    expect(revoke.body.error.code).toBe('last_administrator_protected');
  });

  it('with two SAs, two concurrent demotions leave exactly one succeeding', async () => {
    const tenantId = await provisionTenant(app);
    const saAId = await addMember(tenantId, 'SA');
    const saBId = await addMember(tenantId, 'SA');

    const migration = await connectAs('migration');
    const rows = await migration.query<{ id: string; identity_id: string }>(
      `SELECT id, identity_id FROM membership WHERE id = ANY($1::uuid[])`,
      [[saAId, saBId]],
    );
    await migration.end();
    const byId = new Map(rows.rows.map((r) => [r.id, r.identity_id]));

    // Each SA demotes THEMSELVES, concurrently. Self-demotion (rather than each
    // demoting the other) means neither request's PERMISSION step depends on the
    // other's outcome — both callers hold SA at the moment their own request is
    // authorized, regardless of ordering. What decides which one succeeds is the
    // trigger's FOR UPDATE lock over the sibling row, not the application.
    const [first, second] = await Promise.all([
      request(app.getHttpServer())
        .patch(`/tenant/memberships/${saAId}/archetype`)
        .set('x-identity-id', byId.get(saAId)!)
        .set('x-tenant-id', tenantId)
        .send({ archetype: 'AA' }),
      request(app.getHttpServer())
        .patch(`/tenant/memberships/${saBId}/archetype`)
        .set('x-identity-id', byId.get(saBId)!)
        .set('x-tenant-id', tenantId)
        .send({ archetype: 'AA' }),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 409]);

    const survivorCheck = await connectAs('migration');
    const survivors = await survivorCheck.query<{ count: string }>(
      `SELECT count(*)::text FROM membership WHERE tenant_id = $1 AND archetype = 'SA' AND status = 'live'`,
      [tenantId],
    );
    await survivorCheck.end();
    expect(survivors.rows[0]!.count).toBe('1');
  });

  it('an SA who is last in tenant A but not in tenant B acts freely in B', async () => {
    const tenantA = await provisionTenant(app);
    const tenantB = await provisionTenant(app);

    const migration = await connectAs('migration');
    const identity = await migration.query<{ id: string }>(
      `INSERT INTO identity (subject, email, mfa_enrolled_at) VALUES ($1, $2, now()) RETURNING id`,
      [`idp|cross-tenant-sa-${Date.now()}`, `cross-tenant-sa-${Date.now()}@example.com`],
    );
    const identityId = identity.rows[0]!.id;
    const membershipA = await migration.query<{ id: string }>(
      `INSERT INTO membership (identity_id, tenant_id, archetype) VALUES ($1, $2, 'SA') RETURNING id`,
      [identityId, tenantA],
    );
    // A second SA in tenant B alongside our identity, so the identity holding SA
    // there too is not itself the last one in B.
    const otherSaB = await migration.query<{ id: string }>(
      `INSERT INTO identity (subject, email, mfa_enrolled_at) VALUES ($1, $2, now()) RETURNING id`,
      [`idp|other-sa-b-${Date.now()}`, `other-sa-b-${Date.now()}@example.com`],
    );
    await migration.query(`INSERT INTO membership (identity_id, tenant_id, archetype) VALUES ($1, $2, 'SA')`, [
      otherSaB.rows[0]!.id,
      tenantB,
    ]);
    await migration.query(`INSERT INTO membership (identity_id, tenant_id, archetype) VALUES ($1, $2, 'SA')`, [
      identityId,
      tenantB,
    ]);
    await migration.end();

    // Last in tenant A: demoting is refused.
    const refusedInA = await request(app.getHttpServer())
      .patch(`/tenant/memberships/${membershipA.rows[0]!.id}/archetype`)
      .set('x-identity-id', identityId)
      .set('x-tenant-id', tenantA)
      .send({ archetype: 'AA' });
    expect(refusedInA.status).toBe(409);

    // Not last in tenant B (otherSaB remains): demoting succeeds.
    const migration2 = await connectAs('migration');
    const membershipB = await migration2.query<{ id: string }>(
      `SELECT id FROM membership WHERE identity_id = $1 AND tenant_id = $2`,
      [identityId, tenantB],
    );
    await migration2.end();

    const permittedInB = await request(app.getHttpServer())
      .patch(`/tenant/memberships/${membershipB.rows[0]!.id}/archetype`)
      .set('x-identity-id', identityId)
      .set('x-tenant-id', tenantB)
      .send({ archetype: 'AA' });
    expect(permittedInB.status).toBe(200);
  });
});
