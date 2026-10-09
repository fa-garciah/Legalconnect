/**
 * 009 — SQL for `time_entry`. Every query runs on the request's tenant transaction, so
 * `time_entry_own_tenant` (RLS) scopes each one to the firm; no query here names `tenant_id`
 * except the INSERTs that must write it.
 *
 * TWO RULES LIVE HERE AND NOWHERE ELSE:
 *
 *   1. **Own only.** Every read and every write is constrained by `membership_id = <caller>`. In
 *      this slice nobody reads or touches anybody else's time (009 Decision 2).
 *   2. **Reachable only, for reads.** `visible()` keeps an entry only while the caller still holds a
 *      live assignment on its matter — the predicate `006`'s case list and `013`'s calendar use, as
 *      ONE parenthesised condition so an `OR` elsewhere can never widen it. MP (and SA, were it ever
 *      granted a read) are unrestricted, mirroring the resolver's 006 Decision 2 exemption.
 *
 * Reach for WRITES is not decided here: every write route is nested under `:caseId` and 006's
 * resolver has already answered before the service runs (009 Decision 9).
 * `time-entries-isolation.test.ts` is the control for both rules.
 */
import { Injectable } from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';
import { currentTx } from '../../common/tenant/middleware';
import type { CorrectionInput, ManualEntryInput } from './time-entry-input';

/** Mexico City day boundaries (009 Decision 6), as `013` and `015`. Named, never an offset. */
const ZONE = 'America/Mexico_City';

/** FR-013: the correction window, from `logged_at`. */
const WINDOW = sql.raw(`interval '24 hours'`);

export interface Viewer {
  readonly membershipId: string;
  /** MP (and SA) — the resolver's exemption, applied to reads (006 Decision 2). */
  readonly unrestricted: boolean;
}

export interface CaseRef {
  readonly id: string;
  readonly fileNumber: string;
}

/** A logged entry as listed — contracts/time-entries-api.md `TimeEntry`. */
export interface EntryRow {
  readonly id: string;
  readonly case: CaseRef;
  readonly workDate: string;
  readonly minutes: number;
  readonly description: string;
  readonly source: 'timer' | 'manual';
  readonly loggedAt: string;
  /** FR-015: decided by the server's clock, never the browser's. */
  readonly correctableUntil: string | null;
}

export interface RunningTimerRow {
  readonly id: string;
  readonly case: CaseRef | null;
  readonly caseAvailable: boolean;
  readonly startedAt: string;
  readonly description: string | null;
}

/** An own entry as the correction path needs it. */
export interface OwnEntry {
  readonly id: string;
  readonly status: 'running' | 'logged' | 'voided';
  readonly workDate: string;
  readonly minutes: number | null;
  readonly description: string | null;
  readonly windowOpen: boolean;
}

// Parenthesised: `AT TIME ZONE` binds tighter than `+`, so `logged_at + interval '24 hours' AT TIME
// ZONE 'UTC'` would apply the zone to the interval and fail.
const iso = (column: SQL) => sql`to_char((${column}) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

interface RawEntry {
  id: string;
  case_id: string;
  file_number: string;
  work_date: string;
  minutes: number;
  description: string;
  source: 'timer' | 'manual';
  logged_at: string;
  correctable_until: string | null;
  [key: string]: unknown;
}

const ENTRY = sql`
  SELECT t.id, t.case_id, c.file_number, t.work_date::text AS work_date, t.minutes, t.description,
         t.source, ${iso(sql`t.logged_at`)} AS logged_at,
         CASE WHEN t.logged_at + ${WINDOW} > now() THEN ${iso(sql`t.logged_at + ${WINDOW}`)} END
           AS correctable_until
    FROM time_entry t
    JOIN case_file c ON c.id = t.case_id
