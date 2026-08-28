/**
 * T012 — 017/US1 (FR-001..FR-005, FR-010). The six acceptance scenarios of
 * spec.md User Story 1, over `PATCH /tenant/directory/entries/:membershipId/position`
 * (contracts/directory-api.md §2).
 *
 * Scenario 4 ("never assigned" vs. "assigned-then-retired") is asserted at the
 * storage level rather than through `GET /tenant/directory`: that read is User
 * Story 3's route, and US1's own checkpoint requires this story to be
 * independently shippable without it. quickstart.md Scenario 1 states the
 * distinction in exactly those terms — `positionId: null` vs. a real id whose
 * catalog entry reads `status: retired`. US3's own suite re-asserts it over HTTP.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createRealApp } from '../helpers/real-app';
import { seededTenantIds, type SeededTenants } from '../helpers/tenants';
import { seededIdentities, type SeededIdentities } from '../helpers/identities';
import { connectAs } from '../helpers/db';
import { uniqueRfc } from '../helpers/rfc';

interface Actor {
  readonly identityId: string;
  readonly membershipId: string;
}

let unique = 0;
const nextSuffix = (): string => `${Date.now()}-${(unique += 1)}`;

describe('assigning a position to a membership', () => {
  let app: INestApplication;
  let tenants: SeededTenants;
  let identities: SeededIdentities;
  let migration: Client;

  /** A real SA of tenant A — the seeded dual identity is MP there, not SA. */
  let saInA: Actor;
  /** A real AA of tenant A — an archetype holding none of this slice's rows. */
  let aaInA: Actor;

  async function makeMember(tenantId: string, archetype: string): Promise<Actor> {
    const suffix = nextSuffix();
    const identity = await migration.query<{ id: string }>(
      `INSERT INTO identity (subject, email, mfa_enrolled_at)
       VALUES ($1, $2, now()) RETURNING id`,
      [`idp|t012-${suffix}`, `t012-${suffix}@example.com`],
    );
    const identityId = identity.rows[0]!.id;
    const membership = await migration.query<{ id: string }>(
      `INSERT INTO membership (identity_id, tenant_id, archetype)
       VALUES ($1, $2, $3) RETURNING id`,
      [identityId, tenantId, archetype],
    );
    return { identityId, membershipId: membership.rows[0]!.id };
  }

  async function positionIn(tenantId: string, name: string): Promise<string> {
    const { rows } = await migration.query<{ id: string }>(
      `SELECT id FROM position WHERE tenant_id = $1 AND name = $2`,
      [tenantId, name],
    );
    if (!rows[0]) throw new Error(`no seeded position "${name}" in tenant ${tenantId}`);
    return rows[0].id;
  }

  /**
   * A throwaway tenant, for the one scenario that has to CREATE a catalog entry.
   * The two `db:seed` tenants are never written to by this suite:
   * `tests/integration/directory-seed.test.ts` asserts they hold exactly the five
   * default entries, and a contract test that added a sixth would break it on the
   * next run without re-seeding.
   */
  async function makeTenant(label: string): Promise<string> {
    const { rows } = await migration.query<{ id: string }>(
      `INSERT INTO tenant (name, rfc, plan_id)
       VALUES ($1, $2, (SELECT id FROM plan WHERE code = 'esencial'))
       RETURNING id`,
      [`${label}, S.C.`, uniqueRfc()],
    );
    return rows[0]!.id;
  }

  const assignAs = (
    actor: Actor,
    tenantId: string,
    membershipId: string,
    positionId: string | null,
  ) =>
    request(app.getHttpServer())
      .patch(`/tenant/directory/entries/${membershipId}/position`)
      .set('x-identity-id', actor.identityId)
      .set('x-tenant-id', tenantId)
      .send({ positionId });

  beforeAll(async () => {
    app = await createRealApp();
    tenants = await seededTenantIds();
    identities = await seededIdentities();
    migration = await connectAs('migration');
    saInA = await makeMember(tenants.a, 'SA');
    aaInA = await makeMember(tenants.a, 'AA');
  });

  afterAll(async () => {
    await migration.end();
    await app.close();
  });

  it('scenario 1 — SA assigns a catalog position; the entry carries it and the change is audited with actor, subject, previous and new value', async () => {
    const subject = await makeMember(tenants.a, 'PL');
    const socio = await positionIn(tenants.a, 'Socio');

    const response = await assignAs(saInA, tenants.a, subject.membershipId, socio);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      membershipId: subject.membershipId,
      positionId: socio,
      positionName: 'Socio',
    });

    const stored = await migration.query<{ position_id: string }>(
      `SELECT position_id FROM directory_entry WHERE membership_id = $1`,
      [subject.membershipId],
    );
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0]!.position_id).toBe(socio);

    const audited = await migration.query<{
      metadata: unknown;
      target_entity: string;
      actor_identity_id: string;
      actor_membership_id: string;
      tenant_id: string;
    }>(
      `SELECT metadata, target_entity, actor_identity_id, actor_membership_id, tenant_id
         FROM audit_event
        WHERE action = 'directory.position_assigned' AND target_id = $1`,
      [subject.membershipId],
    );
    expect(audited.rows).toHaveLength(1);
    const entry = audited.rows[0]!;
    expect(entry.target_entity).toBe('membership');
    expect(entry.tenant_id).toBe(tenants.a);
    expect(entry.actor_identity_id).toBe(saInA.identityId);
    expect(entry.actor_membership_id).toBe(saInA.membershipId);
    expect(entry.metadata).toEqual({ from: null, to: socio });
  });

  it('scenario 1b — MP holds the row too (Decision 1), and a re-assignment records the previous value', async () => {
    const subject = await makeMember(tenants.a, 'PL');
    const socio = await positionIn(tenants.a, 'Socio');
    const asociado = await positionIn(tenants.a, 'Asociado');

    // dual holds MP in tenant A.
    const mp: Actor = { identityId: identities.dualId, membershipId: identities.dualMembershipA };

    const first = await assignAs(mp, tenants.a, subject.membershipId, socio);
    expect(first.status).toBe(200);

    const second = await assignAs(mp, tenants.a, subject.membershipId, asociado);
    expect(second.status).toBe(200);
    expect(second.body.positionId).toBe(asociado);

    const { rows } = await migration.query<{ metadata: { from: string | null; to: string | null } }>(
      `SELECT metadata FROM audit_event
        WHERE action = 'directory.position_assigned' AND target_id = $1
        ORDER BY occurred_at, id`,
      [subject.membershipId],
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]!.metadata).toEqual({ from: null, to: socio });
    expect(rows[1]!.metadata).toEqual({ from: socio, to: asociado });

    // Still exactly one directory_entry row — the upsert never duplicates (research.md D1).
    const stored = await migration.query(
      `SELECT id FROM directory_entry WHERE membership_id = $1`,
      [subject.membershipId],
    );
    expect(stored.rows).toHaveLength(1);
  });

  it("scenario 2 — a positionId absent from the tenant's own catalog is refused 422 position_not_in_catalog", async () => {
    const subject = await makeMember(tenants.a, 'PL');

    const absent = await assignAs(
      saInA,
      tenants.a,
      subject.membershipId,
      '00000000-0000-4000-8000-000000000000',
    );
    expect(absent.status).toBe(422);
    expect(absent.body.error.code).toBe('position_not_in_catalog');

    // FR-010's second half: another tenant's catalog entry is equally not in mine.
    const foreignPosition = await positionIn(tenants.b, 'Socio');
    const foreign = await assignAs(saInA, tenants.a, subject.membershipId, foreignPosition);
    expect(foreign.status).toBe(422);
    expect(foreign.body.error.code).toBe('position_not_in_catalog');
    // Indistinguishable from "no such position at all" — a caller cannot probe
    // another tenant's catalog through this refusal.
    expect(foreign.body).toEqual(absent.body);

    // SC-002: 0 assignments succeeded.
    const stored = await migration.query(
      `SELECT id FROM directory_entry WHERE membership_id = $1`,
      [subject.membershipId],
    );
    expect(stored.rows).toHaveLength(0);
  });

  it('scenario 3 — reaching a membership of another tenant is refused 404, indistinguishable from one that does not exist', async () => {
    const subjectInB = await makeMember(tenants.b, 'PL');
    const socio = await positionIn(tenants.a, 'Socio');

    const foreign = await assignAs(saInA, tenants.a, subjectInB.membershipId, socio);
    const absent = await assignAs(saInA, tenants.a, '00000000-0000-4000-8000-000000000001', socio);

    expect(foreign.status).toBe(404);
    expect(foreign.status).not.toBe(403);
    expect(foreign.body).toEqual(absent.body);
    expect(foreign.body).toEqual({
      error: { code: 'not_found', message: 'The requested resource does not exist.' },
    });

    // SC-003: nothing was written into tenant B.
    const stored = await migration.query(
      `SELECT id FROM directory_entry WHERE membership_id = $1`,
      [subjectInB.membershipId],
    );
    expect(stored.rows).toHaveLength(0);
  });

  it('scenario 3b — activating another tenant outright is refused and recorded as a cross-tenant attempt (001/FR-008)', async () => {
    const subjectInB = await makeMember(tenants.b, 'PL');
    const socioInB = await positionIn(tenants.b, 'Socio');

    const before = await migration.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_event
        WHERE tenant_id = $1 AND action = 'tenant.cross_access_attempted'`,
      [tenants.b],
    );

    // saInA holds no membership in tenant B at all — activation itself fails.
    const response = await assignAs(saInA, tenants.b, subjectInB.membershipId, socioInB);
    expect(response.status).toBe(404);

    const after = await migration.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_event
        WHERE tenant_id = $1 AND action = 'tenant.cross_access_attempted'`,
      [tenants.b],
    );
    expect(Number(after.rows[0]!.count)).toBe(Number(before.rows[0]!.count) + 1);
  });

  it('scenario 4 — "never assigned" and "assigned to a since-retired position" are different facts', async () => {
    // Its own tenant: this is the one scenario that creates a catalog entry, and the
    // seeded tenants stay pristine (see makeTenant).
    const tenantId = await makeTenant(`T012 Rangos ${nextSuffix()}`);
    const sa = await makeMember(tenantId, 'SA');
    const neverAssigned = await makeMember(tenantId, 'PL');
    const holdsRetired = await makeMember(tenantId, 'PL');

    // A position of this tenant's own catalog, created for this test and then
    // retired directly — retirement is US2's endpoint, which US1 must not depend on.
    const created = await migration.query<{ id: string }>(
      `INSERT INTO position (tenant_id, name) VALUES ($1, $2) RETURNING id`,
      [tenantId, `Rango Historico ${nextSuffix()}`],
    );
    const retiring = created.rows[0]!.id;

    expect((await assignAs(sa, tenantId, holdsRetired.membershipId, retiring)).status).toBe(200);

    await migration.query(
      `UPDATE position SET status = 'retired', retired_at = now() WHERE id = $1`,
      [retiring],
    );

    const both = await migration.query<{
      membership_id: string;
      position_id: string | null;
      status: string | null;
    }>(
      `SELECT m.id AS membership_id, d.position_id, p.status
         FROM membership m
         LEFT JOIN directory_entry d ON d.membership_id = m.id
         LEFT JOIN position p ON p.id = d.position_id
        WHERE m.id = ANY($1::uuid[])`,
      [[neverAssigned.membershipId, holdsRetired.membershipId]],
    );

    const never = both.rows.find((r) => r.membership_id === neverAssigned.membershipId)!;
    const retired = both.rows.find((r) => r.membership_id === holdsRetired.membershipId)!;
    expect(never.position_id).toBeNull();
    expect(never.status).toBeNull();
    expect(retired.position_id).toBe(retiring);
    expect(retired.status).toBe('retired');

    // FR-008: a retired position may not be NEWLY assigned, and the refusal is the
    // same 422 a nonexistent one gets — "retired" and "never existed" stay
    // indistinguishable on the wire (contracts/directory-api.md §2).
    const refused = await assignAs(sa, tenantId, neverAssigned.membershipId, retiring);
    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe('position_not_in_catalog');
  });

  it('scenario 5 — an archetype other than MP or SA is refused 403', async () => {
    const subject = await makeMember(tenants.a, 'PL');
    const socio = await positionIn(tenants.a, 'Socio');

    const response = await assignAs(aaInA, tenants.a, subject.membershipId, socio);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('not_authorized');

    const stored = await migration.query(
      `SELECT id FROM directory_entry WHERE membership_id = $1`,
      [subject.membershipId],
    );
    expect(stored.rows).toHaveLength(0);
  });

  it('scenario 6 — an independent archetype change (004/FR-009) leaves the position untouched (SC-009)', async () => {
    const subject = await makeMember(tenants.a, 'PL');
    const socio = await positionIn(tenants.a, 'Socio');

    expect((await assignAs(saInA, tenants.a, subject.membershipId, socio)).status).toBe(200);

    const changed = await request(app.getHttpServer())
      .patch(`/tenant/memberships/${subject.membershipId}/archetype`)
      .set('x-identity-id', saInA.identityId)
      .set('x-tenant-id', tenants.a)
      .send({ archetype: 'CM' });
    expect(changed.status).toBe(200);
    expect(changed.body.archetype).toBe('CM');

    const after = await migration.query<{ position_id: string; archetype: string }>(
      `SELECT d.position_id, m.archetype
         FROM membership m JOIN directory_entry d ON d.membership_id = m.id
        WHERE m.id = $1`,
      [subject.membershipId],
    );
    expect(after.rows[0]!.position_id).toBe(socio);
    expect(after.rows[0]!.archetype).toBe('CM');
  });

  it('a malformed positionId is refused as validation, before it can reach a ::uuid cast', async () => {
    const subject = await makeMember(tenants.a, 'PL');

    for (const bad of ['not-a-uuid', 42, {}]) {
      const response = await request(app.getHttpServer())
        .patch(`/tenant/directory/entries/${subject.membershipId}/position`)
        .set('x-identity-id', saInA.identityId)
        .set('x-tenant-id', tenants.a)
        .send({ positionId: bad });
      // 400, never a 500 from a failed cast — and never a 422, which would imply the
      // value was a well-formed id that simply is not in the catalog.
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('validation_failed');
    }
  });

  it('FR-002 — positionId: null clears the assignment without deleting the entry', async () => {
    const subject = await makeMember(tenants.a, 'PL');
    const socio = await positionIn(tenants.a, 'Socio');

    expect((await assignAs(saInA, tenants.a, subject.membershipId, socio)).status).toBe(200);

    const cleared = await assignAs(saInA, tenants.a, subject.membershipId, null);
    expect(cleared.status).toBe(200);
    expect(cleared.body).toMatchObject({ positionId: null, positionName: null });

    // FR-004: the row persists; only its position_id is nulled.
    const stored = await migration.query<{ position_id: string | null }>(
      `SELECT position_id FROM directory_entry WHERE membership_id = $1`,
      [subject.membershipId],
    );
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0]!.position_id).toBeNull();
  });
});
