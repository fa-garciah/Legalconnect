/**
 * T048a — 006/FR-012a, SC-008a. quickstart.md Scenario 3.
 *
 * The gap the clarification session of 2026-08-27 found: the spec said only that a revoked
 * member's REQUEST is refused, and said nothing about what the case's team read returns.
 * Left alone, the team list — which shows live assignments — would keep listing someone who
 * no longer works at the firm, as `lead`, indefinitely.
 *
 * The cascade runs inside the revocation's own transaction. That is the whole requirement:
 * a background job or an event listener would leave a window in which a revoked member
 * still reads as assigned, which is the failure this exists to prevent.
 *
 * This is also the one place 006 modifies a 002 file (`membership.service.ts`).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createRealApp } from '../helpers/real-app';
import { connectAs } from '../helpers/db';
import { uniqueRfc } from '../helpers/rfc';
import {
  makeCaseFirm,
  makeMember,
  nextSuffix,
  uniqueName,
  type CaseFirm,
} from '../helpers/case-core';

describe('revoking a membership closes its case assignments', () => {
  let app: INestApplication;
  let migration: Client;
  let firm: CaseFirm;
  let clientId: string;

  async function makeCase(): Promise<string> {
    const { rows } = await migration.query<{ id: string }>(
      `INSERT INTO case_file (tenant_id, client_id, file_number, case_status_id)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [firm.tenantId, clientId, uniqueName('EXP-REV'), firm.statusOpenId],
    );
    return rows[0]!.id;
  }

  const assign = (caseId: string, membershipId: string, roleOnCase = 'lead') =>
    request(app.getHttpServer())
      .post(`/tenant/cases/${caseId}/team`)
      .set('x-identity-id', firm.sa.identityId)
      .set('x-tenant-id', firm.tenantId)
      .send({ membershipId, roleOnCase });

  const revoke = (membershipId: string) =>
    request(app.getHttpServer())
      .patch(`/tenant/memberships/${membershipId}/revoke`)
      .set('x-identity-id', firm.sa.identityId)
      .set('x-tenant-id', firm.tenantId)
      .send();

  const readTeam = async (caseId: string): Promise<{ membershipId: string }[]> => {
    const response = await request(app.getHttpServer())
      .get(`/tenant/cases/${caseId}`)
      .set('x-identity-id', firm.sa.identityId)
      .set('x-tenant-id', firm.tenantId);
    return response.body.team;
  };

  beforeAll(async () => {
    app = await createRealApp();
    migration = await connectAs('migration');
    firm = await makeCaseFirm(migration, `CC Revocación ${nextSuffix()}`, uniqueRfc());
    const { rows } = await migration.query<{ id: string }>(
      `INSERT INTO client (tenant_id, kind, legal_name) VALUES ($1, 'organization', $2) RETURNING id`,
      [firm.tenantId, uniqueName('Cliente Revocación')],
    );
    clientId = rows[0]!.id;
  });

  afterAll(async () => {
    await migration.end();
    await app.close();
  });

  it('SC-008a — every live assignment is closed, and the team read no longer lists them', async () => {
    const leaver = await makeMember(migration, firm.tenantId, 'AA');
    const stays = await makeMember(migration, firm.tenantId, 'AA');

    const caseA = await makeCase();
    const caseB = await makeCase();
    const caseC = await makeCase();

    await assign(caseA, leaver.membershipId);
    await assign(caseB, leaver.membershipId, 'support');
    await assign(caseC, stays.membershipId);

    expect(await readTeam(caseA)).toHaveLength(1);

    const revoked = await revoke(leaver.membershipId);
    expect(revoked.status).toBe(200);

    // Gone from both of theirs...
    expect(await readTeam(caseA)).toEqual([]);
    expect(await readTeam(caseB)).toEqual([]);
    // ...and the third case's team is untouched. The cascade is scoped to the membership,
    // not to the tenant.
    const untouched = await readTeam(caseC);
    expect(untouched).toHaveLength(1);
    expect(untouched[0]!.membershipId).toBe(stays.membershipId);
  });

  it('the historical rows survive — closed, never deleted', async () => {
    const leaver = await makeMember(migration, firm.tenantId, 'PL');
    const caseId = await makeCase();
    await assign(caseId, leaver.membershipId);

    await revoke(leaver.membershipId);

    const { rows } = await migration.query<{ unassigned_at: string | null }>(
      `SELECT unassigned_at FROM case_assignment WHERE membership_id = $1`,
      [leaver.membershipId],
    );
    // FR-012 — a matter's staffing history is not erased because someone left.
    expect(rows).toHaveLength(1);
    expect(rows[0]!.unassigned_at).not.toBeNull();
  });

  it('SC-005 — one case.team_member_unassigned entry per closed assignment', async () => {
    const leaver = await makeMember(migration, firm.tenantId, 'CM');
    const cases = [await makeCase(), await makeCase(), await makeCase()];
    for (const caseId of cases) await assign(caseId, leaver.membershipId);

    await revoke(leaver.membershipId);

    const { rows } = await migration.query<{ metadata: { caseId?: string; reason?: string } }>(
      `SELECT metadata FROM audit_event
        WHERE action = 'case.team_member_unassigned' AND target_id = $1`,
      [leaver.membershipId],
    );

    // Three, one each — not one entry carrying an array. A summarising entry would satisfy
    // neither the count nor a later read that filters by target.
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.metadata.caseId).sort()).toEqual([...cases].sort());
    // The reason is what tells a reader this was a cascade rather than a deliberate act —
    // together with the actor, and with `membership.revoked` sitting beside it.
    expect(rows.every((r) => r.metadata.reason === 'membership_revoked')).toBe(true);
  });

  it('the membership.revoked entry carries the count, so it reads on its own', async () => {
    const leaver = await makeMember(migration, firm.tenantId, 'AA');
    for (const caseId of [await makeCase(), await makeCase()]) {
      await assign(caseId, leaver.membershipId);
    }

    await revoke(leaver.membershipId);

    const { rows } = await migration.query<{ metadata: { closedCaseAssignments?: number } }>(
      `SELECT metadata FROM audit_event WHERE action = 'membership.revoked' AND target_id = $1`,
      [leaver.membershipId],
    );
    expect(rows[0]!.metadata.closedCaseAssignments).toBe(2);
  });

  it('revoking a member with no assignments is a clean no-op', async () => {
    const leaver = await makeMember(migration, firm.tenantId, 'BM');

    const revoked = await revoke(leaver.membershipId);
    expect(revoked.status).toBe(200);

    const { rows } = await migration.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM audit_event
        WHERE action = 'case.team_member_unassigned' AND target_id = $1`,
      [leaver.membershipId],
    );
    expect(rows[0]!.n).toBe('0');
  });

  it('the revoked member\'s next request is refused at membership resolution', async () => {
    const leaver = await makeMember(migration, firm.tenantId, 'AA');
    const caseId = await makeCase();
    await assign(caseId, leaver.membershipId);

    const before = await request(app.getHttpServer())
      .get(`/tenant/cases/${caseId}`)
      .set('x-identity-id', leaver.identityId)
      .set('x-tenant-id', firm.tenantId);
    expect(before.status).toBe(200);

    await revoke(leaver.membershipId);

    // 002/FR-009 refuses this before scope is consulted at all — the cascade is about what
    // the TEAM READ shows, not about the revoked member's own access, which was already
    // handled upstream.
    const after = await request(app.getHttpServer())
      .get(`/tenant/cases/${caseId}`)
      .set('x-identity-id', leaver.identityId)
      .set('x-tenant-id', firm.tenantId);
    expect(after.status).toBe(404);
  });

  it('the cascade shares the revocation\'s transaction — a refused revocation closes nothing', async () => {
    // The last-SA invariant (0019) makes the UPDATE throw. If the cascade ran outside the
    // transaction, or before the revocation, the assignments would be closed anyway and a
    // member who is still live would silently vanish from every matter.
    const onlySa = await makeCaseFirm(migration, `CC Última SA ${nextSuffix()}`, uniqueRfc());
    const { rows: clientRows } = await migration.query<{ id: string }>(
      `INSERT INTO client (tenant_id, kind, legal_name) VALUES ($1, 'person', $2) RETURNING id`,
      [onlySa.tenantId, uniqueName('Cliente SA')],
    );
    const { rows: caseRows } = await migration.query<{ id: string }>(
      `INSERT INTO case_file (tenant_id, client_id, file_number, case_status_id)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [onlySa.tenantId, clientRows[0]!.id, uniqueName('EXP-SA'), onlySa.statusOpenId],
    );

    await request(app.getHttpServer())
      .post(`/tenant/cases/${caseRows[0]!.id}/team`)
      .set('x-identity-id', onlySa.mp.identityId)
      .set('x-tenant-id', onlySa.tenantId)
      .send({ membershipId: onlySa.sa.membershipId, roleOnCase: 'lead' });

    const refused = await request(app.getHttpServer())
      .patch(`/tenant/memberships/${onlySa.sa.membershipId}/revoke`)
      .set('x-identity-id', onlySa.mp.identityId)
      .set('x-tenant-id', onlySa.tenantId)
      .send();
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('last_administrator_protected');

    // Still on the matter — the whole transaction rolled back.
    const { rows } = await migration.query<{ unassigned_at: string | null }>(
      `SELECT unassigned_at FROM case_assignment WHERE membership_id = $1`,
      [onlySa.sa.membershipId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.unassigned_at).toBeNull();
  });
});
