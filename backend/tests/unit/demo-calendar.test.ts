/**
 * T028 — the firm's calendar. 022/FR-011.
 *
 * `013`'s screens need events a person can recognise: hearings with a court, deadlines that
 * are all-day because a deadline on 30 September is 30 September in any time zone, and firm
 * meetings with no matter behind them. `seed.ts` writes one ("Junta semanal del despacho"),
 * which is enough for the isolation sweep and not enough to look at.
 *
 * Every assertion here mirrors a CHECK constraint in `0046_calendar_event.sql`, deliberately:
 * a fixture that violates one fails at write time with a Postgres error, which reads like a
 * bug in the calendar rather than a bug in the seed.
 */
import { describe, expect, it } from 'vitest';
import { DEMO_FIRMS, DEMO_PEOPLE } from '../../drizzle/demo/firm';
import { demoMatters } from '../../drizzle/demo/matters';
import { demoCalendarEvents } from '../../drizzle/demo/calendar';

const AS_OF = new Date('2026-09-25T00:00:00Z');
const full = DEMO_FIRMS[0]!;
const matters = demoMatters(full, AS_OF);
const events = demoCalendarEvents(full, matters, AS_OF);

describe('volume and determinism', () => {
  it('gives the firm a readable calendar', () => {
    expect(events.length).toBeGreaterThanOrEqual(14);
    expect(events.length).toBeLessThanOrEqual(24);
  });

  it('is deterministic', () => {
    expect(demoCalendarEvents(full, matters, AS_OF)).toEqual(events);
  });

  it('gives the sparse firm at least one, so its calendar is not empty', () => {
    const sparse = DEMO_FIRMS[1]!;
    expect(demoCalendarEvents(sparse, demoMatters(sparse, AS_OF), AS_OF).length).toBeGreaterThan(0);
  });
});

describe('shape (0046_calendar_event.sql constraints)', () => {
  it('satisfies calendar_event_one_shape for every event', () => {
    for (const event of events) {
      if (event.allDay) {
        expect(event.startsOn, event.title).not.toBeNull();
        expect(event.startsAt, event.title).toBeNull();
        expect(event.endsAt, event.title).toBeNull();
      } else {
        expect(event.startsAt, event.title).not.toBeNull();
        expect(event.startsOn, event.title).toBeNull();
        expect(event.endsOn, event.title).toBeNull();
      }
    }
  });

  it('never ends before it starts', () => {
    for (const event of events) {
      if (event.endsAt !== null && event.startsAt !== null) {
        expect(event.endsAt >= event.startsAt, event.title).toBe(true);
      }
      if (event.endsOn !== null && event.startsOn !== null) {
        expect(event.endsOn >= event.startsOn, event.title).toBe(true);
      }
    }
  });

  it('only offers reminder values the constraint allows', () => {
    for (const event of events) {
      if (event.remindMinutesBefore !== null) {
        expect([15, 60, 1440, 2880, 10080]).toContain(event.remindMinutesBefore);
      }
    }
  });

  it('keeps titles, locations and descriptions inside their bounds', () => {
    for (const event of events) {
      expect(event.title.length).toBeGreaterThanOrEqual(1);
      expect(event.title.length).toBeLessThanOrEqual(200);
      if (event.location !== null) expect(event.location.length).toBeLessThanOrEqual(200);
      if (event.description !== null) expect(event.description.length).toBeLessThanOrEqual(2000);
    }
  });

  it('uses only the four declared types', () => {
    for (const event of events) {
      expect(['hearing', 'deadline', 'meeting', 'other']).toContain(event.type);
    }
  });
});

describe('content (FR-011)', () => {
  it('uses more than one type', () => {
    expect(new Set(events.map((e) => e.type)).size).toBeGreaterThanOrEqual(3);
  });

  it('has both past and future events relative to the clock it was given', () => {
    const today = '2026-09-25';
    const day = (e: (typeof events)[number]): string => e.startsOn ?? e.startsAt!.slice(0, 10);
    expect(events.some((e) => day(e) < today)).toBe(true);
    expect(events.some((e) => day(e) > today)).toBe(true);
  });

  it('links some events to a matter and leaves others firm-wide', () => {
    expect(events.some((e) => e.matterFileNumber !== null)).toBe(true);
    expect(events.some((e) => e.matterFileNumber === null)).toBe(true);
  });

  it('links only to matters that exist', () => {
    const numbers = new Set(matters.map((m) => m.fileNumber));
    for (const event of events) {
      if (event.matterFileNumber !== null) expect(numbers).toContain(event.matterFileNumber);
    }
  });

  it('makes deadlines all-day, because a deadline is a calendar day (013/SC-005)', () => {
    for (const event of events.filter((e) => e.type === 'deadline')) {
      expect(event.allDay, event.title).toBe(true);
    }
  });

  it('gives hearings a time and a court, because a hearing is at an hour in a place', () => {
    const hearings = events.filter((e) => e.type === 'hearing');
    expect(hearings.length).toBeGreaterThan(0);
    for (const hearing of hearings) {
      expect(hearing.allDay, hearing.title).toBe(false);
      expect(hearing.location, hearing.title).not.toBeNull();
    }
  });

  it('is created by people who exist and hold calendar.manage', () => {
    // matrix.ts calendar.read is MP/AA/PL/CM/SA; BM is not a calendar author here.
    const allowed = new Set(DEMO_PEOPLE.filter((p) => p.archetype !== 'BM').map((p) => p.slug));
    for (const event of events) expect(allowed).toContain(event.createdBySlug);
  });

  it('is written in Spanish', () => {
    for (const event of events) {
      expect(event.title).not.toMatch(/\b(the|and|of|for|hearing|deadline|meeting|court)\b/i);
    }
  });
});
