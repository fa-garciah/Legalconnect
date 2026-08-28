/**
 * T049 — 006/FR-016, FR-017, SC-002. quickstart.md Scenario 3b.
 *
 * **The property this whole slice's refusal design exists for.**
 *
 * Three requests that must be impossible to tell apart:
 *   1. a case of the caller's own tenant they are not assigned to,
 *   2. a case id that does not exist anywhere,
 *   3. a case belonging to another firm.
 *
 * Compared field by field, status included. If any one of them differed, a screened
 * associate could learn that a matter exists — and in a firm running an ethical wall, the
 * existence of the matter is often the whole of the protected fact (004/research.md D6).
 *
 * This is also 004's `plan.md` Open Item 3 finally coming due: its recommendation was 404,
 * its condition was that the answer be observable in this slice, and this file is where it
 * becomes observable.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createRealApp } from '../helpers/real-app';
import { connectAs } from '../helpers/db';
import { uniqueRfc } from '../helpers/rfc';
import { makeCaseFirm, nextSuffix, uniqueName, type CaseFirm } from '../helpers/case-core';

/** A syntactically valid uuid that names nothing. */
const NONEXISTENT = '00000000-0000-4000-8000-0000000000ff';

describe('an assigned-scope refusal is indistinguishable from a nonexistent case', () => {
  let app: INestApplication;
  let migration: Client;
  let firm: CaseFirm;
  let otherFirm: CaseFirm;

  let unassignedCaseId: string;
  let foreignCaseId: string;

  async function makeCase(f: CaseFirm): Promise<string> {
    const { rows: clientRows } = await migration.query<{ id: string }>(
      `INSERT INTO client (tenant_id, kind, legal_name) VALUES ($1, 'organization', $2) RETURNING id`,
      [f.tenantId, uniqueName('Cliente Opaco')],
    );
    const { rows } = await migration.query<{ id: string }>(
      `INSERT INTO case_file (tenant_id, client_id, file_number, case_status_id)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [f.tenantId, clientRows[0]!.id, uniqueName('EXP-O'), f.statusOpenId],
    );
    return rows[0]!.id;
  }

  /** Every request in this file is made by the same AA, so only the TARGET varies. */
  const asAa = (caseId: string) =>
    request(app.getHttpServer())
      .get(`/tenant/cases/${caseId}`)
      .set('x-identity-id', firm.aa.identityId)
      .set('x-tenant-id', firm.tenantId);

  beforeAll(async () => {
    app = await createRealApp();
    migration = await connectAs('migration');
    firm = await makeCaseFirm(migration, `CC Opacidad ${nextSuffix()}`, uniqueRfc());
    otherFirm = await makeCaseFirm(migration, `CC Opacidad Otra ${nextSuffix()}`, uniqueRfc());

    unassignedCaseId = await makeCase(firm);
    foreignCaseId = await makeCase(otherFirm);
  });

  afterAll(async () => {
    await migration.end();
    await app.close();
  });

  it('SC-002 — all three responses are byte-identical', async () => {
    const [unassigned, nonexistent, foreign] = await Promise.all([
      asAa(unassignedCaseId),
      asAa(NONEXISTENT),
      asAa(foreignCaseId),
    ]);

    // Status.
    expect(unassigned.status).toBe(404);
    expect(nonexistent.status).toBe(404);
    expect(foreign.status).toBe(404);

    // Body, field for field.
    expect(unassigned.body).toEqual(nonexistent.body);
    expect(foreign.body).toEqual(nonexistent.body);
    expect(unassigned.body).toEqual({
      error: { code: 'not_found', message: 'The requested resource does not exist.' },
    });

    // And serialised, so no key ordering or extra field can differ either.
    const serialised = [unassigned, nonexistent, foreign].map((r) => JSON.stringify(r.body));
    expect(new Set(serialised).size).toBe(1);
  });

  it('the refusal names nothing about the case, the tenant or the reason', async () => {
    const refused = await asAa(unassignedCaseId);
    const body = JSON.stringify(refused.body);

    for (const leak of [unassignedCaseId, firm.tenantId, 'assign', 'scope', 'team']) {
      expect(body).not.toContain(leak);
    }
  });

  it('the same three targets are indistinguishable on the status-change route too', async () => {
    const change = (caseId: string) =>
      request(app.getHttpServer())
        .patch(`/tenant/cases/${caseId}/status`)
        .set('x-identity-id', firm.aa.identityId)
        .set('x-tenant-id', firm.tenantId)
        .send({ caseStatusId: firm.statusClosingId });

    const [unassigned, nonexistent, foreign] = await Promise.all([
      change(unassignedCaseId),
      change(NONEXISTENT),
      change(foreignCaseId),
    ]);

    // FR-016 is a property of the `assigned` KIND, not of one route.
    expect([unassigned.status, nonexistent.status, foreign.status]).toEqual([404, 404, 404]);
    expect(new Set([unassigned, nonexistent, foreign].map((r) => JSON.stringify(r.body))).size).toBe(1);
  });

  it('the opacity is what an assignment lifts, and unassignment restores', async () => {
    // Proves the refusal above is genuinely the scope refusal rather than something else
    // coincidentally producing a 404 for every input.
    await request(app.getHttpServer())
      .post(`/tenant/cases/${unassignedCaseId}/team`)
      .set('x-identity-id', firm.mp.identityId)
      .set('x-tenant-id', firm.tenantId)
      .send({ membershipId: firm.aa.membershipId, roleOnCase: 'collaborator' });

    expect((await asAa(unassignedCaseId)).status).toBe(200);
    // The foreign and nonexistent cases are STILL 404 — an assignment lifts opacity over
    // one matter, never over the tenant boundary.
    expect((await asAa(foreignCaseId)).status).toBe(404);
    expect((await asAa(NONEXISTENT)).status).toBe(404);

    await request(app.getHttpServer())
      .delete(`/tenant/cases/${unassignedCaseId}/team/${firm.aa.membershipId}`)
      .set('x-identity-id', firm.mp.identityId)
      .set('x-tenant-id', firm.tenantId)
      .send();

    expect((await asAa(unassignedCaseId)).status).toBe(404);
  });

  it('016a classifies this refusal into its OPAQUE bucket with no frontend change', async () => {
    // research.md D10's claim, asserted rather than assumed. `refusal-bucket.ts` maps
    // `not_found` to `opaque` already — written for 004's `mfa`/`not_found` cases, and it
    // happens to be exactly what an `assigned` refusal needs. This is why the slice touches
    // no frontend file.
    const refused = await asAa(unassignedCaseId);
    expect(refused.body.error.code).toBe('not_found');
  });
});
