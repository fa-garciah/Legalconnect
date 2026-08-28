/**
 * T018 — rendering a calendar day, research D5.
 *
 * **The string is split, never parsed.** `new Date('2026-03-04')` is UTC midnight, and in
 * Mexico City that renders as 3 March — every opening date in the register a day early, for
 * every user west of Greenwich and for none east of it. `006` stores these columns as `date`
 * rather than `timestamptz` because they are days rather than instants, and promoting them
 * to instants on the way to the screen is the whole of the bug.
 *
 * `tests/unit/case-date.test.ts` pins the timezone to `America/Mexico_City` so the defect
 * cannot pass unnoticed on a machine set to UTC.
 */

/** `YYYY-MM-DD`, and nothing looser. Anything else is returned untouched. */
const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** What an absent value renders as, so "no closing date" is visibly not a rendering fault. */
const ABSENT = '—';

/**
 * A calendar day as a Mexican firm reads it: `04/03/2026`.
 *
 * Absent renders as a dash. A value this does not recognise is returned **unchanged** rather
 * than coerced — if `006` ever sends something unexpected, showing it verbatim is more honest
 * than inventing a plausible date nobody would think to question.
 */
export function formatCalendarDate(value: string | null | undefined): string {
  if (!value) return ABSENT;

  const match = CALENDAR_DATE.exec(value);
  if (!match) return value;

  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}
