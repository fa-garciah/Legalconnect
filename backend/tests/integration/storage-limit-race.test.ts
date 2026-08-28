/**
 * T018 — research.md D4. Two concurrent uploads whose combined size exceeds the
 * tenant's remaining headroom: exactly one must succeed. A naive "check, then write"
 * sequence lets both pass their individual check before either commits.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createRealApp } from '../helpers/real-app';
import { connectAs } from '../helpers/db';
import { uniqueRfc } from '../helpers/rfc';
import { makeCaseFirm, nextSuffix, uniqueName, type CaseFirm } from '../helpers/case-core';

describe('the storage limit race (research.md D4)', () => {
  let app: INestApplication;
  let migration: Client;
  let firm: CaseFirm;
  let caseId: string;
  let categoryId: string;

  beforeAll(async () => {
    app = await createRealApp();
    migration = await connectAs('migration');
    firm = await makeCaseFirm(migration, `CC Carrera ${nextSuffix()}`, uniqueRfc());

    const client = await migration.query<{ id: string }>(
      `INSERT INTO client (tenant_id, kind, legal_name) VALUES ($1, 'organization', $2) RETURNING id`,
      [firm.tenantId, uniqueName('Cliente Carrera')],
    );
    const category = await migration.query<{ id: string }>(
      `INSERT INTO document_category (tenant_id, name) VALUES ($1, 'Unclassified') RETURNING id`,
      [firm.tenantId],
    );
    categoryId = category.rows[0]!.id;

    const openedCase = await request(app.getHttpServer())
      .post('/tenant/cases')
      .set('x-identity-id', firm.mp.identityId)
      .set('x-tenant-id', firm.tenantId)
      .send({ clientId: client.rows[0]!.id, fileNumber: uniqueName('EXP-RACE'), caseStatusId: firm.statusOpenId });
    caseId = openedCase.body.id;

    await request(app.getHttpServer())
      .post(`/tenant/cases/${caseId}/team`)
      .set('x-identity-id', firm.mp.identityId)
      .set('x-tenant-id', firm.tenantId)
      .send({ membershipId: firm.aa.membershipId, roleOnCase: 'lead' })
      .expect(201);
  });

  afterAll(async () => {
    await migration.end();
    await app.close();
  });

  const uploadOfSize = (bytes: number) =>
    request(app.getHttpServer())
      .post(`/tenant/cases/${caseId}/documents`)
      .set('x-identity-id', firm.aa.identityId)
      .set('x-tenant-id', firm.tenantId)
      .attach('file', Buffer.alloc(bytes, 'x'), { filename: 'grande.pdf', contentType: 'application/pdf' })
      .field('categoryId', categoryId);

  it('exactly one of two uploads that would jointly exceed the limit succeeds', async () => {
    // esencial's limit is 10 GiB (drizzle/seed.ts PLANS). Leave exactly 3 MB of
    // headroom, then fire two 2 MB uploads concurrently — individually each fits,
    // jointly they do not.
    const limitBytes = 10 * 1024 * 1024 * 1024;
    const headroom = 3 * 1024 * 1024;
    await migration.query(`UPDATE tenant SET storage_bytes_used = ($1::bigint) WHERE id = $2`, [
      limitBytes - headroom,
      firm.tenantId,
    ]);

    const eachUpload = 2 * 1024 * 1024;
    const [first, second] = await Promise.all([uploadOfSize(eachUpload), uploadOfSize(eachUpload)]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 403]);

    const refused = first.status === 403 ? first : second;
    expect(refused.body.error.code).toBe('limit_reached');

    const { rows } = await migration.query<{ storage_bytes_used: string }>(
      `SELECT storage_bytes_used FROM tenant WHERE id = $1`,
      [firm.tenantId],
    );
    // Exactly one upload's worth was added — no phantom double-reservation, and the
    // refused attempt left no trace in the counter.
    expect(Number(rows[0]!.storage_bytes_used)).toBe(limitBytes - headroom + eachUpload);
  });

  it('a failed upload leaves no orphaned reservation — a retry sees the same headroom', async () => {
    const limitBytes = 10 * 1024 * 1024 * 1024;
    await migration.query(`UPDATE tenant SET storage_bytes_used = ($1::bigint) WHERE id = $2`, [
      limitBytes - 1024,
      firm.tenantId,
    ]);

    const before = await migration.query<{ storage_bytes_used: string }>(
      `SELECT storage_bytes_used FROM tenant WHERE id = $1`,
      [firm.tenantId],
    );

    const refused = await uploadOfSize(2 * 1024 * 1024);
    expect(refused.status).toBe(403);

    const after = await migration.query<{ storage_bytes_used: string }>(
      `SELECT storage_bytes_used FROM tenant WHERE id = $1`,
      [firm.tenantId],
    );
    expect(after.rows[0]!.storage_bytes_used).toBe(before.rows[0]!.storage_bytes_used);
  });
});
