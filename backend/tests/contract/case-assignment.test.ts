/**
 * T045 — 006/US3 (FR-009 to FR-012). quickstart.md Scenario 3.
 *
 * **The story the slice exists for.** Everything before this is prerequisite plumbing;
 * this is where 004's `assigned` scope kind becomes real for an archetype that is
 * genuinely restricted by it.
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
  type Actor,
  type CaseFirm,
} from '../helpers/case-core';

describe('the case team', () => {
  let app: INestApplication;
  let migration: Client;
  let firm: CaseFirm;
  let clientId: string;

  const open = async (): Promise<string> => {
    const response = await request(app.getHttpServer())
      .post('/tenant/cases')
      .set('x-identity-id', firm.mp.identityId)
      .set('x-tenant-id', firm.tenantId)
      .send({ clientId, fileNumber: uniqueName('EXP-T'), caseStatusId: firm.statusOpenId });
    return response.body.id as string;
  };

  const assign = (actor: Actor, caseId: string, membershipId: string, roleOnCase = 'lead') =>
    request(app.getHttpServer())
      .post(`/tenant/cases/${caseId}/team`)
      .set('x-identity-id', actor.identityId)
      .set('x-tenant-id', firm.tenantId)
      .send({ membershipId, roleOnCase });

  const unassign = (actor: Actor, caseId: string, membershipId: string) =>
    request(app.getHttpServer())
      .delete(`/tenant/cases/${caseId}/team/${membershipId}`)
      .set('x-identity-id', actor.identityId)
      .set('x-tenant-id', firm.tenantId)
      .send();

  const read = (actor: Actor, caseId: string) =>
    request(app.getHttpServer())
      .get(`/tenant/cases/${caseId}`)
      .set('x-identity-id', actor.identityId)
      .set('x-tenant-id', firm.tenantId);

  beforeAll(async () => {
    app = await createRealApp();
    migration = await connectAs('migration');
    firm = await makeCaseFirm(migration, `CC Equipo ${nextSuffix()}`, uniqueRfc());
    const { rows } = await migration.query<{ id: string }>(
      `INSERT INTO client (tenant_id, kind, legal_name) VALUES ($1, 'organization', $2) RETURNING id`,
      [firm.tenantId, uniqueName('Cliente Equipo')],
    );
    clientId = rows[0]!.id;
  });

  afterAll(async () => {
    await migration.end();
    await app.close();
  });

  it('scenario 1 — an assigned AA resolves as holding scope, and reads the case', async () => {
    const caseId = await open();

    // Before: refused, opaquely.
    const before = await read(firm.aa, caseId);
    expect(before.status).toBe(404);

    const assigned = await assign(firm.mp, caseId, firm.aa.membershipId);
    expect(assigned.status).toBe(201);
    expect(assigned.body).toMatchObject({ caseId, membershipId: firm.aa.membershipId, roleOnCase: 'lead' });

    // After: permitted, with the team listed.
    const after = await read(firm.aa, caseId);
    expect(after.status).toBe(200);
    expect(after.body.team).toHaveLength(1);
    expect(after.body.team[0]).toMatchObject({ membershipId: firm.aa.membershipId, roleOnCase: 'lead' });
  });

  it('scenario 2 (FR-011, SC-001) — unassignment takes effect on the VERY NEXT request', async () => {
    const caseId = await open();
    await assign(firm.mp, caseId, firm.aa.membershipId);
    expect((await read(firm.aa, caseId)).status).toBe(200);

    const removed = await unassign(firm.mp, caseId, firm.aa.membershipId);
    expect(removed.status).toBe(200);

    // No grace period, nothing carried over from a session, nothing to invalidate — the
    // resolver queries inside each request's own transaction.
    const next = await read(firm.aa, caseId);
    expect(next.status).toBe(404);
  });

  it('scenario 3 — unassigning one member leaves the others untouched', async () => {
    const caseId = await open();
    await assign(firm.mp, caseId, firm.aa.membershipId);
    await assign(firm.mp, caseId, firm.pl.membershipId, 'support');

    await unassign(firm.mp, caseId, firm.aa.membershipId);

    expect((await read(firm.aa, caseId)).status).toBe(404);
    const still = await read(firm.pl, caseId);
    expect(still.status).toBe(200);
    expect(still.body.team).toHaveLength(1);
    expect(still.body.team[0].membershipId).toBe(firm.pl.membershipId);
  });

  it('the same live pair cannot be assigned twice', async () => {
    const caseId = await open();
    await assign(firm.mp, caseId, firm.aa.membershipId);

    const again = await assign(firm.mp, caseId, firm.aa.membershipId, 'collaborator');
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('already_assigned');
  });

  it('reassignment creates a NEW row and the historical one survives', async () => {
    const caseId = await open();
    await assign(firm.mp, caseId, firm.cm.membershipId);
    await unassign(firm.mp, caseId, firm.cm.membershipId);

    const again = await assign(firm.mp, caseId, firm.cm.membershipId, 'support');
    expect(again.status).toBe(201);

    // Two rows: one closed, one live. FR-012 — nothing is hard-deleted, and there is no
    // DELETE grant behind a route that could.
    const { rows } = await migration.query<{ unassigned_at: string | null }>(
      `SELECT unassigned_at FROM case_assignment
        WHERE case_id = $1 AND membership_id = $2 ORDER BY assigned_at`,
      [caseId, firm.cm.membershipId],
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]!.unassigned_at).not.toBeNull();
    expect(rows[1]!.unassigned_at).toBeNull();
  });

  it('unassigning someone who is not on the case is refused', async () => {
    const caseId = await open();

    const refused = await unassign(firm.mp, caseId, firm.bm.membershipId);
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('not_assigned');
  });

  it('a revoked membership cannot be assigned', async () => {
    const caseId = await open();
    const leaver = await makeMember(migration, firm.tenantId, 'AA');
    await migration.query(
      `UPDATE membership SET status = 'revoked', revoked_at = now() WHERE id = $1`,
      [leaver.membershipId],
    );

    const refused = await assign(firm.mp, caseId, leaver.membershipId);
    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe('membership_not_available');
  });

  it('another tenant\'s membership cannot be assigned, and the refusal is the same one', async () => {
    const caseId = await open();
    const other = await makeCaseFirm(migration, `CC Equipo Otra ${nextSuffix()}`, uniqueRfc());

    const refused = await assign(firm.mp, caseId, other.aa.membershipId);
    // Identical to the revoked case above — a caller must not be able to tell "revoked" from
    // "belongs to a firm you cannot see" from "does not exist".
    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe('membership_not_available');
  });

  it('a CM not on the case cannot add themselves — staffing is an MP/SA act', async () => {
    const caseId = await open();

    // Looks surprising and is intended: `case.manage_team` resolves at `assigned` scope, so
    // a CM must already be on the matter to change its team. MP and SA satisfy the resolver
    // unconditionally (Decision 2), which is how a matter gets its first member.
    const refused = await assign(firm.cm, caseId, firm.cm.membershipId);
    expect(refused.status).toBe(404);

    // And once on it, they can staff it.
    await assign(firm.mp, caseId, firm.cm.membershipId);
    const permitted = await assign(firm.cm, caseId, firm.pl.membershipId, 'support');
    expect(permitted.status).toBe(201);
  });

  it('AA holds no team management even when assigned', async () => {
    const caseId = await open();
    await assign(firm.mp, caseId, firm.aa.membershipId);

    // Refused on PERMISSION this time, not scope — `AA` is not in row 33's subject set, and
    // 004's ordering puts permission first.
    const refused = await assign(firm.aa, caseId, firm.pl.membershipId);
    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe('not_authorized');
  });

  it('audits the assignment against the MEMBERSHIP, with the case in metadata', async () => {
    const caseId = await open();
    await assign(firm.mp, caseId, firm.bm.membershipId, 'collaborator');

    const { rows } = await migration.query<{
      target_entity: string;
      target_id: string;
      metadata: { caseId?: string; roleOnCase?: string };
      actor_identity_id: string;
    }>(
      `SELECT target_entity, target_id, metadata, actor_identity_id FROM audit_event
        WHERE action = 'case.team_member_assigned' AND target_id = $1
          AND metadata->>'caseId' = $2`,
      [firm.bm.membershipId, caseId],
    );

    expect(rows).toHaveLength(1);
    // 017's `directory.position_assigned` precedent: the subject is the membership whose
    // place changed, not the case.
    expect(rows[0]!.target_entity).toBe('membership');
    expect(rows[0]!.metadata.roleOnCase).toBe('collaborator');
    expect(rows[0]!.actor_identity_id).toBe(firm.mp.identityId);
  });

  it('an invalid role is refused', async () => {
    const caseId = await open();
    const refused = await assign(firm.mp, caseId, firm.aa.membershipId, 'boss');
    expect(refused.status).toBe(400);
  });
});
