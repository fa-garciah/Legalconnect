/**
 * 009 T019 — User Story 4, contracts/time-entries-api.md §7–§8, Decision 3. Fixing a mistake while
 * it is fresh: own entries, 24 hours, void rather than delete.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createAuthenticatedApp } from '../helpers/real-app';
import { connectAs } from '../helpers/db';
import { auditOf, makeTimeFirm, mexicoToday, shiftDay, timeCall, type TimeFirm } from '../helpers/time-entries';

describe('correction (009, User Story 4)', () => {
  let app: INestApplication;
  let migration: Client;
  let firm: TimeFirm;
  let aa: ReturnType<typeof timeCall>;

  const fresh = async (minutes = 180) => {
    const response = await aa.log(firm.caseOn.id, {
      workDate: shiftDay(mexicoToday(), -1),
      minutes,
      description: 'Revisión del contrato de arrendamiento',
    });
    if (response.status !== 201) throw new Error(`not logged: ${response.status}`);
    return response.body.id as string;
  };

  beforeAll(async () => {
    app = await createAuthenticatedApp();
    migration = await connectAs('migration');
    firm = await makeTimeFirm(app, migration, 'CC Horas Correccion');
    aa = timeCall(app, firm.aa, firm.tenantId);
  });

  afterAll(async () => {
    await migration?.end();
    await app?.close();
  });

  it('corrects the duration; the audit row names the field and never its value', async () => {
    const id = await fresh();
    const response = await aa.correct(firm.caseOn.id, id, { minutes: 30 });
    expect(response.status).toBe(200);
    expect(response.body.minutes).toBe(30);
    const [row] = await auditOf(migration, 'time_entry.corrected', id);
    expect(row!.metadata).toEqual({ changed: ['minutes'] });
  });

  it('corrects date and description together, names both, sorted', async () => {
    const id = await fresh();
    const response = await aa.correct(firm.caseOn.id, id, {
      workDate: shiftDay(mexicoToday(), -2),
      description: 'Revisión del convenio modificatorio',
    });
    expect(response.status).toBe(200);
    const [row] = await auditOf(migration, 'time_entry.corrected', id);
    expect(row!.metadata).toEqual({ changed: ['description', 'workDate'] });
    expect(JSON.stringify(row!.metadata)).not.toContain('convenio');
  });

  it('ignores an attempt to move the entry to another matter', async () => {
    const id = await fresh();
    const response = await aa.correct(firm.caseOn.id, id, { caseId: firm.caseOff.id, minutes: 10 });
    expect(response.status).toBe(200);
    expect(response.body.case.id).toBe(firm.caseOn.id);
  });

  it('a correction to a future date or an invalid duration is 400', async () => {
    const id = await fresh();
    expect((await aa.correct(firm.caseOn.id, id, { workDate: shiftDay(mexicoToday(), 1) })).status).toBe(400);
    expect((await aa.correct(firm.caseOn.id, id, { minutes: 0 })).status).toBe(400);
  });

  it('void: gone from the timesheet, kept in the table with voided_at, audited once', async () => {
    const id = await fresh();
    expect((await aa.void(firm.caseOn.id, id)).status).toBe(200);
    expect(await auditOf(migration, 'time_entry.voided', id)).toHaveLength(1);
    const { rows } = await migration.query<{ status: string; voided_at: string | null }>(
      `SELECT status, voided_at FROM time_entry WHERE id = $1`,
      [id],
    );
    expect(rows[0]!.status).toBe('voided');
    expect(rows[0]!.voided_at).not.toBeNull();
    const sheet = await aa.timesheet(shiftDay(mexicoToday(), -3), shiftDay(mexicoToday(), 1));
    expect((sheet.body.items as { id: string }[]).map((i) => i.id)).not.toContain(id);
  });

  it('a voided entry answers 409 entry_voided to both correction and a second void', async () => {
    const id = await fresh();
    await aa.void(firm.caseOn.id, id);
    const again = await aa.void(firm.caseOn.id, id);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('entry_voided');
    expect((await aa.correct(firm.caseOn.id, id, { minutes: 5 })).body.error.code).toBe('entry_voided');
  });

  it('after 24 hours both are 409 correction_window_closed', async () => {
    const id = await fresh();
    await migration.query(`UPDATE time_entry SET logged_at = now() - interval '25 hours' WHERE id = $1`, [id]);
    const correct = await aa.correct(firm.caseOn.id, id, { minutes: 5 });
    expect(correct.status).toBe(409);
    expect(correct.body.error.code).toBe('correction_window_closed');
    expect((await aa.void(firm.caseOn.id, id)).body.error.code).toBe('correction_window_closed');
  });

  it("somebody else's entry is 404 — including a partner's attempt on an associate's", async () => {
    const id = await fresh();
    for (const actor of [firm.pl, firm.cm, firm.mp]) {
      const call = timeCall(app, actor, firm.tenantId);
      expect((await call.correct(firm.caseOn.id, id, { minutes: 5 })).status).toBe(404);
      expect((await call.void(firm.caseOn.id, id)).status).toBe(404);
    }
  });

  it('the right entry under the wrong matter is 404', async () => {
    const mpEntry = await timeCall(app, firm.mp, firm.tenantId).log(firm.caseOn.id, {
      workDate: mexicoToday(),
      minutes: 20,
      description: 'Supervisión',
    });
    const mp = timeCall(app, firm.mp, firm.tenantId);
    expect((await mp.correct(firm.caseOff.id, mpEntry.body.id, { minutes: 5 })).status).toBe(404);
  });

  it('a running timer is not correctable through this route (404)', async () => {
    const started = await aa.start(firm.caseOn.id);
    expect((await aa.correct(firm.caseOn.id, started.body.id, { minutes: 5 })).status).toBe(404);
    expect((await aa.discard()).status).toBe(200);
  });

  it('BM and SA are refused (403)', async () => {
    const id = await fresh();
    for (const actor of [firm.bm, firm.sa]) {
      const call = timeCall(app, actor, firm.tenantId);
      expect((await call.correct(firm.caseOn.id, id, { minutes: 5 })).status).toBe(403);
      expect((await call.void(firm.caseOn.id, id)).status).toBe(403);
    }
  });
});
