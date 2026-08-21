/**
 * US6 — POST /internal/platform/tenants/:tenantId/seed-administrator.
 * contracts/platform-seed.md.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createPlatformApp } from '../helpers/platform-app';
import { closePlatformDb } from '../../src/common/db/platform-client';
import { uniqueRfc } from '../helpers/rfc';
import { connectAs } from '../helpers/db';

describe('POST /internal/platform/tenants/:id/seed-administrator (US6)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createPlatformApp();
  });

  afterAll(async () => {
    await app.close();
    await closePlatformDb();
  });

  async function freshTenant(): Promise<string> {
    const created = await request(app.getHttpServer())
      .post('/internal/platform/tenants')
      .send({ name: `Seed Test ${Date.now()}, S.C.`, rfc: uniqueRfc(), planCode: 'esencial' });
    expect(created.status).toBe(201);
    return created.body.id;
  }

  it('scenario 1: seeds one SA invitation for a zero-membership tenant, audited against that tenant', async () => {
    const tenantId = await freshTenant();

    const response = await request(app.getHttpServer())
      .post(`/internal/platform/tenants/${tenantId}/seed-administrator`)
      .send({ email: `first-admin-${Date.now()}@example.com` });

    expect(response.status).toBe(201);
    expect(response.body.targetArchetype).toBe('SA');
    expect(response.body.seeded).toBe(true);
    expect(response.body.tenantId).toBe(tenantId);

    const migration = await connectAs('migration');
    try {
      const { rows } = await migration.query(
        `SELECT count(*)::text AS n FROM audit_event WHERE action = 'invitation.seed_issued' AND tenant_id = $1`,
        [tenantId],
      );
      expect(Number(rows[0]!.n)).toBe(1);
    } finally {
      await migration.end();
    }
  });

  it('scenario 2: a tenant that already has a live membership refuses further seeding', async () => {
    const tenantId = await freshTenant();
    const migration = await connectAs('migration');
    try {
      const identity = await migration.query<{ id: string }>(
        `INSERT INTO identity (subject, email, mfa_enrolled_at) VALUES ($1, 'already@example.com', now()) RETURNING id`,
        [`idp|already-administered-${Date.now()}`],
      );
      await migration.query(`INSERT INTO membership (identity_id, tenant_id, archetype) VALUES ($1, $2, 'SA')`, [
        identity.rows[0]!.id,
        tenantId,
      ]);
    } finally {
      await migration.end();
    }

    const response = await request(app.getHttpServer())
      .post(`/internal/platform/tenants/${tenantId}/seed-administrator`)
      .send({ email: 'second-admin@example.com' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('tenant_already_has_members');
  });

  it('scenario 3: the platform operator acquires no membership and no read access as a side effect', async () => {
    const tenantId = await freshTenant();
    await request(app.getHttpServer())
      .post(`/internal/platform/tenants/${tenantId}/seed-administrator`)
      .send({ email: `no-side-effect-${Date.now()}@example.com` });

    const migration = await connectAs('migration');
    try {
      const { rows } = await migration.query(
        `SELECT count(*)::text AS n FROM membership WHERE tenant_id = $1`,
        [tenantId],
      );
      expect(Number(rows[0]!.n)).toBe(0);
    } finally {
      await migration.end();
    }
  });

  it('scenario 4: the target archetype is always SA, regardless of request body', async () => {
    const tenantId = await freshTenant();
    const response = await request(app.getHttpServer())
      .post(`/internal/platform/tenants/${tenantId}/seed-administrator`)
      .send({ email: 'x@example.com', targetArchetype: 'MP' });

    expect(response.status).toBe(201);
    expect(response.body.targetArchetype).toBe('SA');
  });

  it('scenario 5: a further seed invitation is allowed while the tenant still has zero live memberships, each separately audited', async () => {
    const tenantId = await freshTenant();
    const first = await request(app.getHttpServer())
      .post(`/internal/platform/tenants/${tenantId}/seed-administrator`)
      .send({ email: `first-${Date.now()}@example.com` });
    expect(first.status).toBe(201);

    const second = await request(app.getHttpServer())
      .post(`/internal/platform/tenants/${tenantId}/seed-administrator`)
      .send({ email: `second-${Date.now()}@example.com` });
    expect(second.status).toBe(201);
    expect(second.body.id).not.toBe(first.body.id);

    const migration = await connectAs('migration');
    try {
      const { rows } = await migration.query(
        `SELECT count(*)::text AS n FROM audit_event WHERE action = 'invitation.seed_issued' AND tenant_id = $1`,
        [tenantId],
      );
      expect(Number(rows[0]!.n)).toBe(2);
    } finally {
      await migration.end();
    }
  });

  it('scenario 6: seeding a deactivated tenant is refused', async () => {
    const tenantId = await freshTenant();
    const deactivated = await request(app.getHttpServer()).post(
      `/internal/platform/tenants/${tenantId}/deactivate`,
    );
    expect(deactivated.status).toBe(200);

    const response = await request(app.getHttpServer())
      .post(`/internal/platform/tenants/${tenantId}/seed-administrator`)
      .send({ email: 'x@example.com' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('already_deactivated');
  });
});
