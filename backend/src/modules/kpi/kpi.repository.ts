/**
 * 015 — the firm's aggregates. FR-003 … FR-009.
 *
 * ONE RULE GOVERNS EVERY QUERY HERE: a figure is either right or absent. `avg` over an empty
 * set is `NULL` in Postgres, and that `NULL` travels all the way to the screen — a `?? 0`
 * anywhere on this path would turn "no matter closed that quarter" into "matters resolved
 * instantly", which is the single most misleading thing a dashboard can say.
 *
 * "CLOSED" IS ALWAYS `case_status.is_closing`, never a status name and never `closed_on` alone.
 * A firm names its own statuses (`006`/FR-019), may mark several closing or none, and the
 * product holds no opinion about the words. `kpis.test.ts` renames its closing status away from
 * the default precisely so a name match would fail.
 *
 * NO `tenant_id` PREDICATE, as everywhere else: RLS scopes these rows, and adding one by hand
 * would be the application-layer filtering Principle II forbids.
 *
 * 30.44 DAYS PER MONTH. Resolution time is reported in months because that is how a firm talks
 * about a matter's life, and 365.25/12 is the only honest constant for it — 30 would inflate
 * every figure by 1.5%.
 */
import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { currentTx } from '../../common/tenant/middleware';

/** 365.25 / 12 — see the header. */
const DAYS_PER_MONTH = 30.44;

export interface Window {
  readonly from: string;
  readonly to: string;
}

export interface ResolutionAggregate {
  readonly averageMonths: number | null;
  readonly sampleSize: number;
}

export interface OutcomeAggregate {
  /** Successes over declarations, or `null` when there are too few to report (FR-009). */
  readonly successes: number;
  readonly declared: number;
  readonly undeclared: number;
}

export interface AttorneyLoad {
  /** `null` is the explicit "no live lead" group — never a dropped row (FR-006). */
  readonly membershipId: string | null;
  readonly position: string | null;
  readonly activeCases: number;
}

export interface MatterTypeOutcome {
  /** `null` is the explicit "untyped" group (FR-007). */
  readonly matterTypeId: string | null;
  readonly name: string | null;
  readonly successes: number;
  readonly declared: number;
}

@Injectable()
export class KpiRepository {
  /** Matters whose current status does not close them. Point-in-time, not period-bound. */
  async activeCaseCount(): Promise<number> {
    const { rows } = await currentTx().execute<{ n: string }>(sql`
      SELECT count(*)::text AS n
        FROM case_file cf
        JOIN case_status cs ON cs.id = cf.case_status_id
       WHERE NOT cs.is_closing
    `);
    return Number(rows[0]?.n ?? '0');
  }

  /**
   * Matters CLOSED inside the window, and how long they took.
   *
   * `closed_on >= opened_on` excludes imported data that cannot be true rather than letting it
   * drag the mean negative (spec Edge Cases). Such rows are counted nowhere, which is honest:
   * their duration is unknown, not zero.
   */
  async resolution(window: Window): Promise<ResolutionAggregate> {
    const { rows } = await currentTx().execute<{ avg_days: string | null; n: string }>(sql`
      SELECT avg(cf.closed_on - cf.opened_on)::text AS avg_days,
             count(*)::text AS n
        FROM case_file cf
       WHERE cf.closed_on IS NOT NULL
         AND cf.closed_on >= cf.opened_on
         AND cf.closed_on BETWEEN ${window.from}::date AND ${window.to}::date
    `);
    const averageDays = rows[0]?.avg_days;
    return {
      // NULL in, null out. Deliberately not coalesced — see the header.
      averageMonths: averageDays === null || averageDays === undefined ? null : Number(averageDays) / DAYS_PER_MONTH,
      sampleSize: Number(rows[0]?.n ?? '0'),
    };
  }

  /**
   * Declared outcomes of matters closed inside the window.
   *
   * `favorable` and `convenio` are the successes: a negotiated settlement resolves a matter in
   * the client's interest, and a firm that settles well would otherwise appear to be losing.
   * Stated in `case.repository.ts`'s `CASE_OUTCOMES` comment as well, because it is a judgement
   * rather than a fact.
   */
  async outcomes(window: Window): Promise<OutcomeAggregate> {
    const { rows } = await currentTx().execute<{
      successes: string;
      declared: string;
      undeclared: string;
    }>(sql`
      SELECT count(*) FILTER (WHERE cf.outcome IN ('favorable', 'convenio'))::text AS successes,
             count(*) FILTER (WHERE cf.outcome IS NOT NULL)::text AS declared,
             count(*) FILTER (WHERE cf.outcome IS NULL)::text AS undeclared
        FROM case_file cf
       WHERE cf.closed_on BETWEEN ${window.from}::date AND ${window.to}::date
    `);
    return {
      successes: Number(rows[0]?.successes ?? '0'),
      declared: Number(rows[0]?.declared ?? '0'),
      undeclared: Number(rows[0]?.undeclared ?? '0'),
    };
  }

