/**
 * 021 T005 (Decision 4). A downloaded document keeps its original name.
 *
 * The signed URL asks the object store to answer with `Content-Disposition`: `attachment` and the
 * original filename for download, `inline` for preview. Asserted against the real MinIO the suite
 * runs with, not only on the URL — the header is what the browser acts on.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createAuthenticatedApp } from '../helpers/real-app';
import { connectAs } from '../helpers/db';
import { uniqueRfc } from '../helpers/rfc';
import { makeCaseFirm, nextSuffix, uniqueName, type CaseFirm } from '../helpers/case-core';

describe('signed URLs carry Content-Disposition (021 Decision 4)', () => {
  let app: INestApplication;
  let migration: Client;
  let firm: CaseFirm;
  let caseId: string;
  let pdfId: string;

  const get = (path: string) =>
    request(app.getHttpServer())
      .get(`/tenant/cases/${caseId}/documents/${pdfId}/${path}`)
      .set('x-identity-id', firm.mp.identityId)
      .set('x-tenant-id', firm.tenantId);

  beforeAll(async () => {
    app = await createAuthenticatedApp();
    migration = await connectAs('migration');
    firm = await makeCaseFirm(migration, `CC Nombre ${nextSuffix()}`, uniqueRfc());
    await migration.query(`INSERT INTO document_category (tenant_id, name) VALUES ($1, 'Unclassified')`, [
      firm.tenantId,
    ]);
    const client = await migration.query<{ id: string }>(
      `INSERT INTO client (tenant_id, kind, legal_name) VALUES ($1, 'organization', $2) RETURNING id`,
      [firm.tenantId, uniqueName('Cliente Nombre')],
    );
    const opened = await request(app.getHttpServer())
      .post('/tenant/cases')
      .set('x-identity-id', firm.mp.identityId)
      .set('x-tenant-id', firm.tenantId)
      .send({ clientId: client.rows[0]!.id, fileNumber: uniqueName('EXP-NOM'), caseStatusId: firm.statusOpenId });
    caseId = opened.body.id;

    const uploaded = await request(app.getHttpServer())
      .post(`/tenant/cases/${caseId}/documents`)
      .set('x-identity-id', firm.mp.identityId)
      .set('x-tenant-id', firm.tenantId)
      .attach('file', Buffer.from('%PDF-1.4 test'), {
        filename: 'Contrato Señor Pérez.pdf',
        contentType: 'application/pdf',
      });
    expect(uploaded.status).toBe(201);
    pdfId = uploaded.body.id;
  });

  afterAll(async () => {
    await migration?.end();
    await app?.close();
  });

  /*
   * Found while writing this suite: multer decodes multipart filenames as latin1, so "Señor"
   * was STORED as "SeÃ±or" — in the list, the audit trail and every download since 007 shipped.
   */
  it('stores a filename with accents as the uploader wrote it', async () => {
    const list = await request(app.getHttpServer())
      .get(`/tenant/cases/${caseId}/documents`)
      .set('x-identity-id', firm.mp.identityId)
      .set('x-tenant-id', firm.tenantId);
    const item = list.body.items.find((i: { id: string }) => i.id === pdfId);
    expect(item.originalFilename).toBe('Contrato Señor Pérez.pdf');
  });

  it('the download URL asks for attachment with the original name', async () => {
    const response = await get('download');
    expect(response.status).toBe(200);
    const url = new URL(response.body.downloadUrl as string);
    const disposition = url.searchParams.get('response-content-disposition') ?? '';
    expect(disposition.startsWith('attachment;')).toBe(true);
    expect(disposition).toContain(`filename*=UTF-8''Contrato%20Se%C3%B1or%20P%C3%A9rez.pdf`);
  });

  it('the object store answers the download with that header', async () => {
    const response = await get('download');
    const fetched = await fetch(response.body.downloadUrl as string);
    expect(fetched.status).toBe(200);
    expect(fetched.headers.get('content-disposition')).toContain('attachment;');
    expect(fetched.headers.get('content-disposition')).toContain('Contrato Senor Perez.pdf');
  });

  it('the preview URL asks for inline, so a PDF renders instead of downloading', async () => {
    const response = await get('preview');
    expect(response.status).toBe(200);
    const fetched = await fetch(response.body.previewUrl as string);
    expect(fetched.headers.get('content-disposition')).toMatch(/^inline;/);
    expect(fetched.headers.get('content-type')).toBe('application/pdf');
  });
});
