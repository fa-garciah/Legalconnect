/**
 * 009 T002 — FR-007, FR-010, FR-020. The only arithmetic this slice performs, and the constitution's
 * "fee and billable-hour calculation" entry: held to 100% coverage in `vitest.config.ts`.
 */
import { describe, expect, it } from 'vitest';
import { dayTotals, exceedsDay, minutesFromElapsed, sumMinutes } from '../../src/modules/time-entries/duration';

describe('minutesFromElapsed (Decision 6: nearest whole minute, never fewer than one)', () => {
  it.each([
    [0, 1],
    [29, 1],
    [89, 1],
    [90, 2],
    [149, 2],
    [150, 3],
    [3_600, 60],
    [86_400, 1440],
  ])('%i s → %i min', (seconds, minutes) => {
    expect(minutesFromElapsed(seconds)).toBe(minutes);
  });

  it('a negative interval (clock skew) still records one minute, never zero or less', () => {
    expect(minutesFromElapsed(-5)).toBe(1);
  });

  it('refuses a value that is not a finite number rather than inventing one', () => {
    expect(() => minutesFromElapsed(Number.NaN)).toThrow();
    expect(() => minutesFromElapsed(Number.POSITIVE_INFINITY)).toThrow();
  });
});

describe('exceedsDay (FR-007)', () => {
  it('exactly 24 h is still a stoppable timer', () => {
    expect(exceedsDay(86_400)).toBe(false);
  });

  it('a timer that would record more than 1440 minutes is too long', () => {
    expect(exceedsDay(86_400 + 31)).toBe(true);
  });

  it('a timer that rounds down to 1440 is not too long', () => {
    expect(exceedsDay(86_400 + 29)).toBe(false);
  });
});

describe('totals (FR-010 — computed from exactly the listed rows)', () => {
  const rows = [
    { workDate: '2026-10-07', minutes: 30 },
    { workDate: '2026-10-08', minutes: 90 },
    { workDate: '2026-10-07', minutes: 45 },
    { workDate: '2026-10-05', minutes: 1 },
  ];

  it('sums minutes exactly', () => {
    expect(sumMinutes(rows)).toBe(166);
    expect(sumMinutes([])).toBe(0);
  });

  it('groups by day, newest first, listing only days that have entries', () => {
    expect(dayTotals(rows)).toEqual([
      { date: '2026-10-08', minutes: 90 },
      { date: '2026-10-07', minutes: 75 },
      { date: '2026-10-05', minutes: 1 },
    ]);
    expect(dayTotals([])).toEqual([]);
  });

  it('the day totals always add up to the range total', () => {
    expect(dayTotals(rows).reduce((sum, d) => sum + d.minutes, 0)).toBe(sumMinutes(rows));
  });
});
