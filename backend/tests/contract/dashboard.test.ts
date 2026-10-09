/**
 * 024 T004 — `GET /tenant/dashboard` (contracts/dashboard-api.md). Every section, for the archetypes
 * that hold row 56, built from rows the product writes, narrowed to the matters the caller reaches.
 *
 * Events are inserted directly: the dashboard reads rows, and a deadline three days in the past must
 * exist whatever 013's input rules say about creating one today.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createAuthenticatedApp } from '../helpers/real-app';
import { connectAs } from '../helpers/db';
import type { Actor } from '../helpers/case-core';
import { makeTimeFirm, mexicoToday, shiftDay, timeCall, type TimeFirm } from '../helpers/time-entries';
import { noteCall } from '../helpers/notes';

interface Summary {
  id: string;
  type: string;
  title: string;
  case: { id: string; fileNumber: string } | null;
}

describe('the dashboard (024, US1–US3)', () => {
  let app: INestApplication;
  let migration: Client;
  let firm: TimeFirm;
  const today = mexicoToday();
  const ids: Record<string, string> = {};

  const read = (actor: Actor) =>
    request(app.getHttpServer()).get('/tenant/dashboard').set('x-identity-id', actor.identityId).set('x-tenant-id', firm.tenantId);

  const event = async (key: string, type: string, title: string, startsOn: string, caseId: string | null, status = 'scheduled') => {
    const { rows } = await migration.query<{ id: string }>(
      `INSERT INTO calendar_event (tenant_id, case_id, type, title, all_day, starts_on, status, cancelled_at, created_by_membership_id)
       VALUES ($1, $2, $3::calendar_event_type, $4, true, $5::date, $6::calendar_event_status, CASE WHEN $6::text = 'cancelled' THEN now() END, $7) RETURNING id`,
      [firm.tenantId, caseId, type, title, startsOn, status, firm.mp.membershipId],
    );
    ids[key] = rows[0]!.id;
  };

  beforeAll(async () => {
    app = await createAuthenticatedApp();
    migration = await connectAs('migration');
    firm = await makeTimeFirm(app, migration, 'CC Tablero');
    const on = firm.caseOn.id;
    const off = firm.caseOff.id;

    // A third matter, closed: active for nobody.
    const client = await migration.query<{ id: string }>(`SELECT client_id AS id FROM case_file WHERE id = $1`, [on]);
    const closed = await migration.query<{ id: string }>(
      `INSERT INTO case_file (tenant_id, client_id, file_number, case_status_id, closed_on)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [firm.tenantId, client.rows[0]!.id, `EXP-CERRADO-${Date.now()}`, firm.statusClosingId, today],
    );
    ids.closed = closed.rows[0]!.id;

    await event('hearingOn', 'hearing', 'Audiencia de hoy', today, on);
    await event('meetingFirm', 'meeting', 'Junta del despacho', today, null);
    await event('hearingOff', 'hearing', 'Audiencia ajena', today, off);
    await event('cancelledToday', 'hearing', 'Audiencia cancelada', today, on, 'cancelled');
    await event('dueSoon', 'deadline', 'Contestar demanda', shiftDay(today, 3), on);
    await event('duePast', 'deadline', 'Ofrecer pruebas', shiftDay(today, -3), on);
    await event('dueFar', 'deadline', 'Alegatos', shiftDay(today, 10), on);
    await event('dueLongAgo', 'deadline', 'Plazo antiguo', shiftDay(today, -10), on);
    await event('dueCancelled', 'deadline', 'Plazo cancelado', shiftDay(today, 2), on, 'cancelled');
    await event('dueOff', 'deadline', 'Plazo ajeno', shiftDay(today, 2), off);
    await event('hearingSoon', 'hearing', 'Audiencia próxima', shiftDay(today, 2), on);

    await timeCall(app, firm.aa, firm.tenantId).log(on, { workDate: today, minutes: 60, description: 'Redacción' }).expect(201);
    await timeCall(app, firm.aa, firm.tenantId).log(on, { workDate: shiftDay(today, -1), minutes: 45, description: 'Ayer' }).expect(201);
    await timeCall(app, firm.pl, firm.tenantId).log(on, { workDate: today, minutes: 30, description: 'Integración' }).expect(201);

    ids.noteOn = (await noteCall(app, firm.aa, firm.tenantId).create(on, { body: 'Texto privilegiado del tablero' })).body.id;
    ids.noteOff = (await noteCall(app, firm.mp, firm.tenantId).create(off, { body: 'Nota en asunto ajeno' })).body.id;
  });

  afterAll(async () => {
    await migration?.end();
    await app?.close();
  });

  it('answers today in Mexico City', async () => {
    expect((await read(firm.aa).expect(200)).body.today).toBe(today);
  });

  it('counts active matters the caller reaches, never a closed one', async () => {
    expect((await read(firm.aa)).body.activeMatters).toBe(1);
    expect((await read(firm.mp)).body.activeMatters).toBe(2);
    expect((await read(firm.sa)).body.activeMatters).toBe(2);
  });

  it("gives a timekeeper their OWN minutes today, and SA none at all", async () => {
    expect((await read(firm.aa)).body.myMinutesToday).toBe(60);
    expect((await read(firm.pl)).body.myMinutesToday).toBe(30);
    expect((await read(firm.mp)).body.myMinutesToday).toBe(0);
    expect((await read(firm.sa)).body.myMinutesToday).toBeNull();
  });

  it("lists today's scheduled events on reachable matters and on none, never cancelled ones", async () => {
    const events = (await read(firm.aa)).body.todayEvents as Summary[];
    const got = events.map((e) => e.id);
    expect(got).toEqual(expect.arrayContaining([ids.hearingOn, ids.meetingFirm]));
    expect(got).not.toContain(ids.hearingOff);
    expect(got).not.toContain(ids.cancelledToday);
    expect(got).not.toContain(ids.hearingSoon);
    expect(events.find((e) => e.id === ids.hearingOn)!.case).toEqual({ id: firm.caseOn.id, fileNumber: firm.caseOn.fileNumber });
    expect(events.find((e) => e.id === ids.meetingFirm)!.case).toBeNull();
    expect(((await read(firm.mp)).body.todayEvents as Summary[]).map((e) => e.id)).toContain(ids.hearingOff);
  });

  it('splits deadlines into the next seven days and the last seven, deadlines only, never cancelled', async () => {
    const { upcoming, recent } = (await read(firm.aa)).body.deadlines as { upcoming: Summary[]; recent: Summary[] };
    expect(upcoming.map((e) => e.id)).toEqual([ids.dueSoon]);
    expect(recent.map((e) => e.id)).toEqual([ids.duePast]);
    const mp = (await read(firm.mp)).body.deadlines as { upcoming: Summary[] };
    expect(mp.upcoming.map((e) => e.id)).toEqual([ids.dueOff, ids.dueSoon]);
  });

  it("lists recent activity on reachable matters, newest first, with the matter's file number", async () => {
    const activity = (await read(firm.aa)).body.recentActivity as { action: string; case: { id: string; fileNumber: string } }[];
    expect(activity.length).toBeGreaterThan(0);
    expect(activity.length).toBeLessThanOrEqual(20);
    expect(activity[0]!.action).toBe('note.created');
    for (const entry of activity) expect(entry.case.id).toBe(firm.caseOn.id);
    expect(activity.map((e) => e.action)).toContain('case.team_member_assigned');
    const mp = (await read(firm.mp)).body.recentActivity as { case: { id: string } }[];
    expect(mp.map((e) => e.case.id)).toContain(firm.caseOff.id);
  });

  it('carries no metadata value, no note text and no revenue figure anywhere (SC-002)', async () => {
    for (const actor of [firm.mp, firm.aa, firm.sa]) {
      const json = JSON.stringify((await read(actor)).body);
      for (const leak of ['metadata', 'privilegiado', firm.statusOpenId, firm.statusClosingId, 'revenue', 'ingreso', 'amount', 'rate', '@example.com']) {
        expect(json, leak).not.toContain(leak);
      }
    }
  });

  it('writes no audit row (Decision 5)', async () => {
    const count = async () =>
      Number((await migration.query<{ n: string }>(`SELECT count(*)::text AS n FROM audit_event WHERE tenant_id = $1`, [firm.tenantId])).rows[0]!.n);
    const before = await count();
    await read(firm.mp).expect(200);
    await read(firm.aa).expect(200);
    expect(await count()).toBe(before);
  });

  it('refuses BM (403) — every section is about matters (Decision 4)', async () => {
    const response = await read(firm.bm);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('not_authorized');
  });
});
