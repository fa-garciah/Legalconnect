/**
 * T001 — `PATCH /tenant/cases/:caseId/outcome`. 015/FR-001, FR-002, FR-002a, FR-004.
 *
 * WHAT THE OUTCOME IS FOR. Nothing in this product recorded how a matter ended, so a success
 * rate could only ever have been invented. This is the one column that makes it real — and the
 * rules around it are what keep it honest:
 *
 *   - it exists only on a CLOSED matter, because it is a statement about how something ended;
 *   - it is nullable and stays null for every matter closed before this slice, because
 *     "not declared" and *sin resolución* are different facts and only one of them is a
 *     declaration;
 *   - it can be declared later, or this firm's history could never have one (FR-002a).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createAuthenticatedApp } from '../helpers/real-app';
import { connectAs } from '../helpers/db';
import { uniqueRfc } from '../helpers/rfc';
import { makeCaseFirm, nextSuffix, uniqueName, type Actor, type CaseFirm } from '../helpers/case-core';

let app: INestApplication;
let migration: Client;
let firm: CaseFirm;
let clientId: string;

async function makeCase(closed: boolean): Promise<string> {
  const { rows } = await migration.query<{ id: string }>(
    `INSERT INTO case_file (tenant_id, client_id, file_number, case_status_id, opened_on, closed_on)
     VALUES ($1, $2, $3, $4, current_date - 90, $5::date) RETURNING id`,
    [
      firm.tenantId,
      clientId,
      `EXP-OUT-${nextSuffix()}`,
      closed ? firm.statusClosingId : firm.statusOpenId,
      closed ? new Date().toISOString().slice(0, 10) : null,
    ],
  );
  const caseId = rows[0]!.id;
  // The AA leads it, so the `assigned` scope has somebody to permit and somebody to refuse.
  await migration.query(
    `INSERT INTO case_assignment (case_id, membership_id, tenant_id, role_on_case)
     VALUES ($1, $2, $3, 'lead')`,
    [caseId, firm.aa.membershipId, firm.tenantId],
  );
  return caseId;
}

function declare(actor: Actor, caseId: string, body: unknown): request.Test {
  return request(app.getHttpServer())
    .patch(`/tenant/cases/${caseId}/outcome`)
    .set('x-identity-id', actor.identityId)
    .set('x-tenant-id', firm.tenantId)
    .send(body as object);
}

beforeAll(async () => {
  app = await createAuthenticatedApp();
  migration = await connectAs('migration');
  firm = await makeCaseFirm(migration, `CC Resultado ${nextSuffix()}`, uniqueRfc());
  const client = await migration.query<{ id: string }>(
    `INSERT INTO client (tenant_id, kind, legal_name) VALUES ($1, 'organization', $2) RETURNING id`,
    [firm.tenantId, uniqueName('Litigios Resueltos')],
  );
  clientId = client.rows[0]!.id;
}, 180_000);

afterAll(async () => {
  await migration.end();
  await app.close();
});

describe('declaring an outcome (T001)', () => {
  it('accepts each of the four values on a closed matter', async () => {
    for (const outcome of ['favorable', 'desfavorable', 'convenio', 'sin_resolucion']) {
      const caseId = await makeCase(true);
      const response = await declare(firm.mp, caseId, { outcome });
      expect(response.status, outcome).toBe(200);
      expect(response.body.outcome, outcome).toBe(outcome);
    }
  });

  it('refuses an outcome on a matter that is still open', async () => {
    // The whole point of the column: it is a statement about how something ENDED.
    const caseId = await makeCase(false);
    const response = await declare(firm.mp, caseId, { outcome: 'favorable' });
    expect(response.status).toBe(400);
  });

  it('refuses a value outside the four', async () => {
    const caseId = await makeCase(true);
    expect((await declare(firm.mp, caseId, { outcome: 'ganado' })).status).toBe(400);
    expect((await declare(firm.mp, caseId, { outcome: '' })).status).toBe(400);
    expect((await declare(firm.mp, caseId, {})).status).toBe(400);
  });

  it('lets a matter closed long before this slice be given one (FR-002a)', async () => {
    // Simulates the history every adopting firm has, and `022`'s eleven closed matters.
    const caseId = await makeCase(true);
    await migration.query(`UPDATE case_file SET closed_on = current_date - 400 WHERE id = $1`, [caseId]);
    const response = await declare(firm.mp, caseId, { outcome: 'convenio' });
    expect(response.status).toBe(200);
  });

  it('can be changed once declared — a firm may correct itself', async () => {
    const caseId = await makeCase(true);
    await declare(firm.mp, caseId, { outcome: 'favorable' }).expect(200);
    const second = await declare(firm.mp, caseId, { outcome: 'convenio' });
    expect(second.status).toBe(200);
    expect(second.body.outcome).toBe('convenio');
  });

  describe('who may declare it', () => {
    it('permits MP and SA on any matter — they satisfy the assigned scope unconditionally', async () => {
      for (const actor of [firm.mp, firm.sa] as const) {
        const caseId = await makeCase(true);
        expect((await declare(actor, caseId, { outcome: 'favorable' })).status).toBe(200);
      }
    });

    it('permits an AA who leads the matter', async () => {
      const caseId = await makeCase(true);
      expect((await declare(firm.aa, caseId, { outcome: 'favorable' })).status).toBe(200);
    });

    it('refuses a CM who is not on the matter with 404, not 403', async () => {
      /*
       * `case.change_status` is `assigned`-scoped, and only MP and SA satisfy that resolver
       * without an assignment (006 Decision 2). A CM who is not on the matter therefore gets the
       * OPAQUE refusal — a matter you are not on reads exactly like one that does not exist,
       * which is 006/FR-016's whole point.
       *
       * Asserted because the first draft of this test expected 200 for a CM and was wrong: the
       * reused capability brings its scope with it, and declaring an outcome is no more
       * permissive than changing the status it accompanies.
       */
      const caseId = await makeCase(true);
      expect((await declare(firm.cm, caseId, { outcome: 'favorable' })).status).toBe(404);
    });

    it('permits a CM who IS on the matter', async () => {
      const caseId = await makeCase(true);
      await migration.query(
        `INSERT INTO case_assignment (case_id, membership_id, tenant_id, role_on_case)
         VALUES ($1, $2, $3, 'collaborator')`,
        [caseId, firm.cm.membershipId, firm.tenantId],
      );
      expect((await declare(firm.cm, caseId, { outcome: 'convenio' })).status).toBe(200);
    });

    it('refuses a PL and a BM', async () => {
      const caseId = await makeCase(true);
      expect((await declare(firm.pl, caseId, { outcome: 'favorable' })).status).toBe(403);
      expect((await declare(firm.bm, caseId, { outcome: 'favorable' })).status).toBe(403);
    });

    it('answers 404 for a matter that does not exist', async () => {
      const response = await declare(firm.mp, '00000000-0000-4000-8000-000000000000', {
        outcome: 'favorable',
      });
      expect(response.status).toBe(404);
    });
  });

  it('writes exactly one case.outcome_declared audit entry (FR-004)', async () => {
    const caseId = await makeCase(true);
    const before = await migration.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM audit_event WHERE tenant_id = $1 AND action = 'case.outcome_declared'`,
      [firm.tenantId],
    );
    await declare(firm.mp, caseId, { outcome: 'favorable' }).expect(200);
    const after = await migration.query<{ n: string; target_id: string }>(
      `SELECT count(*)::text AS n FROM audit_event WHERE tenant_id = $1 AND action = 'case.outcome_declared'`,
      [firm.tenantId],
    );
    expect(Number(after.rows[0]!.n)).toBe(Number(before.rows[0]!.n) + 1);

    const entry = await migration.query<{ target_id: string; target_entity: string }>(
      `SELECT target_id, target_entity FROM audit_event
        WHERE tenant_id = $1 AND action = 'case.outcome_declared'
        ORDER BY occurred_at DESC LIMIT 1`,
      [firm.tenantId],
    );
    expect(entry.rows[0]!.target_id).toBe(caseId);
    expect(entry.rows[0]!.target_entity).toBe('case_file');
  });

  it('never records the outcome value itself in the audit entry\'s metadata as free text', async () => {
    // Principle V records THAT a declaration happened and about which matter. The value is a
    // field on the row, readable through the case read — the audit log is not a second copy
    // of the record.
    const caseId = await makeCase(true);
    await declare(firm.mp, caseId, { outcome: 'desfavorable' }).expect(200);
    const entry = await migration.query<{ metadata: Record<string, unknown> }>(
      `SELECT metadata FROM audit_event WHERE tenant_id = $1 AND action = 'case.outcome_declared'
        ORDER BY occurred_at DESC LIMIT 1`,
      [firm.tenantId],
    );
    // A `{ outcome: { from, to } }` shape is fine and mirrors 006's status entry; what must
    // not appear is any client or matter content.
    expect(JSON.stringify(entry.rows[0]!.metadata)).not.toContain('Litigios Resueltos');
  });
});

describe('the case read carries it (T005a, FR-002b)', () => {
  it('returns null before a declaration and the value after', async () => {
    const caseId = await makeCase(true);

    const before = await request(app.getHttpServer())
      .get(`/tenant/cases/${caseId}`)
      .set('x-identity-id', firm.mp.identityId)
      .set('x-tenant-id', firm.tenantId);
    expect(before.status).toBe(200);
    expect(before.body).toHaveProperty('outcome');
    expect(before.body.outcome).toBeNull();

    await declare(firm.mp, caseId, { outcome: 'favorable' }).expect(200);

    const after = await request(app.getHttpServer())
      .get(`/tenant/cases/${caseId}`)
      .set('x-identity-id', firm.mp.identityId)
      .set('x-tenant-id', firm.tenantId);
    expect(after.body.outcome).toBe('favorable');
  });
});
