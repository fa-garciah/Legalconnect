/**
 * Shared fixtures for 009's suites: a firm with every archetype, a matter the AA, PL and CM are on
 * (`caseOn`), one nobody but MP reaches (`caseOff`), and a client for the eight routes.
 *
 * Matters and assignments go through the real API (as `calendar.ts` does), so the assignment rows
 * are exactly the ones 006's resolver reads in production.
 */
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { uniqueRfc } from './rfc';
import { makeCaseFirm, nextSuffix, uniqueName, type Actor, type CaseFirm } from './case-core';

export interface TimeFirm extends CaseFirm {
  readonly caseOn: { readonly id: string; readonly fileNumber: string };
  readonly caseOff: { readonly id: string; readonly fileNumber: string };
}

export async function makeTimeFirm(app: INestApplication, migration: Client, label: string): Promise<TimeFirm> {
  const firm = await makeCaseFirm(migration, `${label} ${nextSuffix()}`, uniqueRfc());
  const client = await migration.query<{ id: string }>(
    `INSERT INTO client (tenant_id, kind, legal_name) VALUES ($1, 'organization', $2) RETURNING id`,
    [firm.tenantId, uniqueName('Cliente Horas')],
  );
  const asMp = (r: request.Test) => r.set('x-identity-id', firm.mp.identityId).set('x-tenant-id', firm.tenantId);
  const open = async (fileNumber: string) => {
    const response = await asMp(request(app.getHttpServer()).post('/tenant/cases')).send({
      clientId: client.rows[0]!.id,
      fileNumber,
      caseStatusId: firm.statusOpenId,
    });
    if (response.status !== 201) throw new Error(`case not created: ${response.status}`);
    return { id: response.body.id as string, fileNumber };
  };
  const caseOn = await open(uniqueName('EXP-HRS-ON'));
  const caseOff = await open(uniqueName('EXP-HRS-OFF'));
  for (const [member, role] of [
    [firm.aa, 'lead'],
    [firm.pl, 'collaborator'],
    [firm.cm, 'collaborator'],
  ] as const) {
    const team = await asMp(request(app.getHttpServer()).post(`/tenant/cases/${caseOn.id}/team`)).send({
      membershipId: member.membershipId,
      roleOnCase: role,
    });
    if (team.status !== 201) throw new Error(`team not assigned: ${team.status}`);
  }
  return { ...firm, caseOn, caseOff };
}

/** Takes `member` off `caseId` through the real route, as a case manager would. */
export async function unassign(app: INestApplication, firm: TimeFirm, caseId: string, member: Actor): Promise<void> {
  const response = await request(app.getHttpServer())
    .delete(`/tenant/cases/${caseId}/team/${member.membershipId}`)
    .set('x-identity-id', firm.mp.identityId)
    .set('x-tenant-id', firm.tenantId);
  if (response.status !== 200 && response.status !== 204) throw new Error(`not unassigned: ${response.status}`);
}

export function timeCall(app: INestApplication, actor: Actor, tenantId: string) {
  const server = app.getHttpServer();
  const auth = (r: request.Test) => r.set('x-identity-id', actor.identityId).set('x-tenant-id', tenantId);
  return {
    timesheet: (from: string, to: string) => auth(request(server).get(`/tenant/time-entries?from=${from}&to=${to}`)),
    timer: () => auth(request(server).get('/tenant/time-entries/timer')),
    discard: () => auth(request(server).post('/tenant/time-entries/timer/discard')).send(),
    log: (caseId: string, body: Record<string, unknown>) =>
      auth(request(server).post(`/tenant/cases/${caseId}/time-entries`)).send(body),
    start: (caseId: string, body: Record<string, unknown> = {}) =>
      auth(request(server).post(`/tenant/cases/${caseId}/time-entries/timer`)).send(body),
    stop: (caseId: string, body: Record<string, unknown> = {}) =>
      auth(request(server).post(`/tenant/cases/${caseId}/time-entries/timer/stop`)).send(body),
    correct: (caseId: string, id: string, body: Record<string, unknown>) =>
      auth(request(server).patch(`/tenant/cases/${caseId}/time-entries/${id}`)).send(body),
    void: (caseId: string, id: string) => auth(request(server).post(`/tenant/cases/${caseId}/time-entries/${id}/void`)).send(),
  };
}

/** Today in Mexico City, `YYYY-MM-DD` — the day the server files a manual entry against. */
export function mexicoToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(now);
}

export function shiftDay(day: string, by: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + by);
  return date.toISOString().slice(0, 10);
}

/** The audit rows of one action on one entry, read as the owner (the log is append-only). */
export async function auditOf(migration: Client, action: string, targetId: string) {
  const { rows } = await migration.query<{ metadata: Record<string, unknown> | null }>(
    `SELECT metadata FROM audit_event WHERE action = $1 AND target_id = $2 ORDER BY occurred_at`,
    [action, targetId],
  );
  return rows;
}
