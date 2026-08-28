/**
 * T038 — 006/US2 (FR-005 to FR-008). quickstart.md Scenario 2.
 *
 * `MP` is the reading archetype throughout: Decision 2 lets them satisfy the `assigned`
 * resolver unconditionally, which is what makes this story testable before US3 ships any
 * assignment at all. The scope-restricted path is `case-list-scoping.test.ts` and
 * `assigned-scope-*.test.ts`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createRealApp } from '../helpers/real-app';
import { connectAs } from '../helpers/db';
import { uniqueRfc } from '../helpers/rfc';
import { makeCaseFirm, nextSuffix, uniqueName, type Actor, type CaseFirm } from '../helpers/case-core';

describe('opening a case', () => {
  let app: INestApplication;
  let migration: Client;
  let firm: CaseFirm;
  let otherFirm: CaseFirm;
  let clientId: string;

  const open = (actor: Actor, tenantId: string, body: object) =>
    request(app.getHttpServer())
      .post('/tenant/cases')
      .set('x-identity-id', actor.identityId)
      .set('x-tenant-id', tenantId)
      .send(body);

  const read = (actor: Actor, tenantId: string, id: string) =>
    request(app.getHttpServer())
      .get(`/tenant/cases/${id}`)
      .set('x-identity-id', actor.identityId)
      .set('x-tenant-id', tenantId);

  async function makeClient(f: CaseFirm): Promise<string> {
    const { rows } = await migration.query<{ id: string }>(
      `INSERT INTO client (tenant_id, kind, legal_name) VALUES ($1, 'organization', $2) RETURNING id`,
      [f.tenantId, uniqueName('Cliente')],
    );
    return rows[0]!.id;
  }

  beforeAll(async () => {
    app = await createRealApp();
    migration = await connectAs('migration');
    firm = await makeCaseFirm(migration, `CC Casos ${nextSuffix()}`, uniqueRfc());
    otherFirm = await makeCaseFirm(migration, `CC Casos Otra ${nextSuffix()}`, uniqueRfc());
    clientId = await makeClient(firm);
  });

  afterAll(async () => {
    await migration.end();
    await app.close();
  });

  it('scenario 1 — a case is opened with a tenant-unique file number and a catalog status', async () => {
    const fileNumber = uniqueName('EXP-2026');
    const opened = await open(firm.cm, firm.tenantId, {
      clientId,
      fileNumber,
      caseStatusId: firm.statusOpenId,
      matterTypeId: firm.matterTypeId,
    });

    expect(opened.status).toBe(201);
    expect(opened.body).toMatchObject({ fileNumber, closedOn: null });
    expect(opened.body.status).toMatchObject({ id: firm.statusOpenId, catalogStatus: 'active' });
    expect(opened.body.matterType.id).toBe(firm.matterTypeId);
    expect(opened.body.client.id).toBe(clientId);
  });

  it('scenario 2 — a consultative matter with no venue is valid', async () => {
    const opened = await open(firm.cm, firm.tenantId, {
      clientId,
      fileNumber: uniqueName('EXP-CONSULT'),
      caseStatusId: firm.statusOpenId,
    });

    expect(opened.status).toBe(201);
    expect(opened.body.venue).toBeNull();
    expect(opened.body.venueCaseReference).toBeNull();
  });

  it('scenario 3 — the court\'s own number is a field distinct from the firm\'s', async () => {
    // What the prototype could not express: it had ONE field and had to choose.
    const fileNumber = uniqueName('EXP-DUAL');
    const opened = await open(firm.cm, firm.tenantId, {
      clientId,
      fileNumber,
      caseStatusId: firm.statusOpenId,
      venueCaseReference: '1234/2026',
    });

    expect(opened.status).toBe(201);
    expect(opened.body.fileNumber).toBe(fileNumber);
    expect(opened.body.venueCaseReference).toBe('1234/2026');
    expect(opened.body.fileNumber).not.toBe(opened.body.venueCaseReference);
  });

  it('scenario 5 — a duplicate file number is refused within the tenant, and allowed across tenants', async () => {
    const fileNumber = uniqueName('EXP-DUP');
    const first = await open(firm.cm, firm.tenantId, {
      clientId,
      fileNumber,
      caseStatusId: firm.statusOpenId,
    });
    expect(first.status).toBe(201);

    const duplicate = await open(firm.cm, firm.tenantId, {
      clientId,
      // Trimmed and case-insensitive, matching the functional index exactly.
      fileNumber: `  ${fileNumber.toUpperCase()}  `,
      caseStatusId: firm.statusOpenId,
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('file_number_already_used');

    // Uniqueness is per tenant — two firms may number their own files however they like.
    const elsewhere = await open(otherFirm.cm, otherFirm.tenantId, {
      clientId: await makeClient(otherFirm),
      fileNumber,
      caseStatusId: otherFirm.statusOpenId,
    });
    expect(elsewhere.status).toBe(201);
  });

  it('scenario 6 — another tenant\'s catalog entry is refused, without naming which id was wrong', async () => {
    const refused = await open(firm.cm, firm.tenantId, {
      clientId,
      fileNumber: uniqueName('EXP-X'),
      caseStatusId: otherFirm.statusOpenId,
    });

    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe('catalog_entry_not_available');
    // Naming the field would turn one probe into three.
    expect(JSON.stringify(refused.body)).not.toContain('caseStatusId');
  });

  it('a retired catalog entry produces the same refusal as a foreign one', async () => {
    const { rows } = await migration.query<{ id: string }>(
      `INSERT INTO matter_type (tenant_id, name, status, retired_at)
       VALUES ($1, $2, 'retired', now()) RETURNING id`,
      [firm.tenantId, uniqueName('Retirado')],
    );

    const refused = await open(firm.cm, firm.tenantId, {
      clientId,
      fileNumber: uniqueName('EXP-R'),
      caseStatusId: firm.statusOpenId,
      matterTypeId: rows[0]!.id,
    });

    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe('catalog_entry_not_available');
  });

  it('FR-020 — a case already holding a retired entry still resolves it, marked retired', async () => {
    const { rows } = await migration.query<{ id: string }>(
      `INSERT INTO matter_type (tenant_id, name) VALUES ($1, $2) RETURNING id`,
      [firm.tenantId, uniqueName('Vigente')],
    );
    const matterTypeId = rows[0]!.id;

    const opened = await open(firm.cm, firm.tenantId, {
      clientId,
      fileNumber: uniqueName('EXP-RET'),
      caseStatusId: firm.statusOpenId,
      matterTypeId,
    });
    expect(opened.status).toBe(201);

    await migration.query(
      `UPDATE matter_type SET status = 'retired', retired_at = now() WHERE id = $1`,
      [matterTypeId],
    );

    const after = await read(firm.mp, firm.tenantId, opened.body.id);
    expect(after.status).toBe(200);
    expect(after.body.matterType).toMatchObject({ id: matterTypeId, catalogStatus: 'retired' });
  });

  it('AA and PL hold no case creation', async () => {
    for (const actor of [firm.aa, firm.pl]) {
      const refused = await open(actor, firm.tenantId, {
        clientId,
        fileNumber: uniqueName('EXP-NO'),
        caseStatusId: firm.statusOpenId,
      });
      expect(refused.status).toBe(403);
    }
  });

  it('an empty file number and a missing status are refused', async () => {
    const noNumber = await open(firm.cm, firm.tenantId, {
      clientId,
      fileNumber: '  ',
      caseStatusId: firm.statusOpenId,
    });
    expect(noNumber.status).toBe(400);

    const noStatus = await open(firm.cm, firm.tenantId, {
      clientId,
      fileNumber: uniqueName('EXP'),
    });
    expect(noStatus.status).toBe(400);
  });

  it('Decision 3 — a freshly opened case has no team, and that is legal', async () => {
    const opened = await open(firm.cm, firm.tenantId, {
      clientId,
      fileNumber: uniqueName('EXP-SOLO'),
      caseStatusId: firm.statusOpenId,
    });

    const detail = await read(firm.mp, firm.tenantId, opened.body.id);
    expect(detail.status).toBe(200);
    expect(detail.body.team).toEqual([]);
  });
});
