/**
 * T026 — research.md D6, the gate `plan.md`'s Constitution Check is conditional on.
 * A tenant-A session cannot obtain a pre-signed URL for a tenant-B document; the
 * scope check runs before any URL is issued; a genuinely valid URL is single-object
 * and expires. Principle II names "file" explicitly — this is where that stops
 * being theoretical.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createRealApp } from '../../../helpers/real-app';
import { connectAs } from '../../../helpers/db';
import { uniqueRfc } from '../../../helpers/rfc';
import { makeCaseFirm, nextSuffix, uniqueName, type CaseFirm } from '../../../helpers/case-core';

async function setUpFirmWithDocument(
  app: INestApplication,
  migration: Client,
  label: string,
): Promise<{ firm: CaseFirm; caseId: string; documentId: string }> {
  const firm = await makeCaseFirm(migration, label, uniqueRfc());
  const client = await migration.query<{ id: string }>(
    `INSERT INTO client (tenant_id, kind, legal_name) VALUES ($1, 'organization', $2) RETURNING id`,
    [firm.tenantId, uniqueName('Cliente')],
  );
  const category = await migration.query<{ id: string }>(
    `INSERT INTO document_category (tenant_id, name) VALUES ($1, 'Unclassified') RETURNING id`,
    [firm.tenantId],
  );
  const openedCase = await request(app.getHttpServer())
    .post('/tenant/cases')
    .set('x-identity-id', firm.mp.identityId)
    .set('x-tenant-id', firm.tenantId)
    .send({ clientId: client.rows[0]!.id, fileNumber: uniqueName('EXP-ISO'), caseStatusId: firm.statusOpenId });
  const caseId = openedCase.body.id as string;
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
    .attach('file', Buffer.from('isolation test content'), { filename: 'x.pdf', contentType: 'application/pdf' })
    .field('categoryId', category.rows[0]!.id);
  return { firm, caseId, documentId: doc.body.id as string };
}

describe('tenant isolation for S3-resident content (research.md D6)', () => {
  let app: INestApplication;
  let migration: Client;
  let tenantA: { firm: CaseFirm; caseId: string; documentId: string };
  let tenantB: { firm: CaseFirm; caseId: string; documentId: string };

  beforeAll(async () => {
    app = await createRealApp();
    migration = await connectAs('migration');
    tenantA = await setUpFirmWithDocument(app, migration, `CC Isolamiento A ${nextSuffix()}`);
    tenantB = await setUpFirmWithDocument(app, migration, `CC Isolamiento B ${nextSuffix()}`);
  });

  afterAll(async () => {
    await migration.end();
    await app.close();
  });

  it('a tenant-A session cannot obtain a preview URL for tenant B\'s document, even via B\'s own case id', async () => {
    const response = await request(app.getHttpServer())
      .get(`/tenant/cases/${tenantB.caseId}/documents/${tenantB.documentId}/preview`)
      .set('x-identity-id', tenantA.firm.mp.identityId)
      .set('x-tenant-id', tenantA.firm.tenantId);
    expect(response.status).toBe(404);
    expect(response.body.previewUrl).toBeUndefined();
  });

  it('a tenant-A session cannot obtain a download URL for tenant B\'s document via a mismatched case/document pair', async () => {
    // A's own case id, but B's document id — the scope check passes (A's own case),
    // but findInCase's (caseId, id) pairing must still refuse: the document belongs
    // to a different case entirely.
    const response = await request(app.getHttpServer())
      .get(`/tenant/cases/${tenantA.caseId}/documents/${tenantB.documentId}/download`)
      .set('x-identity-id', tenantA.firm.mp.identityId)
      .set('x-tenant-id', tenantA.firm.tenantId);
    expect(response.status).toBe(404);
  });

  it('a genuinely valid URL for one\'s own document is single-object and time-limited', async () => {
    const response = await request(app.getHttpServer())
      .get(`/tenant/cases/${tenantA.caseId}/documents/${tenantA.documentId}/preview`)
      .set('x-identity-id', tenantA.firm.mp.identityId)
      .set('x-tenant-id', tenantA.firm.tenantId);
    expect(response.status).toBe(200);
    expect(response.body.previewUrl).toContain(tenantA.documentId);
    expect(new Date(response.body.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(new Date(response.body.expiresAt).getTime()).toBeLessThan(Date.now() + 10 * 60 * 1000);
  });
});
