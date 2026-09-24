/**
 * 013 T010. The month grid's arithmetic, in Mexico City days (FR-010, SC-005).
 */
import { describe, expect, it } from 'vitest';
import { eventDays, eventsByDay, gridDays, gridRange, mexicoDate, shiftMonth } from '@/calendar/month-grid';
import type { CalendarEvent } from '@/calendar/types';

const base: CalendarEvent = {
  id: 'e',
  type: 'hearing',
  title: 't',
  description: null,
  location: null,
  allDay: false,
  startsAt: null,
  endsAt: null,
  startsOn: null,
  endsOn: null,
  case: null,
  remindMinutesBefore: null,
  status: 'scheduled',
  cancelledAt: null,
  createdByMembershipId: 'm',
  createdAt: '2026-09-01T00:00:00Z',
};

describe('gridDays', () => {
  it('starts on the Monday on or before the 1st and ends on the Sunday on or after the last day', () => {
    const days = gridDays(2026, 9); // September 2026: 1 Sept is a Tuesday, 30 Sept a Wednesday
    expect(days[0]).toEqual({ date: '2026-08-31', inMonth: false });
    expect(days.at(-1)).toEqual({ date: '2026-10-04', inMonth: false });
    expect(days).toHaveLength(35);
    expect(days.filter((d) => d.inMonth)).toHaveLength(30);
  });

  it('a month starting on Monday has no leading padding', () => {
    expect(gridDays(2026, 6)[0]).toEqual({ date: '2026-06-01', inMonth: true });
  });

  it('gridRange covers exactly the grid, as the API range [from, to)', () => {
    expect(gridRange(2026, 9)).toEqual({ from: '2026-08-31', to: '2026-10-05' });
  });
});

describe('shiftMonth', () => {
  it('crosses year boundaries', () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
  });
});

describe('mexicoDate', () => {
  it('reads an instant as a Mexico City date, whatever the browser zone', () => {
    // 03:00Z on 1 Oct is 21:00 on 30 Sept in Mexico City.
    expect(mexicoDate('2026-10-01T03:00:00.000Z')).toBe('2026-09-30');
    expect(mexicoDate('2026-10-01T07:00:00.000Z')).toBe('2026-10-01');
  });
});

describe('eventDays', () => {
  it('an all-day event covers its dates exactly, never shifted', () => {
    expect(eventDays({ ...base, allDay: true, startsOn: '2026-09-30' })).toEqual(['2026-09-30']);
    expect(eventDays({ ...base, allDay: true, startsOn: '2026-09-29', endsOn: '2026-10-01' })).toEqual([
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
    ]);
  });

  it('a timed event spanning Mexico City midnight lands on both days', () => {
    expect(
      eventDays({ ...base, startsAt: '2026-10-01T04:00:00.000Z', endsAt: '2026-10-01T08:00:00.000Z' }),
    ).toEqual(['2026-09-30', '2026-10-01']);
  });
});

describe('eventsByDay', () => {
  it('groups by day and orders timed events by start, all-day first', () => {
    const late = { ...base, id: 'late', startsAt: '2026-09-15T22:00:00.000Z' };
    const early = { ...base, id: 'early', startsAt: '2026-09-15T15:00:00.000Z' };
    const whole = { ...base, id: 'whole', allDay: true, startsOn: '2026-09-15' };
    const map = eventsByDay([late, whole, early]);
    expect(map.get('2026-09-15')!.map((e) => e.id)).toEqual(['whole', 'early', 'late']);
  });
});
