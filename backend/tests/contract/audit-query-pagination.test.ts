/**
 * T083 / FR-013 / US4 scenario 4 — results are returned in bounded portions with a
 * working forward cursor, and a `limit` beyond the maximum is rejected.
 */
import { randomUUID } from 'node:crypto';
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

interface Page {
  readonly items: readonly AuditEventItem[];
  readonly nextCursor: string | null;
}

describe('GET /audit/events — pagination', () => {
  let app: INestApplication;
  let platform: Client;
  let tenants: SeededTenants;
  let markers: string[];
  let targetId: string;

  beforeAll(async () => {
    tenants = await seededTenantIds();
    platform = await connectAs('platform');
    app = await createTenantApp(membershipFixtures(tenants));

    const runId = Math.random().toString(36).slice(2);
    markers = Array.from({ length: 5 }, (_, i) => `page-${runId}-${i}`);
    // A dedicated target id, filtered on below, so pagination walks exactly these 5
    // rows rather than the tenant's entire (ever-growing, across every other test
    // file's fixtures) history.
    targetId = randomUUID();

    // Spaced a second apart so ordering is deterministic and no two entries can land
    // on the exact same (occurred_at, id) pagination boundary by coincidence.
    for (const [i, marker] of markers.entries()) {
      await platform.query(
        `INSERT INTO audit_event (tenant_id, occurred_at, action, target_entity, target_id, source, metadata)
         VALUES ($1, now() - ($2 || ' seconds')::interval, 'tenant.plan_changed', 'tenant', $3,
                 '{"channel":"interactive"}'::jsonb, $4::jsonb)`,
        [tenants.a, String(i), targetId, JSON.stringify({ marker })],
      );
    }
  });

  afterAll(async () => {
    await app.close();
    await platform.end();
    await closeAppDb();
  });

  const asA = () => ({ 'x-identity-id': IDENTITY_SINGLE.id, 'x-tenant-id': tenants.a });

  const markersOf = (page: Page): string[] =>
    page.items.map((item) => item.metadata?.marker).filter((m): m is string => typeof m === 'string');

  it('returns bounded pages, and walking the cursor recovers every seeded entry exactly once', async () => {
    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;

    do {
      const response = await request(app.getHttpServer())
        .get('/audit/events')
        .query({ limit: 2, targetId, ...(cursor ? { cursor } : {}) })
        .set(asA());

      expect(response.status).toBe(200);
      const page = response.body as Page;
      expect(page.items.length).toBeLessThanOrEqual(2);

      seen.push(...markersOf(page));
      cursor = page.nextCursor ?? undefined;
      pages += 1;
      expect(pages).toBeLessThan(10); // guards against an infinite loop on a broken cursor
    } while (cursor);

    expect(seen).toHaveLength(markers.length);
    expect(new Set(seen)).toEqual(new Set(markers)); // no duplicate, nothing foreign, nothing missing
  });

  it('rejects a limit beyond the maximum', async () => {
    const response = await request(app.getHttpServer())
      .get('/audit/events')
      .query({ limit: 201 })
      .set(asA());

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { code: 'validation_failed' } });
  });

  it('accepts the maximum limit exactly', async () => {
    const response = await request(app.getHttpServer())
      .get('/audit/events')
      .query({ limit: 200 })
      .set(asA());

    expect(response.status).toBe(200);
  });
});
