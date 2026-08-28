/**
 * T040 — 006/FR-023, SC-005, SC-006. quickstart.md Scenario 5.
 *
 * `case.read` is the first ACCESS record anywhere in this product. Principle V requires
 * recording every access to CASES and not only their modification, and this is the slice
 * that first owns an entity that clause names — a gap the spec's source draft had missed.
 *
 * It is channel-gated for the reason 001 gates `audit.queried` and `tenant.registry_read`:
 * an ungated read action lets a monitoring job inflate the log it watches. Both directions
 * are asserted, because an implementation that recorded nothing at all would satisfy
 * "automated reads are silent" while breaking the requirement entirely.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createRealApp } from '../helpers/real-app';
import { connectAs } from '../helpers/db';
import { uniqueRfc } from '../helpers/rfc';
import { makeCaseFirm, nextSuffix, uniqueName, type CaseFirm } from '../helpers/case-core';

describe('the single-case read is audited, and channel-gated', () => {
  let app: INestApplication;
  let migration: Client;
  let firm: CaseFirm;
  let caseId: string;

  const read = (channel?: string) => {
    const call = request(app.getHttpServer())
      .get(`/tenant/cases/${caseId}`)
      .set('x-identity-id', firm.mp.identityId)
      .set('x-tenant-id', firm.tenantId);
    return channel ? call.set('x-channel', channel) : call;
  };

  const readEntries = async (): Promise<number> => {
    const { rows } = await migration.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM audit_event WHERE action = 'case.read' AND target_id = $1`,
      [caseId],
    );
    return Number(rows[0]!.n);
  };

  beforeAll(async () => {
    app = await createRealApp();
    migration = await connectAs('migration');
    firm = await makeCaseFirm(migration, `CC Lectura ${nextSuffix()}`, uniqueRfc());

    const { rows: clientRows } = await migration.query<{ id: string }>(
      `INSERT INTO client (tenant_id, kind, legal_name) VALUES ($1, 'organization', $2) RETURNING id`,
      [firm.tenantId, uniqueName('Cliente Lectura')],
    );
    const { rows } = await migration.query<{ id: string }>(
      `INSERT INTO case_file (tenant_id, client_id, file_number, case_status_id)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [firm.tenantId, clientRows[0]!.id, uniqueName('EXP-A'), firm.statusOpenId],
    );
    caseId = rows[0]!.id;
  });

  afterAll(async () => {
    await migration.end();
    await app.close();
  });

  it('SC-006 — an interactive read produces exactly one entry', async () => {
    const before = await readEntries();

    const response = await read();
    expect(response.status).toBe(200);

    expect(await readEntries()).toBe(before + 1);
  });

  it('SC-006 — an automated read produces ZERO', async () => {
    const before = await readEntries();

    const response = await read('automated');
    expect(response.status).toBe(200);

    // The gate. A monitoring job may read a matter without growing the log a firm reads.
    expect(await readEntries()).toBe(before);
  });

  it('the entry carries the actor, the tenant and the case', async () => {
    await read();

    const { rows } = await migration.query<{
      tenant_id: string;
      target_entity: string;
      actor_identity_id: string;
      actor_membership_id: string;
    }>(
      `SELECT tenant_id, target_entity, actor_identity_id, actor_membership_id
         FROM audit_event WHERE action = 'case.read' AND target_id = $1
        ORDER BY occurred_at DESC LIMIT 1`,
      [caseId],
    );

    expect(rows[0]).toMatchObject({
      tenant_id: firm.tenantId,
      target_entity: 'case_file',
      actor_identity_id: firm.mp.identityId,
      actor_membership_id: firm.mp.membershipId,
    });
  });

  it('a refused read records nothing — the log must not confirm what the 404 hides', async () => {
    const before = await readEntries();

    // The AA is on nobody's team, so this is the opaque scope refusal.
    const refused = await request(app.getHttpServer())
      .get(`/tenant/cases/${caseId}`)
      .set('x-identity-id', firm.aa.identityId)
      .set('x-tenant-id', firm.tenantId);
    expect(refused.status).toBe(404);

    // If a refusal wrote an entry, the audit log would confirm the existence the 404 exists
    // to hide — from anyone who can read that log.
    expect(await readEntries()).toBe(before);
  });

  it('every mutation in this slice writes exactly one entry (SC-005)', async () => {
    const countOf = async (action: string): Promise<number> => {
      const { rows } = await migration.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM audit_event WHERE action = $1 AND tenant_id = $2`,
        [action, firm.tenantId],
      );
      return Number(rows[0]!.n);
    };

    const headers = {
      'x-identity-id': firm.mp.identityId,
      'x-tenant-id': firm.tenantId,
    };
    const server = app.getHttpServer();

    const before = {
      created: await countOf('client.created'),
      updated: await countOf('client.updated'),
      caseCreated: await countOf('case.created'),
      statusChanged: await countOf('case.status_changed'),
      catalogCreated: await countOf('case.catalog_entry_created'),
    };

    const client = await request(server).post('/tenant/clients').set(headers).send({
      kind: 'person',
      legalName: uniqueName('Auditado'),
    });
    await request(server)
      .patch(`/tenant/clients/${client.body.id}`)
      .set(headers)
      .send({ legalName: uniqueName('Auditado Corregido') });

    const opened = await request(server).post('/tenant/cases').set(headers).send({
      clientId: client.body.id,
      fileNumber: uniqueName('EXP-AUD'),
      caseStatusId: firm.statusOpenId,
    });
    await request(server)
      .patch(`/tenant/cases/${opened.body.id}/status`)
      .set(headers)
      .send({ caseStatusId: firm.statusClosingId });

    await request(server)
      .post('/tenant/case-catalogs/matter-types')
      .set(headers)
      .send({ name: uniqueName('Auditoría') });

    expect(await countOf('client.created')).toBe(before.created + 1);
    expect(await countOf('client.updated')).toBe(before.updated + 1);
    expect(await countOf('case.created')).toBe(before.caseCreated + 1);
    expect(await countOf('case.status_changed')).toBe(before.statusChanged + 1);
    expect(await countOf('case.catalog_entry_created')).toBe(before.catalogCreated + 1);
  });

  it('client.updated carries previous and new for each field that moved, and only those', async () => {
    const server = app.getHttpServer();
    const headers = { 'x-identity-id': firm.mp.identityId, 'x-tenant-id': firm.tenantId };

    const before = uniqueName('Antes');
    const after = uniqueName('Después');
    const client = await request(server)
      .post('/tenant/clients')
      .set(headers)
      .send({ kind: 'person', legalName: before });

    await request(server)
      .patch(`/tenant/clients/${client.body.id}`)
      .set(headers)
      .send({ legalName: after });

    const { rows } = await migration.query<{ metadata: Record<string, unknown> }>(
      `SELECT metadata FROM audit_event WHERE action = 'client.updated' AND target_id = $1`,
      [client.body.id],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.metadata).toEqual({ legalName: { from: before, to: after } });
    // `rfc` was not sent and did not move, so it is absent rather than recorded as
    // unchanged — the entry answers "what changed", not "what was sent".
    expect(rows[0]!.metadata).not.toHaveProperty('rfc');
  });
});
