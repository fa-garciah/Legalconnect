/**
 * 009 T017 — User Story 3, contracts/time-entries-api.md §1. One's own timesheet and its totals.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createAuthenticatedApp } from '../helpers/real-app';
import { connectAs } from '../helpers/db';
import { makeTimeFirm, mexicoToday, shiftDay, timeCall, type TimeFirm } from '../helpers/time-entries';

interface Listed {
  id: string;
  workDate: string;
  minutes: number;
  loggedAt: string;
  correctableUntil: string | null;
}

describe('the timesheet (009, User Story 3)', () => {
  let app: INestApplication;
  let migration: Client;
  let firm: TimeFirm;
  const today = () => mexicoToday();
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    app = await createAuthenticatedApp();
    migration = await connectAs('migration');
    firm = await makeTimeFirm(app, migration, 'CC Horas Hoja');
    const aa = timeCall(app, firm.aa, firm.tenantId);
    const log = async (key: string, workDate: string, minutes: number) => {
      const response = await aa.log(firm.caseOn.id, { workDate, minutes, description: `Trabajo ${key}` });
      if (response.status !== 201) throw new Error(`not logged: ${response.status}`);
      ids[key] = response.body.id;
    };
    await log('today1', today(), 30);
    await log('today2', today(), 45);
    await log('yesterday', shiftDay(today(), -1), 120);
    await log('lastWeek', shiftDay(today(), -8), 15);
    await log('old', shiftDay(today(), -40), 60);
    await log('toVoid', shiftDay(today(), -1), 999);
    expect((await aa.void(firm.caseOn.id, ids.toVoid!)).status).toBe(200);
    // A running timer is not time yet.
    expect((await aa.start(firm.caseOn.id, { description: 'en curso' })).status).toBe(201);
    // One logged more than a day ago, so its correction window is closed.
    await migration.query(`UPDATE time_entry SET logged_at = now() - interval '25 hours' WHERE id = $1`, [ids.old]);
  });

  afterAll(async () => {
    await migration?.end();
    await app?.close();
  });

  const sheet = (from: string, to: string) => timeCall(app, firm.aa, firm.tenantId).timesheet(from, to);

  it('lists [from, to) by Mexico City day, newest day first, newest logged first within a day', async () => {
    const response = await sheet(shiftDay(today(), -1), shiftDay(today(), 1));
    expect(response.status).toBe(200);
    const items = response.body.items as Listed[];
    expect(items.map((i) => i.id)).toEqual([ids.today2, ids.today1, ids.yesterday]);
    const excludesEnd = await sheet(shiftDay(today(), -1), today());
    expect((excludesEnd.body.items as Listed[]).map((i) => i.id)).toEqual([ids.yesterday]);
  });

  it('voided entries and running timers are not time', async () => {
    const response = await sheet(shiftDay(today(), -61), shiftDay(today(), 1));
    const listed = (response.body.items as Listed[]).map((i) => i.id);
    expect(listed).not.toContain(ids.toVoid);
    expect(listed).toHaveLength(5);
  });

  it('the totals are the sums of exactly the listed rows (SC-003)', async () => {
    for (const [from, to] of [
      [shiftDay(today(), -61), shiftDay(today(), 1)],
      [shiftDay(today(), -1), shiftDay(today(), 1)],
      [shiftDay(today(), -10), shiftDay(today(), -5)],
      [shiftDay(today(), 5), shiftDay(today(), 10)],
    ] as const) {
      const response = await sheet(from, to);
      const items = response.body.items as Listed[];
      const sum = items.reduce((s, i) => s + i.minutes, 0);
      expect(response.body.totalMinutes).toBe(sum);
      const days = response.body.days as { date: string; minutes: number }[];
      expect(days.reduce((s, d) => s + d.minutes, 0)).toBe(sum);
      for (const d of days) {
        expect(d.minutes).toBe(items.filter((i) => i.workDate === d.date).reduce((s, i) => s + i.minutes, 0));
      }
    }
    const all = await sheet(shiftDay(today(), -61), shiftDay(today(), 1));
    expect(all.body.totalMinutes).toBe(30 + 45 + 120 + 15 + 60);
  });

  it('correctableUntil is an instant for a fresh entry and null once the window has closed (FR-015)', async () => {
    const response = await sheet(shiftDay(today(), -61), shiftDay(today(), 1));
    const byId = new Map((response.body.items as Listed[]).map((i) => [i.id, i]));
    const fresh = byId.get(ids.today1!)!;
    expect(Date.parse(fresh.correctableUntil!) - Date.parse(fresh.loggedAt)).toBe(24 * 3_600_000);
    expect(byId.get(ids.old!)!.correctableUntil).toBeNull();
  });

  it.each([
    ['more than 62 days', () => [shiftDay(today(), -63), today()]],
    ['a reversed range', () => [today(), shiftDay(today(), -1)]],
    ['an empty range', () => [today(), today()]],
    ['a malformed date', () => ['hoy', today()]],
  ])('refuses %s with 400', async (_label, range) => {
    const [from, to] = range() as [string, string];
    expect((await sheet(from, to)).status).toBe(400);
  });

  it('BM and SA are refused (403)', async () => {
    for (const actor of [firm.bm, firm.sa]) {
      expect((await timeCall(app, actor, firm.tenantId).timesheet(today(), shiftDay(today(), 1))).status).toBe(403);
    }
  });
});
