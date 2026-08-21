/**
 * US2 — contracts/tenant-invitations.md, POST /tenant/invitations.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createRealApp } from '../helpers/real-app';
import { seededTenantIds, type SeededTenants } from '../helpers/tenants';
import { seededIdentities, type SeededIdentities } from '../helpers/identities';
import { connectAs } from '../helpers/db';

describe('POST /tenant/invitations (US2)', () => {
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

  it('scenario 1: an authorized archetype issues a 7-day single-use invitation, recorded in the audit log', async () => {
    const response = await request(app.getHttpServer())
      .post('/tenant/invitations')
      .set('x-identity-id', identities.dualId)
      .set('x-tenant-id', tenants.a)
      .send({ email: `invitee-${Date.now()}@example.com`, targetArchetype: 'AA' });

    expect(response.status).toBe(201);
    expect(response.body.targetArchetype).toBe('AA');
    expect(response.body.status).toBe('pending');
    expect(response.body.email).toBeUndefined();
    expect(response.body.referenceHash).toBeUndefined();

    const issuedAt = new Date(response.body.issuedAt).getTime();
    const expiresAt = new Date(response.body.expiresAt).getTime();
    expect(expiresAt - issuedAt).toBe(7 * 24 * 60 * 60 * 1000);

    const migration = await connectAs('migration');
    try {
      const { rows } = await migration.query(
        `SELECT count(*)::text AS n FROM audit_event WHERE action = 'invitation.issued' AND target_id = $1`,
        [response.body.id],
      );
      expect(Number(rows[0].n)).toBe(1);
    } finally {
      await migration.end();
    }
  });

  it('scenario 2: an archetype without the invite capability is refused and creates nothing', async () => {
    // The dual identity's tenant-B membership is IC — no invite capability.
    const before = await countInvitations(tenants.b);

    const response = await request(app.getHttpServer())
      .post('/tenant/invitations')
      .set('x-identity-id', identities.dualId)
      .set('x-tenant-id', tenants.b)
      .send({ email: 'nope@example.com', targetArchetype: 'AA' });

    expect(response.status).toBe(403);
    expect(await countInvitations(tenants.b)).toBe(before);
  });

  it('scenario 4: a target archetype broader than the issuer\'s own is refused', async () => {
    // MP may not invite SA — SA outranks MP in this slice's ceiling check.
    const response = await request(app.getHttpServer())
      .post('/tenant/invitations')
      .set('x-identity-id', identities.dualId)
      .set('x-tenant-id', tenants.a)
      .send({ email: 'toobig@example.com', targetArchetype: 'SA' });

    expect(response.status).toBe(403);
  });

  it('scenario 6: inviting into a deactivated tenant is refused', async () => {
    const platform = await connectAs('platform');
    let deactivatedTenantId: string;
    try {
      const provisioned = await platform.query<{ id: string }>(
        `INSERT INTO tenant (name, rfc, plan_id)
         VALUES ('Invite Deactivated Test, S.C.', $1, (SELECT id FROM plan LIMIT 1))
         RETURNING id`,
        [`IDT${Date.now().toString().slice(-6)}AB1`],
      );
      deactivatedTenantId = provisioned.rows[0]!.id;
      await platform.query(
        `UPDATE tenant SET status = 'deactivated', deactivated_at = now() WHERE id = $1`,
        [deactivatedTenantId],
      );
    } finally {
      await platform.end();
    }

    // The tenant-context mechanism refuses activation before the handler
    // runs at all (001's existing behaviour) — this is 001's cross-tenant
    // refusal shape, reused unchanged.
    const response = await request(app.getHttpServer())
      .post('/tenant/invitations')
      .set('x-identity-id', identities.dualId)
      .set('x-tenant-id', deactivatedTenantId)
      .send({ email: 'x@example.com', targetArchetype: 'AA' });

    expect(response.status).toBe(404);
  });

  async function countInvitations(tenantId: string): Promise<number> {
    const migration = await connectAs('migration');
    try {
      const { rows } = await migration.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM invitation WHERE tenant_id = $1`,
        [tenantId],
      );
      return Number(rows[0]!.n);
    } finally {
      await migration.end();
    }
  }
});
