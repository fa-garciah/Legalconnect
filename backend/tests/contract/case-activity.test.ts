/**
 * 008 T013 — User Story 5: a matter's activity, derived from `audit_event` (Decision 2,
 * contracts/notes-activity-api.md §5, FR-010 – FR-015).
 *
 * Every entry is produced through the real API, so the feed is tested against the audit rows the
 * product actually writes — their targets and metadata — not against a hand-written guess of them.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createAuthenticatedApp } from '../helpers/real-app';
import { connectAs } from '../helpers/db';
import { makeMember, type Actor } from '../helpers/case-core';
import { makeTimeFirm, mexicoToday, timeCall, type TimeFirm } from '../helpers/time-entries';
import { calendarCall, timed } from '../helpers/calendar';
import { mexicoMonth, noteCall } from '../helpers/notes';

interface Entry {
  id: string;
  action: string;
  occurredAt: string;
  actor: { membershipId: string; position: string | null } | null;
  fileName: string | null;
}

describe('a matter’s activity (008, US5)', () => {
  let app: INestApplication;
  let migration: Client;
  let firm: TimeFirm;
  let extra: Actor;
  let feed: Entry[];
  let noteText: string;

  const as = (actor: Actor) => (r: request.Test) =>
    r.set('x-identity-id', actor.identityId).set('x-tenant-id', firm.tenantId);

  beforeAll(async () => {
    app = await createAuthenticatedApp();
    migration = await connectAs('migration');
    firm = await makeTimeFirm(app, migration, 'CC Actividad');
    const server = app.getHttpServer();
    const mp = as(firm.mp);
    const caseId = firm.caseOn.id;

    // A position for the AA, so the feed's label is checkable (FR-015).
    const position = await migration.query<{ id: string }>(
      `INSERT INTO position (tenant_id, name) VALUES ($1, 'Asociado Senior') RETURNING id`,
      [firm.tenantId],
    );
    await migration.query(
      `INSERT INTO directory_entry (membership_id, tenant_id, position_id) VALUES ($1, $2, $3)`,
      [firm.aa.membershipId, firm.tenantId, position.rows[0]!.id],
    );

    // Status, team.
    await mp(request(server).patch(`/tenant/cases/${caseId}/status`)).send({ caseStatusId: firm.statusClosingId }).expect(200);
    extra = await makeMember(migration, firm.tenantId, 'PL');
    await mp(request(server).post(`/tenant/cases/${caseId}/team`)).send({ membershipId: extra.membershipId, roleOnCase: 'collaborator' }).expect(201);
    await mp(request(server).delete(`/tenant/cases/${caseId}/team/${extra.membershipId}`)).send();

    // Documents: upload, recategorise, withdraw, restore; plus a preview and a download (accesses).
    const category = await migration.query<{ id: string }>(
      `INSERT INTO document_category (tenant_id, name) VALUES ($1, 'Unclassified'), ($1, 'Pruebas') RETURNING id`,
      [firm.tenantId],
    );
    const upload = await as(firm.aa)(request(server).post(`/tenant/cases/${caseId}/documents`))
      .attach('file', Buffer.from('%PDF-1.4 x'), { filename: 'Demanda inicial.pdf', contentType: 'application/pdf' })
      .field('categoryId', category.rows[0]!.id);
    expect(upload.status).toBe(201);
    const documentId = upload.body.id as string;
    await mp(request(server).patch(`/tenant/cases/${caseId}/documents/${documentId}/category`)).send({ categoryId: category.rows[1]!.id }).expect(200);
    await as(firm.aa)(request(server).get(`/tenant/cases/${caseId}/documents/${documentId}/preview`));
    await as(firm.aa)(request(server).get(`/tenant/cases/${caseId}/documents/${documentId}/download`));
    await mp(request(server).patch(`/tenant/cases/${caseId}/documents/${documentId}/withdraw`)).send().expect(200);
    await mp(request(server).patch(`/tenant/cases/${caseId}/documents/${documentId}/restore`)).send().expect(200);

    // Calendar: create, update, cancel.
    const calendar = calendarCall(app, firm.aa, firm.tenantId);
    const event = await calendar.create(timed('Audiencia confidencial', '2030-01-10T16:00:00.000Z', { caseId }));
    expect(event.status).toBe(201);
    await calendar.update(event.body.id, { title: 'Audiencia reprogramada' }).expect(200);
    await calendar.cancel(event.body.id).expect(200);

    // Notes: create, correct, void, and a list read (an access).
    noteText = 'Texto privilegiado que nunca debe salir en la actividad';
    const notes = noteCall(app, firm.aa, firm.tenantId);
    const note = await notes.create(caseId, { body: noteText });
    await notes.correct(caseId, note.body.id, { body: `${noteText} (corregido)` }).expect(200);
    await notes.void(caseId, note.body.id).expect(200);
    await notes.list(caseId);

    // Read the matter and log time on it — both audited, neither belongs in the feed.
    await as(firm.aa)(request(server).get(`/tenant/cases/${caseId}`)).expect(200);
    await timeCall(app, firm.aa, firm.tenantId).log(caseId, { workDate: mexicoToday(), minutes: 30, description: 'Revisión' }).expect(201);

    // Something on ANOTHER matter: must not appear.
    await noteCall(app, firm.mp, firm.tenantId).create(firm.caseOff.id, { body: 'Otra materia' }).expect(201);

    const response = await noteCall(app, firm.aa, firm.tenantId).activity(caseId);
    expect(response.status).toBe(200);
    feed = response.body.items as Entry[];
  });

  afterAll(async () => {
    await migration?.end();
    await app?.close();
  });

  it('lists every allow-listed mutation on the matter, newest first', () => {
    const actions = feed.map((e) => e.action);
    for (const action of [
      'case.created',
      'case.status_changed',
      'case.team_member_assigned',
      'case.team_member_unassigned',
      'document.uploaded',
      'document.category_changed',
      'document.withdrawn',
      'document.restored',
      'calendar_event.created',
      'calendar_event.updated',
      'calendar_event.cancelled',
      'note.created',
      'note.corrected',
      'note.voided',
    ]) {
      expect(actions, action).toContain(action);
    }
    const times = feed.map((e) => e.occurredAt);
    expect([...times].sort().reverse()).toEqual(times);
    expect(actions[0]).toBe('note.voided');
  });

  it('excludes accesses and hours (FR-013)', () => {
    const actions = new Set(feed.map((e) => e.action));
    for (const absent of ['case.read', 'document.previewed', 'document.downloaded', 'note.list_read', 'time_entry.logged']) {
      expect(actions.has(absent), absent).toBe(false);
    }
  });

  it('labels the actor by position and documents by file name — and carries no metadata value (FR-014)', () => {
    const upload = feed.find((e) => e.action === 'document.uploaded')!;
    expect(upload.actor).toEqual({ membershipId: firm.aa.membershipId, position: 'Asociado Senior' });
    expect(upload.fileName).toBe('Demanda inicial.pdf');
    expect(feed.find((e) => e.action === 'note.created')!.fileName).toBeNull();
    const json = JSON.stringify(feed);
    for (const leak of ['privilegiado', firm.statusClosingId, firm.statusOpenId, 'Audiencia', 'Pruebas', 'Revisión', 'metadata', '@example.com']) {
      expect(json, leak).not.toContain(leak);
    }
    for (const entry of feed) expect(Object.keys(entry).sort()).toEqual(['action', 'actor', 'fileName', 'id', 'occurredAt']);
  });

  it("another matter's activity is absent", () => {
    expect(feed.filter((e) => e.action === 'note.created')).toHaveLength(1);
  });

  it('reading the feed writes no audit row (Decision 4)', async () => {
    const count = async () =>
      Number((await migration.query<{ n: string }>(`SELECT count(*)::text AS n FROM audit_event WHERE tenant_id = $1`, [firm.tenantId])).rows[0]!.n);
    const before = await count();
    await noteCall(app, firm.aa, firm.tenantId).activity(firm.caseOn.id).expect(200);
    expect(await count()).toBe(before);
  });

  it('filters by Mexico City month; a malformed month is 400', async () => {
    const call = noteCall(app, firm.aa, firm.tenantId);
    expect((await call.activity(firm.caseOn.id, mexicoMonth())).body.month).toBe(mexicoMonth());
    const past = await call.activity(firm.caseOn.id, '2020-01');
    expect(past.status).toBe(200);
    expect(past.body).toEqual({ month: '2020-01', items: [], truncated: false });
    expect((await call.activity(firm.caseOn.id, '2026-1')).status).toBe(400);
  });

  it('SA reads it (200); BM is refused (403); an AA off the matter gets 404', async () => {
    expect((await noteCall(app, firm.sa, firm.tenantId).activity(firm.caseOn.id)).status).toBe(200);
    expect((await noteCall(app, firm.bm, firm.tenantId).activity(firm.caseOn.id)).status).toBe(403);
    expect((await noteCall(app, firm.aa, firm.tenantId).activity(firm.caseOff.id)).status).toBe(404);
  });

  it('an unassignment written by the revocation cascade carries metadata.caseId and so appears (analyze M1)', async () => {
    const leaving = await makeMember(migration, firm.tenantId, 'AA');
    await as(firm.mp)(request(app.getHttpServer()).post(`/tenant/cases/${firm.caseOn.id}/team`))
      .send({ membershipId: leaving.membershipId, roleOnCase: 'collaborator' })
      .expect(201);
    const revoked = await as(firm.sa)(request(app.getHttpServer()).patch(`/tenant/memberships/${leaving.membershipId}/revoke`)).send();
    expect(revoked.status).toBe(200);
    const cascade = await migration.query<{ metadata: Record<string, unknown> }>(
      `SELECT metadata FROM audit_event WHERE action = 'case.team_member_unassigned' AND target_id = $1`,
      [leaving.membershipId],
    );
    expect(cascade.rows[0]!.metadata).toMatchObject({ caseId: firm.caseOn.id, reason: 'membership_revoked' });
    const items = (await noteCall(app, firm.aa, firm.tenantId).activity(firm.caseOn.id)).body.items as Entry[];
    expect(items.filter((e) => e.action === 'case.team_member_unassigned')).toHaveLength(2);
  });
});
