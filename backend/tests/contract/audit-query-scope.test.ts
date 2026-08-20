/**
 * T079 / quickstart V9 / SC-007 — `GET /audit/events` returns only the caller's own
 * tenant's events, never another's — zero foreign events across scenarios, whichever
 * tenant is calling and whichever filter is applied.
 *
 * Entries are seeded with a marker in `metadata` so the response can be checked
 * against a known set rather than merely "not empty" or "not too long" — the same
 * discipline V3 uses for unfiltered reads.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { connectAs } from '../helpers/db';
import { createTenantApp } from '../helpers/tenant-app';
import { closeAppDb } from '../../src/common/db/client';
import {
  IDENTITY_SINGLE,
  membershipFixtures,
  seededTenantIds,
  type SeededTenants,
} from '../helpers/tenants';
import type { MembershipRecord } from '../../src/common/tenant/membership';

/**
 * Local to this test file only. `membershipFixtures` carries no SA membership in
 * tenant B, so an SA identity is added here rather than in the shared fixtures —
 * this scope check is the only place that needs to query the log as tenant B.
 */
const IDENTITY_SA_IN_B = '55555555-5555-4555-8555-555555555555';

interface AuditEventItem {
  readonly metadata?: { readonly marker?: string };
}

describe('GET /audit/events — tenant scope', () => {
  let app: INestApplication;
  let platform: Client;
  let tenants: SeededTenants;
  let markerA: string;
  let markerB: string;

  beforeAll(async () => {
    tenants = await seededTenantIds();
    platform = await connectAs('platform');

    markerA = `scope-a-${Math.random().toString(36).slice(2)}`;
    markerB = `scope-b-${Math.random().toString(36).slice(2)}`;

    // Two distinguishable entries per tenant, inserted directly — the audit query
    // read is under test here, not the append path other tests already cover.
    for (const [tenantId, marker] of [
      [tenants.a, markerA],
      [tenants.b, markerB],
    ] as const) {
      for (let i = 0; i < 2; i += 1) {
        await platform.query(
          `INSERT INTO audit_event (tenant_id, action, target_entity, target_id, source, metadata)
           VALUES ($1, 'tenant.plan_changed', 'tenant', $1, '{"channel":"interactive"}'::jsonb, $2::jsonb)`,
          [tenantId, JSON.stringify({ marker })],
        );
      }
    }

    const memberships: readonly MembershipRecord[] = [
      ...membershipFixtures(tenants),
      {
        id: '66666666-6666-4666-8666-666666666666',
        identityId: IDENTITY_SA_IN_B,
        tenantId: tenants.b,
        archetype: 'SA',
        status: 'live',
      },
    ];
    app = await createTenantApp(memberships);
  });

  afterAll(async () => {
    await app.close();
    await platform.end();
    await closeAppDb();
  });

  const markersIn = (items: readonly AuditEventItem[]): string[] =>
    items.map((item) => item.metadata?.marker).filter((m): m is string => typeof m === 'string');

  it('returns tenant A’s own events and none of tenant B’s', async () => {
    const response = await request(app.getHttpServer())
      .get('/audit/events')
      .query({ limit: 200 })
      .set('x-identity-id', IDENTITY_SINGLE.id)
      .set('x-tenant-id', tenants.a);

    expect(response.status).toBe(200);
    const marks = markersIn(response.body.items as AuditEventItem[]);
    expect(marks.filter((m) => m === markerA)).toHaveLength(2);
    expect(marks).not.toContain(markerB);
  });

  it('returns tenant B’s own events and none of tenant A’s', async () => {
    const response = await request(app.getHttpServer())
      .get('/audit/events')
      .query({ limit: 200 })
      .set('x-identity-id', IDENTITY_SA_IN_B)
      .set('x-tenant-id', tenants.b);

    expect(response.status).toBe(200);
    const marks = markersIn(response.body.items as AuditEventItem[]);
    expect(marks.filter((m) => m === markerB)).toHaveLength(2);
    expect(marks).not.toContain(markerA);
  });

  it('stays scoped when a filter matches an action present in both tenants', async () => {
    // Same action on both sides. If scoping only happened to fall out of an
    // unfiltered read, a shared filter is exactly what would expose the gap.
    const response = await request(app.getHttpServer())
      .get('/audit/events')
      .query({ action: 'tenant.plan_changed', limit: 200 })
      .set('x-identity-id', IDENTITY_SINGLE.id)
      .set('x-tenant-id', tenants.a);

    expect(response.status).toBe(200);
    const marks = markersIn(response.body.items as AuditEventItem[]);
    expect(marks).toContain(markerA);
    expect(marks).not.toContain(markerB);
  });
});
