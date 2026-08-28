/**
 * T024 — GET /tenant/directory. contracts/directory-api.md, spec.md User Story 3's
 * five scenarios. Uses a dedicated, throwaway tenant (rather than the two shared
 * seeded ones) because this endpoint has no filter parameter: every OTHER test file's
 * `freshMember()` calls against the shared tenants would otherwise leak into an
 * unfiltered directory read and make the expected counts here nondeterministic.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createRealApp } from '../helpers/real-app';
import { connectAs } from '../helpers/db';
import { uniqueRfc } from '../helpers/rfc';
import { MATRIX } from '../../src/common/authz/matrix';

const INTERNAL_ARCHETYPES = ['SA', 'MP', 'AA', 'PL', 'CM', 'BM'] as const;
const PORTAL_ARCHETYPES = ['CC', 'IC', 'CB', 'EL'] as const;

interface DirectoryItem {
  readonly membershipId: string;
  readonly archetype: string;
  readonly positionId: string | null;
  readonly positionName: string | null;
}

interface Page {
  readonly items: readonly DirectoryItem[];
  readonly nextCursor: string | null;
}

describe('GET /tenant/directory', () => {
  let app: INestApplication;
  let migration: Client;
  let tenantId: string;
  const identityIdByArchetype = new Map<string, string>();
  const membershipIdByArchetype = new Map<string, string>();

  beforeAll(async () => {
    app = await createRealApp();
    migration = await connectAs('migration');

    const tenant = await migration.query<{ id: string }>(
      `INSERT INTO tenant (name, rfc, plan_id)
       VALUES ($1, $2, (SELECT id FROM plan WHERE code = 'esencial'))
       RETURNING id`,
      ['Directory Read Probe, S.C.', uniqueRfc()],
    );
    tenantId = tenant.rows[0]!.id;

    for (const archetype of [...INTERNAL_ARCHETYPES, ...PORTAL_ARCHETYPES]) {
      const identity = await migration.query<{ id: string }>(
        `INSERT INTO identity (subject, email, mfa_enrolled_at) VALUES ($1, $2, now()) RETURNING id`,
        [`idp|dir-read-${archetype}-${Date.now()}-${Math.random()}`, `dir-read-${archetype}-${Date.now()}@example.com`],
      );
      const membership = await migration.query<{ id: string }>(
        `INSERT INTO membership (identity_id, tenant_id, archetype) VALUES ($1, $2, $3) RETURNING id`,
        [identity.rows[0]!.id, tenantId, archetype],
      );
      identityIdByArchetype.set(archetype, identity.rows[0]!.id);
      membershipIdByArchetype.set(archetype, membership.rows[0]!.id);
    }
  });

  afterAll(async () => {
    await migration.end();
    await app.close();
  });

  const asArchetype = (archetype: string) => ({
    'x-identity-id': identityIdByArchetype.get(archetype)!,
    'x-tenant-id': tenantId,
  });

  it('scenario 1 — every internal archetype reads all 10 live memberships of this tenant, none foreign', async () => {
    for (const archetype of INTERNAL_ARCHETYPES) {
      const response = await request(app.getHttpServer())
        .get('/tenant/directory')
        .query({ limit: 50 })
        .set(asArchetype(archetype));

      expect(response.status).toBe(200);
      const page = response.body as Page;
      const ids = page.items.map((i) => i.membershipId);
      for (const expectedId of membershipIdByArchetype.values()) {
        expect(ids).toContain(expectedId);
      }
      expect(page.items).toHaveLength(membershipIdByArchetype.size);
      // "no position assigned" reads as null, not omitted.
      const aa = page.items.find((i) => i.membershipId === membershipIdByArchetype.get('AA'));
      expect(aa).toMatchObject({ archetype: 'AA', positionId: null, positionName: null });
    }
  });

  it('scenario 2 — a revoked membership disappears from the listing; its historical record remains', async () => {
    const revokedId = membershipIdByArchetype.get('CM')!;

    await request(app.getHttpServer())
      .patch(`/tenant/memberships/${revokedId}/revoke`)
      .set(asArchetype('MP'))
      .send()
      .expect(200);

    const response = await request(app.getHttpServer())
      .get('/tenant/directory')
      .query({ limit: 50 })
      .set(asArchetype('SA'));

    const ids = (response.body as Page).items.map((i) => i.membershipId);
    expect(ids).not.toContain(revokedId);

    const stillExists = await migration.query(`SELECT id FROM membership WHERE id = $1`, [revokedId]);
    expect(stillExists.rows).toHaveLength(1); // 002/FR-009 — revoked, never hard-deleted
  });

  it('scenario 3 — each of the four portal archetypes is individually refused', async () => {
    for (const archetype of PORTAL_ARCHETYPES) {
      const response = await request(app.getHttpServer()).get('/tenant/directory').set(asArchetype(archetype));
      expect(response.status, `${archetype} must be refused`).toBe(403);
    }
  });

  it('scenario 4 — PO holds no tenant-scoped capability, including this slice\'s read (004/FR-008)', () => {
    // PO is not a membership archetype at all (research.md D9) — there is no HTTP
    // request shape that puts PO on a tenant-scoped route at all
    // (capability-declared-everywhere.test.ts proves no route mixes @PlatformSurface
    // with a tenant capability), so this is asserted the same way 004 asserts it:
    // directly against the registry this slice extends.
    expect(MATRIX['directory.read'].has('PO')).toBe(false);
  });

  it('scenario 5 — results are paginated in bounded portions with a working cursor', async () => {
    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;

    do {
      const response = await request(app.getHttpServer())
        .get('/tenant/directory')
        .query({ limit: 3, ...(cursor ? { cursor } : {}) })
        .set(asArchetype('SA'));

      expect(response.status).toBe(200);
      const page = response.body as Page;
      expect(page.items.length).toBeLessThanOrEqual(3);

      seen.push(...page.items.map((i) => i.membershipId));
      cursor = page.nextCursor ?? undefined;
      pages += 1;
      expect(pages).toBeLessThan(10);
    } while (cursor);

    // CM was revoked in an earlier test in this file, so 9 of the original 10 remain live.
    const expectedLiveIds = [...membershipIdByArchetype.entries()]
      .filter(([archetype]) => archetype !== 'CM')
      .map(([, id]) => id);
    expect(new Set(seen)).toEqual(new Set(expectedLiveIds));
    expect(pages).toBeGreaterThan(1); // proves the bound actually took effect, not one big page
  });
});
