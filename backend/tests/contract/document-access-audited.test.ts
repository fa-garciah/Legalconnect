/**
 * T025 — 007/FR-020, FR-021, SC-009. Preview and download are each audited as their
 * own distinct interactive access; the list read is never audited.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createRealApp } from '../helpers/real-app';
import { connectAs } from '../helpers/db';
import { uniqueRfc } from '../helpers/rfc';
import { makeCaseFirm, nextSuffix, uniqueName, type CaseFirm } from '../helpers/case-core';

describe('document access is audited, the list is not (FR-020/FR-021)', () => {
  let app: INestApplication;
  let migration: Client;
  let firm: CaseFirm;
  let caseId: string;
  let documentId: string;

  beforeAll(async () => {
    app = await createRealApp();
    migration = await connectAs('migration');
    firm = await makeCaseFirm(migration, `CC Auditoria ${nextSuffix()}`, uniqueRfc());
    const client = await migration.query<{ id: string }>(
      `INSERT INTO client (tenant_id, kind, legal_name) VALUES ($1, 'organization', $2) RETURNING id`,
      [firm.tenantId, uniqueName('Cliente Auditoria')],
    );
    const category = await migration.query<{ id: string }>(
      `INSERT INTO document_category (tenant_id, name) VALUES ($1, 'Unclassified') RETURNING id`,
      [firm.tenantId],
    );
    const openedCase = await request(app.getHttpServer())
      .post('/tenant/cases')
      .set('x-identity-id', firm.mp.identityId)
      .set('x-tenant-id', firm.tenantId)
      .send({ clientId: client.rows[0]!.id, fileNumber: uniqueName('EXP-AUD'), caseStatusId: firm.statusOpenId });
    caseId = openedCase.body.id;
    await request(app.getHttpServer())
      .post(`/tenant/cases/${caseId}/team`)
      .set('x-identity-id', firm.mp.identityId)
      .set('x-tenant-id', firm.tenantId)
      .send({ membershipId: firm.aa.membershipId, roleOnCase: 'lead' })
      .expect(201);
    const doc = await request(app.getHttpServer())
      .post(`/tenant/cases/${caseId}/documents`)
      .set('x-identity-id', firm.aa.identityId)
      .set('x-tenant-id', firm.tenantId)
      .attach('file', Buffer.from('x'), { filename: 'x.pdf', contentType: 'application/pdf' })
      .field('categoryId', category.rows[0]!.id);
    documentId = doc.body.id;
  });

  afterAll(async () => {
    await migration.end();
    await app.close();
  });

  const countAction = async (action: string): Promise<number> => {
    const { rows } = await migration.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM audit_event WHERE action = $1 AND target_id = $2`,
      [action, documentId],
    );
    return Number(rows[0]!.n);
  };

  it('an interactive preview produces exactly one document.previewed entry', async () => {
    await request(app.getHttpServer())
      .get(`/tenant/cases/${caseId}/documents/${documentId}/preview`)
      .set('x-identity-id', firm.aa.identityId)
      .set('x-tenant-id', firm.tenantId)
      .set('x-channel', 'interactive')
      .expect(200);
    expect(await countAction('document.previewed')).toBe(1);
  });

  it('an automated preview produces zero entries (the gate)', async () => {
    const before = await countAction('document.previewed');
    await request(app.getHttpServer())
      .get(`/tenant/cases/${caseId}/documents/${documentId}/preview`)
      .set('x-identity-id', firm.aa.identityId)
      .set('x-tenant-id', firm.tenantId)
      .set('x-channel', 'automated')
      .expect(200);
    expect(await countAction('document.previewed')).toBe(before);
  });

  it('an interactive download produces exactly one document.downloaded entry', async () => {
    await request(app.getHttpServer())
      .get(`/tenant/cases/${caseId}/documents/${documentId}/download`)
      .set('x-identity-id', firm.aa.identityId)
      .set('x-tenant-id', firm.tenantId)
      .set('x-channel', 'interactive')
      .expect(200);
    expect(await countAction('document.downloaded')).toBe(1);
  });

  it('the case document list is never audited, either channel', async () => {
    const totalBefore = await migration.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM audit_event WHERE tenant_id = $1`,
      [firm.tenantId],
    );

    await request(app.getHttpServer())
      .get(`/tenant/cases/${caseId}/documents`)
      .set('x-identity-id', firm.aa.identityId)
      .set('x-tenant-id', firm.tenantId)
      .set('x-channel', 'interactive')
      .expect(200);
    await request(app.getHttpServer())
      .get(`/tenant/cases/${caseId}/documents`)
      .set('x-identity-id', firm.aa.identityId)
      .set('x-tenant-id', firm.tenantId)
      .set('x-channel', 'automated')
      .expect(200);

    const totalAfter = await migration.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM audit_event WHERE tenant_id = $1`,
      [firm.tenantId],
    );
    expect(totalAfter.rows[0]!.n).toBe(totalBefore.rows[0]!.n);
  });
});
