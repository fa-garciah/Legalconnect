/**
 * T064 / AS-01 — provisioning a firm as an isolated tenant, and the audit entry that
 * must accompany it.
 *
 * This is the first REAL business mutation in the slice, so it is also the first
 * end-to-end exercise of the audit interceptor: everything before this used an append
 * as a stand-in for a mutation.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { connectAs } from '../helpers/db';
import { createPlatformApp } from '../helpers/platform-app';
import { closePlatformDb } from '../../src/common/db/platform-client';
import { uniqueRfc } from '../helpers/rfc';

describe('POST /internal/platform/tenants', () => {
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

  it('creates the tenant and returns 201 with its body', async () => {
    const rfc = uniqueRfc();
    const response = await request(app.getHttpServer())
      .post('/internal/platform/tenants')
      .send({ name: 'Despacho Nuevo, S.C.', rfc, planCode: 'profesional' });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      name: 'Despacho Nuevo, S.C.',
      rfc,
      planCode: 'profesional',
      status: 'active',
    });
    expect(response.body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.body.createdAt).toBeTruthy();
  });

  it('records exactly one tenant.provisioned entry, against the new tenant', async () => {
    const rfc = uniqueRfc();
    const response = await request(app.getHttpServer())
      .post('/internal/platform/tenants')
      .send({ name: 'Despacho Auditado, S.C.', rfc, planCode: 'esencial' });

    expect(response.status).toBe(201);
    const tenantId = response.body.id as string;

    const { rows } = await platform.query<{
      action: string;
      target_entity: string;
      target_id: string;
      actor_identity_id: string | null;
      source: { channel?: string };
    }>('SELECT * FROM audit_event WHERE tenant_id = $1', [tenantId]);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.action).toBe('tenant.provisioned');
    expect(rows[0]!.target_entity).toBe('tenant');
    expect(rows[0]!.target_id).toBe(tenantId);
    // The platform context is not a membership in the firm it just created, so no
    // actor identity is recorded here until slice 002 gives the surface real ones.
    expect(rows[0]!.actor_identity_id).toBeNull();
    expect(rows[0]!.source.channel).toBe('interactive');
  });

  it('starts the tenant on the plan it was contracted for', async () => {
    const rfc = uniqueRfc();
    const response = await request(app.getHttpServer())
      .post('/internal/platform/tenants')
      .send({ name: 'Despacho Premium, S.C.', rfc, planCode: 'premium' });

    const { rows } = await platform.query<{ code: string }>(
      `SELECT p.code FROM tenant t JOIN plan p ON p.id = t.plan_id WHERE t.id = $1`,
      [response.body.id],
    );
    expect(rows[0]!.code).toBe('premium');
  });

  it('leaves the new tenant isolated — the app role sees it only in its own context', async () => {
    const rfc = uniqueRfc();
    const created = await request(app.getHttpServer())
      .post('/internal/platform/tenants')
      .send({ name: 'Despacho Aislado, S.C.', rfc, planCode: 'esencial' });

    const newId = created.body.id as string;
    const appClient = await connectAs('app');
    try {
      await appClient.query('BEGIN');
      await appClient.query('SELECT set_config($1,$2,true)', ['app.tenant_id', newId]);
      const own = await appClient.query('SELECT id FROM tenant');
      await appClient.query('COMMIT');

      expect(own.rows).toHaveLength(1);
      expect((own.rows[0] as { id: string }).id).toBe(newId);
    } finally {
      await appClient.end();
    }
  });
});
