/**
 * T039 — 007/US4 (FR-004, FR-015). contracts/document-api.md §6-7.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createRealApp } from '../helpers/real-app';
import { connectAs } from '../helpers/db';
import { uniqueRfc } from '../helpers/rfc';
import { makeCaseFirm, nextSuffix, uniqueName, type CaseFirm } from '../helpers/case-core';

describe('withdrawing and restoring a document', () => {
  let app: INestApplication;
  let migration: Client;
  let firm: CaseFirm;
  let caseId: string;
  let categoryId: string;

  const uploadDoc = async () => {
    const response = await request(app.getHttpServer())
      .post(`/tenant/cases/${caseId}/documents`)
      .set('x-identity-id', firm.aa.identityId)
      .set('x-tenant-id', firm.tenantId)
      .attach('file', Buffer.from('x'), { filename: 'x.pdf', contentType: 'application/pdf' })
      .field('categoryId', categoryId);
    return response.body.id as string;
  };

  beforeAll(async () => {
    app = await createRealApp();
    migration = await connectAs('migration');
    firm = await makeCaseFirm(migration, `CC Retiro ${nextSuffix()}`, uniqueRfc());
    const client = await migration.query<{ id: string }>(
      `INSERT INTO client (tenant_id, kind, legal_name) VALUES ($1, 'organization', $2) RETURNING id`,
      [firm.tenantId, uniqueName('Cliente Retiro')],
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
      .send({ clientId: client.rows[0]!.id, fileNumber: uniqueName('EXP-WR'), caseStatusId: firm.statusOpenId });
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

  it('MP/SA withdraws a document; it disappears from the active list without hard-deleting', async () => {
    const documentId = await uploadDoc();

    const withdrawn = await request(app.getHttpServer())
      .patch(`/tenant/cases/${caseId}/documents/${documentId}/withdraw`)
      .set('x-identity-id', firm.mp.identityId)
      .set('x-tenant-id', firm.tenantId)
      .send();
    expect(withdrawn.status).toBe(200);
    expect(withdrawn.body.status).toBe('withdrawn');

    const list = await request(app.getHttpServer())
      .get(`/tenant/cases/${caseId}/documents`)
      .set('x-identity-id', firm.aa.identityId)
      .set('x-tenant-id', firm.tenantId);
    expect(list.body.items.map((i: { id: string }) => i.id)).not.toContain(documentId);

    const stillExists = await migration.query(`SELECT id FROM document WHERE id = $1`, [documentId]);
    expect(stillExists.rows).toHaveLength(1);
  });

  it('storage total is unchanged by withdrawal', async () => {
    const before = await migration.query<{ storage_bytes_used: string }>(
      `SELECT storage_bytes_used FROM tenant WHERE id = $1`,
      [firm.tenantId],
    );
    const documentId = await uploadDoc();
    const afterUpload = await migration.query<{ storage_bytes_used: string }>(
      `SELECT storage_bytes_used FROM tenant WHERE id = $1`,
      [firm.tenantId],
    );
    expect(Number(afterUpload.rows[0]!.storage_bytes_used)).toBeGreaterThan(Number(before.rows[0]!.storage_bytes_used));

    await request(app.getHttpServer())
      .patch(`/tenant/cases/${caseId}/documents/${documentId}/withdraw`)
      .set('x-identity-id', firm.mp.identityId)
      .set('x-tenant-id', firm.tenantId)
      .send()
      .expect(200);

    const afterWithdraw = await migration.query<{ storage_bytes_used: string }>(
      `SELECT storage_bytes_used FROM tenant WHERE id = $1`,
      [firm.tenantId],
    );
    expect(afterWithdraw.rows[0]!.storage_bytes_used).toBe(afterUpload.rows[0]!.storage_bytes_used);
  });

  it('restore reappears in the active list; withdraw and restore are two distinct audit entries', async () => {
    const documentId = await uploadDoc();
    await request(app.getHttpServer())
      .patch(`/tenant/cases/${caseId}/documents/${documentId}/withdraw`)
      .set('x-identity-id', firm.mp.identityId)
      .set('x-tenant-id', firm.tenantId)
      .send()
      .expect(200);

    const restored = await request(app.getHttpServer())
      .patch(`/tenant/cases/${caseId}/documents/${documentId}/restore`)
      .set('x-identity-id', firm.mp.identityId)
      .set('x-tenant-id', firm.tenantId)
      .send();
    expect(restored.status).toBe(200);
    expect(restored.body.status).toBe('active');

    const list = await request(app.getHttpServer())
      .get(`/tenant/cases/${caseId}/documents`)
      .set('x-identity-id', firm.aa.identityId)
      .set('x-tenant-id', firm.tenantId);
    expect(list.body.items.map((i: { id: string }) => i.id)).toContain(documentId);

    const { rows } = await migration.query(
      `SELECT action FROM audit_event WHERE target_id = $1 AND action IN ('document.withdrawn', 'document.restored') ORDER BY occurred_at`,
      [documentId],
    );
    expect(rows.map((r: { action: string }) => r.action)).toEqual(['document.withdrawn', 'document.restored']);
  });

  it('AA/PL/CM cannot withdraw a document', async () => {
    const documentId = await uploadDoc();
    const response = await request(app.getHttpServer())
      .patch(`/tenant/cases/${caseId}/documents/${documentId}/withdraw`)
      .set('x-identity-id', firm.aa.identityId)
      .set('x-tenant-id', firm.tenantId)
      .send();
    expect(response.status).toBe(403);
  });

  it('a second withdraw is refused', async () => {
    const documentId = await uploadDoc();
    await request(app.getHttpServer())
      .patch(`/tenant/cases/${caseId}/documents/${documentId}/withdraw`)
      .set('x-identity-id', firm.mp.identityId)
      .set('x-tenant-id', firm.tenantId)
      .send()
      .expect(200);

    const second = await request(app.getHttpServer())
      .patch(`/tenant/cases/${caseId}/documents/${documentId}/withdraw`)
      .set('x-identity-id', firm.mp.identityId)
      .set('x-tenant-id', firm.tenantId)
      .send();
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('already_withdrawn');
  });

  it('restoring an active document is refused', async () => {
    const documentId = await uploadDoc();
    const response = await request(app.getHttpServer())
      .patch(`/tenant/cases/${caseId}/documents/${documentId}/restore`)
      .set('x-identity-id', firm.mp.identityId)
      .set('x-tenant-id', firm.tenantId)
      .send();
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('not_withdrawn');
  });
});
