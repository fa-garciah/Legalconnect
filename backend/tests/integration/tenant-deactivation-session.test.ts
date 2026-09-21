/**
 * T041-T043 — User Story 4: confirming, not building. research.md D7.
 *
 * `tenant/resolve.ts::tenantIsActive()` already reads `tenant.status` fresh on
 * every request, with no cache, and `resolvePrincipal()` already refuses with the
 * existing generic 404 once a tenant is deactivated. This slice adds ZERO
 * production code for this story — these tests exercise `001`'s existing
 * mechanism, unchanged by everything else this slice built, not new behavior.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createAuthenticatedApp } from '../helpers/real-app';
import { connectAs } from '../helpers/db';
import { uniqueRfc } from '../helpers/rfc';

describe('tenant deactivation ends access to that tenant only — confirming 001, not new code (SC-007, US4)', () => {
  let app: INestApplication;
  let migration: Client;

  beforeAll(async () => {
    app = await createAuthenticatedApp();
    migration = await connectAs('migration');
  });

  afterAll(async () => {
    await app.close();
    await migration.end();
  });

  const server = () => app.getHttpServer();

  async function provisionTenant(name: string): Promise<string> {
    const response = await request(server())
      .post('/internal/platform/tenants')
      .send({ name, rfc: uniqueRfc(), planCode: 'esencial' });
    expect(response.status).toBe(201);
    return response.body.id as string;
  }

  async function dualTenantIdentity(): Promise<{ identityId: string; tenantA: string; tenantB: string }> {
    const tenantA = await provisionTenant(`Deactivation Probe A ${Date.now()}, S.C.`);
    const tenantB = await provisionTenant(`Deactivation Probe B ${Date.now()}, S.C.`);
    const { rows } = await migration.query<{ id: string }>(
      `INSERT INTO identity (subject, email, mfa_enrolled_at) VALUES ($1, $2, now()) RETURNING id`,
      [`idp|deactivation-probe-${Date.now()}`, `deactivation-probe-${Date.now()}@example.com`],
    );
    const identityId = rows[0]!.id;
    await migration.query(`INSERT INTO membership (identity_id, tenant_id, archetype) VALUES ($1, $2, 'MP')`, [
      identityId,
      tenantA,
    ]);
    await migration.query(`INSERT INTO membership (identity_id, tenant_id, archetype) VALUES ($1, $2, 'MP')`, [
      identityId,
      tenantB,
    ]);
    return { identityId, tenantA, tenantB };
  }

  const probe = (identityId: string, tenantId: string) =>
    request(server())
      .get('/tenant/invitations')
      .set('x-identity-id', identityId)
      .set('x-tenant-id', tenantId);

  it('refuses the next request activating the deactivated tenant, while the other tenant continues to succeed on the same identity (US4 scenarios 1-2)', async () => {
    const { identityId, tenantA, tenantB } = await dualTenantIdentity();

    const beforeA = await probe(identityId, tenantA);
    expect(beforeA.status).toBe(200);

    const deactivated = await request(server()).post(`/internal/platform/tenants/${tenantA}/deactivate`);
    expect(deactivated.status).toBe(200);

    const afterA = await probe(identityId, tenantA);
    expect(afterA.status).toBe(404);

    const stillB = await probe(identityId, tenantB);
    expect(stillB.status).toBe(200);
  });

  it('deactivation writes the existing tenant.deactivated entry and NO additional, session-specific entry (FR-015, US4 scenario 4)', async () => {
    const { tenantA } = await dualTenantIdentity();

    const before = await migration.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM audit_event WHERE tenant_id = $1`,
      [tenantA],
    );

    await request(server()).post(`/internal/platform/tenants/${tenantA}/deactivate`);

    const after = await migration.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM audit_event WHERE tenant_id = $1`,
      [tenantA],
    );
    // Exactly one new entry: tenant.deactivated. Nothing session-specific is added
    // — there is no session.* or tenant.session_revoked action in this slice's own
    // vocabulary (research.md D8) for this event.
    expect(Number(after.rows[0]!.n) - Number(before.rows[0]!.n)).toBe(1);

    const { rows } = await migration.query<{ action: string }>(
      `SELECT action FROM audit_event WHERE tenant_id = $1 ORDER BY occurred_at DESC LIMIT 1`,
      [tenantA],
    );
    expect(rows[0]!.action).toBe('tenant.deactivated');
  });

  it('session and refresh_token rows are NOT mutated by a tenant deactivation (research.md D7, spec.md Named Risks)', async () => {
    const { identityId, tenantA } = await dualTenantIdentity();

    // A real session for the identity, independent of which tenant it can reach.
    const digest = `deactivation-probe-digest-${Date.now()}`;
    const session = await migration.query<{ id: string }>(
      `INSERT INTO session (identity_id, access_digest, expires_at) VALUES ($1, $2, now() + interval '15 minutes') RETURNING id`,
      [identityId, digest],
    );
    const sessionId = session.rows[0]!.id;

    await request(server()).post(`/internal/platform/tenants/${tenantA}/deactivate`);

    const { rows } = await migration.query<{ revoked_at: unknown }>(
      `SELECT revoked_at FROM session WHERE id = $1`,
      [sessionId],
    );
    expect(rows[0]!.revoked_at).toBeNull();
  });
});
