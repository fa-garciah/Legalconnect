/**
 * T065 / quickstart V7 / US3 scenarios 2 & 5 — a duplicate RFC is refused and leaves
 * no partial tenant.
 *
 * The refusal must come from the DATABASE constraint, not an application
 * read-then-write check. FR-007's guarantee has to hold under concurrency, and a
 * check-then-insert has a window between the two where both callers see "available".
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { connectAs } from '../helpers/db';
import { createPlatformApp } from '../helpers/platform-app';
import { closePlatformDb } from '../../src/common/db/platform-client';
import { uniqueRfc } from '../helpers/rfc';

describe('duplicate RFC on provisioning', () => {
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

  it('returns 409 rfc_already_registered on the second attempt', async () => {
    const rfc = uniqueRfc();

    const first = await request(app.getHttpServer())
      .post('/internal/platform/tenants')
      .send({ name: 'Primero, S.C.', rfc, planCode: 'esencial' });
    expect(first.status).toBe(201);

    const second = await request(app.getHttpServer())
      .post('/internal/platform/tenants')
      .send({ name: 'Segundo, S.C.', rfc, planCode: 'premium' });

    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('rfc_already_registered');
  });

  it('leaves exactly one tenant, and no partial second one', async () => {
    const rfc = uniqueRfc();

    await request(app.getHttpServer())
      .post('/internal/platform/tenants')
      .send({ name: 'Unico, S.C.', rfc, planCode: 'esencial' });
    await request(app.getHttpServer())
      .post('/internal/platform/tenants')
      .send({ name: 'Duplicado, S.C.', rfc, planCode: 'esencial' });

    const { rows } = await platform.query<{ n: string; name: string }>(
      'SELECT count(*)::text AS n, min(name) AS name FROM tenant WHERE rfc = $1',
      [rfc],
    );
    expect(Number(rows[0]!.n)).toBe(1);
    expect(rows[0]!.name).toBe('Unico, S.C.');
  });

  it('writes no audit entry for the rejected attempt', async () => {
    // Provisioning that did not happen must not appear to have happened. The append
    // shares the transaction, so the rollback takes the entry with it.
    const rfc = uniqueRfc();
    await request(app.getHttpServer())
      .post('/internal/platform/tenants')
      .send({ name: 'Auditado Unico, S.C.', rfc, planCode: 'esencial' });
    await request(app.getHttpServer())
      .post('/internal/platform/tenants')
      .send({ name: 'Auditado Duplicado, S.C.', rfc, planCode: 'esencial' });

    const { rows } = await platform.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM audit_event
        WHERE action = 'tenant.provisioned'
          AND target_id = (SELECT id FROM tenant WHERE rfc = $1)`,
      [rfc],
    );
    expect(Number(rows[0]!.n)).toBe(1);
  });

  it('treats a differently-cased RFC as the same RFC', async () => {
    const rfc = uniqueRfc();
    const first = await request(app.getHttpServer())
      .post('/internal/platform/tenants')
      .send({ name: 'Mayus, S.C.', rfc, planCode: 'esencial' });
    expect(first.status).toBe(201);

    const second = await request(app.getHttpServer())
      .post('/internal/platform/tenants')
      .send({ name: 'Minus, S.C.', rfc: rfc.toLowerCase(), planCode: 'esencial' });

    // Normalised before the uniqueness check, otherwise two rows for one legal entity.
    expect(second.status).toBe(409);
  });
});
