/**
 * 008 — a matter's activity, read from `audit_event` (Decision 2). No table of its own: the audit log
 * already records every mutation exactly once, so a second store could only drift from it.
 *
 * Runs under the request's RLS like every tenant read, so another firm's rows are invisible before
 * any predicate here applies.
 *
 * WHICH ENTRIES (FR-012). An entry belongs to the matter when its target is the `case_file` itself;
 * or a membership whose entry names the matter in `metadata.caseId` (team changes, including the
 * revocation cascade — 006/FR-012a); or a document, calendar event or note whose `case_id` is the
 * matter. Only the allow-listed actions (FR-013).
 *
 * WHAT IT RETURNS (FR-014). Kind, time, actor and — for documents only — the file name. `metadata`
 * is read for the membership join and never selected: previous and new values, categories, outcomes
 * and roles stay in the log.
 */
import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { currentTx } from '../../common/tenant/middleware';
import { ACTIVITY_ACTIONS } from './activity-actions';

const ZONE = 'America/Mexico_City';

/** FR-010. The feed answers for one month at a time; a month busier than this says so. */
export const ACTIVITY_LIMIT = 200;

export interface ActivityEntry {
  readonly id: string;
  readonly action: string;
  readonly occurredAt: string;
  readonly actor: { readonly membershipId: string; readonly position: string | null } | null;
  readonly fileName: string | null;
}

@Injectable()
export class ActivityRepository {
  async currentMonth(): Promise<string> {
    const { rows } = await currentTx().execute<{ month: string }>(
      sql`SELECT to_char(now() AT TIME ZONE ${ZONE}, 'YYYY-MM') AS month`,
    );
    return rows[0]!.month;
  }

  async forCase(caseId: string, month: string): Promise<{ items: ActivityEntry[]; truncated: boolean }> {
    const start = sql`((${month} || '-01')::timestamp AT TIME ZONE ${ZONE})`;
    const end = sql`(((${month} || '-01')::timestamp + interval '1 month') AT TIME ZONE ${ZONE})`;
    const actions = sql.join(
      ACTIVITY_ACTIONS.map((action) => sql`${action}`),
      sql`, `,
    );
    const { rows } = await currentTx().execute<{
      id: string;
      action: string;
      occurred_at: string;
      actor_membership_id: string | null;
      position: string | null;
      file_name: string | null;
    }>(sql`
      SELECT e.id, e.action,
             to_char(e.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS occurred_at,
             e.actor_membership_id, p.name AS position, doc.original_filename AS file_name
        FROM audit_event e
        LEFT JOIN document doc      ON e.target_entity = 'document'       AND doc.id = e.target_id
        LEFT JOIN calendar_event ev ON e.target_entity = 'calendar_event' AND ev.id  = e.target_id
        LEFT JOIN case_note n       ON e.target_entity = 'case_note'      AND n.id   = e.target_id
        LEFT JOIN directory_entry d ON d.membership_id = e.actor_membership_id
        LEFT JOIN position p        ON p.id = d.position_id
       WHERE e.action IN (${actions})
         AND (
           (e.target_entity = 'case_file' AND e.target_id = ${caseId}::uuid)
           OR (e.target_entity = 'membership' AND e.metadata->>'caseId' = ${caseId})
           OR doc.case_id = ${caseId}::uuid
           OR ev.case_id = ${caseId}::uuid
           OR n.case_id = ${caseId}::uuid
         )
         AND e.occurred_at >= ${start}
         AND e.occurred_at <  ${end}
       ORDER BY e.occurred_at DESC, e.id DESC
       LIMIT ${ACTIVITY_LIMIT + 1}
    `);
    const items = rows.slice(0, ACTIVITY_LIMIT).map((row) => ({
      id: row.id,
      action: row.action,
      occurredAt: row.occurred_at,
      actor: row.actor_membership_id ? { membershipId: row.actor_membership_id, position: row.position } : null,
      fileName: row.file_name,
    }));
    return { items, truncated: rows.length > ACTIVITY_LIMIT };
  }
}
