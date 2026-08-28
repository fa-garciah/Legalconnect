/**
 * T032 — 006/US1 (FR-001 to FR-004a). quickstart.md Scenario 1.
 *
 * The client register, end to end: the four capabilities, the cross-tenant refusal, and
 * Q1's `PL` split — the one permission cell the clarification session moved.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createRealApp } from '../helpers/real-app';
import { connectAs } from '../helpers/db';
import { uniqueRfc } from '../helpers/rfc';
import { makeCaseFirm, nextSuffix, uniqueName, type Actor, type CaseFirm } from '../helpers/case-core';

describe('the client register', () => {
  let app: INestApplication;
  let migration: Client;
  let firm: CaseFirm;
  let otherFirm: CaseFirm;

  const create = (actor: Actor, tenantId: string, body: object) =>
    request(app.getHttpServer())
      .post('/tenant/clients')
      .set('x-identity-id', actor.identityId)
      .set('x-tenant-id', tenantId)
      .send(body);

  const patch = (actor: Actor, tenantId: string, id: string, body: object) =>
    request(app.getHttpServer())
      .patch(`/tenant/clients/${id}`)
      .set('x-identity-id', actor.identityId)
      .set('x-tenant-id', tenantId)
      .send(body);

  const deactivate = (actor: Actor, tenantId: string, id: string) =>
    request(app.getHttpServer())
      .post(`/tenant/clients/${id}/deactivate`)
      .set('x-identity-id', actor.identityId)
      .set('x-tenant-id', tenantId)
      .send();

  const list = (actor: Actor, tenantId: string, query = '') =>
    request(app.getHttpServer())
      .get(`/tenant/clients${query}`)
      .set('x-identity-id', actor.identityId)
      .set('x-tenant-id', tenantId);

  beforeAll(async () => {
    app = await createRealApp();
    migration = await connectAs('migration');
    firm = await makeCaseFirm(migration, `CC Firma ${nextSuffix()}`, uniqueRfc());
    otherFirm = await makeCaseFirm(migration, `CC Otra ${nextSuffix()}`, uniqueRfc());
  });

  afterAll(async () => {
    await migration.end();
    await app.close();
  });

  it('scenario 1 — a client is created and is available in that tenant only', async () => {
    const legalName = uniqueName('Grupo Torres');
    const created = await create(firm.mp, firm.tenantId, { kind: 'organization', legalName });

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ kind: 'organization', legalName, status: 'active' });

    // The other firm's list never contains it — RLS, not a filter this code wrote.
    const elsewhere = await list(otherFirm.mp, otherFirm.tenantId);
    expect(elsewhere.status).toBe(200);
    expect(elsewhere.body.items.map((c: { id: string }) => c.id)).not.toContain(created.body.id);
  });

  it('scenario 2 — a client with no RFC is accepted', async () => {
    // FR-002. Fiscal completeness is a billing-slice concern; refusing intake over an
    // uncollected RFC would block the workflow this slice exists to make possible.
    const omitted = await create(firm.mp, firm.tenantId, {
      kind: 'person',
      legalName: uniqueName('Juan Pérez'),
    });
    expect(omitted.status).toBe(201);
    expect(omitted.body.rfc).toBeNull();

    const explicitNull = await create(firm.mp, firm.tenantId, {
      kind: 'person',
      legalName: uniqueName('Ana López'),
      rfc: null,
    });
    expect(explicitNull.status).toBe(201);
    expect(explicitNull.body.rfc).toBeNull();
  });

  it('scenario 3 — a deactivated client is not hard-deleted and every case still resolves it', async () => {
    const client = await create(firm.mp, firm.tenantId, {
      kind: 'organization',
      legalName: uniqueName('Constructora'),
    });
    const clientId = client.body.id as string;

    const opened = await request(app.getHttpServer())
      .post('/tenant/cases')
      .set('x-identity-id', firm.mp.identityId)
      .set('x-tenant-id', firm.tenantId)
      .send({
        clientId,
        fileNumber: uniqueName('EXP'),
        caseStatusId: firm.statusOpenId,
      });
    expect(opened.status).toBe(201);

    const withdrawn = await deactivate(firm.mp, firm.tenantId, clientId);
    expect(withdrawn.status).toBe(200);
    expect(withdrawn.body.status).toBe('inactive');

    // FR-008 — the case is unaffected, and still resolves the client's name.
    const readBack = await request(app.getHttpServer())
      .get(`/tenant/cases/${opened.body.id}`)
      .set('x-identity-id', firm.mp.identityId)
      .set('x-tenant-id', firm.tenantId);
    expect(readBack.status).toBe(200);
    expect(readBack.body.client.id).toBe(clientId);
    expect(readBack.body.client.status).toBe('inactive');

    // Never hard-deleted: the row is still there.
    const rows = await migration.query(`SELECT id FROM client WHERE id = $1`, [clientId]);
    expect(rows.rowCount).toBe(1);
  });

  it('scenario 4 — two tenants may register the same legal name, and so may one tenant twice', async () => {
    const shared = uniqueName('Despacho Homónimo');

    const here = await create(firm.mp, firm.tenantId, { kind: 'organization', legalName: shared });
    const there = await create(otherFirm.mp, otherFirm.tenantId, {
      kind: 'organization',
      legalName: shared,
    });
    expect(here.status).toBe(201);
    expect(there.status).toBe(201);
    expect(here.body.id).not.toBe(there.body.id);

    // And within ONE tenant, deliberately. Two people called Juan Pérez at one firm is not
    // a data error, and a uniqueness constraint would refuse a legitimate second
    // engagement. Asserted so a later reader does not "fix" the missing constraint.
    const twice = await create(firm.mp, firm.tenantId, {
      kind: 'organization',
      legalName: shared,
    });
    expect(twice.status).toBe(201);
    expect(twice.body.id).not.toBe(here.body.id);
  });

  it('scenario 5 — a deactivated client is refused for a new case', async () => {
    const client = await create(firm.mp, firm.tenantId, {
      kind: 'person',
      legalName: uniqueName('Retirado'),
    });
    await deactivate(firm.mp, firm.tenantId, client.body.id);

    const refused = await request(app.getHttpServer())
      .post('/tenant/cases')
      .set('x-identity-id', firm.mp.identityId)
      .set('x-tenant-id', firm.tenantId)
      .send({
        clientId: client.body.id,
        fileNumber: uniqueName('EXP'),
        caseStatusId: firm.statusOpenId,
      });

    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe('client_not_available');
  });

  it('scenario 6 — reaching another tenant\'s client is a generic 404, recorded as a cross-tenant attempt', async () => {
    const theirs = await create(otherFirm.mp, otherFirm.tenantId, {
      kind: 'organization',
      legalName: uniqueName('Ajena'),
    });

    const read = await patch(firm.mp, firm.tenantId, theirs.body.id, { legalName: 'x' });
    expect(read.status).toBe(404);
    expect(read.body.error.code).toBe('not_found');
  });

  it('scenario 7 (Q1) — a PL creates and corrects a client, and is refused the withdrawal', async () => {
    // The clarification session's one permission move. The catalogue's own
    // US03-EP03-CLM-AddOrUpdateClientProfile is a PL story about INTAKE; withdrawing a
    // client is a decision about the firm's engagements, and stays with MP/BM/SA.
    const created = await create(firm.pl, firm.tenantId, {
      kind: 'person',
      legalName: uniqueName('Cliente de Pasante'),
    });
    expect(created.status).toBe(201);

    const corrected = await patch(firm.pl, firm.tenantId, created.body.id, {
      legalName: uniqueName('Cliente de Pasante Corregido'),
    });
    expect(corrected.status).toBe(200);

    const refused = await deactivate(firm.pl, firm.tenantId, created.body.id);
    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe('not_authorized');
  });

  it('kind is not updatable, and saying so is a refusal rather than a silent drop', async () => {
    const created = await create(firm.mp, firm.tenantId, {
      kind: 'person',
      legalName: uniqueName('Inmutable'),
    });

    const refused = await patch(firm.mp, firm.tenantId, created.body.id, { kind: 'organization' });
    expect(refused.status).toBe(400);
    expect(refused.body.error.code).toBe('validation_failed');
  });

  it('an inactive client is frozen — update and a second withdrawal both refuse', async () => {
    const created = await create(firm.mp, firm.tenantId, {
      kind: 'person',
      legalName: uniqueName('Congelado'),
    });
    await deactivate(firm.mp, firm.tenantId, created.body.id);

    const update = await patch(firm.mp, firm.tenantId, created.body.id, { legalName: 'x' });
    expect(update.status).toBe(409);
    expect(update.body.error.code).toBe('already_deactivated');

    const again = await deactivate(firm.mp, firm.tenantId, created.body.id);
    expect(again.status).toBe(409);
  });

  it('every internal archetype reads clients, including BM', async () => {
    // Principle VI's line is drawn at case CONTENT, not at the client record — billing
    // needs the party. `BM`'s exclusion begins at the case rows, asserted in
    // case-list-scoping.test.ts.
    for (const actor of [firm.mp, firm.sa, firm.aa, firm.pl, firm.cm, firm.bm]) {
      const response = await list(actor, firm.tenantId);
      expect(response.status).toBe(200);
    }
  });

  it('AA and CM hold no client write', async () => {
    for (const actor of [firm.aa, firm.cm]) {
      const refused = await create(actor, firm.tenantId, {
        kind: 'person',
        legalName: uniqueName('No'),
      });
      expect(refused.status).toBe(403);
    }
  });

  it('an empty name is refused', async () => {
    const refused = await create(firm.mp, firm.tenantId, { kind: 'person', legalName: '   ' });
    expect(refused.status).toBe(400);
  });
});
