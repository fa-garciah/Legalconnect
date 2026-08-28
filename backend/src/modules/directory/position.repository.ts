/**
 * T021 — the position catalog's storage seam. 017/FR-006..FR-008.
 *
 * As in `directory-entry.repository.ts`, there is no hand-written
 * `tenant_id = ...` filter anywhere below. `position_own_tenant`
 * (`backend/drizzle/0020`) is what scopes every statement here, and
 * `tenant_id` on insert comes from the setting the interceptor established, not
 * from the request — so a row cannot be written into a tenant the caller did not
 * activate, and the policy's `WITH CHECK` would refuse it even if it could.
 *
 * There is no `delete` method, and no DELETE grant behind one: FR-007's "never
 * hard-deleted" is the absent privilege, not the absent function.
 */
import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { currentTx } from '../../common/tenant/middleware';
import type { CatalogPosition } from './directory-entry.repository';

export interface PositionRow extends CatalogPosition {
  readonly createdAt: string;
  readonly retiredAt: string | null;
}

interface Raw {
  id: string;
  name: string;
  status: 'active' | 'retired';
  created_at: string;
  retired_at: string | null;
  [key: string]: unknown;
}

const present = (row: Raw): PositionRow => ({
  id: row.id,
  name: row.name,
  status: row.status,
  createdAt: row.created_at,
  retiredAt: row.retired_at,
});

@Injectable()
export class PositionRepository {
  /**
   * FR-008 — retired entries included and labelled, so an existing assignment can
   * still be rendered. Three fields only, per contracts/directory-api.md §1: when
   * a position was created and when it was retired are audit questions, answered by
   * the audit log rather than by every render of a dropdown.
   */
  async list(): Promise<readonly CatalogPosition[]> {
    const { rows } = await currentTx().execute<Raw>(sql`
      SELECT id, name, status
        FROM position
       ORDER BY status, lower(trim(name))
    `);
    return rows.map((row) => ({ id: row.id, name: row.name, status: row.status }));
  }

  /** research.md D6's collision set — the ACTIVE entries only. */
  async listActive(): Promise<readonly CatalogPosition[]> {
    const { rows } = await currentTx().execute<Raw>(sql`
      SELECT id, name, status FROM position WHERE status = 'active'
    `);
    return rows.map((row) => ({ id: row.id, name: row.name, status: row.status }));
  }

  async findById(id: string): Promise<PositionRow | null> {
    const { rows } = await currentTx().execute<Raw>(sql`
      SELECT id, name, status, created_at::text AS created_at, retired_at::text AS retired_at
        FROM position WHERE id = ${id}::uuid
    `);
    const row = rows[0];
    return row ? present(row) : null;
  }

  async insert(name: string): Promise<PositionRow> {
    const { rows } = await currentTx().execute<Raw>(sql`
      INSERT INTO position (tenant_id, name)
      VALUES (NULLIF(current_setting('app.tenant_id', true), '')::uuid, ${name})
      RETURNING id, name, status, created_at::text AS created_at, retired_at::text AS retired_at
    `);
    const row = rows[0];
    if (!row) throw new Error('the position insert returned no row');
    return present(row);
  }

  /**
   * Retirement is a status change, never a delete (FR-007). The `status = 'active'`
   * predicate makes this idempotent-safe at the data layer too: a concurrent second
   * retirement updates nothing and returns no row, which the service reads as the
   * same refusal its own pre-check would have raised.
   */
  async retire(id: string): Promise<PositionRow | null> {
    const { rows } = await currentTx().execute<Raw>(sql`
      UPDATE position
         SET status = 'retired', retired_at = now()
       WHERE id = ${id}::uuid AND status = 'active'
      RETURNING id, name, status, created_at::text AS created_at, retired_at::text AS retired_at
    `);
    const row = rows[0];
    return row ? present(row) : null;
  }
}
