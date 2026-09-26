/**
 * 015 — assembling the firm's figures. FR-005 … FR-011.
 *
 * WHERE THE HONESTY RULES LIVE. The repository returns raw aggregates, faithfully including the
 * nulls; this file decides what may be *reported*:
 *
 *   - a success rate below `MINIMUM_DECLARED_OUTCOMES` is withheld entirely (FR-009). "100%"
 *     from one matter is not a small sample, it is a misleading claim on a screen whose whole
 *     purpose is to be trusted;
 *   - a delta exists only when both sides do (FR-010). There is no percentage change from
 *     nothing, and `(x - 0) / 0` must never reach a browser;
 *   - every average carries the count it came from (Decision 8), so a reader can judge it
 *     rather than take it.
 */
import { Injectable } from '@nestjs/common';
import { ValidationFailed } from '../../common/http/errors';
import { KpiRepository, type AttorneyLoad, type Window } from './kpi.repository';
import { periodWindow, quarterStarts, type PeriodKind } from './period';

/**
 * FR-009's floor, and it is a judgement rather than a discovery: low enough that a small firm
 * sees a rate within a quarter or two, high enough that one matter cannot move it by a hundred
 * points. One constant to change if it proves wrong.
 */
export const MINIMUM_DECLARED_OUTCOMES = 5;

const QUARTERS_IN_TREND = 6;
const PERIOD_KINDS: readonly PeriodKind[] = ['month', 'quarter', 'year'];

export interface Figure {
  readonly value: number | null;
  readonly previous: number | null;
  /** Absent whenever either side is absent — never a change from nothing (FR-010). */
  readonly delta: number | null;
}

export interface SampledFigure extends Figure {
  readonly sampleSize: number;
}

export interface SuccessRateFigure extends SampledFigure {
  /** Closed matters in the period with no declaration — what makes a withheld rate legible. */
  readonly undeclared: number;
}

export interface KpiResponse {
  readonly period: {
    readonly kind: PeriodKind;
    readonly from: string;
    readonly to: string;
    readonly previousFrom: string;
    readonly previousTo: string;
  };
  readonly activeCases: Figure;
  readonly averageResolutionMonths: SampledFigure;
  readonly successRate: SuccessRateFigure;
  readonly casesPerAttorney: readonly AttorneyLoad[];
  readonly successRateByMatterType: readonly {
    readonly matterTypeId: string | null;
    readonly name: string | null;
    readonly rate: number | null;
    readonly sampleSize: number;
  }[];
  readonly resolutionTrend: readonly {
    readonly quarterStart: string;
    readonly averageMonths: number | null;
    readonly sampleSize: number;
  }[];
}

/**
 * A difference, or nothing at all.
 *
 * Expressed as a DIFFERENCE rather than a percentage change, deliberately: a percentage change
 * of a percentage ("the success rate rose 12%") is ambiguous between points and proportion, and
 * the screen renders the unit alongside it.
 */
function delta(value: number | null, previous: number | null): number | null {
  if (value === null || previous === null) return null;
  return value - previous;
}

@Injectable()
export class KpiService {
  constructor(private readonly kpis: KpiRepository) {}

  /** A silent default would report a figure for a window the caller did not ask for. */
  private periodKind(raw: unknown): PeriodKind {
    if (raw === undefined || raw === null) return 'quarter';
    if (typeof raw === 'string' && PERIOD_KINDS.includes(raw as PeriodKind)) return raw as PeriodKind;
    throw new ValidationFailed(`period must be one of: ${PERIOD_KINDS.join(', ')}.`);
  }

  private async successRate(window: Window): Promise<SuccessRateFigure & { declared: number }> {
    const outcomes = await this.kpis.outcomes(window);
    const enough = outcomes.declared >= MINIMUM_DECLARED_OUTCOMES;
    return {
      value: enough ? outcomes.successes / outcomes.declared : null,
      previous: null,
      delta: null,
      sampleSize: outcomes.declared,
      undeclared: outcomes.undeclared,
      declared: outcomes.declared,
    };
  }

  async summary(query: Record<string, unknown>): Promise<KpiResponse> {
    const kind = this.periodKind(query.period);
    const { current, previous } = periodWindow(kind);

    const [activeCases, resolution, previousResolution, currentRate, previousRate, load, byType, trend] =
      await Promise.all([
        this.kpis.activeCaseCount(),
        this.kpis.resolution(current),
        this.kpis.resolution(previous),
        this.successRate(current),
        this.successRate(previous),
        this.kpis.loadPerAttorney(),
        this.kpis.outcomesByMatterType(current),
        this.kpis.resolutionByQuarter(quarterStarts(new Date(), QUARTERS_IN_TREND)),
      ]);

    /*
     * `activeCases` is a point-in-time count, so it has no "previous period" value of its own —
     * the honest comparison would need a historical snapshot this product does not keep. It is
     * reported with `previous: 0` and no delta rather than with an invented one: the count of
     * matters open TODAY is not a fact about last quarter.
     */
    return {
      period: {
        kind,
        from: current.from,
        to: current.to,
        previousFrom: previous.from,
        previousTo: previous.to,
      },
      activeCases: { value: activeCases, previous: 0, delta: null },
      averageResolutionMonths: {
        value: resolution.averageMonths,
        previous: previousResolution.averageMonths,
        delta: delta(resolution.averageMonths, previousResolution.averageMonths),
        sampleSize: resolution.sampleSize,
      },
      successRate: {
        value: currentRate.value,
        previous: previousRate.value,
        delta: delta(currentRate.value, previousRate.value),
        sampleSize: currentRate.sampleSize,
        undeclared: currentRate.undeclared,
      },
      casesPerAttorney: load,
      successRateByMatterType: byType.map((group) => ({
        matterTypeId: group.matterTypeId,
        name: group.name,
        /*
         * FR-009a — NO FLOOR HERE, and the sample size always travels with the rate.
         *
         * The first version applied FR-009's floor of five per group, and measured against
         * `022`'s demo firm it made the chart useless: 19 closed matters across a firm's
         * practice areas leaves no single area at five, so every bar read "Datos
         * insuficientes". The two figures serve different purposes — the headline rate is the
         * one a partner quotes and one matter must not swing it; the breakdown exists to be
         * compared, and a comparison that carries its own sample sizes informs rather than
         * misleads. FR-009 was amended rather than the code quietly relaxed.
         */
        rate: group.declared > 0 ? group.successes / group.declared : null,
        sampleSize: group.declared,
      })),
      resolutionTrend: trend.map((quarter) => ({
        quarterStart: quarter.quarterStart,
        averageMonths: quarter.aggregate.averageMonths,
        sampleSize: quarter.aggregate.sampleSize,
      })),
    };
  }
}
