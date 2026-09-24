/**
 * 013 T008. SQL for `calendar_event`. Every query runs on the request's tenant transaction, so
 * `calendar_event_own_tenant` (RLS) scopes each one to the firm; no query here names `tenant_id`.
 *
 * WHO SEES A CASE-LINKED EVENT is decided here, by `visibleTo()`: for a caller other than MP/SA an
 * event with a case is returned only while they hold a live assignment on that case — the
 * predicate `006`'s case list uses (`case.repository.ts`, `list()`), as ONE parenthesised
 * condition so an `OR` elsewhere can never widen it. `calendar-isolation.test.ts` is its control.
 */
import { Injectable } from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';
import { currentTx } from '../../common/tenant/middleware';
import type { EventInput, EventType } from './calendar-input';

/** Mexico City day boundaries (013/FR-010): every firm in the MVP keeps that time zone. */
const ZONE = 'America/Mexico_City';

export interface Viewer {
  readonly membershipId: string;
  /** MP and SA see every event of the firm (006 Decision 2). */
  readonly unrestricted: boolean;
}

export interface EventRow {
  readonly id: string;
  readonly type: EventType;
  readonly title: string;
  readonly description: string | null;
  readonly location: string | null;
  readonly allDay: boolean;
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  readonly startsOn: string | null;
  readonly endsOn: string | null;
  readonly case: { readonly id: string; readonly fileNumber: string } | null;
  readonly remindMinutesBefore: number | null;
  readonly status: 'scheduled' | 'cancelled';
  readonly cancelledAt: string | null;
  readonly createdByMembershipId: string;
  readonly createdAt: string;
}

interface Raw {
  id: string;
  type: EventType;
  title: string;
  description: string | null;
  location: string | null;
  all_day: boolean;
  starts_at: string | null;
  ends_at: string | null;
  starts_on: string | null;
  ends_on: string | null;
  case_id: string | null;
  file_number: string | null;
  remind_minutes_before: number | null;
  status: 'scheduled' | 'cancelled';
  cancelled_at: string | null;
  created_by_membership_id: string;
  created_at: string;
  [key: string]: unknown;
}

const iso = (column: SQL) => sql`to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

const SELECT = sql`
  SELECT e.id, e.type, e.title, e.description, e.location, e.all_day,
         ${iso(sql`e.starts_at`)} AS starts_at, ${iso(sql`e.ends_at`)} AS ends_at,
         e.starts_on::text AS starts_on, e.ends_on::text AS ends_on,
         e.case_id, c.file_number, e.remind_minutes_before, e.status,
         ${iso(sql`e.cancelled_at`)} AS cancelled_at,
         e.created_by_membership_id, ${iso(sql`e.created_at`)} AS created_at
    FROM calendar_event e
    LEFT JOIN case_file c ON c.id = e.case_id
