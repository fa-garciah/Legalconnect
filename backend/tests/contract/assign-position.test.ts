/**
 * T012 — PATCH /tenant/directory/entries/:membershipId/position.
 * contracts/directory-api.md, spec.md User Story 1's six acceptance scenarios.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createRealApp } from '../helpers/real-app';
import { seededTenantIds, type SeededTenants } from '../helpers/tenants';
import { seededIdentities, type SeededIdentities } from '../helpers/identities';
import { connectAs } from '../helpers/db';

const DEFAULT_SEED = ['Socio', 'Asociado Senior', 'Asociado', 'Pasante', 'Paralegal'];

describe('assign a member position', () => {
  let app: INestApplication;
  let tenants: SeededTenants;
  let identities: SeededIdentities;

  beforeAll(async () => {
    app = await createRealApp();
    tenants = await seededTenantIds();
    identities = await seededIdentities();
  });

  afterAll(async () => {
    await app.close();
  });

  async function freshMember(tenantId: string, archetype: string): Promise<string> {
    const migration = await connectAs('migration');
    try {
      const identity = await migration.query<{ id: string }>(
        `INSERT INTO identity (subject, email, mfa_enrolled_at) VALUES ($1, $2, now()) RETURNING id`,
        [`idp|assign-position-${Date.now()}-${Math.random()}`, `assign-position-${Date.now()}@example.com`],
      );
      const membership = await migration.query<{ id: string }>(
        `INSERT INTO membership (identity_id, tenant_id, archetype) VALUES ($1, $2, $3) RETURNING id`,
        [identity.rows[0]!.id, tenantId, archetype],
      );
      return membership.rows[0]!.id;
    } finally {
      await migration.end();
    }
  }

  async function catalogPositionId(tenantId: string, name: string): Promise<string> {
    const migration = await connectAs('migration');
    try {
      const { rows } = await migration.query<{ id: string }>(
        `SELECT id FROM position WHERE tenant_id = $1 AND name = $2`,
        [tenantId, name],
      );
      if (!rows[0]) throw new Error(`no seeded position named ${name} for tenant ${tenantId}`);
      return rows[0].id;
    } finally {
      await migration.end();
    }
  }

  it('scenario 1 — MP/SA assigns a position; the entry carries it and the change is audited', async () => {
    const membershipId = await freshMember(tenants.a, 'AA');
    const positionId = await catalogPositionId(tenants.a, 'Asociado');

    const response = await request(app.getHttpServer())
      .patch(`/tenant/directory/entries/${membershipId}/position`)
      .set('x-identity-id', identities.dualId) // dual is MP in tenant A
      .set('x-tenant-id', tenants.a)
      .send({ positionId });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ membershipId, positionId, positionName: 'Asociado' });

    const migration = await connectAs('migration');
    try {
      const { rows } = await migration.query(
        `SELECT metadata, actor_identity_id, actor_membership_id, target_id, action
           FROM audit_event WHERE action = 'directory.position_assigned' AND target_id = $1`,
        [membershipId],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].metadata).toEqual({ from: null, to: positionId });
      expect(rows[0].target_id).toBe(membershipId);
      expect(rows[0].actor_identity_id).toBe(identities.dualId);
    } finally {
      await migration.end();
    }
  });

  it('scenario 2 — a position absent from the tenant\'s catalog is refused with 422', async () => {
    const membershipId = await freshMember(tenants.a, 'AA');

    const response = await request(app.getHttpServer())
      .patch(`/tenant/directory/entries/${membershipId}/position`)
      .set('x-identity-id', identities.dualId)
      .set('x-tenant-id', tenants.a)
      .send({ positionId: '00000000-0000-4000-8000-000000000000' });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('position_not_in_catalog');
  });

  it('scenario 2b — a position belonging to another tenant\'s catalog is refused the same way', async () => {
    const membershipId = await freshMember(tenants.a, 'AA');
    const foreignPositionId = await catalogPositionId(tenants.b, 'Socio');

    const response = await request(app.getHttpServer())
      .patch(`/tenant/directory/entries/${membershipId}/position`)
      .set('x-identity-id', identities.dualId)
      .set('x-tenant-id', tenants.a)
      .send({ positionId: foreignPositionId });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('position_not_in_catalog');
  });

  it('scenario 3 — assigning a position to another tenant\'s membership is refused with 404', async () => {
    const membershipInB = await freshMember(tenants.b, 'AA');
    const positionInA = await catalogPositionId(tenants.a, 'Socio');

    const response = await request(app.getHttpServer())
      .patch(`/tenant/directory/entries/${membershipInB}/position`)
      .set('x-identity-id', identities.dualId) // dual's tenant-A session
      .set('x-tenant-id', tenants.a)
      .send({ positionId: positionInA });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('not_found');
  });

  it('scenario 4 — "never assigned" is distinguishable from "assigned to a since-retired position"', async () => {
    const neverAssigned = await freshMember(tenants.a, 'AA');
    const assignedThenRetired = await freshMember(tenants.a, 'AA');

    // A position dedicated to this test, not one of the shared default-seed rows
    // (retirement is one-way — reusing a seeded row like "Pasante" here would
    // permanently retire it out from under every other test that relies on it).
    const migrationSetup = await connectAs('migration');
    let positionId: string;
    try {
      const created = await migrationSetup.query<{ id: string }>(
        `INSERT INTO position (tenant_id, name) VALUES ($1, $2) RETURNING id`,
        [tenants.a, `Scenario 4 Fixture ${Date.now()}-${Math.random()}`],
      );
      positionId = created.rows[0]!.id;
    } finally {
      await migrationSetup.end();
    }

    await request(app.getHttpServer())
      .patch(`/tenant/directory/entries/${assignedThenRetired}/position`)
      .set('x-identity-id', identities.dualId)
      .set('x-tenant-id', tenants.a)
      .send({ positionId })
      .expect(200);

    // Retiring the catalog entry is US2's endpoint; this scenario only concerns what
    // the directory entry itself persists, so the retirement is applied directly.
    const migration = await connectAs('migration');
    try {
      await migration.query(`UPDATE position SET status = 'retired', retired_at = now() WHERE id = $1`, [
        positionId,
      ]);

      const never = await migration.query(`SELECT position_id FROM directory_entry WHERE membership_id = $1`, [
        neverAssigned,
      ]);
      expect(never.rows).toHaveLength(0);

      const retired = await migration.query(`SELECT position_id FROM directory_entry WHERE membership_id = $1`, [
        assignedThenRetired,
      ]);
      expect(retired.rows).toHaveLength(1);
      expect(retired.rows[0].position_id).toBe(positionId);
    } finally {
      await migration.end();
    }
  });

  it('scenario 5 — an archetype other than MP/SA is refused', async () => {
    const membershipId = await freshMember(tenants.a, 'AA');
    const positionId = await catalogPositionId(tenants.a, 'Socio');
    const nonMpSa = await freshMember(tenants.a, 'PL');
    const migration = await connectAs('migration');
    let plIdentityId: string;
    try {
      const { rows } = await migration.query<{ identity_id: string }>(
        `SELECT identity_id FROM membership WHERE id = $1`,
        [nonMpSa],
      );
      plIdentityId = rows[0]!.identity_id;
    } finally {
      await migration.end();
    }

    const response = await request(app.getHttpServer())
      .patch(`/tenant/directory/entries/${membershipId}/position`)
      .set('x-identity-id', plIdentityId)
      .set('x-tenant-id', tenants.a)
      .send({ positionId });

    expect(response.status).toBe(403);
  });

  it('scenario 6 — an unrelated archetype change leaves the assigned position unchanged (004/FR-009)', async () => {
    const membershipId = await freshMember(tenants.a, 'AA');
    const positionId = await catalogPositionId(tenants.a, 'Asociado Senior');

    await request(app.getHttpServer())
      .patch(`/tenant/directory/entries/${membershipId}/position`)
      .set('x-identity-id', identities.dualId)
      .set('x-tenant-id', tenants.a)
      .send({ positionId })
      .expect(200);

    // dual holds MP in tenant A, so a SECOND identity is needed to hold SA and change
    // this membership's archetype without also being the actor under test.
    const migration = await connectAs('migration');
    let saIdentityId: string;
    try {
      const identity = await migration.query<{ id: string }>(
        `INSERT INTO identity (subject, email, mfa_enrolled_at) VALUES ($1, $2, now()) RETURNING id`,
        [`idp|assign-position-sa-${Date.now()}`, `assign-position-sa-${Date.now()}@example.com`],
      );
      saIdentityId = identity.rows[0]!.id;
      await migration.query(`INSERT INTO membership (identity_id, tenant_id, archetype) VALUES ($1, $2, 'SA')`, [
        saIdentityId,
        tenants.a,
      ]);
    } finally {
      await migration.end();
    }

    await request(app.getHttpServer())
      .patch(`/tenant/memberships/${membershipId}/archetype`)
      .set('x-identity-id', saIdentityId)
      .set('x-tenant-id', tenants.a)
      .send({ archetype: 'PL' })
      .expect(200);

    const migration2 = await connectAs('migration');
    try {
      const { rows } = await migration2.query(`SELECT position_id FROM directory_entry WHERE membership_id = $1`, [
        membershipId,
      ]);
      expect(rows[0]!.position_id).toBe(positionId);
    } finally {
      await migration2.end();
    }
  });

  it('clearing a position (positionId: null) is permitted (FR-002, "MAY be unset")', async () => {
    const membershipId = await freshMember(tenants.a, 'AA');
    const positionId = await catalogPositionId(tenants.a, DEFAULT_SEED[0]!);

    await request(app.getHttpServer())
      .patch(`/tenant/directory/entries/${membershipId}/position`)
      .set('x-identity-id', identities.dualId)
      .set('x-tenant-id', tenants.a)
      .send({ positionId })
      .expect(200);

    const cleared = await request(app.getHttpServer())
      .patch(`/tenant/directory/entries/${membershipId}/position`)
      .set('x-identity-id', identities.dualId)
      .set('x-tenant-id', tenants.a)
      .send({ positionId: null });

    expect(cleared.status).toBe(200);
    expect(cleared.body.positionId).toBeNull();
  });
});