  /**
   * Active matters per live `lead`, with a `null` group for matters nobody leads.
   *
   * `LEFT JOIN` onto the live assignment rather than an inner one: an inner join would silently
   * drop exactly the matters a case manager opens this chart to find (FR-006).
   *
   * The label is the person's POSITION, never their email (spec Decision 10). No slice stores a
   * name, and an email is personal data reachable only under `membership.read_tenant` — which a
   * `CM` holding `kpi.read` does not have. An aggregate carries no personal data at all.
   */
  async loadPerAttorney(): Promise<readonly AttorneyLoad[]> {
    const { rows } = await currentTx().execute<{
      membership_id: string | null;
      position: string | null;
      n: string;
    }>(sql`
      SELECT a.membership_id,
             p.name AS position,
             count(*)::text AS n
        FROM case_file cf
        JOIN case_status cs ON cs.id = cf.case_status_id
        LEFT JOIN case_assignment a
               ON a.case_id = cf.id AND a.role_on_case = 'lead' AND a.unassigned_at IS NULL
        LEFT JOIN directory_entry d ON d.membership_id = a.membership_id
        LEFT JOIN position p ON p.id = d.position_id
       WHERE NOT cs.is_closing
       GROUP BY a.membership_id, p.name
       ORDER BY count(*) DESC, a.membership_id NULLS LAST
    `);
    return rows.map((row) => ({
      membershipId: row.membership_id,
      position: row.position,
      activeCases: Number(row.n),
    }));
  }

  /** Declared outcomes grouped by matter type, with a `null` group for untyped (FR-007). */
  async outcomesByMatterType(window: Window): Promise<readonly MatterTypeOutcome[]> {
    const { rows } = await currentTx().execute<{
      matter_type_id: string | null;
      name: string | null;
      successes: string;
      declared: string;
    }>(sql`
      SELECT cf.matter_type_id,
             mt.name,
             count(*) FILTER (WHERE cf.outcome IN ('favorable', 'convenio'))::text AS successes,
             count(*) FILTER (WHERE cf.outcome IS NOT NULL)::text AS declared
        FROM case_file cf
        LEFT JOIN matter_type mt ON mt.id = cf.matter_type_id
       WHERE cf.closed_on BETWEEN ${window.from}::date AND ${window.to}::date
       GROUP BY cf.matter_type_id, mt.name
       ORDER BY count(*) DESC, mt.name NULLS LAST
    `);
    return rows.map((row) => ({
      matterTypeId: row.matter_type_id,
      name: row.name,
      successes: Number(row.successes),
      declared: Number(row.declared),
    }));
  }

  /**
   * Average resolution per quarter, for the quarters given.
   *
   * One query per quarter rather than a `date_trunc` group-by, deliberately: a group-by returns
   * no row at all for a quarter in which nothing closed, and the caller would have to
   * reconstruct the gap — which is exactly where a `0` creeps in. Asking per quarter makes the
   * absence explicit at the point it is discovered. Six small aggregates over a few thousand
   * rows is not a performance question at this scale.
   */
  async resolutionByQuarter(
    quarterStarts: readonly string[],
  ): Promise<readonly { readonly quarterStart: string; readonly aggregate: ResolutionAggregate }[]> {
    const out: { quarterStart: string; aggregate: ResolutionAggregate }[] = [];
    for (const start of quarterStarts) {
      const { rows } = await currentTx().execute<{ avg_days: string | null; n: string }>(sql`
        SELECT avg(cf.closed_on - cf.opened_on)::text AS avg_days, count(*)::text AS n
          FROM case_file cf
         WHERE cf.closed_on IS NOT NULL
           AND cf.closed_on >= cf.opened_on
           AND cf.closed_on >= ${start}::date
           AND cf.closed_on < (${start}::date + interval '3 months')
      `);
      const averageDays = rows[0]?.avg_days;
      out.push({
        quarterStart: start,
        aggregate: {
          averageMonths:
            averageDays === null || averageDays === undefined ? null : Number(averageDays) / DAYS_PER_MONTH,
          sampleSize: Number(rows[0]?.n ?? '0'),
        },
      });
    }
    return out;
  }
}
