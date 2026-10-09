/**
 * 009 T022 — the manual-entry and correction forms (FR-011, FR-013). Refused before sending, with
 * Spanish messages; the server refuses the same things again.
 */
import { describe, expect, it } from 'vitest';
import { entryFormSchema, toEntryBody, type EntryFormValues } from '@/time/schema';

const TODAY = '2026-10-08';
const valid: EntryFormValues = {
  caseId: 'c1',
  workDate: '2026-10-07',
  hours: '1',
  minutes: '30',
  description: '  Llamada con el cliente  ',
};
const errorsOf = (values: EntryFormValues) => {
  const parsed = entryFormSchema(TODAY).safeParse(values);
  return parsed.success ? {} : Object.fromEntries(parsed.error.issues.map((i) => [i.path[0], i.message]));
};

describe('entryFormSchema', () => {
  it('accepts a valid entry, including today', () => {
    expect(errorsOf(valid)).toEqual({});
    expect(errorsOf({ ...valid, workDate: TODAY })).toEqual({});
  });

  it('refuses a missing matter, a future date, no duration, more than 24 h, a blank description', () => {
    expect(errorsOf({ ...valid, caseId: '' }).caseId).toBe('Elige el expediente.');
    expect(errorsOf({ ...valid, workDate: '2026-10-09' }).workDate).toBe('No puedes registrar horas en una fecha futura.');
    expect(errorsOf({ ...valid, workDate: '' }).workDate).toBe('Elige la fecha.');
    expect(errorsOf({ ...valid, hours: '0', minutes: '0' }).minutes).toBe('La duración debe ser de al menos 1 minuto.');
    expect(errorsOf({ ...valid, hours: '24', minutes: '1' }).minutes).toBe('La duración no puede pasar de 24 horas.');
    expect(errorsOf({ ...valid, hours: '1.5', minutes: '0' }).minutes).toBe('Escribe horas y minutos enteros.');
    expect(errorsOf({ ...valid, minutes: '60' }).minutes).toBe('Los minutos van de 0 a 59.');
    expect(errorsOf({ ...valid, description: '   ' }).description).toBe('Describe el trabajo realizado.');
    expect(errorsOf({ ...valid, description: 'x'.repeat(1001) }).description).toBe('La descripción no puede pasar de 1000 caracteres.');
  });
});

describe('toEntryBody', () => {
  it('sends minutes as one integer and a trimmed description', () => {
    expect(toEntryBody(valid)).toEqual({ workDate: '2026-10-07', minutes: 90, description: 'Llamada con el cliente' });
  });
});
