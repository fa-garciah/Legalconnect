/**
 * T026 — the case catalogs' rules. 006/FR-019, FR-020, FR-008a.
 *
 * 017's `PositionService` applied to three structurally identical catalogs, plus the one
 * thing `position` has no analogue for: `is_closing`.
 *
 * The collision predicate lives here and nowhere else, applied ahead of the insert. The
 * partial unique indexes in `backend/drizzle/0024` are the backstop, not the primary UX —
 * the same division 001's RFC uniqueness and 017's position names already use. Both halves
 * must agree exactly on normalisation and on the `status = 'active'` restriction, which is
 * what `tests/unit/catalog-name-collision.test.ts` pins down.
 */
import { Injectable } from '@nestjs/common';
import {
  CatalogEntryAlreadyExists,
  CatalogEntryAlreadyRetired,
  ResourceNotFound,
  ValidationFailed,
} from '../../../common/http/errors';
import {
  CaseCatalogRepository,
  supportsIsClosing,
  type CatalogEntryRow,
  type CatalogSegment,
} from './case-catalog.repository';

/**
 * The comparison key, character for character what `lower(trim(name))` produces in the
 * indexes. Interior whitespace is deliberately left alone, exactly as 017 decided for
 * position names: "Juzgado Primero" and "JuzgadoPrimero" are different courts, and
 * collapsing them would refuse a name a firm legitimately wants.
 */
export function normaliseName(name: string): string {
  return name.trim().toLowerCase();
}

/** A retired entry never collides, which is what makes retire-then-recreate legal. */
export function collidesWith(catalog: readonly CatalogEntryRow[], name: string): boolean {
  const key = normaliseName(name);
  return catalog.some((entry) => entry.status === 'active' && normaliseName(entry.name) === key);
}

/** The stored form: trimmed, case preserved — the firm's own words for its own vocabulary. */
export function assertCatalogName(raw: unknown): string {
  if (typeof raw !== 'string') throw new ValidationFailed('A name is required.');
  const value = raw.trim();
  if (value.length === 0) throw new ValidationFailed('A name is required.');
  if (value.length > 120) throw new ValidationFailed('The name is too long.');
  return value;
}

/**
 * FR-008a. Accepted only for `case-statuses`.
 *
 * Sending it to `matter-types` or `venues` is refused rather than ignored: silently
 * dropping it would let a firm believe they had marked something they had not, and the
 * mistake would only surface later as cases that never close.
 */
export function assertIsClosing(raw: unknown, segment: CatalogSegment): boolean {
  if (raw === undefined || raw === null) return false;
  if (!supportsIsClosing(segment)) {
    throw new ValidationFailed('Only a case status can declare that it ends a matter.');
  }
  if (typeof raw !== 'boolean') {
    throw new ValidationFailed('isClosing must be true or false.');
  }
  return raw;
}

@Injectable()
export class CaseCatalogService {
  constructor(private readonly catalog: CaseCatalogRepository) {}

  async list(segment: CatalogSegment): Promise<readonly CatalogEntryRow[]> {
    return this.catalog.list(segment);
  }

  async create(segment: CatalogSegment, rawName: unknown, rawIsClosing: unknown): Promise<CatalogEntryRow> {
    const name = assertCatalogName(rawName);
    const isClosing = assertIsClosing(rawIsClosing, segment);

    // Scoped by RLS to the caller's own catalog, so "already exists" can only ever mean
    // "in MY firm" — another tenant using the same matter type is not a collision.
    if (collidesWith(await this.catalog.listActive(segment), name)) {
      throw new CatalogEntryAlreadyExists();
    }

    return this.catalog.insert(segment, name, isClosing);
  }

  /**
   * FR-008a. Only on `case-statuses`, and only this one field.
   *
   * Changing it does NOT retroactively re-date existing cases. A case's closing date was
   * stamped by the status change that set it; revisiting every case when the catalog
   * changes would rewrite history the audit trail already records. Cases re-date when they
   * next move status, and not before.
   */
  async setIsClosing(
    segment: CatalogSegment,
    id: string,
    rawIsClosing: unknown,
  ): Promise<{ readonly row: CatalogEntryRow; readonly previous: boolean }> {
    if (!supportsIsClosing(segment)) {
      // Not a validation failure — on any other catalog this route does not exist, and
      // saying so is the same generic not-found an unknown path already answers with.
      throw new ResourceNotFound();
    }
    if (typeof rawIsClosing !== 'boolean') {
      throw new ValidationFailed('isClosing must be true or false.');
    }

    // A foreign entry is invisible under RLS, so this is the generic not-found every other
    // cross-tenant reach in this system answers with (001/FR-008).
    const existing = await this.catalog.findById(segment, id);
    if (!existing) throw new ResourceNotFound();

    const updated = await this.catalog.setIsClosing(id, rawIsClosing);
    if (!updated) throw new ResourceNotFound();
    return { row: updated, previous: existing.isClosing === true };
  }

  async retire(segment: CatalogSegment, id: string): Promise<CatalogEntryRow> {
    const existing = await this.catalog.findById(segment, id);
    if (!existing) throw new ResourceNotFound();
    if (existing.status === 'retired') throw new CatalogEntryAlreadyRetired();

    // Retiring the LAST active case status is permitted, deliberately. It leaves a tenant
    // unable to open a new case until they add one — recoverable in a single request and
    // visible immediately. A "must retain one" invariant would be 004's
    // `LastAdministratorProtected` pattern, and 004 introduced that only where the failure
    // is unrecoverable (locking a tenant out of its own administration). This is not that,
    // and inventing the guard here would be a requirement the spec does not contain.
    const retired = await this.catalog.retire(segment, id);
    // Lost a race with a concurrent retirement: the row is final either way, and the
    // refusal is the same one the pre-check above would have raised.
    if (!retired) throw new CatalogEntryAlreadyRetired();
    return retired;
  }
}
