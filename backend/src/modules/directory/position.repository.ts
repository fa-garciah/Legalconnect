/**
 * T021 — the position catalog: create, retire, list. RLS scopes every one of these
 * to the caller's own tenant by construction (`position_own_tenant`, 0020) — no
 * hand-written tenant filter, the same discipline `membership.service.ts` uses.
 */
import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { currentTx } from '../../common/tenant/middleware';

export interface PositionRow {
  readonly id: string;
  readonly name: string;
  readonly status: 'active' | 'retired';
  readonly createdAt: string;
  readonly retiredAt: string | null;
}

interface RawPositionRow {
  id: string;
  name: string;
  status: 'active' | 'retired';
  created_at: string;
  retired_at: string | null;
  [key: string]: unknown;
}

const present = (row: RawPositionRow): PositionRow => ({
  id: row.id,
  name: row.name,
  status: row.status,
  createdAt: row.created_at,
  retiredAt: row.retired_at,
});

@Injectable()
export class PositionRepository {
  /** research.md D6 — the names the collision predicate checks against. */
  async activeNames(): Promise<readonly string[]> {
    const { rows } = await currentTx().execute<{ name: string }>(sql`
      SELECT name FROM position WHERE status = 'active'
    `);
    return rows.map((r) => r.name);
  }

  async create(tenantId: string, name: string): Promise<PositionRow> {
    const { rows } = await currentTx().execute<RawPositionRow>(sql`
      INSERT INTO position (tenant_id, name)
      VALUES (${tenantId}::uuid, ${name})
      RETURNING id, name, status, created_at, retired_at
    `);
    const row = rows[0];
    if (!row) throw new Error('position insert returned no row');
    return present(row);
  }

  /** A foreign or absent id resolves to `null` — RLS-scoped. */
  async findById(id: string): Promise<PositionRow | null> {
    const { rows } = await currentTx().execute<RawPositionRow>(sql`
      SELECT id, name, status, created_at, retired_at FROM position WHERE id = ${id}::uuid
    `);
    const row = rows[0];
    return row ? present(row) : null;
  }

  async retire(id: string): Promise<PositionRow> {
    const { rows } = await currentTx().execute<RawPositionRow>(sql`
      UPDATE position
         SET status = 'retired', retired_at = now()
       WHERE id = ${id}::uuid AND status = 'active'
       RETURNING id, name, status, created_at, retired_at
    `);
    const row = rows[0];
    if (!row) throw new Error('position retire returned no row');
    return present(row);
  }

  /** Includes retired entries (labelled) — contracts/directory-api.md. */
  async list(): Promise<readonly PositionRow[]> {
    const { rows } = await currentTx().execute<RawPositionRow>(sql`
      SELECT id, name, status, created_at, retired_at FROM position ORDER BY created_at
    `);
    return rows.map(present);
  }
}
