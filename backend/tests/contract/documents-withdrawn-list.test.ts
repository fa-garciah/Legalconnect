/**
 * 021 T001 (Decision 2). `GET /tenant/cases/:caseId/documents/withdrawn` — the only way a
 * withdrawn document can be found again, and so the only way `restore` (contract §7) is
 * reachable from a screen. The active list (§2) returns `status = 'active'` only.
 *
 * Declared `document.restore` (row 41: MP, SA): whoever may put a document back is exactly whoever
 * may see what there is to put back. Decided by `AuthorizationInterceptor`, like every route.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createAuthenticatedApp } from '../helpers/real-app';
import { connectAs } from '../helpers/db';
import { uniqueRfc } from '../helpers/rfc';
import { makeCaseFirm, nextSuffix, uniqueName, type Actor, type CaseFirm } from '../helpers/case-core';

describe('GET /tenant/cases/:caseId/documents/withdrawn (021 Decision 2)', () => {
  let app: INestApplication;
  let migration: Client;
  let firm: CaseFirm;
  let other: CaseFirm;
  let caseId: string;
  let activeId: string;
  let withdrawnId: string;

  const as = (actor: Actor, tenantId = firm.tenantId) =>
    request(app.getHttpServer())
      .get(`/tenant/cases/${caseId}/documents/withdrawn`)
      .set('x-identity-id', actor.identityId)
      .set('x-tenant-id', tenantId);

  const upload = async (name: string): Promise<string> => {
    const response = await request(app.getHttpServer())
      .post(`/tenant/cases/${caseId}/documents`)
      .set('x-identity-id', firm.mp.identityId)
      .set('x-tenant-id', firm.tenantId)
      .attach('file', Buffer.from('x'), { filename: name, contentType: 'application/pdf' });
    expect(response.status).toBe(201);
    return response.body.id as string;
  };

  beforeAll(async () => {
    app = await createAuthenticatedApp();
    migration = await connectAs('migration');
    firm = await makeCaseFirm(migration, `CC Retirados ${nextSuffix()}`, uniqueRfc());
    other = await makeCaseFirm(migration, `CC Ajena ${nextSuffix()}`, uniqueRfc());
    await migration.query(`INSERT INTO document_category (tenant_id, name) VALUES ($1, 'Unclassified')`, [
      firm.tenantId,
    ]);
    const client = await migration.query<{ id: string }>(
      `INSERT INTO client (tenant_id, kind, legal_name) VALUES ($1, 'organization', $2) RETURNING id`,
      [firm.tenantId, uniqueName('Cliente Retirados')],
    );
    const opened = await request(app.getHttpServer())
      .post('/tenant/cases')
      .set('x-identity-id', firm.mp.identityId)
      .set('x-tenant-id', firm.tenantId)
      .send({ clientId: client.rows[0]!.id, fileNumber: uniqueName('EXP-RET'), caseStatusId: firm.statusOpenId });
    caseId = opened.body.id;

    activeId = await upload('activo.pdf');
    withdrawnId = await upload('retirado.pdf');
    await request(app.getHttpServer())
      .patch(`/tenant/cases/${caseId}/documents/${withdrawnId}/withdraw`)
      .set('x-identity-id', firm.mp.identityId)
      .set('x-tenant-id', firm.tenantId)
      .expect(200);
  });

  afterAll(async () => {
    await migration?.end();
    await app?.close();
  });

  it.each(['mp', 'sa'] as const)('%s gets only the withdrawn documents of the case', async (who) => {
    const response = await as(firm[who]);
    expect(response.status).toBe(200);
    const ids = (response.body.items as Array<{ id: string; status: string }>).map((i) => i.id);
    expect(ids).toContain(withdrawnId);
    expect(ids).not.toContain(activeId);
    const item = response.body.items.find((i: { id: string }) => i.id === withdrawnId);
    expect(item.status).toBe('withdrawn');
    expect(item.originalFilename).toBe('retirado.pdf');
    expect(typeof item.withdrawnAt).toBe('string');
  });

  it.each(['aa', 'pl', 'cm', 'bm'] as const)('%s is refused with 403', async (who) => {
    expect((await as(firm[who])).status).toBe(403);
  });

  it('a case in another firm answers 404, like one that does not exist', async () => {
    const response = await as(other.mp, other.tenantId);
    expect(response.status).toBe(404);
  });

  it('the ACTIVE list also answers 404 for another firm’s case to an MP (was 200 with no items)', async () => {
    const response = await request(app.getHttpServer())
      .get(`/tenant/cases/${caseId}/documents`)
      .set('x-identity-id', other.mp.identityId)
      .set('x-tenant-id', other.tenantId);
    expect(response.status).toBe(404);
  });

  it('is not captured by the :id routes', async () => {
    // `withdrawn` must never be read as a document id by `:id/preview` etc.
    const response = await as(firm.mp);
    expect(response.status).not.toBe(400);
  });
});
