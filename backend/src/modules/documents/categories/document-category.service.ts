/**
 * T035 — FR-009–FR-012: name collision ahead of insert (research.md D1), retirement.
 * Reuses `006`'s `CatalogEntryNotAvailable`/`CatalogEntryAlreadyExists`/
 * `CatalogEntryAlreadyRetired` verbatim — no new error class for this catalog.
 */
import { Injectable } from '@nestjs/common';
import {
  ValidationFailed,
  CatalogEntryAlreadyExists,
  CatalogEntryAlreadyRetired,
  ResourceNotFound,
} from '../../../common/http/errors';
import { currentPrincipal } from '../../../common/tenant/middleware';
import { collidesWithActive } from './document-category-collision';
import { DocumentCategoryRepository, type DocumentCategoryRow } from './document-category.repository';

const UNIQUE_VIOLATION_SQLSTATE = '23505';

function sqlstateOf(error: unknown): unknown {
  if (typeof error !== 'object' || error === null) return undefined;
  const withCode = error as { code?: unknown; cause?: unknown };
  return withCode.code ?? sqlstateOf(withCode.cause);
}

function normaliseCategoryName(raw: unknown): string {
  if (typeof raw !== 'string') throw new ValidationFailed('A category name is required.');
  const value = raw.trim();
  if (value.length === 0) throw new ValidationFailed('A category name is required.');
  if (value.length > 200) throw new ValidationFailed('The category name is too long.');
  return value;
}

@Injectable()
export class DocumentCategoryService {
  constructor(private readonly repo: DocumentCategoryRepository) {}

  async create(rawName: unknown): Promise<DocumentCategoryRow> {
    const name = normaliseCategoryName(rawName);

    const activeNames = await this.repo.activeNames();
    if (collidesWithActive(name, activeNames)) throw new CatalogEntryAlreadyExists();

    try {
      return await this.repo.create(currentPrincipal().tenantId, name);
    } catch (error) {
      if (sqlstateOf(error) === UNIQUE_VIOLATION_SQLSTATE) throw new CatalogEntryAlreadyExists();
      throw error;
    }
  }

  async retire(id: string): Promise<DocumentCategoryRow> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new ResourceNotFound();
    if (existing.status === 'retired') throw new CatalogEntryAlreadyRetired();
    return this.repo.retire(id);
  }

  async list(): Promise<readonly DocumentCategoryRow[]> {
    return this.repo.list();
  }
}
