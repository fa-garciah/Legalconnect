/**
 * T004 — 019's amendment to `006`'s list endpoint.
 * [contracts/case-list-filters.md](../../../specs/019-frontend-cases/contracts/case-list-filters.md)
 * §1 and §4.
 *
 * This file asks *did I get the right rows*. Its sibling,
 * `tests/integration/case-filter-scoping.test.ts`, asks *did I get rows I was never entitled
 * to* — a question this file cannot answer, because the failure it looks for returns a
 * superset and every assertion here would still pass.
 *
 * Run as `MP`, deliberately: with no assignment predicate in the way, a filter that returns
 * too little is visible here rather than being masked by scoping.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createRealApp } from '../helpers/real-app';
import { connectAs } from '../helpers/db';
import { uniqueRfc } from '../helpers/rfc';
import { makeCaseFirm, nextSuffix, uniqueName, type CaseFirm } from '../helpers/case-core';

interface ListItem {
  readonly id: string;
  readonly fileNumber: string;
}

describe('GET /tenant/cases — the three filters', () => {
  let app: INestApplication;
  let migration: Client;
  let firm: CaseFirm;

  let mercantilId: string;
  let fiscalId: string;
  let civilId: string;
  let norteId: string;

  /** Shared by both clients' names, so one term can match the pair. */
  let shared: string;

  let torres: { id: string; fileNumber: string; clientName: string };
  let perez: { id: string; fileNumber: string; clientName: string };

  const list = (query = '') =>
    request(app.getHttpServer())
      .get(`/tenant/cases${query}`)
      .set('x-identity-id', firm.mp.identityId)
      .set('x-tenant-id', firm.tenantId);

  const idsFrom = (body: { items: ListItem[] }): string[] => body.items.map((item) => item.id);

  beforeAll(async () => {
    app = await createRealApp();
    migration = await connectAs('migration');
    firm = await makeCaseFirm(migration, `CC Filtro ${nextSuffix()}`, uniqueRfc());
    shared = `Grupo${nextSuffix()}`;

    const catalogId = async (table: string, name: string): Promise<string> => {
      const { rows } = await migration.query<{ id: string }>(
        `INSERT INTO ${table} (tenant_id, name) VALUES ($1, $2) RETURNING id`,
        [firm.tenantId, uniqueName(name)],
      );
      return rows[0]!.id;
    };

    mercantilId = await catalogId('matter_type', 'Mercantil');
    fiscalId = await catalogId('matter_type', 'Fiscal');
    civilId = await catalogId('venue', 'Juzgado Civil');
    norteId = await catalogId('venue', 'Sala Norte');

    const makeCase = async (
      label: string,
      matterTypeId: string,
      venueId: string,
    ): Promise<{ id: string; fileNumber: string; clientName: string }> => {
      const clientName = uniqueName(`${shared} ${label}`);
      const { rows: clientRows } = await migration.query<{ id: string }>(
        `INSERT INTO client (tenant_id, kind, legal_name) VALUES ($1, 'organization', $2) RETURNING id`,
        [firm.tenantId, clientName],
      );
      const fileNumber = `EXP-${label}-${nextSuffix()}`;
      const { rows } = await migration.query<{ id: string }>(
        `INSERT INTO case_file (tenant_id, client_id, file_number, case_status_id, matter_type_id, venue_id)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [firm.tenantId, clientRows[0]!.id, fileNumber, firm.statusOpenId, matterTypeId, venueId],
      );
      return { id: rows[0]!.id, fileNumber, clientName };
    };

    torres = await makeCase('TORRES', mercantilId, civilId);
    perez = await makeCase('PEREZ', fiscalId, norteId);
  });

  afterAll(async () => {
    await migration.end();
    await app.close();
  });

  describe('q', () => {
    it('matches a fragment of the file number', async () => {
      const response = await list(`?q=${encodeURIComponent(torres.fileNumber)}`);

      expect(response.status).toBe(200);
      expect(idsFrom(response.body)).toEqual([torres.id]);
    });

    it('matches a fragment of the client legal name', async () => {
      // Both fields, one parameter. The design's one search box asks one question.
      const response = await list(`?q=${encodeURIComponent(perez.clientName)}`);

      expect(response.status).toBe(200);
      expect(idsFrom(response.body)).toEqual([perez.id]);
    });

    it('matches anywhere in the value, not only at the start', async () => {
      // A firm looking for a matter knows a fragment, not a prefix — `006`'s own reasoning
      // for the client list, applied here.
      const response = await list(`?q=${encodeURIComponent('TORRES')}`);

      expect(idsFrom(response.body)).toEqual([torres.id]);
    });

    it('is case-insensitive', async () => {
      const response = await list(`?q=${encodeURIComponent(shared.toLowerCase())}`);

      expect(idsFrom(response.body).sort()).toEqual([torres.id, perez.id].sort());
    });

    it('treats a whitespace-only value as absent, not as a filter matching nothing', async () => {
      // Clearing the search box must restore the register, not empty it.
      const response = await list(`?q=${encodeURIComponent('   ')}`);

      expect(idsFrom(response.body).sort()).toEqual([torres.id, perez.id].sort());
    });

    it('is trimmed before matching', async () => {
      const response = await list(`?q=${encodeURIComponent('  TORRES  ')}`);

      expect(idsFrom(response.body)).toEqual([torres.id]);
    });
  });

  describe('matterTypeId and venueId', () => {
    it('filters by matter type', async () => {
      const response = await list(`?matterTypeId=${fiscalId}`);

      expect(response.status).toBe(200);
      expect(idsFrom(response.body)).toEqual([perez.id]);
    });

    it('filters by venue', async () => {
      const response = await list(`?venueId=${civilId}`);

      expect(response.status).toBe(200);
      expect(idsFrom(response.body)).toEqual([torres.id]);
    });

    it('composes: type AND venue narrows to the intersection', async () => {
      const response = await list(`?matterTypeId=${mercantilId}&venueId=${civilId}`);

      expect(idsFrom(response.body)).toEqual([torres.id]);
    });

    it('composes to nothing when the intersection is empty', async () => {
      // Mercantil belongs to Torres, Sala Norte to Perez. No matter is both.
      const response = await list(`?matterTypeId=${mercantilId}&venueId=${norteId}`);

      expect(response.status).toBe(200);
      expect(idsFrom(response.body)).toEqual([]);
    });

    it('composes with q', async () => {
      const response = await list(`?q=${encodeURIComponent(shared)}&matterTypeId=${fiscalId}`);

      expect(idsFrom(response.body)).toEqual([perez.id]);
    });
  });

  describe('refusals, and what deliberately is not one', () => {
    it('returns an empty page for an unknown catalog id rather than refusing', async () => {
      /*
       * Contract §4. Refusing would let a caller probe which catalog ids exist in their
       * tenant by the difference between `422` and `200` — and a catalog id is not theirs to
       * know unless it is already on a matter they can see.
       */
      const absent = '00000000-0000-4000-8000-0000000000ff';
      const response = await list(`?matterTypeId=${absent}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ items: [], nextCursor: null });
    });

    it('returns an empty page for a catalog id belonging to another firm', async () => {
      // Same answer as an id that does not exist. The two must not be distinguishable.
      const other = await makeCaseFirm(migration, `CC Otro ${nextSuffix()}`, uniqueRfc());
      const response = await list(`?matterTypeId=${other.matterTypeId}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ items: [], nextCursor: null });
    });

    it('refuses a malformed uuid with 400', async () => {
      // A shape error, not a lookup. It discloses nothing.
      const response = await list('?matterTypeId=not-a-uuid');

      expect(response.status).toBe(400);
    });
  });

  describe('paging still means what it says', () => {
    it('a filtered page is a full page while more remain', async () => {
      /*
       * `006`'s own SC-012, applied to a filtered set. The filter is inside the query and
       * before the `LIMIT`, so a page of one is a page of one MATCH — and `nextCursor`
       * refers to the next page of matches, not of all cases.
       */
      const response = await list(`?q=${encodeURIComponent(shared)}&limit=1`);

      expect(response.status).toBe(200);
      expect(response.body.items).toHaveLength(1);
      expect(response.body.nextCursor).not.toBeNull();

      const next = await list(
        `?q=${encodeURIComponent(shared)}&limit=1&cursor=${encodeURIComponent(response.body.nextCursor)}`,
      );

      expect(next.body.items).toHaveLength(1);
      expect(idsFrom(next.body)[0]).not.toBe(idsFrom(response.body)[0]);
    });
  });
});
