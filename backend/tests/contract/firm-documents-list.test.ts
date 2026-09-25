/**
 * T006, T009a, T009b — contract for `GET /tenant/documents`. 023/FR-001 … FR-005, FR-016.
 *
 * WHAT MAKES THIS TESTABLE WITHOUT MINIO, which matters on a machine where the image cannot
 * be pulled: the firm-wide list never touches the object store. It reads metadata. So the
 * fixtures here insert `document` rows directly on the migration connection — the standing
 * `drizzle/seed.ts` already has for fixture setup — rather than uploading through the API.
 * Preview and download, which DO reach the store, are `021`'s and are not re-tested here.
 *
 * THE ASSERTION THAT MATTERS MOST is not "the right rows come back" but the one about the
 * COUNT: a `total` computed without the assignment predicate would tell an `AA` how many
 * documents exist on matters they cannot reach. That is a quantitative leak under Principle
 * II, and it is the failure this endpoint is most likely to ship with, because the count is a
 * second query that has to be kept in step with the first.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createAuthenticatedApp } from '../helpers/real-app';
import { connectAs } from '../helpers/db';
import { uniqueRfc } from '../helpers/rfc';
import { makeCaseFirm, nextSuffix, uniqueName, type Actor, type CaseFirm } from '../helpers/case-core';

interface Fixture {
  readonly firm: CaseFirm;
  /** The AA holds a live `lead` assignment on this one. */
  readonly assignedCaseId: string;
  readonly assignedFileNumber: string;
  /** Nobody but MP/SA can reach this one. */
  readonly unassignedCaseId: string;
  readonly unassignedFileNumber: string;
  readonly categoryId: string;
  readonly otherCategoryId: string;
  readonly clientName: string;
}

