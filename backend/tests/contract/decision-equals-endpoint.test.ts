/**
 * T036 — US2: the outcome through HTTP equals `decide()`'s, for a sampled set of
 * pairs (SC-010); and a caller presenting a contradicting archetype claim is decided
 * by the stored membership, not the claim (FR-003, FR-004 — 002's V19, not regressed).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createRealApp } from '../helpers/real-app';
import { seededTenantIds, type SeededTenants } from '../helpers/tenants';
import { seededIdentities, type SeededIdentities } from '../helpers/identities';
import { decide } from '../../src/common/authz/decide';

describe('the endpoint-driven outcome equals the function-driven outcome', () => {
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

  // The dual identity is MP in tenant A — permitted invitation.read_pending,
  // refused membership.change_archetype (SA-only).
  it('a permitted pair (MP, invitation.read_pending) returns 200 over HTTP, matching decide()', async () => {
    const functionResult = await decide({
      subject: 'MP',
      capability: 'invitation.read_pending',
      mfaEnrolledAt: '2026-01-01T00:00:00.000Z',
      scope: {
        subject: 'MP',
        capability: 'invitation.read_pending',
        principal: { identityId: identities.dualId, membershipId: 'm', tenantId: tenants.a, archetype: 'MP' },
        identityId: identities.dualId,
        targetTenantId: tenants.a,
        targetId: null,
      },
      plan: null,
    });
    expect(functionResult.permitted).toBe(true);

    const response = await request(app.getHttpServer())
      .get('/tenant/invitations')
      .set('x-identity-id', identities.dualId)
      .set('x-tenant-id', tenants.a);
    expect(response.status).toBe(200);
  });

  it('a refused pair (MP, membership.change_archetype) returns 403, matching decide()', async () => {
    const functionResult = await decide({
      subject: 'MP',
      capability: 'membership.change_archetype',
      mfaEnrolledAt: '2026-01-01T00:00:00.000Z',
      scope: {
        subject: 'MP',
        capability: 'membership.change_archetype',
        principal: { identityId: identities.dualId, membershipId: 'm', tenantId: tenants.a, archetype: 'MP' },
        identityId: identities.dualId,
        targetTenantId: tenants.a,
        targetId: null,
      },
      plan: null,
    });
    expect(functionResult.permitted).toBe(false);

    const response = await request(app.getHttpServer())
      .patch(`/tenant/memberships/${identities.dualMembershipA}/archetype`)
      .set('x-identity-id', identities.dualId)
      .set('x-tenant-id', tenants.a)
      .send({ archetype: 'PL' });
    expect(response.status).toBe(403);
  });

  it('a claimed archetype header contradicting the stored membership is ignored — the stored membership governs', async () => {
    // The dual identity holds MP in tenant A, not SA. A spoofed header must not
    // upgrade it: there is no code path in TenantContextInterceptor or
    // AuthorizationInterceptor that ever reads an archetype header at all.
    const response = await request(app.getHttpServer())
      .patch(`/tenant/memberships/${identities.dualMembershipA}/archetype`)
      .set('x-identity-id', identities.dualId)
      .set('x-tenant-id', tenants.a)
      .set('x-archetype', 'SA')
      .send({ archetype: 'PL' });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('not_authorized');
  });
});
