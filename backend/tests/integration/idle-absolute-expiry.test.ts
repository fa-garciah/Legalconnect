/**
 * T034-T039 — idle and absolute session limits by role class. SC-002 to SC-004,
 * User Story 3. research.md D1-D4.
 *
 * Every case here presents a REAL, bearer-token-carrying session (full sign-in),
 * never the `x-identity-id` test stand-in — the idle/absolute mechanism reads
 * `request.sessionId`/`lastSeenAt`/`familyCreatedAt`, which only a genuinely
 * resolved session populates (`session.guard.ts`, `common/authz/interceptor.ts`).
 *
 * Clocks are moved at the DATABASE, not the wall clock — `UPDATE session SET
 * last_seen_at = now() - interval '...'`, the same technique `003`'s own lockout
 * tests already use for `identity_factor.locked_until` (quickstart.md Scenario 2).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createUnauthenticatedApp } from '../helpers/real-app';
import { connectAs } from '../helpers/db';
import { seedAuthIdentity, TEST_CREDENTIAL, type SeededAuthIdentity } from '../helpers/auth-seed';
import { seededTenantIds, type SeededTenants } from '../helpers/tenants';
import { generateAt } from '../../src/common/auth/totp';
import { signInOriginThrottle } from '../../src/common/auth/origin-throttle';
import { digestToken } from '../../src/common/auth/session.port';

describe('idle and absolute session limits by role class (SC-002..004, US3)', () => {
  let app: INestApplication;
  let migration: Client;
  let tenants: SeededTenants;

  beforeAll(async () => {
    app = await createUnauthenticatedApp();
    migration = await connectAs('migration');
    tenants = await seededTenantIds();
  });

  afterAll(async () => {
    await app.close();
    await migration.end();
  });

  const server = () => app.getHttpServer();

  async function signInFully(identity: SeededAuthIdentity, stepOffset = 0): Promise<string> {
    signInOriginThrottle.reset();
    const credential = await request(server())
      .post('/auth/sign-in')
      .send({ email: identity.email, password: TEST_CREDENTIAL });
    const code = await generateAt(identity.secret, Math.floor(Date.now() / 1000) + stepOffset * 30);
    const factor = await request(server())
      .post('/auth/factor')
      .send({ challengeToken: credential.body.challengeToken, code });
    expect(factor.status).toBe(201);
    return factor.body.accessToken as string;
  }

  async function memberWithArchetype(
    archetype: 'MP' | 'SA' | 'CC',
    label: string,
  ): Promise<{ identity: SeededAuthIdentity; accessToken: string }> {
    const identity = await seedAuthIdentity(migration, label);
    await migration.query(`INSERT INTO membership (identity_id, tenant_id, archetype) VALUES ($1, $2, $3)`, [
      identity.identityId,
      tenants.a,
      archetype,
    ]);
    const accessToken = await signInFully(identity);
    return { identity, accessToken };
  }

  async function setClocks(
    accessToken: string,
    fields: { lastSeenAgoMinutes?: number; familyCreatedAgoMinutes?: number },
  ): Promise<void> {
    const digest = digestToken(accessToken);
    if (fields.lastSeenAgoMinutes !== undefined) {
      await migration.query(
        `UPDATE session SET last_seen_at = now() - make_interval(mins => $1) WHERE access_digest = $2`,
        [fields.lastSeenAgoMinutes, digest],
      );
    }
    if (fields.familyCreatedAgoMinutes !== undefined) {
      await migration.query(
        `UPDATE session SET family_created_at = now() - make_interval(mins => $1) WHERE access_digest = $2`,
        [fields.familyCreatedAgoMinutes, digest],
      );
    }
  }

  const tenantScopedRequest = (accessToken: string) =>
    request(server())
      .get('/tenant/invitations')
      .set('authorization', `Bearer ${accessToken}`)
      .set('x-tenant-id', tenants.a);

  const identityOnlyRequest = (accessToken: string) =>
    request(server()).get('/identity/memberships').set('authorization', `Bearer ${accessToken}`);

  describe('the six-case matrix: three role classes, idle- and absolute-triggered (SC-002..004)', () => {
    it('internal (MP): idle-expired (>8h) is refused with 401 "No autenticado."', async () => {
      const { accessToken } = await memberWithArchetype('MP', 'idle-internal');
      await setClocks(accessToken, { lastSeenAgoMinutes: 8 * 60 + 1 });
      const response = await tenantScopedRequest(accessToken);
      expect(response.status).toBe(401);
      expect(response.body.message).toBe('No autenticado.');
    });

    it('internal (MP): absolute-expired (>12h) is refused, even with recent activity', async () => {
      const { accessToken } = await memberWithArchetype('MP', 'absolute-internal');
      await setClocks(accessToken, { lastSeenAgoMinutes: 1, familyCreatedAgoMinutes: 12 * 60 + 1 });
      const response = await tenantScopedRequest(accessToken);
      expect(response.status).toBe(401);
    });

    it('SA: idle-expired (>30min) is refused', async () => {
      const { accessToken } = await memberWithArchetype('SA', 'idle-sa');
      await setClocks(accessToken, { lastSeenAgoMinutes: 31 });
      const response = await tenantScopedRequest(accessToken);
      expect(response.status).toBe(401);
    });

    it('SA: absolute-expired (>8h) is refused, even with recent activity', async () => {
      const { accessToken } = await memberWithArchetype('SA', 'absolute-sa');
      await setClocks(accessToken, { lastSeenAgoMinutes: 1, familyCreatedAgoMinutes: 8 * 60 + 1 });
      const response = await tenantScopedRequest(accessToken);
      expect(response.status).toBe(401);
    });

    it('portal (CC): idle-expired (>2h) is refused', async () => {
      const { accessToken } = await memberWithArchetype('CC', 'idle-portal');
      await setClocks(accessToken, { lastSeenAgoMinutes: 2 * 60 + 1 });
      const response = await tenantScopedRequest(accessToken);
      expect(response.status).toBe(401);
    });

    it('portal (CC): absolute-expired (>24h) is refused, even with recent activity', async () => {
      const { accessToken } = await memberWithArchetype('CC', 'absolute-portal');
      await setClocks(accessToken, { lastSeenAgoMinutes: 1, familyCreatedAgoMinutes: 24 * 60 + 1 });
      const response = await tenantScopedRequest(accessToken);
      expect(response.status).toBe(401);
    });
  });

  describe('inside both limits, never refused on timing grounds (US3 scenario 7)', () => {
    it('internal (MP), well inside 8h/12h', async () => {
      const { accessToken } = await memberWithArchetype('MP', 'inside-internal');
      await setClocks(accessToken, { lastSeenAgoMinutes: 5, familyCreatedAgoMinutes: 30 });
      const response = await tenantScopedRequest(accessToken);
      expect(response.status).toBe(200);
    });

    it('SA, well inside 30min/8h', async () => {
      const { accessToken } = await memberWithArchetype('SA', 'inside-sa');
      await setClocks(accessToken, { lastSeenAgoMinutes: 1, familyCreatedAgoMinutes: 5 });
      const response = await tenantScopedRequest(accessToken);
      expect(response.status).toBe(200);
    });

    it('portal (CC), well inside 2h/24h', async () => {
      // No tenant-scoped capability in the current matrix (common/authz/matrix.ts)
      // grants ANY portal archetype access at all — CC/IC/CB/EL hold only the two
      // self-scope rows (invitation.accept_own, membership.read_own). So this
      // asserts the narrower, matrix-independent claim "not refused on TIMING
      // grounds" (status !== 401) rather than "succeeds" (200) — an ordinary
      // permission 403 is a separate, expected refusal this test is not about.
      const { accessToken } = await memberWithArchetype('CC', 'inside-portal');
      await setClocks(accessToken, { lastSeenAgoMinutes: 5, familyCreatedAgoMinutes: 30 });
      const response = await tenantScopedRequest(accessToken);
      expect(response.status).not.toBe(401);
    });
  });

  it('an archetype change mid-session applies the new class\'s limits on the very next request (FR-010, US3 scenario 8)', async () => {
    // MP (internal, 8h idle) changed to SA (30min idle) mid-session. Both hold
    // invitation.read_pending in the matrix (common/authz/matrix.ts), so a real
    // 200 is reachable for the "before" call regardless of the role-class question
    // this test is actually about — no portal archetype holds any tenant-scoped
    // capability at all in the current matrix (see the test above), so a portal
    // pairing cannot exercise a genuine before/after 200→401 transition here.
    const { identity, accessToken } = await memberWithArchetype('MP', 'archetype-live');
    // 1 hour idle — inside MP's 8h limit, would be OUTSIDE SA's 30min limit.
    await setClocks(accessToken, { lastSeenAgoMinutes: 60 });

    const before = await tenantScopedRequest(accessToken);
    expect(before.status).toBe(200);

    await migration.query(`UPDATE membership SET archetype = 'SA' WHERE identity_id = $1 AND tenant_id = $2`, [
      identity.identityId,
      tenants.a,
    ]);
    // touch_session() from the successful request above reset last_seen_at to
    // "now" — move it back again so the new SA limit actually has something to
    // catch.
    await setClocks(accessToken, { lastSeenAgoMinutes: 60 });

    const after = await tenantScopedRequest(accessToken);
    expect(after.status).toBe(401);
  });

  it('an idle/absolute-expired presentation does NOT call touch_session() (D2)', async () => {
    const { accessToken } = await memberWithArchetype('SA', 'no-touch-on-refusal');
    await setClocks(accessToken, { lastSeenAgoMinutes: 31 });

    const digest = digestToken(accessToken);
    const before = await migration.query<{ last_seen_at: Date }>(
      `SELECT last_seen_at FROM session WHERE access_digest = $1`,
      [digest],
    );

    const response = await tenantScopedRequest(accessToken);
    expect(response.status).toBe(401);

    const after = await migration.query<{ last_seen_at: Date }>(
      `SELECT last_seen_at FROM session WHERE access_digest = $1`,
      [digest],
    );
    expect(new Date(after.rows[0]!.last_seen_at).getTime()).toBe(
      new Date(before.rows[0]!.last_seen_at).getTime(),
    );
  });

  it('zero audit entries are written for an idle or absolute refusal (FR-011, SC-008)', async () => {
    const { identity, accessToken } = await memberWithArchetype('SA', 'no-audit-on-refusal');
    await setClocks(accessToken, { lastSeenAgoMinutes: 31 });

    const before = await migration.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM audit_event WHERE actor_identity_id = $1`,
      [identity.identityId],
    );

    const response = await tenantScopedRequest(accessToken);
    expect(response.status).toBe(401);

    const after = await migration.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM audit_event WHERE actor_identity_id = $1`,
      [identity.identityId],
    );
    expect(Number(after.rows[0]!.n)).toBe(Number(before.rows[0]!.n));
  });

  it('a request with no active tenant context is evaluated against the SA limits (research.md D3)', async () => {
    // Portal archetype — its own limit (2h idle) is far looser than SA's (30min).
    // 1 hour idle is inside portal's window but outside SA's, so this only
    // refuses if the identity-only default is genuinely SA, not the portal class
    // this identity actually holds.
    const { accessToken } = await memberWithArchetype('CC', 'identity-only-default');
    await setClocks(accessToken, { lastSeenAgoMinutes: 60 });

    const response = await identityOnlyRequest(accessToken);
    expect(response.status).toBe(401);
  });
});
