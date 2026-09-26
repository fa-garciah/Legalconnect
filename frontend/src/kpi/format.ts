/**
 * T014 — how a figure reaches the screen. 015/FR-008, FR-010, Decision 8.
 *
 * ONE RULE: absence is rendered as absence. The endpoint is careful to send `null` where it has
 * no answer — a quarter in which nothing closed, a rate below the reporting floor, a delta with
 * nothing to compare against — and the whole value of that care is lost if a formatter turns it
 * into `0`. `formatMonths(null)` is "Sin datos", never "0.0 m".
 */

/** A month is 30.44 days on the server; here it is only ever displayed. */
export function formatMonths(value: number | null): string {
  if (value === null) return 'Sin datos';
  return `${value.toFixed(1)} m`;
}

export function formatPercent(value: number | null): string {
  if (value === null) return 'Sin datos';
  return `${Math.round(value * 100)} %`;
}

/**
 * A count of zero is DATA — a firm with no active matters — while `null` is the absence of an
 * answer. Conflating them is how a dashboard reports a firm as empty when it simply did not ask.
 */
export function formatCount(value: number | null): string {
  if (value === null) return 'Sin datos';
  return String(value);
}

export type DeltaUnit = 'months' | 'percent' | 'count';

/**
 * A signed change, or an empty string when there is nothing to compare against (FR-010).
 *
 * A percentage figure's change is rendered in POINTS (`pp`): "la tasa subió 12 %" is ambiguous
 * between twelve points and a twelfth of the previous value, and a dashboard cannot afford the
 * ambiguity on the one number people quote.
 *
 * The minus is U+2212, not a hyphen — it aligns with the digits in a tabular column, which is
 * where these live.
 */
export function formatDelta(value: number | null, unit: DeltaUnit): string {
  if (value === null) return '';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  const magnitude = Math.abs(value);
  if (unit === 'months') return `${sign}${magnitude.toFixed(1)} m`;
  if (unit === 'percent') return `${sign}${Math.round(magnitude * 100)} pp`;
  return `${sign}${Math.round(magnitude)}`;
}

/** Decision 8 — every average is reported with the count it came from, so it can be weighed. */
export function formatSample(sampleSize: number): string {
  if (sampleSize === 0) return 'Sin asuntos en el periodo';
  return sampleSize === 1 ? '1 asunto' : `${sampleSize} asuntos`;
}
