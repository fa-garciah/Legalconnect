/**
 * 009 T016 (Principle II, SC-002, FR-009). Who can see and touch recorded time.
 *
 * Three boundaries, tested separately because they are enforced separately:
 *   - the FIRM, by RLS on `time_entry` — asserted as the real `lc_app` role, and through every
 *     route with another firm's ids;
 *   - the MATTER TEAM, by the repository's predicate for reads and 006's resolver for writes;
 *   - the PERSON, by `membership_id = caller` on every query — nobody sees anybody else's time.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createAuthenticatedApp } from '../../helpers/real-app';
import { connectAs } from '../../helpers/db';
import { makeTimeFirm, mexicoToday, shiftDay, timeCall, unassign, type TimeFirm } from '../../helpers/time-entries';

describe('time-entry isolation (009)', () => {
  let app: INestApplication;
  let migration: Client;
  let a: TimeFirm;
  let b: TimeFirm;
  const ids: Record<string, string> = {};
  const range = () => [shiftDay(mexicoToday(), -5), shiftDay(mexicoToday(), 1)] as const;
  const entry = (minutes: number, description: string) => ({ workDate: mexicoToday(), minutes, description });
  const listed = async (call: ReturnType<typeof timeCall>) => {
    const response = await call.timesheet(...range());
    return {
      ids: (response.body.items as { id: string }[]).map((i) => i.id),
      total: response.body.totalMinutes as number,
      days: response.body.days as { minutes: number }[],
    };
  };

  beforeAll(async () => {
    app = await createAuthenticatedApp();
    migration = await connectAs('migration');
    a = await makeTimeFirm(app, migration, 'CC Horas A');
    b = await makeTimeFirm(app, migration, 'CC Horas B');
    ids.aaOn = (await timeCall(app, a.aa, a.tenantId).log(a.caseOn.id, entry(60, 'AA en su asunto'))).body.id;
    ids.plOn = (await timeCall(app, a.pl, a.tenantId).log(a.caseOn.id, entry(30, 'PL en el mismo asunto'))).body.id;
    ids.mpOff = (await timeCall(app, a.mp, a.tenantId).log(a.caseOff.id, entry(15, 'MP en asunto sin equipo'))).body.id;
    ids.firmB = (await timeCall(app, b.aa, b.tenantId).log(b.caseOn.id, entry(45, 'Firma B'))).body.id;
    for (const [k, v] of Object.entries(ids)) if (!v) throw new Error(`fixture ${k} not created`);
  });

  afterAll(async () => {
    await migration?.end();
    await app?.close();
  });

  it('lc_app acting in firm B reads none of firm A’s entries', async () => {
    const appClient = await connectAs('app');
    try {
      await appClient.query('BEGIN');
      await appClient.query(`SELECT set_config('app.tenant_id', $1, true)`, [b.tenantId]);
      const { rows } = await appClient.query<{ id: string }>(`SELECT id FROM time_entry`);
      const seen = rows.map((r) => r.id);
      expect(seen).toContain(ids.firmB);
      for (const id of [ids.aaOn, ids.plOn, ids.mpOff]) expect(seen).not.toContain(id);
    } finally {
      await appClient.query('ROLLBACK');
      await appClient.end();
    }
  });

  it('lc_app with no tenant active reads nothing, and cannot delete', async () => {
    const appClient = await connectAs('app');
    try {
      expect((await appClient.query(`SELECT id FROM time_entry`)).rows).toEqual([]);
      await expect(appClient.query(`DELETE FROM time_entry WHERE id = $1`, [ids.aaOn])).rejects.toThrow(/permission denied/);
    } finally {
      await appClient.end();
    }
  });

  it('each person sees only their own entries — an AA never sees the PL’s on the same matter', async () => {
    expect((await listed(timeCall(app, a.aa, a.tenantId))).ids).toEqual([ids.aaOn]);
    expect((await listed(timeCall(app, a.pl, a.tenantId))).ids).toEqual([ids.plOn]);
  });

  it('an MP sees their own entries on any matter — and nobody else’s', async () => {
    const mp = await listed(timeCall(app, a.mp, a.tenantId));
    expect(mp.ids).toEqual([ids.mpOff]);
  });

  it('firm B’s member sees only firm B’s entry', async () => {
    expect((await listed(timeCall(app, b.aa, b.tenantId))).ids).toEqual([ids.firmB]);
  });

  describe('every route refuses another firm’s ids', () => {
    it('writes on firm B’s matter from firm A: 404 for an AA AND for an MP, and nothing is written', async () => {
      for (const actor of [a.aa, a.mp]) {
        const call = timeCall(app, actor, a.tenantId);
        expect((await call.log(b.caseOn.id, entry(10, 'intento'))).status).toBe(404);
        expect((await call.start(b.caseOn.id)).status).toBe(404);
        expect((await call.stop(b.caseOn.id, { description: 'x' })).status).toBe(404);
        expect((await call.correct(b.caseOn.id, ids.firmB!, { minutes: 1 })).status).toBe(404);
        expect((await call.void(b.caseOn.id, ids.firmB!)).status).toBe(404);
      }
      const { rows } = await migration.query(
        `SELECT 1 FROM time_entry WHERE case_id = $1 AND tenant_id = $2`,
        [b.caseOn.id, a.tenantId],
      );
      expect(rows).toEqual([]);
    });

    it('an MP naming a matter id that exists nowhere gets the same 404, not a server error', async () => {
      const call = timeCall(app, a.mp, a.tenantId);
      const missing = '00000000-0000-4000-8000-000000000000';
      const real = await call.log(b.caseOn.id, entry(10, 'x'));
      const none = await call.log(missing, entry(10, 'x'));
      expect(none.status).toBe(404);
      expect(none.body).toEqual(real.body);
      expect((await call.start(missing)).status).toBe(404);
    });

    it('firm A’s entry id under firm A’s matter is 404 to firm B’s MP', async () => {
      const call = timeCall(app, b.mp, b.tenantId);
      expect((await call.correct(a.caseOn.id, ids.aaOn!, { minutes: 1 })).status).toBe(404);
      expect((await call.void(a.caseOn.id, ids.aaOn!)).status).toBe(404);
    });
  });

  it('taken off a matter: its entries leave the list AND both totals on the next request', async () => {
    const pl = timeCall(app, a.pl, a.tenantId);
    const before = await listed(pl);
    expect(before.total).toBe(30);
    await unassign(app, a, a.caseOn.id, a.pl);
    const after = await listed(pl);
    expect(after.ids).toEqual([]);
    expect(after.total).toBe(0);
    expect(after.days).toEqual([]);
    // And the entry itself is no longer correctable by them: the resolver refuses the matter.
    expect((await pl.correct(a.caseOn.id, ids.plOn!, { minutes: 5 })).status).toBe(404);
  });
});
