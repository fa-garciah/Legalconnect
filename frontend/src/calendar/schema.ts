/**
 * 013 T011. The event form and the body it sends (contracts/calendar-api.md).
 *
 * Times are typed as Mexico City wall-clock time. Mexico abolished daylight saving time in October
 * 2022, so Mexico City is a fixed UTC−06:00 and the conversion needs no browser zone and no
 * time-zone library. If that law changes, this is the one place to change.
 */
import { z } from 'zod';
import { mexicoDate } from './month-grid';
import { formatTime } from './format';
import type { CalendarEvent, EventBody, EventType } from './types';

const MEXICO_OFFSET = '-06:00';
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

export const eventFormSchema = z
  .object({
    type: z.enum(['hearing', 'deadline', 'meeting', 'other'], { error: 'Elige el tipo de evento.' }),
    title: z
      .string()
      .trim()
      .min(1, { error: 'Escribe el título del evento.' })
      .max(200, { error: 'El título no puede pasar de 200 caracteres.' }),
    allDay: z.boolean(),
    date: z.string().regex(DATE, { error: 'Elige la fecha.' }),
    endDate: z.string(),
    startTime: z.string(),
    endTime: z.string(),
    caseId: z.string(),
    location: z.string().trim().max(200, { error: 'El lugar no puede pasar de 200 caracteres.' }),
    description: z.string().trim().max(2000, { error: 'La descripción no puede pasar de 2000 caracteres.' }),
    remindMinutesBefore: z.string(),
  })
  .superRefine((values, ctx) => {
    if (values.allDay) {
      if (values.endDate && (!DATE.test(values.endDate) || values.endDate < values.date)) {
        ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'El evento termina antes de empezar.' });
      }
      return;
    }
    if (!TIME.test(values.startTime)) {
      ctx.addIssue({ code: 'custom', path: ['startTime'], message: 'Escribe la hora de inicio.' });
      return;
    }
    if (values.endTime && (!TIME.test(values.endTime) || values.endTime < values.startTime)) {
      ctx.addIssue({ code: 'custom', path: ['endTime'], message: 'El evento termina antes de empezar.' });
    }
  });

export type EventFormValues = z.input<typeof eventFormSchema>;

const instant = (date: string, time: string) => new Date(`${date}T${time}:00${MEXICO_OFFSET}`).toISOString();
const orNull = (value: string) => (value.trim() ? value.trim() : null);

export function toEventBody(values: EventFormValues): EventBody {
  const common = {
    type: values.type as EventType,
    title: values.title.trim(),
    caseId: values.caseId || null,
    location: orNull(values.location),
    description: orNull(values.description),
    remindMinutesBefore: values.remindMinutesBefore ? Number(values.remindMinutesBefore) : null,
  };
  if (values.allDay) {
    return { ...common, allDay: true, startsOn: values.date, endsOn: values.endDate || null };
  }
  return {
    ...common,
    allDay: false,
    startsAt: instant(values.date, values.startTime),
    endsAt: values.endTime ? instant(values.date, values.endTime) : null,
  };
}

export function emptyForm(date: string): EventFormValues {
  return {
    type: 'hearing',
    title: '',
    allDay: false,
    date,
    endDate: '',
    startTime: '10:00',
    endTime: '',
    caseId: '',
    location: '',
    description: '',
    remindMinutesBefore: '',
  };
}

export function fromEvent(event: CalendarEvent): EventFormValues {
  return {
    type: event.type,
    title: event.title,
    allDay: event.allDay,
    date: event.allDay ? event.startsOn! : mexicoDate(event.startsAt!),
    endDate: event.allDay ? (event.endsOn ?? '') : '',
    startTime: event.allDay ? '' : formatTime(event.startsAt!),
    endTime: !event.allDay && event.endsAt ? formatTime(event.endsAt) : '',
    caseId: event.case?.id ?? '',
    location: event.location ?? '',
    description: event.description ?? '',
    remindMinutesBefore: event.remindMinutesBefore ? String(event.remindMinutesBefore) : '',
  };
}
