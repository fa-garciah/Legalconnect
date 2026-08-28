/**
 * T034 — the document-category catalog: create, retire, list. RLS scopes every one
 * of these to the caller's own tenant by construction (`document_category_own_tenant`,
 * 0026) — no hand-written tenant filter, 006/017's own discipline.
 */
import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { currentTx } from '../../../common/tenant/middleware';

export interface DocumentCategoryRow {
  readonly id: string;
  readonly name: string;
  readonly status: 'active' | 'retired';
  readonly createdAt: string;
  readonly retiredAt: string | null;
}

interface RawRow {
  id: string;
  name: string;
  status: 'active' | 'retired';
  created_at: string;
  retired_at: string | null;
  [key: string]: unknown;
}

const present = (row: RawRow): DocumentCategoryRow => ({
  id: row.id,
  name: row.name,
  status: row.status,
  createdAt: row.created_at,
  retiredAt: row.retired_at,
});

@Injectable()
export class DocumentCategoryRepository {
  /** research.md D1 — the names the collision predicate checks against. */
  async activeNames(): Promise<readonly string[]> {
    const { rows } = await currentTx().execute<{ name: string }>(sql`
      SELECT name FROM document_category WHERE status = 'active'
    `);
    return rows.map((r) => r.name);
  }

  async create(tenantId: string, name: string): Promise<DocumentCategoryRow> {
    const { rows } = await currentTx().execute<RawRow>(sql`
      INSERT INTO document_category (tenant_id, name)
      VALUES (${tenantId}::uuid, ${name})
      RETURNING id, name, status, created_at, retired_at
    `);
    const row = rows[0];
    if (!row) throw new Error('document_category insert returned no row');
    return present(row);
  }

  /** A foreign or absent id resolves to `null` — RLS-scoped. */
  async findById(id: string): Promise<DocumentCategoryRow | null> {
    const { rows } = await currentTx().execute<RawRow>(sql`
      SELECT id, name, status, created_at, retired_at FROM document_category WHERE id = ${id}::uuid
    `);
    const row = rows[0];
    return row ? present(row) : null;
  }

  async retire(id: string): Promise<DocumentCategoryRow> {
    const { rows } = await currentTx().execute<RawRow>(sql`
      UPDATE document_category
         SET status = 'retired', retired_at = now()
       WHERE id = ${id}::uuid AND status = 'active'
       RETURNING id, name, status, created_at, retired_at
    `);
    const row = rows[0];
    if (!row) throw new Error('document_category retire returned no row');
    return present(row);
  }

  /** Includes retired entries (labelled) — contracts/document-api.md §8. */
  async list(): Promise<readonly DocumentCategoryRow[]> {
    const { rows } = await currentTx().execute<RawRow>(sql`
      SELECT id, name, status, created_at, retired_at FROM document_category ORDER BY created_at
    `);
    return rows.map(present);
  }
}
