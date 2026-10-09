/**
 * 008 T017 — notes and activity are read one Mexico City month at a time (Decision 7). The month in
 * the browser must be Mexico City's, never the machine's own zone's.
 */
import { describe, expect, it } from 'vitest';
import { mexicoMonth, monthLabel, shiftMonthKey } from '@/notes/month';

describe('mexicoMonth', () => {
  it('is Mexico City’s month, not UTC’s: 23:30 on 31 July there is still July', () => {
    expect(mexicoMonth(new Date('2026-08-01T05:30:00Z'))).toBe('2026-07');
    expect(mexicoMonth(new Date('2026-08-01T06:30:00Z'))).toBe('2026-08');
  });
});

describe('shiftMonthKey', () => {
  it('moves by whole months across a year end, both ways', () => {
    expect(shiftMonthKey('2026-10', -1)).toBe('2026-09');
    expect(shiftMonthKey('2026-01', -1)).toBe('2025-12');
    expect(shiftMonthKey('2026-12', 1)).toBe('2027-01');
  });
});

describe('monthLabel', () => {
  it('names the month in Spanish, capitalised', () => {
    expect(monthLabel('2026-10')).toBe('Octubre de 2026');
    expect(monthLabel('2027-01')).toBe('Enero de 2027');
  });
});
