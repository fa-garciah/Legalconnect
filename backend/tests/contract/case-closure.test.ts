/**
 * T040a — 006/FR-008a, SC-008b. quickstart.md Scenario 2b.
 *
 * The clarification session of 2026-08-27 found that the spec promised a closing date with
 * no rule for setting it, and that the design had quietly invented one (a caller-supplied
 * date). That reading let a case sit in *Concluido* with no closing date while nothing
 * noticed. This suite is the answer that replaced it.
 *
 * The rule the product CANNOT have an opinion about is which statuses close a matter —
 * case statuses are per-tenant rows, so *Concluido* means nothing to the product that
 * *Archivado* does not. The firm declares it; the product derives from the declaration.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createRealApp } from '../helpers/real-app';
import { connectAs } from '../helpers/db';
import { uniqueRfc } from '../helpers/rfc';
import { makeCaseFirm, nextSuffix, uniqueName, type CaseFirm } from '../helpers/case-core';

describe('case closure follows the firm\'s own catalog', () => {
  let app: INestApplication;
  let migration: Client;
  let firm: CaseFirm;
  let clientId: string;

  const open = (fileNumber: string, caseStatusId: string) =>
    request(app.getHttpServer())
      .post('/tenant/cases')
      .set('x-identity-id', firm.mp.identityId)
      .set('x-tenant-id', firm.tenantId)
      .send({ clientId, fileNumber, caseStatusId });

  const changeStatus = (id: string, body: object) =>
    request(app.getHttpServer())
      .patch(`/tenant/cases/${id}/status`)
      .set('x-identity-id', firm.mp.identityId)
      .set('x-tenant-id', firm.tenantId)
      .send(body);

  const read = (id: string) =>
    request(app.getHttpServer())
      .get(`/tenant/cases/${id}`)
      .set('x-identity-id', firm.mp.identityId)
      .set('x-tenant-id', firm.tenantId);

  beforeAll(async () => {
    app = await createRealApp();
    migration = await connectAs('migration');
    firm = await makeCaseFirm(migration, `CC Cierre ${nextSuffix()}`, uniqueRfc());
    const { rows } = await migration.query<{ id: string }>(
      `INSERT INTO client (tenant_id, kind, legal_name) VALUES ($1, 'organization', $2) RETURNING id`,
      [firm.tenantId, uniqueName('Cliente Cierre')],
    );
    clientId = rows[0]!.id;
  });

  afterAll(async () => {
    await migration.end();
    await app.close();
  });

  it('SC-008b — moving to a closing status stamps the date, with no caller input', async () => {
    const opened = await open(uniqueName('EXP-C1'), firm.statusOpenId);
    expect(opened.body.closedOn).toBeNull();

    const closed = await changeStatus(opened.body.id, { caseStatusId: firm.statusClosingId });
    expect(closed.status).toBe(200);
    expect(closed.body.closedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('moving back to a non-closing status clears the date', async () => {
    const opened = await open(uniqueName('EXP-C2'), firm.statusClosingId);
    // Opened DIRECTLY into a closing status — the derivation applies from the first write,
    // not only on a later change.
    expect(opened.body.closedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const reopened = await changeStatus(opened.body.id, { caseStatusId: firm.statusOpenId });
    expect(reopened.status).toBe(200);
    expect(reopened.body.closedOn).toBeNull();
  });

  it('closedOn is refused as input — it is output-only', async () => {
    const opened = await open(uniqueName('EXP-C3'), firm.statusOpenId);

    const onChange = await changeStatus(opened.body.id, {
      caseStatusId: firm.statusClosingId,
      closedOn: '2020-01-01',
    });
    expect(onChange.status).toBe(400);
    expect(onChange.body.error.code).toBe('validation_failed');

    // And on creation too — a second way for the status and the date to disagree would be
    // exactly the gap this rule closed.
    const onCreate = await request(app.getHttpServer())
      .post('/tenant/cases')
      .set('x-identity-id', firm.mp.identityId)
      .set('x-tenant-id', firm.tenantId)
      .send({
        clientId,
        fileNumber: uniqueName('EXP-C4'),
        caseStatusId: firm.statusOpenId,
        closedOn: '2020-01-01',
      });
    expect(onCreate.status).toBe(400);
  });

  it('a tenant may mark SEVERAL statuses closing — either one closes a matter', async () => {
    const { rows } = await migration.query<{ id: string }>(
      `INSERT INTO case_status (tenant_id, name, is_closing) VALUES ($1, $2, true) RETURNING id`,
      [firm.tenantId, uniqueName('Archivado')],
    );
    const secondClosing = rows[0]!.id;

    const opened = await open(uniqueName('EXP-C5'), firm.statusOpenId);
    const closed = await changeStatus(opened.body.id, { caseStatusId: secondClosing });

    expect(closed.status).toBe(200);
    expect(closed.body.closedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('a tenant may mark NONE — no case ever closes, and that is legal', async () => {
    const noClosure = await makeCaseFirm(migration, `CC Sin Cierre ${nextSuffix()}`, uniqueRfc());
    // Undo the fixture's closing flag: this firm declares nothing final.
    await migration.query(`UPDATE case_status SET is_closing = false WHERE tenant_id = $1`, [
      noClosure.tenantId,
    ]);
    const { rows } = await migration.query<{ id: string }>(
      `INSERT INTO client (tenant_id, kind, legal_name) VALUES ($1, 'person', $2) RETURNING id`,
      [noClosure.tenantId, uniqueName('Sin Cierre')],
    );

    const opened = await request(app.getHttpServer())
      .post('/tenant/cases')
      .set('x-identity-id', noClosure.mp.identityId)
      .set('x-tenant-id', noClosure.tenantId)
      .send({
        clientId: rows[0]!.id,
        fileNumber: uniqueName('EXP-N'),
        caseStatusId: noClosure.statusClosingId,
      });

    expect(opened.status).toBe(201);
    // Named `statusClosingId` by the fixture, but this firm has declared it non-closing —
    // and the product follows the firm, not the name.
    expect(opened.body.closedOn).toBeNull();
  });

  it('toggling isClosing does NOT retroactively re-date existing cases', async () => {
    const opened = await open(uniqueName('EXP-C6'), firm.statusOpenId);
    expect(opened.body.closedOn).toBeNull();

    // The firm changes its mind about what "En Proceso" means.
    await request(app.getHttpServer())
      .patch(`/tenant/case-catalogs/case-statuses/${firm.statusOpenId}`)
      .set('x-identity-id', firm.mp.identityId)
      .set('x-tenant-id', firm.tenantId)
      .send({ isClosing: true });

    // The already-open case is untouched. Rewriting every case when the catalog changes
    // would rewrite history the audit trail already records; cases re-date when they next
    // move status, and not before.
    const unchanged = await read(opened.body.id);
    expect(unchanged.body.closedOn).toBeNull();

    // Restore, so the shared fixture stays as the other tests expect.
    await request(app.getHttpServer())
      .patch(`/tenant/case-catalogs/case-statuses/${firm.statusOpenId}`)
      .set('x-identity-id', firm.mp.identityId)
      .set('x-tenant-id', firm.tenantId)
      .send({ isClosing: false });
  });

  it('a no-op status change is refused, so the log never gains one', async () => {
    const opened = await open(uniqueName('EXP-C7'), firm.statusOpenId);

    const refused = await changeStatus(opened.body.id, { caseStatusId: firm.statusOpenId });
    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe('same_status');
  });

  it('PL is refused on PERMISSION (403); an unassigned AA is refused on SCOPE (404)', async () => {
    const opened = await open(uniqueName('EXP-C8'), firm.statusOpenId);

    const change = (identityId: string) =>
      request(app.getHttpServer())
        .patch(`/tenant/cases/${opened.body.id}/status`)
        .set('x-identity-id', identityId)
        .set('x-tenant-id', firm.tenantId)
        .send({ caseStatusId: firm.statusClosingId });

    // `PL` holds no matrix row for `case.change_status`, and 004's refusal ORDERING puts
    // permission ahead of scope — so they are refused before the resolver is ever
    // consulted, and get the role-shaped 403 rather than the opaque 404.
    const byRole = await change(firm.pl.identityId);
    expect(byRole.status).toBe(403);
    expect(byRole.body.error.code).toBe('not_authorized');

    // `AA` DOES hold the row, so they reach the scope check — and, being on nobody's team,
    // are refused there instead. Same route, same case, two different refusals, and the
    // difference is exactly what 004's ordering is for.
    const byScope = await change(firm.aa.identityId);
    expect(byScope.status).toBe(404);
    expect(byScope.body.error.code).toBe('not_found');
  });
});
