/**
 * 013 T007 — contracts/calendar-api.md, end to end through the real app.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createAuthenticatedApp } from '../helpers/real-app';
import { connectAs } from '../helpers/db';
import { allDay, calendarCall, makeCalendarFirm, timed, type CalendarFirm } from '../helpers/calendar';

describe('the calendar API (013)', () => {
  let app: INestApplication;
  let migration: Client;
  let firm: CalendarFirm;
  let mp: ReturnType<typeof calendarCall>;

  const audit = async (action: string, id: string) =>
    (
      await migration.query<{ metadata: Record<string, unknown> | null }>(
        `SELECT metadata FROM audit_event WHERE action = $1 AND target_id = $2 ORDER BY occurred_at`,
        [action, id],
      )
    ).rows;

  beforeAll(async () => {
    app = await createAuthenticatedApp();
    migration = await connectAs('migration');
    firm = await makeCalendarFirm(app, migration, 'CC Agenda');
    mp = calendarCall(app, firm.mp, firm.tenantId);
  });

  afterAll(async () => {
    await migration?.end();
    await app?.close();
  });

  describe('create', () => {
    it('a timed event linked to a case comes back whole, naming the case', async () => {
      const response = await mp.create(
        timed('Audiencia de pruebas', '2026-11-10T16:00:00.000Z', {
          endsAt: '2026-11-10T17:30:00.000Z',
          location: 'Juzgado 4° Civil',
          caseId: firm.caseOn.id,
          remindMinutesBefore: 1440,
        }),
      );
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        type: 'hearing',
        title: 'Audiencia de pruebas',
        allDay: false,
        startsAt: '2026-11-10T16:00:00.000Z',
        endsAt: '2026-11-10T17:30:00.000Z',
        startsOn: null,
        location: 'Juzgado 4° Civil',
        case: { id: firm.caseOn.id, fileNumber: firm.caseOn.fileNumber },
        remindMinutesBefore: 1440,
        status: 'scheduled',
        cancelledAt: null,
        createdByMembershipId: firm.mp.membershipId,
      });
      expect(await audit('calendar_event.created', response.body.id)).toHaveLength(1);
    });

    it('an all-day deadline keeps its date as a date', async () => {
      const response = await mp.create(allDay('Vence contestación', '2026-11-30'));
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ allDay: true, startsOn: '2026-11-30', endsOn: null, startsAt: null, case: null });
    });

    it('a malformed body is 400', async () => {
      expect((await mp.create({ type: 'party', title: 'x', allDay: true, startsOn: '2026-11-30' })).status).toBe(400);
      expect((await mp.create(timed('x', '2026-11-10T16:00:00Z', { endsAt: '2026-11-10T15:00:00Z' }))).status).toBe(400);
    });

    it('a case that does not exist is 404', async () => {
      const response = await mp.create(
        timed('x', '2026-11-10T16:00:00Z', { caseId: '00000000-0000-4000-8000-000000000000' }),
      );
      expect(response.status).toBe(404);
    });
  });

  describe('list', () => {
    let ids: Record<string, string>;

    beforeAll(async () => {
      const make = async (body: Record<string, unknown>) => (await mp.create(body)).body.id as string;
      ids = {
        // 21:00 on 30 Sept in Mexico City is 03:00Z on 1 Oct — it belongs to SEPTEMBER.
        lateSept: await make(timed('Tarde del 30', '2026-10-01T03:00:00.000Z')),
        spansMidnight: await make(timed('Cruza medianoche', '2026-10-31T04:00:00.000Z', { endsAt: '2026-11-01T08:00:00.000Z' })),
        allDayOct: await make(allDay('Plazo octubre', '2026-10-15')),
        allDayAcross: await make(allDay('Semana del 29', '2026-10-29', { endsOn: '2026-11-02' })),
        cancelled: await make(allDay('Cancelado', '2026-10-20')),
      };
      expect((await mp.cancel(ids.cancelled!)).status).toBe(200);
    });

    const idsIn = async (from: string, to: string, extra = '') => {
      const response = await mp.list(from, to, extra);
      expect(response.status).toBe(200);
      return (response.body.items as Array<{ id: string }>).map((e) => e.id);
    };

    it('reads Mexico City days: 21:00 on 30 Sept is September, not October', async () => {
      expect(await idsIn('2026-10-01', '2026-11-01')).not.toContain(ids.lateSept);
      expect(await idsIn('2026-09-01', '2026-10-01')).toContain(ids.lateSept);
    });

    it('returns an event in every month it overlaps', async () => {
      for (const month of [['2026-10-01', '2026-11-01'], ['2026-11-01', '2026-12-01']] as const) {
        const seen = await idsIn(month[0], month[1]);
        expect(seen).toContain(ids.spansMidnight);
        expect(seen).toContain(ids.allDayAcross);
      }
    });

    it('hides cancelled events unless asked', async () => {
      expect(await idsIn('2026-10-01', '2026-11-01')).not.toContain(ids.cancelled);
      expect(await idsIn('2026-10-01', '2026-11-01', '&includeCancelled=true')).toContain(ids.cancelled);
    });

    it('orders by start', async () => {
      const response = await mp.list('2026-10-01', '2026-11-01');
      const starts = (response.body.items as Array<{ startsAt: string | null; startsOn: string | null }>).map(
        (e) => e.startsAt ?? `${e.startsOn}T06:00:00.000Z`,
      );
      expect([...starts].sort()).toEqual(starts);
    });

    it('requires a range of at most 62 days', async () => {
      expect((await mp.list('2026-01-01', '2026-06-01')).status).toBe(400);
      expect((await mp.list('2026-10-01', '2026-09-01')).status).toBe(400);
      expect((await mp.list('hoy', '2026-11-01')).status).toBe(400);
    });
  });

  describe('update and cancel', () => {
    it('an edit is audited with the NAMES of the fields that changed, never their values', async () => {
      const created = await mp.create(timed('Reunión con cliente', '2026-11-12T16:00:00Z'));
      const updated = await mp.update(created.body.id, { title: 'Reunión con el cliente', startsAt: '2026-11-12T17:00:00Z' });
      expect(updated.status).toBe(200);
      expect(updated.body.title).toBe('Reunión con el cliente');
      const [entry] = await audit('calendar_event.updated', created.body.id);
      expect(entry!.metadata).toEqual({ changed: ['startsAt', 'title'] });
      expect(JSON.stringify(entry!.metadata)).not.toContain('cliente');
    });

    it('a patch that would break the event’s shape is 400', async () => {
      const created = await mp.create(timed('x', '2026-11-12T16:00:00Z'));
      expect((await mp.update(created.body.id, { endsAt: '2026-11-12T15:00:00Z' })).status).toBe(400);
      // Switching to all-day needs a date.
      expect((await mp.update(created.body.id, { allDay: true })).status).toBe(400);
      expect((await mp.update(created.body.id, { allDay: true, startsOn: '2026-11-12' })).status).toBe(200);
    });

    it('cancel keeps the row, audits once, and cannot be repeated or edited after', async () => {
      const created = await mp.create(allDay('Se cancela', '2026-11-20'));
      const cancelled = await mp.cancel(created.body.id);
      expect(cancelled.status).toBe(200);
      expect(cancelled.body.status).toBe('cancelled');
      expect(typeof cancelled.body.cancelledAt).toBe('string');
      expect((await mp.cancel(created.body.id)).status).toBe(409);
      expect((await mp.update(created.body.id, { title: 'y' })).status).toBe(409);
      expect(await audit('calendar_event.cancelled', created.body.id)).toHaveLength(1);
      const row = await migration.query(`SELECT id FROM calendar_event WHERE id = $1`, [created.body.id]);
      expect(row.rows).toHaveLength(1);
    });

    it('an unknown event is 404', async () => {
      expect((await mp.update('00000000-0000-4000-8000-000000000000', { title: 'x' })).status).toBe(404);
    });
  });

  describe('reminders', () => {
    it('lists an event whose reminder time has passed and whose start has not', async () => {
      const soon = new Date(Date.now() + 30 * 60_000).toISOString();
      const later = new Date(Date.now() + 2 * 86_400_000).toISOString();
      const past = new Date(Date.now() - 60 * 60_000).toISOString();
      const due = (await mp.create(timed('Pronto', soon, { remindMinutesBefore: 60 }))).body.id;
      const notYet = (await mp.create(timed('Luego', later, { remindMinutesBefore: 15 }))).body.id;
      const started = (await mp.create(timed('Ya pasó', past, { remindMinutesBefore: 1440 }))).body.id;
      const noReminder = (await mp.create(timed('Sin aviso', soon))).body.id;
      const cancelled = (await mp.create(timed('Cancelado pronto', soon, { remindMinutesBefore: 60 }))).body.id;
      await mp.cancel(cancelled);

      const response = await mp.reminders();
      expect(response.status).toBe(200);
      const seen = (response.body.items as Array<{ id: string }>).map((e) => e.id);
      expect(seen).toContain(due);
      for (const id of [notYet, started, noReminder, cancelled]) expect(seen).not.toContain(id);
    });

    it('an AA gets no reminder for a case they are not on', async () => {
      const soon = new Date(Date.now() + 30 * 60_000).toISOString();
      const hidden = (await mp.create(timed('Ajeno', soon, { remindMinutesBefore: 60, caseId: firm.caseOff.id }))).body.id;
      const seen = ((await calendarCall(app, firm.aa, firm.tenantId).reminders()).body.items as Array<{ id: string }>).map(
        (e) => e.id,
      );
      expect(seen).not.toContain(hidden);
    });
  });

  describe('permissions', () => {
    it('BM is refused 403 on every route', async () => {
      const bm = calendarCall(app, firm.bm, firm.tenantId);
      const id = (await mp.create(allDay('x', '2026-11-30'))).body.id;
      expect((await bm.list('2026-11-01', '2026-12-01')).status).toBe(403);
      expect((await bm.reminders()).status).toBe(403);
      expect((await bm.create(allDay('x', '2026-11-30'))).status).toBe(403);
      expect((await bm.update(id, { title: 'y' })).status).toBe(403);
      expect((await bm.cancel(id)).status).toBe(403);
    });

    it.each(['aa', 'pl', 'cm', 'sa'] as const)('%s may create and read', async (who) => {
      const call = calendarCall(app, firm[who], firm.tenantId);
      expect((await call.create(allDay(`De ${who}`, '2026-11-25'))).status).toBe(201);
      expect((await call.list('2026-11-01', '2026-12-01')).status).toBe(200);
    });
  });
});
