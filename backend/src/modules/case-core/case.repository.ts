/**
 * T041 — the case register's storage seam. 006/FR-005 to FR-008a, FR-014.
 *
 * The relation is `case_file`; the entity and the API say "case" (research.md D4).
 *
 * The list query below is where FR-014 actually lives — see `list()`.
 */
import { Injectable } from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';
import { currentTx } from '../../common/tenant/middleware';
import { toPage, type Cursor, type Page } from '../../common/http/pagination';

export interface CatalogRef {
  readonly id: string;
  readonly name: string;
  readonly catalogStatus: 'active' | 'retired';
}

export interface CaseRow {
  readonly id: string;
  readonly fileNumber: string;
  readonly venueCaseReference: string | null;
  readonly client: { readonly id: string; readonly legalName: string; readonly status: string };
  readonly status: CatalogRef;
  readonly matterType: CatalogRef | null;
  readonly venue: CatalogRef | null;
  readonly openedOn: string;
  readonly closedOn: string | null;
  readonly createdAt: string;
}

interface Raw {
  id: string;
  file_number: string;
  venue_case_reference: string | null;
  client_id: string;
  client_legal_name: string;
  client_status: string;
  case_status_id: string;
  case_status_name: string;
  case_status_state: 'active' | 'retired';
  matter_type_id: string | null;
  matter_type_name: string | null;
  matter_type_state: 'active' | 'retired' | null;
  venue_id: string | null;
  venue_name: string | null;
  venue_state: 'active' | 'retired' | null;
  opened_on: string;
  closed_on: string | null;
  created_at: string;
  [key: string]: unknown;
}

const ref = (
  id: string | null,
  name: string | null,
  state: 'active' | 'retired' | null,
): CatalogRef | null => (id && name && state ? { id, name, catalogStatus: state } : null);

const present = (row: Raw): CaseRow => ({
  id: row.id,
  fileNumber: row.file_number,
  venueCaseReference: row.venue_case_reference,
  client: { id: row.client_id, legalName: row.client_legal_name, status: row.client_status },
  // Non-null by schema — `case_status_id` is NOT NULL and its FK guarantees the join.
  status: ref(row.case_status_id, row.case_status_name, row.case_status_state) as CatalogRef,
  matterType: ref(row.matter_type_id, row.matter_type_name, row.matter_type_state),
  venue: ref(row.venue_id, row.venue_name, row.venue_state),
  openedOn: row.opened_on,
  closedOn: row.closed_on,
  createdAt: row.created_at,
});

/**
 * `catalogStatus` on each reference is how FR-020's "a retired entry stays resolvable,
 * marked retired" reaches the wire — the same thing 017's directory read does for retired
 * positions. The joins are plain `LEFT JOIN`s with no status predicate for exactly that
 * reason: filtering retired entries out here would make an existing case unresolvable.
 */
const SELECT_CASE = sql`
  SELECT c.id,
         c.file_number,
         c.venue_case_reference,
         cl.id     AS client_id,
         cl.legal_name AS client_legal_name,
         cl.status::text AS client_status,
         cs.id     AS case_status_id,
         cs.name   AS case_status_name,
         cs.status::text AS case_status_state,
         mt.id     AS matter_type_id,
         mt.name   AS matter_type_name,
         mt.status::text AS matter_type_state,
         v.id      AS venue_id,
         v.name    AS venue_name,
         v.status::text AS venue_state,
         c.opened_on::text AS opened_on,
         c.closed_on::text AS closed_on,
         c.created_at::text AS created_at
    FROM case_file c
    JOIN client      cl ON cl.id = c.client_id
    JOIN case_status cs ON cs.id = c.case_status_id
    LEFT JOIN matter_type mt ON mt.id = c.matter_type_id
    LEFT JOIN venue       v  ON v.id  = c.venue_id
`;

export interface ListCasesInput {
  readonly limit: number;
  readonly cursor?: Cursor | undefined;
  /** Decision 2 — `MP`/`SA` see every case in the tenant, so no assignment filter applies. */
  readonly unrestricted: boolean;
  readonly membershipId: string;
  /*
   * 019 — the three filters. All optional; all applied inside the WHERE, before the LIMIT.
   * See `019/contracts/case-list-filters.md`.
   */
  /** Trimmed by the service. Matches the file number OR the client's legal name. */
  readonly q?: string | undefined;
  readonly matterTypeId?: string | undefined;
  readonly venueId?: string | undefined;
}

