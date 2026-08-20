/**
 * T094 / US5 scenario 4 — a change to a tier whose limits the tenant currently
 * exceeds returns `409 limits_exceeded` naming which limits, and succeeds when
 * re-sent with acknowledgement.
 *
 * Nothing in this slice tracks real business usage (no business tables exist
 * yet — modules/plan/README.md states enforcement is slice 004's job). The
 * comparison is against the tenant's CURRENT plan's limits, which is the only
 * quantitative reference this slice has: "the tier you are leaving allowed 100
 * users, the tier you are entering allows 10" is a real, checkable statement
 * without inventing usage data this slice does not own.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createPlatformApp } from '../helpers/platform-app';
import { closePlatformDb } from '../../src/common/db/platform-client';
import { uniqueRfc } from '../helpers/rfc';

describe('PATCH /internal/platform/tenants/:id/plan — limits exceeded', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createPlatformApp();
  });

  afterAll(async () => {
    await app.close();
    await closePlatformDb();
  });

  it('refuses with 409 and names the exceeded limits', async () => {
    const created = await request(app.getHttpServer())
      .post('/internal/platform/tenants')
      .send({ name: 'Despacho Sobre Límite, S.C.', rfc: uniqueRfc(), planCode: 'premium' });
    const tenantId = created.body.id as string;

    const response = await request(app.getHttpServer())
      .patch(`/internal/platform/tenants/${tenantId}/plan`)
      .send({ planCode: 'esencial' });

    expect(response.status).toBe(409);
    expect(response.body.error).toMatchObject({ code: 'limits_exceeded' });
    expect(response.body.exceeded).toContainEqual(
      expect.objectContaining({ limit: 'users', current: 100, target: 10 }),
    );
  });

  it('succeeds when re-sent with acknowledgement', async () => {
    const created = await request(app.getHttpServer())
      .post('/internal/platform/tenants')
      .send({ name: 'Despacho Confirma Bajada, S.C.', rfc: uniqueRfc(), planCode: 'premium' });
    const tenantId = created.body.id as string;

    const refused = await request(app.getHttpServer())
      .patch(`/internal/platform/tenants/${tenantId}/plan`)
      .send({ planCode: 'esencial' });
    expect(refused.status).toBe(409);

    const acknowledged = await request(app.getHttpServer())
      .patch(`/internal/platform/tenants/${tenantId}/plan`)
      .send({ planCode: 'esencial', acknowledgeExceededLimits: true });

    expect(acknowledged.status).toBe(200);
    expect(acknowledged.body).toMatchObject({ id: tenantId, planCode: 'esencial' });
  });

  it('does not flag a change to a tier with equal or higher limits', async () => {
    const created = await request(app.getHttpServer())
      .post('/internal/platform/tenants')
      .send({ name: 'Despacho Sube De Plan, S.C.', rfc: uniqueRfc(), planCode: 'esencial' });
    const tenantId = created.body.id as string;

    const response = await request(app.getHttpServer())
      .patch(`/internal/platform/tenants/${tenantId}/plan`)
      .send({ planCode: 'premium' });

    expect(response.status).toBe(200);
  });
});
