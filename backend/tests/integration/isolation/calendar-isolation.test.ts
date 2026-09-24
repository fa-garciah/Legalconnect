/**
 * 013 T006 (SC-002, FR-006). Who can see an event.
 *
 * Two boundaries, tested separately because they are enforced separately:
 *   - the FIRM, by RLS on `calendar_event` — asserted as the real `lc_app` role;
 *   - the CASE TEAM, by the repository's assignment predicate — asserted through the API, because
 *     that is where it lives (as 006's case list does it).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createAuthenticatedApp } from '../../helpers/real-app';
import { connectAs } from '../../helpers/db';
import { allDay, calendarCall, makeCalendarFirm, timed, type CalendarFirm } from '../../helpers/calendar';

describe('calendar isolation (013)', () => {
  let app: INestApplication;
  let migration: Client;
  let a: CalendarFirm;
  let b: CalendarFirm;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    app = await createAuthenticatedApp();
    migration = await connectAs('migration');
    a = await makeCalendarFirm(app, migration, 'CC Agenda A');
    b = await makeCalendarFirm(app, migration, 'CC Agenda B');
    const mpA = calendarCall(app, a.mp, a.tenantId);
    ids.firmWide = (await mpA.create(allDay('Junta de socios', '2026-10-05'))).body.id;
    ids.onCase = (await mpA.create(timed('Audiencia en caso asignado', '2026-10-06T16:00:00Z', { caseId: a.caseOn.id }))).body.id;
    ids.offCase = (await mpA.create(timed('Audiencia en caso ajeno', '2026-10-07T16:00:00Z', { caseId: a.caseOff.id }))).body.id;
    ids.firmB = (await calendarCall(app, b.mp, b.tenantId).create(allDay('Evento de B', '2026-10-05'))).body.id;
    for (const [k, v] of Object.entries(ids)) if (!v) throw new Error(`fixture ${k} not created`);
  });

  afterAll(async () => {
    await migration?.end();
    await app?.close();
  });

  const listedIds = async (call: ReturnType<typeof calendarCall>) =>
    ((await call.list('2026-10-01', '2026-11-01')).body.items as Array<{ id: string }>).map((e) => e.id);

  it('lc_app acting in firm B reads none of firm A’s events', async () => {
    const app_ = await connectAs('app');
    try {
      await app_.query('BEGIN');
      await app_.query(`SELECT set_config('app.tenant_id', $1, true)`, [b.tenantId]);
      const { rows } = await app_.query<{ id: string }>(`SELECT id FROM calendar_event`);
      const seen = rows.map((r) => r.id);
      expect(seen).toContain(ids.firmB);
      for (const id of [ids.firmWide, ids.onCase, ids.offCase]) expect(seen).not.toContain(id);
    } finally {
      await app_.query('ROLLBACK');
      await app_.end();
    }
  });

  it('lc_app with no tenant active reads nothing', async () => {
    const app_ = await connectAs('app');
    try {
      const { rows } = await app_.query(`SELECT id FROM calendar_event`);
      expect(rows).toEqual([]);
    } finally {
      await app_.end();
    }
  });

  it('lc_app cannot delete an event', async () => {
    const app_ = await connectAs('app');
    try {
      await app_.query('BEGIN');
      await app_.query(`SELECT set_config('app.tenant_id', $1, true)`, [a.tenantId]);
      await expect(app_.query(`DELETE FROM calendar_event WHERE id = $1`, [ids.firmWide])).rejects.toThrow(/permission denied/);
    } finally {
      await app_.query('ROLLBACK');
      await app_.end();
    }
  });

  it('an AA sees the firm-wide event and the case they are on — not the case they are not on', async () => {
    const seen = await listedIds(calendarCall(app, a.aa, a.tenantId));
    expect(seen).toContain(ids.firmWide);
    expect(seen).toContain(ids.onCase);
    expect(seen).not.toContain(ids.offCase);
  });

  it('MP and SA see every event of their firm, and none of another', async () => {
    for (const actor of [a.mp, a.sa]) {
      const seen = await listedIds(calendarCall(app, actor, a.tenantId));
      for (const id of [ids.firmWide, ids.onCase, ids.offCase]) expect(seen).toContain(id);
      expect(seen).not.toContain(ids.firmB);
    }
  });

  it('an AA cannot edit or cancel the event of a case they are not on — 404, like one that does not exist', async () => {
    const aa = calendarCall(app, a.aa, a.tenantId);
    expect((await aa.update(ids.offCase!, { title: 'x' })).status).toBe(404);
    expect((await aa.cancel(ids.offCase!)).status).toBe(404);
  });

  it('an AA cannot attach an event to a case they are not on', async () => {
    const response = await calendarCall(app, a.aa, a.tenantId).create(
      timed('Intento', '2026-10-08T16:00:00Z', { caseId: a.caseOff.id }),
    );
    expect(response.status).toBe(404);
  });

  it('firm B cannot touch firm A’s event', async () => {
    const mpB = calendarCall(app, b.mp, b.tenantId);
    expect((await mpB.update(ids.firmWide!, { title: 'x' })).status).toBe(404);
    expect((await mpB.create(timed('Cruce', '2026-10-08T16:00:00Z', { caseId: a.caseOn.id }))).status).toBe(404);
  });
});
