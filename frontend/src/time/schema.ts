/**
 * 009. The manual-entry and correction form (FR-011, FR-013). The same bounds as the server's
 * `time-entry-input.ts`, checked here so a person sees the reason before anything is sent.
 *
 * Built per call with today's Mexico City date, because "not in the future" depends on the day the
 * form is open — never on the browser's own zone.
 *
 * Every rule is in ONE `superRefine` over plain strings, deliberately: a refinement attached after
 * field-level checks is skipped when one of those fails, so a form missing its matter would hide the
 * fact that its date is also in the future. A person should see every reason at once.
 */
import { z } from 'zod';
import type { EntryBody } from './types';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const WHOLE = /^\d*$/;
const MAX_DESCRIPTION = 1000;

export interface EntryFormValues {
  readonly caseId: string;
  readonly workDate: string;
  readonly hours: string;
  readonly minutes: string;
  readonly description: string;
}

export function entryFormSchema(today: string) {
  return z
    .object({
      caseId: z.string(),
      workDate: z.string(),
      hours: z.string(),
      minutes: z.string(),
      description: z.string(),
    })
    .superRefine((values, ctx) => {
      const issue = (path: keyof EntryFormValues, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });

      if (!values.caseId) issue('caseId', 'Elige el expediente.');

      if (!DATE.test(values.workDate)) issue('workDate', 'Elige la fecha.');
      else if (values.workDate > today) issue('workDate', 'No puedes registrar horas en una fecha futura.');

      const hours = values.hours.trim();
      const minutes = values.minutes.trim();
      if (!WHOLE.test(hours) || !WHOLE.test(minutes)) {
        issue('minutes', 'Escribe horas y minutos enteros.');
      } else if (Number(minutes || '0') > 59) {
        issue('minutes', 'Los minutos van de 0 a 59.');
      } else {
        const total = Number(hours || '0') * 60 + Number(minutes || '0');
        if (total < 1) issue('minutes', 'La duración debe ser de al menos 1 minuto.');
        else if (total > 1440) issue('minutes', 'La duración no puede pasar de 24 horas.');
      }

      const description = values.description.trim();
      if (description.length === 0) issue('description', 'Describe el trabajo realizado.');
      else if (description.length > MAX_DESCRIPTION) issue('description', 'La descripción no puede pasar de 1000 caracteres.');
    });
}

export function toEntryBody(values: EntryFormValues): EntryBody {
  return {
    workDate: values.workDate,
    minutes: Number(values.hours.trim() || '0') * 60 + Number(values.minutes.trim() || '0'),
    description: values.description.trim(),
  };
}
