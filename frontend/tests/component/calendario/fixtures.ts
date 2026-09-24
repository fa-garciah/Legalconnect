import type { CalendarEvent } from '@/calendar/types';

const base: CalendarEvent = {
  id: 'e',
  type: 'hearing',
  title: 't',
  description: null,
  location: null,
  allDay: false,
  startsAt: null,
  endsAt: null,
  startsOn: null,
  endsOn: null,
  case: null,
  remindMinutesBefore: null,
  status: 'scheduled',
  cancelledAt: null,
  createdByMembershipId: 'm',
  createdAt: '2026-09-01T00:00:00Z',
};

/** 10:00–11:30 Mexico City on 23 Sept, linked to a case. */
export const HEARING: CalendarEvent = {
  ...base,
  id: 'ev-hearing',
  title: 'Audiencia de pruebas',
  startsAt: '2026-09-23T16:00:00.000Z',
  endsAt: '2026-09-23T17:30:00.000Z',
  location: 'Juzgado 4° Civil',
  case: { id: 'case-1', fileNumber: 'EXP-2026-0042' },
};

/** 08:00 on 23 Sept — earlier than the hearing. */
export const MEETING: CalendarEvent = {
  ...base,
  id: 'ev-meeting',
  type: 'meeting',
  title: 'Reunión con cliente',
  startsAt: '2026-09-23T14:00:00.000Z',
};

export const DEADLINE: CalendarEvent = {
  ...base,
  id: 'ev-deadline',
  type: 'deadline',
  title: 'Vence contestación',
  allDay: true,
  startsOn: '2026-09-30',
  remindMinutesBefore: 1440,
};

export const CANCELLED: CalendarEvent = {
  ...base,
  id: 'ev-cancelled',
  type: 'other',
  title: 'Comida de despacho',
  allDay: true,
  startsOn: '2026-09-23',
  status: 'cancelled',
  cancelledAt: '2026-09-20T00:00:00Z',
};
