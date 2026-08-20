/**
 * T070 / quickstart V13 / FR-026 — a registry read records an entry only when a person
 * did it.
 *
 * Both directions asserted. Checking only that automated reads are silent would pass
 * against an implementation that records nothing, which is the failure FR-014 forbids;
 * checking only the interactive direction would miss the unbounded growth the gate
 * exists to prevent.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { connectAs } from '../helpers/db';
import { createPlatformApp } from '../helpers/platform-app';
import { closePlatformDb } from '../../src/common/db/platform-client';
import { uniqueRfc } from '../helpers/rfc';

describe('GET /internal/platform/tenants/:id — channel gating', () => {
  let app: INestApplication;
  let platform: Client;
  let tenantId: string;

  beforeAll(async () => {
    app = await createPlatformApp();
    platform = await connectAs('platform');

    const created = await request(app.getHttpServer())
      .post('/internal/platform/tenants')
      .send({ name: 'Registro, S.C.', rfc: uniqueRfc(), planCode: 'profesional' });
    tenantId = created.body.id as string;
  });

  afterAll(async () => {
    await app.close();
    await platform.end();
    await closePlatformDb();
  });

  const countReads = async (): Promise<number> => {
    const { rows } = await platform.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM audit_event
        WHERE tenant_id = $1 AND action = 'tenant.registry_read'`,
      [tenantId],
    );
    return Number(rows[0]!.n);
  };

  it('returns the tenant', async () => {
    const response = await request(app.getHttpServer()).get(
      `/internal/platform/tenants/${tenantId}`,
    );
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: tenantId, planCode: 'profesional' });
  });

  it('records exactly one entry for an interactive read', async () => {
    const before = await countReads();

    const response = await request(app.getHttpServer())
      .get(`/internal/platform/tenants/${tenantId}`)
      .set('x-channel', 'interactive');
    expect(response.status).toBe(200);

    expect(await countReads()).toBe(before + 1);
  });

  it('records nothing for an automated read', async () => {
    const before = await countReads();

    const response = await request(app.getHttpServer())
      .get(`/internal/platform/tenants/${tenantId}`)
      .set('x-channel', 'automated');
    expect(response.status).toBe(200);

    expect(await countReads()).toBe(before);
  });

  it('stays silent across a burst of automated polls', async () => {
    // The scenario the gate exists for: monitoring must not grow the log it watches.
    const before = await countReads();

    for (let i = 0; i < 8; i += 1) {
      await request(app.getHttpServer())
        .get(`/internal/platform/tenants/${tenantId}`)
        .set('x-channel', 'automated');
    }

    expect(await countReads()).toBe(before);
  });

  it('treats an absent channel header as interactive', async () => {
    // Over-recording is the safe direction: a missing entry is the failure Principle V
    // cannot tolerate, and volume is bounded by retention.
    const before = await countReads();
    await request(app.getHttpServer()).get(`/internal/platform/tenants/${tenantId}`);
    expect(await countReads()).toBe(before + 1);
  });

  it('returns 404 for a tenant that does not exist, and records nothing', async () => {
    const missing = '00000000-0000-4000-8000-000000000000';
    const response = await request(app.getHttpServer()).get(
      `/internal/platform/tenants/${missing}`,
    );
    expect(response.status).toBe(404);

    const { rows } = await platform.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM audit_event WHERE tenant_id = $1`,
      [missing],
    );
    expect(Number(rows[0]!.n)).toBe(0);
  });
});
