/**
 * T018 — 017/US2 (FR-006..FR-010). The five acceptance scenarios of spec.md User
 * Story 2, plus research.md D6's two collision cases from quickstart.md Scenario 2,
 * over the three catalog routes of contracts/directory-api.md §1.
 *
 * Every WRITE in this suite lands in throwaway tenants this file provisions for
 * itself, never in the two `db:seed` tenants. That is deliberate:
 * `tests/integration/directory-seed.test.ts` (T010) asserts the seeded tenants hold
 * EXACTLY the five default entries, and a contract test that added a sixth would
 * silently break it on the next run without re-seeding. Tenant A is read here and
 * never written — which is exactly what scenario 4 needs of it anyway.
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

const DEFAULT_SEED = ['Socio', 'Asociado Senior', 'Asociado', 'Pasante', 'Paralegal'];

interface Actor {
  readonly identityId: string;
  readonly membershipId: string;
}

interface Firm {
  readonly tenantId: string;
  readonly sa: Actor;
  readonly aa: Actor;
}

let unique = 0;
const nextSuffix = (): string => `${Date.now()}-${(unique += 1)}`;
const uniqueName = (stem: string): string => `${stem} ${nextSuffix()}`;

describe('the position catalog', () => {
  let app: INestApplication;
  let migration: Client;
  let tenants: SeededTenants;
  let identities: SeededIdentities;

  /** This suite's own firms — every write below lands in one of these two. */
  let firm: Firm;
  let otherFirm: Firm;

  async function makeMember(tenantId: string, archetype: string): Promise<Actor> {
    const suffix = nextSuffix();
    const identity = await migration.query<{ id: string }>(
      `INSERT INTO identity (subject, email, mfa_enrolled_at)
       VALUES ($1, $2, now()) RETURNING id`,
      [`idp|t018-${suffix}`, `t018-${suffix}@example.com`],
    );
    const identityId = identity.rows[0]!.id;
    const membership = await migration.query<{ id: string }>(
      `INSERT INTO membership (identity_id, tenant_id, archetype)
       VALUES ($1, $2, $3) RETURNING id`,
      [identityId, tenantId, archetype],
    );
    return { identityId, membershipId: membership.rows[0]!.id };
  }

  /**
   * A tenant carrying the same 5-entry default catalog `drizzle/seed.ts` gives every
   * tenant it creates (research.md D2) — the starting state scenario 4 describes.
   */
  async function makeFirm(label: string): Promise<Firm> {
    const tenant = await migration.query<{ id: string }>(
      `INSERT INTO tenant (name, rfc, plan_id)
       VALUES ($1, $2, (SELECT id FROM plan WHERE code = 'esencial'))
       RETURNING id`,
      [`${label}, S.C.`, uniqueRfc()],
    );
    const tenantId = tenant.rows[0]!.id;
    for (const name of DEFAULT_SEED) {
      await migration.query(`INSERT INTO position (tenant_id, name) VALUES ($1, $2)`, [
        tenantId,
        name,
      ]);
    }
    return { tenantId, sa: await makeMember(tenantId, 'SA'), aa: await makeMember(tenantId, 'AA') };
  }

  const create = (actor: Actor, tenantId: string, name: unknown) =>
    request(app.getHttpServer())
      .post('/tenant/directory/positions')
      .set('x-identity-id', actor.identityId)
      .set('x-tenant-id', tenantId)
      .send({ name });

  const retire = (actor: Actor, tenantId: string, positionId: string) =>
    request(app.getHttpServer())
      .patch(`/tenant/directory/positions/${positionId}/retire`)
      .set('x-identity-id', actor.identityId)
      .set('x-tenant-id', tenantId)
      .send();

  const list = (actor: Actor, tenantId: string) =>
    request(app.getHttpServer())
      .get('/tenant/directory/positions')
      .set('x-identity-id', actor.identityId)
      .set('x-tenant-id', tenantId);

  const assign = (actor: Actor, tenantId: string, membershipId: string, positionId: string | null) =>
    request(app.getHttpServer())
      .patch(`/tenant/directory/entries/${membershipId}/position`)
      .set('x-identity-id', actor.identityId)
      .set('x-tenant-id', tenantId)
      .send({ positionId });

  beforeAll(async () => {
    app = await createRealApp();
    migration = await connectAs('migration');
    tenants = await seededTenantIds();
    identities = await seededIdentities();
    firm = await makeFirm(`T018 Firma ${nextSuffix()}`);
    otherFirm = await makeFirm(`T018 Otra Firma ${nextSuffix()}`);
  });

  afterAll(async () => {
    await migration.end();
    await app.close();
  });

  it('scenario 1 — SA adds a position; it becomes assignable, and only in that tenant', async () => {
    const name = uniqueName('Of Counsel');

    const created = await create(firm.sa, firm.tenantId, name);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name, status: 'active' });
    expect(created.body.id).toBeTruthy();
    expect(created.body.createdAt).toBeTruthy();

    // position.created is audited against the new position (T006's target entity).
    const audited = await migration.query<{ tenant_id: string; target_entity: string; actor_identity_id: string }>(
      `SELECT tenant_id, target_entity, actor_identity_id FROM audit_event
        WHERE action = 'position.created' AND target_id = $1`,
      [created.body.id],
    );
    expect(audited.rows).toHaveLength(1);
    expect(audited.rows[0]!.tenant_id).toBe(firm.tenantId);
    expect(audited.rows[0]!.target_entity).toBe('position');
    expect(audited.rows[0]!.actor_identity_id).toBe(firm.sa.identityId);

    // Available for assignment (Story 1) in this tenant.
    const subject = await makeMember(firm.tenantId, 'PL');
    const assigned = await assign(firm.sa, firm.tenantId, subject.membershipId, created.body.id);
    expect(assigned.status).toBe(200);
    expect(assigned.body.positionName).toBe(name);

    // And in that tenant ONLY — the other firm's catalog never gained it.
    const elsewhere = await list(otherFirm.sa, otherFirm.tenantId);
    expect(elsewhere.status).toBe(200);
    expect(elsewhere.body.items.map((i: { name: string }) => i.name)).not.toContain(name);
  });

  it('scenario 2 — a member of a different tenant can neither read nor write this catalog, and the attempt is recorded', async () => {
    const before = await migration.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_event
        WHERE tenant_id = $1 AND action = 'tenant.cross_access_attempted'`,
      [firm.tenantId],
    );

    // otherFirm's SA holds no membership in `firm` at all — activation itself fails.
    const read = await list(otherFirm.sa, firm.tenantId);
    expect(read.status).toBe(404);

    const write = await create(otherFirm.sa, firm.tenantId, uniqueName('Intruso'));
    expect(write.status).toBe(404);

    const after = await migration.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_event
        WHERE tenant_id = $1 AND action = 'tenant.cross_access_attempted'`,
      [firm.tenantId],
    );
    expect(Number(after.rows[0]!.count)).toBe(Number(before.rows[0]!.count) + 2);

    // Nothing was created.
    const created = await migration.query(
      `SELECT id FROM position WHERE tenant_id = $1 AND name LIKE 'Intruso%'`,
      [firm.tenantId],
    );
    expect(created.rows).toHaveLength(0);
  });

  it("scenario 2b — retiring another tenant's position from inside my own answers the generic 404", async () => {
    const foreign = await create(otherFirm.sa, otherFirm.tenantId, uniqueName('Ajeno'));
    expect(foreign.status).toBe(201);

    const reached = await retire(firm.sa, firm.tenantId, foreign.body.id);
    const absent = await retire(firm.sa, firm.tenantId, '00000000-0000-4000-8000-000000000000');

    expect(reached.status).toBe(404);
    expect(reached.body).toEqual(absent.body);
    expect(reached.body).toEqual({
      error: { code: 'not_found', message: 'The requested resource does not exist.' },
    });

    // RLS refused it; the foreign position is untouched.
    const still = await migration.query<{ status: string }>(
      `SELECT status FROM position WHERE id = $1`,
      [foreign.body.id],
    );
    expect(still.rows[0]!.status).toBe('active');
  });

  it('scenario 3 — retiring a held position keeps it on existing entries, marked retired, and off new assignments; it is never deleted', async () => {
    const name = uniqueName('Socio Fundador');
    const created = await create(firm.sa, firm.tenantId, name);
    expect(created.status).toBe(201);
    const positionId = created.body.id as string;

    const holder = await makeMember(firm.tenantId, 'AA');
    expect((await assign(firm.sa, firm.tenantId, holder.membershipId, positionId)).status).toBe(200);

    const retired = await retire(firm.sa, firm.tenantId, positionId);
    expect(retired.status).toBe(200);
    expect(retired.body).toMatchObject({ id: positionId, name, status: 'retired' });
    expect(retired.body.retiredAt).toBeTruthy();

    // Audited.
    const audited = await migration.query(
      `SELECT id FROM audit_event WHERE action = 'position.retired' AND target_id = $1`,
      [positionId],
    );
    expect(audited.rows).toHaveLength(1);

    // FR-007 — the row is still there, status changed, never hard-deleted.
    const row = await migration.query<{ status: string; retired_at: string | null }>(
      `SELECT status, retired_at FROM position WHERE id = $1`,
      [positionId],
    );
    expect(row.rows).toHaveLength(1);
    expect(row.rows[0]!.status).toBe('retired');
    expect(row.rows[0]!.retired_at).not.toBeNull();

    // FR-008 — the existing entry still names it, and the listing still labels it.
    const stillHeld = await migration.query<{ position_id: string }>(
      `SELECT position_id FROM directory_entry WHERE membership_id = $1`,
      [holder.membershipId],
    );
    expect(stillHeld.rows[0]!.position_id).toBe(positionId);

    const listed = await list(firm.sa, firm.tenantId);
    expect(listed.body.items).toContainEqual({ id: positionId, name, status: 'retired' });

    // FR-008 — but no NEW assignment may name it.
    const other = await makeMember(firm.tenantId, 'PL');
    const refused = await assign(firm.sa, firm.tenantId, other.membershipId, positionId);
    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe('position_not_in_catalog');
  });

  it('scenario 3b — retiring an already-retired position is refused 409, not silently accepted', async () => {
    const created = await create(firm.sa, firm.tenantId, uniqueName('Efimero'));
    const positionId = created.body.id as string;

    expect((await retire(firm.sa, firm.tenantId, positionId)).status).toBe(200);

    const second = await retire(firm.sa, firm.tenantId, positionId);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('already_retired');

    // Exactly one position.retired entry — the refused second attempt wrote none.
    const audited = await migration.query(
      `SELECT id FROM audit_event WHERE action = 'position.retired' AND target_id = $1`,
      [positionId],
    );
    expect(audited.rows).toHaveLength(1);
  });

  it("scenario 4 — a provisioned tenant's catalog already reads the 5-entry default seed, through the product's own read path", async () => {
    // dual holds MP in tenant A; `directory.read` covers MP (row 24). Tenant A is
    // only READ here — see this file's header.
    const mp: Actor = { identityId: identities.dualId, membershipId: identities.dualMembershipA };

    const response = await list(mp, tenants.a);
    expect(response.status).toBe(200);

    const items = response.body.items as ReadonlyArray<{ name: string; status: string }>;
    expect(items.map((i) => i.name).sort()).toEqual([...DEFAULT_SEED].sort());
    expect(items.every((i) => i.status === 'active')).toBe(true);
  });

  it('scenario 4b — those seeded entries are immediately editable: 0 setup steps before the first retire or add', async () => {
    // Same starting state, in a tenant this suite may safely mutate.
    const fresh = await makeFirm(`T018 Recien Provisionada ${nextSuffix()}`);

    const before = await list(fresh.sa, fresh.tenantId);
    expect((before.body.items as { name: string }[]).map((i) => i.name).sort()).toEqual(
      [...DEFAULT_SEED].sort(),
    );

    const pasante = (before.body.items as { id: string; name: string }[]).find(
      (i) => i.name === 'Pasante',
    )!;
    expect((await retire(fresh.sa, fresh.tenantId, pasante.id)).status).toBe(200);
    expect((await create(fresh.sa, fresh.tenantId, uniqueName('Consejero'))).status).toBe(201);
  });

  it('scenario 5 — an archetype other than MP or SA cannot add or retire (but may read — row 24)', async () => {
    const target = await create(firm.sa, firm.tenantId, uniqueName('Solo Lectura'));
    const positionId = target.body.id as string;

    const added = await create(firm.aa, firm.tenantId, uniqueName('No Deberia Existir'));
    expect(added.status).toBe(403);
    expect(added.body.error.code).toBe('not_authorized');

    const retired = await retire(firm.aa, firm.tenantId, positionId);
    expect(retired.status).toBe(403);
    expect(retired.body.error.code).toBe('not_authorized');

    // Row 24 is the one row every internal archetype holds.
    const read = await list(firm.aa, firm.tenantId);
    expect(read.status).toBe(200);

    const untouched = await migration.query<{ status: string }>(
      `SELECT status FROM position WHERE id = $1`,
      [positionId],
    );
    expect(untouched.rows[0]!.status).toBe('active');
  });

  it('D6 — the same name added twice while the first is active is refused 409 position_already_exists', async () => {
    const name = uniqueName('Abogado Junior');
    expect((await create(firm.sa, firm.tenantId, name)).status).toBe(201);

    const exact = await create(firm.sa, firm.tenantId, name);
    expect(exact.status).toBe(409);
    expect(exact.body.error.code).toBe('position_already_exists');

    // Case- and whitespace-insensitive, matching the functional unique index.
    const shouted = await create(firm.sa, firm.tenantId, `  ${name.toUpperCase()} `);
    expect(shouted.status).toBe(409);
    expect(shouted.body.error.code).toBe('position_already_exists');

    const stored = await migration.query(
      `SELECT id FROM position WHERE tenant_id = $1 AND lower(trim(name)) = lower(trim($2))`,
      [firm.tenantId, name],
    );
    expect(stored.rows).toHaveLength(1);
  });

  it('D6 — the same name succeeds again once the original is retired (the retire-then-recreate pattern, D4)', async () => {
    const name = uniqueName('Abogado Senior');

    const first = await create(firm.sa, firm.tenantId, name);
    expect(first.status).toBe(201);

    expect((await create(firm.sa, firm.tenantId, name)).status).toBe(409);

    expect((await retire(firm.sa, firm.tenantId, first.body.id)).status).toBe(200);

    const again = await create(firm.sa, firm.tenantId, name);
    expect(again.status).toBe(201);
    expect(again.body.id).not.toBe(first.body.id);

    // Two rows now share the name: one retired, one active. Existing assignments
    // pointing at the retired row keep pointing there (D4).
    const rows = await migration.query<{ status: string }>(
      `SELECT status FROM position WHERE tenant_id = $1 AND name = $2 ORDER BY created_at`,
      [firm.tenantId, name],
    );
    expect(rows.rows.map((r) => r.status)).toEqual(['retired', 'active']);
  });

  it('the same name in two different tenants is not a collision — the catalog is per firm (FR-006)', async () => {
    const name = uniqueName('Especialista');

    expect((await create(firm.sa, firm.tenantId, name)).status).toBe(201);
    expect((await create(otherFirm.sa, otherFirm.tenantId, name)).status).toBe(201);
  });

  it('a blank, over-long or non-string name is refused as validation, not as a collision', async () => {
    for (const bad of ['', '   ', 42, null, 'x'.repeat(121)]) {
      const response = await create(firm.sa, firm.tenantId, bad);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('validation_failed');
    }

    // The boundary itself is legal — the cap refuses 121, not 120.
    const atTheLimit = await create(firm.sa, firm.tenantId, `${'y'.repeat(110)}${nextSuffix().slice(-9)}`);
    expect(atTheLimit.status).toBe(201);
  });
});
