/**
 * T025 / quickstart V2 — every tenant-scoped table is covered, and covered correctly.
 *
 * The catalog check confirms a policy EXISTS. It cannot read whether the predicate is
 * null-safe, which is why Constitution v1.3.0 pairs it with the no-context test in
 * isolation/no-context.test.ts. Here we additionally assert the predicate text, which
 * catches a bare `current_setting` at the point it is written rather than waiting for
 * the behavioural test to catch it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { connectAs } from '../helpers/db';
import {
  GLOBAL_TABLES,
  TENANT_SCOPED_TABLES,
} from '../../src/common/db/tenant-scoped-tables';

describe('RLS coverage', () => {
  let client: Client;

  beforeAll(async () => {
    client = await connectAs('migration');
  });

  afterAll(async () => {
    await client.end();
  });

  it.each(TENANT_SCOPED_TABLES.map((t) => t.table))(
    '%s has row security enabled and forced',
    async (table) => {
      const { rows } = await client.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
        `SELECT relrowsecurity, relforcerowsecurity
           FROM pg_class WHERE relname = $1 AND relnamespace = 'public'::regnamespace`,
        [table],
      );
      expect(rows[0]?.relrowsecurity, `${table} must have RLS enabled`).toBe(true);
      expect(rows[0]?.relforcerowsecurity, `${table} must have RLS forced`).toBe(true);
    },
  );

  it.each(TENANT_SCOPED_TABLES.map((t) => t.table))(
    '%s has at least one active policy',
    async (table) => {
      const { rows } = await client.query<{ count: string }>(
        `SELECT count(*)::text FROM pg_policies WHERE schemaname = 'public' AND tablename = $1`,
        [table],
      );
      expect(Number(rows[0]?.count)).toBeGreaterThan(0);
    },
  );

  it('every tenant-scoped policy uses the null-safe predicate required by Constitution v1.3.0', async () => {
    const { rows } = await client.query<{ tablename: string; policyname: string; qual: string | null; with_check: string | null }>(
      `SELECT tablename, policyname, qual, with_check
         FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = ANY($1::text[])
          AND roles::text LIKE '%lc_app%'`,
      [TENANT_SCOPED_TABLES.map((t) => t.table)],
    );

    expect(rows.length, 'expected at least one lc_app policy').toBeGreaterThan(0);

    for (const row of rows) {
      for (const expression of [row.qual, row.with_check]) {
        if (expression === null) continue;
        expect(
          expression,
          `${row.tablename}.${row.policyname} must wrap current_setting in NULLIF`,
        ).toContain('NULLIF');
        // A bare cast of current_setting is the prohibited form.
        expect(
          /current_setting\([^)]*\)\s*\)?::uuid/.test(expression) &&
            !expression.includes('NULLIF'),
          `${row.tablename}.${row.policyname} must not use the bare form`,
        ).toBe(false);
      }
    }
  });

  it('every table carrying a tenant_id column is present in the registry', async () => {
    // A new table with tenant_id that nobody registered must break the build, not
    // quietly go uncovered.
    const { rows } = await client.query<{ table_name: string }>(
      `SELECT c.relname AS table_name
         FROM pg_class c
         JOIN pg_attribute a ON a.attrelid = c.oid
        WHERE c.relnamespace = 'public'::regnamespace
          AND c.relkind IN ('r', 'p')
          AND a.attname = 'tenant_id'
          AND a.attnum > 0 AND NOT a.attisdropped
        GROUP BY c.relname`,
    );

    const registered = new Set(TENANT_SCOPED_TABLES.map((t) => t.table));
    const unregistered = rows
      .map((r) => r.table_name)
      // Partitions inherit their parent's policy; only the parent is registered.
      .filter((name) => !/^audit_event_\d{4}_\d{2}$/.test(name))
      .filter((name) => !registered.has(name));

    expect(unregistered, 'unregistered tenant-scoped tables').toEqual([]);
  });

  it('global tables carry no tenant policy, deliberately', async () => {
    for (const table of GLOBAL_TABLES) {
      const { rows } = await client.query<{ relrowsecurity: boolean }>(
        `SELECT relrowsecurity FROM pg_class
          WHERE relname = $1 AND relnamespace = 'public'::regnamespace`,
        [table],
      );
      if (rows.length === 0) continue;
      expect(rows[0]?.relrowsecurity, `${table} is a global catalog`).toBe(false);
    }
  });
});
