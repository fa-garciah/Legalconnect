/**
 * 009. The timesheet's ranges, as Mexico City calendar dates `[from, to)` — the end exclusive, as the
 * API reads it (contracts/time-entries-api.md §1). Pure date arithmetic on `YYYY-MM-DD` strings in
 * UTC, so the browser's own zone can never move a day.
 */
export interface DateRange {
  readonly from: string;
  readonly to: string;
}

export type RangePreset = 'this-week' | 'last-week' | 'this-month';

export const MAX_RANGE_DAYS = 62;

const toDate = (day: string) => new Date(`${day}T00:00:00Z`);
const fromDate = (date: Date) => date.toISOString().slice(0, 10);

export function addDays(day: string, days: number): string {
  const date = toDate(day);
  date.setUTCDate(date.getUTCDate() + days);
  return fromDate(date);
}

/** Weeks start on Monday, as `013`'s month grid does. */
export function presetRange(preset: RangePreset, today: string): DateRange {
  if (preset === 'this-month') {
    const date = toDate(today);
    return {
      from: fromDate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))),
      to: fromDate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1))),
    };
  }
  const monday = addDays(today, -((toDate(today).getUTCDay() + 6) % 7));
  const from = preset === 'this-week' ? monday : addDays(monday, -7);
  return { from, to: addDays(from, 7) };
}

export function rangeDays(range: DateRange): number {
  return Math.round((toDate(range.to).getTime() - toDate(range.from).getTime()) / 86_400_000);
}

/** Why a custom range would be refused, in Spanish — or null when it is fine. */
export function rangeError(range: DateRange): string | null {
  if (!range.from || !range.to) return 'Elige ambas fechas.';
  const days = rangeDays(range);
  if (days <= 0) return 'La fecha final debe ser posterior a la inicial.';
  if (days > MAX_RANGE_DAYS) return `El periodo no puede pasar de ${MAX_RANGE_DAYS} días.`;
  return null;
}
