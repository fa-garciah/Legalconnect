/**
 * T029 — the firm's calendar. 022/FR-011.
 *
 * `013` shipped a calendar whose only fixture is one weekly meeting, written by `seed.ts` so
 * the isolation sweep has a non-empty table. That is enough to prove the table is scoped and
 * nothing like enough to look at a month view and judge it.
 *
 * THE SHAPE RULES ARE THE DATABASE'S, not this file's invention. `0046_calendar_event.sql`
 * carries `calendar_event_one_shape` (all-day events have dates, timed events have instants,
 * never both), `calendar_event_ends_after_start`, a closed list of reminder offsets and text
 * bounds. Every one of them is asserted in `demo-calendar.test.ts`, because a fixture that
 * violates a CHECK fails at write time with a Postgres error that reads like a calendar bug.
 *
 * Deadlines are all-day on purpose: `013`/SC-005 records that a deadline on 30 September is
 * 30 September in every browser's time zone, which is exactly why that column is a `date`.
 */
import { DEMO_PEOPLE, type DemoFirm } from './firm';
import type { DemoMatter } from './matters';
import { DEMO_SEED, intBetween, mulberry32, pick } from './rng';

export type CalendarEventType = 'hearing' | 'deadline' | 'meeting' | 'other';

export interface DemoCalendarEvent {
  readonly type: CalendarEventType;
  readonly title: string;
  readonly description: string | null;
  readonly location: string | null;
  readonly allDay: boolean;
  /** ISO instant, for a timed event. Null when `allDay`. */
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  /** `YYYY-MM-DD`, for an all-day event. Null when not `allDay`. */
  readonly startsOn: string | null;
  readonly endsOn: string | null;
  readonly remindMinutesBefore: number | null;
  readonly matterFileNumber: string | null;
  readonly createdBySlug: string;
}

const HEARINGS = [
  'Audiencia inicial',
  'Audiencia de pruebas',
  'Audiencia de alegatos',
  'Comparecencia ante el juzgado',
] as const;

const DEADLINES = [
  'Vencimiento para contestar demanda',
  'Plazo para ofrecer pruebas',
  'Vencimiento del término probatorio',
  'Último día para interponer recurso',
] as const;

const MEETINGS = [
  'Junta semanal del despacho',
  'Reunión con el cliente',
  'Revisión de cartera de asuntos',
  'Sesión de estrategia procesal',
] as const;

const COURTS = [
  'Juzgado Primero de Distrito',
  'Juzgado Cuarto Civil',
  'Tribunal Colegiado en Materia Civil',
  'Junta Especial de Conciliación',
] as const;

const REMINDERS = [15, 60, 1440, 2880, 10080] as const;

const iso = (date: Date): string => date.toISOString().slice(0, 10);

/** Business hours in Mexico City, expressed as the UTC instant the column stores. */
function atHour(day: Date, hour: number): string {
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour + 6, 0, 0)).toISOString();
}

function shift(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

export function demoCalendarEvents(
  firm: DemoFirm,
  matters: readonly DemoMatter[],
  asOf: Date,
): readonly DemoCalendarEvent[] {
  const next = mulberry32(DEMO_SEED + 613 + (firm.sparse ? 5 : 0));

  const authors = DEMO_PEOPLE.filter((p) => p.archetype !== 'BM').map((p) => p.slug);
  // Only open matters get future hearings and deadlines: a closed matter with a hearing next
  // week is the kind of detail that makes a demo look wrong to a lawyer.
  const openMatters = matters.filter((m) => m.closedOn === null);

  const events: DemoCalendarEvent[] = [];

  // Offsets in days from `asOf`, deliberately spanning past and future so the month view has
  // something behind it and the "upcoming" list has something ahead.
  const hearingOffsets = firm.sparse ? [4] : [-38, -17, -6, 3, 9, 16, 27, 41];
  const deadlineOffsets = firm.sparse ? [11] : [-24, -9, 2, 7, 14, 22, 35];
  const meetingOffsets = firm.sparse ? [-3] : [-14, -7, 1, 8, 15];

  for (const offset of hearingOffsets) {
    const day = shift(asOf, offset);
    const matter = openMatters.length > 0 ? pick(next, openMatters) : null;
    events.push({
      type: 'hearing',
      title: pick(next, HEARINGS),
      description: matter ? `Asunto ${matter.fileNumber}` : null,
      location: pick(next, COURTS),
      allDay: false,
      startsAt: atHour(day, intBetween(next, 9, 13)),
      endsAt: atHour(day, intBetween(next, 14, 16)),
      startsOn: null,
      endsOn: null,
      remindMinutesBefore: pick(next, REMINDERS),
      matterFileNumber: matter?.fileNumber ?? null,
      createdBySlug: pick(next, authors),
    });
  }

  for (const offset of deadlineOffsets) {
    const day = shift(asOf, offset);
    const matter = openMatters.length > 0 ? pick(next, openMatters) : null;
    events.push({
      type: 'deadline',
      title: pick(next, DEADLINES),
      description: null,
      location: null,
      // 013/SC-005 — a deadline is a calendar day, not an instant.
      allDay: true,
      startsAt: null,
      endsAt: null,
      startsOn: iso(day),
      endsOn: null,
      remindMinutesBefore: pick(next, REMINDERS),
      matterFileNumber: matter?.fileNumber ?? null,
      createdBySlug: pick(next, authors),
    });
  }

  for (const [index, offset] of meetingOffsets.entries()) {
    const day = shift(asOf, offset);
    events.push({
      type: 'meeting',
      title: pick(next, MEETINGS),
      description: null,
      location: 'Oficina principal',
      allDay: false,
      startsAt: atHour(day, 9),
      endsAt: atHour(day, 10),
      startsOn: null,
      endsOn: null,
      remindMinutesBefore: index === 0 ? null : 60,
      // Firm-wide, so `013`'s "an event with no case is visible to everybody" branch has a
      // fixture (`calendar.repository.ts:101-112`).
      matterFileNumber: null,
      createdBySlug: pick(next, authors),
    });
  }

  if (!firm.sparse) {
    // One `other`, so all four enum values are reachable from the demo data.
    events.push({
      type: 'other',
      title: 'Capacitación interna sobre firma electrónica',
      description: null,
      location: 'Sala de juntas',
      allDay: true,
      startsAt: null,
      endsAt: null,
      startsOn: iso(shift(asOf, 19)),
      endsOn: iso(shift(asOf, 20)),
      remindMinutesBefore: 1440,
      matterFileNumber: null,
      createdBySlug: pick(next, authors),
    });
  }

  return events;
}
