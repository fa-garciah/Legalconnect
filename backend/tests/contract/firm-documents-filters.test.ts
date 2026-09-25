/**
 * T009 + T010 — the filters, and the count under every one of them.
 * 023/FR-005 … FR-008, SC-003, SC-005.
 *
 * ONE FILE for both tasks, deliberately: they need the identical fixture — a firm with two
 * matters, two categories and a document whose name contains `%` — and building it twice
 * would be two chances for the two tests to diverge about what they are measuring.
 *
 * SC-003 IS THE ASSERTION THAT MATTERS. For each filter combination, `total` is compared
 * against the number of items actually reached by paging to the end with `limit=1`. That is
 * the only way to catch a count computed under a different predicate from the page — which
 * would be a quantitative leak for a restricted caller (Principle II) and merely a wrong
 * number for an unrestricted one.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createAuthenticatedApp } from '../helpers/real-app';
import { connectAs } from '../helpers/db';
import { uniqueRfc } from '../helpers/rfc';
import { makeCaseFirm, nextSuffix, uniqueName, type Actor, type CaseFirm } from '../helpers/case-core';

let app: INestApplication;
let migration: Client;
let firm: CaseFirm;
let assignedCaseId: string;
let unassignedCaseId: string;
let demandaId: string;
let dictamenId: string;

async function addDocument(
  caseId: string,
  categoryId: string,
  filename: string,
): Promise<void> {
  await migration.query(
    `INSERT INTO document
       (tenant_id, case_id, uploaded_by_membership_id, category_id, storage_key,
        original_filename, mime_type, size_bytes)
     VALUES ($1, $2, $3, $4, $5, $6, 'application/pdf', 1024)`,
    [
      firm.tenantId,
      caseId,
      firm.mp.membershipId,
      categoryId,
      `tenant/${firm.tenantId}/case/${caseId}/${nextSuffix()}`,
      filename,
    ],
  );
}

/** Pages to the end with `limit=1` and returns how many items were actually served. */
async function countByPaging(actor: Actor, query: string): Promise<number> {
  let cursor: string | null = null;
  let seen = 0;
  for (let guard = 0; guard < 100; guard += 1) {
    const url = `/tenant/documents?limit=1${query}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const response: request.Response = await request(app.getHttpServer())
      .get(url)
      .set('x-identity-id', actor.identityId)
      .set('x-tenant-id', firm.tenantId);
    expect(response.status).toBe(200);
    seen += (response.body.items as unknown[]).length;
    cursor = response.body.nextCursor as string | null;
    if (!cursor) return seen;
  }
  throw new Error('countByPaging did not terminate');
}

async function get(actor: Actor, query = ''): Promise<request.Response> {
  return request(app.getHttpServer())
    .get(`/tenant/documents${query}`)
    .set('x-identity-id', actor.identityId)
    .set('x-tenant-id', firm.tenantId);
}

beforeAll(async () => {
  app = await createAuthenticatedApp();
  migration = await connectAs('migration');

  firm = await makeCaseFirm(migration, `CC Filtros ${nextSuffix()}`, uniqueRfc());
  const client = await migration.query<{ id: string }>(
    `INSERT INTO client (tenant_id, kind, legal_name) VALUES ($1, 'organization', $2) RETURNING id`,
    [firm.tenantId, uniqueName('Comercial Filtrada')],
  );

  const demanda = await migration.query<{ id: string }>(
    `INSERT INTO document_category (tenant_id, name) VALUES ($1, $2) RETURNING id`,
    [firm.tenantId, uniqueName('Demanda')],
  );
  const dictamen = await migration.query<{ id: string }>(
    `INSERT INTO document_category (tenant_id, name) VALUES ($1, $2) RETURNING id`,
    [firm.tenantId, uniqueName('Dictamen')],
  );
  demandaId = demanda.rows[0]!.id;
  dictamenId = dictamen.rows[0]!.id;

  const mk = async (fileNumber: string): Promise<string> => {
    const { rows } = await migration.query<{ id: string }>(
      `INSERT INTO case_file (tenant_id, client_id, file_number, case_status_id)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [firm.tenantId, client.rows[0]!.id, fileNumber, firm.statusOpenId],
    );
    return rows[0]!.id;
  };
  assignedCaseId = await mk(`EXP-SI-${nextSuffix()}`);
  unassignedCaseId = await mk(`EXP-NO-${nextSuffix()}`);

  await migration.query(
    `INSERT INTO case_assignment (case_id, membership_id, tenant_id, role_on_case)
     VALUES ($1, $2, $3, 'lead')`,
    [assignedCaseId, firm.aa.membershipId, firm.tenantId],
  );

  // Assigned case: 2 demanda + 1 dictamen. Unassigned: 1 demanda + 2 dictamen.
  await addDocument(assignedCaseId, demandaId, 'Escrito inicial de demanda.pdf');
  await addDocument(assignedCaseId, demandaId, 'Ampliacion de demanda.pdf');
  await addDocument(assignedCaseId, dictamenId, 'Dictamen contable.pdf');
  await addDocument(unassignedCaseId, demandaId, 'Demanda reconvencional.pdf');
  await addDocument(unassignedCaseId, dictamenId, 'Dictamen pericial.pdf');
  // The wildcard fixture: a literal `%` and a literal `_` in one file name.
  await addDocument(unassignedCaseId, dictamenId, 'Convenio 50% con pago_diferido.pdf');
}, 180_000);

afterAll(async () => {
  await migration.end();
  await app.close();
});

