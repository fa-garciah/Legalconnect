/**
 * T068 / US3 scenario 3 — deactivation is a one-way transition that keeps the records.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { connectAs } from '../helpers/db';
import { createPlatformApp } from '../helpers/platform-app';
import { closePlatformDb } from '../../src/common/db/platform-client';
import { uniqueRfc } from '../helpers/rfc';

describe('POST /internal/platform/tenants/:id/deactivate', () => {
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

  const provision = async (name: string): Promise<string> => {
    const response = await request(app.getHttpServer())
      .post('/internal/platform/tenants')
      .send({ name, rfc: uniqueRfc(), planCode: 'esencial' });
    expect(response.status).toBe(201);
    return response.body.id as string;
  };

  it('returns 200 with the deactivated state', async () => {
    const id = await provision('Para Desactivar, S.C.');

    const response = await request(app.getHttpServer()).post(
      `/internal/platform/tenants/${id}/deactivate`,
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id, status: 'deactivated' });
    expect(response.body.deactivatedAt).toBeTruthy();
  });

  it('records one tenant.deactivated entry', async () => {
    const id = await provision('Auditar Desactivacion, S.C.');
    await request(app.getHttpServer()).post(`/internal/platform/tenants/${id}/deactivate`);

    const { rows } = await platform.query<{ action: string }>(
      `SELECT action FROM audit_event WHERE tenant_id = $1 ORDER BY occurred_at`,
      [id],
    );
    expect(rows.map((r) => r.action)).toEqual(['tenant.provisioned', 'tenant.deactivated']);
  });

  it('returns 409 already_deactivated on a second call', async () => {
    const id = await provision('Doble Desactivacion, S.C.');
    await request(app.getHttpServer()).post(`/internal/platform/tenants/${id}/deactivate`);

    const second = await request(app.getHttpServer()).post(
      `/internal/platform/tenants/${id}/deactivate`,
    );

    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('already_deactivated');
  });

  it('writes no second audit entry for the refused call', async () => {
    const id = await provision('Sin Doble Entrada, S.C.');
    await request(app.getHttpServer()).post(`/internal/platform/tenants/${id}/deactivate`);
    await request(app.getHttpServer()).post(`/internal/platform/tenants/${id}/deactivate`);

    const { rows } = await platform.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM audit_event
        WHERE tenant_id = $1 AND action = 'tenant.deactivated'`,
      [id],
    );
    expect(Number(rows[0]!.n)).toBe(1);
  });

  it('returns 404 for a tenant that does not exist', async () => {
    const response = await request(app.getHttpServer()).post(
      '/internal/platform/tenants/00000000-0000-4000-8000-000000000000/deactivate',
    );
    expect(response.status).toBe(404);
  });

  it('offers no reactivation path', async () => {
    // FR-006 makes this one-way. There is deliberately no endpoint to undo it, so a
    // mistaken deactivation is a support conversation rather than a button.
    const id = await provision('Sin Reactivar, S.C.');
    await request(app.getHttpServer()).post(`/internal/platform/tenants/${id}/deactivate`);

    const attempt = await request(app.getHttpServer()).post(
      `/internal/platform/tenants/${id}/activate`,
    );
    expect(attempt.status).toBe(404);
  });
});
