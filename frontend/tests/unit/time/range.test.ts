/**
 * 009 T022 — the timesheet's ranges, in Mexico City days (US3, FR-009). `[from, to)`: the end is
 * exclusive, exactly as the API reads it.
 */
import { describe, expect, it } from 'vitest';
import { MAX_RANGE_DAYS, presetRange, rangeDays, rangeError } from '@/time/range';

describe('presetRange', () => {
  it('this week is Monday to Sunday, the end exclusive', () => {
    expect(presetRange('this-week', '2026-10-08')).toEqual({ from: '2026-10-05', to: '2026-10-12' }); // Thursday
    expect(presetRange('this-week', '2026-10-05')).toEqual({ from: '2026-10-05', to: '2026-10-12' }); // Monday
    expect(presetRange('this-week', '2026-10-11')).toEqual({ from: '2026-10-05', to: '2026-10-12' }); // Sunday
  });

  it('last week is the seven days before this week', () => {
    expect(presetRange('last-week', '2026-10-08')).toEqual({ from: '2026-09-28', to: '2026-10-05' });
  });

  it('this month runs to the first of the next, across a year end', () => {
    expect(presetRange('this-month', '2026-10-08')).toEqual({ from: '2026-10-01', to: '2026-11-01' });
    expect(presetRange('this-month', '2026-12-31')).toEqual({ from: '2026-12-01', to: '2027-01-01' });
  });
});

describe('rangeDays and rangeError', () => {
  it('counts days in [from, to)', () => {
    expect(rangeDays({ from: '2026-10-01', to: '2026-10-02' })).toBe(1);
    expect(rangeDays({ from: '2026-10-01', to: '2026-12-02' })).toBe(62);
  });

  it('accepts 1 to 62 days, and says why otherwise', () => {
    expect(rangeError({ from: '2026-10-01', to: '2026-12-02' })).toBeNull();
    expect(MAX_RANGE_DAYS).toBe(62);
    expect(rangeError({ from: '2026-10-01', to: '2026-12-03' })).toBe('El periodo no puede pasar de 62 días.');
    expect(rangeError({ from: '2026-10-05', to: '2026-10-05' })).toBe('La fecha final debe ser posterior a la inicial.');
    expect(rangeError({ from: '2026-10-05', to: '2026-10-01' })).toBe('La fecha final debe ser posterior a la inicial.');
    expect(rangeError({ from: '', to: '2026-10-01' })).toBe('Elige ambas fechas.');
  });
});
