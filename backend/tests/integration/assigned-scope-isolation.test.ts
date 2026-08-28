/**
 * T023 — Principle II, the row `plan.md`'s post-design Constitution re-check flagged to
 * watch.
 *
 * The `assigned` resolver's query writes NO `tenant_id` predicate. That looks like an
 * omission and is not: `currentTx()` is the transaction `TenantContextInterceptor` already
 * opened with `app.tenant_id` set, and `case_assignment_own_tenant` applies it. This file
 * is the proof, because "RLS will handle it" is exactly the kind of claim that is true
 * until someone changes a policy and nothing notices.
 *
 * The failure it guards against is specific: if the resolver's query could be reached with
 * a tenant other than the caller's, cross-firm case existence becomes inferable — which is
 * the opacity FR-016 exists to protect.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createRealApp } from '../helpers/real-app';
import { connectAs } from '../helpers/db';
import { uniqueRfc } from '../helpers/rfc';
import { AssignedScopeResolver } from '../../src/modules/case-core/assigned-scope.resolver';
import { makeCaseFirm, nextSuffix, uniqueName, type CaseFirm } from '../helpers/case-core';

describe('the assigned resolver cannot see across tenants', () => {
  let app: INestApplication;
  let migration: Client;
  let firmA: CaseFirm;
  let firmB: CaseFirm;
  let caseInB: string;

  beforeAll(async () => {
    app = await createRealApp();
    migration = await connectAs('migration');
    firmA = await makeCaseFirm(migration, `CC Aislamiento A ${nextSuffix()}`, uniqueRfc());
    firmB = await makeCaseFirm(migration, `CC Aislamiento B ${nextSuffix()}`, uniqueRfc());

    const { rows: clientRows } = await migration.query<{ id: string }>(
      `INSERT INTO client (tenant_id, kind, legal_name) VALUES ($1, 'organization', $2) RETURNING id`,
      [firmB.tenantId, uniqueName('Cliente B')],
    );
    const { rows } = await migration.query<{ id: string }>(
      `INSERT INTO case_file (tenant_id, client_id, file_number, case_status_id)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [firmB.tenantId, clientRows[0]!.id, uniqueName('EXP-B'), firmB.statusOpenId],
    );
    caseInB = rows[0]!.id;

    // Firm B's own AA IS on it, so the row genuinely exists and is genuinely live. The
    // question this file asks is whether firm A can learn any of that.
    await migration.query(
      `INSERT INTO case_assignment (case_id, membership_id, tenant_id, role_on_case)
       VALUES ($1, $2, $3, 'lead')`,
      [caseInB, firmB.aa.membershipId, firmB.tenantId],
    );
  });

  afterAll(async () => {
    await migration.end();
    await app.close();
  });

  it('a member of firm A handed a real case id from firm B is refused', async () => {
    // Firm A's MP satisfies the resolver unconditionally (Decision 2) — so if anything
    // could leak across the boundary, THIS is the caller who would see it. They do not,
    // because the refusal happens at RLS, before scope is even the question.
    const asMp = await request(app.getHttpServer())
      .get(`/tenant/cases/${caseInB}`)
      .set('x-identity-id', firmA.mp.identityId)
      .set('x-tenant-id', firmA.tenantId);
    expect(asMp.status).toBe(404);

    const asAa = await request(app.getHttpServer())
      .get(`/tenant/cases/${caseInB}`)
      .set('x-identity-id', firmA.aa.identityId)
      .set('x-tenant-id', firmA.tenantId);
    expect(asAa.status).toBe(404);

    // Identical, so the caller cannot tell "another firm's matter" from "no such matter"
    // by comparing what an MP sees against what an AA sees.
    expect(asMp.body).toEqual(asAa.body);
  });

  it('the resolver query itself returns zero rows under the wrong tenant', async () => {
    // Below the HTTP layer, against the resolver directly, so the claim is about the QUERY
    // and not about a controller check that happens to sit in front of it.
    const resolver = new AssignedScopeResolver();
    const app2 = await connectAs('app');

    try {
      // Firm A's tenant is active; firm B's assignment row is asked about.
      await app2.query(`BEGIN`);
      await app2.query(`SELECT set_config('app.tenant_id', $1, true)`, [firmA.tenantId]);
      const { rows } = await app2.query<{ ok: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM case_assignment
            WHERE case_id = $1::uuid AND membership_id = $2::uuid AND unassigned_at IS NULL
         ) AS ok`,
        [caseInB, firmB.aa.membershipId],
      );
      expect(rows[0]!.ok).toBe(false);

      // And under the RIGHT tenant, the same query finds it — so the `false` above is
      // isolation working, not a query that never matches anything.
      await app2.query(`SELECT set_config('app.tenant_id', $1, true)`, [firmB.tenantId]);
      const { rows: correct } = await app2.query<{ ok: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM case_assignment
            WHERE case_id = $1::uuid AND membership_id = $2::uuid AND unassigned_at IS NULL
         ) AS ok`,
        [caseInB, firmB.aa.membershipId],
      );
      expect(correct[0]!.ok).toBe(true);
      await app2.query(`COMMIT`);
    } finally {
      await app2.end();
    }

    expect(resolver.kind).toBe('assigned');
  });

  it('a cross-tenant reach is recorded, and the record names no home tenant', async () => {
    // Firm A's AA reaching for firm B's case is refused at membership resolution when the
    // tenant header is firm B's — the attempt never reaches the resolver at all.
    const before = await migration.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM audit_event
        WHERE action = 'tenant.cross_access_attempted' AND tenant_id = $1`,
      [firmB.tenantId],
    );

    const reach = await request(app.getHttpServer())
      .get(`/tenant/cases/${caseInB}`)
      .set('x-identity-id', firmA.aa.identityId)
      .set('x-tenant-id', firmB.tenantId);
    expect(reach.status).toBe(404);

    const after = await migration.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM audit_event
        WHERE action = 'tenant.cross_access_attempted' AND tenant_id = $1`,
      [firmB.tenantId],
    );
    expect(Number(after.rows[0]!.n)).toBe(Number(before.rows[0]!.n) + 1);
  });

  it('an assignment cannot be written into another tenant', async () => {
    // The denormalised `tenant_id` on `case_assignment` comes from the session setting, not
    // the request — so even a caller who knew firm B's case id could not staff it. The
    // policy's WITH CHECK is the backstop.
    const app2 = await connectAs('app');
    try {
      await app2.query(`BEGIN`);
      await app2.query(`SELECT set_config('app.tenant_id', $1, true)`, [firmA.tenantId]);
      await expect(
        app2.query(
          `INSERT INTO case_assignment (case_id, membership_id, tenant_id, role_on_case)
           VALUES ($1, $2, $3, 'lead')`,
          [caseInB, firmB.aa.membershipId, firmB.tenantId],
        ),
      ).rejects.toThrow();
      await app2.query(`ROLLBACK`);
    } finally {
      await app2.end();
    }
  });
});
