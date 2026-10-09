/**
 * 008 Decision 2, shared with 024 Decision 3 — the ONE definition of "a matter's activity": which
 * audit entries count (the allow-list, FR-013), which matter each belongs to (FR-012), and what of it
 * may be shown (FR-014 — never `metadata`). The per-matter feed and the dashboard's cross-matter feed
 * both call `activityRows`, so the two can never disagree about what activity is.
 *
 * Callers say only WHICH matters (`matter`, a predicate over the entry's matter id) and WHEN.
 */
import { sql, type SQL } from 'drizzle-orm';
import { currentTx } from '../../common/tenant/middleware';
import { ACTIVITY_ACTIONS } from './activity-actions';

export interface ActivityRow {
  readonly id: string;
  readonly action: string;
  readonly occurredAt: string;
  readonly actor: { readonly membershipId: string; readonly position: string | null } | null;
  readonly fileName: string | null;
  readonly case: { readonly id: string; readonly fileNumber: string };
}

const UUID = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

/**
 * The matter an entry belongs to (FR-012): the `case_file` it targets; or, for a membership target,
 * the matter named in `metadata.caseId` (team changes, the revocation cascade included); or the
 * `case_id` of the document, event or note it targets. The regex guard keeps a malformed value from
 * failing the whole read — it simply belongs to no matter.
 */
const MATTER = sql`(CASE
  WHEN e.target_entity = 'case_file' THEN e.target_id
  WHEN e.target_entity = 'membership' AND e.metadata->>'caseId' ~ ${UUID} THEN (e.metadata->>'caseId')::uuid
  ELSE coalesce(doc.case_id, ev.case_id, n.case_id)
END)`;

export async function activityRows(options: {
  /** Which matters: a predicate over the entry's matter id. */
  readonly matter: (matterId: SQL) => SQL;
  readonly from: SQL;
  readonly to: SQL;
  readonly limit: number;
}): Promise<ActivityRow[]> {
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
    case_id: string;
    file_number: string;
  }>(sql`
    SELECT x.id, x.action, x.occurred_at, x.actor_membership_id, x.position, x.file_name,
           c.id AS case_id, c.file_number
      FROM (
        SELECT e.id, e.action, e.occurred_at AS at,
               to_char(e.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS occurred_at,
               e.actor_membership_id, p.name AS position, doc.original_filename AS file_name,
               ${MATTER} AS matter_id
          FROM audit_event e
          LEFT JOIN document doc      ON e.target_entity = 'document'       AND doc.id = e.target_id
          LEFT JOIN calendar_event ev ON e.target_entity = 'calendar_event' AND ev.id  = e.target_id
          LEFT JOIN case_note n       ON e.target_entity = 'case_note'      AND n.id   = e.target_id
          LEFT JOIN directory_entry d ON d.membership_id = e.actor_membership_id
          LEFT JOIN position p        ON p.id = d.position_id
         WHERE e.action IN (${actions})
           AND e.occurred_at >= ${options.from}
           AND e.occurred_at <  ${options.to}
      ) x
      JOIN case_file c ON c.id = x.matter_id
     WHERE ${options.matter(sql`x.matter_id`)}
     ORDER BY x.at DESC, x.id DESC
     LIMIT ${options.limit}
  `);
  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    occurredAt: row.occurred_at,
    actor: row.actor_membership_id ? { membershipId: row.actor_membership_id, position: row.position } : null,
    fileName: row.file_name,
    case: { id: row.case_id, fileNumber: row.file_number },
  }));
}
