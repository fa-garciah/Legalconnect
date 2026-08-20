/**
 * T069 / FR-006 / SC-011 — no capability anywhere hard-deletes a tenant.
 *
 * Asserted at both levels, because either alone is insufficient: an endpoint could be
 * added later, and a grant could be added later. The guarantee is that neither exists
 * now and that a test fails the moment one does.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { connectAs } from '../helpers/db';
import { createPlatformApp } from '../helpers/platform-app';
import { closePlatformDb } from '../../src/common/db/platform-client';
import { uniqueRfc } from '../helpers/rfc';

describe('tenants cannot be hard-deleted', () => {
  let app: INestApplication;
  let migration: Client;
  let tenantId: string;

  beforeAll(async () => {
    app = await createPlatformApp();
    migration = await connectAs('migration');

    const created = await request(app.getHttpServer())
      .post('/internal/platform/tenants')
      .send({ name: 'Indestructible, S.C.', rfc: uniqueRfc(), planCode: 'esencial' });
    tenantId = created.body.id as string;
  });

  afterAll(async () => {
    await app.close();
    await migration.end();
    await closePlatformDb();
  });

  it.each(['lc_app', 'lc_platform', 'lc_retention', 'lc_audit_writer'])(
    '%s holds no DELETE privilege on tenant',
    async (role) => {
      const { rows } = await migration.query<{ del: boolean }>(
        `SELECT has_table_privilege($1, 'tenant', 'DELETE') AS del`,
        [role],
      );
      expect(rows[0]!.del).toBe(false);
    },
  );

  it('exposes no DELETE route on the platform surface', async () => {
    const response = await request(app.getHttpServer()).delete(
      `/internal/platform/tenants/${tenantId}`,
    );
    expect(response.status).toBe(404);
  });

  it('refuses a DELETE attempted directly as the platform role', async () => {
    const platform = await connectAs('platform');
    try {
      await expect(
        platform.query('DELETE FROM tenant WHERE id = $1', [tenantId]),
      ).rejects.toThrow(/permission denied/i);
    } finally {
      await platform.end();
    }
  });

  it('keeps the row after every attempt', async () => {
    const { rows } = await migration.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM tenant WHERE id = $1',
      [tenantId],
    );
    expect(Number(rows[0]!.n)).toBe(1);
  });
});
