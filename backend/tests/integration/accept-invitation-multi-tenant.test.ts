/**
 * quickstart V6 / SC-006 — a person accepting invitations from two different
 * tenants, through the real acceptance path, ends with exactly one identity
 * and exactly two memberships.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { createRealApp } from '../helpers/real-app';
import { seededTenantIds, type SeededTenants } from '../helpers/tenants';
import { seededIdentities, type SeededIdentities } from '../helpers/identities';
import { connectAs } from '../helpers/db';

async function issueRealInvitation(
  tenantId: string,
  issuedByMembershipId: string,
  email: string,
): Promise<string> {
  const migration = await connectAs('migration');
  try {
    const rawReference = randomBytes(16).toString('hex');
    const hash = createHash('sha256').update(rawReference, 'utf8').digest('hex');
    await migration.query(
      `INSERT INTO invitation (tenant_id, target_archetype, invited_email, reference_hash, issued_by_membership_id, seeded)
       VALUES ($1, 'AA', $2, $3, $4, false)`,
      [tenantId, email, hash, issuedByMembershipId],
    );
    return rawReference;
  } finally {
    await migration.end();
  }
}

describe('one identity, two tenants, two memberships (SC-006)', () => {
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

  it('accepting from tenant A then tenant B yields one identity and two memberships', async () => {
    const email = `multi-tenant-${Date.now()}@example.com`;
    const subject = `idp|multi-tenant-${Date.now()}`;

    const refA = await issueRealInvitation(tenants.a, identities.dualMembershipA, email);
    const acceptA = await request(app.getHttpServer())
      .post(`/identity/invitations/${refA}/accept`)
      .set('x-subject', subject)
      .set('x-email', email)
      .send();
    expect(acceptA.status).toBe(201);

    const refB = await issueRealInvitation(tenants.b, identities.dualMembershipB, email);
    const acceptB = await request(app.getHttpServer())
      .post(`/identity/invitations/${refB}/accept`)
      .set('x-subject', subject)
      .set('x-email', email)
      .send();
    expect(acceptB.status).toBe(201);
    expect(acceptA.body.identityId).toBe(acceptB.body.identityId);

    const migration = await connectAs('migration');
    try {
      const identityRows = await migration.query('SELECT count(*)::text AS n FROM identity WHERE subject = $1', [
        subject,
      ]);
      expect(Number(identityRows.rows[0].n)).toBe(1);

      const membershipRows = await migration.query(
        'SELECT tenant_id FROM membership WHERE identity_id = $1 ORDER BY created_at',
        [acceptA.body.identityId],
      );
      expect(membershipRows.rows.map((r) => r.tenant_id).sort()).toEqual([tenants.a, tenants.b].sort());
    } finally {
      await migration.end();
    }
  });
});
