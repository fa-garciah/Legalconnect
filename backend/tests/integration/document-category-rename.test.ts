/**
 * 021 T010 (Decision 5). The firm's default document category is "Sin clasificar", not the
 * English "Unclassified" every firm has been shown since 007.
 *
 * Migration 0045 is executed here inside a transaction that is rolled back, against firms this
 * suite creates, so its two branches are both exercised whatever the migrated database already
 * looks like:
 *   - a firm with only "Unclassified" gets it renamed;
 *   - a firm that already created its own active "Sin clasificar" keeps both rows (renaming would
 *     break the active-name unique index), and the default lookup picks the Spanish one.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import { createAuthenticatedApp } from '../helpers/real-app';
import { connectAs } from '../helpers/db';
import { uniqueRfc } from '../helpers/rfc';
import { makeCaseFirm, nextSuffix, uniqueName, type CaseFirm } from '../helpers/case-core';
import { DEFAULT_DOCUMENT_CATEGORIES } from '../../src/modules/documents/categories/document-category.seed';

const MIGRATION = readFileSync(join(__dirname, '../../drizzle/0045_document_category_sin_clasificar.sql'), 'utf8');

describe('"Sin clasificar" (021 Decision 5)', () => {
  let migration: Client;
  let app: INestApplication;
  let onlyEnglish: CaseFirm;
  let both: CaseFirm;

  const names = async (tenantId: string) =>
    (
      await migration.query<{ name: string }>(
        `SELECT name FROM document_category WHERE tenant_id = $1 AND status = 'active' ORDER BY name`,
        [tenantId],
      )
    ).rows.map((r) => r.name);

  beforeAll(async () => {
    migration = await connectAs('migration');
    app = await createAuthenticatedApp();
    onlyEnglish = await makeCaseFirm(migration, `CC Ingles ${nextSuffix()}`, uniqueRfc());
    both = await makeCaseFirm(migration, `CC Ambas ${nextSuffix()}`, uniqueRfc());
    await migration.query(`INSERT INTO document_category (tenant_id, name) VALUES ($1, 'Unclassified')`, [
      onlyEnglish.tenantId,
    ]);
    await migration.query(
      `INSERT INTO document_category (tenant_id, name) VALUES ($1, 'Unclassified'), ($1, 'Sin clasificar')`,
      [both.tenantId],
    );
  });

  afterAll(async () => {
    await migration?.end();
    await app?.close();
  });

  it('renames a firm’s only "Unclassified" to "Sin clasificar"', async () => {
    await migration.query('BEGIN');
    try {
      await migration.query(MIGRATION);
      expect(await names(onlyEnglish.tenantId)).toEqual(['Sin clasificar']);
    } finally {
      await migration.query('ROLLBACK');
    }
  });

  it('leaves both rows where the firm already had "Sin clasificar", and is idempotent', async () => {
    await migration.query('BEGIN');
    try {
      await migration.query(MIGRATION);
      await migration.query(MIGRATION);
      expect(await names(both.tenantId)).toEqual(['Sin clasificar', 'Unclassified']);
    } finally {
      await migration.query('ROLLBACK');
    }
  });

  it('a new firm is seeded with "Sin clasificar" and no English name', () => {
    expect(DEFAULT_DOCUMENT_CATEGORIES).toContain('Sin clasificar');
    expect(DEFAULT_DOCUMENT_CATEGORIES).not.toContain('Unclassified');
  });

  it('an upload naming no category lands in "Sin clasificar" when both exist', async () => {
    const client = await migration.query<{ id: string }>(
      `INSERT INTO client (tenant_id, kind, legal_name) VALUES ($1, 'organization', $2) RETURNING id`,
      [both.tenantId, uniqueName('Cliente Ambas')],
    );
    const opened = await request(app.getHttpServer())
      .post('/tenant/cases')
      .set('x-identity-id', both.mp.identityId)
      .set('x-tenant-id', both.tenantId)
      .send({ clientId: client.rows[0]!.id, fileNumber: uniqueName('EXP-SC'), caseStatusId: both.statusOpenId });
    const uploaded = await request(app.getHttpServer())
      .post(`/tenant/cases/${opened.body.id}/documents`)
      .set('x-identity-id', both.mp.identityId)
      .set('x-tenant-id', both.tenantId)
      .attach('file', Buffer.from('x'), { filename: 'a.pdf', contentType: 'application/pdf' });
    expect(uploaded.status).toBe(201);
    expect(uploaded.body.categoryName).toBe('Sin clasificar');
  });

  it('a firm with only "Unclassified" still gets a default (before it is migrated)', async () => {
    const client = await migration.query<{ id: string }>(
      `INSERT INTO client (tenant_id, kind, legal_name) VALUES ($1, 'organization', $2) RETURNING id`,
      [onlyEnglish.tenantId, uniqueName('Cliente Ingles')],
    );
    const opened = await request(app.getHttpServer())
      .post('/tenant/cases')
      .set('x-identity-id', onlyEnglish.mp.identityId)
      .set('x-tenant-id', onlyEnglish.tenantId)
      .send({ clientId: client.rows[0]!.id, fileNumber: uniqueName('EXP-EN'), caseStatusId: onlyEnglish.statusOpenId });
    const uploaded = await request(app.getHttpServer())
      .post(`/tenant/cases/${opened.body.id}/documents`)
      .set('x-identity-id', onlyEnglish.mp.identityId)
      .set('x-tenant-id', onlyEnglish.tenantId)
      .attach('file', Buffer.from('x'), { filename: 'b.pdf', contentType: 'application/pdf' });
    expect(uploaded.status).toBe(201);
  });
});
