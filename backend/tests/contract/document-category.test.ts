/**
 * T031 — 007/US3 (FR-009 to FR-012). contracts/document-api.md §5, §8-10.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createRealApp } from '../helpers/real-app';
import { connectAs } from '../helpers/db';
import { uniqueRfc } from '../helpers/rfc';
import { makeCaseFirm, nextSuffix, uniqueName, type CaseFirm } from '../helpers/case-core';

describe('the document-category catalog', () => {
  let app: INestApplication;
  let migration: Client;
  let firm: CaseFirm;
  let clientId: string;
  let categoryId: string;
  let caseId: string;
  let documentId: string;

  beforeAll(async () => {
    app = await createRealApp();
    migration = await connectAs('migration');
    firm = await makeCaseFirm(migration, `CC Categorias ${nextSuffix()}`, uniqueRfc());
    const client = await migration.query<{ id: string }>(
      `INSERT INTO client (tenant_id, kind, legal_name) VALUES ($1, 'organization', $2) RETURNING id`,
      [firm.tenantId, uniqueName('Cliente Categorias')],
    );
    clientId = client.rows[0]!.id;
    const category = await migration.query<{ id: string }>(
      `INSERT INTO document_category (tenant_id, name) VALUES ($1, 'Unclassified') RETURNING id`,
      [firm.tenantId],
    );
    categoryId = category.rows[0]!.id;

    const openedCase = await request(app.getHttpServer())
      .post('/tenant/cases')
      .set('x-identity-id', firm.mp.identityId)
      .set('x-tenant-id', firm.tenantId)
      .send({ clientId, fileNumber: uniqueName('EXP-CAT'), caseStatusId: firm.statusOpenId });
    caseId = openedCase.body.id;
    await request(app.getHttpServer())
      .post(`/tenant/cases/${caseId}/team`)
      .set('x-identity-id', firm.mp.identityId)
      .set('x-tenant-id', firm.tenantId)
      .send({ membershipId: firm.aa.membershipId, roleOnCase: 'lead' })
      .expect(201);
    // CM also needs a live assignment: document.change_category's scope check is
    // `assigned`, and CM (unlike MP/SA) does not bypass it — archetype alone is not
    // enough (006's Decision 2, inherited).
    await request(app.getHttpServer())
      .post(`/tenant/cases/${caseId}/team`)
      .set('x-identity-id', firm.mp.identityId)
      .set('x-tenant-id', firm.tenantId)
      .send({ membershipId: firm.cm.membershipId, roleOnCase: 'collaborator' })
      .expect(201);
    const doc = await request(app.getHttpServer())
      .post(`/tenant/cases/${caseId}/documents`)
      .set('x-identity-id', firm.aa.identityId)
      .set('x-tenant-id', firm.tenantId)
      .attach('file', Buffer.from('x'), { filename: 'x.pdf', contentType: 'application/pdf' })
      .field('categoryId', categoryId);
    documentId = doc.body.id;
  });

  afterAll(async () => {
    await migration.end();
    await app.close();
  });

  it('scenario 1 — CM assigns a category to a document on a case they can reach', async () => {
    const created = await request(app.getHttpServer())
      .post('/tenant/document-categories')
      .set('x-identity-id', firm.mp.identityId)
      .set('x-tenant-id', firm.tenantId)
      .send({ name: uniqueName('Contrato') });
    expect(created.status).toBe(201);

    const response = await request(app.getHttpServer())
      .patch(`/tenant/cases/${caseId}/documents/${documentId}/category`)
      .set('x-identity-id', firm.cm.identityId)
      .set('x-tenant-id', firm.tenantId)
      .send({ categoryId: created.body.id });

    expect(response.status).toBe(200);
    expect(response.body.categoryId).toBe(created.body.id);

    const { rows } = await migration.query(
      `SELECT metadata FROM audit_event WHERE action = 'document.category_changed' AND target_id = $1`,
      [documentId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata).toEqual({ from: categoryId, to: created.body.id });
  });

  it('scenario 2 — a category name absent from the tenant\'s catalog is refused', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/tenant/cases/${caseId}/documents/${documentId}/category`)
      .set('x-identity-id', firm.cm.identityId)
      .set('x-tenant-id', firm.tenantId)
      .send({ categoryId: '00000000-0000-4000-8000-000000000000' });
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('catalog_entry_not_available');
  });

  it('D6/D4 — the same name added twice while active is refused; succeeds after retirement', async () => {
    const name = uniqueName('Reutilizable');
    const first = await request(app.getHttpServer())
      .post('/tenant/document-categories')
      .set('x-identity-id', firm.mp.identityId)
      .set('x-tenant-id', firm.tenantId)
      .send({ name });
    expect(first.status).toBe(201);

    const duplicate = await request(app.getHttpServer())
      .post('/tenant/document-categories')
      .set('x-identity-id', firm.mp.identityId)
      .set('x-tenant-id', firm.tenantId)
      .send({ name: `  ${name.toUpperCase()}  ` });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('catalog_entry_already_exists');

    await request(app.getHttpServer())
      .patch(`/tenant/document-categories/${first.body.id}/retire`)
      .set('x-identity-id', firm.mp.identityId)
      .set('x-tenant-id', firm.tenantId)
      .send()
      .expect(200);

    const afterRetire = await request(app.getHttpServer())
      .post('/tenant/document-categories')
      .set('x-identity-id', firm.mp.identityId)
      .set('x-tenant-id', firm.tenantId)
      .send({ name });
    expect(afterRetire.status).toBe(201);
  });

  it('scenario 3 — a category held by an existing document keeps resolving after retirement, unavailable for new assignment', async () => {
    const category = await request(app.getHttpServer())
      .post('/tenant/document-categories')
      .set('x-identity-id', firm.mp.identityId)
      .set('x-tenant-id', firm.tenantId)
      .send({ name: uniqueName('Retirable') });

    await request(app.getHttpServer())
      .patch(`/tenant/cases/${caseId}/documents/${documentId}/category`)
      .set('x-identity-id', firm.cm.identityId)
      .set('x-tenant-id', firm.tenantId)
      .send({ categoryId: category.body.id })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/tenant/document-categories/${category.body.id}/retire`)
      .set('x-identity-id', firm.mp.identityId)
      .set('x-tenant-id', firm.tenantId)
      .send()
      .expect(200);

    const list = await request(app.getHttpServer())
      .get(`/tenant/cases/${caseId}/documents`)
      .set('x-identity-id', firm.aa.identityId)
      .set('x-tenant-id', firm.tenantId);
    const item = list.body.items.find((i: { id: string }) => i.id === documentId);
    expect(item.categoryId).toBe(category.body.id);

    const newDoc = await request(app.getHttpServer())
      .post(`/tenant/cases/${caseId}/documents`)
      .set('x-identity-id', firm.aa.identityId)
      .set('x-tenant-id', firm.tenantId)
      .attach('file', Buffer.from('y'), { filename: 'y.pdf', contentType: 'application/pdf' })
      .field('categoryId', category.body.id);
    expect(newDoc.status).toBe(422);
  });

  it('scenario 4 — a freshly provisioned tenant already has the default catalog, including Unclassified', async () => {
    const provisioned = await request(app.getHttpServer())
      .post('/internal/platform/tenants')
      .send({ name: uniqueName('Fresh Firm'), rfc: uniqueRfc(), planCode: 'esencial' });
    expect(provisioned.status).toBe(201);

    const identity = await migration.query<{ id: string }>(
      `INSERT INTO identity (subject, email, mfa_enrolled_at) VALUES ($1, $2, now()) RETURNING id`,
      [`idp|cat-fresh-${nextSuffix()}`, `cat-fresh-${nextSuffix()}@example.com`],
    );
    await migration.query(`INSERT INTO membership (identity_id, tenant_id, archetype) VALUES ($1, $2, 'MP')`, [
      identity.rows[0]!.id,
      provisioned.body.id,
    ]);

    const list = await request(app.getHttpServer())
      .get('/tenant/document-categories')
      .set('x-identity-id', identity.rows[0]!.id)
      .set('x-tenant-id', provisioned.body.id);
    expect(list.status).toBe(200);
    expect(list.body.items.map((i: { name: string }) => i.name)).toContain('Unclassified');
  });

  it('scenario 5 — AA/PL cannot change a document\'s category', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/tenant/cases/${caseId}/documents/${documentId}/category`)
      .set('x-identity-id', firm.aa.identityId)
      .set('x-tenant-id', firm.tenantId)
      .send({ categoryId });
    expect(response.status).toBe(403);
  });
});
