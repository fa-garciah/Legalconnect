/**
 * 008 — a matter's activity, read from `audit_event` (Decision 2). No table of its own: the audit log
 * already records every mutation exactly once, so a second store could only drift from it.
 *
 * Runs under the request's RLS like every tenant read, so another firm's rows are invisible before
 * any predicate here applies.
 *
 * Which entries belong to a matter (FR-012), which actions count (FR-013) and what may be shown
 * (FR-014) are decided ONCE, in `activity-query.ts`, which 024's dashboard shares. This repository says
 * only: this matter, this month, at most 200.
 */
import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { currentTx } from '../../common/tenant/middleware';
import { activityRows } from './activity-query';

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
    const rows = await activityRows({
      matter: (matterId) => sql`${matterId} = ${caseId}::uuid`,
      from: sql`((${month} || '-01')::timestamp AT TIME ZONE ${ZONE})`,
      to: sql`(((${month} || '-01')::timestamp + interval '1 month') AT TIME ZONE ${ZONE})`,
      limit: ACTIVITY_LIMIT + 1,
    });
    // The matter is the URL's own; the per-matter feed does not repeat it on every entry.
    const items = rows.slice(0, ACTIVITY_LIMIT).map(({ case: _matter, ...entry }) => entry);
    return { items, truncated: rows.length > ACTIVITY_LIMIT };
  }
}
