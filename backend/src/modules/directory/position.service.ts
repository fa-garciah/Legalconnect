/**
 * T022 — FR-007–FR-009: name collision ahead of insert (research.md D6), retirement,
 * catalog validation. The unique index (0020) is the backstop, not the primary UX —
 * a friendly 409 beats a raw constraint-violation 500, the same pattern 001's RFC
 * uniqueness uses.
 */
import { Injectable } from '@nestjs/common';
import { ValidationFailed, PositionAlreadyExists, PositionAlreadyRetired, ResourceNotFound } from '../../common/http/errors';
import { currentPrincipal } from '../../common/tenant/middleware';
import { collidesWithActive } from './position-collision';
import { PositionRepository, type PositionRow } from './position.repository';

const UNIQUE_VIOLATION_SQLSTATE = '23505';

function sqlstateOf(error: unknown): unknown {
  if (typeof error !== 'object' || error === null) return undefined;
  const withCode = error as { code?: unknown; cause?: unknown };
  return withCode.code ?? sqlstateOf(withCode.cause);
}

function normalisePositionName(raw: unknown): string {
  if (typeof raw !== 'string') throw new ValidationFailed('A position name is required.');
  const value = raw.trim();
  if (value.length === 0) throw new ValidationFailed('A position name is required.');
  if (value.length > 200) throw new ValidationFailed('The position name is too long.');
  return value;
}

@Injectable()
export class PositionService {
  constructor(private readonly repo: PositionRepository) {}

  async create(rawName: unknown): Promise<PositionRow> {
    const name = normalisePositionName(rawName);

    const activeNames = await this.repo.activeNames();
    if (collidesWithActive(name, activeNames)) throw new PositionAlreadyExists();

    try {
      return await this.repo.create(currentPrincipal().tenantId, name);
    } catch (error) {
      if (sqlstateOf(error) === UNIQUE_VIOLATION_SQLSTATE) throw new PositionAlreadyExists();
      throw error;
    }
  }

  async retire(id: string): Promise<PositionRow> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new ResourceNotFound();
    if (existing.status === 'retired') throw new PositionAlreadyRetired();
    return this.repo.retire(id);
  }

  async list(): Promise<readonly PositionRow[]> {
    return this.repo.list();
  }
}
