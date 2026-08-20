/**
 * T095 / US5 scenario 3 — changing to the tier already in effect returns
 * `422 same_plan`, and exactly one of the three tiers is ever in effect.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { connectAs } from '../helpers/db';
import { createPlatformApp } from '../helpers/platform-app';
import { closePlatformDb } from '../../src/common/db/platform-client';
import { uniqueRfc } from '../helpers/rfc';

describe('PATCH /internal/platform/tenants/:id/plan — invariants', () => {
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

  it('returns 422 same_plan when the target tier is already in effect', async () => {
    const created = await request(app.getHttpServer())
      .post('/internal/platform/tenants')
      .send({ name: 'Despacho Mismo Plan, S.C.', rfc: uniqueRfc(), planCode: 'profesional' });
    const tenantId = created.body.id as string;

    const response = await request(app.getHttpServer())
      .patch(`/internal/platform/tenants/${tenantId}/plan`)
      .send({ planCode: 'profesional' });

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ error: { code: 'same_plan' } });
  });

  it('leaves the tenant on exactly one of the three tiers, never zero or two', async () => {
    const created = await request(app.getHttpServer())
      .post('/internal/platform/tenants')
      .send({ name: 'Despacho Un Solo Plan, S.C.', rfc: uniqueRfc(), planCode: 'esencial' });
    const tenantId = created.body.id as string;

    await request(app.getHttpServer())
      .patch(`/internal/platform/tenants/${tenantId}/plan`)
      .send({ planCode: 'profesional' });

    const { rows } = await platform.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM tenant t
        JOIN plan p ON p.id = t.plan_id
       WHERE t.id = $1 AND p.code IN ('esencial', 'profesional', 'premium')`,
      [tenantId],
    );
    expect(Number(rows[0]!.n)).toBe(1);
  });

  it('rejects an unknown plan code as validation_failed', async () => {
    const created = await request(app.getHttpServer())
      .post('/internal/platform/tenants')
      .send({ name: 'Despacho Plan Desconocido, S.C.', rfc: uniqueRfc(), planCode: 'esencial' });
    const tenantId = created.body.id as string;

    const response = await request(app.getHttpServer())
      .patch(`/internal/platform/tenants/${tenantId}/plan`)
      .send({ planCode: 'diamante' });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { code: 'validation_failed' } });
  });
});
