/**
 * 008 — the note write body and the month parameter (FR-002, FR-003, FR-011). Every bound is also a
 * CHECK in migration 0049; this layer turns a violation into a readable `400`.
 *
 * Only `body` is read from a request. `visibility` is NOT input — notes are internal by the schema
 * (Decision 1) — and neither is the matter (it is the URL's `:caseId`, decided by 006's resolver), the
 * author, or any status or timestamp.
 */
import { ValidationFailed } from '../../common/http/errors';

export const MAX_NOTE_LENGTH = 5000;
const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function normaliseNoteBody(raw: unknown): { body: string } {
  if (raw === null || typeof raw !== 'object') throw new ValidationFailed('The body must be an object.');
  const value = (raw as Record<string, unknown>).body;
  if (typeof value !== 'string') throw new ValidationFailed('body is required and must be text.');
  const body = value.trim();
  if (body.length === 0) throw new ValidationFailed('body is required.');
  if (body.length > MAX_NOTE_LENGTH) throw new ValidationFailed(`body cannot exceed ${MAX_NOTE_LENGTH} characters.`);
  return { body };
}

/** `YYYY-MM`, or null when absent (the service then uses the current Mexico City month). */
export function normaliseMonth(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw !== 'string' || !MONTH.test(raw)) throw new ValidationFailed('month must be YYYY-MM.');
  return raw;
}
