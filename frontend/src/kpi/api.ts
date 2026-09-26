/**
 * 015 — `GET /tenant/kpis`. FR-005.
 *
 * Every numeric field here is `number | null`, and that is the contract rather than defensive
 * typing: the endpoint sends `null` wherever it has no answer, and the screen renders the
 * absence. A type of `number` would invite a `?? 0` at the first compile error and turn "no
 * matter closed that quarter" into "resolved instantly".
 */
import { apiFetch, type ApiResult, type FailedResponse } from '@/lib/api-client';

export type PeriodKind = 'month' | 'quarter' | 'year';

export interface KpiFigure {
  readonly value: number | null;
  readonly previous: number | null;
  /** Absent whenever either side is (FR-010) — never a change from nothing. */
  readonly delta: number | null;
}

export interface KpiSampledFigure extends KpiFigure {
  readonly sampleSize: number;
}

export interface KpiSuccessRate extends KpiSampledFigure {
  /** Closed matters in the period with no declared outcome — what makes a withheld rate legible. */
  readonly undeclared: number;
}

export interface AttorneyLoad {
  /** `null` is the explicit "nobody leads this" group (FR-006). */
  readonly membershipId: string | null;
  /** The firm's own position, never an email — no personal data in an aggregate (Decision 10). */
  readonly position: string | null;
  readonly activeCases: number;
}

export interface MatterTypeRate {
  /** `null` is the explicit "untyped" group (FR-007). */
  readonly matterTypeId: string | null;
  readonly name: string | null;
  readonly rate: number | null;
  readonly sampleSize: number;
}

export interface QuarterPoint {
  readonly quarterStart: string;
  /** `null` for a quarter in which nothing closed — a gap, never a zero (FR-008). */
  readonly averageMonths: number | null;
  readonly sampleSize: number;
}

export interface KpiResponse {
  readonly period: {
    readonly kind: PeriodKind;
    readonly from: string;
    readonly to: string;
    readonly previousFrom: string;
    readonly previousTo: string;
  };
  readonly activeCases: KpiFigure;
  readonly averageResolutionMonths: KpiSampledFigure;
  readonly successRate: KpiSuccessRate;
  readonly casesPerAttorney: readonly AttorneyLoad[];
  readonly successRateByMatterType: readonly MatterTypeRate[];
  readonly resolutionTrend: readonly QuarterPoint[];
}

async function unwrap<T>(result: ApiResult<T>): Promise<T> {
  if (result.ok) return result.data;
  if (result.status === null || result.body === null) return Promise.reject(null);
  const failed: FailedResponse = { status: result.status, body: result.body };
  return Promise.reject(failed);
}

export function readKpis(period: PeriodKind): Promise<KpiResponse> {
  return apiFetch<KpiResponse>(`/tenant/kpis?period=${period}`).then(unwrap);
}
