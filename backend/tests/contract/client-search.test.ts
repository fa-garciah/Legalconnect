/**
 * T032a — 006/FR-002a, SC-007a. quickstart.md Scenario 1b.
 *
 * `US02-EP03-CLM-SearchAndFilterClients` was claimed in the spec's header with nothing
 * implementing it — the clarification session of 2026-08-27 found the gap and closed it.
 * This suite is that story.
 *
 * The load-bearing assertion is the LAST one: filtering happens before the page boundary.
 * A post-fetch filter would turn a page of 50 into a page of 7 while `nextCursor` went on
 * claiming there were more, and a caller paging through would see pages that shrink for
 * reasons the API never explains.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createRealApp } from '../helpers/real-app';
import { connectAs } from '../helpers/db';
import { uniqueRfc } from '../helpers/rfc';
import { makeCaseFirm, nextSuffix, type Actor, type CaseFirm } from '../helpers/case-core';

describe('client search and filtering', () => {
  let app: INestApplication;
  let migration: Client;
  let firm: CaseFirm;

  /** A stem no other suite's fixtures can collide with. */
  const STEM = `Zarco${Date.now()}`;

  const list = (actor: Actor, query = '') =>
    request(app.getHttpServer())
      .get(`/tenant/clients${query}`)
      .set('x-identity-id', actor.identityId)
      .set('x-tenant-id', firm.tenantId);

  beforeAll(async () => {
    app = await createRealApp();
    migration = await connectAs('migration');
    firm = await makeCaseFirm(migration, `CC Búsqueda ${nextSuffix()}`, uniqueRfc());

    // Written directly: this suite is about the READ, and seeding through the API would
    // make every assertion depend on the write path too.
    //
    // Deliberate mix of letter cases, so `ILIKE` is genuinely exercised rather than
    // accidentally satisfied by an exact match.
    for (let i = 0; i < 7; i += 1) {
      await migration.query(
        `INSERT INTO client (tenant_id, kind, legal_name) VALUES ($1, 'organization', $2)`,
        [firm.tenantId, `${STEM} y Asociados ${i}`],
      );
    }
    await migration.query(
      `INSERT INTO client (tenant_id, kind, legal_name) VALUES ($1, 'person', $2)`,
      [firm.tenantId, `${STEM.toUpperCase()} EN MAYÚSCULAS`],
    );
    // Two withdrawn, so the status filter has both sides to separate.
    await migration.query(
      `INSERT INTO client (tenant_id, kind, legal_name, status, deactivated_at)
       VALUES ($1, 'person', $2, 'inactive', now()), ($1, 'person', $3, 'inactive', now())`,
      [firm.tenantId, `${STEM} Retirado A`, `${STEM} Retirado B`],
    );
  });

  afterAll(async () => {
    await migration.end();
    await app.close();
  });

  it('matches a substring of the legal name, in any letter case', async () => {
    const found = await list(firm.aa, `?q=${STEM.toLowerCase()}`);
    expect(found.status).toBe(200);
    // 7 organizations + 1 uppercase + 2 withdrawn.
    expect(found.body.items).toHaveLength(10);

    // Mid-string, not just a prefix — a firm looking for "Grupo Torres, S.A. de C.V."
    // types "torres".
    const midString = await list(firm.aa, '?q=asociados');
    expect(midString.status).toBe(200);
    expect(midString.body.items.length).toBeGreaterThanOrEqual(7);
  });

  it('treats an empty or whitespace-only filter as absent, not as match-nothing', async () => {
    const blank = await list(firm.aa, '?q=');
    const spaces = await list(firm.aa, '?q=%20%20');

    expect(blank.status).toBe(200);
    expect(spaces.status).toBe(200);
    // The whole register, not zero. A caller who clears a search box sees everything back.
    expect(blank.body.items.length).toBe(10);
    expect(spaces.body.items.length).toBe(10);
  });

  it('filters by status, and refuses a status that is not one', async () => {
    const inactive = await list(firm.aa, `?q=${STEM}&status=inactive`);
    expect(inactive.status).toBe(200);
    expect(inactive.body.items).toHaveLength(2);
    expect(inactive.body.items.every((c: { status: string }) => c.status === 'inactive')).toBe(true);

    const active = await list(firm.aa, `?q=${STEM}&status=active`);
    expect(active.body.items).toHaveLength(8);

    const refused = await list(firm.aa, '?status=nonsense');
    expect(refused.status).toBe(400);
    expect(refused.body.error.code).toBe('validation_failed');
  });

  it('SC-007a — filtering happens before the page boundary, so a filtered page is full', async () => {
    // 8 active matches, asked for 5. If the filter ran AFTER the fetch, the first page
    // would hold however many of the first 5 rows happened to match — fewer than 5, and
    // `nextCursor` would still promise more.
    const first = await list(firm.aa, `?q=${STEM}&status=active&limit=5`);
    expect(first.status).toBe(200);
    expect(first.body.items).toHaveLength(5);
    expect(first.body.nextCursor).toBeTruthy();

    const second = await list(
      firm.aa,
      `?q=${STEM}&status=active&limit=5&cursor=${encodeURIComponent(first.body.nextCursor)}`,
    );
    expect(second.status).toBe(200);
    expect(second.body.items).toHaveLength(3);
    expect(second.body.nextCursor).toBeNull();

    // And the two pages are disjoint — no row is returned twice or skipped.
    const ids = [
      ...first.body.items.map((c: { id: string }) => c.id),
      ...second.body.items.map((c: { id: string }) => c.id),
    ];
    expect(new Set(ids).size).toBe(8);
  });

  it('the filter never crosses a tenant boundary', async () => {
    const other = await makeCaseFirm(migration, `CC Búsqueda Otra ${nextSuffix()}`, uniqueRfc());
    const theirs = await request(app.getHttpServer())
      .get(`/tenant/clients?q=${STEM}`)
      .set('x-identity-id', other.mp.identityId)
      .set('x-tenant-id', other.tenantId);

    expect(theirs.status).toBe(200);
    expect(theirs.body.items).toHaveLength(0);
  });
});
