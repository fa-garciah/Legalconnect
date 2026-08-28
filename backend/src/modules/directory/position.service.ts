/**
 * T022 — the position catalog's rules. 017/FR-006..FR-008, research.md D4/D6.
 *
 * Two things live here and nowhere else:
 *
 *   - the collision predicate (D6), applied ahead of the insert. The functional
 *     unique index in `backend/drizzle/0020` is the backstop, not the primary UX —
 *     the same division 001's RFC uniqueness already uses. Both halves must agree
 *     exactly on normalisation and on the `status = 'active'` restriction, which is
 *     what `tests/unit/position-name-collision.test.ts` pins down;
 *   - retirement as the only lifecycle transition besides creation (D4). There is
 *     deliberately no rename: a firm that wants a rank under a different name
 *     retires the old entry and creates a new one, which keeps every directory entry
 *     pointing at the exact position its holder was given.
 */
import { Injectable } from '@nestjs/common';
import {
  PositionAlreadyExists,
  PositionAlreadyRetired,
  ResourceNotFound,
  ValidationFailed,
} from '../../common/http/errors';
import type { CatalogPosition } from './directory-entry.repository';
import { PositionRepository, type PositionRow } from './position.repository';

/**
 * The comparison key, character for character what `lower(trim(name))` produces in
 * the index. Interior whitespace is deliberately left alone: "Asociado Senior" and
 * "AsociadoSenior" are different ranks, and collapsing them would refuse a name a
 * firm legitimately wants.
 */
export function normaliseName(name: string): string {
  return name.trim().toLowerCase();
}

/** research.md D6 — a retired entry never collides, which is what makes D4 legal. */
export function collidesWith(catalog: readonly CatalogPosition[], name: string): boolean {
  const key = normaliseName(name);
  return catalog.some((entry) => entry.status === 'active' && normaliseName(entry.name) === key);
}

/** The stored form: trimmed, case preserved — the firm's own words for its own rank. */
export function assertPositionName(raw: unknown): string {
  if (typeof raw !== 'string') throw new ValidationFailed('A position name is required.');
  const value = raw.trim();
  if (value.length === 0) throw new ValidationFailed('A position name is required.');
  if (value.length > 120) throw new ValidationFailed('The position name is too long.');
  return value;
}

@Injectable()
export class PositionService {
  constructor(private readonly positions: PositionRepository) {}

  async list(): Promise<readonly CatalogPosition[]> {
    return this.positions.list();
  }

  async create(rawName: unknown): Promise<PositionRow> {
    const name = assertPositionName(rawName);

    // Scoped by RLS to the caller's own catalog, so "already exists" can only ever
    // mean "in MY firm" — another tenant using the same rank name is not a collision
    // (FR-006).
    if (collidesWith(await this.positions.listActive(), name)) throw new PositionAlreadyExists();

    return this.positions.insert(name);
  }

  async retire(id: string): Promise<PositionRow> {
    // A foreign position is invisible under RLS, so this is the generic not-found
    // every other cross-tenant reach in this system answers with (001/FR-008).
    const existing = await this.positions.findById(id);
    if (!existing) throw new ResourceNotFound();
    if (existing.status === 'retired') throw new PositionAlreadyRetired();

    const retired = await this.positions.retire(id);
    // Lost a race with a concurrent retirement: the row is final either way, and the
    // refusal is the same one the pre-check above would have raised.
    if (!retired) throw new PositionAlreadyRetired();
    return retired;
  }
}
