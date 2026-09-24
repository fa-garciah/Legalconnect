/**
 * 021 T007 (Decision 4). Uploads have a size cap: `DOCUMENT_MAX_UPLOAD_BYTES`, default 25 MB.
 *
 * Before this, multer ran with no limit and held every upload in the API's memory whatever its
 * size. An oversized file is refused `413 file_too_large` in the product's own refusal shape —
 * not Nest's default body, which the frontend's classifier cannot read — and leaves nothing
 * behind: no row, no storage counted, no object.
 *
 * The limit is read when the app is created, so this suite sets a small one first.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createAuthenticatedApp } from '../helpers/real-app';
import { connectAs } from '../helpers/db';
import { uniqueRfc } from '../helpers/rfc';
import { makeCaseFirm, nextSuffix, uniqueName, type CaseFirm } from '../helpers/case-core';
import { maxUploadBytes } from '../../src/modules/documents/upload-limit';

const LIMIT = 1024;

describe('the upload size cap (021 Decision 4)', () => {
  let app: INestApplication;
  let migration: Client;
  let firm: CaseFirm;
  let caseId: string;
  let previous: string | undefined;

  const upload = (bytes: number) =>
    request(app.getHttpServer())
      .post(`/tenant/cases/${caseId}/documents`)
      .set('x-identity-id', firm.mp.identityId)
      .set('x-tenant-id', firm.tenantId)
      .attach('file', Buffer.alloc(bytes, 0x41), { filename: 'grande.pdf', contentType: 'application/pdf' });

  const counts = async () => {
    const docs = await migration.query<{ n: string }>(`SELECT count(*)::text AS n FROM document WHERE tenant_id = $1`, [
      firm.tenantId,
    ]);
    const used = await migration.query<{ storage_bytes_used: string }>(
      `SELECT storage_bytes_used::text FROM tenant WHERE id = $1`,
      [firm.tenantId],
    );
    return { docs: Number(docs.rows[0]!.n), used: used.rows[0]!.storage_bytes_used };
  };

  beforeAll(async () => {
    previous = process.env.DOCUMENT_MAX_UPLOAD_BYTES;
    process.env.DOCUMENT_MAX_UPLOAD_BYTES = String(LIMIT);
    app = await createAuthenticatedApp();
    migration = await connectAs('migration');
    firm = await makeCaseFirm(migration, `CC Tope ${nextSuffix()}`, uniqueRfc());
    await migration.query(`INSERT INTO document_category (tenant_id, name) VALUES ($1, 'Unclassified')`, [
      firm.tenantId,
    ]);
    const client = await migration.query<{ id: string }>(
      `INSERT INTO client (tenant_id, kind, legal_name) VALUES ($1, 'organization', $2) RETURNING id`,
      [firm.tenantId, uniqueName('Cliente Tope')],
    );
    const opened = await request(app.getHttpServer())
      .post('/tenant/cases')
      .set('x-identity-id', firm.mp.identityId)
      .set('x-tenant-id', firm.tenantId)
      .send({ clientId: client.rows[0]!.id, fileNumber: uniqueName('EXP-TOPE'), caseStatusId: firm.statusOpenId });
    caseId = opened.body.id;
  });

  afterAll(async () => {
    if (previous === undefined) delete process.env.DOCUMENT_MAX_UPLOAD_BYTES;
    else process.env.DOCUMENT_MAX_UPLOAD_BYTES = previous;
    await migration?.end();
    await app?.close();
  });

  it('a file at the limit is accepted', async () => {
    expect((await upload(LIMIT)).status).toBe(201);
  });

  it('a file over the limit is refused 413 file_too_large in the product’s refusal shape', async () => {
    const response = await upload(LIMIT + 1);
    expect(response.status).toBe(413);
    expect(response.body.error?.code).toBe('file_too_large');
    expect(typeof response.body.error?.message).toBe('string');
  });

  it('a refused upload leaves no row and counts no storage', async () => {
    const before = await counts();
    expect((await upload(LIMIT * 4)).status).toBe(413);
    expect(await counts()).toEqual(before);
  });

  it('defaults to 25 MB when unset, and ignores a malformed value', () => {
    const saved = process.env.DOCUMENT_MAX_UPLOAD_BYTES;
    delete process.env.DOCUMENT_MAX_UPLOAD_BYTES;
    expect(maxUploadBytes()).toBe(25 * 1024 * 1024);
    process.env.DOCUMENT_MAX_UPLOAD_BYTES = 'mucho';
    expect(maxUploadBytes()).toBe(25 * 1024 * 1024);
    process.env.DOCUMENT_MAX_UPLOAD_BYTES = saved;
  });
});
