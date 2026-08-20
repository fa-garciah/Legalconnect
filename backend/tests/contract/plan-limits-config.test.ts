/**
 * T096 / FR-016 / FR-014 — `PATCH .../plans/{code}/limits` adjusts limits with no
 * deployment and records `plan.limits_changed`.
 *
 * The plan catalog is a small, shared, 3-row table other tests read (and this
 * suite's Postgres instance persists between runs, unlike CI's fresh
 * Testcontainers instance) — so the original limits are restored in `afterAll`
 * rather than left mutated for whichever test or run happens next.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { connectAs } from '../helpers/db';
import { createPlatformApp } from '../helpers/platform-app';
import { closePlatformDb } from '../../src/common/db/platform-client';

describe('PATCH /internal/platform/plans/:code/limits', () => {
  let app: INestApplication;
  let platform: Client;
  let originalLimits: unknown;

  beforeAll(async () => {
    app = await createPlatformApp();
    platform = await connectAs('platform');

    const { rows } = await platform.query<{ limits: unknown }>(
      `SELECT limits FROM plan WHERE code = 'esencial'`,
    );
    originalLimits = rows[0]!.limits;
  });

  afterAll(async () => {
    await platform.query(`UPDATE plan SET limits = $1::jsonb WHERE code = 'esencial'`, [
      JSON.stringify(originalLimits),
    ]);
    await app.close();
    await platform.end();
    await closePlatformDb();
  });

  it('adjusts the limits and records plan.limits_changed', async () => {
    const newLimits = { users: 15, storageBytes: 20 * 2 ** 30, monthlyCfdi: 75 };

    const response = await request(app.getHttpServer())
      .patch('/internal/platform/plans/esencial/limits')
      .send({ limits: newLimits });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ code: 'esencial', limits: newLimits });

    const { rows } = await platform.query<{ limits: { users: number } }>(
      `SELECT limits FROM plan WHERE code = 'esencial'`,
    );
    expect(rows[0]!.limits.users).toBe(15);

    const { rows: auditRows } = await platform.query<{
      target_entity: string;
      tenant_id: string | null;
      metadata: { from?: unknown; to?: unknown };
    }>(
      `SELECT * FROM audit_event WHERE action = 'plan.limits_changed' ORDER BY occurred_at DESC LIMIT 1`,
    );
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]!.target_entity).toBe('plan');
    // No single tenant to belong to — the change affects every tenant on this tier.
    expect(auditRows[0]!.tenant_id).toBeNull();
    expect(auditRows[0]!.metadata).toMatchObject({ to: newLimits });
  });

  it('returns 404 for an unknown plan code', async () => {
    const response = await request(app.getHttpServer())
      .patch('/internal/platform/plans/diamante/limits')
      .send({ limits: { users: 1 } });

    expect(response.status).toBe(404);
  });
});
