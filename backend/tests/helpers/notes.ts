/**
 * Shared calls for 008's suites. Firms come from `time-entries.ts`'s `makeTimeFirm` — a matter the
 * AA, PL and CM are on (`caseOn`) and one only MP reaches (`caseOff`) — which is exactly the shape
 * notes and activity need.
 */
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Actor } from './case-core';

export function noteCall(app: INestApplication, actor: Actor, tenantId: string, channel?: 'automated') {
  const server = app.getHttpServer();
  const auth = (r: request.Test) => {
    const withIds = r.set('x-identity-id', actor.identityId).set('x-tenant-id', tenantId);
    return channel ? withIds.set('x-channel', channel) : withIds;
  };
  return {
    list: (caseId: string, month?: string) =>
      auth(request(server).get(`/tenant/cases/${caseId}/notes${month ? `?month=${month}` : ''}`)),
    create: (caseId: string, body: Record<string, unknown>) => auth(request(server).post(`/tenant/cases/${caseId}/notes`)).send(body),
    correct: (caseId: string, id: string, body: Record<string, unknown>) =>
      auth(request(server).patch(`/tenant/cases/${caseId}/notes/${id}`)).send(body),
    void: (caseId: string, id: string) => auth(request(server).post(`/tenant/cases/${caseId}/notes/${id}/void`)).send(),
    activity: (caseId: string, month?: string) =>
      auth(request(server).get(`/tenant/cases/${caseId}/activity${month ? `?month=${month}` : ''}`)),
  };
}

/** The current Mexico City month, `YYYY-MM`. */
export function mexicoMonth(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit' })
    .format(now)
    .slice(0, 7);
}
