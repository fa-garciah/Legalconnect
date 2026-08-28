/**
 * T025 / T025a — 006/FR-019, FR-020, FR-008a. quickstart.md Scenario 4.
 *
 * 017's `position-catalog.test.ts` applied to three structurally identical catalogs, plus
 * the one thing `position` has no analogue for: `is_closing`.
 *
 * Every write lands in this suite's own firms, never the two `db:seed` tenants —
 * `provision-seeds-case-catalogs.test.ts` asserts a freshly provisioned tenant holds
 * exactly the default seed, and a contract test that added a row would break it on the
 * next run without re-seeding.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createRealApp } from '../helpers/real-app';
import { connectAs } from '../helpers/db';
import { uniqueRfc } from '../helpers/rfc';
import { makeCaseFirm, nextSuffix, uniqueName, type Actor, type CaseFirm } from '../helpers/case-core';

const SEGMENTS = ['case-statuses', 'matter-types', 'venues'] as const;

describe('the case catalogs', () => {
  let app: INestApplication;
  let migration: Client;
  let firm: CaseFirm;
  let otherFirm: CaseFirm;

  const list = (actor: Actor, tenantId: string, segment: string) =>
    request(app.getHttpServer())
      .get(`/tenant/case-catalogs/${segment}`)
      .set('x-identity-id', actor.identityId)
      .set('x-tenant-id', tenantId);

  const create = (actor: Actor, tenantId: string, segment: string, body: object) =>
    request(app.getHttpServer())
      .post(`/tenant/case-catalogs/${segment}`)
      .set('x-identity-id', actor.identityId)
      .set('x-tenant-id', tenantId)
      .send(body);

  const update = (actor: Actor, tenantId: string, segment: string, id: string, body: object) =>
    request(app.getHttpServer())
      .patch(`/tenant/case-catalogs/${segment}/${id}`)
      .set('x-identity-id', actor.identityId)
      .set('x-tenant-id', tenantId)
      .send(body);

  const retire = (actor: Actor, tenantId: string, segment: string, id: string) =>
    request(app.getHttpServer())
      .patch(`/tenant/case-catalogs/${segment}/${id}/retire`)
      .set('x-identity-id', actor.identityId)
      .set('x-tenant-id', tenantId)
      .send();

  beforeAll(async () => {
    app = await createRealApp();
    migration = await connectAs('migration');
    firm = await makeCaseFirm(migration, `CC Catálogo ${nextSuffix()}`, uniqueRfc());
    otherFirm = await makeCaseFirm(migration, `CC Catálogo Otra ${nextSuffix()}`, uniqueRfc());
  });

  afterAll(async () => {
    await migration.end();
    await app.close();
  });

  it('MP adds an entry to each of the three catalogs', async () => {
    for (const segment of SEGMENTS) {
      const name = uniqueName(`Entrada ${segment}`);
      const created = await create(firm.mp, firm.tenantId, segment, { name });

      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({ name, status: 'active' });
    }
  });

  it('a duplicate ACTIVE name collides per tenant, trimmed and case-insensitively', async () => {
    const name = uniqueName('Colisión');
    expect((await create(firm.mp, firm.tenantId, 'venues', { name })).status).toBe(201);

    const dup = await create(firm.mp, firm.tenantId, 'venues', {
      name: `  ${name.toUpperCase()}  `,
    });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('catalog_entry_already_exists');

    // Another firm using the same court name is not a collision.
    const elsewhere = await create(otherFirm.mp, otherFirm.tenantId, 'venues', { name });
    expect(elsewhere.status).toBe(201);
  });

  it('the same name is free again once the first is retired — retire-then-recreate', async () => {
    const name = uniqueName('Reutilizable');
    const first = await create(firm.mp, firm.tenantId, 'matter-types', { name });

    await retire(firm.mp, firm.tenantId, 'matter-types', first.body.id);

    const again = await create(firm.mp, firm.tenantId, 'matter-types', { name });
    expect(again.status).toBe(201);
    expect(again.body.id).not.toBe(first.body.id);
  });

  it('FR-020 — a retired entry stays listed and marked, and is offered for no new case', async () => {
    const created = await create(firm.mp, firm.tenantId, 'matter-types', {
      name: uniqueName('Por Retirar'),
    });
    await retire(firm.mp, firm.tenantId, 'matter-types', created.body.id);

    const listed = await list(firm.aa, firm.tenantId, 'matter-types');
    const entry = listed.body.items.find((e: { id: string }) => e.id === created.body.id);
    // Still there, and labelled — so a case already holding it can be rendered.
    expect(entry).toMatchObject({ status: 'retired' });
    expect(entry.retiredAt).toBeTruthy();

    // But refused for a new case.
    const { rows } = await migration.query<{ id: string }>(
      `INSERT INTO client (tenant_id, kind, legal_name) VALUES ($1, 'person', $2) RETURNING id`,
      [firm.tenantId, uniqueName('Cliente Cat')],
    );
    const refused = await request(app.getHttpServer())
      .post('/tenant/cases')
      .set('x-identity-id', firm.mp.identityId)
      .set('x-tenant-id', firm.tenantId)
      .send({
        clientId: rows[0]!.id,
        fileNumber: uniqueName('EXP-CAT'),
        caseStatusId: firm.statusOpenId,
        matterTypeId: created.body.id,
      });
    expect(refused.status).toBe(422);
  });

  it('a second retirement is refused', async () => {
    const created = await create(firm.mp, firm.tenantId, 'venues', { name: uniqueName('Dos Veces') });
    await retire(firm.mp, firm.tenantId, 'venues', created.body.id);

    const again = await retire(firm.mp, firm.tenantId, 'venues', created.body.id);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('already_retired');
  });

  it('every internal archetype reads the catalogs; only MP and SA write them', async () => {
    for (const actor of [firm.mp, firm.sa, firm.aa, firm.pl, firm.cm, firm.bm]) {
      expect((await list(actor, firm.tenantId, 'matter-types')).status).toBe(200);
    }
    for (const actor of [firm.aa, firm.pl, firm.cm, firm.bm]) {
      const refused = await create(actor, firm.tenantId, 'matter-types', { name: uniqueName('No') });
      expect(refused.status).toBe(403);
    }
  });

  it('another tenant\'s entry is a generic 404', async () => {
    const theirs = await create(otherFirm.mp, otherFirm.tenantId, 'venues', {
      name: uniqueName('Ajena'),
    });

    const refused = await retire(firm.mp, firm.tenantId, 'venues', theirs.body.id);
    expect(refused.status).toBe(404);
    expect(refused.body.error.code).toBe('not_found');
  });

  it('an unknown catalog segment is a generic 404, so probing reveals nothing', async () => {
    const refused = await list(firm.mp, firm.tenantId, 'invoices');
    expect(refused.status).toBe(404);
    expect(refused.body.error.code).toBe('not_found');
  });

  it('retiring the LAST active case status is permitted — recoverable, so not guarded', async () => {
    const lonely = await makeCaseFirm(migration, `CC Último ${nextSuffix()}`, uniqueRfc());
    const listed = await list(lonely.mp, lonely.tenantId, 'case-statuses');

    for (const entry of listed.body.items) {
      const done = await retire(lonely.mp, lonely.tenantId, 'case-statuses', entry.id);
      expect(done.status).toBe(200);
    }

    // A "must retain one" invariant would be 004's `LastAdministratorProtected` pattern,
    // and 004 introduced that only where the failure is UNRECOVERABLE. This is one request
    // away from fixed, and inventing the guard would be a requirement the spec lacks.
    const recovered = await create(lonely.mp, lonely.tenantId, 'case-statuses', {
      name: uniqueName('Nuevo'),
    });
    expect(recovered.status).toBe(201);
  });

  describe('is_closing (FR-008a) — only on case statuses', () => {
    it('is accepted on creation and defaults to false', async () => {
      const withFlag = await create(firm.mp, firm.tenantId, 'case-statuses', {
        name: uniqueName('Final'),
        isClosing: true,
      });
      expect(withFlag.status).toBe(201);
      expect(withFlag.body.isClosing).toBe(true);

      const without = await create(firm.mp, firm.tenantId, 'case-statuses', {
        name: uniqueName('Corriente'),
      });
      expect(without.body.isClosing).toBe(false);
    });

    it('is refused on the other two catalogs rather than silently ignored', async () => {
      for (const segment of ['matter-types', 'venues'] as const) {
        const refused = await create(firm.mp, firm.tenantId, segment, {
          name: uniqueName('Con Bandera'),
          isClosing: true,
        });
        // Dropping it silently would let a firm believe they had marked something they had
        // not, and the mistake would surface later as cases that never close.
        expect(refused.status).toBe(400);
        expect(refused.body.error.code).toBe('validation_failed');
      }
    });

    it('is the ONE editable field, and the change is audited with previous and new', async () => {
      const created = await create(firm.mp, firm.tenantId, 'case-statuses', {
        name: uniqueName('Mutable'),
      });

      const changed = await update(firm.mp, firm.tenantId, 'case-statuses', created.body.id, {
        isClosing: true,
      });
      expect(changed.status).toBe(200);
      expect(changed.body.isClosing).toBe(true);

      const { rows } = await migration.query<{ metadata: { from?: boolean; to?: boolean } }>(
        `SELECT metadata FROM audit_event
          WHERE action = 'case.catalog_entry_updated' AND target_id = $1`,
        [created.body.id],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.metadata).toMatchObject({ from: false, to: true });
    });

    it('the update route does not exist on the other two catalogs', async () => {
      const created = await create(firm.mp, firm.tenantId, 'venues', {
        name: uniqueName('Sin Bandera'),
      });

      const refused = await update(firm.mp, firm.tenantId, 'venues', created.body.id, {
        isClosing: true,
      });
      expect(refused.status).toBe(404);
    });

    it('a non-boolean is refused', async () => {
      const created = await create(firm.mp, firm.tenantId, 'case-statuses', {
        name: uniqueName('Booleano'),
      });

      const refused = await update(firm.mp, firm.tenantId, 'case-statuses', created.body.id, {
        isClosing: 'yes',
      });
      expect(refused.status).toBe(400);
    });

    it('a tenant may mark several statuses closing, or none', async () => {
      const flexible = await makeCaseFirm(migration, `CC Flexible ${nextSuffix()}`, uniqueRfc());

      const a = await create(flexible.mp, flexible.tenantId, 'case-statuses', {
        name: uniqueName('Concluido'),
        isClosing: true,
      });
      const b = await create(flexible.mp, flexible.tenantId, 'case-statuses', {
        name: uniqueName('Archivado'),
        isClosing: true,
      });
      expect(a.status).toBe(201);
      expect(b.status).toBe(201);

      // And none: every flag can be cleared, and the product has no opinion about that.
      for (const entry of [a.body, b.body]) {
        const cleared = await update(flexible.mp, flexible.tenantId, 'case-statuses', entry.id, {
          isClosing: false,
        });
        expect(cleared.body.isClosing).toBe(false);
      }
    });
  });
});
