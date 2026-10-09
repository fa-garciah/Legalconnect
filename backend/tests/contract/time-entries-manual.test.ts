/**
 * 009 T014 — User Story 2, contracts/time-entries-api.md §4. Recording time after the fact.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createAuthenticatedApp } from '../helpers/real-app';
import { connectAs } from '../helpers/db';
import { auditOf, makeTimeFirm, mexicoToday, shiftDay, timeCall, type TimeFirm } from '../helpers/time-entries';

describe('manual entry (009, User Story 2)', () => {
  let app: INestApplication;
  let migration: Client;
  let firm: TimeFirm;
  const yesterday = () => shiftDay(mexicoToday(), -1);
  const body = (extra: Record<string, unknown> = {}) => ({
    workDate: yesterday(),
    minutes: 90,
    description: 'Llamada con el cliente sobre la contestación',
    ...extra,
  });

  beforeAll(async () => {
    app = await createAuthenticatedApp();
    migration = await connectAs('migration');
    firm = await makeTimeFirm(app, migration, 'CC Horas Manual');
  });

  afterAll(async () => {
    await migration?.end();
    await app?.close();
  });

  it('records the entry and writes exactly one audit row carrying no description, duration or date', async () => {
    const response = await timeCall(app, firm.aa, firm.tenantId).log(firm.caseOn.id, body());
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      case: { id: firm.caseOn.id, fileNumber: firm.caseOn.fileNumber },
      workDate: yesterday(),
      minutes: 90,
      description: 'Llamada con el cliente sobre la contestación',
      source: 'manual',
    });
    const rows = await auditOf(migration, 'time_entry.logged', response.body.id);
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows[0]!.metadata ?? {})).not.toMatch(/Llamada|90|minutes|workDate|\d{4}-\d{2}-\d{2}/);
  });

  it('today is accepted; tomorrow in Mexico City is refused', async () => {
    const pl = timeCall(app, firm.pl, firm.tenantId);
    expect((await pl.log(firm.caseOn.id, body({ workDate: mexicoToday() }))).status).toBe(201);
    expect((await pl.log(firm.caseOn.id, body({ workDate: shiftDay(mexicoToday(), 1) }))).status).toBe(400);
  });

  it.each([
    ['zero minutes', { minutes: 0 }],
    ['more than a day', { minutes: 1441 }],
    ['fractional minutes', { minutes: 1.5 }],
    ['a blank description', { description: '  ' }],
    ['an impossible date', { workDate: '2026-02-30' }],
  ])('refuses %s with 400', async (_label, extra) => {
    expect((await timeCall(app, firm.cm, firm.tenantId).log(firm.caseOn.id, body(extra))).status).toBe(400);
  });

  it('a matter the AA is not on, or that does not exist, is 404 — indistinguishable', async () => {
    const aa = timeCall(app, firm.aa, firm.tenantId);
    const off = await aa.log(firm.caseOff.id, body());
    const missing = await aa.log('00000000-0000-4000-8000-000000000000', body());
    expect(off.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(off.body).toEqual(missing.body);
  });

  it('an MP records time on a matter nobody is assigned to (006 Decision 2)', async () => {
    expect((await timeCall(app, firm.mp, firm.tenantId).log(firm.caseOff.id, body())).status).toBe(201);
  });

  it('BM and SA are refused (403)', async () => {
    for (const actor of [firm.bm, firm.sa]) {
      expect((await timeCall(app, actor, firm.tenantId).log(firm.caseOn.id, body())).status).toBe(403);
    }
  });

  it('a body naming another person or status is ignored: the entry is the caller’s, logged', async () => {
    const response = await timeCall(app, firm.aa, firm.tenantId).log(
      firm.caseOn.id,
      body({ membershipId: firm.pl.membershipId, status: 'voided', source: 'timer' }),
    );
    expect(response.status).toBe(201);
    const { rows } = await migration.query<{ membership_id: string; status: string; source: string }>(
      `SELECT membership_id, status, source FROM time_entry WHERE id = $1`,
      [response.body.id],
    );
    expect(rows[0]).toEqual({ membership_id: firm.aa.membershipId, status: 'logged', source: 'manual' });
  });
});
