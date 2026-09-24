/**
 * 013 T001. The calendar write body (contracts/calendar-api.md, FR-002, FR-003, FR-011, FR-012).
 *
 * Pure validation: every rule here is also a CHECK in migration 0046, and this is the layer that
 * turns a violation into a `400` a person can read instead of a constraint error.
 */
import { describe, expect, it } from 'vitest';
import { ValidationFailed } from '../../src/common/http/errors';
import { changedFields, normaliseEventInput } from '../../src/modules/calendar/calendar-input';

const TIMED = {
  type: 'hearing',
  title: '  Audiencia de pruebas  ',
  allDay: false,
  startsAt: '2026-09-30T16:00:00.000Z',
  endsAt: '2026-09-30T17:00:00.000Z',
};

const ALL_DAY = { type: 'deadline', title: 'Vence contestación', allDay: true, startsOn: '2026-09-30' };

describe('normaliseEventInput', () => {
  it('accepts a timed event and trims the title', () => {
    const input = normaliseEventInput(TIMED);
    expect(input).toMatchObject({
      type: 'hearing',
      title: 'Audiencia de pruebas',
      allDay: false,
      startsOn: null,
      endsOn: null,
      caseId: null,
      remindMinutesBefore: null,
      description: null,
      location: null,
    });
    expect(input.startsAt?.toISOString()).toBe('2026-09-30T16:00:00.000Z');
  });

  it('accepts an all-day event with no times', () => {
    const input = normaliseEventInput(ALL_DAY);
    expect(input).toMatchObject({ allDay: true, startsOn: '2026-09-30', endsOn: null, startsAt: null, endsAt: null });
  });

  it.each([
    ['no type', { ...TIMED, type: undefined }],
    ['an unknown type', { ...TIMED, type: 'party' }],
    ['no title', { ...TIMED, title: '   ' }],
    ['a 201-character title', { ...TIMED, title: 'x'.repeat(201) }],
    ['a 201-character location', { ...TIMED, location: 'x'.repeat(201) }],
    ['a 2001-character description', { ...TIMED, description: 'x'.repeat(2001) }],
    ['a timed event without a start', { ...TIMED, startsAt: undefined }],
    ['a start that is not a date', { ...TIMED, startsAt: 'mañana' }],
    ['an end before the start', { ...TIMED, endsAt: '2026-09-30T15:00:00.000Z' }],
    ['an all-day event without a date', { ...ALL_DAY, startsOn: undefined }],
    ['an all-day date that is not YYYY-MM-DD', { ...ALL_DAY, startsOn: '30/09/2026' }],
    ['an impossible date', { ...ALL_DAY, startsOn: '2026-02-30' }],
    ['an all-day end before its start', { ...ALL_DAY, endsOn: '2026-09-29' }],
    ['an unlisted reminder', { ...TIMED, remindMinutesBefore: 7 }],
    ['a case id that is not a uuid', { ...TIMED, caseId: 'EXP-1' }],
    ['allDay that is not a boolean', { ...TIMED, allDay: 'no' }],
  ])('refuses %s', (_label, body) => {
    expect(() => normaliseEventInput(body)).toThrow(ValidationFailed);
  });

  it.each([15, 60, 1440, 2880, 10080])('accepts a reminder of %i minutes', (minutes) => {
    expect(normaliseEventInput({ ...TIMED, remindMinutesBefore: minutes }).remindMinutesBefore).toBe(minutes);
  });

  it('treats blank optional text as absent', () => {
    const input = normaliseEventInput({ ...TIMED, location: '  ', description: '' });
    expect(input.location).toBeNull();
    expect(input.description).toBeNull();
  });

  it('drops the other shape’s fields rather than storing both', () => {
    const input = normaliseEventInput({ ...ALL_DAY, startsAt: '2026-09-30T16:00:00.000Z' });
    expect(input.startsAt).toBeNull();
  });
});

describe('changedFields', () => {
  it('names the fields that differ, never their values', () => {
    const before = normaliseEventInput(TIMED);
    const after = normaliseEventInput({ ...TIMED, title: 'Otra', startsAt: '2026-09-30T15:00:00.000Z' });
    expect(changedFields(before, after)).toEqual(['startsAt', 'title']);
  });

  it('is empty when nothing changed', () => {
    expect(changedFields(normaliseEventInput(TIMED), normaliseEventInput(TIMED))).toEqual([]);
  });
});
