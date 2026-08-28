/**
 * T029 — 006/FR-021, SC-009. quickstart.md Scenario 2, last row.
 *
 * A tenant provisioned through the real platform route receives all three case catalogs on
 * the SAME transaction that already writes its position catalog. Not a second provisioning
 * mechanism — an extension of the one 001 built and 017 already extended.
 *
 * The `venue` assertion is the interesting one: it is deliberately EMPTY, and that is a
 * decision rather than an omission (research.md D7). A firm's courts depend on its
 * jurisdiction, and any list this product shipped would be wrong for most firms and a
 * statement about where they practise.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createPlatformApp } from '../helpers/platform-app';
import { closePlatformDb } from '../../src/common/db/platform-client';
import { connectAs } from '../helpers/db';
import { uniqueRfc } from '../helpers/rfc';
import {
  DEFAULT_CASE_STATUSES,
  DEFAULT_MATTER_TYPES,
  DEFAULT_VENUES,
} from '../../src/modules/case-core/catalogs/case-catalog.seed';

describe('provisioning seeds the three case catalogs', () => {
  let app: INestApplication;
  let migration: Client;
  let tenantId: string;

  beforeAll(async () => {
    app = await createPlatformApp();
    migration = await connectAs('migration');

    const provisioned = await request(app.getHttpServer())
      .post('/internal/platform/tenants')
      .send({ name: `CC Aprovisionada ${Date.now()}, S.C.`, rfc: uniqueRfc(), planCode: 'esencial' });

    expect(provisioned.status).toBe(201);
    tenantId = provisioned.body.id as string;
  });

  afterAll(async () => {
    await migration.end();
    await closePlatformDb();
    await app.close();
  });

  const namesIn = async (table: string): Promise<string[]> => {
    const { rows } = await migration.query<{ name: string }>(
      `SELECT name FROM ${table} WHERE tenant_id = $1 ORDER BY name`,
      [tenantId],
    );
    return rows.map((r) => r.name);
  };

  it('SC-009 — the case-status catalog is present, with 0 manual setup steps', async () => {
    expect((await namesIn('case_status')).sort()).toEqual(
      DEFAULT_CASE_STATUSES.map((s) => s.name).sort(),
    );
  });

  it('the seeded closing status carries is_closing, so closure works from day one', async () => {
    const { rows } = await migration.query<{ name: string; is_closing: boolean }>(
      `SELECT name, is_closing FROM case_status WHERE tenant_id = $1 AND is_closing = true`,
      [tenantId],
    );

    // A firm that changes nothing still gets correct closing dates (FR-008a, SC-008b).
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe('Concluido');
  });

  it('the matter-type catalog is present', async () => {
    expect((await namesIn('matter_type')).sort()).toEqual([...DEFAULT_MATTER_TYPES].sort());
  });

  it('the venue catalog is EMPTY, deliberately', async () => {
    expect(DEFAULT_VENUES).toHaveLength(0);
    expect(await namesIn('venue')).toEqual([]);

    // And a case can still be opened without it — `venue` is optional (FR-005), so the
    // empty catalog blocks nothing on day one.
    const { rows: statusRows } = await migration.query<{ id: string }>(
      `SELECT id FROM case_status WHERE tenant_id = $1 LIMIT 1`,
      [tenantId],
    );
    const { rows: clientRows } = await migration.query<{ id: string }>(
      `INSERT INTO client (tenant_id, kind, legal_name) VALUES ($1, 'person', 'Sin Foro') RETURNING id`,
      [tenantId],
    );
    const { rows: caseRows } = await migration.query<{ id: string }>(
      `INSERT INTO case_file (tenant_id, client_id, file_number, case_status_id)
       VALUES ($1, $2, 'EXP-SIN-FORO', $3) RETURNING id`,
      [tenantId, clientRows[0]!.id, statusRows[0]!.id],
    );
    expect(caseRows).toHaveLength(1);
  });

  it('the position catalog 017 seeds is untouched — one provisioning, four catalogs', async () => {
    // FR-021's actual claim: a tenant provisioned after this slice receives all four
    // through ONE operation. If 006's seed had replaced rather than extended the
    // transaction, this is what would have gone missing.
    expect((await namesIn('position')).length).toBe(5);
  });
});
