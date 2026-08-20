/**
 * T081 / quickstart V9 / FR-025 / SC-015 — reading the audit log records the read,
 * but only when a person did it. Both directions asserted, the same discipline as
 * registry-read-channel.test.ts: checking only the automated half would pass against
 * an implementation that stopped recording reads altogether, which breaks FR-014;
 * checking only the interactive half would miss the unbounded-growth problem the
 * gate exists to prevent.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { connectAs } from '../helpers/db';
import { createTenantApp } from '../helpers/tenant-app';
import { closeAppDb } from '../../src/common/db/client';
import { IDENTITY_SINGLE, membershipFixtures, seededTenantIds, type SeededTenants } from '../helpers/tenants';

describe('GET /audit/events — channel gating', () => {
  let app: INestApplication;
  let platform: Client;
  let tenants: SeededTenants;

  beforeAll(async () => {
    tenants = await seededTenantIds();
    platform = await connectAs('platform');
    app = await createTenantApp(membershipFixtures(tenants));
  });

  afterAll(async () => {
    await app.close();
    await platform.end();
    await closeAppDb();
  });

  const countQueried = async (): Promise<number> => {
    const { rows } = await platform.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM audit_event WHERE tenant_id = $1 AND action = 'audit.queried'`,
      [tenants.a],
    );
    return Number(rows[0]!.n);
  };

  const asA = () => ({ 'x-identity-id': IDENTITY_SINGLE.id, 'x-tenant-id': tenants.a });

  it('records exactly one entry for an interactive read', async () => {
    const before = await countQueried();

    const response = await request(app.getHttpServer())
      .get('/audit/events')
      .set({ ...asA(), 'x-channel': 'interactive' });
    expect(response.status).toBe(200);

    expect(await countQueried()).toBe(before + 1);
  });

  it('records nothing for an automated read', async () => {
    const before = await countQueried();

    const response = await request(app.getHttpServer())
      .get('/audit/events')
      .set({ ...asA(), 'x-channel': 'automated' });
    expect(response.status).toBe(200);

    expect(await countQueried()).toBe(before);
  });

  it('stays silent across a burst of automated polls', async () => {
    // The scenario the gate exists for: a monitoring job must not grow the log it
    // is watching, which would otherwise compound without bound.
    const before = await countQueried();

    for (let i = 0; i < 8; i += 1) {
      await request(app.getHttpServer())
        .get('/audit/events')
        .set({ ...asA(), 'x-channel': 'automated' });
    }

    expect(await countQueried()).toBe(before);
  });

  it('treats an absent channel header as interactive', async () => {
    // Over-recording is the safe direction: a missing entry is the failure
    // Principle V cannot tolerate, and volume is bounded by retention.
    const before = await countQueried();
    await request(app.getHttpServer()).get('/audit/events').set(asA());
    expect(await countQueried()).toBe(before + 1);
  });
});
