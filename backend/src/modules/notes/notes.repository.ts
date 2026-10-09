/**
 * 008 — SQL for `case_note`. Every query runs on the request's tenant transaction, so
 * `case_note_own_tenant` (RLS) scopes each one to the firm; only the INSERT names `tenant_id`.
 *
 * Reach is NOT decided here. Every route is nested under `/tenant/cases/:caseId` with
 * `@ScopeTarget('caseId')`, so 006's resolver has answered before any query runs; each query is then
 * pinned to that `case_id`, so a note id from another matter is simply not found.
 *
 * Ownership IS decided here, for corrections: `lockOwn` matches the author, so somebody else's note is
 * the same "not found" as a note that does not exist (Decision 3).
 */
import { Injectable } from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';
import { currentTx } from '../../common/tenant/middleware';

/** Mexico City month boundaries (Decision 7), as 009, 013 and 015. Named, never an offset. */
const ZONE = 'America/Mexico_City';

/** Decision 3: the correction window, from `created_at` — 009's 24 hours. */
const WINDOW = sql.raw(`interval '24 hours'`);

export interface NoteRow {
  readonly id: string;
  readonly body: string;
  readonly createdAt: string;
  readonly author: { readonly membershipId: string; readonly position: string | null };
  readonly own: boolean;
  /** Decided by the server's clock; null when not the caller's, or the window has closed. */
  readonly correctableUntil: string | null;
}

export interface OwnNote {
  readonly id: string;
  readonly status: 'active' | 'voided';
  readonly body: string;
  readonly windowOpen: boolean;
}

interface RawNote {
  id: string;
  body: string;
  created_at: string;
  author_membership_id: string;
  position: string | null;
  own: boolean;
  correctable_until: string | null;
  [key: string]: unknown;
}

// Parenthesised: `AT TIME ZONE` binds tighter than `+`.
const iso = (column: SQL) => sql`to_char((${column}) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

function noteSelect(viewerMembershipId: string): SQL {
  const own = sql`(n.author_membership_id = ${viewerMembershipId}::uuid)`;
  return sql`
    SELECT n.id, n.body, ${iso(sql`n.created_at`)} AS created_at, n.author_membership_id,
           p.name AS position, ${own} AS own,
           CASE WHEN ${own} AND n.created_at + ${WINDOW} > now() THEN ${iso(sql`n.created_at + ${WINDOW}`)} END
             AS correctable_until
      FROM case_note n
      LEFT JOIN directory_entry d ON d.membership_id = n.author_membership_id
      LEFT JOIN position p ON p.id = d.position_id
  `;
}

function present(row: RawNote): NoteRow {
  return {
    id: row.id,
    body: row.body,
    createdAt: row.created_at,
    author: { membershipId: row.author_membership_id, position: row.position },
    own: row.own,
    correctableUntil: row.correctable_until,
  };
}

@Injectable()
export class NotesRepository {
  /** The current Mexico City month, on the transaction's clock — the same clock as `created_at`. */
  async currentMonth(): Promise<string> {
    const { rows } = await currentTx().execute<{ month: string }>(
      sql`SELECT to_char(now() AT TIME ZONE ${ZONE}, 'YYYY-MM') AS month`,
    );
    return rows[0]!.month;
  }

  /** FR-004: active notes of one Mexico City month, newest first. A range, so the index serves it. */
  async listByMonth(caseId: string, month: string, viewerMembershipId: string): Promise<NoteRow[]> {
    const start = sql`((${month} || '-01')::timestamp AT TIME ZONE ${ZONE})`;
    const end = sql`(((${month} || '-01')::timestamp + interval '1 month') AT TIME ZONE ${ZONE})`;
    const { rows } = await currentTx().execute<RawNote>(sql`
      ${noteSelect(viewerMembershipId)}
       WHERE n.case_id = ${caseId}::uuid
         AND n.status = 'active'
         AND n.created_at >= ${start}
         AND n.created_at <  ${end}
       ORDER BY n.created_at DESC, n.id DESC
    `);
    return rows.map(present);
  }

  async findListed(caseId: string, id: string, viewerMembershipId: string): Promise<NoteRow> {
    const { rows } = await currentTx().execute<RawNote>(sql`
      ${noteSelect(viewerMembershipId)} WHERE n.id = ${id}::uuid AND n.case_id = ${caseId}::uuid
    `);
    return present(rows[0]!);
  }

  async insert(tenantId: string, caseId: string, authorMembershipId: string, body: string): Promise<string> {
    const { rows } = await currentTx().execute<{ id: string }>(sql`
      INSERT INTO case_note (tenant_id, case_id, author_membership_id, body)
      VALUES (${tenantId}::uuid, ${caseId}::uuid, ${authorMembershipId}::uuid, ${body})
      RETURNING id
    `);
    return rows[0]!.id;
  }

  /** The caller's own note on this matter, locked, with whether its window is still open. */
  async lockOwn(authorMembershipId: string, caseId: string, id: string): Promise<OwnNote | null> {
    const { rows } = await currentTx().execute<{
      id: string;
      status: OwnNote['status'];
      body: string;
      window_open: boolean;
    }>(sql`
      SELECT id, status, body, (created_at + ${WINDOW} > now()) AS window_open
        FROM case_note
       WHERE id = ${id}::uuid AND case_id = ${caseId}::uuid AND author_membership_id = ${authorMembershipId}::uuid
       FOR UPDATE
    `);
    const row = rows[0];
    return row ? { id: row.id, status: row.status, body: row.body, windowOpen: row.window_open } : null;
  }

  async correct(id: string, body: string): Promise<void> {
    await currentTx().execute(sql`
      UPDATE case_note SET body = ${body}, updated_at = now() WHERE id = ${id}::uuid AND status = 'active'
    `);
  }

  async void(id: string): Promise<void> {
    await currentTx().execute(sql`
      UPDATE case_note SET status = 'voided', voided_at = now(), updated_at = now()
       WHERE id = ${id}::uuid AND status = 'active'
    `);
  }
}
