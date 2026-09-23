/**
 * 014-admin-ui T006 / Decision 5 — `GET /tenant/members` (contracts/admin-screens.md §1.2).
 *
 * The administration screen's user list. Before this route the only list of a firm's people was
 * `GET /tenant/directory`, which carries membership UUIDs, archetypes and positions — no way to
 * tell one person from another. This route adds the member's email, for `SA` and `MP` only
 * (`membership.read_tenant`, matrix row 5, registered by 004 and claimed by no route until now).
 *
 * Its own firm, provisioned here, so the seeded tenants' member counts stay what other suites
 * expect. The row-level half of the guarantee (no other firm's email is reachable at all) is
 * `members-email-isolation.test.ts`; this suite is the HTTP contract.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createAuthenticatedApp } from '../helpers/real-app';
import { connectAs } from '../helpers/db';
import { uniqueRfc } from '../helpers/rfc';
import { makeCaseFirm, makeMember, nextSuffix, type Actor, type CaseFirm } from '../helpers/case-core';

describe('GET /tenant/members (014 Decision 5)', () => {
  let app: INestApplication;
  let migration: Client;
  let firm: CaseFirm;
  let other: CaseFirm;
  let revoked: Actor;

  const list = (actor: Actor, tenantId = firm.tenantId, channel?: string) => {
    const call = request(app.getHttpServer())
      .get('/tenant/members')
      .set('x-identity-id', actor.identityId)
      .set('x-tenant-id', tenantId);
    return channel ? call.set('x-channel', channel) : call;
  };

  const emailOf = async (actor: Actor): Promise<string> => {
    const { rows } = await migration.query<{ email: string }>(
      `SELECT email FROM identity WHERE id = $1`,
      [actor.identityId],
    );
    return rows[0]!.email;
  };

  const auditEntries = async (tenantId: string): Promise<number> => {
    const { rows } = await migration.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM audit_event WHERE action = 'membership.list_read' AND tenant_id = $1`,
      [tenantId],
    );
    return Number(rows[0]!.n);
  };

  beforeAll(async () => {
    app = await createAuthenticatedApp();
    migration = await connectAs('migration');
    firm = await makeCaseFirm(migration, `CC Miembros ${nextSuffix()}`, uniqueRfc());
    other = await makeCaseFirm(migration, `CC Otros ${nextSuffix()}`, uniqueRfc());

    revoked = await makeMember(migration, firm.tenantId, 'AA');
    await migration.query(
      `UPDATE membership SET status = 'revoked', revoked_at = now() WHERE id = $1`,
      [revoked.membershipId],
    );

    const position = await migration.query<{ id: string }>(
      `INSERT INTO position (tenant_id, name) VALUES ($1, 'Asociado Senior') RETURNING id`,
      [firm.tenantId],
    );
    await migration.query(
      `INSERT INTO directory_entry (tenant_id, membership_id, position_id) VALUES ($1, $2, $3)`,
      [firm.tenantId, firm.aa.membershipId, position.rows[0]!.id],
    );
  });

  afterAll(async () => {
    await migration?.end();
    await app?.close();
  });

  it('returns every live member of the active firm with email, archetype and position', async () => {
    const response = await list(firm.sa);
    expect(response.status).toBe(200);

    const items = response.body.items as Array<Record<string, unknown>>;
    const expected = [firm.mp, firm.sa, firm.aa, firm.pl, firm.cm, firm.bm];
    expect(items).toHaveLength(expected.length);

    for (const actor of expected) {
      const item = items.find((i) => i.membershipId === actor.membershipId);
      expect(item, `member ${actor.membershipId} missing`).toBeDefined();
      expect(item!.email).toBe(await emailOf(actor));
    }

    const aa = items.find((i) => i.membershipId === firm.aa.membershipId)!;
    expect(aa).toEqual({
      membershipId: firm.aa.membershipId,
      email: await emailOf(firm.aa),
      archetype: 'AA',
      positionName: 'Asociado Senior',
    });
    expect(items.find((i) => i.membershipId === firm.mp.membershipId)!.positionName).toBeNull();
  });

  it('omits a revoked membership', async () => {
    const response = await list(firm.mp);
    const ids = (response.body.items as Array<{ membershipId: string }>).map((i) => i.membershipId);
    expect(ids).not.toContain(revoked.membershipId);
  });

  it('never includes another firm’s members', async () => {
    const response = await list(firm.mp);
    const emails = (response.body.items as Array<{ email: string }>).map((i) => i.email);
    expect(emails).not.toContain(await emailOf(other.mp));
  });

  it.each(['SA', 'MP'] as const)('%s is allowed', async (archetype) => {
    const actor = archetype === 'SA' ? firm.sa : firm.mp;
    expect((await list(actor)).status).toBe(200);
  });

  it.each(['AA', 'PL', 'CM', 'BM'] as const)('%s is refused with 403', async (archetype) => {
    const actor = { AA: firm.aa, PL: firm.pl, CM: firm.cm, BM: firm.bm }[archetype];
    const response = await list(actor);
    expect(response.status).toBe(403);
    expect(JSON.stringify(response.body)).not.toContain('@example.com');
  });

  it('an interactive read writes exactly one audit entry, with no email in it', async () => {
    const before = await auditEntries(firm.tenantId);
    expect((await list(firm.mp)).status).toBe(200);
    expect(await auditEntries(firm.tenantId)).toBe(before + 1);

    const { rows } = await migration.query<{ metadata: unknown; target_entity: string }>(
      `SELECT metadata, target_entity FROM audit_event
        WHERE action = 'membership.list_read' AND tenant_id = $1
        ORDER BY occurred_at DESC LIMIT 1`,
      [firm.tenantId],
    );
    expect(rows[0]!.target_entity).toBe('tenant');
    expect(JSON.stringify(rows[0]!.metadata ?? {})).not.toContain('@');
  });

  it('an automated read is served but not audited (channel-gated, like case.read)', async () => {
    const before = await auditEntries(firm.tenantId);
    expect((await list(firm.mp, firm.tenantId, 'automated')).status).toBe(200);
    expect(await auditEntries(firm.tenantId)).toBe(before);
  });

  it('a refused read writes no membership.list_read entry', async () => {
    const before = await auditEntries(firm.tenantId);
    expect((await list(firm.aa)).status).toBe(403);
    expect(await auditEntries(firm.tenantId)).toBe(before);
  });
});