`;

function present(row: RawEntry): EntryRow {
  return {
    id: row.id,
    case: { id: row.case_id, fileNumber: row.file_number },
    workDate: row.work_date,
    minutes: row.minutes,
    description: row.description,
    source: row.source,
    loggedAt: row.logged_at,
    correctableUntil: row.correctable_until,
  };
}

/** Whether the caller still reaches the entry's matter. ONE parenthesised condition. */
function reachable(viewer: Viewer): SQL {
  if (viewer.unrestricted) return sql`TRUE`;
  return sql`(
    EXISTS (
      SELECT 1 FROM case_assignment a
       WHERE a.case_id = t.case_id
         AND a.membership_id = ${viewer.membershipId}::uuid
         AND a.unassigned_at IS NULL
    )
  )`;
}

@Injectable()
export class TimeEntriesRepository {
  /** Today in Mexico City, on the transaction's clock — the same clock as `logged_at`. */
  async today(): Promise<string> {
    const { rows } = await currentTx().execute<{ today: string }>(
      sql`SELECT (now() AT TIME ZONE ${ZONE})::date::text AS today`,
    );
    return rows[0]!.today;
  }

  /** FR-009: own `logged` entries on reachable matters, work day in `[from, to)`. */
  async listOwn(viewer: Viewer, range: { readonly from: string; readonly to: string }): Promise<EntryRow[]> {
    const { rows } = await currentTx().execute<RawEntry>(sql`
      ${ENTRY}
       WHERE t.membership_id = ${viewer.membershipId}::uuid
         AND t.status = 'logged'
         AND t.work_date >= ${range.from}::date
         AND t.work_date <  ${range.to}::date
         AND ${reachable(viewer)}
       ORDER BY t.work_date DESC, t.logged_at DESC, t.id
    `);
    return rows.map(present);
  }

  /** One own logged entry, as listed — what every write answers with. */
  async findListed(viewer: Viewer, id: string): Promise<EntryRow> {
    const { rows } = await currentTx().execute<RawEntry>(sql`
      ${ENTRY} WHERE t.id = ${id}::uuid AND t.membership_id = ${viewer.membershipId}::uuid
    `);
    return present(rows[0]!);
  }

  /** FR-008: the caller's running timer; the matter only while it is still reachable. */
  async runningTimer(viewer: Viewer): Promise<RunningTimerRow | null> {
    const { rows } = await currentTx().execute<{
      id: string;
      case_id: string;
      file_number: string;
      started_at: string;
      description: string | null;
      reachable: boolean;
    }>(sql`
      SELECT t.id, t.case_id, c.file_number, ${iso(sql`t.started_at`)} AS started_at, t.description,
             ${reachable(viewer)} AS reachable
        FROM time_entry t
        JOIN case_file c ON c.id = t.case_id
       WHERE t.membership_id = ${viewer.membershipId}::uuid AND t.status = 'running'
    `);
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      case: row.reachable ? { id: row.case_id, fileNumber: row.file_number } : null,
      caseAvailable: row.reachable,
      startedAt: row.started_at,
      description: row.description,
    };
  }

  /**
   * Whether the matter exists IN THIS FIRM — read under RLS, so another firm's matter and one that
   * exists nowhere both answer false.
   *
   * Needed because 006's resolver lets MP through BEFORE any query (006 Decision 2): for an MP the
   * resolver never looks at the matter at all. Without this, an MP naming another firm's matter id
   * reached the INSERT — and a foreign-key check does not apply RLS — so the response told them
   * whether that id existed in some other firm. Found by `time-entries-isolation.test.ts`.
   */
  async caseInFirm(caseId: string): Promise<boolean> {
    const { rows } = await currentTx().execute<{ id: string }>(sql`SELECT id FROM case_file WHERE id = ${caseId}::uuid`);
    return rows.length > 0;
  }

  /** Throws the database's `23505` when a timer is already running (FR-006); the service maps it. */
  async startTimer(tenantId: string, caseId: string, membershipId: string, description: string | null): Promise<string> {
    const { rows } = await currentTx().execute<{ id: string }>(sql`
      INSERT INTO time_entry (tenant_id, case_id, membership_id, source, status, work_date, description, started_at)
      VALUES (${tenantId}::uuid, ${caseId}::uuid, ${membershipId}::uuid, 'timer', 'running',
              (now() AT TIME ZONE ${ZONE})::date, ${description}, now())
      RETURNING id
    `);
    return rows[0]!.id;
  }

  /**
   * The caller's running timer on THIS matter, locked, with its elapsed seconds on the
   * transaction's clock. `FOR UPDATE` serialises a double stop: the second waits, then finds the
   * row no longer running and returns nothing.
   */
  async lockRunningOn(
    membershipId: string,
    caseId: string,
  ): Promise<{ id: string; description: string | null; elapsedSeconds: number } | null> {
    const { rows } = await currentTx().execute<{ id: string; description: string | null; elapsed: string }>(sql`
      SELECT id, description, extract(epoch FROM now() - started_at)::text AS elapsed
        FROM time_entry
       WHERE membership_id = ${membershipId}::uuid AND case_id = ${caseId}::uuid AND status = 'running'
       FOR UPDATE
    `);
    const row = rows[0];
    return row ? { id: row.id, description: row.description, elapsedSeconds: Number(row.elapsed) } : null;
  }

  /** Running → logged. The work day is recomputed from `started_at` (data-model.md, SC-005). */
  async stopTimer(id: string, minutes: number, description: string): Promise<void> {
    await currentTx().execute(sql`
      UPDATE time_entry
         SET status = 'logged', stopped_at = now(), logged_at = now(), minutes = ${minutes},
             description = ${description}, work_date = (started_at AT TIME ZONE ${ZONE})::date,
             updated_at = now()
       WHERE id = ${id}::uuid AND status = 'running'
    `);
  }

  /** FR-008: the caller's running timer → voided, whatever its matter. Null when there is none. */
  async discardRunning(membershipId: string): Promise<string | null> {
    const { rows } = await currentTx().execute<{ id: string }>(sql`
      UPDATE time_entry SET status = 'voided', voided_at = now(), updated_at = now()
       WHERE membership_id = ${membershipId}::uuid AND status = 'running'
      RETURNING id
    `);
    return rows[0]?.id ?? null;
  }

  async insertManual(tenantId: string, caseId: string, membershipId: string, input: ManualEntryInput): Promise<string> {
    const { rows } = await currentTx().execute<{ id: string }>(sql`
      INSERT INTO time_entry (tenant_id, case_id, membership_id, source, status, work_date, minutes, description, logged_at)
      VALUES (${tenantId}::uuid, ${caseId}::uuid, ${membershipId}::uuid, 'manual', 'logged',
              ${input.workDate}::date, ${input.minutes}, ${input.description}, now())
      RETURNING id
    `);
    return rows[0]!.id;
  }

  /** An own entry on this matter, locked, with whether its correction window is still open. */
  async lockOwn(membershipId: string, caseId: string, id: string): Promise<OwnEntry | null> {
    const { rows } = await currentTx().execute<{
      id: string;
      status: OwnEntry['status'];
      work_date: string;
      minutes: number | null;
      description: string | null;
      window_open: boolean;
    }>(sql`
      SELECT id, status, work_date::text AS work_date, minutes, description,
             (logged_at IS NOT NULL AND logged_at + ${WINDOW} > now()) AS window_open
        FROM time_entry
       WHERE id = ${id}::uuid AND case_id = ${caseId}::uuid AND membership_id = ${membershipId}::uuid
       FOR UPDATE
    `);
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      status: row.status,
      workDate: row.work_date,
      minutes: row.minutes,
      description: row.description,
      windowOpen: row.window_open,
    };
  }

  async correct(id: string, after: Required<CorrectionInput>): Promise<void> {
    await currentTx().execute(sql`
      UPDATE time_entry
         SET work_date = ${after.workDate}::date, minutes = ${after.minutes}, description = ${after.description},
             updated_at = now()
       WHERE id = ${id}::uuid AND status = 'logged'
    `);
  }

  async void(id: string): Promise<void> {
    await currentTx().execute(sql`
      UPDATE time_entry SET status = 'voided', voided_at = now(), updated_at = now()
       WHERE id = ${id}::uuid AND status = 'logged'
    `);
  }
}
