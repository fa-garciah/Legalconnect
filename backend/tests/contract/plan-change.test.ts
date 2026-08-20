/**
 * T093 / US5 scenario 1 / SC-008 — `PATCH .../plan` changes the tier, records
 * `tenant.plan_changed` with previous and new values, and performs no deployment
 * (there is nothing here to deploy — the change is a row update, which is the
 * point).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { connectAs } from '../helpers/db';
import { createPlatformApp } from '../helpers/platform-app';
import { closePlatformDb } from '../../src/common/db/platform-client';
import { uniqueRfc } from '../helpers/rfc';

describe('PATCH /internal/platform/tenants/:id/plan', () => {
  let app: INestApplication;
  let platform: Client;

  beforeAll(async () => {
    app = await createPlatformApp();
    platform = await connectAs('platform');
  });

  afterAll(async () => {
    await app.close();
    await platform.end();
    await closePlatformDb();
  });

  it('changes the tier and records tenant.plan_changed with previous and new values', async () => {
    const created = await request(app.getHttpServer())
      .post('/internal/platform/tenants')
      .send({ name: 'Despacho Cambia Plan, S.C.', rfc: uniqueRfc(), planCode: 'profesional' });
    const tenantId = created.body.id as string;

    const response = await request(app.getHttpServer())
      .patch(`/internal/platform/tenants/${tenantId}/plan`)
      .send({ planCode: 'premium' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: tenantId, planCode: 'premium' });
    expect(response.body.changedAt).toBeTruthy();

    const { rows: tenantRows } = await platform.query<{ code: string }>(
      `SELECT p.code FROM tenant t JOIN plan p ON p.id = t.plan_id WHERE t.id = $1`,
      [tenantId],
    );
    expect(tenantRows[0]!.code).toBe('premium');

    const { rows: auditRows } = await platform.query<{
      action: string;
      target_entity: string;
      target_id: string;
      metadata: { from?: string; to?: string };
    }>(`SELECT * FROM audit_event WHERE tenant_id = $1 AND action = 'tenant.plan_changed'`, [tenantId]);

    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]!.target_entity).toBe('tenant');
    expect(auditRows[0]!.target_id).toBe(tenantId);
    expect(auditRows[0]!.metadata).toMatchObject({ from: 'profesional', to: 'premium' });
  });

  it('returns 404 for a tenant that does not exist', async () => {
    const missing = '00000000-0000-4000-8000-000000000000';
    const response = await request(app.getHttpServer())
      .patch(`/internal/platform/tenants/${missing}/plan`)
      .send({ planCode: 'premium' });

    expect(response.status).toBe(404);
  });
});
