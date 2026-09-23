/**
 * 014-admin-ui, Decision 3 (approved 2026-09-23) — the issuer receives the invitation link once.
 *
 * WHY. `POST /tenant/invitations` generated a raw reference token, stored only its SHA-256 hash,
 * and discarded the raw value, expecting an email to carry it. No email provider exists (the AWS
 * account is blocked), so no invitation could ever reach its invitee: the only way to create a
 * user was a script. The issuing SA/MP now receives `invitationLink` in the `201` and delivers it
 * themselves.
 *
 * WHAT MUST STAY TRUE, asserted below:
 *   - the link is genuine: SHA-256 of its token equals the stored `reference_hash`;
 *   - it is returned identically for an email that already holds a live membership, so the
 *     endpoint still cannot be used to learn who works at the firm (`002/FR-029`);
 *   - it is never re-readable, never in the audit row, and email is still not echoed.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createAuthenticatedApp } from '../helpers/real-app';
import { seededTenantIds, type SeededTenants } from '../helpers/tenants';
import { seededIdentities, type SeededIdentities } from '../helpers/identities';
import { connectAs } from '../helpers/db';
import { hashInvitationToken } from '../../src/modules/invitation/token';

describe('POST /tenant/invitations returns the invitation link once (014 Decision 3)', () => {
  let app: INestApplication;
  let tenants: SeededTenants;
  let identities: SeededIdentities;

  beforeAll(async () => {
    app = await createAuthenticatedApp();
    tenants = await seededTenantIds();
    identities = await seededIdentities();
  });

  afterAll(async () => {
    await app.close();
  });

  function issue(email: string) {
    return request(app.getHttpServer())
      .post('/tenant/invitations')
      .set('x-identity-id', identities.dualId)
      .set('x-tenant-id', tenants.a)
      .send({ email, targetArchetype: 'AA' });
  }

  it('carries a link of the form /aceptar/{token} whose hash is the stored reference', async () => {
    const response = await issue(`link-${randomUUID()}@example.com`);

    expect(response.status).toBe(201);
    const link: unknown = response.body.invitationLink;
    expect(typeof link).toBe('string');
    const match = /^\/aceptar\/([A-Za-z0-9_-]{32,})$/.exec(link as string);
    expect(match, 'link must be /aceptar/{base64url token}').not.toBeNull();

    const migration = await connectAs('migration');
    try {
      const { rows } = await migration.query<{ reference_hash: string }>(
        `SELECT reference_hash FROM invitation WHERE id = $1`,
        [response.body.id],
      );
      expect(rows[0]!.reference_hash).toBe(hashInvitationToken(match![1]!));
    } finally {
      await migration.end();
    }
  });

  it('returns the same shape for an email that already holds a live membership (002/FR-029)', async () => {
    // The dual identity itself is a live member of tenant A — invite its own email.
    const migration = await connectAs('migration');
    let memberEmail: string;
    try {
      const { rows } = await migration.query<{ email: string }>(
        `SELECT email FROM identity WHERE id = $1`,
        [identities.dualId],
      );
      memberEmail = rows[0]!.email;
    } finally {
      await migration.end();
    }

    const fresh = await issue(`fresh-${randomUUID()}@example.com`);
    const member = await issue(memberEmail);

    expect(member.status).toBe(fresh.status);
    expect(Object.keys(member.body).sort()).toEqual(Object.keys(fresh.body).sort());
    expect(member.body.invitationLink).toMatch(/^\/aceptar\//);
  });

  it('never echoes the email and never exposes the hash', async () => {
    const response = await issue(`quiet-${randomUUID()}@example.com`);
    expect(response.body.email).toBeUndefined();
    expect(response.body.referenceHash).toBeUndefined();
    expect(response.body.reference_hash).toBeUndefined();
  });

  it('is not re-readable: GET /tenant/invitations carries no link and no token', async () => {
    const issued = await issue(`once-${randomUUID()}@example.com`);
    const token = (issued.body.invitationLink as string).split('/').pop()!;

    const list = await request(app.getHttpServer())
      .get('/tenant/invitations')
      .set('x-identity-id', identities.dualId)
      .set('x-tenant-id', tenants.a);

    expect(list.status).toBe(200);
    const text = JSON.stringify(list.body);
    expect(text).not.toContain('invitationLink');
    expect(text).not.toContain(token);
  });

  it('keeps the token out of the audit row', async () => {
    const issued = await issue(`audit-${randomUUID()}@example.com`);
    const token = (issued.body.invitationLink as string).split('/').pop()!;

    const migration = await connectAs('migration');
    try {
      const { rows } = await migration.query<{ metadata: unknown }>(
        `SELECT metadata FROM audit_event WHERE action = 'invitation.issued' AND target_id = $1`,
        [issued.body.id],
      );
      expect(rows).toHaveLength(1);
      expect(JSON.stringify(rows[0]!.metadata)).not.toContain(token);
    } finally {
      await migration.end();
    }
  });
});
