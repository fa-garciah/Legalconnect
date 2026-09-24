/** 013. How an event reads on screen, in Spanish and in Mexico City time. */
import type { CalendarEvent, EventType } from './types';

export const EVENT_TYPE_LABEL: Readonly<Record<EventType, string>> = {
  hearing: 'Audiencia',
  deadline: 'Vencimiento',
  meeting: 'Reunión',
  other: 'Otro',
};

export const REMINDER_OPTIONS: readonly { readonly value: number; readonly label: string }[] = [
  { value: 15, label: '15 minutos antes' },
  { value: 60, label: '1 hora antes' },
  { value: 1440, label: '1 día antes' },
  { value: 2880, label: '2 días antes' },
  { value: 10080, label: '1 semana antes' },
];

const TIME = new Intl.DateTimeFormat('es-MX', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'America/Mexico_City',
});

const MONTH = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const LONG_DAY = new Intl.DateTimeFormat('es-MX', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

export function formatTime(instant: string): string {
  return TIME.format(new Date(instant));
}

/** "septiembre de 2026". */
export function monthTitle(year: number, month: number): string {
  return MONTH.format(new Date(Date.UTC(year, month - 1, 1)));
}

/** "miércoles, 30 de septiembre" for a `YYYY-MM-DD` date. */
export function longDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return LONG_DAY.format(new Date(Date.UTC(y, m - 1, d)));
}

const DAY_MONTH = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', timeZone: 'UTC' });

/** "23 de septiembre" for a `YYYY-MM-DD` date. */
export function dayMonth(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return DAY_MONTH.format(new Date(Date.UTC(y, m - 1, d)));
}

/** "Todo el día" or "10:00 – 11:30". */
export function eventTimeLabel(event: CalendarEvent): string {
  if (event.allDay) return 'Todo el día';
  const start = formatTime(event.startsAt!);
  return event.endsAt ? `${start} – ${formatTime(event.endsAt)}` : start;
}
