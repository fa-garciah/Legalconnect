/**
 * T058 — US6: the refusal side of the audit vocabulary. A refused attempt reaching
 * across tenants is visible (FR-025, SC-015); an in-tenant refusal must not be able
 * to inflate the log (contracts/refusal.md §4) — a member cannot grow their own
 * firm's audit volume by looping a forbidden endpoint. No entry carries personal
 * data of the firm's end clients (Principle VI, US6 scenario 3).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createRealApp } from '../helpers/real-app';
import { seededTenantIds, type SeededTenants } from '../helpers/tenants';
import { seededIdentities, type SeededIdentities } from '../helpers/identities';
import { connectAs } from '../helpers/db';

async function crossTenantAttemptCount(tenantId: string): Promise<number> {
  const platform = await connectAs('platform');
  try {
    const { rows } = await platform.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM audit_event
        WHERE tenant_id = $1 AND action = 'tenant.cross_access_attempted'`,
      [tenantId],
    );
    return Number(rows[0]!.n);
  } finally {
    await platform.end();
  }
}

async function totalAuditEntryCount(tenantId: string): Promise<number> {
  const platform = await connectAs('platform');
  try {
    const { rows } = await platform.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM audit_event WHERE tenant_id = $1`,
      [tenantId],
    );
    return Number(rows[0]!.n);
  } finally {
    await platform.end();
  }
}

describe('the audit vocabulary\'s refusal side', () => {
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

  it('a refused attempt reaching across tenants emits exactly one tenant.cross_access_attempted', async () => {
    const before = await crossTenantAttemptCount(tenants.a);

    // The outsider identity holds no membership anywhere — reaching tenant A is a
    // cross-tenant attempt, refused before AuthorizationInterceptor ever runs.
    const response = await request(app.getHttpServer())
      .get('/tenant/invitations')
      .set('x-identity-id', identities.outsiderId)
      .set('x-tenant-id', tenants.a);
    expect(response.status).toBe(404);

    const after = await crossTenantAttemptCount(tenants.a);
    expect(after).toBe(before + 1);
  });

  it('a refused attempt WITHIN the caller\'s own tenant emits none — a member cannot inflate their firm\'s log', async () => {
    const before = await totalAuditEntryCount(tenants.a);

    // dual holds MP in tenant A — membership.change_archetype is SA-only.
    for (let i = 0; i < 3; i += 1) {
      const response = await request(app.getHttpServer())
        .patch(`/tenant/memberships/${identities.dualMembershipA}/archetype`)
        .set('x-identity-id', identities.dualId)
        .set('x-tenant-id', tenants.a)
        .send({ archetype: 'PL' });
      expect(response.status).toBe(403);
    }

    const after = await totalAuditEntryCount(tenants.a);
    expect(after).toBe(before);
  });

  it('the cross-tenant attempt entry carries no personal data of the firm\'s end clients', async () => {
    await request(app.getHttpServer())
      .get('/tenant/invitations')
      .set('x-identity-id', identities.outsiderId)
      .set('x-tenant-id', tenants.a);

    const platform = await connectAs('platform');
    try {
      const { rows } = await platform.query<{ metadata: unknown; source: unknown }>(
        `SELECT metadata, source FROM audit_event
          WHERE tenant_id = $1 AND action = 'tenant.cross_access_attempted'
          ORDER BY occurred_at DESC LIMIT 1`,
        [tenants.a],
      );
      const row = rows[0];
      expect(row).toBeDefined();
      const serialised = JSON.stringify([row!.metadata, row!.source]);
      // No email address shape anywhere in the entry.
      expect(serialised).not.toMatch(/[^\s"]+@[^\s"]+\.[^\s"]+/);
    } finally {
      await platform.end();
    }
  });
});
