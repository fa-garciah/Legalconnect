/**
 * 023 — `GET /tenant/documents`, the firm-wide document list. FR-001 … FR-008, FR-016.
 *
 * WHY A SEPARATE CONTROLLER. `DocumentsController`'s base path is
 * `tenant/cases/:caseId/documents`, and every route on it inherits that `:caseId`. A
 * firm-wide list cannot live there. Its header comment rules out a flat
 * `/tenant/documents/:id` — correctly, because `@ScopeTarget('caseId')` reads a route
 * parameter and cannot resolve a document's case asynchronously — but **a list has no target
 * id**, so that mechanism was never available to it and nothing here circumvents it.
 *
 * NO `@ScopeTarget`, deliberately: `document.read_list` resolves at `tenant` scope, and
 * `tests/contract/scope-target-declared.test.ts` refuses an inert `@ScopeTarget` on a
 * non-`assigned` route. The rows are narrowed inside the query
 * (`DocumentsRepository.listForTenant`), which is where `case.read_list` narrows its own.
 *
 * NO `@Audited`, deliberately (Decision 6): this serves no document content — no bytes, no
 * signed URL, only names the caller may already see. `document.previewed` and
 * `document.downloaded` remain the audited accesses, one per explicit click. Every list in
 * the product is unaudited, and a debounced search box would otherwise write an audit row per
 * keystroke batch, burying the accesses that matter.
 */
import { Controller, Get, Query } from '@nestjs/common';
import { Capability } from '../../common/authz/declare';
import { decodeCursor, normaliseLimit } from '../../common/http/pagination';
import { ValidationFailed } from '../../common/http/errors';
import { currentPrincipal } from '../../common/tenant/middleware';
import { DocumentsRepository, type FirmDocumentRow } from './documents.repository';

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Shape only — whether the id exists, or belongs to this firm, is not asked. `006` decided
 * that and the reasoning carries: answering it would let a caller enumerate a firm's catalog
 * by the difference between two status codes. A well-formed id matching nothing yields an
 * empty list.
 */
function optionalUuidFilter(raw: unknown, field: string): string | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const value = String(raw).trim();
  if (value.length === 0) return undefined;
  if (!UUID_SHAPE.test(value)) throw new ValidationFailed(`${field} must be a valid id.`);
  return value;
}

/** Whitespace-only is ABSENT, not a filter matching nothing: clearing the box restores the list. */
function optionalSearch(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export interface FirmDocumentListResponse {
  readonly items: readonly FirmDocumentRow[];
  readonly nextCursor: string | null;
  /** Decision 3 — under the same predicate as the page, never the firm's total. */
  readonly total: number;
}

@Controller('tenant/documents')
export class FirmDocumentsController {
  constructor(private readonly documents: DocumentsRepository) {}

  @Get()
  @Capability('document.read_list')
  async list(@Query() query: Record<string, unknown>): Promise<FirmDocumentListResponse> {
    const principal = currentPrincipal();
    const page = await this.documents.listForTenant({
      limit: normaliseLimit(query.limit),
      cursor: query.cursor ? decodeCursor(String(query.cursor)) : undefined,
      // MP and SA satisfy the `assigned` resolver unconditionally (006 Decision 2), so the
      // firm-wide list is unrestricted for them and assignment-filtered for everybody else.
      unrestricted: principal.archetype === 'MP' || principal.archetype === 'SA',
      membershipId: principal.membershipId,
      q: optionalSearch(query.q),
      categoryId: optionalUuidFilter(query.categoryId, 'categoryId'),
      caseId: optionalUuidFilter(query.caseId, 'caseId'),
    });
    return { items: page.items, nextCursor: page.nextCursor, total: page.total };
  }
}
