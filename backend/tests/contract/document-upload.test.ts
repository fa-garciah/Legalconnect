/**
 * T017 — 007/US1 (FR-001 to FR-005, FR-010, FR-013). contracts/document-api.md §1.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createRealApp } from '../helpers/real-app';
import { connectAs } from '../helpers/db';
import { uniqueRfc } from '../helpers/rfc';
import { makeCaseFirm, nextSuffix, uniqueName, type CaseFirm } from '../helpers/case-core';

describe('uploading a document to a case', () => {
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
      .send({ clientId, fileNumber: uniqueName('EXP-DOC'), caseStatusId: firm.statusOpenId });
    return response.body.id as string;
  };

  const assign = (caseId: string, membershipId: string) =>
    request(app.getHttpServer())
      .post(`/tenant/cases/${caseId}/team`)
      .set('x-identity-id', firm.mp.identityId)
      .set('x-tenant-id', firm.tenantId)
      .send({ membershipId, roleOnCase: 'lead' });

  const upload = (
    identityId: string,
    caseId: string,
    fields: { categoryId?: string | null } = {},
  ) =>
    request(app.getHttpServer())
      .post(`/tenant/cases/${caseId}/documents`)
      .set('x-identity-id', identityId)
      .set('x-tenant-id', firm.tenantId)
      .attach('file', Buffer.from('%PDF-1.4 test content'), {
        filename: 'contrato.pdf',
        contentType: 'application/pdf',
      })
      .field(fields.categoryId === undefined ? {} : { categoryId: fields.categoryId ?? '' });

  beforeAll(async () => {
    app = await createRealApp();
    migration = await connectAs('migration');
    firm = await makeCaseFirm(migration, `CC Documentos ${nextSuffix()}`, uniqueRfc());
    const client = await migration.query<{ id: string }>(
      `INSERT INTO client (tenant_id, kind, legal_name) VALUES ($1, 'organization', $2) RETURNING id`,
      [firm.tenantId, uniqueName('Cliente Documentos')],
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

  it('scenario 1 — an assigned AA uploads; the document carries case, uploader and timestamp', async () => {
    const caseId = await openCase();
    await assign(caseId, firm.aa.membershipId).expect(201);

    const response = await upload(firm.aa.identityId, caseId, { categoryId });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      caseId,
      categoryId,
      originalFilename: 'contrato.pdf',
      mimeType: 'application/pdf',
    });
    expect(response.body.uploadedByMembershipId).toBe(firm.aa.membershipId);
    expect(response.body.uploadedAt).toBeTruthy();

    const migration2 = await connectAs('migration');
    try {
      const { rows } = await migration2.query(
        `SELECT metadata, actor_membership_id, target_id FROM audit_event WHERE action = 'document.uploaded' AND target_id = $1`,
        [response.body.id],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].actor_membership_id).toBe(firm.aa.membershipId);
    } finally {
      await migration2.end();
    }
  });

  it('MP/SA upload without being individually assigned (Decision 2, inherited)', async () => {
    const caseId = await openCase();
    const response = await upload(firm.mp.identityId, caseId, { categoryId });
    expect(response.status).toBe(201);
  });

  it('scenario 2 — a caller not assigned to the case is refused, indistinguishable from an absent case', async () => {
    const caseId = await openCase();
    // firm.pl is never assigned to this case.
    const refusedOnReal = await upload(firm.pl.identityId, caseId, { categoryId });
    const refusedOnFake = await upload(firm.pl.identityId, '00000000-0000-4000-8000-000000000000', {
      categoryId,
    });

    expect(refusedOnReal.status).toBe(404);
    expect(refusedOnFake.status).toBe(404);
    expect(refusedOnReal.body).toEqual(refusedOnFake.body);
  });

  it('scenario 4 — a tenant of another firm cannot reference this document', async () => {
    const caseId = await openCase();
    await assign(caseId, firm.aa.membershipId).expect(201);
    const uploaded = await upload(firm.aa.identityId, caseId, { categoryId });

    const otherFirm = await makeCaseFirm(migration, `CC Otro ${nextSuffix()}`, uniqueRfc());
    const response = await request(app.getHttpServer())
      .get(`/tenant/cases/${caseId}/documents/${uploaded.body.id}/preview`)
      .set('x-identity-id', otherFirm.mp.identityId)
      .set('x-tenant-id', otherFirm.tenantId);
    expect(response.status).toBe(404);
  });

  it('scenario 5 — an upload naming no category resolves to "Unclassified"', async () => {
    const caseId = await openCase();
    const response = await upload(firm.mp.identityId, caseId, { categoryId: null });
    expect(response.status).toBe(201);
    expect(response.body.categoryName).toBe('Unclassified');
  });

  it('a category from another tenant\'s catalog is refused', async () => {
    const caseId = await openCase();
    const otherFirm = await makeCaseFirm(migration, `CC Cat Ajena ${nextSuffix()}`, uniqueRfc());
    const foreignCategory = await migration.query<{ id: string }>(
      `INSERT INTO document_category (tenant_id, name) VALUES ($1, 'Foreign') RETURNING id`,
      [otherFirm.tenantId],
    );

    const response = await upload(firm.mp.identityId, caseId, { categoryId: foreignCategory.rows[0]!.id });
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('catalog_entry_not_available');
  });

  it('a disallowed file type is refused', async () => {
    const caseId = await openCase();
    const response = await request(app.getHttpServer())
      .post(`/tenant/cases/${caseId}/documents`)
      .set('x-identity-id', firm.mp.identityId)
      .set('x-tenant-id', firm.tenantId)
      .attach('file', Buffer.from('MZ fake executable'), {
        filename: 'malware.exe',
        contentType: 'application/x-msdownload',
      });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('validation_failed');
  });

  it('scenario 3 — a tenant at its storage limit is refused, naming the limit, distinct from scope', async () => {
    const caseId = await openCase();
    await assign(caseId, firm.aa.membershipId).expect(201);

    // Postgres evaluates an un-cast integer literal expression as int4, which
    // overflows before it ever reaches the bigint column — hence the explicit cast.
    await migration.query(
      `UPDATE tenant SET storage_bytes_used = (10::bigint * 1024 * 1024 * 1024) WHERE id = $1`,
      [firm.tenantId],
    );

    const response = await upload(firm.aa.identityId, caseId, { categoryId });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('limit_reached');
    expect(response.body.limit.key).toBe('storageBytes');
  });
});
