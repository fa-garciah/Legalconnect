/**
 * 009 T005 — the write bodies of contracts/time-entries-api.md, validated (FR-011, FR-013). Every
 * bound here is also a CHECK in migration 0048; this layer exists so a violation is a readable
 * `400` rather than a constraint error.
 *
 * The matter never comes from a body: it is the URL's `:caseId`, which is what lets 006's resolver
 * decide reach before any of this runs (Decision 9). A `caseId` in a body is ignored like any other
 * unknown field — and so is every attempt to set a status, an owner or a timestamp.
 */
import { ValidationFailed } from '../../common/http/errors';
import { MAX_ENTRY_MINUTES } from './duration';

const MAX_DESCRIPTION = 1000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export interface ManualEntryInput {
  readonly workDate: string;
  readonly minutes: number;
  readonly description: string;
}

export interface CorrectionInput {
  readonly workDate?: string;
  readonly minutes?: number;
  readonly description?: string;
}

function asRecord(body: unknown): Record<string, unknown> {
  if (body === undefined) return {};
  if (body === null || typeof body !== 'object') throw new ValidationFailed('The body must be an object.');
  return body as Record<string, unknown>;
}

/** A calendar date, `YYYY-MM-DD`, that exists (no 30 February). Not-after-today is the service's. */
function workDate(raw: unknown): string {
  if (typeof raw !== 'string' || !DATE_ONLY.test(raw)) throw new ValidationFailed('workDate must be YYYY-MM-DD.');
  const [y, m, d] = raw.split('-').map(Number) as [number, number, number];
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
    throw new ValidationFailed('workDate is not a real date.');
  }
  return raw;
}

function minutes(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1 || raw > MAX_ENTRY_MINUTES) {
    throw new ValidationFailed(`minutes must be a whole number from 1 to ${MAX_ENTRY_MINUTES}.`);
  }
  return raw;
}

/** Trimmed text; `null` when absent or blank, unless `required`. */
function description(raw: unknown, required: boolean): string | null {
  if (raw === undefined || raw === null) {
    if (required) throw new ValidationFailed('description is required.');
    return null;
  }
  if (typeof raw !== 'string') throw new ValidationFailed('description must be text.');
  const value = raw.trim();
  if (value.length === 0) {
    if (required) throw new ValidationFailed('description is required.');
    return null;
  }
  if (value.length > MAX_DESCRIPTION) throw new ValidationFailed('description is too long.');
  return value;
}

export function normaliseManualEntry(body: unknown): ManualEntryInput {
  if (body === undefined) throw new ValidationFailed('The body must be an object.');
  const raw = asRecord(body);
  return {
    workDate: workDate(raw.workDate),
    minutes: minutes(raw.minutes),
    description: description(raw.description, true)!,
  };
}

export function normaliseTimerStart(body: unknown): { description: string | null } {
  return { description: description(asRecord(body).description, false) };
}

/** The description given at stop, if any. Whether one exists overall is the service's check. */
export function normaliseStopBody(body: unknown): { description: string | null } {
  return { description: description(asRecord(body).description, false) };
}

/** FR-013: only these three fields are correctable; everything else in the body is ignored. */
export function normaliseCorrection(body: unknown): CorrectionInput {
  const raw = asRecord(body);
  const out: { workDate?: string; minutes?: number; description?: string } = {};
  if (raw.workDate !== undefined) out.workDate = workDate(raw.workDate);
  if (raw.minutes !== undefined) out.minutes = minutes(raw.minutes);
  if (raw.description !== undefined) out.description = description(raw.description, true)!;
  return out;
}

const COMPARED = ['description', 'minutes', 'workDate'] as const;

/** The names of the fields that differ — what `time_entry.corrected` records. Never values. */
export function changedFields(before: ManualEntryInput, after: ManualEntryInput): string[] {
  return COMPARED.filter((key) => before[key] !== after[key]);
}
