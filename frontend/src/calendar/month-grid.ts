/**
 * 013 T011. The month grid's arithmetic, in Mexico City days (FR-010).
 *
 * Dates are `YYYY-MM-DD` strings throughout and are shifted with UTC arithmetic, so no browser
 * zone ever enters: an all-day deadline on 30 September is on 30 September (SC-005). Instants are
 * read into a Mexico City date with `Intl` — never with `Date#getDate()`, which is the browser's.
 */
import type { CalendarEvent } from './types';

const MEXICO_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Mexico_City',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export interface YearMonth {
  readonly year: number;
  /** 1–12. */
  readonly month: number;
}

export interface GridDay {
  readonly date: string;
  readonly inMonth: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');

function toDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
}

function fromDate(value: Date): string {
  return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
}

export function addDays(date: string, days: number): string {
  const value = toDate(date);
  value.setUTCDate(value.getUTCDate() + days);
  return fromDate(value);
}

/** The Mexico City calendar date of an instant. */
export function mexicoDate(instant: string | Date): string {
  return MEXICO_DATE.format(typeof instant === 'string' ? new Date(instant) : instant);
}

export function todayInMexico(): string {
  return mexicoDate(new Date());
}

export function shiftMonth(current: YearMonth, delta: number): YearMonth {
  const index = current.year * 12 + (current.month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** Monday-first weeks covering the whole month (5 or 6 rows). */
export function gridDays(year: number, month: number): GridDay[] {
  const first = `${year}-${pad(month)}-01`;
  const last = addDays(fromDate(new Date(Date.UTC(year, month, 1))), -1);
  const mondayOffset = (toDate(first).getUTCDay() + 6) % 7;
  const start = addDays(first, -mondayOffset);
  const sundayOffset = (7 - toDate(last).getUTCDay()) % 7;
  const end = addDays(last, sundayOffset);

  const days: GridDay[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) {
    days.push({ date, inMonth: date.slice(0, 7) === first.slice(0, 7) });
  }
  return days;
}

/** The API range `[from, to)` for everything the grid shows, padding included (≤ 42 days). */
export function gridRange(year: number, month: number): { from: string; to: string } {
  const days = gridDays(year, month);
  return { from: days[0]!.date, to: addDays(days.at(-1)!.date, 1) };
}

/** Every Mexico City date an event touches. */
export function eventDays(event: CalendarEvent): string[] {
  const start = event.allDay ? event.startsOn! : mexicoDate(event.startsAt!);
  const end = event.allDay ? (event.endsOn ?? start) : mexicoDate(event.endsAt ?? event.startsAt!);
  const days: string[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) days.push(date);
  return days;
}

/** Sort key: all-day first on a day, then timed events by their start. */
function order(event: CalendarEvent): string {
  return event.allDay ? `0 ${event.startsOn}` : `1 ${event.startsAt}`;
}

export function eventsByDay(events: readonly CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const event of [...events].sort((a, b) => order(a).localeCompare(order(b)))) {
    for (const date of eventDays(event)) {
      const list = map.get(date) ?? [];
      list.push(event);
      map.set(date, list);
    }
  }
  return map;
}
