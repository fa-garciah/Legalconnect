/**
 * T018 — POST/PATCH/GET /tenant/directory/positions. contracts/directory-api.md,
 * spec.md User Story 2's five scenarios plus quickstart.md Scenario 2's two D6
 * collision cases.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createRealApp } from '../helpers/real-app';
import { seededTenantIds, type SeededTenants } from '../helpers/tenants';
import { seededIdentities, type SeededIdentities } from '../helpers/identities';
import { connectAs } from '../helpers/db';

const DEFAULT_SEED = ['Socio', 'Asociado Senior', 'Asociado', 'Pasante', 'Paralegal'];

describe('position catalog', () => {
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

  async function freshMember(tenantId: string, archetype: string): Promise<{ membershipId: string; identityId: string }> {
    const migration = await connectAs('migration');
    try {
      const identity = await migration.query<{ id: string }>(
        `INSERT INTO identity (subject, email, mfa_enrolled_at) VALUES ($1, $2, now()) RETURNING id`,
        [`idp|position-catalog-${Date.now()}-${Math.random()}`, `position-catalog-${Date.now()}@example.com`],
      );
      const membership = await migration.query<{ id: string }>(
        `INSERT INTO membership (identity_id, tenant_id, archetype) VALUES ($1, $2, $3) RETURNING id`,
        [identity.rows[0]!.id, tenantId, archetype],
      );
      return { membershipId: membership.rows[0]!.id, identityId: identity.rows[0]!.id };
    } finally {
      await migration.end();
    }
  }

  it('scenario 1 — MP/SA adds a position, available for assignment in that tenant only', async () => {
    const created = await request(app.getHttpServer())
      .post('/tenant/directory/positions')
      .set('x-identity-id', identities.dualId) // MP in tenant A
      .set('x-tenant-id', tenants.a)
      .send({ name: `Of Counsel ${Date.now()}` });

    expect(created.status).toBe(201);
    expect(created.body.status).toBe('active');

    const listedInA = await request(app.getHttpServer())
      .get('/tenant/directory/positions')
      .set('x-identity-id', identities.dualId)
      .set('x-tenant-id', tenants.a);
    expect(listedInA.body.items.map((p: { id: string }) => p.id)).toContain(created.body.id);

    const migration = await connectAs('migration');
    try {
      const { rows } = await migration.query(`SELECT id FROM position WHERE tenant_id = $1`, [tenants.b]);
      expect(rows.map((r: { id: string }) => r.id)).not.toContain(created.body.id);
    } finally {
      await migration.end();
    }
  });

  it('scenario 2 — a foreign tenant\'s catalog entry cannot be reached to retire it', async () => {
    const migration = await connectAs('migration');
    let foreignPositionId: string;
    try {
      const { rows } = await migration.query<{ id: string }>(
        `SELECT id FROM position WHERE tenant_id = $1 AND name = 'Socio'`,
        [tenants.b],
      );
      foreignPositionId = rows[0]!.id;
    } finally {
      await migration.end();
    }

    const response = await request(app.getHttpServer())
      .patch(`/tenant/directory/positions/${foreignPositionId}/retire`)
      .set('x-identity-id', identities.dualId) // acting in tenant A, MP there
      .set('x-tenant-id', tenants.a)
      .send();

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('not_found');
  });

  it('scenario 2b — a tenant\'s own catalog listing never includes another tenant\'s entries', async () => {
    const listedInA = await request(app.getHttpServer())
      .get('/tenant/directory/positions')
      .set('x-identity-id', identities.dualId)
      .set('x-tenant-id', tenants.a);

    const migration = await connectAs('migration');
    try {
      const { rows } = await migration.query<{ id: string }>(`SELECT id FROM position WHERE tenant_id = $1`, [
        tenants.b,
      ]);
      const idsInA: string[] = listedInA.body.items.map((p: { id: string }) => p.id);
      for (const foreign of rows) {
        expect(idsInA).not.toContain(foreign.id);
      }
    } finally {
      await migration.end();
    }
  });

  it('scenario 3 — retiring a held position keeps existing entries readable and blocks new assignment', async () => {
    const created = await request(app.getHttpServer())
      .post('/tenant/directory/positions')
      .set('x-identity-id', identities.dualId)
      .set('x-tenant-id', tenants.a)
      .send({ name: `Retire Me ${Date.now()}` });
    const positionId = created.body.id;

    const { membershipId } = await freshMember(tenants.a, 'AA');
    await request(app.getHttpServer())
      .patch(`/tenant/directory/entries/${membershipId}/position`)
      .set('x-identity-id', identities.dualId)
      .set('x-tenant-id', tenants.a)
      .send({ positionId })
      .expect(200);

    const retired = await request(app.getHttpServer())
      .patch(`/tenant/directory/positions/${positionId}/retire`)
      .set('x-identity-id', identities.dualId)
      .set('x-tenant-id', tenants.a)
      .send();
    expect(retired.status).toBe(200);
    expect(retired.body.status).toBe('retired');

    // Never hard-deleted — still readable, marked retired.
    const list = await request(app.getHttpServer())
      .get('/tenant/directory/positions')
      .set('x-identity-id', identities.dualId)
      .set('x-tenant-id', tenants.a);
    const entry = list.body.items.find((p: { id: string }) => p.id === positionId);
    expect(entry).toMatchObject({ id: positionId, status: 'retired' });

    // Unavailable for a NEW assignment.
    const { membershipId: another } = await freshMember(tenants.a, 'AA');
    const newAssignment = await request(app.getHttpServer())
      .patch(`/tenant/directory/entries/${another}/position`)
      .set('x-identity-id', identities.dualId)
      .set('x-tenant-id', tenants.a)
      .send({ positionId });
    expect(newAssignment.status).toBe(422);
    expect(newAssignment.body.error.code).toBe('position_not_in_catalog');

    // A second retire is refused, not silently accepted.
    const secondRetire = await request(app.getHttpServer())
      .patch(`/tenant/directory/positions/${positionId}/retire`)
      .set('x-identity-id', identities.dualId)
      .set('x-tenant-id', tenants.a)
      .send();
    expect(secondRetire.status).toBe(409);
    expect(secondRetire.body.error.code).toBe('already_retired');
  });

  it('scenario 4 — a freshly provisioned tenant already has the 5-entry default seed, editable', async () => {
    const list = await request(app.getHttpServer())
      .get('/tenant/directory/positions')
      .set('x-identity-id', identities.dualId)
      .set('x-tenant-id', tenants.a);

    const names = list.body.items.map((p: { name: string }) => p.name);
    for (const seeded of DEFAULT_SEED) {
      expect(names).toContain(seeded);
    }
  });

  it('scenario 5 — an archetype other than MP/SA cannot add or retire a catalog entry', async () => {
    const { identityId } = await freshMember(tenants.a, 'CM');

    const add = await request(app.getHttpServer())
      .post('/tenant/directory/positions')
      .set('x-identity-id', identityId)
      .set('x-tenant-id', tenants.a)
      .send({ name: `Should Not Exist ${Date.now()}` });
    expect(add.status).toBe(403);

    const created = await request(app.getHttpServer())
      .post('/tenant/directory/positions')
      .set('x-identity-id', identities.dualId)
      .set('x-tenant-id', tenants.a)
      .send({ name: `Retire Target ${Date.now()}` });

    const retire = await request(app.getHttpServer())
      .patch(`/tenant/directory/positions/${created.body.id}/retire`)
      .set('x-identity-id', identityId)
      .set('x-tenant-id', tenants.a)
      .send();
    expect(retire.status).toBe(403);
  });

  it('D6 — the same name added twice while the first is active is refused with 409', async () => {
    const name = `Duplicate Rank ${Date.now()}`;
    const first = await request(app.getHttpServer())
      .post('/tenant/directory/positions')
      .set('x-identity-id', identities.dualId)
      .set('x-tenant-id', tenants.a)
      .send({ name });
    expect(first.status).toBe(201);

    const second = await request(app.getHttpServer())
      .post('/tenant/directory/positions')
      .set('x-identity-id', identities.dualId)
      .set('x-tenant-id', tenants.a)
      .send({ name: `  ${name.toUpperCase()}  ` }); // whitespace + case variant

    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('position_already_exists');
  });

  it('D6/D4 — the same name succeeds again once the original is retired', async () => {
    const name = `Reusable Rank ${Date.now()}`;
    const first = await request(app.getHttpServer())
      .post('/tenant/directory/positions')
      .set('x-identity-id', identities.dualId)
      .set('x-tenant-id', tenants.a)
      .send({ name });
    expect(first.status).toBe(201);

    await request(app.getHttpServer())
      .patch(`/tenant/directory/positions/${first.body.id}/retire`)
      .set('x-identity-id', identities.dualId)
      .set('x-tenant-id', tenants.a)
      .send()
      .expect(200);

    const second = await request(app.getHttpServer())
      .post('/tenant/directory/positions')
      .set('x-identity-id', identities.dualId)
      .set('x-tenant-id', tenants.a)
      .send({ name });

    expect(second.status).toBe(201);
    expect(second.body.id).not.toBe(first.body.id);
  });

  it('every catalog mutation produces exactly one audit entry (SC-001)', async () => {
    const created = await request(app.getHttpServer())
      .post('/tenant/directory/positions')
      .set('x-identity-id', identities.dualId)
      .set('x-tenant-id', tenants.a)
      .send({ name: `Audited Rank ${Date.now()}` });

    await request(app.getHttpServer())
      .patch(`/tenant/directory/positions/${created.body.id}/retire`)
      .set('x-identity-id', identities.dualId)
      .set('x-tenant-id', tenants.a)
      .send();

    const migration = await connectAs('migration');
    try {
      const createdEvents = await migration.query(
        `SELECT * FROM audit_event WHERE action = 'position.created' AND target_id = $1`,
        [created.body.id],
      );
      expect(createdEvents.rows).toHaveLength(1);

      const retiredEvents = await migration.query(
        `SELECT * FROM audit_event WHERE action = 'position.retired' AND target_id = $1`,
        [created.body.id],
      );
      expect(retiredEvents.rows).toHaveLength(1);
    } finally {
      await migration.end();
    }
  });
});
