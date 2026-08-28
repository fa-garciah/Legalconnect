/**
 * T024 — 007/US2 (FR-005 to FR-008, FR-013 to FR-016). contracts/document-api.md §2-4.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createRealApp } from '../helpers/real-app';
import { connectAs } from '../helpers/db';
import { uniqueRfc } from '../helpers/rfc';
import { makeCaseFirm, nextSuffix, uniqueName, type CaseFirm } from '../helpers/case-core';

describe('reading, previewing and downloading documents', () => {
  let app: INestApplication;
  let migration: Client;
  let firm: CaseFirm;
  let clientId: string;
  let categoryId: string;

  const openCase = async (): Promise<string> => {
    const response = await request(app.getHttpServer())
      .post('/tenant/cases')
      .set('x-identity-id', firm.mp.identityId)
      .set('x-tenant-id', firm.tenantId)
      .send({ clientId, fileNumber: uniqueName('EXP-READ'), caseStatusId: firm.statusOpenId });
    return response.body.id as string;
  };

  const assign = (caseId: string, membershipId: string) =>
    request(app.getHttpServer())
      .post(`/tenant/cases/${caseId}/team`)
      .set('x-identity-id', firm.mp.identityId)
      .set('x-tenant-id', firm.tenantId)
      .send({ membershipId, roleOnCase: 'lead' });

  const uploadOfType = (identityId: string, caseId: string, filename: string, contentType: string) =>
    request(app.getHttpServer())
      .post(`/tenant/cases/${caseId}/documents`)
      .set('x-identity-id', identityId)
      .set('x-tenant-id', firm.tenantId)
      .attach('file', Buffer.from('content'), { filename, contentType })
      .field('categoryId', categoryId);

  beforeAll(async () => {
    app = await createRealApp();
    migration = await connectAs('migration');
    firm = await makeCaseFirm(migration, `CC Lectura ${nextSuffix()}`, uniqueRfc());
    const client = await migration.query<{ id: string }>(
      `INSERT INTO client (tenant_id, kind, legal_name) VALUES ($1, 'organization', $2) RETURNING id`,
      [firm.tenantId, uniqueName('Cliente Lectura')],
    );
    clientId = client.rows[0]!.id;
    const category = await migration.query<{ id: string }>(
      `INSERT INTO document_category (tenant_id, name) VALUES ($1, 'Unclassified') RETURNING id`,
      [firm.tenantId],
    );
    categoryId = category.rows[0]!.id;
  });

  afterAll(async () => {
    await migration.end();
    await app.close();
  });

  it('scenario 1 — an assigned member reads the case document list', async () => {
    const caseId = await openCase();
    await assign(caseId, firm.aa.membershipId).expect(201);
    const a = await uploadOfType(firm.aa.identityId, caseId, 'a.pdf', 'application/pdf').expect(201);
    const b = await uploadOfType(firm.aa.identityId, caseId, 'b.png', 'image/png').expect(201);

    const response = await request(app.getHttpServer())
      .get(`/tenant/cases/${caseId}/documents`)
      .set('x-identity-id', firm.aa.identityId)
      .set('x-tenant-id', firm.tenantId);

    expect(response.status).toBe(200);
    const ids = response.body.items.map((i: { id: string }) => i.id);
    expect(ids).toEqual(expect.arrayContaining([a.body.id, b.body.id]));
  });

  it('scenario 2 — a member not assigned to this specific case is refused (not an empty list)', async () => {
    const caseId = await openCase();
    // firm.pl is never assigned to this case.
    const response = await request(app.getHttpServer())
      .get(`/tenant/cases/${caseId}/documents`)
      .set('x-identity-id', firm.pl.identityId)
      .set('x-tenant-id', firm.tenantId);
    expect(response.status).toBe(404);
  });

  it('scenario 3/4 — a PDF previews natively; an unsupported type reports no preview with download available', async () => {
    const caseId = await openCase();
    await assign(caseId, firm.aa.membershipId).expect(201);

    const pdf = await uploadOfType(firm.aa.identityId, caseId, 'contrato.pdf', 'application/pdf').expect(201);
    const previewPdf = await request(app.getHttpServer())
      .get(`/tenant/cases/${caseId}/documents/${pdf.body.id}/preview`)
      .set('x-identity-id', firm.aa.identityId)
      .set('x-tenant-id', firm.tenantId);
    expect(previewPdf.status).toBe(200);
    expect(previewPdf.body.renderAs).toBe('pdf');
    expect(previewPdf.body.previewUrl).toBeTruthy();

    const odd = await uploadOfType(firm.aa.identityId, caseId, 'nota.txt', 'text/plain').expect(201);
    const previewOdd = await request(app.getHttpServer())
      .get(`/tenant/cases/${caseId}/documents/${odd.body.id}/preview`)
      .set('x-identity-id', firm.aa.identityId)
      .set('x-tenant-id', firm.tenantId);
    // text/plain is in the allowed upload list but has no inline preview family.
    expect(previewOdd.status).toBe(200);
    expect(previewOdd.body.renderAs).toBe('unsupported');
    expect(previewOdd.body.previewUrl).toBeNull();
    expect(previewOdd.body.downloadAvailable).toBe(true);
  });

  it('scenario 5 — downloading and previewing the same document produce two distinct audit entries', async () => {
    const caseId = await openCase();
    await assign(caseId, firm.aa.membershipId).expect(201);
    const doc = await uploadOfType(firm.aa.identityId, caseId, 'x.pdf', 'application/pdf').expect(201);

    await request(app.getHttpServer())
      .get(`/tenant/cases/${caseId}/documents/${doc.body.id}/preview`)
      .set('x-identity-id', firm.aa.identityId)
      .set('x-tenant-id', firm.tenantId)
      .expect(200);
    const download = await request(app.getHttpServer())
      .get(`/tenant/cases/${caseId}/documents/${doc.body.id}/download`)
      .set('x-identity-id', firm.aa.identityId)
      .set('x-tenant-id', firm.tenantId);
    expect(download.status).toBe(200);
    expect(download.body.downloadUrl).toBeTruthy();

    const { rows } = await migration.query(
      `SELECT action FROM audit_event WHERE target_id = $1 AND action IN ('document.previewed', 'document.downloaded') ORDER BY action`,
      [doc.body.id],
    );
    expect(rows.map((r: { action: string }) => r.action)).toEqual(['document.downloaded', 'document.previewed']);
  });

  it('BM is refused read, preview and download', async () => {
    const caseId = await openCase();
    await assign(caseId, firm.aa.membershipId).expect(201);
    const doc = await uploadOfType(firm.aa.identityId, caseId, 'x.pdf', 'application/pdf').expect(201);

    const list = await request(app.getHttpServer())
      .get(`/tenant/cases/${caseId}/documents`)
      .set('x-identity-id', firm.bm.identityId)
      .set('x-tenant-id', firm.tenantId);
    expect(list.status).toBe(403);

    const preview = await request(app.getHttpServer())
      .get(`/tenant/cases/${caseId}/documents/${doc.body.id}/preview`)
      .set('x-identity-id', firm.bm.identityId)
      .set('x-tenant-id', firm.tenantId);
    expect(preview.status).toBe(403);

    const download = await request(app.getHttpServer())
      .get(`/tenant/cases/${caseId}/documents/${doc.body.id}/download`)
      .set('x-identity-id', firm.bm.identityId)
      .set('x-tenant-id', firm.tenantId);
    expect(download.status).toBe(403);
  });
});
