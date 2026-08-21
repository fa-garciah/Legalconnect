/**
 * T028 / quickstart V14 / FR-026 / SC-014 — a membership whose identity has
 * not completed second-factor enrollment is refused on every tenant-scoped
 * request, and refused nothing else about the request (research.md D5).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { resolvePrincipal } from '../../src/common/tenant/resolve';
import { DbMembershipPort } from '../../src/common/tenant/membership';
import { closeAppDb } from '../../src/common/db/client';
import { seededTenantIds, type SeededTenants } from '../helpers/tenants';
import { connectAs } from '../helpers/db';
import { createRealApp } from '../helpers/real-app';

describe('MFA enrollment gate (FR-026)', () => {
  let tenants: SeededTenants;
  let unenrolledIdentityId: string;
  const port = new DbMembershipPort();

  beforeAll(async () => {
    tenants = await seededTenantIds();
    const migration = await connectAs('migration');
    try {
      const identity = await migration.query<{ id: string }>(
        `INSERT INTO identity (subject, email) VALUES ($1, 'unenrolled@example.com') RETURNING id`,
        [`idp|unenrolled-${Date.now()}`],
      );
      unenrolledIdentityId = identity.rows[0]!.id;
      await migration.query(
        `INSERT INTO membership (identity_id, tenant_id, archetype) VALUES ($1, $2, 'AA')`,
        [unenrolledIdentityId, tenants.a],
      );
    } finally {
      await migration.end();
    }
  });

  afterAll(async () => {
    await closeAppDb();
  });

  it('is refused with mfa_not_enrolled, distinct from every other refusal reason', async () => {
    const result = await resolvePrincipal({ identityId: unenrolledIdentityId, tenantId: tenants.a }, port);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('mfa_not_enrolled');
  });

  it('answers 403, not the tenant-context 404 — the caller already proved the membership is real', async () => {
    const app: INestApplication = await createRealApp();
    try {
      // enumerate-own-memberships is identity-only and not MFA-gated; a real
      // tenant-scoped route is what exercises the gate end-to-end. The MFA
      // check runs before the archetype check inside the same interceptor, so
      // this membership's 'AA' archetype (which also lacks SA/MP's invite
      // capability) never gets the chance to produce a DIFFERENT refusal.
      const tenantScoped = await request(app.getHttpServer())
        .get('/tenant/invitations')
        .set('x-identity-id', unenrolledIdentityId)
        .set('x-tenant-id', tenants.a);
      expect(tenantScoped.status).toBe(403);
      expect(tenantScoped.body.error.code).toBe('mfa_enrollment_required');
    } finally {
      await app.close();
    }
  });

  it('once enrolled, the same membership resolves normally', async () => {
    const migration = await connectAs('migration');
    try {
      await migration.query(`UPDATE identity SET mfa_enrolled_at = now() WHERE id = $1`, [
        unenrolledIdentityId,
      ]);
    } finally {
      await migration.end();
    }

    const result = await resolvePrincipal({ identityId: unenrolledIdentityId, tenantId: tenants.a }, port);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.principal.archetype).toBe('AA');
  });
});
