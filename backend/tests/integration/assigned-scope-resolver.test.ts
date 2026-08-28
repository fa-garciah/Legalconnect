/**
 * T047 / T048 — 006/FR-011, FR-013, SC-001, SC-013. quickstart.md Scenario 3.
 *
 * The resolver against REAL assignment rows, including the interleaving that makes FR-011's
 * immediacy claim mean something.
 *
 * `tests/unit/assigned-resolver-pure.test.ts` covers the three branches that never touch
 * the database. This file covers the fourth — the one that queries — and the concurrency
 * behaviour a sequential test cannot see.
 *
 * **SC-013**: this is the first suite anywhere to exercise 004's `ScopeResolverPort` with a
 * registered resolver and a real capability behind it, closing 004's own deferred US5
 * scenario 7.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createRealApp } from '../helpers/real-app';
import { connectAs } from '../helpers/db';
import { uniqueRfc } from '../helpers/rfc';
import { resolverFor } from '../../src/common/authz/scope';
import { makeCaseFirm, nextSuffix, uniqueName, type Actor, type CaseFirm } from '../helpers/case-core';

describe('the assigned scope resolver, against real rows', () => {
  let app: INestApplication;
  let migration: Client;
  let firm: CaseFirm;
  let clientId: string;

  const read = (actor: Actor, caseId: string) =>
    request(app.getHttpServer())
      .get(`/tenant/cases/${caseId}`)
      .set('x-identity-id', actor.identityId)
      .set('x-tenant-id', firm.tenantId);

  const assign = (caseId: string, membershipId: string) =>
    request(app.getHttpServer())
      .post(`/tenant/cases/${caseId}/team`)
      .set('x-identity-id', firm.mp.identityId)
      .set('x-tenant-id', firm.tenantId)
      .send({ membershipId, roleOnCase: 'lead' });

  const unassign = (caseId: string, membershipId: string) =>
    request(app.getHttpServer())
      .delete(`/tenant/cases/${caseId}/team/${membershipId}`)
      .set('x-identity-id', firm.mp.identityId)
      .set('x-tenant-id', firm.tenantId)
      .send();

  async function makeCase(): Promise<string> {
    const { rows } = await migration.query<{ id: string }>(
      `INSERT INTO case_file (tenant_id, client_id, file_number, case_status_id)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [firm.tenantId, clientId, uniqueName('EXP-R'), firm.statusOpenId],
    );
    return rows[0]!.id;
  }

  beforeAll(async () => {
    app = await createRealApp();
    migration = await connectAs('migration');
    firm = await makeCaseFirm(migration, `CC Resolutor ${nextSuffix()}`, uniqueRfc());
    const { rows } = await migration.query<{ id: string }>(
      `INSERT INTO client (tenant_id, kind, legal_name) VALUES ($1, 'organization', $2) RETURNING id`,
      [firm.tenantId, uniqueName('Cliente Resolutor')],
    );
    clientId = rows[0]!.id;
  });

  afterAll(async () => {
    await migration.end();
    await app.close();
  });

  it('SC-013 — a resolver is registered for the assigned kind, for the first time', async () => {
    // Before this slice, `resolverFor('assigned')` returned `undefined` and `decide()`
    // refused fail-closed. That was 004's deliberate shipped state (its US5 scenario 6) and
    // 016a's documented gap. `CaseCoreModule.onModuleInit` is what changes it.
    const resolver = resolverFor('assigned');
    expect(resolver).toBeDefined();
    expect(resolver!.kind).toBe('assigned');
  });

  it('grants on case A and refuses on case B for the same member', async () => {
    const caseA = await makeCase();
    const caseB = await makeCase();

    await assign(caseA, firm.aa.membershipId);

    expect((await read(firm.aa, caseA)).status).toBe(200);
    expect((await read(firm.aa, caseB)).status).toBe(404);
  });

  it('SC-001 — unassignment takes effect on the very next request, with nothing to invalidate', async () => {
    const caseId = await makeCase();
    await assign(caseId, firm.cm.membershipId);
    expect((await read(firm.cm, caseId)).status).toBe(200);

    await unassign(caseId, firm.cm.membershipId);

    // Immediately, and repeatedly — there is no session object holding a stale decision,
    // because the resolver queries inside each request's own transaction (research.md D1).
    for (let i = 0; i < 3; i += 1) {
      expect((await read(firm.cm, caseId)).status).toBe(404);
    }
  });

  it('Decision 2 — MP and SA are granted with ZERO assignment rows', async () => {
    const caseId = await makeCase();

    const { rows } = await migration.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM case_assignment WHERE case_id = $1`,
      [caseId],
    );
    expect(rows[0]!.n).toBe('0');

    for (const actor of [firm.mp, firm.sa]) {
      expect((await read(actor, caseId)).status).toBe(200);
    }
    // And the four archetypes the ethical wall still holds against are refused on the same
    // case, in the same state — which is what makes Decision 2 an exception rather than a
    // hole (spec.md, "What survives the trade-off").
    for (const actor of [firm.aa, firm.pl, firm.cm]) {
      expect((await read(actor, caseId)).status).toBe(404);
    }
  });

  it('T048 — an assignment committing mid-flight is visible to the very next request', async () => {
    const caseId = await makeCase();

    // Fire the assignment and a read concurrently. The read may land before or after the
    // commit — either is correct — but the read AFTER both settle must see the assignment.
    // The failure this catches is a resolver that cached, or one that read outside the
    // request's transaction and saw a snapshot taken before the write.
    const [assigned] = await Promise.all([assign(caseId, firm.pl.membershipId), read(firm.pl, caseId)]);
    expect(assigned.status).toBe(201);

    expect((await read(firm.pl, caseId)).status).toBe(200);
  });

  it('T048 — an unassignment committing mid-flight is honoured by the very next request', async () => {
    const caseId = await makeCase();
    await assign(caseId, firm.aa.membershipId);
    expect((await read(firm.aa, caseId)).status).toBe(200);

    const [removed] = await Promise.all([
      unassign(caseId, firm.aa.membershipId),
      read(firm.aa, caseId),
    ]);
    expect(removed.status).toBe(200);

    // The direction that actually matters for FR-011: no stale "still assigned" answer once
    // the removal has committed.
    expect((await read(firm.aa, caseId)).status).toBe(404);
  });

  it('T048 — concurrent reads during an unassignment never disagree with the final state', async () => {
    const caseId = await makeCase();
    await assign(caseId, firm.cm.membershipId);

    const reads = Array.from({ length: 8 }, () => read(firm.cm, caseId));
    const [, ...results] = await Promise.all([unassign(caseId, firm.cm.membershipId), ...reads]);

    // Each in-flight read is either 200 (it ran before the commit) or 404 (after) — both
    // are correct. What must NOT happen is any other outcome, which is what a resolver
    // querying outside the transaction, or throwing on a concurrent update, would produce.
    for (const response of results) {
      expect([200, 404]).toContain(response.status);
    }
    // And afterwards, unambiguously refused.
    expect((await read(firm.cm, caseId)).status).toBe(404);
  });

  it('reassignment after removal grants again, through a new row', async () => {
    const caseId = await makeCase();
    await assign(caseId, firm.aa.membershipId);
    await unassign(caseId, firm.aa.membershipId);
    expect((await read(firm.aa, caseId)).status).toBe(404);

    await assign(caseId, firm.aa.membershipId);
    expect((await read(firm.aa, caseId)).status).toBe(200);

    // The closed row is still there — the resolver's `unassigned_at IS NULL` predicate is
    // what stops it counting, not its absence.
    const { rows } = await migration.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM case_assignment WHERE case_id = $1 AND membership_id = $2`,
      [caseId, firm.aa.membershipId],
    );
    expect(rows[0]!.n).toBe('2');
  });
});
