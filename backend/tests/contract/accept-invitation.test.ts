/**
 * US3 — POST /identity/invitations/:reference/accept.
 * contracts/self-service.md.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createRealApp } from '../helpers/real-app';
import { seededTenantIds, type SeededTenants } from '../helpers/tenants';
import { seededIdentities, type SeededIdentities } from '../helpers/identities';
import { connectAs } from '../helpers/db';

/** Issues a real invitation and returns its raw (unhashed) reference token. */
async function issueInvitation(
  app: INestApplication,
  identities: SeededIdentities,
  tenantId: string,
  email: string,
  targetArchetype = 'AA',
): Promise<{ id: string; rawReference: string }> {
  const migration = await connectAs('migration');
  try {
    // Issued through the migration connection with a KNOWN raw token, so the
    // test can present it — the app-level issue endpoint deliberately never
    // returns the token (contracts/tenant-invitations.md).
    const rawReference = `test-token-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const { createHash } = await import('node:crypto');
    const hash = createHash('sha256').update(rawReference, 'utf8').digest('hex');

    const membership = await migration.query<{ id: string }>(
      `SELECT id FROM membership WHERE identity_id = $1 AND tenant_id = $2`,
      [identities.dualId, tenantId],
    );
    const issuedByMembershipId = membership.rows[0]!.id;

    const { rows } = await migration.query<{ id: string }>(
      `INSERT INTO invitation (tenant_id, target_archetype, invited_email, reference_hash, issued_by_membership_id, seeded)
       VALUES ($1, $2, $3, $4, $5, false) RETURNING id`,
      [tenantId, targetArchetype, email, hash, issuedByMembershipId],
    );
    return { id: rows[0]!.id, rawReference };
  } finally {
    await migration.end();
  }
}

describe('POST /identity/invitations/:reference/accept (US3)', () => {
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

  it('scenarios 1-2: accepting with no prior identity creates exactly one identity and one live membership', async () => {
    const email = `new-person-${Date.now()}@example.com`;
    const { rawReference } = await issueInvitation(app, identities, tenants.a, email);
    const subject = `idp|new-person-${Date.now()}`;

    const response = await request(app.getHttpServer())
      .post(`/identity/invitations/${rawReference}/accept`)
      .set('x-subject', subject)
      .set('x-email', email)
      .send();

    expect(response.status).toBe(201);
    expect(response.body.tenantId).toBe(tenants.a);

    const migration = await connectAs('migration');
    try {
      const idRows = await migration.query('SELECT count(*)::text AS n FROM identity WHERE subject = $1', [subject]);
      expect(Number(idRows.rows[0].n)).toBe(1);
      const memberRows = await migration.query(
        'SELECT count(*)::text AS n FROM membership WHERE identity_id = $1',
        [response.body.identityId],
      );
      expect(Number(memberRows.rows[0].n)).toBe(1);
    } finally {
      await migration.end();
    }
  });

  it('scenario 3: an existing identity accepting a second invitation gets a second membership, not a second identity', async () => {
    const migration = await connectAs('migration');
    let subject: string;
    let email: string;
    try {
      const created = await migration.query<{ id: string }>(
        `INSERT INTO identity (subject, email) VALUES ($1, $2) RETURNING id`,
        [(subject = `idp|existing-${Date.now()}`), (email = `existing-${Date.now()}@example.com`)],
      );
      expect(created.rows).toHaveLength(1);
    } finally {
      await migration.end();
    }

    const { rawReference } = await issueInvitation(app, identities, tenants.a, email);
    const response = await request(app.getHttpServer())
      .post(`/identity/invitations/${rawReference}/accept`)
      .set('x-subject', subject)
      .set('x-email', email)
      .send();

    expect(response.status).toBe(201);

    const migration2 = await connectAs('migration');
    try {
      const idRows = await migration2.query('SELECT count(*)::text AS n FROM identity WHERE subject = $1', [subject]);
      expect(Number(idRows.rows[0].n)).toBe(1);
    } finally {
      await migration2.end();
    }
  });

  it('scenario 5: accepting an already-accepted invitation is refused', async () => {
    const email = `once-only-${Date.now()}@example.com`;
    const { rawReference } = await issueInvitation(app, identities, tenants.a, email);
    const subject = `idp|once-only-${Date.now()}`;

    const first = await request(app.getHttpServer())
      .post(`/identity/invitations/${rawReference}/accept`)
      .set('x-subject', subject)
      .set('x-email', email)
      .send();
    expect(first.status).toBe(201);

    const second = await request(app.getHttpServer())
      .post(`/identity/invitations/${rawReference}/accept`)
      .set('x-subject', subject)
      .set('x-email', email)
      .send();
    expect(second.status).toBe(400);
    expect(second.body.error.code).toBe('invitation_invalid');
  });

  it('scenario 6: an authenticated email different from the invited one is refused', async () => {
    const email = `invited-${Date.now()}@example.com`;
    const { rawReference } = await issueInvitation(app, identities, tenants.a, email);

    const response = await request(app.getHttpServer())
      .post(`/identity/invitations/${rawReference}/accept`)
      .set('x-subject', 'idp|wrong-person')
      .set('x-email', `different-${Date.now()}@example.com`)
      .send();

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('invitation_invalid');
  });

  it('a nonexistent reference produces the identical refusal shape as an expired/used one', async () => {
    const response = await request(app.getHttpServer())
      .post('/identity/invitations/does-not-exist-at-all/accept')
      .set('x-subject', 'idp|nobody')
      .set('x-email', 'nobody@example.com')
      .send();

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: { code: 'invitation_invalid', message: 'This invitation cannot be accepted.' },
    });
  });

  it('quickstart V5/SC-005: two concurrent acceptances of the same invitation produce exactly one membership', async () => {
    const email = `concurrent-${Date.now()}@example.com`;
    const { rawReference } = await issueInvitation(app, identities, tenants.a, email);
    const subject = `idp|concurrent-${Date.now()}`;

    const [a, b] = await Promise.all([
      request(app.getHttpServer())
        .post(`/identity/invitations/${rawReference}/accept`)
        .set('x-subject', subject)
        .set('x-email', email)
        .send(),
      request(app.getHttpServer())
        .post(`/identity/invitations/${rawReference}/accept`)
        .set('x-subject', subject)
        .set('x-email', email)
        .send(),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 400]);

    const migration = await connectAs('migration');
    try {
      const { rows } = await migration.query(
        `SELECT count(*)::text AS n FROM membership m JOIN identity i ON i.id = m.identity_id WHERE i.subject = $1`,
        [subject],
      );
      expect(Number(rows[0].n)).toBe(1);
    } finally {
      await migration.end();
    }
  });
});
