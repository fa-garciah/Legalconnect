/**
 * T026-T029 — step-up MFA gates the five withheld capabilities. SC-005, SC-006,
 * User Story 2.
 *
 * Every gated-capability call here presents a REAL bearer token (full sign-in),
 * not the `x-identity-id` test stand-in — the step-up gate in
 * `common/authz/interceptor.ts` is deliberately scoped to skip when
 * `request.sessionId` is absent (the stand-in short-circuits `SessionGuard`
 * before it ever resolves one), so these tests present real sessions throughout
 * to exercise the mechanism genuinely end to end rather than bypass it.
 *
 * KNOWN GAP, discovered during implementation and not resolved by this slice's
 * design docs: `invitation.issue_seed` is exposed on the PLATFORM surface, which
 * has NO identity/session concept at all (`resolveCaller()` returns
 * `identityId: null` for PO, and the surface is loopback-only, not
 * network-reachable — `session.guard.ts`'s own comment says so). A step-up
 * elevation is minted for an `identity_id`; PO has none, so enforcing this
 * capability's gate unconditionally would make it PERMANENTLY UNREACHABLE —
 * `common/authz/interceptor.ts` therefore scopes the step-up gate to callers who
 * HAVE an identity, leaving this one capability's platform route exactly as
 * reachable as it was before this slice (untouched, not newly gated). Covered
 * below as "unaffected by this slice" rather than the refuse-then-succeed round
 * trip the other four get.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createAuthenticatedApp } from '../helpers/real-app';
import { connectAs } from '../helpers/db';
import { seedAuthIdentity, TEST_CREDENTIAL, type SeededAuthIdentity } from '../helpers/auth-seed';
import { seededTenantIds, type SeededTenants } from '../helpers/tenants';
import { generateAt } from '../../src/common/auth/totp';
import { signInOriginThrottle } from '../../src/common/auth/origin-throttle';
import { uniqueRfc } from '../helpers/rfc';

describe('step-up MFA (SC-005, SC-006, US2)', () => {
  let app: INestApplication;
  let migration: Client;
  let tenants: SeededTenants;

  beforeAll(async () => {
    app = await createAuthenticatedApp();
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

  async function memberWithArchetype(archetype: 'MP' | 'SA'): Promise<{
    identity: SeededAuthIdentity;
    membershipId: string;
  }> {
    const identity = await seedAuthIdentity(migration, `stepup-${archetype.toLowerCase()}`);
    const membership = await migration.query<{ id: string }>(
      `INSERT INTO membership (identity_id, tenant_id, archetype) VALUES ($1, $2, $3) RETURNING id`,
      [identity.identityId, tenants.a, archetype],
    );
    return { identity, membershipId: membership.rows[0]!.id };
  }

  async function freshInvitee(): Promise<string> {
    // The EMAIL needs the same uniqueness as the subject. It used `Date.now()` alone, and two
    // calls in one millisecond collided on the identity email index (0035) — CI, 2026-09-23.
    const unique = randomUUID();
    const { rows } = await migration.query<{ id: string }>(
      `INSERT INTO identity (subject, email) VALUES ($1, $2) RETURNING id`,
      [`idp|stepup-invitee-${unique}`, `stepup-invitee-${unique}@example.com`],
    );
    return rows[0]!.id;
  }

  async function issueStepUpToken(accessToken: string, capability: string, code: string) {
    return request(server())
      .post('/auth/step-up')
      .set('authorization', `Bearer ${accessToken}`)
      .send({ capability, code });
  }

  const bearer = (accessToken: string) => `Bearer ${accessToken}`;

  describe('each of the five gated capabilities, individually (SC-005)', () => {
    it('invitation.issue: refused without a token, succeeds once one is presented', async () => {
      const { identity } = await memberWithArchetype('MP');
      const accessToken = await signInFully(identity);
      const email = `stepup-invite-target-${randomUUID()}@example.com`;

      const withoutToken = await request(server())
        .post('/tenant/invitations')
        .set('authorization', bearer(accessToken))
        .set('x-tenant-id', tenants.a)
        .send({ email, targetArchetype: 'AA' });
      expect(withoutToken.status).toBe(403);
      expect(withoutToken.body.error).toBe('step_up_required');

      const code = await generateAt(identity.secret, Math.floor(Date.now() / 1000) + 30);
      const issued = await issueStepUpToken(accessToken, 'invitation.issue', code);
      expect(issued.status).toBe(200);

      const withToken = await request(server())
        .post('/tenant/invitations')
        .set('authorization', bearer(accessToken))
        .set('x-tenant-id', tenants.a)
        .set('x-step-up-token', issued.body.stepUpToken)
        .send({ email, targetArchetype: 'AA' });
      expect(withToken.status).toBe(201);
    });

    it('invitation.revoke: refused without a token, succeeds once one is presented', async () => {
      const { identity } = await memberWithArchetype('MP');
      const accessToken = await signInFully(identity);
      const email = `stepup-revoke-target-${randomUUID()}@example.com`;

      // Issue the invitation to revoke (via a fresh step-up of its own).
      const issueCode = await generateAt(identity.secret, Math.floor(Date.now() / 1000) + 30);
      const issueElevation = await issueStepUpToken(accessToken, 'invitation.issue', issueCode);
      const issued = await request(server())
        .post('/tenant/invitations')
        .set('authorization', bearer(accessToken))
        .set('x-tenant-id', tenants.a)
        .set('x-step-up-token', issueElevation.body.stepUpToken)
        .send({ email, targetArchetype: 'AA' });
      expect(issued.status).toBe(201);
      const invitationId = issued.body.id as string;

      const withoutToken = await request(server())
        .post(`/tenant/invitations/${invitationId}/revoke`)
        .set('authorization', bearer(accessToken))
        .set('x-tenant-id', tenants.a)
        .send();
      expect(withoutToken.status).toBe(403);
      expect(withoutToken.body.error).toBe('step_up_required');

      // No single-use enforcement on step-up codes themselves (research.md D6's
      // "Rejected" note) — a fresh call to the same +30s step is fine; +60s would
      // drift outside the 90-second verification window by the time the request
      // actually reaches the server.
      const revokeCode = await generateAt(identity.secret, Math.floor(Date.now() / 1000) + 30);
      const revokeElevation = await issueStepUpToken(accessToken, 'invitation.revoke', revokeCode);
      expect(revokeElevation.status).toBe(200);

      const withToken = await request(server())
        .post(`/tenant/invitations/${invitationId}/revoke`)
        .set('authorization', bearer(accessToken))
        .set('x-tenant-id', tenants.a)
        .set('x-step-up-token', revokeElevation.body.stepUpToken)
        .send();
      expect(withToken.status).toBe(200);
    });

    it('membership.revoke: refused without a token, succeeds once one is presented', async () => {
      const { identity } = await memberWithArchetype('MP');
      const accessToken = await signInFully(identity);
      const invitee = await freshInvitee();
      const target = await migration.query<{ id: string }>(
        `INSERT INTO membership (identity_id, tenant_id, archetype) VALUES ($1, $2, 'AA') RETURNING id`,
        [invitee, tenants.a],
      );
      const targetMembershipId = target.rows[0]!.id;

      const withoutToken = await request(server())
        .patch(`/tenant/memberships/${targetMembershipId}/revoke`)
        .set('authorization', bearer(accessToken))
        .set('x-tenant-id', tenants.a)
        .send();
      expect(withoutToken.status).toBe(403);
      expect(withoutToken.body.error).toBe('step_up_required');

      const code = await generateAt(identity.secret, Math.floor(Date.now() / 1000) + 30);
      const elevation = await issueStepUpToken(accessToken, 'membership.revoke', code);
      expect(elevation.status).toBe(200);

      const withToken = await request(server())
        .patch(`/tenant/memberships/${targetMembershipId}/revoke`)
        .set('authorization', bearer(accessToken))
        .set('x-tenant-id', tenants.a)
        .set('x-step-up-token', elevation.body.stepUpToken)
        .send();
      expect(withToken.status).toBe(200);
    });

    it('membership.change_archetype: refused without a token, succeeds once one is presented', async () => {
      const { identity } = await memberWithArchetype('SA');
      const accessToken = await signInFully(identity);
      const invitee = await freshInvitee();
      const target = await migration.query<{ id: string }>(
        `INSERT INTO membership (identity_id, tenant_id, archetype) VALUES ($1, $2, 'AA') RETURNING id`,
        [invitee, tenants.a],
      );
      const targetMembershipId = target.rows[0]!.id;

      const withoutToken = await request(server())
        .patch(`/tenant/memberships/${targetMembershipId}/archetype`)
        .set('authorization', bearer(accessToken))
        .set('x-tenant-id', tenants.a)
        .send({ archetype: 'PL' });
      expect(withoutToken.status).toBe(403);
      expect(withoutToken.body.error).toBe('step_up_required');

      const code = await generateAt(identity.secret, Math.floor(Date.now() / 1000) + 30);
      const elevation = await issueStepUpToken(accessToken, 'membership.change_archetype', code);
      expect(elevation.status).toBe(200);

      const withToken = await request(server())
        .patch(`/tenant/memberships/${targetMembershipId}/archetype`)
        .set('authorization', bearer(accessToken))
        .set('x-tenant-id', tenants.a)
        .set('x-step-up-token', elevation.body.stepUpToken)
        .send({ archetype: 'PL' });
      expect(withToken.status).toBe(200);
    });

    it('invitation.issue_seed: unaffected by this slice — PO has no identity for the gate to apply to (documented gap)', async () => {
      // A fresh, zero-membership tenant each time — seed-administrator refuses
      // 409 against a tenant that already has members (tenants.a, from db:seed,
      // does), which is unrelated to step-up and would otherwise mask the point
      // of this test.
      const freshTenant = async (): Promise<string> => {
        const created = await request(server())
          .post('/internal/platform/tenants')
          .send({ name: `Step-up Gap Probe ${Date.now()}, S.C.`, rfc: uniqueRfc(), planCode: 'esencial' });
        expect(created.status).toBe(201);
        return created.body.id as string;
      };

      const tenantOne = await freshTenant();
      const response = await request(server())
        .post(`/internal/platform/tenants/${tenantOne}/seed-administrator`)
        .send({ email: `platform-seed-${randomUUID()}@example.com` });
      // Succeeds exactly as it did before this slice (seed-first-administrator.test.ts,
      // 002) — the step-up gate is scoped to callers with an identity, and PO has
      // none. A step-up header has no effect on it either way.
      expect(response.status).toBe(201);

      const tenantTwo = await freshTenant();
      const withHeader = await request(server())
        .post(`/internal/platform/tenants/${tenantTwo}/seed-administrator`)
        .set('x-step-up-token', 'irrelevant')
        .send({ email: `platform-seed-2-${randomUUID()}@example.com` });
      expect(withHeader.status).toBe(201);
    });
  });

  it('a token consumed once is refused on a second presentation, even for the same capability (US2 scenario 5)', async () => {
    const { identity } = await memberWithArchetype('MP');
    const accessToken = await signInFully(identity);
    const invitee1 = await freshInvitee();
    const invitee2 = await freshInvitee();
    const target1 = await migration.query<{ id: string }>(
      `INSERT INTO membership (identity_id, tenant_id, archetype) VALUES ($1, $2, 'AA') RETURNING id`,
      [invitee1, tenants.a],
    );
    const target2 = await migration.query<{ id: string }>(
      `INSERT INTO membership (identity_id, tenant_id, archetype) VALUES ($1, $2, 'AA') RETURNING id`,
      [invitee2, tenants.a],
    );

    const code = await generateAt(identity.secret, Math.floor(Date.now() / 1000) + 30);
    const elevation = await issueStepUpToken(accessToken, 'membership.revoke', code);
    expect(elevation.status).toBe(200);
    const token = elevation.body.stepUpToken as string;

    const first = await request(server())
      .patch(`/tenant/memberships/${target1.rows[0]!.id}/revoke`)
      .set('authorization', bearer(accessToken))
      .set('x-tenant-id', tenants.a)
      .set('x-step-up-token', token)
      .send();
    expect(first.status).toBe(200);

    const reused = await request(server())
      .patch(`/tenant/memberships/${target2.rows[0]!.id}/revoke`)
      .set('authorization', bearer(accessToken))
      .set('x-tenant-id', tenants.a)
      .set('x-step-up-token', token)
      .send();
    expect(reused.status).toBe(403);
    expect(reused.body.error).toBe('step_up_required');
  });

  it('a token minted for one capability does not satisfy a different one (US2 scenario 5)', async () => {
    const { identity } = await memberWithArchetype('SA');
    const accessToken = await signInFully(identity);
    const invitee = await freshInvitee();
    const target = await migration.query<{ id: string }>(
      `INSERT INTO membership (identity_id, tenant_id, archetype) VALUES ($1, $2, 'AA') RETURNING id`,
      [invitee, tenants.a],
    );

    const code = await generateAt(identity.secret, Math.floor(Date.now() / 1000) + 30);
    // Minted for membership.revoke...
    const elevation = await issueStepUpToken(accessToken, 'membership.revoke', code);
    expect(elevation.status).toBe(200);

    // ...presented against membership.change_archetype.
    const response = await request(server())
      .patch(`/tenant/memberships/${target.rows[0]!.id}/archetype`)
      .set('authorization', bearer(accessToken))
      .set('x-tenant-id', tenants.a)
      .set('x-step-up-token', elevation.body.stepUpToken)
      .send({ archetype: 'PL' });
    expect(response.status).toBe(403);
    expect(response.body.error).toBe('step_up_required');
  });

  it('an identity lacking the underlying permission is refused by ORDINARY permission, never reaching step-up (Edge Cases)', async () => {
    // An AA has no membership.change_archetype permission at all — the same
    // fixture membership-revoke-and-archetype.test.ts already establishes for MP.
    // The stand-in is fine here: this asserts decide() itself refuses BEFORE the
    // step-up block is ever reached, a property independent of session mechanics.
    const identity = await seedAuthIdentity(migration, 'stepup-aa-no-permission');
    await migration.query(`INSERT INTO membership (identity_id, tenant_id, archetype) VALUES ($1, $2, 'AA')`, [
      identity.identityId,
      tenants.a,
    ]);
    const invitee = await freshInvitee();
    const target = await migration.query<{ id: string }>(
      `INSERT INTO membership (identity_id, tenant_id, archetype) VALUES ($1, $2, 'AA') RETURNING id`,
      [invitee, tenants.a],
    );

    const response = await request(server())
      .patch(`/tenant/memberships/${target.rows[0]!.id}/archetype`)
      .set('x-identity-id', identity.identityId)
      .set('x-tenant-id', tenants.a)
      .send({ archetype: 'PL' });

    expect(response.status).toBe(403);
    expect(response.body.error.code ?? response.body.error).not.toBe('step_up_required');
  });

  describe('audit (FR-021, SC-008, US2 scenario 6)', () => {
    it('exactly one stepup.verified entry per successful call; consuming the token writes no additional entry', async () => {
      const { identity } = await memberWithArchetype('MP');
      const accessToken = await signInFully(identity);
      const invitee = await freshInvitee();
      const target = await migration.query<{ id: string }>(
        `INSERT INTO membership (identity_id, tenant_id, archetype) VALUES ($1, $2, 'AA') RETURNING id`,
        [invitee, tenants.a],
      );

      const code = await generateAt(identity.secret, Math.floor(Date.now() / 1000) + 30);
      const elevation = await issueStepUpToken(accessToken, 'membership.revoke', code);
      expect(elevation.status).toBe(200);

      await request(server())
        .patch(`/tenant/memberships/${target.rows[0]!.id}/revoke`)
        .set('authorization', bearer(accessToken))
        .set('x-tenant-id', tenants.a)
        .set('x-step-up-token', elevation.body.stepUpToken)
        .send();

      const { rows } = await migration.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM audit_event WHERE action = 'stepup.verified' AND actor_identity_id = $1`,
        [identity.identityId],
      );
      expect(Number(rows[0]!.n)).toBe(1);
    });

    it('a wrong code writes exactly one stepup.failed entry', async () => {
      const { identity } = await memberWithArchetype('MP');
      const accessToken = await signInFully(identity);

      const response = await issueStepUpToken(accessToken, 'membership.revoke', '000000');
      expect(response.status).toBe(401);

      const { rows } = await migration.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM audit_event WHERE action = 'stepup.failed' AND actor_identity_id = $1`,
        [identity.identityId],
      );
      expect(Number(rows[0]!.n)).toBe(1);
    });
  });
});