`;

/** The instant an event starts: its `starts_at`, or its `starts_on` at Mexico City midnight. */
const START = sql.raw(`coalesce(e.starts_at, (e.starts_on::timestamp AT TIME ZONE '${ZONE}'))`);

function present(row: Raw): EventRow {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    description: row.description,
    location: row.location,
    allDay: row.all_day,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    case: row.case_id ? { id: row.case_id, fileNumber: row.file_number ?? '' } : null,
    remindMinutesBefore: row.remind_minutes_before,
    status: row.status,
    cancelledAt: row.cancelled_at,
    createdByMembershipId: row.created_by_membership_id,
    createdAt: row.created_at,
  };
}

function visibleTo(viewer: Viewer): SQL {
  if (viewer.unrestricted) return sql`TRUE`;
  return sql`(
    e.case_id IS NULL
    OR EXISTS (
      SELECT 1 FROM case_assignment a
       WHERE a.case_id = e.case_id
         AND a.membership_id = ${viewer.membershipId}::uuid
         AND a.unassigned_at IS NULL
    )
  )`;
}

@Injectable()
export class CalendarRepository {
  /** Events overlapping the Mexico City days `[from, to)`, soonest first (013/FR-005). */
  async listInRange(
    viewer: Viewer,
    range: { readonly from: string; readonly to: string },
    includeCancelled: boolean,
  ): Promise<readonly EventRow[]> {
    const fromTs = sql`((${range.from}::date)::timestamp AT TIME ZONE ${ZONE})`;
    const toTs = sql`((${range.to}::date)::timestamp AT TIME ZONE ${ZONE})`;
    const { rows } = await currentTx().execute<Raw>(sql`
      ${SELECT}
       WHERE ${visibleTo(viewer)}
         AND (${includeCancelled ? sql`TRUE` : sql`e.status = 'scheduled'`})
         AND (
           (NOT e.all_day AND e.starts_at < ${toTs} AND coalesce(e.ends_at, e.starts_at) >= ${fromTs})
           OR (e.all_day AND e.starts_on < ${range.to}::date AND coalesce(e.ends_on, e.starts_on) >= ${range.from}::date)
         )
       ORDER BY ${START}, e.id
    `);
    return rows.map(present);
  }

  /** 013/FR-011: reminder time passed, start not yet reached, not cancelled. At most 50. */
  async listDueReminders(viewer: Viewer): Promise<readonly EventRow[]> {
    const { rows } = await currentTx().execute<Raw>(sql`
      ${SELECT}
       WHERE ${visibleTo(viewer)}
         AND e.status = 'scheduled'
         AND e.remind_minutes_before IS NOT NULL
         AND ${START} > now()
         AND ${START} - make_interval(mins => e.remind_minutes_before) <= now()
       ORDER BY ${START}, e.id
       LIMIT 50
    `);
    return rows.map(present);
  }

  async findVisible(viewer: Viewer, id: string): Promise<EventRow | null> {
    const { rows } = await currentTx().execute<Raw>(sql`
      ${SELECT} WHERE e.id = ${id}::uuid AND ${visibleTo(viewer)}
    `);
    return rows[0] ? present(rows[0]) : null;
  }

  /**
   * Whether the caller may attach an event to this case: it exists in the firm (RLS) and, for a
   * caller other than MP/SA, they hold a live assignment on it (013/FR-007).
   */
  async caseReachable(viewer: Viewer, caseId: string): Promise<boolean> {
    const assignment = viewer.unrestricted
      ? sql`TRUE`
      : sql`EXISTS (
          SELECT 1 FROM case_assignment a
           WHERE a.case_id = c.id AND a.membership_id = ${viewer.membershipId}::uuid AND a.unassigned_at IS NULL
        )`;
    const { rows } = await currentTx().execute<{ id: string }>(sql`
      SELECT c.id FROM case_file c WHERE c.id = ${caseId}::uuid AND ${assignment}
    `);
    return rows.length > 0;
  }

  async insert(input: EventInput, tenantId: string, membershipId: string): Promise<string> {
    const { rows } = await currentTx().execute<{ id: string }>(sql`
      INSERT INTO calendar_event (
        tenant_id, case_id, type, title, description, location, all_day,
        starts_at, ends_at, starts_on, ends_on, remind_minutes_before, created_by_membership_id
      ) VALUES (
        ${tenantId}::uuid, ${input.caseId}::uuid, ${input.type}::calendar_event_type, ${input.title},
        ${input.description}, ${input.location}, ${input.allDay},
        ${input.startsAt?.toISOString() ?? null}::timestamptz, ${input.endsAt?.toISOString() ?? null}::timestamptz,
        ${input.startsOn}::date, ${input.endsOn}::date, ${input.remindMinutesBefore}::integer, ${membershipId}::uuid
      )
      RETURNING id
    `);
    return rows[0]!.id;
  }

  async update(id: string, input: EventInput): Promise<void> {
    await currentTx().execute(sql`
      UPDATE calendar_event SET
        case_id = ${input.caseId}::uuid,
        type = ${input.type}::calendar_event_type,
        title = ${input.title},
        description = ${input.description},
        location = ${input.location},
        all_day = ${input.allDay},
        starts_at = ${input.startsAt?.toISOString() ?? null}::timestamptz,
        ends_at = ${input.endsAt?.toISOString() ?? null}::timestamptz,
        starts_on = ${input.startsOn}::date,
        ends_on = ${input.endsOn}::date,
        remind_minutes_before = ${input.remindMinutesBefore}::integer,
        updated_at = now()
      WHERE id = ${id}::uuid
    `);
  }

  async cancel(id: string): Promise<void> {
    await currentTx().execute(sql`
      UPDATE calendar_event SET status = 'cancelled', cancelled_at = now(), updated_at = now()
       WHERE id = ${id}::uuid AND status = 'scheduled'
    `);
  }
}
