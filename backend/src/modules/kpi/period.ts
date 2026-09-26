/**
 * T007 — the windows every KPI is computed over. 015/FR-005, Decision 7.
 *
 * CALENDAR DATES, NOT INSTANTS, throughout. `case_file.opened_on` and `closed_on` are `date`
 * columns, so every boundary here is a `YYYY-MM-DD` string and no timestamp arithmetic is
 * involved at all. That removes a whole class of off-by-a-timezone error rather than defending
 * against it.
 *
 * THE ONE PLACE A TIME ZONE MATTERS is deciding which calendar day "now" is. In Mexico City that
 * differs from UTC for six hours of every day, and a matter closed at 19:00 on 30 September must
 * be closed in September — `013` hit the same boundary for its own day arithmetic
 * (`calendar.repository.ts:122-123`). `todayInMexicoCity` is the only function here that reads a
 * clock; everything else is string and integer arithmetic on the result.
 *
 * THREE NAMED PERIODS, NOT A RANGE. A range picker makes "vs. periodo anterior" ambiguous —
 * compared with what? — and `US07-EP06-KPI-FilterKPIsByDateRange` is a separate IT2 story.
 */

export type PeriodKind = 'month' | 'quarter' | 'year';

export interface PeriodWindow {
  /** Inclusive, `YYYY-MM-DD`. */
  readonly from: string;
  /** Inclusive, `YYYY-MM-DD`. */
  readonly to: string;
}

export interface PeriodPair {
  readonly current: PeriodWindow;
  /** The immediately preceding window of the same length — never overlapping `current`. */
  readonly previous: PeriodWindow;
}

const ZONE = 'America/Mexico_City';

/**
 * The calendar day in Mexico City. `en-CA` because it formats as `YYYY-MM-DD`, which is the
 * shape every date column and every comparison here uses.
 */
export function todayInMexicoCity(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

const pad = (value: number): string => String(value).padStart(2, '0');
const iso = (year: number, month: number, day: number): string =>
  `${year}-${pad(month)}-${pad(day)}`;

/** The last day of a month, without constructing a Date in any particular zone. */
function lastDayOfMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of this one, and `Date.UTC` keeps it zone-free.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function monthWindow(year: number, month: number): PeriodWindow {
  return { from: iso(year, month, 1), to: iso(year, month, lastDayOfMonth(year, month)) };
}

/** Shifts a (year, month) pair by whole months, carrying across years. */
function shiftMonth(year: number, month: number, by: number): { year: number; month: number } {
  const zeroBased = year * 12 + (month - 1) + by;
  return { year: Math.floor(zeroBased / 12), month: (zeroBased % 12) + 1 };
}

export function periodWindow(kind: PeriodKind, now: Date = new Date()): PeriodPair {
  const [year, month] = todayInMexicoCity(now).split('-').map(Number) as [number, number, number];

  if (kind === 'month') {
    const back = shiftMonth(year, month, -1);
    return { current: monthWindow(year, month), previous: monthWindow(back.year, back.month) };
  }

  if (kind === 'quarter') {
    const quarterStartMonth = Math.floor((month - 1) / 3) * 3 + 1;
    const current = {
      from: iso(year, quarterStartMonth, 1),
      to: iso(year, quarterStartMonth + 2, lastDayOfMonth(year, quarterStartMonth + 2)),
    };
    const back = shiftMonth(year, quarterStartMonth, -3);
    return {
      current,
      previous: {
        from: iso(back.year, back.month, 1),
        to: iso(back.year, back.month + 2, lastDayOfMonth(back.year, back.month + 2)),
      },
    };
  }

  return {
    current: { from: iso(year, 1, 1), to: iso(year, 12, 31) },
    previous: { from: iso(year - 1, 1, 1), to: iso(year - 1, 12, 31) },
  };
}

/**
 * The first day of each of the last `count` quarters, oldest first, the last of which contains
 * today in Mexico City. The x-axis of the resolution trend.
 */
export function quarterStarts(now: Date = new Date(), count = 6): readonly string[] {
  const [year, month] = todayInMexicoCity(now).split('-').map(Number) as [number, number, number];
  const currentQuarterStartMonth = Math.floor((month - 1) / 3) * 3 + 1;

  const out: string[] = [];
  for (let back = count - 1; back >= 0; back -= 1) {
    const shifted = shiftMonth(year, currentQuarterStartMonth, -3 * back);
    out.push(iso(shifted.year, shifted.month, 1));
  }
  return out;
}
