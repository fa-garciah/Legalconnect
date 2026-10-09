/**
 * 008 T002 — the note write body and the month parameter (FR-002, FR-003, FR-011). Pure; every bound
 * is also a CHECK in migration 0049.
 */
import { describe, expect, it } from 'vitest';
import { ValidationFailed } from '../../src/common/http/errors';
import { normaliseMonth, normaliseNoteBody } from '../../src/modules/notes/note-input';

describe('normaliseNoteBody', () => {
  it('trims and keeps the text', () => {
    expect(normaliseNoteBody({ body: '  Audiencia diferida  ' })).toEqual({ body: 'Audiencia diferida' });
  });

  it('accepts exactly 5000 characters', () => {
    expect(normaliseNoteBody({ body: 'x'.repeat(5000) }).body).toHaveLength(5000);
  });

  it.each([
    ['missing', {}],
    ['blank', { body: '   ' }],
    ['not text', { body: 42 }],
    ['too long', { body: 'x'.repeat(5001) }],
    ['not an object', null],
  ])('refuses a body that is %s', (_label, raw) => {
    expect(() => normaliseNoteBody(raw)).toThrow(ValidationFailed);
  });

  it('ignores visibility, caseId and anything else — none is input (Decision 1)', () => {
    expect(normaliseNoteBody({ body: 'x', visibility: 'client', caseId: 'y', status: 'voided' })).toEqual({ body: 'x' });
  });
});

describe('normaliseMonth', () => {
  it('accepts YYYY-MM and returns it', () => {
    expect(normaliseMonth('2026-10')).toBe('2026-10');
    expect(normaliseMonth('2026-01')).toBe('2026-01');
  });

  it('absent means the current month (null here; the service fills it)', () => {
    expect(normaliseMonth(undefined)).toBeNull();
    expect(normaliseMonth('')).toBeNull();
  });

  it.each(['2026-13', '2026-00', '10-2026', '2026-1', 'hoy', '2026-10-01'])('refuses %s', (raw) => {
    expect(() => normaliseMonth(raw)).toThrow(ValidationFailed);
  });
});
