/**
 * 009. How a duration reads on screen. The server stores and sums integer minutes (FR-003, FR-010);
 * this file only turns them into "1 h 30 min" and back, and every branch is asserted by
 * `tests/unit/time/duration.test.ts` (FR-020).
 */

/** "45 min", "1 h", "1 h 30 min". */
export function formatMinutes(total: number): string {
  const { hours, minutes } = splitMinutes(total);
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${minutes} min`;
}

export function splitMinutes(total: number): { hours: number; minutes: number } {
  return { hours: Math.floor(total / 60), minutes: total % 60 };
}

const WHOLE = /^\d+$/;

/** Hours and minutes as typed into two boxes → minutes. Blank is zero; anything else not whole is NaN. */
export function toMinutes(hours: number | string, minutes: number | string): number {
  const parse = (value: number | string): number => {
    if (typeof value === 'number') return value;
    const trimmed = value.trim();
    if (trimmed === '') return 0;
    return WHOLE.test(trimmed) ? Number(trimmed) : Number.NaN;
  };
  return parse(hours) * 60 + parse(minutes);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "01:02:03" from a timer's start to `now`. Never negative, whatever the browser's clock says. */
export function elapsedClock(startedAt: string, now: number): string {
  const seconds = Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000));
  return `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`;
}
