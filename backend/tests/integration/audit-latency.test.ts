/**
 * T104 / SC-010 — the first page of an audit query, over the full retained
 * history, answers in under three seconds. Monthly partitioning (research.md D7)
 * is what makes this reachable as history grows: a time-bounded query only scans
 * the partitions the window actually touches, not every row the tenant has ever
 * accumulated.
 *
 * The seeded volume here is a meaningful stress case, not a literal 24-month
 * production-scale corpus — that would make this test itself impractically slow
 * to set up. The point is the same either way: a query bounded to a recent window
 * must stay fast regardless of how much OLDER history exists in other partitions.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { connectAs } from '../helpers/db';
import { createTenantApp } from '../helpers/tenant-app';
import { closeAppDb } from '../../src/common/db/client';
import { IDENTITY_SINGLE, membershipFixtures, seededTenantIds, type SeededTenants } from '../helpers/tenants';

describe('GET /audit/events — SC-010 latency', () => {
  let app: INestApplication;
  let platform: Client;
  let tenants: SeededTenants;

  beforeAll(async () => {
    tenants = await seededTenantIds();
    platform = await connectAs('platform');
    app = await createTenantApp(membershipFixtures(tenants));

    // Bulk-generate rows spread across the last 20 months for tenant A, so most of
    // the volume sits in partitions a recent-window query should never touch.
    await platform.query(
      `INSERT INTO audit_event (tenant_id, occurred_at, action, target_entity, target_id, source, metadata)
       SELECT $1,
              now() - (gs || ' hours')::interval,
              'tenant.plan_changed',
              'tenant',
              $1,
              '{"channel":"interactive"}'::jsonb,
              jsonb_build_object('bulk', true, 'n', gs)
         FROM generate_series(1, 15000) AS gs`,
      [tenants.a],
    );
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await platform.end();
    await closeAppDb();
  });

  it('answers the first page of a recent-window query in under 3 seconds', async () => {
    const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // last 24h

    const started = performance.now();
    const response = await request(app.getHttpServer())
      .get('/audit/events')
      .query({ from })
      .set('x-identity-id', IDENTITY_SINGLE.id)
      .set('x-tenant-id', tenants.a);
    const elapsedMs = performance.now() - started;

    expect(response.status).toBe(200);
    expect(elapsedMs).toBeLessThan(3000);
  });
});
