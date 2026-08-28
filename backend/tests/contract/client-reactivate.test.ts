/**
 * T032b — 006/FR-004a, SC-007b. quickstart.md Scenario 1b.
 *
 * Withdrawal had no inverse until the clarification session of 2026-08-27. Without one, a
 * mis-click permanently barred a party from ever having another matter opened against
 * them, and the only remedy was a duplicate record — which this slice explicitly will not
 * merge, so the duplicate would have been permanent too.
 *
 * Restoration shares the capability that withdraws (row 28), which is why the `PL`
 * assertion below is the same refusal Q1 gives them on deactivation.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createRealApp } from '../helpers/real-app';
import { connectAs } from '../helpers/db';
import { uniqueRfc } from '../helpers/rfc';
import { makeCaseFirm, nextSuffix, uniqueName, type Actor, type CaseFirm } from '../helpers/case-core';

describe('restoring a withdrawn client', () => {
  let app: INestApplication;
  let migration: Client;
  let firm: CaseFirm;
  let otherFirm: CaseFirm;

  const create = (actor: Actor, tenantId: string) =>
    request(app.getHttpServer())
      .post('/tenant/clients')
      .set('x-identity-id', actor.identityId)
      .set('x-tenant-id', tenantId)
      .send({ kind: 'organization', legalName: uniqueName('Restaurable') });

  const deactivate = (actor: Actor, tenantId: string, id: string) =>
    request(app.getHttpServer())
      .post(`/tenant/clients/${id}/deactivate`)
      .set('x-identity-id', actor.identityId)
      .set('x-tenant-id', tenantId)
      .send();

  const reactivate = (actor: Actor, tenantId: string, id: string) =>
    request(app.getHttpServer())
      .post(`/tenant/clients/${id}/reactivate`)
      .set('x-identity-id', actor.identityId)
      .set('x-tenant-id', tenantId)
      .send();

  beforeAll(async () => {
    app = await createRealApp();
    migration = await connectAs('migration');
    firm = await makeCaseFirm(migration, `CC Restauración ${nextSuffix()}`, uniqueRfc());
    otherFirm = await makeCaseFirm(migration, `CC Restauración Otra ${nextSuffix()}`, uniqueRfc());
  });

  afterAll(async () => {
    await migration.end();
    await app.close();
  });

  it('SC-007b — the round trip works, and the client is usable again afterwards', async () => {
    const client = await create(firm.mp, firm.tenantId);
    const id = client.body.id as string;

    await deactivate(firm.mp, firm.tenantId, id);

    const restored = await reactivate(firm.mp, firm.tenantId, id);
    expect(restored.status).toBe(200);
    expect(restored.body.status).toBe('active');

    // The point of the whole feature: a new matter can be opened again, with no duplicate
    // client record needed.
    const opened = await request(app.getHttpServer())
      .post('/tenant/cases')
      .set('x-identity-id', firm.mp.identityId)
      .set('x-tenant-id', firm.tenantId)
      .send({ clientId: id, fileNumber: uniqueName('EXP'), caseStatusId: firm.statusOpenId });
    expect(opened.status).toBe(201);
  });

  it('SC-007b — the round trip leaves two distinct audit entries', async () => {
    const client = await create(firm.mp, firm.tenantId);
    const id = client.body.id as string;

    await deactivate(firm.mp, firm.tenantId, id);
    await reactivate(firm.mp, firm.tenantId, id);

    const { rows } = await migration.query<{ action: string }>(
      `SELECT action FROM audit_event
        WHERE target_id = $1 AND action IN ('client.deactivated', 'client.reactivated')
        ORDER BY occurred_at`,
      [id],
    );

    // Two, in order. `client.reactivated` is its own action rather than a
    // `client.updated` carrying a status field, precisely so the round trip reads as a
    // round trip rather than as an edit somebody has to decode.
    expect(rows.map((r) => r.action)).toEqual(['client.deactivated', 'client.reactivated']);
  });

  it('restoring an already-active client is refused', async () => {
    const client = await create(firm.mp, firm.tenantId);

    const refused = await reactivate(firm.mp, firm.tenantId, client.body.id);
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('already_active');
  });

  it('BM and SA may restore; PL may not — the same split Q1 gives deactivation', async () => {
    for (const actor of [firm.bm, firm.sa]) {
      const client = await create(firm.mp, firm.tenantId);
      await deactivate(firm.mp, firm.tenantId, client.body.id);
      const restored = await reactivate(actor, firm.tenantId, client.body.id);
      expect(restored.status).toBe(200);
    }

    const forPl = await create(firm.mp, firm.tenantId);
    await deactivate(firm.mp, firm.tenantId, forPl.body.id);
    const refused = await reactivate(firm.pl, firm.tenantId, forPl.body.id);
    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe('not_authorized');
  });

  it('another tenant\'s client cannot be restored, and the refusal discloses nothing', async () => {
    const theirs = await create(otherFirm.mp, otherFirm.tenantId);
    await deactivate(otherFirm.mp, otherFirm.tenantId, theirs.body.id);

    const refused = await reactivate(firm.mp, firm.tenantId, theirs.body.id);
    expect(refused.status).toBe(404);
    expect(refused.body.error.code).toBe('not_found');

    // Still withdrawn over there — the refusal changed nothing.
    const { rows } = await migration.query<{ status: string }>(
      `SELECT status FROM client WHERE id = $1`,
      [theirs.body.id],
    );
    expect(rows[0]!.status).toBe('inactive');
  });
});
