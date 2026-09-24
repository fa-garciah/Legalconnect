/**
 * 013 T010. The event form, and the body it produces (contracts/calendar-api.md).
 *
 * Times are typed in Mexico City time. Mexico abolished daylight saving time in 2022, so the
 * conversion is the fixed offset −06:00 — no browser zone is involved.
 */
import { describe, expect, it } from 'vitest';
import { eventFormSchema, toEventBody, fromEvent, type EventFormValues } from '@/calendar/schema';

const TIMED: EventFormValues = {
  type: 'hearing',
  title: 'Audiencia de pruebas',
  allDay: false,
  date: '2026-09-30',
  endDate: '',
  startTime: '10:00',
  endTime: '11:30',
  caseId: '',
  location: '',
  description: '',
  remindMinutesBefore: '1440',
};

describe('eventFormSchema', () => {
  it('accepts a timed event', () => {
    expect(eventFormSchema.safeParse(TIMED).success).toBe(true);
  });

  it('requires a title, in Spanish', () => {
    const result = eventFormSchema.safeParse({ ...TIMED, title: '  ' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/título/i);
  });

  it('refuses an end before the start', () => {
    const result = eventFormSchema.safeParse({ ...TIMED, endTime: '09:00' });
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((i) => /termina antes/i.test(i.message))).toBe(true);
  });

  it('a timed event needs a start time; an all-day one does not', () => {
    expect(eventFormSchema.safeParse({ ...TIMED, startTime: '' }).success).toBe(false);
    expect(eventFormSchema.safeParse({ ...TIMED, allDay: true, startTime: '', endTime: '' }).success).toBe(true);
  });

  it('refuses an all-day end date before its start date', () => {
    expect(eventFormSchema.safeParse({ ...TIMED, allDay: true, endDate: '2026-09-29' }).success).toBe(false);
  });
});

describe('toEventBody', () => {
  it('converts Mexico City wall time to an instant at −06:00', () => {
    expect(toEventBody(TIMED)).toEqual({
      type: 'hearing',
      title: 'Audiencia de pruebas',
      allDay: false,
      startsAt: '2026-09-30T16:00:00.000Z',
      endsAt: '2026-09-30T17:30:00.000Z',
      caseId: null,
      location: null,
      description: null,
      remindMinutesBefore: 1440,
    });
  });

  it('sends dates, never instants, for an all-day event', () => {
    expect(toEventBody({ ...TIMED, allDay: true, endDate: '2026-10-02', remindMinutesBefore: '' })).toMatchObject({
      allDay: true,
      startsOn: '2026-09-30',
      endsOn: '2026-10-02',
      remindMinutesBefore: null,
    });
  });
});

describe('fromEvent', () => {
  it('round-trips a stored timed event into the form in Mexico City time', () => {
    const values = fromEvent({
      id: 'e',
      type: 'meeting',
      title: 'Reunión',
      description: null,
      location: 'Oficina',
      allDay: false,
      startsAt: '2026-09-30T16:00:00.000Z',
      endsAt: null,
      startsOn: null,
      endsOn: null,
      case: { id: 'k', fileNumber: 'EXP-1' },
      remindMinutesBefore: 60,
      status: 'scheduled',
      cancelledAt: null,
      createdByMembershipId: 'm',
      createdAt: 'x',
    });
    expect(values).toMatchObject({ date: '2026-09-30', startTime: '10:00', endTime: '', caseId: 'k', remindMinutesBefore: '60' });
  });
});
