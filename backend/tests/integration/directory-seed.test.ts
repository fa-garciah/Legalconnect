/**
 * T010 — 017/FR-009, SC-008: a freshly seeded tenant's position catalog already
 * contains the 5-entry default seed (research.md D2), all active.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { connectAs } from '../helpers/db';
import { seededTenantIds, type SeededTenants } from '../helpers/tenants';

const DEFAULT_SEED = ['Socio', 'Asociado Senior', 'Asociado', 'Pasante', 'Paralegal'];

describe('the default position catalog seed', () => {
  let migration: Client;
  let tenants: SeededTenants;

  beforeAll(async () => {
    // position/directory_entry are granted to lc_app only (data-model.md) — neither
    // lc_platform nor a specific tenant context is the right lens for a raw,
    // cross-tenant verification read, so this uses the migration (superuser)
    // connection, the same choice seed.ts itself makes for identity/membership.
    migration = await connectAs('migration');
    tenants = await seededTenantIds();
  });

  afterAll(async () => {
    await migration.end();
  });

  it('tenant A\'s catalog contains exactly the 5 default entries, all active', async () => {
    const { rows } = await migration.query<{ name: string; status: string }>(
      `SELECT name, status FROM position WHERE tenant_id = $1 ORDER BY name`,
      [tenants.a],
    );
    expect(rows.map((r) => r.name).sort()).toEqual([...DEFAULT_SEED].sort());
    expect(rows.every((r) => r.status === 'active')).toBe(true);
  });

  it('tenant B has its own, isolated copy of the same 5 default entries', async () => {
    const { rows } = await migration.query<{ name: string }>(
      `SELECT name FROM position WHERE tenant_id = $1 ORDER BY name`,
      [tenants.b],
    );
    expect(rows.map((r) => r.name).sort()).toEqual([...DEFAULT_SEED].sort());
  });
});
