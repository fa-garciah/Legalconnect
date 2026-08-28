/**
 * T026 — the three case catalogs' storage seam. 006/FR-019 to FR-021.
 *
 * One repository for `case_status`, `matter_type` and `venue`, parameterised by the
 * catalog rather than tripled. They are structurally identical — name, active/retired
 * status, per-tenant active-name uniqueness — and the spec gives them ONE capability pair
 * (rows 34-35), not three. Three near-identical repositories would be three places for the
 * retire-while-referenced rule to drift apart.
 *
 * As in 017's `position.repository.ts`, there is no hand-written `tenant_id = ...` filter
 * anywhere below. The `*_own_tenant` policies (`backend/drizzle/0024`) scope every
 * statement, and `tenant_id` on insert comes from the setting the interceptor established
 * rather than from the request — so a row cannot be written into a tenant the caller did
 * not activate, and the policy's `WITH CHECK` would refuse it even if it could.
 *
 * There is no `delete` method and no DELETE grant behind one: FR-019's "never
 * hard-deleted" is the absent privilege, not the absent function.
 */
import { Injectable } from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';
import { currentTx } from '../../../common/tenant/middleware';

/**
 * The three catalogs, keyed by their URL segment. The relation name is NOT taken from the
 * request — it is looked up here, so no caller-supplied string ever reaches SQL.
 */
export const CATALOGS = {
  'case-statuses': 'case_status',
  'matter-types': 'matter_type',
  venues: 'venue',
} as const;

export type CatalogSegment = keyof typeof CATALOGS;
export type CatalogTable = (typeof CATALOGS)[CatalogSegment];

export function isCatalogSegment(raw: string): raw is CatalogSegment {
  return Object.prototype.hasOwnProperty.call(CATALOGS, raw);
}

/** Only `case_status` carries `is_closing` (FR-008a). */
export const supportsIsClosing = (segment: CatalogSegment): boolean => segment === 'case-statuses';

export interface CatalogEntryRow {
  readonly id: string;
  readonly name: string;
  readonly status: 'active' | 'retired';
  /** Present only for `case-statuses`; `undefined` on the other two. */
  readonly isClosing?: boolean;
  readonly createdAt: string;
  readonly retiredAt: string | null;
}

interface Raw {
  id: string;
  name: string;
  status: 'active' | 'retired';
  is_closing?: boolean;
  created_at: string;
  retired_at: string | null;
  [key: string]: unknown;
}

const present = (row: Raw, segment: CatalogSegment): CatalogEntryRow => ({
  id: row.id,
  name: row.name,
  status: row.status,
  ...(supportsIsClosing(segment) ? { isClosing: row.is_closing === true } : {}),
  createdAt: row.created_at,
  retiredAt: row.retired_at,
});

/**
 * The relation, as a SQL identifier drawn from the constant map above — never
 * interpolated from a caller's string. `sql.raw` is safe here for exactly that reason and
 * for no other, so the lookup and the raw call sit adjacent where a reviewer sees both.
 */
const relation = (segment: CatalogSegment): SQL => sql.raw(CATALOGS[segment]);

const columns = (segment: CatalogSegment): SQL =>
  supportsIsClosing(segment)
    ? sql`id, name, status, is_closing, created_at::text AS created_at, retired_at::text AS retired_at`
    : sql`id, name, status, created_at::text AS created_at, retired_at::text AS retired_at`;

@Injectable()
export class CaseCatalogRepository {
  /**
   * FR-020 — retired entries are included and labelled, so a case still holding one can
   * be rendered. A caller building a picker for a NEW case filters to active itself; the
   * read does not do it for them, because the same list serves both purposes and hiding
   * retired entries here would make an existing case's status unresolvable.
   */
  async list(segment: CatalogSegment): Promise<readonly CatalogEntryRow[]> {
    const { rows } = await currentTx().execute<Raw>(sql`
      SELECT ${columns(segment)}
        FROM ${relation(segment)}
       ORDER BY status, lower(trim(name))
    `);
    return rows.map((row) => present(row, segment));
  }

