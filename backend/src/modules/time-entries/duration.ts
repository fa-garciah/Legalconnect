/**
 * 009 T005 — FR-007, FR-010, FR-020. The only arithmetic in the slice, and the constitution's
 * "fee and billable-hour calculation" entry: `vitest.config.ts` holds THIS FILE to 100% coverage,
 * blocking, the way 006 scoped its threshold to the resolver file rather than a whole module.
 *
 * Pure on purpose — no clock, no database. The service reads the elapsed interval from the
 * request transaction's own `now()` and hands it here as a number, so what is tested is exactly
 * what runs.
 */

/** The longest entry the column admits (`time_entry_minutes_bounds`), and the longest timer. */
export const MAX_ENTRY_MINUTES = 1440;

/**
 * Decision 6: the elapsed time rounded to the nearest whole minute, never fewer than one.
 *
 * Truncating would turn a 50-second timer into a zero-minute entry the column refuses; always
 * rounding up would add half a minute to every entry in the firm's favour. Nearest is neutral, and
 * the floor exists only so a stopped timer never silently records nothing. A negative interval —
 * clock skew between the instant a timer started and now — is clamped by the same floor.
 */
export function minutesFromElapsed(elapsedSeconds: number): number {
  if (!Number.isFinite(elapsedSeconds)) {
    throw new RangeError('elapsed time must be a finite number of seconds');
  }
  return Math.max(1, Math.round(elapsedSeconds / 60));
}

/** FR-007: a timer whose recorded minutes would exceed one day cannot be stopped. */
export function exceedsDay(elapsedSeconds: number): boolean {
  return minutesFromElapsed(elapsedSeconds) > MAX_ENTRY_MINUTES;
}

export interface MinutesOnDay {
  readonly workDate: string;
  readonly minutes: number;
}

/** FR-010: the range total, from exactly the rows listed. Integers, so the sum is exact. */
export function sumMinutes(rows: readonly MinutesOnDay[]): number {
  return rows.reduce((total, row) => total + row.minutes, 0);
}

/**
 * FR-010: one total per day that has entries, newest day first — so the day totals always add up to
 * `sumMinutes` of the same rows, which `time-entries-timesheet.test.ts` asserts for every range.
 */
export function dayTotals(rows: readonly MinutesOnDay[]): { date: string; minutes: number }[] {
  const byDay = new Map<string, number>();
  for (const row of rows) byDay.set(row.workDate, (byDay.get(row.workDate) ?? 0) + row.minutes);
  // Map keys are unique, so two days never compare equal — no third branch to write or to test.
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([date, minutes]) => ({ date, minutes }));
}
