/**
 * T084 / contracts/platform-admin.md — `GET /internal/platform/audit` is the
 * cross-tenant counterpart of the tenant-facing audit read: same query grammar,
 * but results may span tenants and `tenantId` is an accepted filter rather than
 * being implicit.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { connectAs } from '../helpers/db';
import { createPlatformApp } from '../helpers/platform-app';
import { closePlatformDb } from '../../src/common/db/platform-client';
import { seededTenantIds, type SeededTenants } from '../helpers/tenants';

interface AuditEventItem {
  readonly metadata?: { readonly marker?: string };
}

describe('GET /internal/platform/audit', () => {
  let app: INestApplication;
  let platform: Client;
  let tenants: SeededTenants;
  let markerA: string;
  let markerB: string;

  beforeAll(async () => {
    tenants = await seededTenantIds();
    platform = await connectAs('platform');
    app = await createPlatformApp();

    markerA = `platform-a-${Math.random().toString(36).slice(2)}`;
    markerB = `platform-b-${Math.random().toString(36).slice(2)}`;

    for (const [tenantId, marker] of [
      [tenants.a, markerA],
      [tenants.b, markerB],
    ] as const) {
      await platform.query(
        `INSERT INTO audit_event (tenant_id, action, target_entity, target_id, source, metadata)
         VALUES ($1, 'tenant.plan_changed', 'tenant', $1, '{"channel":"interactive"}'::jsonb, $2::jsonb)`,
        [tenantId, JSON.stringify({ marker })],
      );
    }
  });

  afterAll(async () => {
    await app.close();
    await platform.end();
    await closePlatformDb();
  });

  const markersIn = (items: readonly AuditEventItem[]): string[] =>
    items.map((item) => item.metadata?.marker).filter((m): m is string => typeof m === 'string');

  it('spans tenants when no tenantId filter is given', async () => {
    const response = await request(app.getHttpServer())
      .get('/internal/platform/audit')
      .query({ limit: 200 });

    expect(response.status).toBe(200);
    const marks = markersIn(response.body.items as AuditEventItem[]);
    expect(marks).toContain(markerA);
    expect(marks).toContain(markerB);
  });

  it('scopes to one tenant when tenantId is given', async () => {
    const response = await request(app.getHttpServer())
      .get('/internal/platform/audit')
      .query({ tenantId: tenants.a, limit: 200 });

    expect(response.status).toBe(200);
    const marks = markersIn(response.body.items as AuditEventItem[]);
    expect(marks).toContain(markerA);
    expect(marks).not.toContain(markerB);
  });
});
