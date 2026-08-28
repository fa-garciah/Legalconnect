/**
 * T034 — the client register's storage seam. 006/FR-001 to FR-004a, FR-002a.
 *
 * As everywhere in this codebase, there is no hand-written `tenant_id = ...` filter:
 * `client_own_tenant` (`backend/drizzle/0023`) scopes every statement, and `tenant_id` on
 * insert comes from the setting the interceptor established rather than from the request.
 *
 * No `delete` method, and no DELETE grant behind one — FR-003's "never hard-deleted" is
 * the absent privilege.
 */
import { Injectable } from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';
import { currentTx } from '../../common/tenant/middleware';
import { toPage, type Cursor, type Page } from '../../common/http/pagination';

export interface ClientRow {
  readonly id: string;
  readonly kind: 'organization' | 'person';
  readonly legalName: string;
  readonly rfc: string | null;
  readonly status: 'active' | 'inactive';
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deactivatedAt: string | null;
}

interface Raw {
  id: string;
  kind: 'organization' | 'person';
  legal_name: string;
  rfc: string | null;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
  deactivated_at: string | null;
  [key: string]: unknown;
}

const present = (row: Raw): ClientRow => ({
  id: row.id,
  kind: row.kind,
  legalName: row.legal_name,
  rfc: row.rfc,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  deactivatedAt: row.deactivated_at,
});

const COLUMNS = sql`id, kind, legal_name, rfc, status,
  created_at::text AS created_at, updated_at::text AS updated_at,
  deactivated_at::text AS deactivated_at`;

export interface ListClientsInput {
  readonly limit: number;
  readonly cursor?: Cursor | undefined;
  /** FR-002a — a case-insensitive substring of the legal name. */
  readonly nameFilter?: string | undefined;
  readonly statusFilter?: 'active' | 'inactive' | undefined;
}

@Injectable()
export class ClientRepository {
  /**
   * FR-002a. Both filters are applied INSIDE the query, before the page boundary.
   *
   * That placement is the whole requirement, not an optimisation: filtering after the
   * fetch would turn a page of 50 into a page of 7 while `nextCursor` went on claiming
   * there were 50 more, and a caller paging through would see pages that shrink for
   * reasons the API never explains (SC-007a).
   *
   * `ILIKE '%x%'` rather than a prefix match, because a firm looking for
   * "Grupo Torres, S.A. de C.V." types "torres". The mid-string form cannot use
   * `client_tenant_legal_name_lower` and scans — bounded by `tenant_id` and RLS before it
   * starts, which at a firm's client count is the right trade (data-model.md).
   *
   * The `%` and `_` characters in a caller's filter are left as wildcards rather than
   * escaped. They are not injection — the value is bound, not interpolated — and a client
   * whose legal name contains a literal `%` is not a case worth complicating this for.
   */
  async list(input: ListClientsInput): Promise<Page<ClientRow>> {
    const conditions: SQL[] = [];
    if (input.nameFilter) {
      conditions.push(sql`legal_name ILIKE '%' || ${input.nameFilter} || '%'`);
    }
    if (input.statusFilter) {
      conditions.push(sql`status = ${input.statusFilter}::client_status`);
    }
    if (input.cursor) {
      conditions.push(
        sql`(created_at, id) < (${input.cursor.occurredAt}::timestamptz, ${input.cursor.id}::uuid)`,
      );
    }

    const where = conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;

    // limit + 1 is the existence proof for a next page — `toPage` drops the extra row.
    const { rows } = await currentTx().execute<Raw>(sql`
      SELECT ${COLUMNS} FROM client
      ${where}
       ORDER BY created_at DESC, id DESC
       LIMIT ${input.limit + 1}
    `);

    return toPage(rows.map(present), input.limit, (row) => ({
      occurredAt: row.createdAt,
      id: row.id,
    }));
  }

  async findById(id: string): Promise<ClientRow | null> {
    const { rows } = await currentTx().execute<Raw>(sql`
      SELECT ${COLUMNS} FROM client WHERE id = ${id}::uuid
    `);
    const row = rows[0];
    return row ? present(row) : null;
  }

  async insert(input: {
    readonly kind: 'organization' | 'person';
    readonly legalName: string;
    readonly rfc: string | null;
  }): Promise<ClientRow> {
    const { rows } = await currentTx().execute<Raw>(sql`
      INSERT INTO client (tenant_id, kind, legal_name, rfc)
      VALUES (
        NULLIF(current_setting('app.tenant_id', true), '')::uuid,
        ${input.kind}::client_kind,
        ${input.legalName},
        ${input.rfc}
      )
      RETURNING ${COLUMNS}
    `);
    const row = rows[0];
    if (!row) throw new Error('the client insert returned no row');
    return present(row);
  }

  /**
   * `kind` is deliberately not updatable — an organization does not become a person, and
   * changing it would silently invalidate whatever a future billing slice inferred from
   * it. The service refuses a request naming it; this method has no parameter for it.
   *
   * `status = 'active'` in the predicate is what makes "cannot edit a withdrawn client"
   * true at the data layer too, not only in the service's pre-check.
   */
  async update(
    id: string,
    fields: { readonly legalName?: string; readonly rfc?: string | null },
  ): Promise<ClientRow | null> {
    const assignments: SQL[] = [sql`updated_at = now()`];
    if (fields.legalName !== undefined) assignments.push(sql`legal_name = ${fields.legalName}`);
    if (fields.rfc !== undefined) assignments.push(sql`rfc = ${fields.rfc}`);

    const { rows } = await currentTx().execute<Raw>(sql`
      UPDATE client SET ${sql.join(assignments, sql`, `)}
       WHERE id = ${id}::uuid AND status = 'active'
      RETURNING ${COLUMNS}
    `);
    const row = rows[0];
    return row ? present(row) : null;
  }

  /**
   * Withdrawal is a status change (FR-003). The `status = 'active'` predicate makes it
   * idempotent-safe under concurrency: a second deactivation updates nothing and returns
   * no row, which the service reads as the same refusal its pre-check would have raised.
   */
  async deactivate(id: string): Promise<ClientRow | null> {
    const { rows } = await currentTx().execute<Raw>(sql`
      UPDATE client
         SET status = 'inactive', deactivated_at = now(), updated_at = now()
       WHERE id = ${id}::uuid AND status = 'active'
      RETURNING ${COLUMNS}
    `);
    const row = rows[0];
    return row ? present(row) : null;
  }

  /**
   * FR-004a — the inverse, and the reason `client_deactivated_at_consistent` had to hold
   * in both directions: restoring clears `deactivated_at` as it sets the status back, or
   * the check constraint refuses the row.
   */
  async reactivate(id: string): Promise<ClientRow | null> {
    const { rows } = await currentTx().execute<Raw>(sql`
      UPDATE client
         SET status = 'active', deactivated_at = NULL, updated_at = now()
       WHERE id = ${id}::uuid AND status = 'inactive'
      RETURNING ${COLUMNS}
    `);
    const row = rows[0];
    return row ? present(row) : null;
  }

  /**
   * Used by `CaseService` to validate FR-004: only an ACTIVE client of this tenant may
   * have a new case opened against it. Returns `null` for inactive, foreign and absent
   * alike — the caller maps all three to one refusal so none can be told from another.
   */
  async findActiveById(id: string): Promise<ClientRow | null> {
    const { rows } = await currentTx().execute<Raw>(sql`
      SELECT ${COLUMNS} FROM client WHERE id = ${id}::uuid AND status = 'active'
    `);
    const row = rows[0];
    return row ? present(row) : null;
  }
}
