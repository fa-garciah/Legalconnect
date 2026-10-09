/**
 * 009 T012 — User Story 1, contracts/time-entries-api.md §2, §3, §5, §6, end to end through the
 * real app. Start, stop and discard a server-side timer on a reachable matter.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createAuthenticatedApp } from '../helpers/real-app';
import { connectAs } from '../helpers/db';
import { auditOf, makeTimeFirm, mexicoToday, shiftDay, timeCall, unassign, type TimeFirm } from '../helpers/time-entries';
import { makeMember } from '../helpers/case-core';

describe('the timer (009, User Story 1)', () => {
  let app: INestApplication;
  let migration: Client;
  let firm: TimeFirm;

  /** Moves a running timer's start into the past, as if it had been started then. */
  const backdate = (id: string, startedAt: Date) =>
    migration.query(`UPDATE time_entry SET started_at = $2 WHERE id = $1`, [id, startedAt.toISOString()]);

  beforeAll(async () => {
    app = await createAuthenticatedApp();
    migration = await connectAs('migration');
    firm = await makeTimeFirm(app, migration, 'CC Cronometro');
  });

  afterAll(async () => {
    await migration?.end();
    await app?.close();
  });

  it('start → running timer on the server → stop with a description → an ordinary logged entry', async () => {
    const aa = timeCall(app, firm.aa, firm.tenantId);

    const started = await aa.start(firm.caseOn.id, { description: 'Redacción de demanda' });
    expect(started.status).toBe(201);
    expect(started.body).toMatchObject({
      case: { id: firm.caseOn.id, fileNumber: firm.caseOn.fileNumber },
      caseAvailable: true,
      description: 'Redacción de demanda',
    });
    expect(await auditOf(migration, 'time_entry.timer_started', started.body.id)).toHaveLength(1);

    const read = await aa.timer();
    expect(read.status).toBe(200);
    expect(read.body.timer.id).toBe(started.body.id);

    const stopped = await aa.stop(firm.caseOn.id, {});
    expect(stopped.status).toBe(201);
    expect(stopped.body).toMatchObject({
      id: started.body.id,
      case: { id: firm.caseOn.id, fileNumber: firm.caseOn.fileNumber },
      workDate: mexicoToday(),
      minutes: 1,
      description: 'Redacción de demanda',
      source: 'timer',
    });
    expect(typeof stopped.body.correctableUntil).toBe('string');
    const [entry] = await auditOf(migration, 'time_entry.timer_stopped', started.body.id);
    expect(entry).toBeDefined();
    // FR-014: no description, duration or date in the audit metadata.
    expect(JSON.stringify(entry!.metadata ?? {})).not.toMatch(/Redacción|minutes|workDate/);

    expect((await aa.timer()).body.timer).toBeNull();
  });

  it('a description given at stop replaces the one given at start', async () => {
    const pl = timeCall(app, firm.pl, firm.tenantId);
    await pl.start(firm.caseOn.id, { description: 'Borrador' });
    const stopped = await pl.stop(firm.caseOn.id, { description: 'Integración de anexos' });
    expect(stopped.status).toBe(201);
    expect(stopped.body.description).toBe('Integración de anexos');
  });

  it('records the elapsed time to the nearest minute', async () => {
    const cm = timeCall(app, firm.cm, firm.tenantId);
    const started = await cm.start(firm.caseOn.id);
    await backdate(started.body.id, new Date(Date.now() - (95 * 60 + 40) * 1000));
    const stopped = await cm.stop(firm.caseOn.id, { description: 'Coordinación con el perito' });
    expect(stopped.status).toBe(201);
    expect(stopped.body.minutes).toBe(96);
  });

  it('a timer started at 23:30 in Mexico City belongs to that day (SC-005)', async () => {
    // The most recent 05:30Z — 23:30 of the previous day in Mexico City — within the last 24 h.
    const now = new Date();
    const at = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 5, 30));
    if (at > now) at.setUTCDate(at.getUTCDate() - 1);
    const mp = timeCall(app, firm.mp, firm.tenantId);
    const started = await mp.start(firm.caseOn.id);
    await backdate(started.body.id, at);
    const stopped = await mp.stop(firm.caseOn.id, { description: 'Revisión nocturna del expediente' });
    expect(stopped.status).toBe(201);
    expect(stopped.body.workDate).toBe(mexicoToday(at));
    expect(stopped.body.workDate).toBe(new Date(at.getTime() - 6 * 3_600_000).toISOString().slice(0, 10));
  });

  it('one running timer per person: a second start is 409 timer_running, on any matter', async () => {
    const aa = timeCall(app, firm.aa, firm.tenantId);
    expect((await aa.start(firm.caseOn.id)).status).toBe(201);
    const second = await aa.start(firm.caseOn.id);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('timer_running');
    expect((await aa.discard()).status).toBe(200);
  });

  it('two concurrent starts: exactly one wins, one 409, one audit row', async () => {
    const extra = await makeMember(migration, firm.tenantId, 'MP');
    const mp2 = timeCall(app, extra, firm.tenantId);
    const results = await Promise.all([mp2.start(firm.caseOn.id), mp2.start(firm.caseOn.id)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const { rows } = await migration.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM audit_event a JOIN time_entry t ON t.id = a.target_id
        WHERE a.action = 'time_entry.timer_started' AND t.membership_id = $1`,
      [extra.membershipId],
    );
    expect(rows[0]!.n).toBe('1');
  });

  it('stopping twice: the second finds no running timer', async () => {
    const pl = timeCall(app, firm.pl, firm.tenantId);
    await pl.start(firm.caseOn.id, { description: 'Búsqueda de jurisprudencia' });
    expect((await pl.stop(firm.caseOn.id)).status).toBe(201);
    const again = await pl.stop(firm.caseOn.id);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('no_running_timer');
  });

  it('stopping without any description is 400, and the timer keeps running', async () => {
    const pl = timeCall(app, firm.pl, firm.tenantId);
    const started = await pl.start(firm.caseOn.id);
    expect((await pl.stop(firm.caseOn.id)).status).toBe(400);
    expect((await pl.timer()).body.timer.id).toBe(started.body.id);
    expect((await pl.discard()).status).toBe(200);
  });

  it('a timer past 24 hours cannot be stopped (409 timer_too_long) and can be discarded', async () => {
    const cm = timeCall(app, firm.cm, firm.tenantId);
    const started = await cm.start(firm.caseOn.id, { description: 'Olvidado' });
    await backdate(started.body.id, new Date(Date.now() - 25 * 3_600_000));
    const stop = await cm.stop(firm.caseOn.id);
    expect(stop.status).toBe(409);
    expect(stop.body.error.code).toBe('timer_too_long');
    const discarded = await cm.discard();
    expect(discarded.status).toBe(200);
    expect(await auditOf(migration, 'time_entry.timer_discarded', started.body.id)).toHaveLength(1);
  });

  it('discarding records nothing on the timesheet; discarding with no timer is 409', async () => {
    const aa = timeCall(app, firm.aa, firm.tenantId);
    const started = await aa.start(firm.caseOn.id, { description: 'Error' });
    expect((await aa.discard()).status).toBe(200);
    const { rows } = await migration.query<{ status: string; voided_at: string | null }>(
      `SELECT status, voided_at FROM time_entry WHERE id = $1`,
      [started.body.id],
    );
    expect(rows[0]).toMatchObject({ status: 'voided' });
    expect(rows[0]!.voided_at).not.toBeNull();
    const sheet = await aa.timesheet(mexicoToday(), shiftDay(mexicoToday(), 1));
    expect(sheet.status).toBe(200);
    expect(sheet.body.items.map((i: { id: string }) => i.id)).not.toContain(started.body.id);
    const none = await aa.discard();
    expect(none.status).toBe(409);
    expect(none.body.error.code).toBe('no_running_timer');
  });

  it('an AA cannot start a timer on a matter they are not on — 404, like one that does not exist', async () => {
    const aa = timeCall(app, firm.aa, firm.tenantId);
    expect((await aa.start(firm.caseOff.id)).status).toBe(404);
    expect((await aa.start('00000000-0000-4000-8000-000000000000')).status).toBe(404);
  });

  it('an MP reaches every matter of the firm (006 Decision 2)', async () => {
    const mp = timeCall(app, firm.mp, firm.tenantId);
    expect((await mp.start(firm.caseOff.id)).status).toBe(201);
    expect((await mp.stop(firm.caseOff.id, { description: 'Supervisión' })).status).toBe(201);
  });

  it('stopping on a different matter than the timer is on is 409 no_running_timer', async () => {
    const mp = timeCall(app, firm.mp, firm.tenantId);
    await mp.start(firm.caseOn.id);
    const wrong = await mp.stop(firm.caseOff.id, { description: 'x' });
    expect(wrong.status).toBe(409);
    expect(wrong.body.error.code).toBe('no_running_timer');
    expect((await mp.discard()).status).toBe(200);
  });

  it('taken off the matter mid-timer: the timer hides the matter, stop is 404, discard works (FR-008)', async () => {
    const extra = await makeMember(migration, firm.tenantId, 'AA');
    const assigned = await request(app.getHttpServer())
      .post(`/tenant/cases/${firm.caseOn.id}/team`)
      .set('x-identity-id', firm.mp.identityId)
      .set('x-tenant-id', firm.tenantId)
      .send({ membershipId: extra.membershipId, roleOnCase: 'collaborator' });
    expect(assigned.status).toBe(201);

    const aa2 = timeCall(app, extra, firm.tenantId);
    expect((await aa2.start(firm.caseOn.id, { description: 'x' })).status).toBe(201);
    await unassign(app, firm, firm.caseOn.id, extra);

    const read = await aa2.timer();
    expect(read.body.timer).toMatchObject({ case: null, caseAvailable: false });
    expect((await aa2.stop(firm.caseOn.id)).status).toBe(404);
    expect((await aa2.discard()).status).toBe(200);
    expect((await aa2.timer()).body.timer).toBeNull();
  });

  it('BM and SA are refused on every timer route (403)', async () => {
    for (const actor of [firm.bm, firm.sa]) {
      const call = timeCall(app, actor, firm.tenantId);
      expect((await call.start(firm.caseOn.id)).status).toBe(403);
      expect((await call.stop(firm.caseOn.id)).status).toBe(403);
      expect((await call.timer()).status).toBe(403);
      expect((await call.discard()).status).toBe(403);
    }
  });
});
