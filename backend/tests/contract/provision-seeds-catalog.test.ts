/**
 * T033 — 017/FR-009, SC-008 on the PRODUCTION provisioning path.
 *
 * `tests/integration/directory-seed.test.ts` (T010) covers the dev/CI seed:
 * `drizzle/seed.ts` gives the tenants it creates a default catalog. This suite covers
 * the other half, which that one cannot see — a tenant provisioned through
 * `POST /internal/platform/tenants`, the path a real firm is actually created by.
 *
 * SC-008's bar is "0 manual setup steps required before the first assignment", so the
 * catalog is read back the way a real first administrator would read it — through
 * `GET /tenant/directory/positions`, as a member of the brand-new tenant — rather than
 * by looking directly at the table. A test that only checked the rows exist would pass
 * even if the tenant could not reach them.
 *
 * The second half of the suite is the containment half: `0016`'s discipline is that a
 * platform extension buys exactly one operation and nothing else, so the platform role
 * seeding a catalog must remain unable to read, edit or remove one.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createRealApp } from '../helpers/real-app';
import { connectAs } from '../helpers/db';
import { uniqueRfc } from '../helpers/rfc';
import { DEFAULT_POSITION_CATALOG } from '../../src/modules/directory/position-catalog.seed';

let unique = 0;
const nextSuffix = (): string => `${Date.now()}-${(unique += 1)}`;

describe('a tenant provisioned through the platform path starts with its catalog', () => {
  let app: INestApplication;
  let migration: Client;
  let platform: Client;

  beforeAll(async () => {
    app = await createRealApp();
    migration = await connectAs('migration');
    platform = await connectAs('platform');
  });

  afterAll(async () => {
    await migration.end();
    await platform.end();
    await app.close();
  });

  /** A real, live member of `tenantId`, so the catalog can be read as a firm reads it. */
  async function firstAdministrator(tenantId: string): Promise<string> {
    const suffix = nextSuffix();
    const identity = await migration.query<{ id: string }>(
      `INSERT INTO identity (subject, email, mfa_enrolled_at)
       VALUES ($1, $2, now()) RETURNING id`,
      [`idp|t033-${suffix}`, `t033-${suffix}@example.com`],
    );
    const identityId = identity.rows[0]!.id;
    await migration.query(
      `INSERT INTO membership (identity_id, tenant_id, archetype) VALUES ($1, $2, 'SA')`,
      [identityId, tenantId],
    );
    return identityId;
  }

  async function provision(name: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/internal/platform/tenants')
      .send({ name, rfc: uniqueRfc(), planCode: 'esencial' });
    expect(response.status).toBe(201);
    return response.body.id as string;
  }

  it('SC-008 — its catalog reads the 5-entry default seed, with 0 setup steps in between', async () => {
    const tenantId = await provision(`T033 Recien Provisionada ${nextSuffix()}, S.C.`);
    const identityId = await firstAdministrator(tenantId);

    const listed = await request(app.getHttpServer())
      .get('/tenant/directory/positions')
      .set('x-identity-id', identityId)
      .set('x-tenant-id', tenantId);

    expect(listed.status).toBe(200);
    const items = listed.body.items as ReadonlyArray<{ name: string; status: string }>;
    expect(items.map((i) => i.name).sort()).toEqual([...DEFAULT_POSITION_CATALOG].sort());
    expect(items.every((i) => i.status === 'active')).toBe(true);
  });

  it('FR-009 — those entries are immediately editable and immediately assignable', async () => {
    const tenantId = await provision(`T033 Editable ${nextSuffix()}, S.C.`);
    const identityId = await firstAdministrator(tenantId);

    const listed = await request(app.getHttpServer())
      .get('/tenant/directory/positions')
      .set('x-identity-id', identityId)
      .set('x-tenant-id', tenantId);
    const socio = (listed.body.items as { id: string; name: string }[]).find(
      (i) => i.name === 'Socio',
    )!;
    expect(socio).toBeDefined();

    // Assignable to a real membership of the new tenant, with no prior catalog work.
    const memberIdentity = await firstAdministrator(tenantId);
    const membership = await migration.query<{ id: string }>(
      `SELECT id FROM membership WHERE identity_id = $1 AND tenant_id = $2`,
      [memberIdentity, tenantId],
    );
    const assigned = await request(app.getHttpServer())
      .patch(`/tenant/directory/entries/${membership.rows[0]!.id}/position`)
      .set('x-identity-id', identityId)
      .set('x-tenant-id', tenantId)
      .send({ positionId: socio.id });
    expect(assigned.status).toBe(200);
    expect(assigned.body.positionName).toBe('Socio');

    // Editable: retire one of the seeded entries, add one of the firm's own.
    const retired = await request(app.getHttpServer())
      .patch(`/tenant/directory/positions/${socio.id}/retire`)
      .set('x-identity-id', identityId)
      .set('x-tenant-id', tenantId)
      .send();
    expect(retired.status).toBe(200);

    const added = await request(app.getHttpServer())
      .post('/tenant/directory/positions')
      .set('x-identity-id', identityId)
      .set('x-tenant-id', tenantId)
      .send({ name: `Socio Fundador ${nextSuffix()}` });
    expect(added.status).toBe(201);
  });

  it('each provisioned tenant gets its OWN copy, isolated from every other (FR-006)', async () => {
    const first = await provision(`T033 Aislada Uno ${nextSuffix()}, S.C.`);
    const second = await provision(`T033 Aislada Dos ${nextSuffix()}, S.C.`);

    const { rows } = await migration.query<{ tenant_id: string; n: string }>(
      `SELECT tenant_id, count(*)::text AS n FROM position
        WHERE tenant_id = ANY($1::uuid[]) GROUP BY tenant_id`,
      [[first, second]],
    );
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(Number(row.n)).toBe(DEFAULT_POSITION_CATALOG.length);

    // Distinct rows, not shared ones — the seed is real per-tenant data, never a
    // product-wide constant read back at request time (research.md D2).
    const ids = await migration.query<{ id: string }>(
      `SELECT id FROM position WHERE tenant_id = ANY($1::uuid[])`,
      [[first, second]],
    );
    expect(new Set(ids.rows.map((r) => r.id)).size).toBe(DEFAULT_POSITION_CATALOG.length * 2);
  });

  it('0016\'s discipline holds — the platform role may seed a catalog and nothing else', async () => {
    const tenantId = await provision(`T033 Contencion ${nextSuffix()}, S.C.`);

    // No SELECT: it cannot read back even the catalog it just wrote.
    await expect(platform.query('SELECT id FROM position')).rejects.toThrow(/permission denied/i);

    // No UPDATE: it cannot retire, rename or otherwise edit a firm's catalog.
    await expect(
      platform.query(`UPDATE position SET status = 'retired' WHERE tenant_id = $1`, [tenantId]),
    ).rejects.toThrow(/permission denied/i);

    // No DELETE: FR-007's "never hard-deleted" holds for this role too.
    await expect(
      platform.query(`DELETE FROM position WHERE tenant_id = $1`, [tenantId]),
    ).rejects.toThrow(/permission denied/i);

    // And nothing at all on directory_entry — seeding a catalog is not a licence to
    // touch who holds what.
    await expect(platform.query('SELECT id FROM directory_entry')).rejects.toThrow(
      /permission denied/i,
    );
    await expect(
      platform.query(
        `INSERT INTO directory_entry (membership_id, tenant_id) VALUES (gen_random_uuid(), $1)`,
        [tenantId],
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('the seeding policy refuses a pre-retired row — the platform role seeds active entries only', async () => {
    const tenantId = await provision(`T033 Politica ${nextSuffix()}, S.C.`);

    // The WITH CHECK predicate, exercised directly: an INSERT the grant permits but
    // the policy does not. Refused by RLS, not by application code.
    await expect(
      platform.query(
        `INSERT INTO position (tenant_id, name, status, retired_at)
         VALUES ($1, 'Rango Nacido Retirado', 'retired', now())`,
        [tenantId],
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});