  /** The collision set — ACTIVE entries only, which is what makes retire-then-recreate legal. */
  async listActive(segment: CatalogSegment): Promise<readonly CatalogEntryRow[]> {
    const { rows } = await currentTx().execute<Raw>(sql`
      SELECT ${columns(segment)} FROM ${relation(segment)} WHERE status = 'active'
    `);
    return rows.map((row) => present(row, segment));
  }

  async findById(segment: CatalogSegment, id: string): Promise<CatalogEntryRow | null> {
    const { rows } = await currentTx().execute<Raw>(sql`
      SELECT ${columns(segment)} FROM ${relation(segment)} WHERE id = ${id}::uuid
    `);
    const row = rows[0];
    return row ? present(row, segment) : null;
  }

  async insert(
    segment: CatalogSegment,
    name: string,
    isClosing: boolean,
  ): Promise<CatalogEntryRow> {
    const { rows } = supportsIsClosing(segment)
      ? await currentTx().execute<Raw>(sql`
          INSERT INTO ${relation(segment)} (tenant_id, name, is_closing)
          VALUES (NULLIF(current_setting('app.tenant_id', true), '')::uuid, ${name}, ${isClosing})
          RETURNING ${columns(segment)}
        `)
      : await currentTx().execute<Raw>(sql`
          INSERT INTO ${relation(segment)} (tenant_id, name)
          VALUES (NULLIF(current_setting('app.tenant_id', true), '')::uuid, ${name})
          RETURNING ${columns(segment)}
        `);
    const row = rows[0];
    if (!row) throw new Error(`the ${CATALOGS[segment]} insert returned no row`);
    return present(row, segment);
  }

  /**
   * FR-008a. The only field editable on any catalog entry, and only on `case_status`.
   * Names are not editable — 017 established retire-and-recreate for `position`, and
   * nothing here justifies diverging. `is_closing` is different in kind: a declaration
   * ABOUT meaning rather than the meaning itself, and a firm that mislabels it needs a
   * correction rather than a new row that would orphan every case pointing at the old one.
   */
  async setIsClosing(id: string, isClosing: boolean): Promise<CatalogEntryRow | null> {
    const { rows } = await currentTx().execute<Raw>(sql`
      UPDATE case_status SET is_closing = ${isClosing}
       WHERE id = ${id}::uuid
      RETURNING ${columns('case-statuses')}
    `);
    const row = rows[0];
    return row ? present(row, 'case-statuses') : null;
  }

  /**
   * Retirement is a status change, never a delete (FR-019). The `status = 'active'`
   * predicate makes this idempotent-safe at the data layer too: a concurrent second
   * retirement updates nothing and returns no row, which the service reads as the same
   * refusal its own pre-check would have raised. 017's `PositionRepository.retire`
   * verbatim, for the same reason.
   */
  async retire(segment: CatalogSegment, id: string): Promise<CatalogEntryRow | null> {
    const { rows } = await currentTx().execute<Raw>(sql`
      UPDATE ${relation(segment)}
         SET status = 'retired', retired_at = now()
       WHERE id = ${id}::uuid AND status = 'active'
      RETURNING ${columns(segment)}
    `);
    const row = rows[0];
    return row ? present(row, segment) : null;
  }

  /**
   * Used by `CaseService` to validate the trio a case names (FR-005), and by the closure
   * rule to read the target status's `is_closing` (FR-008a).
   *
   * Returns `null` for retired, foreign and absent alike — the caller maps all three to
   * one refusal, deliberately, so none can be told from another.
   */
  async findActiveById(segment: CatalogSegment, id: string): Promise<CatalogEntryRow | null> {
    const { rows } = await currentTx().execute<Raw>(sql`
      SELECT ${columns(segment)} FROM ${relation(segment)}
       WHERE id = ${id}::uuid AND status = 'active'
    `);
    const row = rows[0];
    return row ? present(row, segment) : null;
  }
}
