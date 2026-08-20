/**
 * Opaque forward cursor pagination. FR-013 requires bounded portions, so there is
 * deliberately no unbounded variant.
 */
import { ValidationFailed } from './errors';

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;

export interface Cursor {
  readonly occurredAt: string;
  readonly id: string;
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeCursor(raw: string): Cursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw new ValidationFailed('Malformed cursor.');
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as Cursor).occurredAt !== 'string' ||
    typeof (parsed as Cursor).id !== 'string'
  ) {
    throw new ValidationFailed('Malformed cursor.');
  }
  return parsed as Cursor;
}

export function normaliseLimit(raw: unknown): number {
  if (raw === undefined || raw === null || raw === '') return DEFAULT_LIMIT;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > MAX_LIMIT) {
    throw new ValidationFailed(`limit must be an integer between 1 and ${MAX_LIMIT}.`);
  }
  return value;
}

/**
 * Builds a page from `limit + 1` fetched rows: the extra row is the existence proof
 * for a next page and is not returned.
 */
export function toPage<T>(rows: readonly T[], limit: number, toCursor: (row: T) => Cursor): Page<T> {
  if (rows.length <= limit) return { items: rows, nextCursor: null };
  const items = rows.slice(0, limit);
  return { items, nextCursor: encodeCursor(toCursor(items[items.length - 1]!)) };
}
