/**
 * T017 — research D5. A calendar day is not an instant, and treating it as one is a real
 * defect that hides from the person most likely to write it.
 *
 * `new Date('2026-03-04')` is parsed as **UTC midnight**. Rendered through
 * `toLocaleDateString` in Mexico City, that is **3 March**. Every opening date in the case
 * register would be a day early — and only for users west of Greenwich, so it looks correct
 * on a European developer's screen and wrong on every real one.
 *
 * **This suite pins the timezone to `America/Mexico_City` on purpose.** Run in UTC, a
 * `Date`-based implementation passes and the bug ships. The test is only worth writing if it
 * runs where the bug lives.
 *
 * `006` stores these columns as `date` rather than `timestamptz` precisely because they are
 * days. The frontend must not promote them.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { formatCalendarDate } from '@/cases/format';

const ORIGINAL_TZ = process.env.TZ;

describe('formatCalendarDate, in the timezone the product actually runs in', () => {
  beforeAll(() => {
    process.env.TZ = 'America/Mexico_City';
  });

  afterAll(() => {
    process.env.TZ = ORIGINAL_TZ;
  });

  it('renders a date as the day it says, not the day before', () => {
    // The assertion the whole file exists for. A `Date`-based implementation returns
    // 03/03/2026 here.
    expect(formatCalendarDate('2026-03-04')).toBe('04/03/2026');
  });

  it('holds at the start of a month, where an off-by-one crosses into the previous one', () => {
    expect(formatCalendarDate('2026-03-01')).toBe('01/03/2026');
  });

  it('holds on the first of January, where an off-by-one crosses into the previous year', () => {
    // The worst version of the bug: a matter opened 1 January 2026 filed under 2025.
    expect(formatCalendarDate('2026-01-01')).toBe('01/01/2026');
  });

  it('holds on a leap day', () => {
    expect(formatCalendarDate('2024-02-29')).toBe('29/02/2024');
  });

  it('pads single digits, so the column aligns', () => {
    expect(formatCalendarDate('2026-07-09')).toBe('09/07/2026');
  });
});

describe('what it does with values it should not receive', () => {
  it('renders an absent date as a dash rather than as empty', () => {
    // `closedOn` is null for every open matter. A blank cell reads as a rendering fault;
    // a dash reads as a fact about the record (FR-004).
    expect(formatCalendarDate(null)).toBe('—');
    expect(formatCalendarDate(undefined)).toBe('—');
  });

  it('returns a malformed value unchanged rather than inventing a date', () => {
    /*
     * If `006` ever sends something this does not recognise, showing it verbatim is more
     * honest than guessing. A formatter that silently coerced would turn a contract
     * violation into a plausible-looking date nobody would question.
     */
    expect(formatCalendarDate('not-a-date')).toBe('not-a-date');
    expect(formatCalendarDate('2026-03')).toBe('2026-03');
  });
});
