/**
 * T087 — the retention window clamp. FR-019: entries are queryable for 24 months and
 * no caller can ask past that. A `from` older than the window is clamped rather than
 * rejected — the response reports the window actually served, so a caller asking for
 * three years gets two years plus an explicit statement of that, per
 * contracts/audit-query.md.
 */
import { ValidationFailed } from '../../common/http/errors';

export const RETENTION_MONTHS = 24;

export interface ServedWindow {
  readonly from: string;
  readonly to: string;
}

export interface ResolvedWindow {
  readonly from: Date;
  readonly to: Date;
  readonly servedWindow: ServedWindow;
}

function parseDate(raw: unknown, field: string): Date {
  const parsed = new Date(String(raw));
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationFailed(`${field} must be a valid RFC 3339 timestamp.`);
  }
  return parsed;
}

function isEmpty(raw: unknown): boolean {
  return raw === undefined || raw === null || raw === '';
}

/** The earliest instant still inside the retention window, as of now. */
export function earliestRetained(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - RETENTION_MONTHS);
  return d;
}

export function resolveWindow(rawFrom: unknown, rawTo: unknown): ResolvedWindow {
  const now = new Date();
  const earliest = earliestRetained(now);

  const to = isEmpty(rawTo) ? now : parseDate(rawTo, 'to');
  const requestedFrom = isEmpty(rawFrom) ? earliest : parseDate(rawFrom, 'from');
  const from = requestedFrom < earliest ? earliest : requestedFrom;

  if (from > to) throw new ValidationFailed('from must not be after to.');

  return {
    from,
    to,
    servedWindow: { from: from.toISOString(), to: to.toISOString() },
  };
}