describe('the filters (T010)', () => {
  it('filters by category', async () => {
    const response = await get(firm.mp, `?categoryId=${demandaId}`);
    expect(response.status).toBe(200);
    expect(response.body.total).toBe(3);
    for (const item of response.body.items) expect(item.categoryId).toBe(demandaId);
  });

  it('filters by matter', async () => {
    const response = await get(firm.mp, `?caseId=${assignedCaseId}`);
    expect(response.body.total).toBe(3);
    for (const item of response.body.items) expect(item.caseId).toBe(assignedCaseId);
  });

  it('combines category and matter', async () => {
    const response = await get(firm.mp, `?caseId=${assignedCaseId}&categoryId=${demandaId}`);
    expect(response.body.total).toBe(2);
  });

  it('searches the document file name', async () => {
    const response = await get(firm.mp, '?q=pericial');
    expect(response.body.total).toBe(1);
    expect(response.body.items[0].originalFilename).toContain('pericial');
  });

  it('searches the CASE file number too', async () => {
    const response = await get(firm.mp, `?q=${assignedCaseId ? 'EXP-SI' : ''}`);
    expect(response.body.total).toBe(3);
    for (const item of response.body.items) expect(item.caseFileNumber).toContain('EXP-SI');
  });

  it('is case-insensitive', async () => {
    const lower = await get(firm.mp, '?q=dictamen');
    const upper = await get(firm.mp, '?q=DICTAMEN');
    expect(upper.body.total).toBe(lower.body.total);
    expect(lower.body.total).toBeGreaterThan(0);
  });

  it('treats whitespace-only search as absent, restoring the whole list', async () => {
    const blank = await get(firm.mp, '?q=%20%20');
    const none = await get(firm.mp);
    expect(blank.body.total).toBe(none.body.total);
  });

  it('answers an empty list for a well-formed id that matches nothing — never a refusal', async () => {
    // 006's deliberate choice: a refusal here would let a caller enumerate a firm's catalog
    // by the difference between two status codes.
    const response = await get(firm.mp, '?categoryId=00000000-0000-4000-8000-000000000000');
    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(0);
    expect(response.body.total).toBe(0);
  });

  it('refuses a malformed filter id', async () => {
    expect((await get(firm.mp, '?categoryId=not-a-uuid')).status).toBe(400);
    expect((await get(firm.mp, '?caseId=12345')).status).toBe(400);
  });

  describe('wildcards are literal text (FR-008, SC-005)', () => {
    it('finds the one file whose name contains a percent sign', async () => {
      const response = await get(firm.mp, '?q=50%25');
      expect(response.body.total).toBe(1);
      expect(response.body.items[0].originalFilename).toContain('50%');
    });

    it('a bare percent matches nothing, rather than everything', async () => {
      // Unescaped, `%` is the "match all" wildcard and this would return all six.
      const response = await get(firm.mp, '?q=%25%25%25');
      expect(response.body.total).toBe(0);
    });

    it('an underscore matches an underscore, not any character', async () => {
      const real = await get(firm.mp, '?q=pago_diferido');
      expect(real.body.total).toBe(1);
      const wildcarded = await get(firm.mp, '?q=pago_diferid_');
      // With `_` unescaped this would also match "pago_diferido"; escaped, it matches nothing.
      expect(wildcarded.body.total).toBe(0);
    });
  });
});

describe('the count describes the filtered set, for every caller (T009, SC-003)', () => {
  /**
   * The query is built INSIDE each test, from a thunk. Building the list eagerly at
   * `describe` time reads the fixture ids before `beforeAll` has assigned them, so every
   * combination becomes `categoryId=undefined` and answers 400 — which is how the first
   * version of this suite "failed" against a working endpoint.
   */
  const combinations: readonly { readonly label: string; readonly query: () => string }[] = [
    { label: 'no filter', query: () => '' },
    { label: 'category', query: () => `&categoryId=${demandaId}` },
    { label: 'matter', query: () => `&caseId=${assignedCaseId}` },
    { label: 'search', query: () => '&q=dictamen' },
    { label: 'search + category', query: () => `&q=demanda&categoryId=${demandaId}` },
    { label: 'matter + category', query: () => `&caseId=${unassignedCaseId}&categoryId=${dictamenId}` },
  ];

  for (const actorName of ['mp', 'aa'] as const) {
    describe(`as ${actorName.toUpperCase()}`, () => {
      for (const { label, query } of combinations) {
        it(`total equals what paging serves — ${label}`, async () => {
          const actor = firm[actorName];
          const filter = query();
          const stated = await get(actor, `?limit=50${filter}`);
          expect(stated.status).toBe(200);
          const paged = await countByPaging(actor, filter);
          expect(stated.body.total).toBe(paged);
        });
      }
    });
  }

  it('an AA\'s total is strictly smaller than an MP\'s — the count obeys scope (SC-002)', async () => {
    const mp = await get(firm.mp);
    const aa = await get(firm.aa);
    expect(mp.body.total).toBe(6);
    expect(aa.body.total).toBe(3);
    expect(aa.body.total).toBeLessThan(mp.body.total);
  });

  it('an AA\'s search never counts a document on a matter they cannot reach', async () => {
    // "dictamen" matches one document on the assigned case and two on the unassigned one.
    const response = await get(firm.aa, '?q=dictamen');
    expect(response.body.total).toBe(1);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].caseId).toBe(assignedCaseId);
  });

  it('an AA filtering by a matter they cannot reach gets zero, not its documents', async () => {
    const response = await get(firm.aa, `?caseId=${unassignedCaseId}`);
    expect(response.status).toBe(200);
    expect(response.body.total).toBe(0);
    expect(response.body.items).toHaveLength(0);
  });
});
