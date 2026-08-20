/**
 * T082 / quickstart V9 / US4 scenario 5 / FR-019 / SC-013 — `from`/`to` are clamped
 * to the 24-month retention window, the response reports the window actually
 * served, and no entry older than the window is ever returned.
 *
 * A `from` older than the window is silently clamped rather than rejected — a
 * caller asking for three years gets two years plus an explicit statement of that,
 * per contracts/audit-query.md.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { connectAs } from '../helpers/db';
import { createTenantApp } from '../helpers/tenant-app';
import { closeAppDb } from '../../src/common/db/client';
import { IDENTITY_SINGLE, membershipFixtures, seededTenantIds, type SeededTenants } from '../helpers/tenants';

interface AuditEventItem {
  readonly metadata?: { readonly marker?: string };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Mirrors the 24-month boundary the implementation is expected to compute. */
function twentyFourMonthsAgo(): Date {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - 24);
  return d;
}

describe('GET /audit/events — retention window clamp', () => {
  let app: INestApplication;
  let platform: Client;
  let tenants: SeededTenants;
  let markerRecent: string;
  let markerOld: string;

  beforeAll(async () => {
    tenants = await seededTenantIds();
    platform = await connectAs('platform');
    app = await createTenantApp(membershipFixtures(tenants));

    markerRecent = `window-recent-${Math.random().toString(36).slice(2)}`;
    markerOld = `window-old-${Math.random().toString(36).slice(2)}`;

    await platform.query(
      `INSERT INTO audit_event (tenant_id, occurred_at, action, target_entity, target_id, source, metadata)
       VALUES ($1, now(), 'tenant.plan_changed', 'tenant', $1, '{"channel":"interactive"}'::jsonb, $2::jsonb)`,
      [tenants.a, JSON.stringify({ marker: markerRecent })],
    );
    // 25 months back: outside the 24-month window. Ensured explicitly rather than
    // assumed from the initial migration's partition set — audit-retention.test.ts
    // legitimately drops anything past the 24-month cutoff, including that one, so
    // relying on it surviving would make this test's outcome depend on file order.
    await platform.query('SELECT audit_event_ensure_partition((now() - interval \'25 months\')::date)');
    await platform.query(
      `INSERT INTO audit_event (tenant_id, occurred_at, action, target_entity, target_id, source, metadata)
       VALUES ($1, now() - interval '25 months', 'tenant.plan_changed', 'tenant', $1, '{"channel":"interactive"}'::jsonb, $2::jsonb)`,
      [tenants.a, JSON.stringify({ marker: markerOld })],
    );
  });

  afterAll(async () => {
    await app.close();
    await platform.end();
    await closeAppDb();
  });

  const asA = () => ({ 'x-identity-id': IDENTITY_SINGLE.id, 'x-tenant-id': tenants.a });

  const markersIn = (items: readonly AuditEventItem[]): string[] =>
    items.map((item) => item.metadata?.marker).filter((m): m is string => typeof m === 'string');

  it('excludes an entry older than 24 months from the default window', async () => {
    const response = await request(app.getHttpServer())
      .get('/audit/events')
      .query({ limit: 200 })
      .set(asA());

    expect(response.status).toBe(200);
    const marks = markersIn(response.body.items as AuditEventItem[]);
    expect(marks).toContain(markerRecent);
    expect(marks).not.toContain(markerOld);
  });

  it('reports the window actually served, clamped to roughly 24 months', async () => {
    const response = await request(app.getHttpServer()).get('/audit/events').set(asA());

    expect(response.status).toBe(200);
    const { servedWindow } = response.body as {
      servedWindow: { from: string; to: string };
    };
    expect(servedWindow).toBeTruthy();

    const from = new Date(servedWindow.from).getTime();
    const to = new Date(servedWindow.to).getTime();
    expect(Math.abs(to - Date.now())).toBeLessThan(DAY_MS);
    expect(Math.abs(from - twentyFourMonthsAgo().getTime())).toBeLessThan(DAY_MS);
  });

  it('clamps an explicit "from" older than the window rather than rejecting it', async () => {
    const threeYearsAgo = new Date(Date.now() - 3 * 365 * DAY_MS).toISOString();

    const response = await request(app.getHttpServer())
      .get('/audit/events')
      .query({ from: threeYearsAgo, limit: 200 })
      .set(asA());

    expect(response.status).toBe(200);
    const marks = markersIn(response.body.items as AuditEventItem[]);
    expect(marks).toContain(markerRecent);
    expect(marks).not.toContain(markerOld);

    const { servedWindow } = response.body as { servedWindow: { from: string } };
    const servedFrom = new Date(servedWindow.from).getTime();
    expect(servedFrom).toBeGreaterThan(new Date(threeYearsAgo).getTime());
    expect(Math.abs(servedFrom - twentyFourMonthsAgo().getTime())).toBeLessThan(DAY_MS);
  });
});
