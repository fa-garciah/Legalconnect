/**
 * T055a — spec.md Assumptions, clarified 2026-08-27.
 *
 * **This test documents an accepted trade-off. It does not guard an invariant.**
 *
 * Two people editing one client or one case in the same window will both succeed, and the
 * later write silently replaces the earlier. Nothing detects the collision at write time,
 * and no optimistic-concurrency check exists on any of this slice's six tables.
 *
 * The clarification session considered adding one and declined: it would touch every write
 * route and every caller of them, for a failure mode that needs two people editing one
 * record within seconds, and no slice shipped so far carries it. What makes the loss
 * recoverable rather than invisible is FR-022 — every write records its previous and new
 * values, so a lost update is reconstructable after the fact by anyone reading the trail.
 *
 * The purpose of this file is that a future reader finds a DECISION here rather than a gap,
 * and knows what evidence exists when a firm reports a correction that vanished. If a real
 * lost update is ever reported, this is the test to change, and the audit trail is what
 * will have let them report it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createRealApp } from '../helpers/real-app';
import { connectAs } from '../helpers/db';
import { uniqueRfc } from '../helpers/rfc';
import { makeCaseFirm, nextSuffix, uniqueName, type CaseFirm } from '../helpers/case-core';

describe('concurrent edits are last-write-wins, deliberately', () => {
  let app: INestApplication;
  let migration: Client;
  let firm: CaseFirm;

  const headers = () => ({
    'x-identity-id': firm.mp.identityId,
    'x-tenant-id': firm.tenantId,
  });

  beforeAll(async () => {
    app = await createRealApp();
    migration = await connectAs('migration');
    firm = await makeCaseFirm(migration, `CC Concurrencia ${nextSuffix()}`, uniqueRfc());
  });

  afterAll(async () => {
    await migration.end();
    await app.close();
  });

  it('two overlapping client updates both succeed, and one edit is lost', async () => {
    const original = uniqueName('Original');
    const created = await request(app.getHttpServer())
      .post('/tenant/clients')
      .set(headers())
      .send({ kind: 'organization', legalName: original });
    const id = created.body.id as string;

    const first = uniqueName('Primera');
    const second = uniqueName('Segunda');

    const [a, b] = await Promise.all([
      request(app.getHttpServer()).patch(`/tenant/clients/${id}`).set(headers()).send({ legalName: first }),
      request(app.getHttpServer()).patch(`/tenant/clients/${id}`).set(headers()).send({ legalName: second }),
    ]);

    // Neither is refused. There is no 409, no version token, no retry.
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);

    const { rows } = await migration.query<{ legal_name: string }>(
      `SELECT legal_name FROM client WHERE id = $1`,
      [id],
    );
    // Exactly one of the two names survives, and the other person's correction is gone with
    // no error anywhere. That is the cost, stated.
    expect([first, second]).toContain(rows[0]!.legal_name);
  });

  it('but BOTH writes are in the audit trail, with previous and new values', async () => {
    const original = uniqueName('Rastreable');
    const created = await request(app.getHttpServer())
      .post('/tenant/clients')
      .set(headers())
      .send({ kind: 'person', legalName: original });
    const id = created.body.id as string;

    await Promise.all([
      request(app.getHttpServer())
        .patch(`/tenant/clients/${id}`)
        .set(headers())
        .send({ legalName: uniqueName('Cambio A') }),
      request(app.getHttpServer())
        .patch(`/tenant/clients/${id}`)
        .set(headers())
        .send({ legalName: uniqueName('Cambio B') }),
    ]);

    const { rows } = await migration.query<{ metadata: { legalName?: { from: string; to: string } } }>(
      `SELECT metadata FROM audit_event
        WHERE action = 'client.updated' AND target_id = $1 ORDER BY occurred_at`,
      [id],
    );

    // Two entries, each naming what it replaced. This is the whole of the mitigation: the
    // collision is not prevented, but it is reconstructable — a reader can see that two
    // edits landed, what each one changed, and which one the record now holds.
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.metadata.legalName).toBeDefined();
      expect(row.metadata.legalName!.from).toBeTruthy();
      expect(row.metadata.legalName!.to).toBeTruthy();
    }
  });

  it('the collisions that ARE guarded stay guarded — uniqueness is not concurrency', async () => {
    // Worth separating, because "last write wins" is easy to over-read as "nothing is
    // enforced". The database constraints still hold under exactly the same interleaving:
    // two concurrent callers cannot both claim one file number, and cannot both create the
    // same live assignment.
    const { rows: clientRows } = await migration.query<{ id: string }>(
      `INSERT INTO client (tenant_id, kind, legal_name) VALUES ($1, 'person', $2) RETURNING id`,
      [firm.tenantId, uniqueName('Cliente Concurrente')],
    );
    const fileNumber = uniqueName('EXP-CONC');

    const attempts = await Promise.all(
      [0, 1].map(() =>
        request(app.getHttpServer())
          .post('/tenant/cases')
          .set(headers())
          .send({ clientId: clientRows[0]!.id, fileNumber, caseStatusId: firm.statusOpenId }),
      ),
    );

    const statuses = attempts.map((a) => a.status).sort();
    expect(statuses).toEqual([201, 409]);
  });
});
