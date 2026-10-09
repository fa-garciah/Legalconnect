/**
 * 009 T003 — contracts/time-entries-api.md §4–§7, FR-011, FR-013. Pure validation; every bound is
 * also a CHECK in migration 0048, and this layer turns a violation into a readable `400`.
 */
import { describe, expect, it } from 'vitest';
import { ValidationFailed } from '../../src/common/http/errors';
import {
  changedFields,
  normaliseCorrection,
  normaliseManualEntry,
  normaliseStopBody,
  normaliseTimerStart,
} from '../../src/modules/time-entries/time-entry-input';

const MANUAL = { workDate: '2026-10-07', minutes: 90, description: '  Llamada con el cliente  ' };

describe('normaliseManualEntry', () => {
  it('accepts a valid body and trims the description', () => {
    expect(normaliseManualEntry(MANUAL)).toEqual({
      workDate: '2026-10-07',
      minutes: 90,
      description: 'Llamada con el cliente',
    });
  });

  it('ignores fields it does not know, including a caseId (the matter comes from the URL)', () => {
    expect(normaliseManualEntry({ ...MANUAL, caseId: 'x', membershipId: 'y', status: 'voided' })).toEqual({
      workDate: '2026-10-07',
      minutes: 90,
      description: 'Llamada con el cliente',
    });
  });

  it.each([
    ['missing work date', { ...MANUAL, workDate: undefined }],
    ['malformed work date', { ...MANUAL, workDate: '07/10/2026' }],
    ['impossible work date', { ...MANUAL, workDate: '2026-02-30' }],
    ['work date not a string', { ...MANUAL, workDate: 20261007 }],
    ['zero minutes', { ...MANUAL, minutes: 0 }],
    ['more than a day', { ...MANUAL, minutes: 1441 }],
    ['fractional minutes', { ...MANUAL, minutes: 1.5 }],
    ['minutes as text', { ...MANUAL, minutes: '90' }],
    ['missing minutes', { ...MANUAL, minutes: undefined }],
    ['blank description', { ...MANUAL, description: '   ' }],
    ['missing description', { ...MANUAL, description: undefined }],
    ['description not text', { ...MANUAL, description: 12 }],
    ['description too long', { ...MANUAL, description: 'x'.repeat(1001) }],
  ])('refuses %s', (_label, body) => {
    expect(() => normaliseManualEntry(body)).toThrow(ValidationFailed);
  });

  it('accepts the bounds exactly', () => {
    expect(normaliseManualEntry({ ...MANUAL, minutes: 1 }).minutes).toBe(1);
    expect(normaliseManualEntry({ ...MANUAL, minutes: 1440 }).minutes).toBe(1440);
    expect(normaliseManualEntry({ ...MANUAL, description: 'x'.repeat(1000) }).description).toHaveLength(1000);
  });

  it('refuses a body that is not an object', () => {
    expect(() => normaliseManualEntry(null)).toThrow(ValidationFailed);
  });
});

describe('normaliseTimerStart', () => {
  it('a description is optional', () => {
    expect(normaliseTimerStart({})).toEqual({ description: null });
    expect(normaliseTimerStart(undefined)).toEqual({ description: null });
    expect(normaliseTimerStart({ description: '  ' })).toEqual({ description: null });
  });

  it('keeps a trimmed description and refuses one too long', () => {
    expect(normaliseTimerStart({ description: ' Revisión ' })).toEqual({ description: 'Revisión' });
    expect(() => normaliseTimerStart({ description: 'x'.repeat(1001) })).toThrow(ValidationFailed);
  });
});

describe('normaliseStopBody', () => {
  it('a description at stop is optional at this layer (the service requires one overall)', () => {
    expect(normaliseStopBody(undefined)).toEqual({ description: null });
    expect(normaliseStopBody({ description: 'Redacción' })).toEqual({ description: 'Redacción' });
  });
});

describe('normaliseCorrection', () => {
  it('keeps only the three correctable fields, validated', () => {
    expect(normaliseCorrection({ minutes: 45, caseId: 'z', status: 'logged' })).toEqual({ minutes: 45 });
    expect(normaliseCorrection({ workDate: '2026-10-01', description: ' Otra ' })).toEqual({
      workDate: '2026-10-01',
      description: 'Otra',
    });
    expect(normaliseCorrection({})).toEqual({});
    expect(normaliseCorrection(undefined)).toEqual({});
  });

  it('refuses an invalid value for any of them', () => {
    expect(() => normaliseCorrection({ minutes: 0 })).toThrow(ValidationFailed);
    expect(() => normaliseCorrection({ workDate: 'ayer' })).toThrow(ValidationFailed);
    expect(() => normaliseCorrection({ description: '' })).toThrow(ValidationFailed);
  });
});

describe('changedFields (FR-014 — names, never values)', () => {
  const before = { workDate: '2026-10-07', minutes: 90, description: 'Llamada' };

  it('names the fields whose value differs, sorted', () => {
    expect(changedFields(before, { ...before, minutes: 45, workDate: '2026-10-06' })).toEqual(['minutes', 'workDate']);
  });

  it('is empty when nothing differs', () => {
    expect(changedFields(before, { ...before })).toEqual([]);
  });
});
