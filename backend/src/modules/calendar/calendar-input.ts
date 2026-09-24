/**
 * 013 T002. The calendar write body, validated (contracts/calendar-api.md; FR-002, FR-003, FR-011,
 * FR-012). Every rule here is also a CHECK in migration 0046; this layer exists so a violation is
 * a readable `400` rather than a constraint error.
 *
 * An update is validated as a whole: the service merges the stored event with the patch and runs
 * the merged result through `normaliseEventInput`, so a patch can never produce an event that
 * would have been refused on create (a timed event losing its start, an end moved before it).
 */
import { ValidationFailed } from '../../common/http/errors';
import { assertUuid } from '../tenant/rfc';

export const EVENT_TYPES = ['hearing', 'deadline', 'meeting', 'other'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const REMINDER_MINUTES = [15, 60, 1440, 2880, 10080] as const;

export interface EventInput {
  readonly type: EventType;
  readonly title: string;
  readonly description: string | null;
  readonly location: string | null;
  readonly allDay: boolean;
  readonly startsAt: Date | null;
  readonly endsAt: Date | null;
  readonly startsOn: string | null;
  readonly endsOn: string | null;
  readonly caseId: string | null;
  readonly remindMinutesBefore: number | null;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function text(raw: unknown, field: string, max: number, required: boolean): string | null {
  if (raw === undefined || raw === null) {
    if (required) throw new ValidationFailed(`${field} is required.`);
    return null;
  }
  if (typeof raw !== 'string') throw new ValidationFailed(`${field} must be text.`);
  const value = raw.trim();
  if (value.length === 0) {
    if (required) throw new ValidationFailed(`${field} is required.`);
    return null;
  }
  if (value.length > max) throw new ValidationFailed(`${field} is too long.`);
  return value;
}

function instant(raw: unknown, field: string, required: boolean): Date | null {
  if (raw === undefined || raw === null || raw === '') {
    if (required) throw new ValidationFailed(`${field} is required.`);
    return null;
  }
  if (typeof raw !== 'string') throw new ValidationFailed(`${field} must be a date and time.`);
  const value = new Date(raw);
  if (Number.isNaN(value.getTime())) throw new ValidationFailed(`${field} must be a date and time.`);
  return value;
}

/** A calendar date, `YYYY-MM-DD`, that exists (no 30 February). */
function dateOnly(raw: unknown, field: string, required: boolean): string | null {
  if (raw === undefined || raw === null || raw === '') {
    if (required) throw new ValidationFailed(`${field} is required.`);
    return null;
  }
  if (typeof raw !== 'string' || !DATE_ONLY.test(raw)) throw new ValidationFailed(`${field} must be YYYY-MM-DD.`);
  const [y, m, d] = raw.split('-').map(Number) as [number, number, number];
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
    throw new ValidationFailed(`${field} is not a real date.`);
  }
  return raw;
}

export function normaliseEventInput(body: unknown): EventInput {
  const raw = (body ?? {}) as Record<string, unknown>;

  if (!EVENT_TYPES.includes(raw.type as EventType)) throw new ValidationFailed('type is not a known event type.');
  if (typeof raw.allDay !== 'boolean') throw new ValidationFailed('allDay must be true or false.');

  const allDay = raw.allDay;
  const startsAt = allDay ? null : instant(raw.startsAt, 'startsAt', true);
  const endsAt = allDay ? null : instant(raw.endsAt, 'endsAt', false);
  const startsOn = allDay ? dateOnly(raw.startsOn, 'startsOn', true) : null;
  const endsOn = allDay ? dateOnly(raw.endsOn, 'endsOn', false) : null;

  if (startsAt && endsAt && endsAt < startsAt) throw new ValidationFailed('The event ends before it starts.');
  if (startsOn && endsOn && endsOn < startsOn) throw new ValidationFailed('The event ends before it starts.');

  let remindMinutesBefore: number | null = null;
  if (raw.remindMinutesBefore !== undefined && raw.remindMinutesBefore !== null) {
    if (!REMINDER_MINUTES.includes(raw.remindMinutesBefore as (typeof REMINDER_MINUTES)[number])) {
      throw new ValidationFailed('remindMinutesBefore is not an offered reminder.');
    }
    remindMinutesBefore = raw.remindMinutesBefore as number;
  }

  let caseId: string | null = null;
  if (raw.caseId !== undefined && raw.caseId !== null && raw.caseId !== '') {
    if (typeof raw.caseId !== 'string') throw new ValidationFailed('caseId must be an identifier.');
    caseId = assertUuid(raw.caseId, 'case id');
  }

  return {
    type: raw.type as EventType,
    title: text(raw.title, 'title', 200, true)!,
    description: text(raw.description, 'description', 2000, false),
    location: text(raw.location, 'location', 200, false),
    allDay,
    startsAt,
    endsAt,
    startsOn,
    endsOn,
    caseId,
    remindMinutesBefore,
  };
}

const COMPARED: readonly (keyof EventInput)[] = [
  'allDay',
  'caseId',
  'description',
  'endsAt',
  'endsOn',
  'location',
  'remindMinutesBefore',
  'startsAt',
  'startsOn',
  'title',
  'type',
];

function comparable(value: unknown): unknown {
  return value instanceof Date ? value.getTime() : value;
}

/** The names of the fields that differ — what `calendar_event.updated` records (never values). */
export function changedFields(before: EventInput, after: EventInput): string[] {
  return COMPARED.filter((key) => comparable(before[key]) !== comparable(after[key]));
}
