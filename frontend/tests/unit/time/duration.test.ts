/**
 * 009 T022 — how a duration reads on screen (FR-016, FR-020). Every branch asserted: these labels
 * are the figures a person checks their week against.
 */
import { describe, expect, it } from 'vitest';
import { elapsedClock, formatMinutes, splitMinutes, toMinutes } from '@/time/duration';

describe('formatMinutes', () => {
  it.each([
    [0, '0 min'],
    [1, '1 min'],
    [45, '45 min'],
    [60, '1 h'],
    [90, '1 h 30 min'],
    [125, '2 h 5 min'],
    [1440, '24 h'],
    [6015, '100 h 15 min'],
  ])('%i → %s', (minutes, label) => {
    expect(formatMinutes(minutes)).toBe(label);
  });
});

describe('splitMinutes / toMinutes', () => {
  it('round-trips hours and minutes', () => {
    expect(splitMinutes(90)).toEqual({ hours: 1, minutes: 30 });
    expect(toMinutes(1, 30)).toBe(90);
    expect(toMinutes(0, 45)).toBe(45);
  });

  it('treats blanks as zero and refuses what is not a whole number', () => {
    expect(toMinutes('', '45')).toBe(45);
    expect(toMinutes('2', '')).toBe(120);
    expect(toMinutes('1.5', '0')).toBeNaN();
    expect(toMinutes('-1', '0')).toBeNaN();
    expect(toMinutes('a', '0')).toBeNaN();
  });
});

describe('elapsedClock', () => {
  it('reads hh:mm:ss from a start to now', () => {
    const start = '2026-10-08T15:00:00.000Z';
    expect(elapsedClock(start, Date.parse('2026-10-08T15:00:00.000Z'))).toBe('00:00:00');
    expect(elapsedClock(start, Date.parse('2026-10-08T16:02:03.900Z'))).toBe('01:02:03');
    expect(elapsedClock(start, Date.parse('2026-10-09T18:00:00.000Z'))).toBe('27:00:00');
  });

  it('never shows a negative clock when the browser is behind the server', () => {
    expect(elapsedClock('2026-10-08T15:00:00.000Z', Date.parse('2026-10-08T14:59:00.000Z'))).toBe('00:00:00');
  });
});
