/**
 * T046 — 006/FR-014, SC-003, SC-012. quickstart.md Scenario 3c.
 *
 * **The assertion this file exists for is the first one: an unassigned caller gets `200`
 * with an empty list, not a refusal.**
 *
 * That is why `case.read_list` declares `tenant` scope rather than `assigned`. A scope
 * resolver returns a boolean and `decide()` turns `false` into a refusal — there is no
 * outcome meaning "permit, but return fewer rows". An `assigned`-scoped list could only
 * have refused this caller, and 016a would have rendered its ERROR state where the spec
 * requires its EMPTY state.
 *
 * If someone later "tidies" row 29 to `assigned` for consistency with rows 30/32/33, this
 * file is what stops them.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createRealApp } from '../helpers/real-app';
import { connectAs } from '../helpers/db';
import { uniqueRfc } from '../helpers/rfc';
import { makeCaseFirm, nextSuffix, uniqueName, type Actor, type CaseFirm } from '../helpers/case-core';

describe('the case list is filtered, not scoped', () => {
  let app: INestApplication;
  let migration: Client;
  let firm: CaseFirm;
  const caseIds: string[] = [];

  const list = (actor: Actor, query = '') =>
    request(app.getHttpServer())
      .get(`/tenant/cases${query}`)
      .set('x-identity-id', actor.identityId)
      .set('x-tenant-id', firm.tenantId);

  beforeAll(async () => {
    app = await createRealApp();
    migration = await connectAs('migration');
    firm = await makeCaseFirm(migration, `CC Listado ${nextSuffix()}`, uniqueRfc());

    const { rows: clientRows } = await migration.query<{ id: string }>(
      `INSERT INTO client (tenant_id, kind, legal_name) VALUES ($1, 'organization', $2) RETURNING id`,
      [firm.tenantId, uniqueName('Cliente Listado')],
    );
    const clientId = clientRows[0]!.id;

    // Seven cases. The AA is put on two of them; everyone else is on none.
    for (let i = 0; i < 7; i += 1) {
      const { rows } = await migration.query<{ id: string }>(
        `INSERT INTO case_file (tenant_id, client_id, file_number, case_status_id)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [firm.tenantId, clientId, `EXP-L-${nextSuffix()}-${i}`, firm.statusOpenId],
      );
      caseIds.push(rows[0]!.id);
    }
    for (const caseId of caseIds.slice(0, 2)) {
      await migration.query(
        `INSERT INTO case_assignment (case_id, membership_id, tenant_id, role_on_case)
         VALUES ($1, $2, $3, 'lead')`,
        [caseId, firm.aa.membershipId, firm.tenantId],
      );
    }
  });

  afterAll(async () => {
    await migration.end();
    await app.close();
  });

  it('SC-003 — a member with no assignments gets 200 and an empty list, NOT a refusal', async () => {
    const response = await list(firm.pl);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ items: [], nextCursor: null });

    // Stated explicitly, because the whole design of row 29 turns on it: this must not be
    // any refusal shape at all.
    expect(response.status).not.toBe(403);
    expect(response.status).not.toBe(404);
    expect(response.body.error).toBeUndefined();
  });

  it('an AA assigned to 2 of 7 sees exactly those 2', async () => {
    const response = await list(firm.aa);

    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(2);
    expect(response.body.items.map((c: { id: string }) => c.id).sort()).toEqual(
      caseIds.slice(0, 2).sort(),
    );
  });

  it('Decision 2 — MP and SA see all 7 with no assignment at all', async () => {
    for (const actor of [firm.mp, firm.sa]) {
      const response = await list(actor);
      expect(response.status).toBe(200);
      expect(response.body.items).toHaveLength(7);
    }
  });

  it('SC-012 — filtering happens before the page boundary, so a page is full', async () => {
    // MP sees all 7. Asked for 5, the first page must hold 5 — if the assignment filter ran
    // after the fetch, a restricted caller's page would shrink while `nextCursor` still
    // promised more.
    const first = await list(firm.mp, '?limit=5');
    expect(first.body.items).toHaveLength(5);
    expect(first.body.nextCursor).toBeTruthy();

    const second = await list(firm.mp, `?limit=5&cursor=${encodeURIComponent(first.body.nextCursor)}`);
    expect(second.body.items).toHaveLength(2);
    expect(second.body.nextCursor).toBeNull();

    const ids = [
      ...first.body.items.map((c: { id: string }) => c.id),
      ...second.body.items.map((c: { id: string }) => c.id),
    ];
    expect(new Set(ids).size).toBe(7);
  });

  it('a restricted caller pages over their OWN matches, not the tenant\'s', async () => {
    // The AA is on 2. Asked for 1, they get 1 and a cursor — and the second page holds the
    // second of THEIR cases, never one of the five they are not on.
    const first = await list(firm.aa, '?limit=1');
    expect(first.body.items).toHaveLength(1);
    expect(first.body.nextCursor).toBeTruthy();

    const second = await list(firm.aa, `?limit=1&cursor=${encodeURIComponent(first.body.nextCursor)}`);
    expect(second.body.items).toHaveLength(1);
    expect(second.body.nextCursor).toBeNull();

    const seen = [first.body.items[0].id, second.body.items[0].id];
    expect(seen.sort()).toEqual(caseIds.slice(0, 2).sort());
  });

  it('BM holds no case list at all — Principle VI\'s line', async () => {
    const refused = await list(firm.bm);

    // A 403, not an empty list: billing is refused case rows on PERMISSION, which is a
    // different statement from "you are on no matters".
    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe('not_authorized');
  });

  it('the list never crosses a tenant boundary', async () => {
    const other = await makeCaseFirm(migration, `CC Listado Otra ${nextSuffix()}`, uniqueRfc());

    const theirs = await request(app.getHttpServer())
      .get('/tenant/cases')
      .set('x-identity-id', other.mp.identityId)
      .set('x-tenant-id', other.tenantId);

    expect(theirs.status).toBe(200);
    expect(theirs.body.items).toHaveLength(0);
  });

  it('the list read writes no audit entry, on either channel', async () => {
    const before = await migration.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM audit_event WHERE tenant_id = $1`,
      [firm.tenantId],
    );

    await list(firm.mp);
    await request(app.getHttpServer())
      .get('/tenant/cases')
      .set('x-identity-id', firm.mp.identityId)
      .set('x-tenant-id', firm.tenantId)
      .set('x-channel', 'automated');

    const after = await migration.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM audit_event WHERE tenant_id = $1`,
      [firm.tenantId],
    );

    // spec.md's Resolved Decisions: the list returns only rows the caller is already scoped
    // to and discloses no matter's contents. The SINGLE-case read is the access Principle V
    // asks to be recorded, and it is — see case-read-audited.test.ts.
    expect(after.rows[0]!.n).toBe(before.rows[0]!.n);
  });
});
