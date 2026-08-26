/**
 * FR-009, FR-012 — PATCH /tenant/memberships/:id/revoke and .../archetype.
 * contracts/tenant-invitations.md.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createRealApp } from '../helpers/real-app';
import { seededTenantIds, type SeededTenants } from '../helpers/tenants';
import { seededIdentities, type SeededIdentities } from '../helpers/identities';
import { connectAs } from '../helpers/db';
import { uniqueRfc } from '../helpers/rfc';

describe('membership revoke and archetype change', () => {
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

  async function freshMember(): Promise<string> {
    const migration = await connectAs('migration');
    try {
      const identity = await migration.query<{ id: string }>(
        `INSERT INTO identity (subject, email, mfa_enrolled_at) VALUES ($1, 'member@example.com', now()) RETURNING id`,
        [`idp|member-${Date.now()}-${Math.random()}`],
      );
      const membership = await migration.query<{ id: string }>(
        `INSERT INTO membership (identity_id, tenant_id, archetype) VALUES ($1, $2, 'AA') RETURNING id`,
        [identity.rows[0]!.id, tenants.a],
      );
      return membership.rows[0]!.id;
    } finally {
      await migration.end();
    }
  }

  it('SA can revoke a membership; a second revoke is refused', async () => {
    const membershipId = await freshMember();

    const revoked = await request(app.getHttpServer())
      .patch(`/tenant/memberships/${membershipId}/revoke`)
      .set('x-identity-id', identities.dualId)
      .set('x-tenant-id', tenants.a)
      .send();
    expect(revoked.status).toBe(200);
    expect(revoked.body.status).toBe('revoked');

    const second = await request(app.getHttpServer())
      .patch(`/tenant/memberships/${membershipId}/revoke`)
      .set('x-identity-id', identities.dualId)
      .set('x-tenant-id', tenants.a)
      .send();
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('already_revoked');
  });

  it('takes effect on the next request — revocation is checked live, not cached (FR-010)', async () => {
    const migration = await connectAs('migration');
    let identityId: string;
    let membershipId: string;
    try {
      const identity = await migration.query<{ id: string }>(
        `INSERT INTO identity (subject, email, mfa_enrolled_at) VALUES ($1, 'live-check@example.com', now()) RETURNING id`,
        [`idp|live-check-${Date.now()}`],
      );
      identityId = identity.rows[0]!.id;
      const membership = await migration.query<{ id: string }>(
        `INSERT INTO membership (identity_id, tenant_id, archetype) VALUES ($1, $2, 'AA') RETURNING id`,
        [identityId, tenants.a],
      );
      membershipId = membership.rows[0]!.id;
    } finally {
      await migration.end();
    }

    const before = await request(app.getHttpServer())
      .get('/identity/memberships')
      .set('x-identity-id', identityId);
    expect(before.body.items).toHaveLength(1);

    await request(app.getHttpServer())
      .patch(`/tenant/memberships/${membershipId}/revoke`)
      .set('x-identity-id', identities.dualId)
      .set('x-tenant-id', tenants.a)
      .send();

    const after = await request(app.getHttpServer())
      .get('/identity/memberships')
      .set('x-identity-id', identityId);
    expect(after.body.items).toHaveLength(0);
  });

  it('SA may change a live membership\'s archetype, recorded with previous and new values', async () => {
    const membershipId = await freshMember();

    // The seeded dual identity is MP in tenant A, not SA — this scenario
    // needs a real SA to exercise the success path.
    const migration = await connectAs('migration');
    let saIdentityId: string;
    try {
      const identity = await migration.query<{ id: string }>(
        `INSERT INTO identity (subject, email, mfa_enrolled_at) VALUES ($1, 'sa-actor@example.com', now()) RETURNING id`,
        [`idp|sa-actor-${Date.now()}`],
      );
      saIdentityId = identity.rows[0]!.id;
      await migration.query(`INSERT INTO membership (identity_id, tenant_id, archetype) VALUES ($1, $2, 'SA')`, [
        saIdentityId,
        tenants.a,
      ]);
    } finally {
      await migration.end();
    }

    const response = await request(app.getHttpServer())
      .patch(`/tenant/memberships/${membershipId}/archetype`)
      .set('x-identity-id', saIdentityId)
      .set('x-tenant-id', tenants.a)
      .send({ archetype: 'PL' });

    expect(response.status).toBe(200);
    expect(response.body.archetype).toBe('PL');

    const migration2 = await connectAs('migration');
    try {
      const { rows } = await migration2.query(
        `SELECT metadata FROM audit_event WHERE action = 'membership.archetype_changed' AND target_id = $1`,
        [membershipId],
      );
      expect(rows[0]?.metadata).toEqual({ from: 'AA', to: 'PL' });
    } finally {
      await migration2.end();
    }
  });

  it('MP may revoke but not change an archetype', async () => {
    const membershipId = await freshMember();

    // dual holds MP in tenant A.
    const response = await request(app.getHttpServer())
      .patch(`/tenant/memberships/${membershipId}/archetype`)
      .set('x-identity-id', identities.dualId)
      .set('x-tenant-id', tenants.a)
      .send({ archetype: 'PL' });

    expect(response.status).toBe(403);
  });

  it('T053 (004): a refused last-SA archetype change writes no audit entry at all', async () => {
    // A throwaway tenant with exactly one live SA — the actor demoting themselves.
    const migration = await connectAs('migration');
    let tenantId: string;
    let saIdentityId: string;
    let saMembershipId: string;
    try {
      const tenant = await migration.query<{ id: string }>(
        `INSERT INTO tenant (name, rfc, plan_id)
         VALUES ($1, $2, (SELECT id FROM plan WHERE code = 'esencial'))
         RETURNING id`,
        ['T053 Audit Probe, S.C.', uniqueRfc()],
      );
      tenantId = tenant.rows[0]!.id;
      const identity = await migration.query<{ id: string }>(
        `INSERT INTO identity (subject, email, mfa_enrolled_at) VALUES ($1, $2, now()) RETURNING id`,
        [`idp|t053-${Date.now()}`, `t053-${Date.now()}@example.com`],
      );
      saIdentityId = identity.rows[0]!.id;
      const membership = await migration.query<{ id: string }>(
        `INSERT INTO membership (identity_id, tenant_id, archetype) VALUES ($1, $2, 'SA') RETURNING id`,
        [saIdentityId, tenantId],
      );
      saMembershipId = membership.rows[0]!.id;
    } finally {
      await migration.end();
    }

    const refused = await request(app.getHttpServer())
      .patch(`/tenant/memberships/${saMembershipId}/archetype`)
      .set('x-identity-id', saIdentityId)
      .set('x-tenant-id', tenantId)
      .send({ archetype: 'AA' });
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('last_administrator_protected');

    const check = await connectAs('migration');
    try {
      const { rows } = await check.query(
        `SELECT * FROM audit_event WHERE action = 'membership.archetype_changed' AND target_id = $1`,
        [saMembershipId],
      );
      expect(rows).toHaveLength(0);
    } finally {
      await check.end();
    }
  });
});
