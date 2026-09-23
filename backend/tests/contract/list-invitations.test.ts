/**
 * GET /tenant/invitations — lists only the active tenant's pending invitations,
 * with no token in the response. 014/FR-028 adds the invitee's email (below).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createAuthenticatedApp } from '../helpers/real-app';
import { seededTenantIds, type SeededTenants } from '../helpers/tenants';
import { seededIdentities, type SeededIdentities } from '../helpers/identities';

describe('GET /tenant/invitations', () => {
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

  it('lists only the active tenant\'s pending invitations, no email or token', async () => {
    const response = await request(app.getHttpServer())
      .get('/tenant/invitations')
      .set('x-identity-id', identities.dualId)
      .set('x-tenant-id', tenants.a);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.items)).toBe(true);
    expect(response.body.items.length).toBeGreaterThan(0);
    for (const item of response.body.items) {
      expect(item.tenantId).toBe(tenants.a);
      expect(item.status).toBe('pending');
      expect(item.email).toBeUndefined();
      expect(item.referenceHash).toBeUndefined();
    }
  });

  /*
   * 014-admin-ui FR-028 (Decision 5, approved 2026-09-23). 002 omitted the invitee's email from
   * this list; the administration screen could then show a pending invitation only as a role and
   * two dates, with no way to tell whom it was for. The issuer typed the email, and only SA/MP
   * hold `invitation.read_pending`, so returning it discloses nothing they did not supply.
   * Still no token and no hash: the link is shown once, in the issue response, and never again.
   */
  it('carries invitedEmail for each pending invitation, still no token or hash (014 FR-028)', async () => {
    const email = `pending-${randomUUID()}@example.com`;
    const issued = await request(app.getHttpServer())
      .post('/tenant/invitations')
      .set('x-identity-id', identities.dualId)
      .set('x-tenant-id', tenants.a)
      .send({ email, targetArchetype: 'AA' });
    expect(issued.status).toBe(201);
    const token = (issued.body.invitationLink as string).split('/').pop()!;

    const response = await request(app.getHttpServer())
      .get('/tenant/invitations')
      .set('x-identity-id', identities.dualId)
      .set('x-tenant-id', tenants.a);

    expect(response.status).toBe(200);
    const item = response.body.items.find((i: { id: string }) => i.id === issued.body.id);
    expect(item).toBeDefined();
    expect(item.invitedEmail).toBe(email);
    for (const each of response.body.items) {
      expect(typeof each.invitedEmail).toBe('string');
    }
    const text = JSON.stringify(response.body);
    expect(text).not.toContain(token);
    expect(text).not.toContain('referenceHash');
    expect(text).not.toContain('invitationLink');
  });
});