@Injectable()
export class CaseRepository {
  /**
   * FR-014 — the requirement this method exists to satisfy, and the reason
   * `case.read_list` declares `tenant` scope rather than `assigned`.
   *
   * A scope resolver returns a boolean; there is no outcome meaning "permit, but return
   * fewer rows". An `assigned`-scoped list would therefore REFUSE a caller with no
   * assignments, while the spec requires them to receive an empty list (US3 scenario 5).
   * So the scope check permits the call and the filtering happens here instead.
   *
   * The `EXISTS` sits INSIDE the `WHERE`, before `LIMIT`. That placement is the whole
   * point: filtering after the fetch would turn a page of 50 into a page of 7 while
   * `nextCursor` went on claiming there were 50 more (SC-012).
   *
   * No `tenant_id` predicate — `case_file_own_tenant` and `case_assignment_own_tenant`
   * scope both sides of the sub-select.
   *
   * **019 added three filters to this array, and the shape matters more than it looks.**
   * They are further entries in `conditions`, joined with `AND` by the same `sql.join`,
   * evaluated in the same `WHERE`, before the same `LIMIT`. In particular the `q` predicate
   * is ONE parenthesised condition containing its own `OR`, because `AND` binds tighter:
   *
   *     EXISTS(assignment) AND file_number ILIKE x OR legal_name ILIKE x
   *
   * parses as `(EXISTS(...) AND file_number ILIKE x) OR (legal_name ILIKE x)`, and that
   * second branch has no assignment predicate at all — every matching case in the tenant
   * goes to a caller assigned to none of them. It returns a SUPERSET, so every test asking
   * "did I get the right rows" still passes. `tests/integration/case-filter-scoping.test.ts`
   * is the one that does not.
   */
  async list(input: ListCasesInput): Promise<Page<CaseRow>> {
    const conditions: SQL[] = [];

    if (!input.unrestricted) {
      conditions.push(sql`EXISTS (
        SELECT 1 FROM case_assignment a
         WHERE a.case_id = c.id
           AND a.membership_id = ${input.membershipId}::uuid
           AND a.unassigned_at IS NULL
      )`);
    }

    if (input.cursor) {
      conditions.push(
        sql`(c.created_at, c.id) < (${input.cursor.occurredAt}::timestamptz, ${input.cursor.id}::uuid)`,
      );
    }

    if (input.q) {
      // The parentheses are load-bearing — see the note above. `ILIKE '%x%'` rather than a
      // prefix match, for the reason `ClientRepository.list` already gives: a firm looking
      // for a matter knows a fragment, not a beginning.
      conditions.push(sql`(
        c.file_number ILIKE '%' || ${input.q} || '%'
        OR cl.legal_name ILIKE '%' || ${input.q} || '%'
      )`);
    }

    if (input.matterTypeId) {
      conditions.push(sql`c.matter_type_id = ${input.matterTypeId}::uuid`);
    }

    if (input.venueId) {
      conditions.push(sql`c.venue_id = ${input.venueId}::uuid`);
    }

    const where = conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;

    const { rows } = await currentTx().execute<Raw>(sql`
      ${SELECT_CASE}
      ${where}
       ORDER BY c.created_at DESC, c.id DESC
       LIMIT ${input.limit + 1}
    `);

    return toPage(rows.map(present), input.limit, (row) => ({
      occurredAt: row.createdAt,
      id: row.id,
    }));
  }

  async findById(id: string): Promise<CaseRow | null> {
    const { rows } = await currentTx().execute<Raw>(sql`
      ${SELECT_CASE} WHERE c.id = ${id}::uuid
    `);
    const row = rows[0];
    return row ? present(row) : null;
  }

  async insert(input: {
    readonly clientId: string;
    readonly fileNumber: string;
    readonly venueCaseReference: string | null;
    readonly caseStatusId: string;
    readonly matterTypeId: string | null;
    readonly venueId: string | null;
    readonly openedOn: string | null;
    /** FR-008a — derived by the service from the status, never taken from the request. */
    readonly closedOn: string | null;
  }): Promise<CaseRow> {
    const { rows } = await currentTx().execute<{ id: string; [key: string]: unknown }>(sql`
      INSERT INTO case_file (
        tenant_id, client_id, file_number, venue_case_reference,
        case_status_id, matter_type_id, venue_id, opened_on, closed_on
      )
      VALUES (
        NULLIF(current_setting('app.tenant_id', true), '')::uuid,
        ${input.clientId}::uuid,
        ${input.fileNumber},
        ${input.venueCaseReference},
        ${input.caseStatusId}::uuid,
        ${input.matterTypeId}::uuid,
        ${input.venueId}::uuid,
        COALESCE(${input.openedOn}::date, current_date),
        ${input.closedOn}::date
      )
      RETURNING id
    `);
    const id = rows[0]?.id;
    if (!id) throw new Error('the case insert returned no row');

    // Re-read through the joined projection rather than assembling it from the input —
    // the catalog names and the client's status come from their own tables, and a caller
    // reading its own write should see what a later reader will.
    const created = await this.findById(id);
    if (!created) throw new Error('the case insert returned a row that cannot be read back');
    return created;
  }

  /**
   * FR-008a. `closedOn` moves here and nowhere else, in both directions — the service
   * derives it from the target status's `is_closing` and passes the result.
   */
  async updateStatus(
    id: string,
    caseStatusId: string,
    closedOn: string | null,
  ): Promise<CaseRow | null> {
    const { rows } = await currentTx().execute<{ id: string; [key: string]: unknown }>(sql`
      UPDATE case_file
         SET case_status_id = ${caseStatusId}::uuid,
             closed_on      = ${closedOn}::date,
             updated_at     = now()
       WHERE id = ${id}::uuid
      RETURNING id
    `);
    return rows[0] ? this.findById(id) : null;
  }
}
