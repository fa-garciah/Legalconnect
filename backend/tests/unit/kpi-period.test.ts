/**
 * T006 — the periods every KPI is computed over. 015/FR-005, Decision 7.
 *
 * TWO THINGS RIDE ON THIS FILE and neither is obvious from a dashboard:
 *
 *   1. "vs. periodo anterior" has to mean exactly one thing. Three named windows — month,
 *      quarter, year — each compared with the immediately preceding window of the same length,
 *      so the delta is never ambiguous about what it is a delta from.
 *   2. The boundaries are MEXICO CITY's, not UTC's. `opened_on` and `closed_on` are `date`
 *      columns — calendar days — and a matter closed at 19:00 on 30 September is closed in
 *      September for every firm this product serves. Computing the window in UTC would file it
 *      in October, which `013` already ran into for its own day boundaries.
 */
import { describe, expect, it } from 'vitest';
import { periodWindow, quarterStarts, todayInMexicoCity } from '../../src/modules/kpi/period';

/** 18:30 in Mexico City on 30 September 2026 is 2026-10-01T00:30Z. */
const LATE_ON_QUARTER_END = new Date('2026-10-01T00:30:00Z');

describe('todayInMexicoCity', () => {
  it('reads the calendar day in Mexico City, not in UTC', () => {
    // The assertion the whole file exists for: UTC has already rolled over, Mexico City has not.
    expect(todayInMexicoCity(LATE_ON_QUARTER_END)).toBe('2026-09-30');
  });

  it('agrees with UTC in the middle of the day', () => {
    expect(todayInMexicoCity(new Date('2026-09-25T18:00:00Z'))).toBe('2026-09-25');
  });
});

describe('periodWindow — month', () => {
  const { current, previous } = periodWindow('month', new Date('2026-09-25T18:00:00Z'));

  it('spans the calendar month containing the day', () => {
    expect(current).toEqual({ from: '2026-09-01', to: '2026-09-30' });
  });

  it('compares with the whole preceding month', () => {
    expect(previous).toEqual({ from: '2026-08-01', to: '2026-08-31' });
  });

  it('handles a February in a non-leap year', () => {
    expect(periodWindow('month', new Date('2026-03-15T18:00:00Z')).previous).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    });
  });

  it('crosses a year boundary backwards', () => {
    expect(periodWindow('month', new Date('2026-01-10T18:00:00Z')).previous).toEqual({
      from: '2025-12-01',
      to: '2025-12-31',
    });
  });
});

describe('periodWindow — quarter', () => {
  it('spans the calendar quarter containing the day', () => {
    const { current, previous } = periodWindow('quarter', new Date('2026-09-25T18:00:00Z'));
    expect(current).toEqual({ from: '2026-07-01', to: '2026-09-30' });
    expect(previous).toEqual({ from: '2026-04-01', to: '2026-06-30' });
  });

  it('puts a late evening on the last day of the quarter in THAT quarter', () => {
    const { current } = periodWindow('quarter', LATE_ON_QUARTER_END);
    expect(current).toEqual({ from: '2026-07-01', to: '2026-09-30' });
  });

  it('crosses a year boundary backwards', () => {
    const { previous } = periodWindow('quarter', new Date('2026-02-10T18:00:00Z'));
    expect(previous).toEqual({ from: '2025-10-01', to: '2025-12-31' });
  });
});

describe('periodWindow — year', () => {
  it('spans the calendar year and compares with the last', () => {
    const { current, previous } = periodWindow('year', new Date('2026-09-25T18:00:00Z'));
    expect(current).toEqual({ from: '2026-01-01', to: '2026-12-31' });
    expect(previous).toEqual({ from: '2025-01-01', to: '2025-12-31' });
  });
});

describe('quarterStarts', () => {
  it('returns six quarter starts, oldest first, ending with the current one', () => {
    // Calendar quarters begin in January, April, July and October — so the six ending with
    // Q3 2026 start in April 2025. (The first version of this expectation listed months two
    // apart, which are not quarter starts at all; the code was right.)
    const starts = quarterStarts(new Date('2026-09-25T18:00:00Z'), 6);
    expect(starts).toEqual([
      '2025-04-01',
      '2025-07-01',
      '2025-10-01',
      '2026-01-01',
      '2026-04-01',
      '2026-07-01',
    ]);
  });

  it('uses the Mexico City day for the current quarter, not the UTC one', () => {
    const starts = quarterStarts(LATE_ON_QUARTER_END, 1);
    expect(starts).toEqual(['2026-07-01']);
  });
});

describe('every window is a closed calendar range', () => {
  it('never produces a `to` before its `from`', () => {
    for (const kind of ['month', 'quarter', 'year'] as const) {
      for (const day of ['2026-01-01', '2026-02-28', '2026-06-30', '2026-12-31']) {
        const { current, previous } = periodWindow(kind, new Date(`${day}T18:00:00Z`));
        expect(current.from <= current.to, `${kind} ${day}`).toBe(true);
        expect(previous.from <= previous.to, `${kind} ${day}`).toBe(true);
        // And the previous window ends strictly before the current one begins.
        expect(previous.to < current.from, `${kind} ${day}`).toBe(true);
      }
    }
  });
});
