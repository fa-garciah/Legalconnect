/**
 * T015 — 007/FR-009, SC-010: a freshly seeded tenant's document-category catalog
 * already contains the default seed (research.md D1), including "Unclassified", all
 * `active`.
 *
 * Checked as a SUBSET, not exact equality — 017's own directory-seed.test.ts learned
 * this the hard way: other contract tests legitimately add further, uniquely-named
 * entries to these same long-lived seeded tenants over a full test run.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { connectAs } from '../helpers/db';
import { seededTenantIds, type SeededTenants } from '../helpers/tenants';
import { DEFAULT_DOCUMENT_CATEGORIES } from '../../src/modules/documents/categories/document-category.seed';

describe('the default document-category catalog seed', () => {
  let migration: Client;
  let tenants: SeededTenants;

  beforeAll(async () => {
    migration = await connectAs('migration');
    tenants = await seededTenantIds();
  });

  afterAll(async () => {
    await migration.end();
  });

  it('tenant A\'s catalog contains the default entries, all active', async () => {
    const { rows } = await migration.query<{ name: string; status: string }>(
      `SELECT name, status FROM document_category WHERE tenant_id = $1 AND name = ANY($2)`,
      [tenants.a, DEFAULT_DOCUMENT_CATEGORIES],
    );
    expect(rows.map((r) => r.name).sort()).toEqual([...DEFAULT_DOCUMENT_CATEGORIES].sort());
    expect(rows.every((r) => r.status === 'active')).toBe(true);
  });

  it('tenant B has its own, isolated copy of the same default entries', async () => {
    const { rows } = await migration.query<{ name: string }>(
      `SELECT name FROM document_category WHERE tenant_id = $1 AND name = ANY($2)`,
      [tenants.b, DEFAULT_DOCUMENT_CATEGORIES],
    );
    expect(rows.map((r) => r.name).sort()).toEqual([...DEFAULT_DOCUMENT_CATEGORIES].sort());
  });
});
