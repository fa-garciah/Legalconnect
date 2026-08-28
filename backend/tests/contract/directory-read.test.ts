/**
 * T024 — 017/US3 (FR-011..FR-013). The five acceptance scenarios of spec.md User
 * Story 3, over `GET /tenant/directory` (contracts/directory-api.md §2).
 *
 * Every firm in this suite is provisioned by the suite itself, so "every live
 * membership of that tenant appears" can be asserted EXACTLY rather than as a
 * containment — a listing that quietly dropped someone would still pass a subset
 * check, and scenario 1 is precisely about nobody being missing and nobody foreign
 * being present.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createRealApp } from '../helpers/real-app';
import { connectAs } from '../helpers/db';
import { uniqueRfc } from '../helpers/rfc';
import { MATRIX } from '../../src/common/authz/matrix';

const INTERNAL = ['MP', 'AA', 'PL', 'CM', 'BM', 'SA'] as const;
const PORTAL = ['CC', 'IC', 'CB', 'EL'] as const;

interface Actor {
  readonly identityId: string;
  readonly membershipId: string;
  readonly archetype: string;
}

interface DirectoryItem {
  readonly membershipId: string;
  readonly archetype: string;
  readonly positionId: string | null;
  readonly positionName: string | null;
}

let unique = 0;
const nextSuffix = (): string => `${Date.now()}-${(unique += 1)}`;

describe('reading the firm directory', () => {
  let app: INestApplication;
  let migration: Client;

  let firmA: string;
  let firmB: string;
  /** One member of each internal archetype in firm A, keyed by archetype. */
  let internals: Record<string, Actor>;
  let portals: Record<string, Actor>;
  let membersOfB: readonly Actor[];

  async function makeMember(tenantId: string, archetype: string): Promise<Actor> {
    const suffix = nextSuffix();
    const identity = await migration.query<{ id: string }>(
      `INSERT INTO identity (subject, email, mfa_enrolled_at)
       VALUES ($1, $2, now()) RETURNING id`,
      [`idp|t024-${suffix}`, `t024-${suffix}@example.com`],
    );
    const identityId = identity.rows[0]!.id;
    const membership = await migration.query<{ id: string }>(
      `INSERT INTO membership (identity_id, tenant_id, archetype)
       VALUES ($1, $2, $3) RETURNING id`,
      [identityId, tenantId, archetype],
    );
    return { identityId, membershipId: membership.rows[0]!.id, archetype };
  }

  async function makeTenant(label: string): Promise<string> {
    const { rows } = await migration.query<{ id: string }>(
      `INSERT INTO tenant (name, rfc, plan_id)
       VALUES ($1, $2, (SELECT id FROM plan WHERE code = 'esencial'))
       RETURNING id`,
      [`${label}, S.C.`, uniqueRfc()],
    );
    const tenantId = rows[0]!.id;
    for (const name of ['Socio', 'Asociado Senior', 'Asociado', 'Pasante', 'Paralegal']) {
      await migration.query(`INSERT INTO position (tenant_id, name) VALUES ($1, $2)`, [tenantId, name]);
    }
    return tenantId;
  }

  const read = (actor: Actor, tenantId: string, query = '') =>
    request(app.getHttpServer())
      .get(`/tenant/directory${query}`)
      .set('x-identity-id', actor.identityId)
      .set('x-tenant-id', tenantId);

  beforeAll(async () => {
    app = await createRealApp();
    migration = await connectAs('migration');

    firmA = await makeTenant(`T024 Firma A ${nextSuffix()}`);
    firmB = await makeTenant(`T024 Firma B ${nextSuffix()}`);

    internals = {};
    for (const archetype of INTERNAL) internals[archetype] = await makeMember(firmA, archetype);
    portals = {};
    for (const archetype of PORTAL) portals[archetype] = await makeMember(firmA, archetype);

    membersOfB = [await makeMember(firmB, 'SA'), await makeMember(firmB, 'AA')];

    // One position assigned in firm A, so the listing has both shapes to render.
    const socio = await migration.query<{ id: string }>(
      `SELECT id FROM position WHERE tenant_id = $1 AND name = 'Socio'`,
      [firmA],
    );
    await request(app.getHttpServer())
      .patch(`/tenant/directory/entries/${internals.AA!.membershipId}/position`)
      .set('x-identity-id', internals.SA!.identityId)
      .set('x-tenant-id', firmA)
      .send({ positionId: socio.rows[0]!.id });
  });

  afterAll(async () => {
    await migration.end();
    await app.close();
  });

  it.each(INTERNAL)(
    'scenario 1 — %s reads every live membership of its own tenant, with position or null, and 0 foreign entries',
    async (archetype) => {
      const response = await read(internals[archetype]!, firmA);
      expect(response.status).toBe(200);

      const items = response.body.items as readonly DirectoryItem[];
      const seen = new Set(items.map((i) => i.membershipId));

      // Everyone in firm A — internal and portal memberships alike: the directory is
      // who is IN the firm, which is a different question from who may read it.
      for (const actor of [...Object.values(internals), ...Object.values(portals)]) {
        expect(seen.has(actor.membershipId), `${actor.archetype} must appear`).toBe(true);
      }

      // SC-005: 0 entries belonging to any other tenant.
      for (const foreign of membersOfB) {
        expect(seen.has(foreign.membershipId)).toBe(false);
      }
      const foreignRows = await migration.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM membership
          WHERE id = ANY($1::uuid[]) AND tenant_id <> $2`,
        [[...seen], firmA],
      );
      expect(Number(foreignRows.rows[0]!.n)).toBe(0);

      // Both shapes render.
      const assigned = items.find((i) => i.membershipId === internals.AA!.membershipId)!;
      expect(assigned.positionName).toBe('Socio');
      const unassigned = items.find((i) => i.membershipId === internals.PL!.membershipId)!;
      expect(unassigned.positionId).toBeNull();
      expect(unassigned.positionName).toBeNull();
    },
  );

  it('scenario 1b — a DUAL-tenant reader sees only firm A, not their own membership in firm B (SC-005)', async () => {
    // The case `membership`'s second, identity-scoped SELECT policy
    // (backend/drizzle/0013, 002/research.md D3) makes reachable: Postgres ORs
    // permissive policies, so a listing that leaned on RLS alone would hand this
    // reader their own firm B row inside firm A's directory. A single-tenant
    // fixture cannot catch it — which is why this scenario exists separately.
    const suffix = nextSuffix();
    const identity = await migration.query<{ id: string }>(
      `INSERT INTO identity (subject, email, mfa_enrolled_at)
       VALUES ($1, $2, now()) RETURNING id`,
      [`idp|t024-dual-${suffix}`, `t024-dual-${suffix}@example.com`],
    );
    const identityId = identity.rows[0]!.id;

    const inA = await migration.query<{ id: string }>(
      `INSERT INTO membership (identity_id, tenant_id, archetype) VALUES ($1, $2, 'MP') RETURNING id`,
      [identityId, firmA],
    );
    const inB = await migration.query<{ id: string }>(
      `INSERT INTO membership (identity_id, tenant_id, archetype) VALUES ($1, $2, 'SA') RETURNING id`,
      [identityId, firmB],
    );

    const reader: Actor = { identityId, membershipId: inA.rows[0]!.id, archetype: 'MP' };
    const response = await read(reader, firmA);
    expect(response.status).toBe(200);

    const ids = (response.body.items as DirectoryItem[]).map((i) => i.membershipId);
    expect(ids).toContain(inA.rows[0]!.id);
    expect(ids).not.toContain(inB.rows[0]!.id);

    // And symmetrically, reading firm B does not leak the firm A row.
    const fromB = await read({ ...reader, membershipId: inB.rows[0]!.id }, firmB);
    const idsB = (fromB.body.items as DirectoryItem[]).map((i) => i.membershipId);
    expect(idsB).toContain(inB.rows[0]!.id);
    expect(idsB).not.toContain(inA.rows[0]!.id);
  });

  it('scenario 2 — a revoked membership leaves the listing while its directory entry stays intact (FR-004, SC-006)', async () => {
    const leaving = await makeMember(firmA, 'PL');
    const asociado = await migration.query<{ id: string }>(
      `SELECT id FROM position WHERE tenant_id = $1 AND name = 'Asociado'`,
      [firmA],
    );
    const positionId = asociado.rows[0]!.id;

    await request(app.getHttpServer())
      .patch(`/tenant/directory/entries/${leaving.membershipId}/position`)
      .set('x-identity-id', internals.SA!.identityId)
      .set('x-tenant-id', firmA)
      .send({ positionId });

    const before = await read(internals.SA!, firmA);
    expect(
      (before.body.items as DirectoryItem[]).some((i) => i.membershipId === leaving.membershipId),
    ).toBe(true);

    const revoked = await request(app.getHttpServer())
      .patch(`/tenant/memberships/${leaving.membershipId}/revoke`)
      .set('x-identity-id', internals.SA!.identityId)
      .set('x-tenant-id', firmA)
      .send();
    expect(revoked.status).toBe(200);

    const after = await read(internals.SA!, firmA);
    expect(
      (after.body.items as DirectoryItem[]).some((i) => i.membershipId === leaving.membershipId),
    ).toBe(false);

    // Its historical row is untouched — absent from the listing, not deleted.
    const stored = await migration.query<{ position_id: string }>(
      `SELECT position_id FROM directory_entry WHERE membership_id = $1`,
      [leaving.membershipId],
    );
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0]!.position_id).toBe(positionId);
  });

  it.each(PORTAL)(
    'scenario 3 — %s is refused, asserted individually rather than inferred (SC-007)',
    async (archetype) => {
      const response = await read(portals[archetype]!, firmA);
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('not_authorized');
      expect(MATRIX['directory.read'].has(archetype)).toBe(false);
    },
  );

  it.each(PORTAL)('scenario 3b — %s is equally refused the catalog read', async (archetype) => {
    const response = await request(app.getHttpServer())
      .get('/tenant/directory/positions')
      .set('x-identity-id', portals[archetype]!.identityId)
      .set('x-tenant-id', firmA);
    expect(response.status).toBe(403);
  });

  it('scenario 4 — PO holds no tenant-scoped capability and cannot reach the directory (004/FR-008)', async () => {
    // The structural half: PO is simply not in row 24's set, and row 24 is
    // tenant-scoped — which is what makes the HTTP half below unreachable rather
    // than merely refused.
    expect(MATRIX['directory.read'].has('PO')).toBe(false);

    // The HTTP half: the platform operator carries no membership anywhere, and the
    // tenant surface answers a caller with none the generic 404 — never a 200.
    const outsider = await migration.query<{ id: string }>(
      `INSERT INTO identity (subject, email, mfa_enrolled_at)
       VALUES ($1, $2, now()) RETURNING id`,
      [`idp|t024-po-${nextSuffix()}`, `t024-po-${nextSuffix()}@example.com`],
    );
    const response = await request(app.getHttpServer())
      .get('/tenant/directory')
      .set('x-identity-id', outsider.rows[0]!.id)
      .set('x-tenant-id', firmA);
    expect(response.status).toBe(404);
    expect(response.status).not.toBe(200);
  });

  it('scenario 5 — a large firm is returned in bounded portions, with the audit read\'s cursor shape (FR-013, SC-010)', async () => {
    const big = await makeTenant(`T024 Despacho Grande ${nextSuffix()}`);
    const reader = await makeMember(big, 'SA');
    for (let i = 0; i < 24; i += 1) await makeMember(big, 'AA');

    const first = await read(reader, big, '?limit=10');
    expect(first.status).toBe(200);
    expect(first.body.items).toHaveLength(10);
    expect(first.body.nextCursor).toBeTruthy();

    const second = await read(reader, big, `?limit=10&cursor=${encodeURIComponent(first.body.nextCursor)}`);
    expect(second.status).toBe(200);
    expect(second.body.items).toHaveLength(10);

    const firstIds = (first.body.items as DirectoryItem[]).map((i) => i.membershipId);
    const secondIds = (second.body.items as DirectoryItem[]).map((i) => i.membershipId);
    expect(firstIds.filter((id) => secondIds.includes(id))).toEqual([]);

    const third = await read(reader, big, `?limit=10&cursor=${encodeURIComponent(second.body.nextCursor)}`);
    expect(third.body.items).toHaveLength(5);
    expect(third.body.nextCursor).toBeNull();

    // 25 memberships, 3 bounded pages, every one of them accounted for exactly once.
    expect(new Set([...firstIds, ...secondIds, ...(third.body.items as DirectoryItem[]).map((i) => i.membershipId)]).size).toBe(25);
  });

  it('an unbounded read is not offered — the default limit still bounds the page, and a malformed cursor is refused', async () => {
    const defaulted = await read(internals.SA!, firmA);
    expect(defaulted.status).toBe(200);
    expect((defaulted.body.items as DirectoryItem[]).length).toBeLessThanOrEqual(50);

    const malformed = await read(internals.SA!, firmA, '?cursor=not-a-cursor');
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe('validation_failed');

    const overLimit = await read(internals.SA!, firmA, '?limit=5000');
    expect(overLimit.status).toBe(400);
  });
});
