/**
 * 024 — the dashboard's reads. Every query runs on the request's tenant transaction, so RLS confines
 * it to the firm before any predicate here applies.
 *
 * REACH IS DECIDED HERE, by `reaches()`, for every section (024/FR-004): MP and SA reach every matter
 * of the firm (006 Decision 2); everybody else only those on which they hold a live assignment — the
 * predicate 006's list, 013's calendar and 009's timesheet use, as ONE parenthesised condition so an
 * `OR` elsewhere can never widen it. `dashboard-isolation.test.ts` is its control.
 */
import { Injectable } from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';
import { currentTx } from '../../common/tenant/middleware';
import { activityRows, type ActivityRow } from '../notes/activity-query';

/** Mexico City days (024 Decision 7), as 009, 013 and 015. Named, never an offset. */
const ZONE = 'America/Mexico_City';

const LIST_LIMIT = 10;
const ACTIVITY_LIMIT = 20;

export interface Viewer {
  readonly membershipId: string;
  /** MP and SA reach every matter of the firm (006 Decision 2). */
  readonly unrestricted: boolean;
}

export interface EventSummary {
  readonly id: string;
  readonly type: 'hearing' | 'deadline' | 'meeting' | 'other';
  readonly title: string;
  readonly allDay: boolean;
  readonly startsAt: string | null;
  readonly startsOn: string | null;
  readonly case: { readonly id: string; readonly fileNumber: string } | null;
}

/** Whether the viewer reaches the matter `caseId` names. ONE parenthesised condition. */
function reaches(viewer: Viewer, caseId: SQL): SQL {
  if (viewer.unrestricted) return sql`TRUE`;
  return sql`(
    EXISTS (
      SELECT 1 FROM case_assignment a
       WHERE a.case_id = ${caseId}
         AND a.membership_id = ${viewer.membershipId}::uuid
         AND a.unassigned_at IS NULL
    )
  )`;
}

const TODAY = sql`(now() AT TIME ZONE ${ZONE})::date`;
/** The instant a Mexico City day starts. */
const dayStart = (day: SQL) => sql`((${day})::timestamp AT TIME ZONE ${ZONE})`;
/** When an event starts, timed or all-day, as an instant — for ordering and for "starts within". */
const START = sql`coalesce(e.starts_at, ${dayStart(sql`e.starts_on`)})`;

@Injectable()
export class DashboardRepository {
  async today(): Promise<string> {
    const { rows } = await currentTx().execute<{ today: string }>(sql`SELECT ${TODAY}::text AS today`);
    return rows[0]!.today;
  }

  /** FR-005: reachable matters whose status does not close them — 015's definition of active. */
  async activeMatters(viewer: Viewer): Promise<number> {
    const { rows } = await currentTx().execute<{ n: string }>(sql`
      SELECT count(*)::text AS n
        FROM case_file c
        JOIN case_status cs ON cs.id = c.case_status_id
       WHERE NOT cs.is_closing AND ${reaches(viewer, sql`c.id`)}
    `);
    return Number(rows[0]?.n ?? '0');
  }

  /** FR-006: the caller's own logged minutes today, on matters they still reach (009's rule). */
  async ownMinutesToday(viewer: Viewer): Promise<number> {
    const { rows } = await currentTx().execute<{ n: string }>(sql`
      SELECT coalesce(sum(t.minutes), 0)::text AS n
        FROM time_entry t
       WHERE t.membership_id = ${viewer.membershipId}::uuid
         AND t.status = 'logged'
         AND t.work_date = ${TODAY}
         AND ${reaches(viewer, sql`t.case_id`)}
    `);
    return Number(rows[0]?.n ?? '0');
  }

  /** FR-007: scheduled events overlapping today — 013/FR-005's overlap rule — soonest first. */
  async eventsToday(viewer: Viewer): Promise<EventSummary[]> {
    return this.events(
      viewer,
      sql`(
        (NOT e.all_day AND e.starts_at < ${dayStart(sql`${TODAY} + 1`)} AND coalesce(e.ends_at, e.starts_at) >= ${dayStart(TODAY)})
        OR (e.all_day AND e.starts_on <= ${TODAY} AND coalesce(e.ends_on, e.starts_on) >= ${TODAY})
      )`,
      sql`${START} ASC, e.id`,
    );
  }

  /** FR-008: scheduled deadlines starting in `[today + from, today + to)` days. */
  async deadlines(viewer: Viewer, from: number, to: number, order: 'asc' | 'desc'): Promise<EventSummary[]> {
    return this.events(
      viewer,
      sql`e.type = 'deadline'
          AND ${START} >= ${dayStart(sql`${TODAY} + ${from}::int`)}
          AND ${START} <  ${dayStart(sql`${TODAY} + ${to}::int`)}`,
      order === 'asc' ? sql`${START} ASC, e.id` : sql`${START} DESC, e.id`,
    );
  }

  /** FR-009: 008's derivation, across every matter the viewer reaches, the last 30 days. */
  async recentActivity(viewer: Viewer): Promise<ActivityRow[]> {
    return activityRows({
      matter: (matterId) => reaches(viewer, matterId),
      from: sql`now() - interval '30 days'`,
      to: sql`now() + interval '1 minute'`,
      limit: ACTIVITY_LIMIT,
    });
  }

  private async events(viewer: Viewer, when: SQL, order: SQL): Promise<EventSummary[]> {
    const { rows } = await currentTx().execute<{
      id: string;
      type: EventSummary['type'];
      title: string;
      all_day: boolean;
      starts_at: string | null;
      starts_on: string | null;
      case_id: string | null;
      file_number: string | null;
    }>(sql`
      SELECT e.id, e.type, e.title, e.all_day,
             to_char(e.starts_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS starts_at,
             e.starts_on::text AS starts_on, c.id AS case_id, c.file_number
        FROM calendar_event e
        LEFT JOIN case_file c ON c.id = e.case_id
       WHERE e.status = 'scheduled'
         AND (e.case_id IS NULL OR ${reaches(viewer, sql`e.case_id`)})
         AND ${when}
       ORDER BY ${order}
       LIMIT ${LIST_LIMIT}
    `);
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      allDay: row.all_day,
      startsAt: row.starts_at,
      startsOn: row.starts_on,
      case: row.case_id && row.file_number ? { id: row.case_id, fileNumber: row.file_number } : null,
    }));
  }
}
