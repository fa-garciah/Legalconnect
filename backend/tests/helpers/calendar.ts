/**
 * Shared fixtures for 013's suites: a firm (every archetype), two cases — one the AA is on, one
 * they are not — and helpers to create events through the real API.
 */
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { uniqueRfc } from './rfc';
import { makeCaseFirm, nextSuffix, uniqueName, type Actor, type CaseFirm } from './case-core';

export interface CalendarFirm extends CaseFirm {
  /** The AA is lead on this case. */
  readonly caseOn: { readonly id: string; readonly fileNumber: string };
  /** Nobody but MP/SA reaches this one. */
  readonly caseOff: { readonly id: string; readonly fileNumber: string };
}

export async function makeCalendarFirm(app: INestApplication, migration: Client, label: string): Promise<CalendarFirm> {
  const firm = await makeCaseFirm(migration, `${label} ${nextSuffix()}`, uniqueRfc());
  const client = await migration.query<{ id: string }>(
    `INSERT INTO client (tenant_id, kind, legal_name) VALUES ($1, 'organization', $2) RETURNING id`,
    [firm.tenantId, uniqueName('Cliente Agenda')],
  );
  const open = async (fileNumber: string) => {
    const response = await request(app.getHttpServer())
      .post('/tenant/cases')
      .set('x-identity-id', firm.mp.identityId)
      .set('x-tenant-id', firm.tenantId)
      .send({ clientId: client.rows[0]!.id, fileNumber, caseStatusId: firm.statusOpenId });
    if (response.status !== 201) throw new Error(`case not created: ${response.status}`);
    return { id: response.body.id as string, fileNumber };
  };
  const caseOn = await open(uniqueName('EXP-ON'));
  const caseOff = await open(uniqueName('EXP-OFF'));
  const team = await request(app.getHttpServer())
    .post(`/tenant/cases/${caseOn.id}/team`)
    .set('x-identity-id', firm.mp.identityId)
    .set('x-tenant-id', firm.tenantId)
    .send({ membershipId: firm.aa.membershipId, roleOnCase: 'lead' });
  if (team.status !== 201) throw new Error(`team not assigned: ${team.status}`);
  return { ...firm, caseOn, caseOff };
}

export function calendarCall(app: INestApplication, actor: Actor, tenantId: string) {
  const server = app.getHttpServer();
  const auth = (r: request.Test) => r.set('x-identity-id', actor.identityId).set('x-tenant-id', tenantId);
  return {
    list: (from: string, to: string, extra = '') => auth(request(server).get(`/tenant/calendar/events?from=${from}&to=${to}${extra}`)),
    reminders: () => auth(request(server).get('/tenant/calendar/reminders')),
    create: (body: Record<string, unknown>) => auth(request(server).post('/tenant/calendar/events')).send(body),
    update: (id: string, body: Record<string, unknown>) => auth(request(server).patch(`/tenant/calendar/events/${id}`)).send(body),
    cancel: (id: string) => auth(request(server).patch(`/tenant/calendar/events/${id}/cancel`)).send(),
  };
}

export const timed = (title: string, startsAt: string, extra: Record<string, unknown> = {}) => ({
  type: 'hearing',
  title,
  allDay: false,
  startsAt,
  ...extra,
});

export const allDay = (title: string, startsOn: string, extra: Record<string, unknown> = {}) => ({
  type: 'deadline',
  title,
  allDay: true,
  startsOn,
  ...extra,
});
