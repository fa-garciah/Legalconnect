/**
 * 024 T006 (Principle II, SC-001). The dashboard says nothing about matters the caller does not reach.
 *
 * The unreached matter is given one of everything the dashboard reads — an event today, a deadline,
 * hours and activity — so a section that forgot the reach predicate would show it. And a second firm
 * is given the same, for RLS.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createAuthenticatedApp } from '../../helpers/real-app';
import { connectAs } from '../../helpers/db';
import { makeMember, type Actor } from '../../helpers/case-core';
import { makeTimeFirm, mexicoToday, shiftDay, timeCall, unassign, type TimeFirm } from '../../helpers/time-entries';
import { noteCall } from '../../helpers/notes';

describe('dashboard isolation (024)', () => {
  let app: INestApplication;
  let migration: Client;
  let a: TimeFirm;
  let b: TimeFirm;
  let loner: Actor;
  const today = mexicoToday();

  const read = (actor: Actor, firm: TimeFirm) =>
    request(app.getHttpServer()).get('/tenant/dashboard').set('x-identity-id', actor.identityId).set('x-tenant-id', firm.tenantId);

  const everything = async (firm: TimeFirm, caseId: string, label: string) => {
    for (const [type, day] of [['hearing', today], ['deadline', shiftDay(today, 2)], ['deadline', shiftDay(today, -2)]] as const) {
      await migration.query(
        `INSERT INTO calendar_event (tenant_id, case_id, type, title, all_day, starts_on, created_by_membership_id)
         VALUES ($1, $2, $3::calendar_event_type, $4, true, $5::date, $6)`,
        [firm.tenantId, caseId, type, `${label} ${type}`, day, firm.mp.membershipId],
      );
    }
    await timeCall(app, firm.mp, firm.tenantId).log(caseId, { workDate: today, minutes: 15, description: label }).expect(201);
    await noteCall(app, firm.mp, firm.tenantId).create(caseId, { body: label }).expect(201);
  };

  beforeAll(async () => {
    app = await createAuthenticatedApp();
    migration = await connectAs('migration');
    a = await makeTimeFirm(app, migration, 'CC Tablero A');
    b = await makeTimeFirm(app, migration, 'CC Tablero B');
    await everything(a, a.caseOff.id, 'AJENO-A');
    await everything(b, b.caseOn.id, 'FIRMA-B');
    await everything(b, b.caseOff.id, 'FIRMA-B');
    loner = await makeMember(migration, a.tenantId, 'AA');
  });

  afterAll(async () => {
    await migration?.end();
    await app?.close();
  });

  it('an AA sees nothing of the matter they are not on — in any section', async () => {
    const body = (await read(a.aa, a).expect(200)).body;
    const json = JSON.stringify(body);
    expect(json).not.toContain('AJENO-A');
    expect(json).not.toContain(a.caseOff.id);
    expect(body.activeMatters).toBe(1);
  });

  it('nobody in firm A sees firm B — not even the MP, who reaches every matter of their own firm', async () => {
    for (const actor of [a.mp, a.sa, a.aa]) {
      const json = JSON.stringify((await read(actor, a).expect(200)).body);
      expect(json).not.toContain('FIRMA-B');
      expect(json).not.toContain(b.caseOn.id);
      expect(json).not.toContain(b.caseOff.id);
    }
  });

  it('an AA with no assignments gets an empty dashboard (200), not a refusal', async () => {
    const body = (await read(loner, a).expect(200)).body;
    expect(body.activeMatters).toBe(0);
    expect(body.myMinutesToday).toBe(0);
    expect(body.deadlines).toEqual({ upcoming: [], recent: [] });
    expect(body.recentActivity).toEqual([]);
    for (const event of body.todayEvents as { case: unknown }[]) expect(event.case).toBeNull();
  });

  it('taken off a matter: its rows leave the dashboard on the next request', async () => {
    await everything(a, a.caseOn.id, 'PROPIO-A');
    expect(JSON.stringify((await read(a.pl, a)).body)).toContain('PROPIO-A');
    await unassign(app, a, a.caseOn.id, a.pl);
    const body = (await read(a.pl, a)).body;
    expect(JSON.stringify(body)).not.toContain('PROPIO-A');
    expect(JSON.stringify(body)).not.toContain(a.caseOn.id);
    expect(body.activeMatters).toBe(0);
  });
});
