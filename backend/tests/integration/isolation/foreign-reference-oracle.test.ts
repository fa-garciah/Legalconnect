/**
 * Principle II — no write path may answer differently for "this id does not exist" and "this id
 * exists, in another firm".
 *
 * WHY THIS FILE EXISTS. `009` found that an MP naming another firm's matter reached the INSERT: 006's
 * `assigned` resolver lets MP and SA through BEFORE it looks at the matter (006 Decision 2), and a
 * foreign-key check does not apply RLS — so the FK was satisfied by a row the caller could never
 * read, and the response (500, or worse, 201) differed from a made-up id's 404. That difference is
 * an existence oracle across tenants: firms litigating against each other could probe for each
 * other's matters.
 *
 * WHAT IT ASSERTS. For every mutating route that takes an id from the request — in the URL or the
 * body — the response to (a) an id that exists nowhere and (b) a REAL id of another firm is
 * byte-identical in status and body, never a 5xx, and nothing is written into either firm. The
 * caller is firm A's MP: the archetype the resolver waves through, i.e. the worst case. SA is used
 * only where the capability is SA's alone.
 *
 * Driven as a table so a new route is one row, not a new file.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createAuthenticatedApp } from '../../helpers/real-app';
import { connectAs } from '../../helpers/db';
import { uniqueRfc } from '../../helpers/rfc';
import { makeCaseFirm, nextSuffix, uniqueName, type Actor, type CaseFirm } from '../../helpers/case-core';

const NOWHERE = '00000000-0000-4000-8000-0000000000ab';

interface Firm extends CaseFirm {
  readonly clientId: string;
  readonly caseId: string;
  readonly venueId: string;
  readonly positionId: string;
  readonly categoryId: string;
  readonly documentId: string;
  readonly eventId: string;
  readonly invitationId: string;
}

async function seedFirm(app: INestApplication, migration: Client, label: string): Promise<Firm> {
  const firm = await makeCaseFirm(migration, `${label} ${nextSuffix()}`, uniqueRfc());
  const one = async (sql: string, params: unknown[]) => (await migration.query<{ id: string }>(sql, params)).rows[0]!.id;
  const clientId = await one(
    `INSERT INTO client (tenant_id, kind, legal_name) VALUES ($1, 'organization', $2) RETURNING id`,
    [firm.tenantId, uniqueName('Cliente Oraculo')],
  );
  const created = await request(app.getHttpServer())
    .post('/tenant/cases')
    .set('x-identity-id', firm.mp.identityId)
    .set('x-tenant-id', firm.tenantId)
    .send({ clientId, fileNumber: uniqueName('EXP-ORA'), caseStatusId: firm.statusOpenId });
  if (created.status !== 201) throw new Error(`case not created: ${created.status}`);
  const caseId = created.body.id as string;
  const venueId = await one(`INSERT INTO venue (tenant_id, name) VALUES ($1, $2) RETURNING id`, [firm.tenantId, uniqueName('Juzgado')]);
  const positionId = await one(`INSERT INTO position (tenant_id, name) VALUES ($1, $2) RETURNING id`, [firm.tenantId, uniqueName('Cargo')]);
  const categoryId = await one(`INSERT INTO document_category (tenant_id, name) VALUES ($1, $2) RETURNING id`, [
    firm.tenantId,
    uniqueName('Categoria'),
  ]);
  const documentId = await one(
    `INSERT INTO document (tenant_id, case_id, uploaded_by_membership_id, category_id, storage_key, original_filename, mime_type, size_bytes)
     VALUES ($1, $2, $3, $4, $5, 'a.pdf', 'application/pdf', 10) RETURNING id`,
    [firm.tenantId, caseId, firm.mp.membershipId, categoryId, `tenant/${firm.tenantId}/case/${caseId}/${nextSuffix()}`],
  );
  const eventId = await one(
    `INSERT INTO calendar_event (tenant_id, case_id, type, title, all_day, starts_on, created_by_membership_id)
     VALUES ($1, $2, 'meeting', 'Junta', true, '2026-11-02', $3) RETURNING id`,
    [firm.tenantId, caseId, firm.mp.membershipId],
  );
  const invitationId = await one(
    `INSERT INTO invitation (tenant_id, target_archetype, invited_email, reference_hash, issued_by_membership_id)
     VALUES ($1, 'AA', $2, $3, $4) RETURNING id`,
    [firm.tenantId, `ora-${nextSuffix()}@example.com`, `hash-${nextSuffix()}`, firm.sa.membershipId],
  );
  return { ...firm, clientId, caseId, venueId, positionId, categoryId, documentId, eventId, invitationId };
}

describe('no write path is a cross-tenant existence oracle (Principle II)', () => {
  let app: INestApplication;
  let migration: Client;
  let a: Firm;
  let b: Firm;

  beforeAll(async () => {
    app = await createAuthenticatedApp();
    migration = await connectAs('migration');
    a = await seedFirm(app, migration, 'CC Oraculo A');
    b = await seedFirm(app, migration, 'CC Oraculo B');
  });

  afterAll(async () => {
    await migration?.end();
    await app?.close();
  });

  const as = (actor: Actor, firm: Firm) => (r: request.Test) =>
    r.set('x-identity-id', actor.identityId).set('x-tenant-id', firm.tenantId);
  const server = () => request(app.getHttpServer());

  /**
   * Each probe takes the id under test (B's real id, or one that exists nowhere) and returns the
   * request firm A's caller makes with it. Every OTHER id in the request is a valid one of firm A,
   * so the only thing that can differ is the id being probed.
   */
  type Probe = readonly [label: string, send: (id: (pick: (f: Firm) => string) => string) => request.Test];

  const PROBES: readonly Probe[] = [
    // --- an `assigned`-scoped matter in the URL (the resolver's MP short-circuit) ---
    ['PATCH case status — :caseId', (id) => as(a.mp, a)(server().patch(`/tenant/cases/${id((f) => f.caseId)}/status`)).send({ caseStatusId: a.statusClosingId })],
    ['PATCH case outcome — :caseId', (id) => as(a.mp, a)(server().patch(`/tenant/cases/${id((f) => f.caseId)}/outcome`)).send({ outcome: 'favorable' })],
    ['POST team — :caseId', (id) => as(a.mp, a)(server().post(`/tenant/cases/${id((f) => f.caseId)}/team`)).send({ membershipId: a.aa.membershipId, roleOnCase: 'collaborator' })],
    ['DELETE team — :caseId', (id) => as(a.mp, a)(server().delete(`/tenant/cases/${id((f) => f.caseId)}/team/${a.aa.membershipId}`))],
    ['POST document upload — :caseId', (id) =>
      as(a.mp, a)(server().post(`/tenant/cases/${id((f) => f.caseId)}/documents`)).attach('file', Buffer.from('%PDF-1.4 x'), {
        filename: 'oraculo.pdf',
        contentType: 'application/pdf',
      })],
    ['PATCH document category — :caseId/:id', (id) => as(a.mp, a)(server().patch(`/tenant/cases/${id((f) => f.caseId)}/documents/${id((f) => f.documentId)}/category`)).send({ categoryId: a.categoryId })],
    ['PATCH document withdraw — :caseId/:id', (id) => as(a.mp, a)(server().patch(`/tenant/cases/${id((f) => f.caseId)}/documents/${id((f) => f.documentId)}/withdraw`))],
    ['PATCH document restore — :caseId/:id', (id) => as(a.mp, a)(server().patch(`/tenant/cases/${id((f) => f.caseId)}/documents/${id((f) => f.documentId)}/restore`))],
    // --- a firm-owned row in the URL ---
    ['PATCH client — :id', (id) => as(a.mp, a)(server().patch(`/tenant/clients/${id((f) => f.clientId)}`)).send({ legalName: 'Nuevo nombre' })],
    ['POST client deactivate — :id', (id) => as(a.mp, a)(server().post(`/tenant/clients/${id((f) => f.clientId)}/deactivate`))],
    ['POST client reactivate — :id', (id) => as(a.mp, a)(server().post(`/tenant/clients/${id((f) => f.clientId)}/reactivate`))],
    ['PATCH case catalog entry — :id', (id) => as(a.mp, a)(server().patch(`/tenant/case-catalogs/case-statuses/${id((f) => f.statusOpenId)}`)).send({ isClosing: true })],
    ['PATCH case catalog retire — :id', (id) => as(a.mp, a)(server().patch(`/tenant/case-catalogs/venues/${id((f) => f.venueId)}/retire`))],
    ['PATCH position retire — :id', (id) => as(a.mp, a)(server().patch(`/tenant/directory/positions/${id((f) => f.positionId)}/retire`))],
    ['PATCH document category retire — :id', (id) => as(a.mp, a)(server().patch(`/tenant/document-categories/${id((f) => f.categoryId)}/retire`))],
    ['PATCH directory entry — :membershipId', (id) => as(a.mp, a)(server().patch(`/tenant/directory/entries/${id((f) => f.aa.membershipId)}/position`)).send({ positionId: a.positionId })],
    ['PATCH calendar event — :id', (id) => as(a.mp, a)(server().patch(`/tenant/calendar/events/${id((f) => f.eventId)}`)).send({ title: 'Otra' })],
    ['PATCH calendar cancel — :id', (id) => as(a.mp, a)(server().patch(`/tenant/calendar/events/${id((f) => f.eventId)}/cancel`))],
    ['PATCH membership revoke — :id', (id) => as(a.mp, a)(server().patch(`/tenant/memberships/${id((f) => f.pl.membershipId)}/revoke`))],
    ['PATCH membership archetype — :id (SA)', (id) => as(a.sa, a)(server().patch(`/tenant/memberships/${id((f) => f.pl.membershipId)}/archetype`)).send({ archetype: 'CM' })],
    ['POST invitation revoke — :id', (id) => as(a.mp, a)(server().post(`/tenant/invitations/${id((f) => f.invitationId)}/revoke`))],
    // --- a reference in the BODY ---
    ['POST case — body clientId', (id) => as(a.mp, a)(server().post('/tenant/cases')).send({ clientId: id((f) => f.clientId), fileNumber: uniqueName('EXP-B'), caseStatusId: a.statusOpenId })],
    ['POST case — body caseStatusId', (id) => as(a.mp, a)(server().post('/tenant/cases')).send({ clientId: a.clientId, fileNumber: uniqueName('EXP-B'), caseStatusId: id((f) => f.statusOpenId) })],
    ['POST case — body matterTypeId', (id) => as(a.mp, a)(server().post('/tenant/cases')).send({ clientId: a.clientId, fileNumber: uniqueName('EXP-B'), caseStatusId: a.statusOpenId, matterTypeId: id((f) => f.matterTypeId) })],
    ['POST case — body venueId', (id) => as(a.mp, a)(server().post('/tenant/cases')).send({ clientId: a.clientId, fileNumber: uniqueName('EXP-B'), caseStatusId: a.statusOpenId, venueId: id((f) => f.venueId) })],
    ['PATCH case status — body caseStatusId', (id) => as(a.mp, a)(server().patch(`/tenant/cases/${a.caseId}/status`)).send({ caseStatusId: id((f) => f.statusClosingId) })],
    ['POST team — body membershipId', (id) => as(a.mp, a)(server().post(`/tenant/cases/${a.caseId}/team`)).send({ membershipId: id((f) => f.aa.membershipId), roleOnCase: 'collaborator' })],
    ['PATCH directory entry — body positionId', (id) => as(a.mp, a)(server().patch(`/tenant/directory/entries/${a.aa.membershipId}/position`)).send({ positionId: id((f) => f.positionId) })],
    ['POST document upload — body categoryId', (id) =>
      as(a.mp, a)(server().post(`/tenant/cases/${a.caseId}/documents`))
        .field('categoryId', id((f) => f.categoryId))
        .attach('file', Buffer.from('%PDF-1.4 x'), { filename: 'oraculo.pdf', contentType: 'application/pdf' })],
    ['PATCH document category — body categoryId', (id) => as(a.mp, a)(server().patch(`/tenant/cases/${a.caseId}/documents/${a.documentId}/category`)).send({ categoryId: id((f) => f.categoryId) })],
    ['POST calendar event — body caseId', (id) => as(a.mp, a)(server().post('/tenant/calendar/events')).send({ type: 'meeting', title: 'x', allDay: true, startsOn: '2026-11-03', caseId: id((f) => f.caseId) })],
    ['PATCH calendar event — body caseId', (id) => as(a.mp, a)(server().patch(`/tenant/calendar/events/${a.eventId}`)).send({ caseId: id((f) => f.caseId) })],
    // --- 009, recorded time: every write is nested under the matter, so the resolver alone decides
    // (009's own service-level check was removed once the resolver checked the firm for MP/SA) ---
    ['POST time entry — :caseId', (id) => as(a.mp, a)(server().post(`/tenant/cases/${id((f) => f.caseId)}/time-entries`)).send({ workDate: '2026-10-01', minutes: 30, description: 'x' })],
    ['POST timer start — :caseId', (id) => as(a.mp, a)(server().post(`/tenant/cases/${id((f) => f.caseId)}/time-entries/timer`)).send({})],
    ['POST timer stop — :caseId', (id) => as(a.mp, a)(server().post(`/tenant/cases/${id((f) => f.caseId)}/time-entries/timer/stop`)).send({ description: 'x' })],
    ['PATCH time entry — :caseId', (id) => as(a.mp, a)(server().patch(`/tenant/cases/${id((f) => f.caseId)}/time-entries/${NOWHERE}`)).send({ minutes: 5 })],
    ['POST time entry void — :caseId', (id) => as(a.mp, a)(server().post(`/tenant/cases/${id((f) => f.caseId)}/time-entries/${NOWHERE}/void`))],
  ];

  const nowhere = () => NOWHERE;
  const ofB = (pick: (f: Firm) => string) => pick(b);

  it.each(PROBES)('%s: another firm’s real id answers exactly like an id that exists nowhere', async (_label, send) => {
    const absent = await send(nowhere);
    const foreign = await send(ofB);
    expect(foreign.status, `foreign ${foreign.status} ${JSON.stringify(foreign.body)}`).toBe(absent.status);
    expect(foreign.body).toEqual(absent.body);
    expect(foreign.status).toBeLessThan(500);
    expect(foreign.status).not.toBe(200);
    expect(foreign.status).not.toBe(201);
  });

  it('nothing written in firm A points at a row of firm B', async () => {
    const { rows } = await migration.query<{ n: string }>(
      `SELECT (
         (SELECT count(*) FROM case_assignment ca JOIN case_file c ON c.id = ca.case_id WHERE ca.tenant_id <> c.tenant_id)
       + (SELECT count(*) FROM document d JOIN case_file c ON c.id = d.case_id WHERE d.tenant_id <> c.tenant_id)
       + (SELECT count(*) FROM document d JOIN document_category k ON k.id = d.category_id WHERE d.tenant_id <> k.tenant_id)
       + (SELECT count(*) FROM calendar_event e JOIN case_file c ON c.id = e.case_id WHERE e.tenant_id <> c.tenant_id)
       + (SELECT count(*) FROM case_file c JOIN client l ON l.id = c.client_id WHERE c.tenant_id <> l.tenant_id)
       + (SELECT count(*) FROM directory_entry de JOIN position p ON p.id = de.position_id WHERE de.tenant_id <> p.tenant_id)
       )::text AS n`,
    );
    expect(rows[0]!.n).toBe('0');
  });
});
