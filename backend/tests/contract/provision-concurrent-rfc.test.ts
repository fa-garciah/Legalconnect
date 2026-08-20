/**
 * T066 — two concurrent provisionings with the same RFC produce exactly one tenant.
 *
 * This is the test that distinguishes a database constraint from an application
 * read-then-write check. A check-then-insert passes the sequential duplicate test in
 * T065 and fails this one, because both callers read "available" before either writes.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { connectAs } from '../helpers/db';
import { createPlatformApp } from '../helpers/platform-app';
import { closePlatformDb } from '../../src/common/db/platform-client';
import { uniqueRfc } from '../helpers/rfc';

describe('concurrent provisioning with the same RFC', () => {
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

  it('creates one tenant and refuses the other', async () => {
    const rfc = uniqueRfc();
    const server = app.getHttpServer();

    const attempts = await Promise.all(
      ['Concurrente A, S.C.', 'Concurrente B, S.C.'].map((name) =>
        request(server).post('/internal/platform/tenants').send({ name, rfc, planCode: 'esencial' }),
      ),
    );

    const statuses = attempts.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409]);

    const { rows } = await platform.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM tenant WHERE rfc = $1',
      [rfc],
    );
    expect(Number(rows[0]!.n)).toBe(1);
  });

  it('records exactly one provisioning entry for the winner', async () => {
    const rfc = uniqueRfc();
    const server = app.getHttpServer();

    await Promise.all(
      ['Uno, S.C.', 'Dos, S.C.'].map((name) =>
        request(server).post('/internal/platform/tenants').send({ name, rfc, planCode: 'esencial' }),
      ),
    );

    const { rows } = await platform.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM audit_event
        WHERE action = 'tenant.provisioned'
          AND target_id = (SELECT id FROM tenant WHERE rfc = $1)`,
      [rfc],
    );
    expect(Number(rows[0]!.n)).toBe(1);
  });

  it('holds under five simultaneous attempts, not just two', async () => {
    const rfc = uniqueRfc();
    const server = app.getHttpServer();

    const attempts = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        request(server)
          .post('/internal/platform/tenants')
          .send({ name: `Rafaga ${i}, S.C.`, rfc, planCode: 'esencial' }),
      ),
    );

    expect(attempts.filter((r) => r.status === 201)).toHaveLength(1);
    expect(attempts.filter((r) => r.status === 409)).toHaveLength(4);
  });
});