async function makeCase(
  migration: Client,
  firm: CaseFirm,
  clientId: string,
  fileNumber: string,
): Promise<string> {
  const { rows } = await migration.query<{ id: string }>(
    `INSERT INTO case_file (tenant_id, client_id, file_number, case_status_id)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [firm.tenantId, clientId, fileNumber, firm.statusOpenId],
  );
  return rows[0]!.id;
}

async function addDocument(
  migration: Client,
  firm: CaseFirm,
  caseId: string,
  uploader: Actor,
  categoryId: string,
  filename: string,
  status: 'active' | 'withdrawn' = 'active',
): Promise<string> {
  const { rows } = await migration.query<{ id: string }>(
    `INSERT INTO document
       (tenant_id, case_id, uploaded_by_membership_id, category_id, storage_key,
        original_filename, mime_type, size_bytes, status, withdrawn_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'application/pdf', 2048, $7::document_status,
             CASE WHEN $7 = 'withdrawn' THEN now() ELSE NULL END)
     RETURNING id`,
    [
      firm.tenantId,
      caseId,
      uploader.membershipId,
      categoryId,
      `tenant/${firm.tenantId}/case/${caseId}/${nextSuffix()}`,
      filename,
      status,
    ],
  );
  return rows[0]!.id;
}

describe('GET /tenant/documents (T006)', () => {
  let app: INestApplication;
  let migration: Client;
  let fx: Fixture;

  beforeAll(async () => {
    app = await createAuthenticatedApp();
    migration = await connectAs('migration');

    const firm = await makeCaseFirm(migration, `CC Documentos ${nextSuffix()}`, uniqueRfc());
    const clientName = uniqueName('Grupo Documental');
    const client = await migration.query<{ id: string }>(
      `INSERT INTO client (tenant_id, kind, legal_name) VALUES ($1, 'organization', $2) RETURNING id`,
      [firm.tenantId, clientName],
    );
    const clientId = client.rows[0]!.id;

    const category = await migration.query<{ id: string }>(
      `INSERT INTO document_category (tenant_id, name) VALUES ($1, $2) RETURNING id`,
      [firm.tenantId, uniqueName('Demanda')],
    );
    const otherCategory = await migration.query<{ id: string }>(
      `INSERT INTO document_category (tenant_id, name) VALUES ($1, $2) RETURNING id`,
      [firm.tenantId, uniqueName('Dictamen')],
    );

    const assignedFileNumber = uniqueName('EXP-ASIG').replace(/\s/g, '-');
    const unassignedFileNumber = uniqueName('EXP-AJENO').replace(/\s/g, '-');
    const assignedCaseId = await makeCase(migration, firm, clientId, assignedFileNumber);
    const unassignedCaseId = await makeCase(migration, firm, clientId, unassignedFileNumber);

    await migration.query(
      `INSERT INTO case_assignment (case_id, membership_id, tenant_id, role_on_case)
       VALUES ($1, $2, $3, 'lead')`,
      [assignedCaseId, firm.aa.membershipId, firm.tenantId],
    );

    // Two active on the assigned case, three active on the unassigned one, plus a withdrawn
    // document on the assigned case that must never appear in either list.
    await addDocument(migration, firm, assignedCaseId, firm.mp, category.rows[0]!.id, 'Escrito inicial.pdf');
    await addDocument(migration, firm, assignedCaseId, firm.mp, otherCategory.rows[0]!.id, 'Dictamen pericial.pdf');
    await addDocument(migration, firm, assignedCaseId, firm.mp, category.rows[0]!.id, 'Retirado.pdf', 'withdrawn');
    await addDocument(migration, firm, unassignedCaseId, firm.mp, category.rows[0]!.id, 'Contestacion ajena.pdf');
    await addDocument(migration, firm, unassignedCaseId, firm.mp, category.rows[0]!.id, 'Anexo ajeno.pdf');
    await addDocument(migration, firm, unassignedCaseId, firm.mp, otherCategory.rows[0]!.id, 'Convenio 50% anticipo.pdf');

    fx = {
      firm,
      assignedCaseId,
      assignedFileNumber,
      unassignedCaseId,
      unassignedFileNumber,
      categoryId: category.rows[0]!.id,
      otherCategoryId: otherCategory.rows[0]!.id,
      clientName,
    };
  }, 180_000);

  afterAll(async () => {
    await migration.end();
    await app.close();
  });

  const asActor = (actor: Actor, query = ''): request.Test =>
    request(app.getHttpServer())
      .get(`/tenant/documents${query}`)
      .set('x-identity-id', actor.identityId)
      .set('x-tenant-id', fx.firm.tenantId);

  describe('the envelope', () => {
    it('returns items, nextCursor and total', async () => {
      const response = await asActor(fx.firm.mp);
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.items)).toBe(true);
      expect(response.body).toHaveProperty('nextCursor');
      expect(typeof response.body.total).toBe('number');
    });

    it('carries the fields a firm-wide card needs, including its matter', async () => {
      const response = await asActor(fx.firm.mp);
      const item = response.body.items[0];
      for (const field of [
        'id',
        'caseId',
        'caseFileNumber',
        'categoryId',
        'categoryName',
        'originalFilename',
        'mimeType',
        'sizeBytes',
        'uploadedAt',
        'status',
      ]) {
        expect(item, `missing ${field}`).toHaveProperty(field);
      }
    });

    /**
     * T009a — FR-002, Principle VI minimisation. The join to `case_file` is there anyway and
     * reaching `client.legal_name` from it costs one more line, which is exactly why this is
     * asserted: without it, a later "while we're here" addition passes every other test.
     */
    it('does NOT carry the client\'s name', async () => {
      const response = await asActor(fx.firm.mp);
      expect(JSON.stringify(response.body)).not.toContain(fx.clientName);
      for (const item of response.body.items) {
        expect(item).not.toHaveProperty('clientName');
        expect(item).not.toHaveProperty('clientLegalName');
        expect(item).not.toHaveProperty('client');
      }
    });

    it('orders newest first', async () => {
      const response = await asActor(fx.firm.mp);
      const times = response.body.items.map((i: { uploadedAt: string }) => i.uploadedAt);
      expect([...times].sort().reverse()).toEqual(times);
    });

    it('never lists a withdrawn document', async () => {
      const response = await asActor(fx.firm.mp);
      const names = response.body.items.map((i: { originalFilename: string }) => i.originalFilename);
      expect(names).not.toContain('Retirado.pdf');
    });
  });

  describe('scope is applied in the query, not by a refusal (FR-004)', () => {
    it('an MP sees every active document of the firm', async () => {
      const response = await asActor(fx.firm.mp);
      expect(response.body.total).toBe(5);
    });

    it('an SA sees the same', async () => {
      const response = await asActor(fx.firm.sa);
      expect(response.body.total).toBe(5);
    });

    it('an AA sees only documents of matters they are assigned to', async () => {
      const response = await asActor(fx.firm.aa);
      expect(response.status).toBe(200);
      expect(response.body.total).toBe(2);
      const caseIds = new Set(response.body.items.map((i: { caseId: string }) => i.caseId));
      expect([...caseIds]).toEqual([fx.assignedCaseId]);
    });

    it('a PL with no assignment gets an EMPTY LIST, not a refusal', async () => {
      // The whole reason this capability is `tenant`-scoped. An `assigned` scope could only
      // have refused here, and 016a would render its error state where its empty state belongs
      // — the point `case-list-scoping.test.ts` was written to protect.
      const response = await asActor(fx.firm.pl);
      expect(response.status).toBe(200);
      expect(response.body.items).toHaveLength(0);
      expect(response.body.total).toBe(0);
    });

    it('a CM with no assignment likewise', async () => {
      const response = await asActor(fx.firm.cm);
      expect(response.status).toBe(200);
      expect(response.body.total).toBe(0);
    });

    it('a BM is refused outright — it holds no document capability', async () => {
      const response = await asActor(fx.firm.bm);
      expect(response.status).toBe(403);
      expect(response.body.items).toBeUndefined();
    });
  });

  describe('paging', () => {
    it('honours limit and returns a cursor', async () => {
      const first = await asActor(fx.firm.mp, '?limit=2');
      expect(first.body.items).toHaveLength(2);
      expect(first.body.nextCursor).toBeTruthy();
      expect(first.body.total).toBe(5);

      const second = await asActor(
        fx.firm.mp,
        `?limit=2&cursor=${encodeURIComponent(first.body.nextCursor as string)}`,
      );
      expect(second.body.items).toHaveLength(2);
      // The total describes the whole filtered set, not the page.
      expect(second.body.total).toBe(5);
      const firstIds = first.body.items.map((i: { id: string }) => i.id);
      const secondIds = second.body.items.map((i: { id: string }) => i.id);
      expect(firstIds.some((id: string) => secondIds.includes(id))).toBe(false);
    });

    it('refuses a limit above the maximum', async () => {
      const response = await asActor(fx.firm.mp, '?limit=500');
      expect(response.status).toBe(400);
    });

    it('refuses a malformed cursor', async () => {
      const response = await asActor(fx.firm.mp, '?cursor=not-a-cursor');
      expect(response.status).toBe(400);
    });
  });

  /**
   * T009b — FR-016 and Decision 6. The list serves no document content, so it is not an
   * access and writes nothing. Asserted rather than asserted-in-prose, because Decision 6 is
   * the kind of choice a later reader "corrects" out of a sense of duty to Principle V.
   */
  describe('the list is not audited (FR-016)', () => {
    async function auditCount(): Promise<number> {
      const { rows } = await migration.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM audit_event WHERE tenant_id = $1`,
        [fx.firm.tenantId],
      );
      return Number(rows[0]!.n);
    }

    it('writes no audit entry for a plain list', async () => {
      const before = await auditCount();
      await asActor(fx.firm.mp);
      expect(await auditCount()).toBe(before);
    });

    it('writes no audit entry for a search, however many times it is typed', async () => {
      const before = await auditCount();
      for (const term of ['dic', 'dict', 'dicta', 'dictamen']) {
        await asActor(fx.firm.mp, `?q=${term}`);
      }
      expect(await auditCount()).toBe(before);
    });

    it('adds no new action to the audit vocabulary', async () => {
      // FR-017: no migration. `audit_event_action_known` is a CHECK constraint re-issued whole
      // by each slice that extends it, so a new action would need one.
      const { rows } = await migration.query<{ definition: string }>(
        `SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
          WHERE conname = 'audit_event_action_known'`,
      );
      expect(rows[0]?.definition ?? '').not.toContain('document.listed');
      expect(rows[0]?.definition ?? '').not.toContain('document.searched');
    });
  });
});
